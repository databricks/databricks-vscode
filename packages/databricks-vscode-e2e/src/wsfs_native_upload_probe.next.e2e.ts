import assert from "node:assert";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import type { CustomTreeSection, TreeItem } from "wdio-vscode-service";
import {
    getBasicBundleConfig,
    getUniqueResourceName,
    writeRootBundleConfig,
} from "./utils/bundle-fixtures.ts";
import { waitForLogin } from "./utils/configuration.ts";
import { openContextMenu } from "./utils/context-menu.ts";
import { dismissNotifications } from "./utils/dismiss-notifications.ts";
import { getViewSection } from "./utils/view.ts";
import { WorkspaceClient } from "./utils/workspace-client.ts";

/*
 * Probe, not for merging: "Upload File" in the WORKSPACE FILE SYSTEM view through Windows' own
 * open dialog (VS Code's simple dialog stays off), answered with Windows UI Automation: find the
 * dialog, set its file name, press its default button. Then the API says whether the file arrived.
 */

/** Fills in the open dialog VS Code shows, and says what it found. */
function answerNativeDialog(file: string): Promise<string> {
    const script = `
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
$A = [System.Windows.Automation.AutomationElement]
$root = $A::RootElement
$isDialog = New-Object System.Windows.Automation.PropertyCondition($A::ClassNameProperty, "#32770")
$dialog = $null
for ($i = 0; $i -lt 60 -and $dialog -eq $null; $i++) {
    $dialog = $root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $isDialog)
    if ($dialog -eq $null) { Start-Sleep -Milliseconds 500 }
}
if ($dialog -eq $null) {
    $windows = $root.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)
    $names = @($windows | ForEach-Object { "$($_.Current.ClassName): $($_.Current.Name)" }) -join "; "
    Write-Output "no dialog; top-level windows: $names"
    exit 2
}
Write-Output "dialog: $($dialog.Current.Name)"
$T = [System.Windows.Automation.TreeScope]::Descendants
$C = [System.Windows.Automation.ControlType]
function Of($type) { New-Object System.Windows.Automation.PropertyCondition($A::ControlTypeProperty, $type) }
function Id($id) { New-Object System.Windows.Automation.PropertyCondition($A::AutomationIdProperty, $id) }
$controls = $dialog.FindAll($T, (New-Object System.Windows.Automation.OrCondition((Of $C::Edit), (Of $C::ComboBox), (Of $C::Button))))
Write-Output ("controls: " + (@($controls | ForEach-Object { "$($_.Current.ControlType.ProgrammaticName)[$($_.Current.AutomationId)]'$($_.Current.Name)'" }) -join "; "))
$nameBox = $null
$combo = $dialog.FindFirst($T, (New-Object System.Windows.Automation.AndCondition((Id "1148"), (Of $C::ComboBox))))
if ($combo -ne $null) { $nameBox = $combo.FindFirst($T, (Of $C::Edit)) }
if ($nameBox -eq $null) {
    foreach ($e in $dialog.FindAll($T, (Of $C::Edit))) { if ($e.Current.Name -like "File name*") { $nameBox = $e; break } }
}
if ($nameBox -ne $null) {
    $nameBox.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).SetValue($env:PROBE_FILE)
    Write-Output "file name set in: [$($nameBox.Current.AutomationId)]'$($nameBox.Current.Name)'"
    $ok = $dialog.FindFirst($T, (New-Object System.Windows.Automation.AndCondition((Id "1"), (Of $C::Button))))
    if ($ok -ne $null) {
        Write-Output "button: $($ok.Current.Name)"
        $ok.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
        Write-Output "pressed"
        exit 0
    }
}
# The box has the focus when the dialog opens: type into it.
Add-Type -AssemblyName System.Windows.Forms
$dialog.SetFocus()
Start-Sleep -Milliseconds 300
$keys = ($env:PROBE_FILE -replace '([+^%~(){}\\[\\]])', '{$1}') + "{ENTER}"
[System.Windows.Forms.SendKeys]::SendWait($keys)
Write-Output "typed into the focused dialog"
`;
    return new Promise((resolve) => {
        execFile(
            "powershell.exe",
            ["-NoProfile", "-NonInteractive", "-Command", script],
            { env: { ...process.env, PROBE_FILE: file }, timeout: 90_000 },
            (error, stdout, stderr) =>
                resolve(`${stdout}${stderr}${error ? ` (exit: ${error.message})` : ""}`),
        );
    });
}

describe("Probe: Upload File through Windows' native open dialog", async function () {
    let root: string;
    let client: WorkspaceClient;
    let folderName: string;
    let folderPath: string;
    let section: CustomTreeSection;

    this.timeout(5 * 60 * 1000);

    before(async function () {
        if (process.platform !== "win32") {
            this.skip();
        }
        assert(process.env.WORKSPACE_PATH, "WORKSPACE_PATH doesn't exist");
        root = process.env.WORKSPACE_PATH;
        client = new WorkspaceClient({ profile: "DEFAULT" });
        const me = await client.currentUser.me();
        folderName = getUniqueResourceName("wsfs_native_upload");
        folderPath = `/Users/${me.userName}/${folderName}`;
        await client.workspace.mkdirs({ path: folderPath });
        await writeRootBundleConfig(getBasicBundleConfig({}, false), root);
        await waitForLogin("DEFAULT");
        await dismissNotifications();
        await browser.executeWorkbench(async (vscode) => {
            await vscode.workspace
                .getConfiguration("files")
                .update("simpleDialog.enable", false, vscode.ConfigurationTarget.Global);
        });
        section = (await getViewSection("WORKSPACE FILE SYSTEM")) as CustomTreeSection;
        assert(section, "WORKSPACE FILE SYSTEM doesn't exist");
    });

    after(async () => {
        if (client !== undefined && folderPath !== undefined) {
            await client.workspace.delete({ path: folderPath, recursive: true }).catch(() => {});
        }
    });

    it("uploads a file picked in the native dialog", async () => {
        let folder: TreeItem | undefined;
        await browser.waitUntil(
            async () => {
                folder = (await section.findItem(folderName)) as TreeItem | undefined;
                if (folder === undefined) {
                    await browser.executeWorkbench(async (vscode) => {
                        await vscode.commands.executeCommand("databricks.wsfs.refresh");
                    });
                }
                return folder !== undefined;
            },
            { timeout: 30_000, interval: 2_000, timeoutMsg: `${folderName} isn't in the tree` },
        );
        const local = path.join(root, "uploaded_native.py");
        await fs.writeFile(local, "print('uploaded natively')\n");
        const menu = await openContextMenu(folder!);
        await menu.select("Upload File");
        const report = await answerNativeDialog(local);
        console.log(`PROBE dialog automation: ${report}`);
        const status = await browser
            .waitUntil(
                () =>
                    client.workspace
                        .getStatus({ path: `${folderPath}/uploaded_native.py` })
                        .catch(() => false as const),
                { timeout: 60_000, interval: 2_000 },
            )
            .catch(() => undefined);
        console.log(`PROBE uploaded: ${status !== undefined}`);
        assert(status, `The file wasn't uploaded; the dialog automation said: ${report}`);
    });
});
