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
import {ConnectionManager} from "../configuration/ConnectionManager";
import {CliWrapper, Command} from "./CliWrapper";
import {ChildProcess, spawn} from "node:child_process";

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

export class BricksSyncParser {
    private filesBeingUploaded = new Set<string>();
    private filesBeingDeleted = new Set<string>();

    constructor(
        private connection: ConnectionManager,
        private writeEmitter: EventEmitter<string>
    ) {}

    // Assumes we recieve a single line of bricks logs
    // A value bricks action looks like this
    // const s1 = "Action: PUT: g, .gitignore, DELETE: f"
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
                            "[BricksSyncParser] unexpected logs recieved"
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
            throw new Error("[BricksSyncParser] unexpected logs recieved");
        }
        const filePath = tokenizedLine[1];
        if (!this.filesBeingUploaded.has(filePath)) {
            throw new Error(
                "[BricksSyncParser] untracked file uploaded. All upload complete " +
                    "logs should be preceded with a uploaded initialted log. file: " +
                    filePath +
                    ". log recieved: `" +
                    line +
                    "`"
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
            throw new Error("[BricksSyncParser] unexpected logs recieved");
        }
        const filePath = tokenizedLine[1];
        if (!this.filesBeingUploaded.has(filePath)) {
            if (!this.filesBeingDeleted.has(filePath)) {
                throw new Error(
                    "[BricksSyncParser] untracked file deleted. All delete complete " +
                        "logs should be preceded with a delete initialted log. file: " +
                        filePath +
                        ". log recieved: `" +
                        line +
                        "`"
                );
            }
            this.filesBeingDeleted.delete(filePath);
        }
    }

    // This function processes the stderr logs from bricks sync and parses it
    // to compute the sync state ie determine whether the remote files match
    // what we have stored locally.
    // TODO: Use structed logging to compute the sync state here
    public process(data: any) {
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
}

class CustomSyncTerminal implements Pseudoterminal {
    private writeEmitter = new EventEmitter<string>();
    onDidWrite: Event<string> = this.writeEmitter.event;

    private syncProcess: ChildProcess | undefined;
    private bricksSyncParser: BricksSyncParser;

    constructor(
        private cmd: string,
        private args: string[],
        private options: any,
        protected connection: ConnectionManager
    ) {
        this.bricksSyncParser = new BricksSyncParser(
            connection,
            this.writeEmitter
        );
    }

    open(initialDimensions: TerminalDimensions | undefined): void {
        this.connection.syncStatus = "WATCHING_FOR_CHANGES";
        try {
            this.startSyncProcess();
        } catch (e) {
            window.showErrorMessage((e as Error).message);
        }
    }

    close(): void {
        this.syncProcess?.kill();
        this.connection.syncStatus = "INACTIVE";
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
            this.bricksSyncParser.process(data);
        });

        // TODO(filed: Oct 2022): Old versions of bricks print the sync logs to stdout.
        // we can remove this pipe once we move to a new version of bricks cli
        this.syncProcess.stdout.on("data", (data) => {
            this.bricksSyncParser.process(data);
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
