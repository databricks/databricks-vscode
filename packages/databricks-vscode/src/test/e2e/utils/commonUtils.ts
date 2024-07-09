import assert from "node:assert";
import {randomUUID} from "crypto";
import {
    CustomTreeSection,
    sleep,
    TreeItem,
    ViewControl,
    ViewSection,
    InputBox,
} from "wdio-vscode-service";

// eslint-disable-next-line @typescript-eslint/naming-convention
const ViewSectionTypes = [
    "CLUSTERS",
    "CONFIGURATION",
    "WORKSPACE EXPLORER",
    "BUNDLE RESOURCE EXPLORER",
    "BUNDLE VARIABLES VIEW",
] as const;
export type ViewSectionType = (typeof ViewSectionTypes)[number];

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
    for (const v of views) {
        const title = await v.getTitle();
        if (title === null) {
            continue;
        }
        if (title.toUpperCase() === name) {
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
    await (await section!.elem).click();
    return section;
}

export async function getViewSubSection(
    section: ViewSectionType,
    subSection: string
): Promise<TreeItem | undefined> {
    for (const s of ViewSectionTypes) {
        if (s !== section) {
            await (await findViewSection(s))?.collapse();
        }
    }
    const sectionView = await getViewSection(section);

    if (!sectionView) {
        return;
    }

    const configTree = sectionView as CustomTreeSection;

    await waitForTreeItems(configTree);
    const configItems = await configTree.getVisibleItems();

    let subConfigItem: TreeItem | undefined;
    for (const i of configItems) {
        const label = await i.getLabel();
        if (label.startsWith(subSection)) {
            subConfigItem = i;
            break;
        }
    }
    return subConfigItem;
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
            const subTreeItems = await viewSection.openItem("Workspace Folder");
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
    await browser.waitUntil(
        async () => {
            await dismissNotifications();
            const section = (await getViewSection(
                "CONFIGURATION"
            )) as CustomTreeSection;
            assert(section, "CONFIGURATION section doesn't exist");
            const items = await section.getVisibleItems();
            for (const item of items) {
                const label = await item.getLabel();
                if (label.toLowerCase().includes("auth type")) {
                    const desc = await item.getDescription();
                    return desc?.includes(profileName);
                }
            }
        },
        {timeout: 60_000, interval: 2_000, timeoutMsg: "Login didn't finish"}
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

export async function waitForWorkflowWebview(expectedOutput: string) {
    const workbench = await browser.getWorkbench();
    const webView = await workbench.getWebviewByTitle(/Databricks Job Run/);
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
    expect(startTime).not.toHaveText("-");

    await browser.waitUntil(
        async () => {
            const status = await browser.getTextByLabel("run-status");
            return status.includes("Succeeded");
        },
        {
            timeout: 60_000,
            interval: 100,
            timeoutMsg: "Job did not reach succeeded status after 60s.",
        }
    );

    const iframe = browser.$("#frame");
    browser.switchToFrame(iframe);
    const iframeRoot = await browser.$("html");
    expect(webView.activeFrame);
    expect(iframeRoot).toHaveText(expectedOutput);
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
