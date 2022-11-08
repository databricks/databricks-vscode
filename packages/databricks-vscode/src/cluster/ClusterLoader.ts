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
import {workspaceConfigs} from "../WorkspaceConfigs";
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

    private cleanupClustersMap(clusters: Cluster[]) {
        const clusterIds = clusters.map((c) => c.id);
        const toDelete = [];
        for (let key of this._clusters.keys()) {
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
                    (c) =>
                        !workspaceConfigs.clusterFilteringEnabled ||
                        !c.isSingleUser() ||
                        c.isValidSingleUser(
                            this.connectionManager.databricksWorkspace?.userName
                        )
                )
                .filter(
                    (c) =>
                        !workspaceConfigs.clusterFilteringEnabled ||
                        this.connectionManager.databricksWorkspace?.supportFilesInReposForCluster(
                            c
                        )
                )
        );

        if (workspaceConfigs.clusterFilteringEnabled) {
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
                    c.hasExecutePerms(
                        this.connectionManager.databricksWorkspace?.user
                    )
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
                        .catch((e) => {
                            NamedLogger.getOrCreate("Extension").error(
                                `Error fetching permission for cluster ${c.name}`,
                                e
                            );
                            resolve();
                        });
                });

                wip.push(task);
                task.then(() => {
                    wip.splice(wip.indexOf(task), 1);
                });
            }

            await Promise.allSettled(wip);
        } else {
            this._clusters = new Map(allClusters.map((c) => [c.id, c]));
            this._onDidChange.fire();
        }

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
                NamedLogger.getOrCreate("Extension").error(
                    "Error loading clusters",
                    e
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
