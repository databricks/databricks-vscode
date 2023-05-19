import {Disposable, Event, EventEmitter, TaskExecution, tasks} from "vscode";
import {SyncTask, TASK_SYNC_TYPE} from "../cli/SyncTasks";
import {CliWrapper} from "../cli/CliWrapper";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {PackageMetaData} from "../utils/packageJsonUtils";

export type SyncState =
    | "IN_PROGRESS"
    | "WATCHING_FOR_CHANGES"
    | "STOPPED"
    | "FILES_IN_REPOS_DISABLED"
    | "FILES_IN_WORKSPACE_DISABLED"
    | "ERROR";

export class CodeSynchronizer implements Disposable {
    private _onDidChangeStateEmitter: EventEmitter<SyncState> =
        new EventEmitter<SyncState>();
    readonly onDidChangeState: Event<SyncState> =
        this._onDidChangeStateEmitter.event;

    // This state is updated from inside the SyncTask based on logs recieved from
    // databricks sync stderr. Closing the SyncTask transitions the state back to
    // stopped
    private _state: SyncState = "STOPPED";

    disposables: Array<Disposable> = [];
    currentTaskExecution?: TaskExecution;

    constructor(
        private connection: ConnectionManager,
        private cli: CliWrapper,
        private packageMetadata: PackageMetaData
    ) {
        this.disposables.push(
            this.connection.onDidChangeState(() => {
                this.stop();
            }),
            this.connection.onDidChangeSyncDestination(() => {
                this.stop();
            }),
            tasks.onDidStartTask((e) => {
                const {type, task} = e.execution.task.definition;
                if (
                    type === "databricks" &&
                    Object.values(TASK_SYNC_TYPE).includes(task)
                ) {
                    this.currentTaskExecution = e.execution;
                    this._onDidChangeStateEmitter.fire(this.state);
                }
            }),
            tasks.onDidEndTask((e) => {
                const {type, task} = e.execution.task.definition;
                if (
                    type === "databricks" &&
                    Object.values(TASK_SYNC_TYPE).includes(task)
                ) {
                    this.currentTaskExecution = undefined;
                    this._onDidChangeStateEmitter.fire(this.state);
                }
            })
        );
    }

    get state(): SyncState {
        return this._state;
    }

    async start(syncType: "full" | "incremental") {
        this._state = "IN_PROGRESS";
        this._onDidChangeStateEmitter.fire(this._state);
        const task = new SyncTask(
            this.connection,
            this.cli,
            syncType,
            this.packageMetadata,
            (state: SyncState) => {
                this._state = state;
                this._onDidChangeStateEmitter.fire(state);
                if (
                    [
                        "ERROR",
                        "FILES_IN_REPOS_DISABLED",
                        "FILES_IN_WORKSPACE_DISABLED",
                    ].includes(state)
                ) {
                    this.stop();
                }
            }
        );
        await tasks.executeTask(task);
    }

    stop() {
        if (this.currentTaskExecution) {
            this.currentTaskExecution.terminate();
        }
    }

    dispose() {
        this.stop();
        this.disposables.forEach((d) => d.dispose());
    }

    // This function waits for sync to reach WATCHING_FOR_CHANGES which is a
    // necessary condition to execute local code on databricks. This state denotes
    // all local changes have been synced to remote workspace
    async waitForSyncComplete(): Promise<void> {
        if (this._state !== "WATCHING_FOR_CHANGES") {
            return await new Promise((resolve) => {
                const changeListener = this.onDidChangeState(() => {
                    if (
                        [
                            "WATCHING_FOR_CHANGES",
                            "FILES_IN_REPOS_DISABLED",
                            "FILES_IN_WORKSPACE_DISABLED",
                            "ERROR",
                        ].includes(this.state)
                    ) {
                        changeListener.dispose();
                        resolve();
                    }
                }, this);

                this.disposables.push(changeListener);
            });
        }
    }
}
