import assert from "node:assert";
import type { CustomTreeSection } from "wdio-vscode-service";
import { waitForLogin } from "./configuration.ts";
import { dismissNotifications } from "./dismiss-notifications.ts";
import { getViewSection, waitForGroup } from "./view.ts";

/* Ported from the old suite's `dabsExplorerUtils.ts`, and `waitForDeployment` from its `commonUtils.ts`. */

/** The bundle's resources, a group of the PROJECT view: its rows are "Jobs", "Pipelines"…. */
export const RESOURCES = "Resources";

export async function getResourceViewItem(
    resourceExplorer: CustomTreeSection,
    resourceType: "Jobs" | "Pipelines",
    resourceName: string,
) {
    const jobs = await resourceExplorer.openItem(RESOURCES, resourceType);
    for (const job of jobs) {
        if ((await job.elem.getText()).includes(resourceName)) {
            return job;
        }
    }
}

export async function geTaskViewItem(
    resourceExplorerView: CustomTreeSection,
    resourceName: string,
    taskName: string,
) {
    const tasks = await getResourceSubItems(resourceExplorerView, "Jobs", resourceName, "Tasks");
    for (const task of tasks) {
        if ((await task.elem.getText()).includes(taskName)) {
            return task;
        }
    }
}

export async function getResourceSubItems(
    resourceExplorerView: CustomTreeSection,
    resourceType: "Jobs" | "Pipelines",
    resourceName: string,
    ...subItemNames: string[]
) {
    const resourceViewItem = await getResourceViewItem(
        resourceExplorerView,
        resourceType,
        resourceName,
    );
    assert(resourceViewItem, `Resource view item with name ${resourceName} not found`);
    return await resourceExplorerView.openItem(
        RESOURCES,
        resourceType,
        await resourceViewItem.elem.getText(),
        ...subItemNames,
    );
}

export async function waitForRunStatus(
    resourceExplorerView: CustomTreeSection,
    resourceType: "Jobs" | "Pipelines",
    resourceName: string,
    successLabel: string,
    timeout: number = 120_000,
) {
    console.log("Waiting for run to finish");
    await browser.waitUntil(
        async () => {
            const item = await getResourceViewItem(
                resourceExplorerView,
                resourceType,
                resourceName,
            );
            if (item === undefined) {
                console.log(`Item ${resourceName} not found`);
                return false;
            }

            const runStatusItem = await item.findChildItem("Run Status");
            if (runStatusItem === undefined) {
                console.log("Run status item not found");
                return false;
            }

            const description = await runStatusItem.getDescription();
            console.log(`Run status: ${description}`);

            return description === successLabel;
        },
        {
            timeout,
            interval: 5_000,
            timeoutMsg: `The run status didn't reach success within ${timeout}ms`,
        },
    );
}

export async function waitForDeployment() {
    console.log("Waiting for deployment to finish");
    await waitForBundleOutput("Bundle deployed successfully");
}

/**
 * Waits until the "Databricks Bundle Logs" output channel shows `message` and
 * the explorer's refresh after it.
 */
export async function waitForBundleOutput(
    message: string,
    { timeout = 60_000, interval = 1_000 } = {},
) {
    const workbench = await browser.getWorkbench();
    await browser.waitUntil(
        async () => {
            try {
                await browser.executeWorkbench(async (vscode) => {
                    await vscode.commands.executeCommand("workbench.panel.output.focus");
                });
                const outputView = await workbench.getBottomBar().openOutputView();

                if ((await outputView.getCurrentChannel()) !== "Databricks Bundle Logs") {
                    await outputView.selectChannel("Databricks Bundle Logs");
                }

                const logs = (await outputView.getText()).join("");
                console.log("------------ Bundle Output ------------");
                console.log(logs);
                return logs.includes(message) && logs.includes("Bundle configuration refreshed");
            } catch {
                return false;
            }
        },
        {
            timeout,
            interval,
            timeoutMsg: `Can't find '${message}' message in output channel`,
        },
    );
}

/** Waits until the PROJECT view's `Resources` group shows, which needs resources in the bundle. */
export async function waitForResourcesGroup(section: CustomTreeSection, timeoutMs = 20_000) {
    await waitForGroup(section, RESOURCES, timeoutMs);
}

/**
 * Waits for the extension to activate and log in to the DEFAULT profile, then
 * for the bundle's resources to load into the PROJECT view's Resources group.
 */
export async function waitForBundleExplorer(): Promise<CustomTreeSection> {
    assert(await getViewSection("PROJECT"));
    await waitForLogin("DEFAULT");
    await dismissNotifications();
    const section = (await getViewSection("PROJECT")) as CustomTreeSection | undefined;
    assert(section);
    await waitForResourcesGroup(section);
    return section;
}
