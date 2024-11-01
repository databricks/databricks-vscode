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
    const jobViewItem = await getResourceViewItem(
        resourceExplorerView,
        "Workflows",
        resourceName
    );
    assert(jobViewItem, `Job view item with name ${resourceName} not found`);

    const tasks = await resourceExplorerView.openItem(
        "Workflows",
        await (await jobViewItem!.elem).getText(),
        "Tasks"
    );
    for (const task of tasks) {
        if ((await task.elem.getText()).includes(taskName)) {
            return task;
        }
    }
}
