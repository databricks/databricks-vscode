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
import {DatabricksCliSyncParser} from "./DatabricksCliSyncParser";
import {withLogContext} from "@databricks/databricks-sdk/dist/logging";
import {Loggers} from "../logger";
import {Context, context} from "@databricks/databricks-sdk/dist/context";
import {PackageMetaData} from "../utils/packageJsonUtils";
import {RWLock} from "../locking";

export const TASK_SYNC_TYPE = {
    syncFull: "sync-full",
    sync: "sync",
} as const;

type TaskSyncType = (typeof TASK_SYNC_TYPE)[keyof typeof TASK_SYNC_TYPE];

const cliToTaskSyncType = new Map<SyncType, TaskSyncType>([
    ["full", TASK_SYNC_TYPE.syncFull],
    ["incremental", TASK_SYNC_TYPE.sync],
]);

export class SyncTask extends Task {
    constructor(
        connection: ConnectionManager,
        cli: CliWrapper,
        syncType: SyncType,
        packageMetadata: PackageMetaData,
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
                    packageMetadata,
                    syncStateCallback
                );
            })
        );

        this.isBackground = true;
        this.detail = "$(rocket) Databricks sync";
        this.problemMatchers = ["$databricks-sync"];
        this.presentationOptions.echo = true;
        this.group = TaskGroup.Build;
        this.presentationOptions.reveal = TaskRevealKind.Always;
    }

    static killAll() {
        window.terminals.forEach((terminal) => {
            if (
                Object.values(TASK_SYNC_TYPE)
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

    private closeEmitter = new EventEmitter<void>();
    onDidClose: Event<void> = this.closeEmitter.event;

    private syncProcess: ChildProcess | undefined;
    private databricksSyncParser: DatabricksCliSyncParser;
    private state: SyncState = "STOPPED";
    private syncStateCallback: (state: SyncState) => void;

    constructor(
        private cmd: string,
        private args: string[],
        private options: SpawnOptions,
        syncStateCallback: (state: SyncState) => void
    ) {
        this.syncStateCallback = (state: SyncState) => {
            if (
                ([
                    "FILES_IN_REPOS_DISABLED",
                    "FILES_IN_WORKSPACE_DISABLED",
                ].includes(this.state) &&
                    ["ERROR", "STOPPED"].includes(state)) ||
                (this.state === "STOPPED" && state === "ERROR")
            ) {
                return;
            }
            this.state = state;
            syncStateCallback(state);
        };
        this.databricksSyncParser = new DatabricksCliSyncParser(
            this.syncStateCallback,
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
            "[VSCODE] databricks cli path: " + this.cmd.toString()
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

        //When sync fails (due to any reason including Files in Repos/Workspace being disabled),
        //the sync process could emit "close" before all "data" messages have been done processing.
        //This can lead to a unknown ERROR state for sync, when in reality the state is actually
        //known (it is FILES_IN_REPOS_DISABLED/FILES_IN_WORKSPACE_DISABLED). We use a reader-writer
        //lock to make sure all "data" events have been processd before progressing with "close".
        const rwLock = new RWLock();
        this.syncProcess.stderr.on("data", async (data) => {
            await rwLock.readerEntry();
            this.databricksSyncParser.processStderr(data.toString());
            await rwLock.readerExit();
        });

        this.syncProcess.stdout.on("data", async (data) => {
            await rwLock.readerEntry();
            this.databricksSyncParser.processStdout(data.toString());
            await rwLock.readerExit();
        });

        this.syncProcess.on("close", async (code) => {
            await rwLock.writerEntry();
            if (code !== 0) {
                this.syncStateCallback("ERROR");
                // terminate the vscode terminal task
                this.closeEmitter.fire();
            }
            await rwLock.writerExit();
        });
    }
}

/**
 * Wrapper around the CustomSyncTerminal class that lazily evaluates the process
 * and args properties. This is necessary because the process and args properties
 * are not known up front and can only be computed dynamically at runtime.
 *
 * A Custom implmentation of the terminal is needed to run databricks sync as a CustomExecution
 * vscode task, which allows us to parse the stdout/stderr databricks sync logs and compute
 * sync completeness state based on the output logs
 */
export class LazyCustomSyncTerminal extends CustomSyncTerminal {
    private command?: Command;

    constructor(
        private connection: ConnectionManager,
        private cli: CliWrapper,
        private syncType: SyncType,
        private packageMetadata: PackageMetaData,
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
            this.connection.syncDestinationMapper?.localUri.path;
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
            HTTP_PROXY: process.env.HTTP_PROXY || process.env.http_proxy,
            HTTPS_PROXY: process.env.HTTPS_PROXY || process.env.https_proxy,
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
                DATABRICKS_CLI_UPSTREAM: "databricks-vscode",
                DATABRICKS_CLI_UPSTREAM_VERSION: this.packageMetadata.version,
                HOME: process.env.HOME,
                PATH: process.env.PATH,
                DATABRICKS_HOST: dbWorkspace.host.toString(),
                DATABRICKS_AUTH_TYPE: "metadata-service",
                DATABRICKS_METADATA_SERVICE_URL:
                    this.connection.metadataServiceUrl || "",
                ...proxySettings,
                /* eslint-enable @typescript-eslint/naming-convention */
            },
        } as SpawnOptions;
    }

    @withLogContext(Loggers.Extension)
    getSyncCommand(@context ctx?: Context): Command {
        if (this.command) {
            return this.command;
        }
        const syncDestination = this.connection.syncDestinationMapper;

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
