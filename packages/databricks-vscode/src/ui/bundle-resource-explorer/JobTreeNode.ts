import {ExtensionContext, Location} from "vscode";
import {BundleRemoteState} from "../../bundle/models/BundleRemoteStateModel";
import {
    BundleResourceExplorerResource,
    BundleResourceExplorerTreeItem,
    BundleResourceExplorerTreeNode,
} from "./types";
import {BundleRunStatusManager} from "../../bundle/run/BundleRunStatusManager";
import {ContextUtils} from "./utils";
import {DecorationUtils} from "../utils";
import {ConnectionManager} from "../../configuration/ConnectionManager";
import {JobRunStatusTreeNode} from "./JobRunStatusTreeNode";
import {JobRunStatus} from "../../bundle/run/JobRunStatus";
import {TaskTreeNode} from "./TaskTreeNode";
import {TaskHeaderTreeNode} from "./TaskHeaderTreeNode";
import {getSourceLocation} from "./utils/SourceLocationUtils";

export class JobTreeNode implements BundleResourceExplorerTreeNode {
    readonly type = "jobs";

    constructor(
        private readonly context: ExtensionContext,
        private readonly bundleRunStatusManager: BundleRunStatusManager,
        private readonly connectionManager: ConnectionManager,
        public readonly resourceKey: string,
        public readonly data: BundleResourceExplorerResource<"jobs">,
        private readonly locations: BundleRemoteState["__locations"],
        public parent?: BundleResourceExplorerTreeNode
    ) {}

    get url(): string | undefined {
        const host = this.connectionManager.databricksWorkspace?.host;

        if (!host || !this.data.id) {
            return undefined;
        }

        return `${host.toString()}#job/${this.data.id}`;
    }

    get sourceLocation(): Location | undefined {
        return getSourceLocation(
            this.locations,
            this.connectionManager.projectRoot,
            this.resourceKey
        );
    }

    get isRunning() {
        const runner = this.bundleRunStatusManager.runStatuses.get(
            this.resourceKey
        );
        return runner?.runState === "running" || runner?.runState === "unknown";
    }

    getTreeItem(): BundleResourceExplorerTreeItem {
        return {
            label: this.data.name,
            contextValue: ContextUtils.getContextString({
                resourceType: this.type,
                running: this.isRunning,
                hasUrl: this.url !== undefined,
                hasSourceLocation: this.sourceLocation !== undefined,
                cancellable: this.isRunning,
                nodeType: this.type,
                modifiedStatus: this.data.modified_status,
            }),
            resourceUri: DecorationUtils.getModifiedStatusDecoration(
                this.data.name ?? this.resourceKey,
                this.data.modified_status
            ),
            collapsibleState: DecorationUtils.getCollapsibleState(
                this.isRunning,
                this.data.modified_status
            ),
        };
    }

    getChildren(): BundleResourceExplorerTreeNode[] {
        if (this.data.tasks === undefined) {
            return [];
        }

        const children: BundleResourceExplorerTreeNode[] = [];
        const runMonitor = this.bundleRunStatusManager.runStatuses.get(
            this.resourceKey
        ) as JobRunStatus | undefined;

        if (runMonitor) {
            children.push(new JobRunStatusTreeNode(this, runMonitor));
        }
        children.push(
            new TaskHeaderTreeNode(
                this.data.tasks.map((task, i) => {
                    return new TaskTreeNode(
                        this.context,
                        this.connectionManager,
                        task,
                        this.resourceKey,
                        `${this.resourceKey}.tasks.[${i}].${task.task_key}`,
                        this,
                        this.data.id,
                        runMonitor
                    );
                }),
                this
            )
        );

        return children;
    }

    static getRoots(
        context: ExtensionContext,
        bundleRunStatusManager: BundleRunStatusManager,
        connectionManager: ConnectionManager,
        remoteStateConfig: BundleRemoteState
    ): BundleResourceExplorerTreeNode[] {
        const jobs = remoteStateConfig?.resources?.jobs;
        if (jobs === undefined) {
            return [];
        }

        return Object.keys(jobs).map((jobKey) => {
            return new JobTreeNode(
                context,
                bundleRunStatusManager,
                connectionManager,
                `jobs.${jobKey}`,
                jobs[jobKey],
                remoteStateConfig.__locations,
                undefined
            );
        });
    }
}
