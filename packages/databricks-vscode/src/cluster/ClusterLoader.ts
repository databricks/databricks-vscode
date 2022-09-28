/* eslint-disable @typescript-eslint/naming-convention */
import {
    Cluster,
    PermissionsService,
    Time,
    TimeUnits,
} from "@databricks/databricks-sdk";
import {Disposable, Event, EventEmitter} from "vscode";
import {ConnectionManager} from "../configuration/ConnectionManager";

export class ClusterLoader implements Disposable {
    private _clusters: Map<string, Cluster> = new Map();
    public get clusters() {
        return this._clusters;
    }

    private _running: Boolean = false;
    private set running(v: Boolean) {
        this._running = v;
    }
    get running() {
        return this._running;
    }

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

    private isValidSingleuser(c: Cluster) {
        return (
            c.details.data_security_mode === "SINGLE_USER" &&
            c.details.single_user_name === this.connectionManager.me
        );
    }

    private async hasPerm(c: Cluster, permissionApi: PermissionsService) {
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
    }

    private cleanupClustersMap(clusters: Cluster[]) {
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

    async _load() {
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
            const keepCluster =
                (c.details.data_security_mode !== "SINGLE_USER" ||
                    this.isValidSingleuser(c)) &&
                (await this.hasPerm(c, permissionApi));

            if (this._clusters.has(c.id) && !keepCluster) {
                this._clusters.delete(c.id);
                this._onDidChange.fire();
            }
            if (keepCluster) {
                this._clusters.set(c.id, c);
                this._onDidChange.fire();
            }
        }

        this.cleanupClustersMap(clusters);
    }

    async start() {
        if (this.running) {
            return;
        }
        this.running = true;
        while (this.running) {
            await this._load();
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

    /**
     * Restart loading clusters.
     * @param cleanup
     */
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
