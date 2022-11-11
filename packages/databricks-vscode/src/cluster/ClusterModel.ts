/* eslint-disable @typescript-eslint/naming-convention */

import {Cluster, cluster} from "@databricks/databricks-sdk";
import {Disposable, Event, EventEmitter} from "vscode";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {ClusterLoader} from "./ClusterLoader";

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

    private _filter: ClusterFilter = "ALL";
    private disposables: Disposable[] = [];

    private clusterLoader: ClusterLoader;

    constructor(
        private connectionManager: ConnectionManager,
        clusterLoader?: ClusterLoader
    ) {
        this.clusterLoader =
            clusterLoader ??
            (() => {
                return new ClusterLoader(this.connectionManager);
            })();
        this.disposables.push(
            connectionManager.onDidChangeState(async (e) => {
                switch (e) {
                    case "CONNECTED":
                        await this.clusterLoader.restart(true);
                        break;
                    case "DISCONNECTED":
                        await this.clusterLoader.stop();
                        this.clusterLoader.cleanup();
                        break;
                }
            }),
            this.clusterLoader,
            this.clusterLoader.onDidChange(() => this._onDidChange.fire())
        );
        this.clusterLoader.start();
    }

    refresh() {
        this.clusterLoader.restart();
    }

    set filter(filter: ClusterFilter) {
        this._filter = filter;
        this._onDidChange.fire();
    }

    public get roots(): Cluster[] | undefined {
        return sortClusters(
            this.applyFilter(
                Array.from(this.clusterLoader.clusters.values())
            ) ?? []
        );
    }

    private applyFilter(nodes: Cluster[] | undefined): Cluster[] | undefined {
        if (!nodes) {
            return nodes;
        }

        return nodes.filter((node) => {
            switch (this._filter) {
                case "ALL":
                    return true;

                case "ME":
                    return (
                        node.creator ===
                        this.connectionManager.databricksWorkspace?.userName
                    );

                case "RUNNING":
                    return node.state === "RUNNING";
            }
        });
    }

    dispose() {
        this.disposables.forEach((e) => e.dispose());
    }
}

export function sortClusters(clusters: Cluster[]) {
    return clusters.sort((a, b) => {
        // Sort by descending state priority
        const stateWeight: Record<cluster.ClusterInfoState, number> = {
            RUNNING: 10,
            PENDING: 9,
            RESTARTING: 8,
            RESIZING: 7,
            TERMINATING: 6,
            TERMINATED: 5,
            ERROR: 4,
            UNKNOWN: 3,
        };

        return stateWeight[a.state] > stateWeight[b.state] ||
            (stateWeight[a.state] === stateWeight[b.state] && a.name < b.name)
            ? -1
            : 1;
    });
}
