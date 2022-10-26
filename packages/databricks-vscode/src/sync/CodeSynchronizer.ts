import {stat} from "fs";
import {Disposable, Event, EventEmitter, TaskExecution, tasks} from "vscode";
import {SyncTask} from "../cli/BricksTasks";
import {CliWrapper} from "../cli/CliWrapper";
import {ConnectionManager} from "../configuration/ConnectionManager";

export type SyncState =
    | "IN_PROGRESS"
    | "WATCHING_FOR_CHANGES"
    | "STOPPED"
    | "ERROR";

export class CodeSynchronizer implements Disposable {
    private _onDidChangeStateEmitter: EventEmitter<SyncState> =
        new EventEmitter<SyncState>();
    readonly onDidChangeState: Event<SyncState> =
        this._onDidChangeStateEmitter.event;

    // This state is updated from inside the SyncTask based on logs recieved from
    // bricks sync stderr. Closing the SyncTask transitions the state back to
    // stopped
    private _state: SyncState = "STOPPED";

    disposables: Array<Disposable> = [];
    currentTaskExecution?: TaskExecution;

    constructor(
        private connection: ConnectionManager,
        private cli: CliWrapper
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
                if (type === "databricks" && task === "sync") {
                    this.currentTaskExecution = e.execution;
                    this._onDidChangeStateEmitter.fire(this.state);
                }
            }),
            tasks.onDidEndTask((e) => {
                const {type, task} = e.execution.task.definition;
                if (type === "databricks" && task === "sync") {
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
        let task = new SyncTask(
            this.connection,
            this.cli,
            syncType,
            (state: SyncState) => {
                this._state = state;
                this._onDidChangeStateEmitter.fire(state);
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

    // This function waits for an in-flight sync to reach a terminal state
    async waitForSyncComplete(): Promise<void> {
        if (this._state !== "WATCHING_FOR_CHANGES") {
            return await new Promise((resolve) => {
                const changeListener = this.onDidChangeState(
                    (state: SyncState) => {
                        if (this._state === "WATCHING_FOR_CHANGES") {
                            changeListener.dispose();
                            resolve();
                        }
                    },
                    this
                );
            });
        }
    }
}
