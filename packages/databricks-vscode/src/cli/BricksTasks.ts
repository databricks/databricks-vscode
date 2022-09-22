import {
    ProcessExecution,
    ProcessExecutionOptions,
    Task,
    TaskGroup,
    TaskProvider,
    TaskRevealKind,
    TaskScope,
    window,
    workspace,
} from "vscode";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {CliWrapper, Command} from "./CliWrapper";

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
            new LazySyncProcessExecution(connection, cli, syncType)
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

                    return {
                        cwd: workspacePath,
                    };
                },
            },
        });
    }

    getSyncCommand(): Command {
        if (SyncTask.killAll() || this.killThis) {
            this.killThis = true;
            return {
                args: [],
                command: "",
            };
        }
        if (this.command) {
            return this.command;
        }

        const me = this.connection.me;
        const syncDestination = this.connection.syncDestination;
        const profile = this.connection.profile;

        if (!me || !profile) {
            window.showErrorMessage(
                "Can't start sync: Databricks connection not configured!"
            );
            throw new Error(
                "Can't start sync: Databricks connection not configured!"
            );
        }
        if (!syncDestination) {
            window.showErrorMessage(
                "Can't start sync: Databricks synchronization destination not configured!"
            );
            throw new Error(
                "Can't start sync: Databricks synchronization destination not configured!"
            );
        }

        this.command = this.cli.getSyncCommand(
            profile,
            me,
            syncDestination,
            this.syncType
        );

        return this.command;
    }
}
