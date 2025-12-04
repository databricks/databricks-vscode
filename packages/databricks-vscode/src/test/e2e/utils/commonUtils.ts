import assert from "node:assert";
import {randomUUID} from "crypto";
import {
    CustomTreeSection,
    sleep,
    ViewControl,
    ViewSection,
    InputBox,
    OutputView,
} from "wdio-vscode-service";

// eslint-disable-next-line @typescript-eslint/naming-convention
const ViewSectionTypes = [
    "CLUSTERS",
    "CONFIGURATION",
    "WORKSPACE EXPLORER",
    "BUNDLE RESOURCE EXPLORER",
    "BUNDLE VARIABLES",
    "DOCUMENTATION",
] as const;
export type ViewSectionType = (typeof ViewSectionTypes)[number];

export async function selectOutputChannel(
    outputView: OutputView,
    channelName: string
) {
    if ((await outputView.getCurrentChannel()) === channelName) {
        return;
    }
    await browser.waitUntil(
        async () => {
            await outputView.selectChannel(channelName);
            return true;
        },
        {
            timeout: 10_000,
            interval: 1_000,
            timeoutMsg: `Output view channel "${channelName}" not found`,
        }
    );
}

export async function findViewSection(name: ViewSectionType) {
    const workbench = await browser.getWorkbench();

    let control: ViewControl | undefined;
    await browser.waitUntil(
        async () => {
            control = await workbench
                .getActivityBar()
                .getViewControl("Databricks");
            if (!control) {
                return false;
            }
            return true;
        },
        {
            timeout: 10 * 1000,
            interval: 1 * 1000,
            timeoutMsg: `Can't find view control "${name}"`,
        }
    );
    const views =
        (await (await control?.openView())?.getContent()?.getSections()) ?? [];
    console.log("Views:", views.length);
    for (const v of views) {
        const title = await v.elem.getText();
        console.log("View title:", title);
        if (title === null) {
            continue;
        }
        if (title.toUpperCase().includes(name)) {
            return v;
        }
    }
}

export async function getViewSection(
    name: ViewSectionType
): Promise<ViewSection | undefined> {
    let section: ViewSection | undefined;
    await browser.waitUntil(
        async () => {
            section = await findViewSection(name);
            return section !== undefined;
        },
        {
            timeout: 10 * 1000,
            timeoutMsg: `Can't find view section "${name}"`,
        }
    );

    for (const s of ViewSectionTypes) {
        if (s !== name) {
            await (await findViewSection(s))?.collapse();
        }
    }

    await section!.expand();
    return section;
}

export async function getTreeViewItems(name: ViewSectionType, section: string) {
    const viewSection = (await getViewSection(name)) as
        | CustomTreeSection
        | undefined;
    assert(viewSection, `${name} section doesn't exist`);
    await viewSection.openItem(section);
    return viewSection.getVisibleItems();
}

export async function waitForTreeItems(
    section: ViewSection,
    timeoutMs = 5000
): Promise<boolean> {
    const start = Date.now();
    while (true) {
        const items = await section.getVisibleItems();
        if (items.length > 0) {
            return true;
        }
        if (Date.now() - start > timeoutMs) {
            return false;
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
    }
}

export async function dismissNotifications() {
    const workbench = await browser.getWorkbench();
    await sleep(1000);
    const notifs = await workbench.getNotifications();
    try {
        for (const n of notifs) {
            await n.dismiss();
        }
    } catch {}
}

export async function waitForSyncComplete() {
    const viewSection = (await getViewSection("CONFIGURATION")) as
        | CustomTreeSection
        | undefined;

    assert(viewSection, "CONFIGURATION section doesn't exist");

    await browser.waitUntil(
        async () => {
            const subTreeItems = await viewSection.openItem("Remote Folder");
            for (const item of subTreeItems) {
                if ((await item.getLabel()).includes("State")) {
                    const status = await item.getDescription();
                    return status === "WATCHING_FOR_CHANGES";
                }
            }
            return false;
        },
        {
            timeout: 60_000,
            interval: 2000,
            timeoutMsg: "Couldn't finish sync in 1m",
        }
    );
}

export async function getTabByTitle(title: string) {
    const workbench = await browser.getWorkbench();
    return await browser.waitUntil(
        async () => {
            console.log("Searching for a tab with title:", title);
            const tabs = await workbench.getEditorView().getOpenTabs();
            for (const tab of tabs) {
                const tabTitle = await tab.getTitle();
                console.log("Found a tab:", tabTitle);
                if (tabTitle.includes(title)) {
                    return tab;
                }
            }
        },
        {timeout: 5000}
    );
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
        {timeout: 10000}
    );
    return input!;
}

