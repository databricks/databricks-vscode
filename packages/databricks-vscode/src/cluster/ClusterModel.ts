/* eslint-disable @typescript-eslint/naming-convention */

import {Cluster, ClusterState} from "@databricks/databricks-sdk";
import {Disposable, Event, EventEmitter, TreeItem} from "vscode";
import {ConnectionManager} from "../configuration/ConnectionManager";

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
    private _clusters: Promise<Array<Cluster> | undefined> =
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

    public get roots(): Promise<Cluster[] | undefined> {
        if (this._dirty) {
            this._clusters = this.loadClusters();
            this._dirty = false;
        }

        return this.applyFilter(this._clusters);
    }

    private async loadClusters(): Promise<Array<Cluster> | undefined> {
        let apiClient = this.connectionManager.apiClient;

        if (!apiClient) {
            return;
        }

        let clusters = await Cluster.list(apiClient);

        return clusters
            .filter((c) => {
                return c.source !== "JOB";
            })
            .sort((a, b) => {
                let stateWeight: Record<ClusterState, number> = {
                    RUNNING: 10,
                    PENDING: 9,
                    RESTARTING: 8,
                    RESIZING: 7,
                    TERMINATING: 6,
                    TERMINATED: 5,
                    ERROR: 4,
                    UNKNOWN: 3,
                };

                return stateWeight[a.state] > stateWeight[b.state] ? -1 : 1;
            });
    }

    private async applyFilter(
        nodesPromise: Promise<Array<Cluster> | undefined>
    ): Promise<Array<Cluster> | undefined> {
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
