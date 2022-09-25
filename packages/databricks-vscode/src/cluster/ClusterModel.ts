/* eslint-disable @typescript-eslint/naming-convention */

import {
    Cluster,
    cluster,
    PermissionsService,
    Time,
    TimeUnits,
} from "@databricks/databricks-sdk";
import {Disposable, Event, EventEmitter} from "vscode";
import {ConnectionManager} from "../configuration/ConnectionManager";

export type ClusterFilter = "ALL" | "ME" | "RUNNING";

/**
 * Model to keep a list of clusters.
 *
 * We are using a pull model where clients listen to the change event and
 * then pull the data py reading the 'roots' property.
 */
class ClusterLoader implements Disposable {
    private _clusters: Map<string, Cluster> = new Map();
    public get clusters() {
        return this._clusters;
    }

    private running: Boolean = false;
    public refreshTime: Time;

    private _stopped: EventEmitter<void> = new EventEmitter<void>();
    private readonly onDidStop: Event<void> = this._stopped.event;

    private _onDidChange: EventEmitter<void> = new EventEmitter<void>();
    readonly onDidChange: Event<void> = this._onDidChange.event;

    private disposables: Disposable[] = [];

    constructor(
        private connectionManager: ConnectionManager,
        refreshTime: Time = new Time(5, TimeUnits.seconds)
    ) {
        this.refreshTime = refreshTime;
    }

    private async load() {
        let apiClient = this.connectionManager.apiClient;

        if (!apiClient) {
            return;
        }
        let clusters = (await Cluster.list(apiClient)).filter((c) =>
            ["UI", "API"].includes(c.source)
        );
        const permissionApi = new PermissionsService(apiClient);

        for (let c of clusters) {
            if (!this.running) {
                break;
            }

            const isValidSingleuser = () => {
                return (
                    c.details.data_security_mode === "SINGLE_USER" &&
                    c.details.single_user_name === this.connectionManager.me
                );
            };

            const hasPerm = async () => {
                const perms = await permissionApi.getObjectPermissions({
                    object_id: c.id,
                    object_type: "clusters",
                });
                return (
                    (perms.access_control_list ?? []).find((ac) => {
                        return (
                            ac.user_name === this.connectionManager.me ||
                            this.connectionManager.meDetails?.groups
                                ?.map((v) => v.display)
                                .includes(ac.group_name ?? "")
                        );
                    }) !== undefined
                );
            };

            const keepCluster = isValidSingleuser() || (await hasPerm());

            if (this._clusters.has(c.id) && !keepCluster) {
                this._clusters.delete(c.id);
                this._onDidChange.fire();
            }
            if (keepCluster) {
                this._clusters.set(c.id, c);
                this._onDidChange.fire();
            }
        }
        const clusterIds = clusters.map((c) => c.id);
        const toDelete = [];
        for (let key in this._clusters) {
            if (!clusterIds.includes(key)) {
                toDelete.push(key);
            }
        }
        toDelete.forEach((key) => this._clusters.delete(key));
        if (toDelete.length !== 0) {
            this._onDidChange.fire();
        }
    }

    async start() {
        this.running = true;
        while (this.running) {
            await this.load();
            if (!this.running) {
                break;
            }
            await new Promise((resolve) => {
                setTimeout(resolve, this.refreshTime.toMillSeconds().value);
            });
        }

        this._stopped.fire();
    }

    async stop() {
        if (!this.running) {
            return;
        }

        await new Promise((resolve) => {
            this.disposables.push(this.onDidStop(resolve));
            this.running = false;
        });
    }

    cleanup() {
        this._clusters.clear();
    }

    async restart(cleanup = false) {
        await this.stop();
        if (cleanup) {
            this.cleanup();
        }
        this.start();
    }

    dispose() {
        this.disposables.forEach((e) => e.dispose());
    }
}

export class ClusterModel implements Disposable {
    private _onDidChange: EventEmitter<void> = new EventEmitter<void>();
    readonly onDidChange: Event<void> = this._onDidChange.event;

    private _filter: ClusterFilter = "ALL";
    private disposables: Disposable[] = [];

    public readonly clusterLoader = new ClusterLoader(this.connectionManager);

    constructor(private connectionManager: ConnectionManager) {
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
            this.clusterLoader.onDidChange((e) => this._onDidChange.fire())
        );
    }

    refresh() {
        this.clusterLoader.restart();
    }

    set filter(filter: ClusterFilter) {
        this._filter = filter;
        this._onDidChange.fire();
    }

    public get roots(): Cluster[] | undefined {
        return this.applyFilter(
            Array.from(this.clusterLoader.clusters.values())
        )?.sort((a, b) => {
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

            return stateWeight[a.state] > stateWeight[b.state] ? -1 : 1;
        });
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
                    return node.creator === this.connectionManager.me;

                case "RUNNING":
                    return node.state === "RUNNING";
            }
        });
    }

    dispose() {
        this.disposables.forEach((e) => e.dispose());
    }
}
