import {TreeItemCollapsibleState} from "vscode";
import {BundleRemoteState} from "../../bundle/models/BundleRemoteStateModel";
import {BundleResourceExplorerTreeItem, Renderer, TreeNode} from "./types";

export class JobsRenderer implements Renderer {
    readonly type = "jobs";

    constructor() {}
    getTreeItem(element: TreeNode): BundleResourceExplorerTreeItem {
        if (element.type !== this.type) {
            throw new Error("Invalid element type");
        }

        return {
            label: element.data.name,
            contextValue: "job",
            collapsibleState: TreeItemCollapsibleState.Collapsed,
        };
    }

    getChildren(element: TreeNode): TreeNode[] {
        if (element.type !== this.type) {
            return [];
        }

        if (element.data.tasks === undefined) {
            return [];
        }

        return element.data.tasks.map((task) => {
            return {
                type: "task",
                jobId: element.data.id,
                jobKey: element.resourceKey,
                parent: element,
                data: task,
            };
        });
    }

    getRoots(remoteStateConfig: BundleRemoteState): TreeNode[] {
        const jobs = remoteStateConfig?.resources?.jobs;
        if (jobs === undefined) {
            return [];
        }

        return Object.keys(jobs).map((jobKey) => {
            return {
                type: this.type,
                data: jobs[jobKey],
                resourceKey: jobKey,
            };
        });
    }
}
