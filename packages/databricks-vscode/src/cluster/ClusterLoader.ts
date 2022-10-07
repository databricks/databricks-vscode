/* eslint-disable @typescript-eslint/naming-convention */
import {
    Cluster,
    PermissionsService,
    Time,
    TimeUnits,
} from "@databricks/databricks-sdk";
import {ClusterInfoState} from "@databricks/databricks-sdk/dist/apis/clusters";
import {Disposable, Event, EventEmitter} from "vscode";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {sortClusters} from "./ClusterModel";

export class ClusterLoader implements Disposable {
    private _clusters: Map<string, Cluster> = new Map();
    public get clusters() {
        return this._clusters;
    }

    /*
     * We have 2 flags. Stopped and Running.
     * Stopped | Running | Explaination
     *   T         T       Should never happen
     *   T         F       There is no loading task running
     *   F         T       There is 1 loading task running
     *   F         F       The loading task is trying to stop (waiting for any remaing calls to finish)
     */
    private _stopped = true;
    private set stopped(v: boolean) {
        this._stopped = v;
    }
    get stopped() {
        return this._stopped;
    }
    private _running: Boolean = false;
    private set running(v: Boolean) {
        this._running = v;
    }
    get running() {
        return this._running;
    }

    public refreshTime: Time;

    private _onDidStop: EventEmitter<void> = new EventEmitter<void>();
    private readonly onDidStop: Event<void> = this._onDidStop.event;

    private _onDidChange: EventEmitter<void> = new EventEmitter<void>();
    readonly onDidChange: Event<void> = this._onDidChange.event;

    private disposables: Disposable[] = [];

    constructor(
        private connectionManager: ConnectionManager,
        refreshTime: Time = new Time(5, TimeUnits.seconds)
    ) {
        this.refreshTime = refreshTime;
        this.disposables.push(this.onDidStop(() => (this.stopped = true)));
    }

    private isValidSingleUser(c: Cluster) {
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
            this.cleanup();
            return;
        }
        let allClusters = sortClusters(
            (await Cluster.list(apiClient)).filter((c) =>
                ["UI", "API"].includes(c.source)
            )
        );

        const permissionApi = new PermissionsService(apiClient);

        // TODO: Find exact rate limit and update this.
        //       Rate limit is 100 on dogfood.
        for (let i = 0; i < allClusters.length; i += 50) {
            const runningMiniTasks: Promise<void>[] = [];
            let clusters = allClusters.splice(i, i + 50);

            for (let c of clusters) {
                if (!this.running) {
                    break;
                }
                runningMiniTasks.push(
                    new Promise((resolve) => {
                        this.hasPerm(c, permissionApi)
                            .then((hasPerm) => {
                                if (!this.running) {
                                    return resolve();
                                }
                                const keepCluster =
                                    (c.details.data_security_mode !==
                                        "SINGLE_USER" ||
                                        this.isValidSingleUser(c)) &&
                                    hasPerm;

                                if (this._clusters.has(c.id) && !keepCluster) {
                                    this._clusters.delete(c.id);
                                    this._onDidChange.fire();
                                }
                                if (keepCluster) {
                                    this._clusters.set(c.id, c);
                                    this._onDidChange.fire();
                                }
                                resolve();
                            })
                            .catch(resolve);
                    })
                );
            }
            for (let task of runningMiniTasks) {
                await task;
            }
            await new Promise((resolve) => setTimeout(resolve, 2000));
        }

        this.cleanupClustersMap(allClusters);
    }

    async start() {
        if (this.running) {
            return;
        }
        this.running = true;
        this.stopped = false;
        while (this.running) {
            await this._load();
            if (!this.running) {
                break;
            }
            await new Promise((resolve) => {
                setTimeout(resolve, this.refreshTime.toMillSeconds().value);
            });
        }

        this._onDidStop.fire();
    }

    async stop() {
        if (this.stopped) {
            return;
        }

        this.running = false;
        await new Promise((resolve) => {
            this.disposables.push(this.onDidStop(resolve));
        });
    }

    cleanup() {
        this._clusters.clear();
        this._onDidChange.fire();
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
