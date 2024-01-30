import {BundleRemoteState} from "../../bundle/models/BundleRemoteStateModel";
import {BundleResourceExplorerTreeItem, Renderer, TreeNode} from "./types";
import {TreeItemCollapsibleState} from "vscode";
import {RunStateUtils} from "./utils";
import {SimplifiedRunState, sentenceCase} from "./utils/RunStateUtils";
import {GetUpdateResponse} from "@databricks/databricks-sdk/dist/apis/pipelines";

function getSimplifiedUpdateState(
    update?: GetUpdateResponse
): SimplifiedRunState {
    if (update?.update?.state === undefined) {
        return "Unknown";
    }

    switch (update.update.state) {
        case "RESETTING":
        case "CREATED":
        case "QUEUED":
        case "INITIALIZING":
        case "SETTING_UP_TABLES":
        case "WAITING_FOR_RESOURCES":
            return "Pending";
        case "RUNNING":
            return "Running";
        case "COMPLETED":
            return "Success";
        case "FAILED":
            return "Failed";
        case "CANCELED":
            return "Cancelled";
        case "STOPPING":
            return "Terminating";
    }
}

export class PipelineRunStatusRenderer implements Renderer {
    readonly type = "pipeline_run_status";
    constructor() {}
    getChildren(element: TreeNode): TreeNode[] {
        if (element.type !== this.type || element.update === undefined) {
            return [];
        }

        const children: TreeNode[] = [];

        if (element.update.update?.cause) {
            children.push({
                type: "treeItem",
                treeItem: {
                    label: "Cause",
                    description: element.update.update?.cause,
                    contextValue: "update_cause",
                },
            });
        }
        if (element.update.update?.creation_time) {
            children.push({
                type: "treeItem",
                treeItem: {
                    label: "Start Time",
                    description: RunStateUtils.humaniseDate(
                        element.update.update?.creation_time
                    ),
                    contextValue: "start_time",
                },
            });
        }

        return children;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    getRoots(remoteStateConfig: BundleRemoteState): TreeNode[] {
        return [];
    }

    getTreeItem(element: TreeNode): BundleResourceExplorerTreeItem {
        if (element.type !== this.type) {
            throw new Error("Invalid element type");
        }
        if (element.update === undefined) {
            throw new Error("No update found for pipeline run");
        }

        const status = getSimplifiedUpdateState(element.update);
        const icon = RunStateUtils.getThemeIconForStatus(status);
        return {
            label: "Run Status",
            iconPath: icon,
            description: sentenceCase(element.update.update?.state),
            contextValue: `databricks.bundle.resource-explorer.${status.toLowerCase()}.status`,
            collapsibleState: TreeItemCollapsibleState.Collapsed,
        };
    }
}
