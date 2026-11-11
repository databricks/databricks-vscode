import assert from "node:assert";
import path from "node:path";
import { CustomTreeSection, InputBox, type Notification, TreeItem } from "wdio-vscode-service";
import { getViewSection, type ViewSectionType } from "./view.ts";
import { waitUntilSeen } from "./wait.ts";

/*
 * Ported from the old suite's `commonUtils.ts`: the helpers the auth specs
 * use, with the same matching rules (labels by substring, any case).
 */

/**
 * Finds an inline action button on a hovered tree item by label.
 * wdio-vscode-service's `getActionButton` reads labels from a `title` attribute
 * that VS Code no longer sets (from 1.104); the button's aria-label still has it.
 * The item must already be hovered (call item.elem.moveTo() before this).
 */
export async function getActionButton(
    item: TreeItem,
    label: string,
): Promise<WebdriverIO.Element | undefined> {
    const buttons = await item.elem.$$("a.action-label").getElements();
    for (const btn of buttons) {
        const ariaLabel = await btn.getAttribute("aria-label");
        const title = await btn.getAttribute("title");
        const btnLabel = ariaLabel || title;
        if (btnLabel && btnLabel.includes(label)) {
            return btn;
        }
    }
    return undefined;
}

export async function waitForInput() {
    const workbench = await browser.getWorkbench();
    let input: InputBox | undefined;
    await browser.waitUntil(
        async () => {
            if (!input) {
                input = await new InputBox(workbench.locatorMap).wait();
            }
            if (input) {
                return !(await input.hasProgress());
            }
            return false;
        },
        { timeout: 10000 },
    );
    return input!;
}

/** The CONNECTION section's "Workspace connection" row, if it is showing. */
export async function getWorkspaceConnectionItem(): Promise<TreeItem | undefined> {
    const section = (await getViewSection("CONNECTION")) as CustomTreeSection;
    assert(section, "CONNECTION section doesn't exist");
    for (const item of await section.getVisibleItems()) {
        if ((await item.getLabel()).toLowerCase().includes("workspace connection")) {
            return item as TreeItem;
        }
    }
    return undefined;
}

/** The PROJECT section's "Local Folder" item, if it points at `folder`. */
export async function getLocalFolderTreeItem(folder: string) {
    const section = (await getViewSection("PROJECT")) as CustomTreeSection;
    assert(section, "PROJECT section doesn't exist");
    for (const item of await section.getVisibleItems()) {
        if ((await item.getLabel()).toLowerCase().includes("local folder")) {
            const descPath = path.normalize((await item.getDescription())!);
            console.log("Local Folder description:", descPath);
            if (descPath.includes(folder)) {
                return item as TreeItem;
            }
        }
    }
    return undefined;
}

/** The PROJECT section's top-level item whose label contains `label`, any case; or another view's. */
export async function getConfigurationItem(
    label: string,
    view: ViewSectionType = "PROJECT",
): Promise<TreeItem | undefined> {
    const section = (await getViewSection(view)) as CustomTreeSection;
    assert(section, `${view} section doesn't exist`);
    for (const item of await section.getVisibleItems()) {
        if ((await item.getLabel()).toLowerCase().includes(label.toLowerCase())) {
            return item as TreeItem;
        }
    }
    return undefined;
}

/**
 * Waits until the workspace row is connected with the profile: "<profile>",
 * or "<profile> · for target <target>" in a project, not "<profile> ·
 * Connecting…". Then opens PROJECT, where the callers go next, as when this
 * read the Auth Type row there.
 */
export async function waitForLogin(profileName: string) {
    console.log("Waiting for login");
    let last: string | undefined;
    await waitUntilSeen(
        async () => {
            last = await (await getWorkspaceConnectionItem())?.getDescription();
            return last === profileName || last?.startsWith(`${profileName} · for target `);
        },
        {
            timeout: 120_000,
            interval: 2_000,
            timeoutMsg: `Login with the profile "${profileName}" didn't finish`,
        },
        () =>
            last === undefined
                ? "there was no Workspace connection row"
                : `the Workspace connection row showed "${last}"`,
    );
    await getViewSection("PROJECT");
}

/** Waits until the workspace row's description is `description`. */
export async function waitForWorkspaceConnection(description: string, timeout = 60_000) {
    let last: string | undefined;
    let error: string | undefined;
    await waitUntilSeen(
        async () => {
            try {
                last = await (await getWorkspaceConnectionItem())?.getDescription();
                error = undefined;
            } catch (e) {
                last = undefined;
                error = e instanceof Error ? e.message : JSON.stringify(e);
            }
            return last === description;
        },
        {
            timeout,
            interval: 1_000,
            timeoutMsg: `The Workspace connection row never showed "${description}"`,
        },
        () => (error === undefined ? `it showed "${last}"` : `it couldn't be read: ${error}`),
    );
}

/**
 * Clicks a notification's button by its text. wdio-vscode-service's
 * `takeAction` looks for a `title` attribute that VS Code no longer sets.
 */
