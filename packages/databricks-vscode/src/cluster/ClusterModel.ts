import {ClustersApi, ClusterState} from "@databricks/databricks-sdk";
import {Disposable, Event, EventEmitter, TreeItem} from "vscode";
import {ConnectionManager} from "../configuration/ConnectionManager";

export interface ClusterNode {
    id: string;
    name: string;
    memoryMb: number;
    cores: number;
    sparkVersion: string;
    creator: string;
    state: ClusterState;
    stateMessage: string;
}

export type ClusterFilter = "ALL" | "ME" | "RUNNING";

/**
 * Model to keep a list of clusters.
 *
 * We are using a pull model where clients listen to the change event and
 * then pull the data py reading the 'roots' property.
 */
export class ClusterModel implements Disposable {
    private _onDidChange: EventEmitter<void> = new EventEmitter<void>();
    readonly onDidChange: Event<void> = this._onDidChange.event;

    private disposables: Array<Disposable>;
    private _filter: ClusterFilter = "ALL";
    private _clusters: Promise<Array<ClusterNode> | undefined> =
        Promise.resolve(undefined);
    private _dirty = true;

    constructor(private connectionManager: ConnectionManager) {
        this.disposables = [
            connectionManager.onChangeState(this.refresh, this),
        ];
    }

    set filter(filter: ClusterFilter) {
        this._filter = filter;
        this._onDidChange.fire();
    }

    dispose() {
        this.disposables.forEach((d) => d.dispose());
    }

    public refresh() {
        this._dirty = true;
        this._onDidChange.fire();
    }

    public get roots(): Promise<ClusterNode[] | undefined> {
        if (this._dirty) {
            this._clusters = this.loadClusters();
            this._dirty = false;
        }

        return this.applyFilter(this._clusters);
    }

    private async loadClusters(): Promise<Array<ClusterNode> | undefined> {
        let apiClient = this.connectionManager.apiClient;

        if (!apiClient) {
            return;
        }

        let clusterService = new ClustersApi(apiClient);
        let clusters = await clusterService.list({});

        return clusters.clusters.map((c) => {
            return {
                name: c.cluster_name,
                id: c.cluster_id,
                memoryMb: c.cluster_memory_mb,
                cores: c.cluster_cores,
                sparkVersion: c.spark_version,
                creator: c.creator_user_name,
                state: c.state,
                stateMessage: c.state_message,
            };
        });
    }

    private async applyFilter(
        nodesPromise: Promise<Array<ClusterNode> | undefined>
    ): Promise<Array<ClusterNode> | undefined> {
        const nodes = await nodesPromise;

        if (!nodes) {
            return nodes;
        }

        return nodes.filter((node) => {
            switch (this._filter) {
                case "ALL":
                    return true;

                case "ME":
                    return node.creator === this.connectionManager.me;

                case "RUNNING":
                    return node.state === "RUNNING";
            }
        });
    }
}
