import path from "node:path";
import { ThemeIcon, TreeItemCollapsibleState, Uri, type Location, type TreeItem } from "vscode";
import type {
    BundleLocations,
    BundleResource,
    SummaryOutput,
} from "../../kernel/cli/commands/bundle";
import { getContextString } from "./contextValues";
import { getCollapsibleState, getModifiedStatusDecoration } from "./decorations";
import { DetailNode, type ExplorerNode } from "./explorerNode";
import type { JobRunTracker } from "./run/JobRunTracker";
import type { PipelineDatasets } from "./run/pipelineDatasets";
import type { PipelineRunTracker } from "./run/PipelineRunTracker";
import type { RunTrackers } from "./run/RunTrackers";
import {
    JobRunStatusNode,
    PipelineDatasetsNode,
    PipelineRunStatusNode,
    TaskRunStatusNode,
} from "./run/runNodes";
import { getSourceLocation } from "./sourceLocation";

export type { ExplorerNode } from "./explorerNode";

/*
 * The rows of the Resources group, built from `bundle summary`,
 * with the session's runs. Ported from the old `ui/bundle-resource-explorer/`
 * nodes; the run rows are in `run/runNodes.ts`.
 */

/** What every node needs to know about the summary it came from. */
export interface ExplorerContext {
    /** The workspace host, for links. */
    readonly host: string;
    readonly root: string;
    readonly locations?: BundleLocations;
    asAbsolutePath(relativePath: string): string;
    /** The session's runs, by resource key. */
    readonly runs?: RunTrackers;
    /** The pipelines' datasets; without it, pipelines have no Datasets row. */
    readonly datasets?: PipelineDatasets;
}

/** Resource types listed first, with their own nodes. Others get generic nodes. */
const KNOWN_RESOURCE_TYPES = ["jobs", "pipelines"];

/** Resource types with an icon in `resources/<theme>/resource-explorer/`. */
const ICON_RESOURCE_TYPES = [
    ...KNOWN_RESOURCE_TYPES,
    "apps",
    "clusters",
    "dashboards",
    "experiments",
    "model_serving_endpoints",
    "models",
    "quality_monitors",
    "registered_models",
    "schemas",
    "volumes",
];

function iconPath(ctx: ExplorerContext, name: string) {
    const file = (theme: string) =>
        Uri.file(
            ctx.asAbsolutePath(path.join("resources", theme, "resource-explorer", `${name}.svg`)),
        );
    return { dark: file("dark"), light: file("light") };
}

function workspaceUrl(host: string, fragment: string): string {
    return `${host.replace(/\/+$/, "")}/#${fragment}`;
}

/** `jobs` → `Jobs`, `model_serving_endpoints` → `Model serving endpoints`. */
export function humaniseResourceType(type: string): string {
    const words = type.replace(/_/g, " ");
    return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase();
}

/** The explorer's top-level rows: one header per resource type that has resources. */
export function explorerRoots(summary: SummaryOutput, ctx: ExplorerContext): ExplorerNode[] {
    const all = summary.resources ?? {};
    const types = [
        ...KNOWN_RESOURCE_TYPES,
        ...Object.keys(all).filter((t) => !KNOWN_RESOURCE_TYPES.includes(t)),
    ];
    const roots: ExplorerNode[] = [];
    for (const type of types) {
        const entries = Object.entries(all[type] ?? {});
        if (entries.length === 0) {
            continue;
        }
        const header = new ResourceTypeHeaderNode(type, ctx);
        header.children = entries.map(([key, data]) => {
            switch (type) {
                case "jobs":
                    return new JobNode(`jobs.${key}`, data, ctx, header);
                case "pipelines":
                    return new PipelineNode(`pipelines.${key}`, data, ctx, header);
                default:
                    return new UnknownResourceNode(type, key, data, ctx, header);
            }
        });
        roots.push(header);
    }
    return roots;
}

class ResourceTypeHeaderNode implements ExplorerNode {
    readonly type = "resource_type_header";
    children: ExplorerNode[] = [];

    constructor(
        readonly resourceType: string,
        private readonly ctx: ExplorerContext,
    ) {}

    getTreeItem(): TreeItem {
        return {
            label: humaniseResourceType(this.resourceType),
            iconPath: ICON_RESOURCE_TYPES.includes(this.resourceType)
                ? iconPath(this.ctx, this.resourceType)
                : new ThemeIcon("folder"),
            contextValue: `${this.resourceType}-header`,
            collapsibleState: TreeItemCollapsibleState.Expanded,
        };
    }

