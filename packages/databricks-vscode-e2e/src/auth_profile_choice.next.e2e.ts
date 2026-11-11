import assert from "node:assert";
import { CustomTreeSection } from "wdio-vscode-service";
import {
    copyProfile,
    getUniqueResourceName,
    profileHost,
    writeRootBundleConfig,
} from "./utils/bundle-fixtures.ts";
import {
    getWorkspaceConnectionItem,
    waitForInput,
    waitForLogin,
    waitForNotification,
    waitForWorkspaceConnection,
} from "./utils/configuration.ts";
import { dismissNotifications } from "./utils/dismiss-notifications.ts";
import { getViewSection, rowTexts } from "./utils/view.ts";

/**
 * When two profiles match a target's host,
 * the extension asks which one to use instead of
 * signing out silently, and remembers the answer and a sign-out for the
 * target across restarts.
 *
 * Needs a `[DEFAULT]` profile in DATABRICKS_CONFIG_FILE that can sign in with
 * a token or M2M: `[COPY]` copies its credentials.
 */
describe("Choose between profiles for one host", async function () {
    this.timeout(3 * 60 * 1000);

    // A target of its own, so that choices other specs saved don't apply.
    const target = getUniqueResourceName("profile_choice");
    const host = new URL(profileHost()).origin;

    it("should open VS Code and dismiss notifications", async () => {
        assert(process.env.WORKSPACE_PATH, "WORKSPACE_PATH doesn't exist");
        await dismissNotifications();
        // Opening the view activates the extension, which a folder without a bundle doesn't.
        assert(await getViewSection("PROJECT"));
    });

    it("should ask which profile to use when two match the target's host", async () => {
        copyProfile("DEFAULT", "COPY");
        await writeRootBundleConfig(
            {
                bundle: { name: target },
                targets: { [target]: { mode: "development", default: true, workspace: { host } } },
            },
            process.env.WORKSPACE_PATH!,
        );

        // The prompt names the host and both profiles.
        await waitForNotification(`match ${host}`, "Select a profile");
        const input = await waitForInput();
        assert(
            await input.findQuickPick("DEFAULT"),
            "DEFAULT is absent in the quick pick selection",
        );
        const copy = await input.findQuickPick("COPY");
        assert(copy, "COPY is absent in the quick pick selection");
        await copy.select();

        await waitForLogin("COPY");
        // The row says the target chose it.
        assert.strictEqual(
            await (await getWorkspaceConnectionItem())!.getDescription(),
            `COPY · for target ${target}`,
        );
    });

    it("should keep COPY after restarting VS Code", async () => {
        await browser.reloadSession();
        await waitForLogin("COPY");
    });

    it("should sign out of the target", async () => {
        await browser.executeWorkbench(async (vscode) => {
            await vscode.commands.executeCommand("databricks.connection.logout");
        });
        await waitForWorkspaceConnection("Not signed in");
        // Why, under the row.
        const rows = await rowTexts((await getViewSection("CONNECTION")) as CustomTreeSection);
        assert(
            rows.some((r) => r.startsWith(`You signed out of target '${target}'.`)),
            `CONNECTION doesn't say why: ${rows.join(", ")}`,
        );
    });

    it("should stay signed out after restarting VS Code", async () => {
        await browser.reloadSession();
        await waitForWorkspaceConnection("Not signed in", 120_000);
        // Not a transient state: the resolver doesn't sign back in.
        await browser.pause(5_000);
        assert.strictEqual(
            await (await getWorkspaceConnectionItem())?.getDescription(),
            "Not signed in",
        );
    });
});
