/* eslint-disable @typescript-eslint/naming-convention */

import {Disposable, Event, EventEmitter} from "vscode";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {ClusterDetails} from "@databricks/databricks-sdk/dist/apis/compute";

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

    constructor(private connectionManager: ConnectionManager) {}

    public clusters: ClusterDetails[] = [
        {
            cluster_name: "cluster-name-1",
            cluster_id: "cluster-id-1",
            state: "RUNNING",
            creator_user_name: "user-1",
        },
        {
            cluster_name: "cluster-name-2",
            cluster_id: "cluster-id-2",
            state: "TERMINATED",
            creator_user_name: "user-2",
        },
    ];
    getClusterDetails(clusterId: string) {
        return this.clusters.find((e) => e.cluster_id === clusterId);
    }

    dispose() {
        this.disposables.forEach((e) => e.dispose());
    }
}
