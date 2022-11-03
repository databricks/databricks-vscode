/* eslint-disable @typescript-eslint/naming-convention */
import {
    Cluster,
    PermissionsService,
    Time,
    TimeUnits,
} from "@databricks/databricks-sdk";
import {NamedLogger} from "@databricks/databricks-sdk/dist/logging";
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

    private _onStopRequested: EventEmitter<void> = new EventEmitter<void>();
    private readonly onStopRequested: Event<void> = this._onStopRequested.event;

    private _onDidChange: EventEmitter<void> = new EventEmitter<void>();
    readonly onDidChange: Event<void> = this._onDidChange.event;

    private disposables: Disposable[] = [];

    constructor(
        private connectionManager: ConnectionManager,
        refreshTime: Time = new Time(10, TimeUnits.minutes)
    ) {
        this.refreshTime = refreshTime;
        this.disposables.push(this.onDidStop(() => (this.stopped = true)));
    }

    private isSingleUser(c: Cluster) {
        const modeProperty =
            //TODO: deprecate data_security_mode once access_mode is available everywhere
            c.details.access_mode ?? c.details.data_security_mode;
        return (
            modeProperty !== undefined &&
            [
                "SINGLE_USER",
                "LEGACY_SINGLE_USER_PASSTHROUGH",
                "LEGACY_SINGLE_USER_STANDARD",
                //enums unique to data_security_mode
                "LEGACY_SINGLE_USER",
            ].includes(modeProperty)
        );
    }
    private isValidSingleUser(c: Cluster) {
        return (
            this.isSingleUser(c) &&
            c.details.single_user_name ===
                this.connectionManager.databricksWorkspace?.userName
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
                    ac.user_name ===
                        this.connectionManager.databricksWorkspace?.userName ||
                    this.connectionManager.databricksWorkspace?.user.groups
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
            (await Cluster.list(apiClient))
                .filter((c) => ["UI", "API"].includes(c.source))
                .filter(
                    (c) => !this.isSingleUser(c) || this.isValidSingleUser(c)
                )
                .filter((c) =>
                    this.connectionManager.databricksWorkspace?.supportFilesInReposForCluster(
                        c
                    )
                )
        );

        const permissionApi = new PermissionsService(apiClient);

        // TODO: Find exact rate limit and update this.
        //       Rate limit is 100 on dogfood.
        const maxConcurrent = 50;
        const wip: Promise<void>[] = [];

        for (let c of allClusters) {
            if (!this.running) {
                break;
            }
            while (wip.length === maxConcurrent) {
                await Promise.race(wip);
            }

            const task = new Promise<void>((resolve) => {
                this.hasPerm(c, permissionApi)
                    .then((keepCluster) => {
                        if (!this.running) {
                            return resolve();
                        }

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
            });

            wip.push(task);
            task.then(() => {
                wip.splice(wip.indexOf(task), 1);
            });
        }

        await Promise.allSettled(wip);
        this.cleanupClustersMap(allClusters);
    }

    async start() {
        if (this.running) {
            return;
        }
        this._running = true;
        this._stopped = false;
        while (this.running) {
            try {
                await this._load();
            } catch (e) {
                let err = e;

                /*
                Standard Error class has message and stack fields set as non enumerable.
                To correctly account for all such fields, we iterate over all own-properties of
                the error object and accumulate them as enumerable fields in the final err object.
                */
                if (Object(err) === err) {
                    err = {
                        ...Object.getOwnPropertyNames(err).reduce((acc, i) => {
                            acc[i] = (err as any)[i];
                            return acc;
                        }, {} as any),
                        ...(err as any),
                    };
                }
                NamedLogger.getOrCreate("Extension").log(
                    "error",
                    "Error loading clusters:",
                    err
                );
            }
            if (!this.running) {
                break;
            }
            await new Promise<void>((resolve) => {
                const timer = setTimeout(
                    resolve,
                    this.refreshTime.toMillSeconds().value
                );
                this.disposables.push(
                    this.onStopRequested(() => {
                        clearInterval(timer);
                        resolve();
                    })
                );
            });
        }

        this._onDidStop.fire();
    }

    async stop() {
        if (this.stopped) {
            return;
        }

        this.running = false;
        this._onStopRequested.fire();
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
