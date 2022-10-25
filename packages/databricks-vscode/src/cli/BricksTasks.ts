import {
    CustomExecution,
    ProcessExecution,
    ProcessExecutionOptions,
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
import {
    ConnectionManager,
    SyncStatus,
} from "../configuration/ConnectionManager";
import {CliWrapper, Command} from "./CliWrapper";
import {ChildProcess, spawn} from "node:child_process";
import {vsCodeBadge} from "@vscode/webview-ui-toolkit";
import {json} from "stream/consumers";

export class BricksTaskProvider implements TaskProvider {
    constructor(
        private connection: ConnectionManager,
        private cli: CliWrapper
    ) {}

    provideTasks(): Task[] {
        return [new SyncTask(this.connection, this.cli, "incremental")];
    }
    resolveTask(): Task | undefined {
        return undefined;
    }
}

export class SyncTask extends Task {
    constructor(
        connection: ConnectionManager,
        cli: CliWrapper,
        // TODO: https://github.com/databricks/databricks-vscode/issues/111
        // use syncType to decide the sync type for bricks cli. Right now bricks cli
        // only supports full sync for multiple profiles.
        // see: https://github.com/databricks/bricks/issues/71
        syncType: "full" | "incremental"
    ) {
        super(
            {
                type: "databricks",
                task: "sync",
            },
            TaskScope.Workspace,
            "sync",
            "databricks",
            new CustomExecution(async (): Promise<Pseudoterminal> => {
                return new LazyCustomSyncTerminal(connection, cli, syncType);
            })
        );

        this.isBackground = true;
        this.detail = "$(rocket) Databricks sync";
        this.problemMatchers = ["$bricks-sync"];
        this.presentationOptions.echo = true;
        this.group = TaskGroup.Build;
        this.presentationOptions.reveal = TaskRevealKind.Silent;
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

    private filesBeingUploaded = new Set<string>();
    private filesBeingDeleted = new Set<string>();
    private syncProcess: ChildProcess | undefined;

    constructor(
        private cmd: string,
        private args: string[],
        private options: any,
        protected connection: ConnectionManager
    ) {}

    open(initialDimensions: TerminalDimensions | undefined): void {
        this.connection.syncStatus = "WATCHING_FOR_CHANGES";
        try {
            this.startSyncProcess();
        } catch (e) {
            // TODO: clean up the sync process and state (this.connection.syncStatus)
            window.showErrorMessage((e as Error).message);
        }
    }

    close(): void {
        this.syncProcess?.kill();
        this.connection.syncStatus = "INACTIVE";
    }

    // Assumes we recieve a single line of bricks logs
    // A value bricks action looks like this
    // const s1 = "Action: PUT: g, .gitignore, DELETE: f"
    // TODO: Add some unit tests for this
    // A hacky way to solve this, lets move to structed logs from bricks later
    private parseForActionsInitiated(line: string) {
        var indexOfAction = line.indexOf("Action:");
        // The log line is not relevant for actions
        if (indexOfAction === -1) {
            return;
        }

        const tokenizedLine = line.substring(indexOfAction).split(" ");
        var isPut = false;
        var isDelete = false;
        for (let i = 1; i < tokenizedLine.length; i++) {
            switch (tokenizedLine[i]) {
                case "PUT:": {
                    isPut = true;
                    isDelete = false;
                    break;
                }
                case "DELETE:": {
                    isDelete = true;
                    isPut = false;
                    break;
                }
                default: {
                    var filePath = tokenizedLine[i].replace(/,$/, "");
                    if (isPut) {
                        // trim the trailing , if it exists
                        this.filesBeingUploaded.add(filePath);
                    } else if (isDelete) {
                        this.filesBeingDeleted.add(filePath);
                    } else {
                        throw new Error(
                            "parsing bricks sync logs for actions: unexpected structure encounted"
                        );
                    }
                }
            }
        }
    }

    // We expect a single line of logs for all files being put/delete
    private parseForUploadCompleted(line: string) {
        var indexOfUploaded = line.indexOf("Uploaded");
        if (indexOfUploaded === -1) {
            return;
        }

        const tokenizedLine = line.substring(indexOfUploaded).split(" ");
        if (tokenizedLine.length !== 2) {
            throw new Error(
                "parsing bricks sync logs for actions: unexpected structure encounted"
            );
        }
        const filePath = tokenizedLine[1];
        if (!this.filesBeingUploaded.has(filePath)) {
            throw new Error(
                "parsing bricks sync logs for actions: Encounted upload completed " +
                    "action without corresponding upload initiated action for file: " +
                    filePath
            );
        }
        this.filesBeingUploaded.delete(filePath);
    }

    private parseForDeleteCompleted(line: string) {
        var indexOfDeleted = line.indexOf("Deleted");
        if (indexOfDeleted === -1) {
            return;
        }

        const tokenizedLine = line.substring(indexOfDeleted).split(" ");
        if (tokenizedLine.length !== 2) {
            throw new Error(
                "parsing bricks sync logs for actions: unexpected structure encounted"
            );
        }
        const filePath = tokenizedLine[1];
        if (!this.filesBeingUploaded.has(filePath)) {
            if (!this.filesBeingDeleted.has(filePath)) {
                throw new Error(
                    "parsing bricks sync logs for actions: Encounted delete completed " +
                        "action without corresponding delete initiated action for file: " +
                        filePath
                );
            }
            this.filesBeingDeleted.delete(filePath);
        }
    }

    // This function processes the stderr logs from bricks sync and parses it
    // to compute the sync state ie determine whether the remote files match
    // what we have stored locally.
    // TODO: Use structer logging to compute the sync state here
    private processBricksSyncLogs(data: any) {
        var logLines = data.toString().split("\n");
        for (let i = 0; i < logLines.length; i++) {
            this.parseForActionsInitiated(logLines[i]);
            this.parseForUploadCompleted(logLines[i]);
            this.parseForDeleteCompleted(logLines[i]);
            // this.writeEmitter.fire writes to the pseudoterminal for the
            // bricks sync process
            this.writeEmitter.fire(logLines[i].trim());
            this.writeEmitter.fire("\n\r");
        }
        if (
            this.filesBeingDeleted.size === 0 &&
            this.filesBeingUploaded.size === 0
        ) {
            this.connection.syncStatus = "WATCHING_FOR_CHANGES";
        } else {
            this.connection.syncStatus = "IN_PROGRESS";
        }
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

        // TODO: some versions of bricks print on stdout and some (the latest one)
        // prints logs to stderr. Fix that so all logs are printed to stdout
        this.syncProcess.stderr.on("data", (data) => {
            this.processBricksSyncLogs(data);
        });

        this.syncProcess.stdout.on("data", (data) => {
            this.processBricksSyncLogs(data);
        });
    }
}

class LazyCustomSyncTerminal extends CustomSyncTerminal {
    private command?: Command;
    private killThis: Boolean = false;

    constructor(
        connection: ConnectionManager,
        private cli: CliWrapper,
        private syncType: "full" | "incremental"
    ) {
        super("", [], {}, connection);

        // hacky way to override properties with getters
        Object.defineProperties(this, {
            cmd: {
                get: () => {
                    return this.getSyncCommand().command;
                    // return "echo";
                },
            },
            args: {
                get: () => {
                    return this.getSyncCommand().args;
                    // return ["doom_lol"];
                },
            },
            // Maybe define a type for the options here
            options: {
                get(): any {
                    const workspacePath = workspace.rootPath;
                    if (!workspacePath) {
                        window.showErrorMessage(
                            "Can't start sync: No workspace opened!"
                        );
                        throw new Error("!!!!!");
                    }

                    const profile = this.connection.profile;
                    if (!profile) {
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
                            DATABRICKS_CONFIG_PROFILE: profile,
                            /* eslint-enable @typescript-eslint/naming-convention */
                        },
                        stdio: "pipe",
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

        this.command = this.cli.getSyncCommand(syncDestination);

        return this.command;
    }
}

/**
 * Wrapper around the ProcessExecution class that lazily evaluates the process
 * and args properties. This is necessary because the process and args properties
 * re not known up front can only be computed dynamically at runtime.
 */
class LazySyncProcessExecution extends ProcessExecution {
    private command?: Command;
    private killThis: Boolean = false;

    constructor(
        private connection: ConnectionManager,
        private cli: CliWrapper,
        private syncType: "full" | "incremental"
    ) {
        super("", []);

        // hacky way to override properties with getters
        Object.defineProperties(this, {
            process: {
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
                get(): ProcessExecutionOptions {
                    const workspacePath = workspace.rootPath;
                    if (!workspacePath) {
                        window.showErrorMessage(
                            "Can't start sync: No workspace opened!"
                        );
                        throw new Error("!!!!!");
                    }

                    const profile = this.connection.profile;
                    if (!profile) {
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
                            DATABRICKS_CONFIG_PROFILE: profile,
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

        this.command = this.cli.getSyncCommand(syncDestination);

        return this.command;
    }
}
