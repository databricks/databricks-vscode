import {
    CustomExecution,
    Pseudoterminal,
    Task,
    TaskGroup,
    TaskProvider,
    TaskRevealKind,
    TaskScope,
    window,
    workspace,
    Event,
    EventEmitter,
    TerminalDimensions,
} from "vscode";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {CliWrapper, Command, SyncType} from "./CliWrapper";
import {ChildProcess, spawn, SpawnOptions} from "node:child_process";
import {SyncState} from "../sync/CodeSynchronizer";
import {BricksSyncParser} from "./BricksSyncParser";

export class BricksTaskProvider implements TaskProvider {
    constructor(
        private connection: ConnectionManager,
        private cli: CliWrapper
    ) {}

    provideTasks(): Task[] {
        return [
            new SyncTask(
                this.connection,
                this.cli,
                "full",
                (state: SyncState) => {}
            ),
            new SyncTask(
                this.connection,
                this.cli,
                "incremental",
                (state: SyncState) => {}
            ),
            new SyncTask(
                this.connection,
                this.cli,
                "full",
                (state: SyncState) => {}
            ),
        ];
    }
    resolveTask(): Task | undefined {
        return undefined;
    }
}

export class SyncTask extends Task {
    constructor(
        connection: ConnectionManager,
        cli: CliWrapper,
        syncType: SyncType,
        syncStateCallback: (state: SyncState) => void
    ) {
        super(
            {
                type: "databricks",
                task: syncType === "full" ? "sync-full" : "sync",
            },
            TaskScope.Workspace,
            syncType === "full" ? "sync-full" : "sync",
            "databricks",
            new CustomExecution(async (): Promise<Pseudoterminal> => {
                return new LazyCustomSyncTerminal(
                    connection,
                    cli,
                    syncType,
                    syncStateCallback
                );
            })
        );

        this.isBackground = true;
        //this.detail = "$(rocket) Databricks sync";
        this.problemMatchers = ["$bricks-sync"];
        this.presentationOptions.echo = true;
        this.group = TaskGroup.Build;
        this.presentationOptions.reveal = TaskRevealKind.Always;
    }

    static killAll() {
        let found: boolean = false;
        window.terminals.forEach((terminal) => {
            if (terminal.name === "sync") {
                found = true;
                terminal.dispose();
            }
        });
        return found;
    }
}

class CustomSyncTerminal implements Pseudoterminal {
    private writeEmitter = new EventEmitter<string>();
    onDidWrite: Event<string> = this.writeEmitter.event;

    private syncProcess: ChildProcess | undefined;
    private bricksSyncParser: BricksSyncParser;

    constructor(
        private cmd: string,
        private args: string[],
        private options: SpawnOptions,
        private syncStateCallback: (state: SyncState) => void
    ) {
        this.bricksSyncParser = new BricksSyncParser(
            syncStateCallback,
            this.writeEmitter
        );
    }

    open(initialDimensions: TerminalDimensions | undefined): void {
        this.syncStateCallback("IN_PROGRESS");
        try {
            this.startSyncProcess();
        } catch (e) {
            window.showErrorMessage((e as Error).message);
        }
    }

    close(): void {
        this.syncProcess?.kill();
        this.syncStateCallback("STOPPED");
    }

    private startSyncProcess() {
        this.syncProcess = spawn(this.cmd, this.args, {
            env: {...process.env, ...this.options.env},
            cwd: this.options?.cwd,
        });

        // Log the sync command being run, its args and any env overrides done by
        // vscode
        this.writeEmitter.fire(
            "[VSCODE] bricks cli path: " + this.cmd.toString()
        );
        this.writeEmitter.fire("\n\r");
        this.writeEmitter.fire(
            "[VSCODE] sync command args: " + this.args.toLocaleString()
        );
        this.writeEmitter.fire("\n\r");
        this.writeEmitter.fire(
            "[VSCODE] env vars: " + JSON.stringify(this.options.env)
        );
        this.writeEmitter.fire("\n\r");
        this.writeEmitter.fire(
            "--------------------------------------------------------"
        );
        this.writeEmitter.fire("\n\r");

        if (!this.syncProcess) {
            throw new Error(
                "Can't start sync: sync process initialization failed"
            );
        }

        if (!this.syncProcess.stderr) {
            throw new Error(
                "Can't start sync: can't pipe stderr of the sync process"
            );
        }

        if (!this.syncProcess.stdout) {
            throw new Error(
                "Can't start sync: can't pipe stdout of the sync process"
            );
        }

        this.syncProcess.stderr.on("data", (data) => {
            this.bricksSyncParser.process(data.toString());
        });

        // TODO(filed: Oct 2022): Old versions of bricks print the sync logs to stdout.
        // we can remove this pipe once we move to a new version of bricks cli
        this.syncProcess.stdout.on("data", (data) => {
            this.bricksSyncParser.process(data.toString());
        });
    }
}

/**
 * Wrapper around the CustomSyncTerminal class that lazily evaluates the process
 * and args properties. This is necessary because the process and args properties
 * re not known up front can only be computed dynamically at runtime.
 *
 * A Custom implmentation of the terminal is needed to run bricks sync as a CustomExecution
 * vscode task, which allows us to parse the stdout/stderr bricks sync logs and compute
 * sync completeness state based on the output logs
 */
class LazyCustomSyncTerminal extends CustomSyncTerminal {
    private command?: Command;
    private killThis: Boolean = false;

    constructor(
        private connection: ConnectionManager,
        private cli: CliWrapper,
        private syncType: SyncType,
        syncStateCallback: (state: SyncState) => void
    ) {
        super("", [], {}, syncStateCallback);

        // hacky way to override properties with getters
        Object.defineProperties(this, {
            cmd: {
                get: () => {
                    return this.getSyncCommand().command;
                },
            },
            args: {
                get: () => {
                    return this.getSyncCommand().args;
                },
            },
            options: {
                get(): SpawnOptions {
                    const workspacePath = workspace.rootPath;
                    if (!workspacePath) {
                        window.showErrorMessage(
                            "Can't start sync: No workspace opened!"
                        );
                        throw new Error(
                            "Can't start sync: No workspace opened!"
                        );
                    }

                    const dbWorkspace = this.connection.databricksWorkspace;
                    if (!dbWorkspace) {
                        window.showErrorMessage(
                            "Can't start sync: Databricks connection not configured!"
                        );
                        throw new Error(
                            "Can't start sync: Databricks connection not configured!"
                        );
                    }

                    return {
                        cwd: workspacePath,
                        env: {
                            /* eslint-disable @typescript-eslint/naming-convention */
                            BRICKS_ROOT: workspacePath,
                            DATABRICKS_CONFIG_PROFILE: dbWorkspace.profile,
                            /* eslint-enable @typescript-eslint/naming-convention */
                        },
                    };
                },
            },
        });
    }

    getSyncCommand(): Command {
        if (
            this.connection.state !== "CONNECTED" &&
            (SyncTask.killAll() || this.killThis)
        ) {
            this.killThis = true;
            return {
                args: [],
                command: "",
            };
        }
        if (this.command) {
            return this.command;
        }
        const syncDestination = this.connection.syncDestination;

        if (!syncDestination) {
            window.showErrorMessage(
                "Can't start sync: Databricks synchronization destination not configured!"
            );
            throw new Error(
                "Can't start sync: Databricks synchronization destination not configured!"
            );
        }

        this.command = this.cli.getSyncCommand(syncDestination, this.syncType);

        return this.command;
    }
}
