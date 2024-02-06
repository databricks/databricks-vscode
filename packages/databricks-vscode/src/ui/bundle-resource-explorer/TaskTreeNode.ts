import path from "path";
import {
    BundleResourceExplorerResource,
    BundleResourceExplorerTreeItem,
    BundleResourceExplorerTreeNode,
} from "./types";
import {ExtensionContext, TreeItemCollapsibleState, ThemeIcon} from "vscode";
import {JobRunStatus} from "../../bundle/run/JobRunStatus";
import {ConnectionManager} from "../../configuration/ConnectionManager";
import {jobs} from "@databricks/databricks-sdk";
import {TaskRunStatusTreeNode} from "./TaskRunStatusTreeNode";
import {ContextUtils} from "./utils";

type Task = Required<BundleResourceExplorerResource<"jobs">>["tasks"][number];
type TaskType = keyof {
    [k in keyof Required<Task> as k extends `${string}_task` ? k : never]: k;
};

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
        if (!host || !this.jobId || !this.taskKey) {
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
        public parent: BundleResourceExplorerTreeNode,
        public readonly jobId?: string,
        public readonly runMonitor?: JobRunStatus
    ) {}

    private getIconPathForType(taskType: string) {
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

    get taskType(): TaskType | undefined {
        return Object.keys(this.data).find(
            (k) =>
                k.endsWith("_task") && this.data[k as keyof Task] !== undefined
        ) as TaskType | undefined;
    }

    get humanisedTaskType() {
        if (this.taskType === undefined) {
            return undefined;
        }

        return this.taskType
            .replace("_task", "")
            .split("_")
            .map((word) => word[0].toUpperCase() + word.slice(1))
            .join(" ");
    }

    getTreeItem(): BundleResourceExplorerTreeItem {
        let iconPath: BundleResourceExplorerTreeItem["iconPath"] = undefined;
        switch (this.taskType) {
            case "pipeline_task":
                iconPath = this.getIconPathForType("pipelines");
                break;
            case "spark_python_task":
                iconPath = this.getIconPathForType("python");
                break;
            case "notebook_task":
                iconPath = new ThemeIcon("notebook");
                break;
            case "condition_task":
                iconPath = this.getIconPathForType("fork");
                break;
            case "run_job_task":
                iconPath = this.getIconPathForType("jobs");
                break;
            case "python_wheel_task":
                iconPath = this.getIconPathForType("python");
                break;
            case "dbt_task":
            case "spark_submit_task":
            case "sql_task":
            case "spark_jar_task":
                break;
            default:
                break;
        }

        return {
            label: this.data.task_key,
            id: `${this.data.task_key}-${this.jobId}-${this.jobResourceKey}`,
            description: this.humanisedTaskType,
            tooltip: this.data.description,
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
                this,
                this.jobId
            ),
        ];
    }
}
