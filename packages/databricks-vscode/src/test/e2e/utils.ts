import assert from "node:assert";
import {unlink, writeFile} from "node:fs/promises";
import path from "node:path";
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
    const section = await findViewSection(name);
    assert(section);

    for (const s of ViewSectionTypes) {
        if (s !== name) {
            await (await findViewSection(s))?.collapse();
        }
    }

    await section.expand();
    await (await section.elem).click();
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
    await browser.waitUntil(
        async () => {
            return await getViewSubSection("CONFIGURATION", "Sync Destination");
        },
        {
            timeout: 20000,
            interval: 2000,
            timeoutMsg: "Couldn't find sync destination tree items.",
        }
    );
    await browser.waitUntil(
        async () => {
            const repoConfigItem = await getViewSubSection(
                "CONFIGURATION",
                "Sync Destination"
            );
            if (repoConfigItem === undefined) {
                return false;
            }
            await repoConfigItem.expand();

            let status: TreeItem | undefined = undefined;
            for (const i of await repoConfigItem.getChildren()) {
                if ((await i.getLabel()).includes("State")) {
                    status = i;
                    break;
                }
            }
            if (status === undefined) {
                return false;
            }

            const description = await status?.getDescription();
            return (
                description !== undefined &&
                description.includes("WATCHING_FOR_CHANGES")
            );
        },
        {
            timeout: 60000,
            interval: 2000,
            timeoutMsg: "Couldn't finish sync in 1m",
        }
    );
}

export async function startSyncIfStopped() {
    browser.waitUntil(
        async () => {
            const repoConfigItem = await getViewSubSection(
                "CONFIGURATION",
                "Sync Destination"
            );
            if (repoConfigItem === undefined) {
                return false;
            }
            await repoConfigItem.expand();

            let status: TreeItem | undefined = undefined;
            for (const i of await repoConfigItem.getChildren()) {
                if ((await i.getLabel()).includes("State")) {
                    status = i;
                    break;
                }
            }
            if (status === undefined) {
                return false;
            }

            if ((await status.getDescription())?.includes("STOPPED")) {
                const buttons = await repoConfigItem.getActionButtons();
                if (buttons.length === 0) {
                    return false;
                }
                await buttons[0].elem.click();
            }
            return true;
        },
        {
            timeout: 20000,
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
        {timeout: 20_000}
    );
}

const BASIC_BUNDLE = `
bundle:
  name: hello_test
  compute_id: _COMPUTE_ID_

targets:
  dev_test:
    mode: development
    default: true
    workspace:
      host: _HOST_
`;

export async function createBasicBundleConfig() {
    assert(process.env.DATABRICKS_HOST, "DATABRICKS_HOST doesn't exist");
    assert(process.env.WORKSPACE_PATH, "WORKSPACE_PATH doesn't exist");
    assert(
        process.env.TEST_DEFAULT_CLUSTER_ID,
        "TEST_DEFAULT_CLUSTER_ID doesn't exist"
    );
    const bundleConfig = path.join(
        process.env.WORKSPACE_PATH,
        "databricks.yml"
    );
    await writeFile(
        bundleConfig,
        BASIC_BUNDLE.replace("_HOST_", process.env.DATABRICKS_HOST).replace(
            "_COMPUTE_ID_",
            process.env.TEST_DEFAULT_CLUSTER_ID
        )
    );
}

export async function clearBundleConfig() {
    assert(process.env.DATABRICKS_HOST, "DATABRICKS_HOST doesn't exist");
    assert(process.env.WORKSPACE_PATH, "WORKSPACE_PATH doesn't exist");
    const bundleConfig = path.join(
        process.env.WORKSPACE_PATH,
        "databricks.yml"
    );
    await unlink(bundleConfig);
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
            timeout: 30000,
            interval: 100,
            timeoutMsg: "Job did not reach succeeded status after 30s.",
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