    getChildren(): ExplorerNode[] {
        return this.children;
    }
}

type JobData = BundleResource & { tasks?: TaskData[] };
type TaskData = { task_key: string; description?: string; [key: string]: unknown };

class JobNode implements ExplorerNode {
    readonly type = "jobs";

    constructor(
        readonly resourceKey: string,
        readonly data: JobData,
        private readonly ctx: ExplorerContext,
        readonly parent?: ExplorerNode,
    ) {}

    get url(): string | undefined {
        return this.data.id ? workspaceUrl(this.ctx.host, `job/${this.data.id}`) : undefined;
    }

    get sourceLocation(): Location | undefined {
        return getSourceLocation(this.ctx.locations, this.ctx.root, this.resourceKey);
    }

    get run(): JobRunTracker | undefined {
        const tracker = this.ctx.runs?.get(this.resourceKey);
        return tracker?.type === "jobs" ? tracker : undefined;
    }

    getTreeItem(): TreeItem {
        return runnableResourceTreeItem(this);
    }

    getChildren(): ExplorerNode[] {
        const tasks = Array.isArray(this.data.tasks) ? this.data.tasks : undefined;
        if (tasks === undefined) {
            return [];
        }
        const run = this.run;
        const header = new TaskHeaderNode(this);
        header.children = tasks.map(
            (task, i) =>
                new TaskNode(task, this, `${this.resourceKey}.tasks[${i}]`, this.ctx, header, run),
        );
        return run === undefined ? [header] : [new JobRunStatusNode(run, this), header];
    }
}

class TaskHeaderNode implements ExplorerNode {
    readonly type = "task_header";
    children: TaskNode[] = [];

    constructor(readonly parent: ExplorerNode) {}

    getTreeItem(): TreeItem {
        return {
            label: "Tasks",
            contextValue: "task_header",
            collapsibleState:
                this.children.length > 0
                    ? TreeItemCollapsibleState.Expanded
                    : TreeItemCollapsibleState.None,
        };
    }

    getChildren(): ExplorerNode[] {
        return this.children;
    }
}

class TaskNode implements ExplorerNode {
    readonly type = "task";

    constructor(
        readonly data: TaskData,
        private readonly job: JobNode,
        readonly resourceKey: string,
        private readonly ctx: ExplorerContext,
        readonly parent: ExplorerNode,
        private readonly run?: JobRunTracker,
    ) {}

    /** The task's run in its job's run, once the run has an ID and data. */
    get runDetails() {
        return this.run?.runId === undefined
            ? undefined
            : this.run.data?.tasks?.find((t) => t.taskKey === this.data.task_key);
    }

    get url(): string | undefined {
        const jobId = this.job.data.id;
        return jobId && this.data.task_key
            ? workspaceUrl(this.ctx.host, `job/${jobId}/tasks/task/${this.data.task_key}`)
            : undefined;
    }

    get sourceLocation(): Location | undefined {
        return getSourceLocation(this.ctx.locations, this.ctx.root, this.resourceKey);
    }

    /** The `*_task` key the task sets, such as `notebook_task`. */
    get taskType(): string | undefined {
        return Object.keys(this.data).find(
            (k) => k.endsWith("_task") && this.data[k] !== undefined,
        );
    }

    /** `spark_python_task` → `Spark Python`. */
    get humanisedTaskType(): string | undefined {
        return this.taskType
            ?.replace("_task", "")
            .split("_")
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" ");
    }

    private icon(): TreeItem["iconPath"] {
        switch (this.taskType) {
            case "pipeline_task":
                return iconPath(this.ctx, "pipelines");
            case "spark_python_task":
            case "python_wheel_task":
                return iconPath(this.ctx, "python");
            case "notebook_task":
                return new ThemeIcon("notebook");
            case "condition_task":
                return iconPath(this.ctx, "fork");
            case "run_job_task":
                return iconPath(this.ctx, "jobs");
            default:
                return undefined;
        }
    }

    getTreeItem(): TreeItem {
        return {
            label: this.data.task_key,
            id: `${this.data.task_key}-${this.job.data.id}-${this.job.resourceKey}`,
            description: this.humanisedTaskType,
            tooltip: this.data.description,
            iconPath: this.icon(),
            contextValue: getContextString({
                nodeType: this.type,
                running: this.runDetails !== undefined,
                hasUrl: this.url !== undefined,
                hasSourceLocation: this.sourceLocation !== undefined,
            }),
            collapsibleState:
                this.run?.runId !== undefined
                    ? TreeItemCollapsibleState.Expanded
                    : TreeItemCollapsibleState.None,
        };
    }

    getChildren(): ExplorerNode[] {
        const details = this.runDetails;
        return details === undefined
            ? []
            : [new TaskRunStatusNode(details, this, this.ctx.host, this.job.data.id, this.run)];
    }
}

