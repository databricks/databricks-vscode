import {
    CustomExecution,
    Pseudoterminal,
    Task,
    TaskGroup,
    TaskRevealKind,
    TaskScope,
    window,
    Event,
    EventEmitter,
} from "vscode";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {CliWrapper, Command, SyncType} from "./CliWrapper";
import {ChildProcess, spawn, SpawnOptions} from "node:child_process";
import {SyncState} from "../sync/CodeSynchronizer";
import {BricksSyncParser} from "./BricksSyncParser";
import {withLogContext} from "@databricks/databricks-sdk/dist/logging";
import {Loggers} from "../logger";
import {Context, context} from "@databricks/databricks-sdk/dist/context";

export const TaskSyncType = {
    syncFull: "sync-full",
    sync: "sync",
} as const;
type TaskSyncType = (typeof TaskSyncType)[keyof typeof TaskSyncType];

const cliToTaskSyncType = new Map<SyncType, TaskSyncType>([
    ["full", TaskSyncType.syncFull],
    ["incremental", TaskSyncType.sync],
]);

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
                task: cliToTaskSyncType.get(syncType) ?? "sync",
            },
            TaskScope.Workspace,
            cliToTaskSyncType.get(syncType) ?? "sync",
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
        this.detail = "$(rocket) Databricks sync";
        this.problemMatchers = ["$bricks-sync"];
        this.presentationOptions.echo = true;
        this.group = TaskGroup.Build;
        this.presentationOptions.reveal = TaskRevealKind.Always;
    }

    static killAll() {
        window.terminals.forEach((terminal) => {
            if (
                Object.values(TaskSyncType)
                    .map((e) => e as string)
                    .includes(terminal.name)
            ) {
                terminal.dispose();
            }
        });
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

    open(): void {
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
            ...this.options,
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
export class LazyCustomSyncTerminal extends CustomSyncTerminal {
    private command?: Command;
    private killThis = false;

    constructor(
        private connection: ConnectionManager,
        private cli: CliWrapper,
        private syncType: SyncType,
        syncStateCallback: (state: SyncState) => void
    ) {
        super("", [], {}, syncStateCallback);

        const ctx: Context = new Context({
            rootClassName: "LazyCustomSyncTerminal",
            rootFnName: "constructor",
        });

        // hacky way to override properties with getters
        Object.defineProperties(this, {
            cmd: {
                get: () => {
                    return this.getSyncCommand(ctx).command;
                },
            },
            args: {
                get: () => {
                    return this.getSyncCommand(ctx).args;
                },
            },
            options: {
                get: () => {
                    return this.getProcessOptions(ctx);
                },
            },
        });
    }

    @withLogContext(Loggers.Extension)
    showErrorAndKillThis(msg: string, @context ctx?: Context) {
        ctx?.logger?.error(msg);
        window.showErrorMessage(msg);
        SyncTask.killAll();
        return new Error(msg);
    }

    @withLogContext(Loggers.Extension)
    getProcessOptions(@context ctx?: Context): SpawnOptions {
        const workspacePath =
            this.connection.syncDestination?.vscodeWorkspacePath.fsPath;
        if (!workspacePath) {
            throw this.showErrorAndKillThis(
                "Can't start sync: No workspace opened!",
                ctx
            );
        }

        const dbWorkspace = this.connection.databricksWorkspace;
        if (!dbWorkspace) {
            throw this.showErrorAndKillThis(
                "Can't start sync: Databricks connection not configured!",
                ctx
            );
        }

        // Pass through proxy settings to child process.
        const proxySettings: {[key: string]: string | undefined} = {
            /* eslint-disable @typescript-eslint/naming-convention */
            HTTP_PROXY: process.env.HTTP_PROXY,
            HTTPS_PROXY: process.env.HTTPS_PROXY,
            /* eslint-enable @typescript-eslint/naming-convention */
        };

        // Remove undefined keys.
        Object.keys(proxySettings).forEach((key) => {
            if (proxySettings[key] === undefined) {
                delete proxySettings[key];
            }
        });

        return {
            cwd: workspacePath,
            env: {
                /* eslint-disable @typescript-eslint/naming-convention */
                BRICKS_ROOT: workspacePath,
                DATABRICKS_CONFIG_FILE: process.env.DATABRICKS_CONFIG_FILE,
                HOME: process.env.HOME,
                PATH: process.env.PATH,
                ...proxySettings,
                ...dbWorkspace.authProvider.getEnvVars(),
                /* eslint-enable @typescript-eslint/naming-convention */
            },
        } as SpawnOptions;
    }

    @withLogContext(Loggers.Extension)
    getSyncCommand(@context ctx?: Context): Command {
        if (this.command) {
            return this.command;
        }
        const syncDestination = this.connection.syncDestination;

        if (!syncDestination) {
            throw this.showErrorAndKillThis(
                "Can't start sync: Databricks synchronization destination not configured!",
                ctx
            );
        }

        this.command = this.cli.getSyncCommand(syncDestination, this.syncType);

        return this.command;
    }
}
