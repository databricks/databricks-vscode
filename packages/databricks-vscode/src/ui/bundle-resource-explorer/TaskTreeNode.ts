import path from "path";
import {
    BundleResourceExplorerResource,
    BundleResourceExplorerTreeItem,
    BundleResourceExplorerTreeNode,
} from "./types";
import {ExtensionContext, TreeItemCollapsibleState} from "vscode";
import {JobRunStatus} from "../../bundle/run/JobRunStatus";
import {ConnectionManager} from "../../configuration/ConnectionManager";
import {jobs} from "@databricks/databricks-sdk";
import {TaskRunStatusTreeNode} from "./TaskRunStatusTreeNode";
import {ContextUtils} from "./utils";

type Task = Required<BundleResourceExplorerResource<"jobs">>["tasks"][number];

export class TaskTreeNode implements BundleResourceExplorerTreeNode {
    readonly type = "task";
    get taskKey(): string {
        return this.data.task_key;
    }
    get runDetails(): jobs.RunTask | undefined {
        return this.runMonitor?.data?.tasks?.find(
            (t) => t.task_key === this.taskKey
        );
    }

    get url(): string | undefined {
        const host = this.connectionManager.databricksWorkspace?.host;
        if (host === undefined || this.taskKey === undefined) {
            return undefined;
        }

        return `${host.toString()}jobs/${this.jobId}/tasks/${this.taskKey}`;
    }
    constructor(
        private readonly context: ExtensionContext,
        private readonly connectionManager: ConnectionManager,
        public readonly data: Task,
        public readonly jobResourceKey: string,
        public readonly resourceKey: string,
        public readonly jobId?: string,
        public readonly runMonitor?: JobRunStatus,
        public parent?: BundleResourceExplorerTreeNode
    ) {}

    private getTaskIconPath(taskType: string) {
        return {
            dark: this.context.asAbsolutePath(
                path.join(
                    "resources",
                    "dark",
                    "resource-explorer",
                    `${taskType}.svg`
                )
            ),
            light: this.context.asAbsolutePath(
                path.join(
                    "resources",
                    "light",
                    "resource-explorer",
                    `${taskType}.svg`
                )
            ),
        };
    }

    get isRunning() {
        return (
            this.runMonitor?.runId !== undefined &&
            this.runDetails !== undefined
        );
    }

    getTreeItem(): BundleResourceExplorerTreeItem {
        let iconPath: BundleResourceExplorerTreeItem["iconPath"] = undefined;

        if (this.data.pipeline_task !== undefined) {
            iconPath = this.getTaskIconPath("pipelines");
        }

        if (this.data.spark_python_task !== undefined) {
            iconPath = this.getTaskIconPath("python");
        }

        return {
            label: this.data.task_key,
            id: `${this.data.task_key}-${this.jobId}-${this.jobResourceKey}`,
            description: this.data.description,
            iconPath: iconPath,
            contextValue: ContextUtils.getContextString({
                nodeType: this.type,
                running: this.isRunning,
                hasUrl: this.url !== undefined,
                cancellable: false,
            }),
            collapsibleState:
                this.runMonitor?.runId !== undefined
                    ? TreeItemCollapsibleState.Expanded
                    : TreeItemCollapsibleState.None,
        };
    }

    getChildren(): BundleResourceExplorerTreeNode[] {
        if (
            this.runMonitor?.runId === undefined ||
            this.runDetails === undefined
        ) {
            return [];
        }

        return [
            new TaskRunStatusTreeNode(
                this.connectionManager,
                this.runDetails,
                this.jobId,
                this
            ),
        ];
    }
}