async function clickNotificationButton(notification: Notification, label: string) {
    for (const { button, text } of await notificationButtons(notification)) {
        if (text === label) {
            await button.click();
            return;
        }
    }
    throw new Error(`The notification has no "${label}" button`);
}

/** A notification's buttons, with their text. */
async function notificationButtons(
    notification: Notification,
): Promise<{ button: WebdriverIO.Element; text: string | undefined }[]> {
    const buttons = [];
    for (const button of await notification.elem.$$(".monaco-button").getElements()) {
        const text =
            (await button.getText()) ||
            (await button.getAttribute("aria-label")) ||
            (await button.getAttribute("title"));
        buttons.push({ button, text: text?.trim() });
    }
    return buttons;
}

/** The button texts of the notification whose message contains `message`; undefined when none shows. */
export async function notificationActions(
    message: string,
): Promise<(string | undefined)[] | undefined> {
    const workbench = await browser.getWorkbench();
    for (const notification of await workbench.getNotifications()) {
        if ((await notification.getMessage()).includes(message)) {
            return (await notificationButtons(notification)).map((b) => b.text);
        }
    }
    return undefined;
}

/** Waits for a notification whose message contains `message`, and takes `action` on it. */
export async function waitForNotification(message: string, action?: string, timeoutMs = 60_000) {
    let seen: string[] = [];
    await waitUntilSeen(
        async () => {
            seen = [];
            const workbench = await browser.getWorkbench();
            for (const notification of await workbench.getNotifications()) {
                const label = await notification.getMessage();
                seen.push(label);
                if (label.includes(message)) {
                    if (action) {
                        await clickNotificationButton(notification, action);
                    }
                    return true;
                }
            }
            return false;
        },
        {
            timeout: timeoutMs,
            interval: 1000,
            timeoutMsg: `Notification with message "${message}" not found`,
        },
        () => `the notifications were: ${seen.map((s) => `"${s}"`).join(", ") || "none"}`,
    );
}

/** The description of the PROJECT section's "Remote Folder" › "… State" row, if it is showing. */
async function getSyncState(): Promise<string | undefined> {
    const viewSection = (await getViewSection("PROJECT")) as CustomTreeSection | undefined;
    assert(viewSection, "PROJECT section doesn't exist");
    const subTreeItems = await viewSection.openItem("Remote Folder");
    for (const item of subTreeItems) {
        if ((await item.getLabel()).includes("State")) {
            return await item.getDescription();
        }
    }
    return undefined;
}

/** Waits until the Remote Folder's state is `state`. Ported from the old `waitForSyncComplete`, which waits for WATCHING_FOR_CHANGES. */
export async function waitForSyncState(state: string, timeout = 60_000) {
    await browser.waitUntil(async () => (await getSyncState()) === state, {
        timeout,
        interval: 2000,
        timeoutMsg: `The sync state never became ${state} in ${timeout / 1000}s`,
    });
}

export async function waitForSyncComplete() {
    await waitForSyncState("WATCHING_FOR_CHANGES");
}

/**
 * Runs a command palette entry by its title, retrying until VS Code offers
 * it (old `commonUtils.ts`). The palette is opened with
 * `workbench.action.showCommands`: in this harness the F1 key that
 * `executeQuickPick` presses doesn't reach the workbench.
 */
export async function executeCommandWhenAvailable(command: string) {
    const workbench = await browser.getWorkbench();
    return browser.waitUntil(
        async () => {
            try {
                await browser.executeWorkbench(async (vscode) => {
                    await vscode.commands.executeCommand("workbench.action.showCommands");
                });
                const prompt = await new InputBox(workbench.locatorMap).wait();
                await prompt.setText(`>${command}`);
                for (const pick of await prompt.getQuickPicks()) {
                    if ((await pick.getLabel()) === command) {
                        await pick.select();
                        return true;
                    }
                }
                await prompt.cancel();
                return false;
            } catch (e) {
                console.log(`Failed to execute ${command}:`, e);
                return false;
            }
        },
        {
            timeout: 60_000,
            interval: 1_000,
            timeoutMsg: `Couldn't run "${command}" from the command palette`,
        },
    );
}

/**
 * Waits until the PROJECT view shows a row labelled `expected` and none
 * labelled `forbidden`. Ported from the old `commonUtils.ts`; labels match
 * exactly here.
 */
export async function waitForConfigSurface(
    expected: string,
    forbidden: string,
    timeoutMs = 60_000,
) {
    await browser.waitUntil(
        async () => {
            const section = (await getViewSection("PROJECT")) as CustomTreeSection | undefined;
            if (!section) {
                return false;
            }
            let sawExpected = false;
            for (const item of await section.getVisibleItems()) {
                const label = await item.getLabel();
                if (label === forbidden) {
                    return false;
                }
                if (label === expected) {
                    sawExpected = true;
                }
            }
            return sawExpected;
        },
        {
            timeout: timeoutMs,
            interval: 1000,
            timeoutMsg: `PROJECT never showed "${expected}" without "${forbidden}"`,
        },
    );
}
