import {Disposable, Event, EventEmitter, TaskExecution, tasks} from "vscode";
import {SyncTask} from "../cli/BricksTasks";
import {CliWrapper} from "../cli/CliWrapper";
import {ConnectionManager} from "../configuration/ConnectionManager";

type SyncState = "RUNNING" | "STOPPED" | "ERROR";

export class CodeSynchronizer implements Disposable {
    private _onDidChangeStateEmitter: EventEmitter<SyncState> =
        new EventEmitter<SyncState>();
    readonly onDidChangeState: Event<SyncState> =
        this._onDidChangeStateEmitter.event;

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
        return this.currentTaskExecution ? "RUNNING" : "STOPPED";
    }

    async start(syncType: "full" | "incremental") {
        let task = new SyncTask(this.connection, this.cli, syncType);
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
}
