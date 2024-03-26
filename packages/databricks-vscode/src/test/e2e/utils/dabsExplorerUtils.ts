import assert from "assert";
import {CustomTreeSection} from "wdio-vscode-service";

export async function getJobViewItem(
    resourceExplorer: CustomTreeSection,
    jobDisplayName: string
) {
    const jobs = await resourceExplorer.openItem("Workflows");
    for (const job of jobs) {
        if ((await job.elem.getText()).includes(jobDisplayName)) {
            return job;
        }
    }
}

export async function geTaskViewItem(
    resourceExplorerView: CustomTreeSection,
    jobName: string,
    taskName: string
) {
    const jobViewItem = await getJobViewItem(resourceExplorerView, jobName);
    assert(jobViewItem, `Job view item with name ${jobName} not found`);

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