type PipelineData = BundleResource & { catalog?: string; target?: string };

class PipelineNode implements ExplorerNode {
    readonly type = "pipelines";

    constructor(
        readonly resourceKey: string,
        readonly data: PipelineData,
        private readonly ctx: ExplorerContext,
        readonly parent?: ExplorerNode,
    ) {}

    get url(): string | undefined {
        return this.data.id
            ? workspaceUrl(this.ctx.host, `joblist/pipelines/${this.data.id}`)
            : undefined;
    }

    get sourceLocation(): Location | undefined {
        return getSourceLocation(this.ctx.locations, this.ctx.root, this.resourceKey);
    }

    get run(): PipelineRunTracker | undefined {
        const tracker = this.ctx.runs?.get(this.resourceKey);
        return tracker?.type === "pipelines" ? tracker : undefined;
    }

    getTreeItem(): TreeItem {
        return runnableResourceTreeItem(this);
    }

    getChildren(): ExplorerNode[] {
        const children: ExplorerNode[] = [];
        if (typeof this.data.catalog === "string" && this.data.catalog !== "") {
            children.push(
                new DetailNode(
                    {
                        label: "Catalog",
                        description: this.data.catalog,
                        iconPath: new ThemeIcon("book"),
                        contextValue: "catalog",
                    },
                    this,
                ),
            );
        }
        if (typeof this.data.target === "string" && this.data.target !== "") {
            children.push(
                new DetailNode(
                    {
                        label: "Target",
                        description: this.data.target,
                        iconPath: new ThemeIcon("target"),
                        contextValue: "target",
                    },
                    this,
                ),
            );
        }
        const run = this.run;
        if (this.ctx.datasets !== undefined) {
            children.push(
                new PipelineDatasetsNode(
                    this.resourceKey,
                    this.data.id,
                    this.ctx.datasets,
                    run,
                    this,
                ),
            );
        }
        if (run !== undefined) {
            children.push(new PipelineRunStatusNode(run, this, this.ctx.host));
        }
        return children;
    }
}

/** The tree item of a runnable resource (a job or a pipeline). */
function runnableResourceTreeItem(node: JobNode | PipelineNode): TreeItem {
    const running = node.run?.isRunning ?? false;
    return {
        label: node.data.name,
        contextValue: getContextString({
            resourceType: node.type,
            running,
            hasUrl: node.url !== undefined,
            hasSourceLocation: node.sourceLocation !== undefined,
            cancellable: running,
            nodeType: node.type,
            modifiedStatus: node.data.modified_status,
        }),
        resourceUri: getModifiedStatusDecoration(
            node.data.name ?? node.resourceKey,
            node.data.modified_status,
        ),
        collapsibleState: getCollapsibleState(running, node.data.modified_status),
    };
}

/** A resource of a type without its own node: apps, schemas, volumes, … */
class UnknownResourceNode implements ExplorerNode {
    readonly type = "unknown_resource";

    constructor(
        readonly resourceType: string,
        readonly resourceKey: string,
        readonly data: BundleResource & Record<string, unknown>,
        private readonly ctx: ExplorerContext,
        readonly parent?: ExplorerNode,
    ) {}

    get url(): string | undefined {
        return this.data.url;
    }

    get sourceLocation(): Location | undefined {
        return getSourceLocation(
            this.ctx.locations,
            this.ctx.root,
            `${this.resourceType}.${this.resourceKey}`,
        );
    }

    get name(): string {
        const named = [
            this.data.name,
            this.data.display_name,
            this.data.table_name,
            this.data.cluster_name,
            this.data.key,
        ];
        return named.find((n): n is string => typeof n === "string") ?? this.resourceKey;
    }

    getTreeItem(): TreeItem {
        return {
            label: this.name,
            contextValue: getContextString({
                resourceType: this.resourceType,
                nodeType: this.type,
                hasUrl: this.url !== undefined,
                hasSourceLocation: this.sourceLocation !== undefined,
                modifiedStatus: this.data.modified_status,
            }),
            resourceUri: getModifiedStatusDecoration(this.name, this.data.modified_status),
            collapsibleState: TreeItemCollapsibleState.None,
        };
    }

    getChildren(): ExplorerNode[] {
        return [];
    }
}