export async function waitForLogin(profileName: string) {
    console.log("Waiting for login");
    await browser.waitUntil(
        async () => {
            const section = (await getViewSection(
                "CONFIGURATION"
            )) as CustomTreeSection;
            assert(section, "CONFIGURATION section doesn't exist");
            const items = await section.getVisibleItems();
            console.log("Items in the CONFIGURATION section:", items.length);
            for (const item of items) {
                const label = await item.getLabel();
                if (label.toLowerCase().includes("auth type")) {
                    const desc = await item.getDescription();
                    console.log("Auth type label:", desc);
                    return desc?.includes(profileName);
                }
            }
            console.log(
                "Couldn't find the auth type label with the profile",
                profileName
            );
        },
        {timeout: 120_000, interval: 2_000, timeoutMsg: "Login didn't finish"}
    );
}

export function getStaticResourceName(name: string) {
    return `vscode_integration_test_${name}`;
}

export function getUniqueResourceName(name?: string) {
    const uniqueName = name
        ? `${randomUUID().slice(0, 8)}_${name}`
        : randomUUID().slice(0, 8);
    return getStaticResourceName(uniqueName);
}

export async function waitForWorkflowWebview(
    expectedOutput: string | string[]
) {
    const workbench = await browser.getWorkbench();
    const title = /Databricks Job Run/;
    await browser.waitUntil(
        async () => {
            try {
                const webView = await workbench.getWebviewByTitle(title);
                return webView !== undefined;
            } catch (e) {
                return false;
            }
        },
        {
            timeout: 5_000,
            interval: 1_000,
            timeoutMsg: "Webview did not open",
        }
    );
    const webView = await workbench.getWebviewByTitle(title);
    await webView.open();

    await browser.waitUntil(
        async () => {
            const runId = await browser.getTextByLabel("task-run-id");
            return /N\\A/.test(runId) === false;
        },
        {
            timeoutMsg: "Job did not start",
        }
    );

    const startTime = await browser.getTextByLabel("run-start-time");
    console.log("Run start time:", startTime);
    expect(startTime).not.toHaveText("-");

    await browser.waitUntil(
        async () => {
            const status = await browser.getTextByLabel("run-status");
            console.log("Run status:", status);
            return status.includes("Succeeded");
        },
        {
            timeout: 180_000,
            interval: 100,
            timeoutMsg: "Job did not reach succeeded status after 180s.",
        }
    );

    const iframe = browser.$("#frame");
    browser.switchToFrame(iframe);
    const iframeRoot = await browser.$("html");
    expect(webView.activeFrame);
    if (!Array.isArray(expectedOutput)) {
        expectedOutput = [expectedOutput];
    }
    for (const output of expectedOutput) {
        expect(iframeRoot).toHaveText(output);
    }
    browser.switchToParentFrame();
    await webView.close();
}

export async function openFile(fileName: string) {
    const workbench = await driver.getWorkbench();
    const editorView = workbench.getEditorView();
    await editorView.closeAllEditors();
    const input = await workbench.openCommandPrompt();
    await input.setText(fileName);
    await input.confirm();
    await browser.waitUntil(async () => {
        const editorView = workbench.getEditorView();
        const activeTab = await editorView.getActiveTab();
        if (!activeTab) {
            return;
        }
        const title = await activeTab.getTitle();
        return title.includes(fileName);
    });
}

export async function executeCommandWhenAvailable(command: string) {
    const workbench = await driver.getWorkbench();
    return browser.waitUntil(async () => {
        try {
            await workbench.executeQuickPick(command);
            return true;
        } catch (e) {
            console.log(`Failed to execute ${command}:`, e);
            return false;
        }
    });
}

export async function waitForNotification(message: string, action?: string) {
    await browser.waitUntil(
        async () => {
            const workbench = await browser.getWorkbench();
            for (const notification of await workbench.getNotifications()) {
                const label = await notification.getMessage();
                console.log("Checking notification message:", label);
                if (label.includes(message)) {
                    console.log(`Notification with "${message}" found.`);
                    if (action) {
                        console.log(`Taking action: ${action}`);
                        await notification.takeAction(action);
                    }
                    return true;
                }
            }
            return false;
        },
        {
            timeout: 60_000,
            interval: 2000,
            timeoutMsg: `Notification with message "${message}" not found`,
        }
    );
}

export async function waitForDeployment() {
    console.log("Waiting for deployment to finish");
    const workbench = await driver.getWorkbench();
    await browser.waitUntil(
        async () => {
            try {
                await browser.executeWorkbench(async (vscode) => {
                    await vscode.commands.executeCommand(
                        "workbench.panel.output.focus"
                    );
                });
                const outputView = await workbench
                    .getBottomBar()
                    .openOutputView();

                await selectOutputChannel(outputView, "Databricks Bundle Logs");

                const logs = (await outputView.getText()).join("");
                console.log("------------ Bundle Output ------------");
                console.log(logs);
                return (
                    logs.includes("Bundle deployed successfully") &&
                    logs.includes("Bundle configuration refreshed")
                );
            } catch (e) {
                return false;
            }
        },
        {
            timeout: 60_000,
            interval: 1_000,
            timeoutMsg:
                "Can't find 'Bundle deployed successfully' message in output channel",
        }
    );
}
