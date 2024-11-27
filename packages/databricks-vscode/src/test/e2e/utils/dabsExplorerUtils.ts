import assert from "assert";
import {CustomTreeSection} from "wdio-vscode-service";

export async function getResourceViewItem(
    resourceExplorer: CustomTreeSection,
    resourceType: "Workflows" | "Pipelines",
    resourceName: string
) {
    const jobs = await resourceExplorer.openItem(resourceType);
    for (const job of jobs) {
        if ((await job.elem.getText()).includes(resourceName)) {
            return job;
        }
    }
}

export async function geTaskViewItem(
    resourceExplorerView: CustomTreeSection,
    resourceName: string,
    taskName: string
) {
    const tasks = await getResourceSubItems(
        resourceExplorerView,
        "Workflows",
        resourceName,
        "Tasks"
    );
    for (const task of tasks) {
        if ((await task.elem.getText()).includes(taskName)) {
            return task;
        }
    }
}

export async function getResourceSubItems(
    resourceExplorerView: CustomTreeSection,
    resourceType: "Workflows" | "Pipelines",
    resourceName: string,
    subItemName: string
) {
    const resourceViewItem = await getResourceViewItem(
        resourceExplorerView,
        resourceType,
        resourceName
    );
    assert(
        resourceViewItem,
        `Resource view item with name ${resourceName} not found`
    );
    return await resourceExplorerView.openItem(
        resourceType,
        await (await resourceViewItem!.elem).getText(),
        subItemName
    );
}

export async function waitForRunStatus(
    resourceExplorerView: CustomTreeSection,
    resourceType: "Workflows" | "Pipelines",
    resorceName: string,
    successLabel: string,
    timeout: number = 120_000
) {
    console.log("Waiting for run to finish");
    await browser.waitUntil(
        async () => {
            const item = await getResourceViewItem(
                resourceExplorerView,
                resourceType,
                resorceName
            );
            if (item === undefined) {
                console.log(`Item ${resorceName} not found`);
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
        }
    );
}
