import {TreeItemCollapsibleState, ExtensionContext} from "vscode";
import {BundleRemoteState} from "../../bundle/models/BundleRemoteStateModel";
import {
    BundleResourceExplorerResource,
    BundleResourceExplorerTreeItem,
    BundleResourceExplorerTreeNode,
} from "./types";
import {BundleRunStatusManager} from "../../bundle/run/BundleRunStatusManager";
import {ContextUtils, DecorationUtils} from "./utils";
import {ConnectionManager} from "../../configuration/ConnectionManager";
import {JobRunStatusTreeNode} from "./JobRunStatusTreeNode";
import {JobRunStatus} from "../../bundle/run/JobRunStatus";
import {TaskTreeNode} from "./TaskTreeNode";
import {TaskHeaderTreeNode} from "./TaskHeaderTreeNode";

export class JobTreeNode implements BundleResourceExplorerTreeNode {
    readonly type = "jobs";
    get url(): string | undefined {
        const host = this.connectionManager.databricksWorkspace?.host;

        if (host === undefined) {
            return undefined;
        }

        return `${host.toString()}jobs/${this.data.id}`;
    }

    constructor(
        private readonly context: ExtensionContext,
        private readonly bundleRunStatusManager: BundleRunStatusManager,
        private readonly connectionManager: ConnectionManager,
        public readonly resourceKey: string,
        public readonly data: BundleResourceExplorerResource<"jobs">,
        public parent?: BundleResourceExplorerTreeNode
    ) {}

    isRunning(resourceKey: string) {
        const runner = this.bundleRunStatusManager.runStatuses.get(resourceKey);
        return runner?.runState === "running";
    }

    getTreeItem(): BundleResourceExplorerTreeItem {
        const isRunning = this.isRunning(this.resourceKey);

        return {
            label: this.data.name,
            contextValue: ContextUtils.getContextString({
                resourceType: this.type,
                running: isRunning,
                hasUrl: this.url !== undefined,
                nodeType: this.type,
            }),
            resourceUri: DecorationUtils.getModifiedStatusDecoration(
                this.resourceKey,
                this.data.modified_status
            ),
            collapsibleState: isRunning
                ? TreeItemCollapsibleState.Collapsed
                : TreeItemCollapsibleState.Expanded,
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

        if (runMonitor?.runId !== undefined) {
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
                undefined
            );
        });
    }
}
