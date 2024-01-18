import {ExtensionContext, TreeItemCollapsibleState} from "vscode";
import {BundleRemoteState} from "../../bundle/models/BundleRemoteStateModel";
import {BundleResourceExplorerTreeItem, Renderer, TreeNode} from "./types";
import path from "path";

export class JobsRenderer implements Renderer {
    readonly type = "jobs";

    constructor(private readonly context: ExtensionContext) {}
    async getTreeItem(
        element: TreeNode
    ): Promise<BundleResourceExplorerTreeItem> {
        if (element.type !== this.type) {
            throw new Error("Invalid element type");
        }

        return {
            label: element.data.name,
            iconPath: {
                dark: this.context.asAbsolutePath(
                    path.join(
                        "resources",
                        "dark",
                        "resource-explorer",
                        "jobs.svg"
                    )
                ),
                light: this.context.asAbsolutePath(
                    path.join(
                        "resources",
                        "light",
                        "resource-explorer",
                        "jobs.svg"
                    )
                ),
            },
            contextValue: "job",
            collapsibleState: TreeItemCollapsibleState.Collapsed,
        };
    }

    async getChildren(element: TreeNode): Promise<TreeNode[]> {
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

    async getRoots(remoteStateConfig: BundleRemoteState): Promise<TreeNode[]> {
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
