/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Main runner for executing code on Databricks
 *
 * The runner should be independend from the VSCode UI and testable using only unit tests.
 */

import {
    CancellationTokenSource,
    commands,
    debug,
    Disposable,
    Event,
    EventEmitter,
    ExtensionContext,
    Uri,
    workspace,
} from "vscode";

import {
    LocalUri,
    RemoteUri,
    SyncDestinationMapper,
} from "../sync/SyncDestination";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {
    promptForAttachingSyncDest,
    promptForClusterAttach,
    promptForClusterStart,
} from "./prompts";
import {CodeSynchronizer} from "../sync/CodeSynchronizer";
import * as fs from "node:fs/promises";
import {parseErrorResult} from "./ErrorParser";
import path from "node:path";
import {WorkspaceFsAccessVerifier} from "../workspace-fs";
import {Time, TimeUnits} from "@databricks/databricks-sdk";
import {workspaceConfigs} from "../vscode-objs/WorkspaceConfigs";

export interface OutputEvent {
    type: "prio" | "out" | "err";
    text: string;
    filePath: string;
    line: number;
    column: number;
}

type EnvVars = Record<string, string>;

export type RuntimeState =
    | "STOPPED"
    | "CREATE_CONTEXT"
    | "SYNCING"
    | "EXECUTING"
    | "CANCELED"
    | "FINISHED";
export class DatabricksRuntime implements Disposable {
    private _onDidEndEmitter: EventEmitter<void> = new EventEmitter<void>();
    readonly onDidEnd: Event<void> = this._onDidEndEmitter.event;

    private _onErrorEmitter: EventEmitter<string | undefined> =
        new EventEmitter<string | undefined>();
    readonly onError: Event<string | undefined> = this._onErrorEmitter.event;

    private _onDidSendOutputEmitter: EventEmitter<OutputEvent> =
        new EventEmitter<OutputEvent>();
    readonly onDidSendOutput: Event<OutputEvent> =
        this._onDidSendOutputEmitter.event;

    private _onDidChangeStateEmitter: EventEmitter<RuntimeState> =
        new EventEmitter<RuntimeState>();
    readonly onDidChangeState: Event<RuntimeState> =
        this._onDidChangeStateEmitter.event;

    private _runtimeState: RuntimeState = "STOPPED";
    public get state() {
        return this._runtimeState;
    }
    private set state(newState: RuntimeState) {
        this._runtimeState = newState;
        if (this.state === "CANCELED") {
            this._onDidEndEmitter.fire();
        }
        this._onDidChangeStateEmitter.fire(newState);
    }

    private tokenSource = new CancellationTokenSource();
    private token = this.tokenSource.token;
    private async cancellable<T>(p: Promise<T>) {
        return await Promise.race([
            p,
            new Promise<undefined>((resolve) =>
                this.token.onCancellationRequested(() => {
                    this.state = "CANCELED";
                    resolve(undefined);
                })
            ),
        ]);
    }

    private disposables: Disposable[] = [];

    constructor(
        private connection: ConnectionManager,
        private codeSynchronizer: CodeSynchronizer,
        private context: ExtensionContext,
        private wsfsAccessVerifier: WorkspaceFsAccessVerifier
    ) {}

    /**
     * Start executing the given program.
     */
    public async start(
        program: string,
        args: Array<string>,
        envVars: EnvVars,
        shouldDebug: boolean = false
    ): Promise<void> {
        const start = Date.now();

        const log = (message: string) => {
            this._onDidSendOutputEmitter.fire({
                type: "out",
                text: `${new Date().toLocaleString()} - ${message}`,
                filePath: program,
                line: 0,
                column: 0,
            });
        };

        try {
            if (this.connection.state === "CONNECTING") {
                log("Connecting to cluster ...");
                await this.cancellable(this.connection.waitForConnect());
            }

            const cluster = this.connection.cluster;
            if (!cluster) {
                promptForClusterAttach();
                return this._onErrorEmitter.fire(undefined);
            }

            await this.wsfsAccessVerifier.verifyCluster(cluster);
            await this.wsfsAccessVerifier.verifyWorkspaceConfigs();
            if (!["RUNNING", "RESIZING"].includes(cluster.state)) {
                this._onErrorEmitter.fire(undefined);
                promptForClusterStart();
                return;
            }

            const syncDestination = this.connection.syncDestinationMapper;
            if (!syncDestination) {
                promptForAttachingSyncDest();
                return this._onErrorEmitter.fire(undefined);
            }

            log(`Creating execution context on cluster ${cluster.id} ...`);
            this.state = "CREATE_CONTEXT";

            const executionContext = await this.cancellable(
                cluster.createExecutionContext("python")
            );

            if (executionContext === undefined) {
                return;
            }
            this.token.onCancellationRequested(async () => {
                this.state = "CANCELED";
                await executionContext.destroy();
            });

            // We wait for sync to complete so that the local files are consistant
            // with the remote repo files
            log(`Synchronizing code to ${syncDestination.remoteUri.path} ...`);
            this.state = "SYNCING";

            this.disposables.push(
                this.codeSynchronizer.onDidChangeState((state) => {
                    if (
                        !["IN_PROGRESS", "WATCHING_FOR_CHANGES"].includes(state)
                    ) {
                        return this._onErrorEmitter.fire(
                            "Execution cancelled because sync was stopped"
                        );
                    }
                })
            );

            if (
                !["IN_PROGRESS", "WATCHING_FOR_CHANGES"].includes(
                    this.codeSynchronizer.state
                )
            ) {
                await commands.executeCommand("databricks.sync.start");
            }

            // We wait for sync to complete so that the local files are consistant
            // with the remote repo files
            await this.cancellable(this.codeSynchronizer.waitForSyncComplete());
            if (this._runtimeState === "CANCELED") {
                return;
            }
            if (this.codeSynchronizer.state !== "WATCHING_FOR_CHANGES") {
                this._onDidSendOutputEmitter.fire({
                    type: "err",
                    text: `Can't sync ${program}. Reason: ${this.codeSynchronizer.state}`,
                    filePath: program,
                    line: 0,
                    column: 0,
                });
                this._onErrorEmitter.fire(`Error in running ${program}.`);
                return;
            }
            await commands.executeCommand("workbench.panel.repl.view.focus");

            this.state = "EXECUTING";

            let debugUrl: URL | undefined;
            if (shouldDebug) {
                const ngrokAuthToken = workspaceConfigs.ngrokAuthToken;
                if (ngrokAuthToken) {
                    const response = await executionContext.execute(
                        await this.compileTunnelScript(ngrokAuthToken)
                    );
                    const result = response.result;

                    if (result.results!.resultType === "text") {
                        const responseString = result.results?.data as string;

                        debugUrl = new URL(
                            responseString.split("\n").pop() || ""
                        );
                        log(`Debugger exposed at ${debugUrl.toString()}`);
                    } else {
                        shouldDebug = false;
                        this._onErrorEmitter.fire(
                            JSON.stringify(result, null, 2)
                        );
                        return;
                    }
                } else {
                    shouldDebug = false;
                }
            }

            if (shouldDebug && debugUrl) {
                setTimeout(this.attachDebugger.bind(this, debugUrl), 2000);
            }

            log(
                `Running ${syncDestination.localUri.relativePath(
                    new LocalUri(program)
                )} ...\n`
            );

            const response = await executionContext.execute(
                await this.compileCommandString(
                    program,
                    args,
                    syncDestination,
                    envVars,
                    shouldDebug
                ),
                undefined,
                this.token,
                new Time(240, TimeUnits.hours)
            );
            const result = response.result;

            if (result.results!.resultType === "text") {
                this._onDidSendOutputEmitter.fire({
                    type: "out",
                    text: (result.results as any).data,
                    filePath: program,
                    line: 0,
                    column: 0,
                });
            } else if (result.results!.resultType === "error") {
                const frames = parseErrorResult(result.results!);
                for (const frame of frames) {
                    let localFile = "";
                    try {
                        if (frame.file) {
                            localFile = syncDestination.remoteToLocal(
                                new RemoteUri(path.posix.normalize(frame.file))
                            ).path;

                            frame.text = frame.text.replace(
                                frame.file,
                                localFile
                            );
                        }
                    } catch (e) {}

                    this._onDidSendOutputEmitter.fire({
                        type: "out",
                        text: frame.text,
                        filePath: localFile,
                        line: frame.line || 0,
                        column: 0,
                    });
                }
            } else {
                this._onDidSendOutputEmitter.fire({
                    type: "out",
                    text: JSON.stringify(result.results as any, null, 2),
                    filePath: program,
                    line: 0,
                    column: 0,
                });
            }

            log(`Done (took ${Date.now() - start}ms)`);
            this.state = "FINISHED";
            await executionContext.destroy();
        } catch (e) {
            if (e instanceof Error) {
                this._onDidSendOutputEmitter.fire({
                    type: "err",
                    text: `${e.name}: ${e.message}`,
                    filePath: program,
                    line: 0,
                    column: 0,
                });
                this._onErrorEmitter.fire(`${e.name}: ${e.message}`);
            }
        } finally {
            this._onDidEndEmitter.fire();
        }
    }

    private async attachDebugger(debugUrl: URL) {
        const mapper = this.connection.syncDestinationMapper;
        if (!mapper) {
            return;
        }

        const workspaceFolder =
            workspace.workspaceFolders && workspace.workspaceFolders[0];

        if (!workspaceFolder) {
            return;
        }

        const debugConfig = {
            type: "python",
            name: "Databricks: Remote Attach Debugger",
            request: "attach",
            connect: {
                host: debugUrl.hostname,
                port: debugUrl.port,
            },
            pathMappings: [
                {
                    localRoot: workspaceFolder.uri.path,
                    remoteRoot: mapper.remoteUri.workspacePrefixPath,
                },
            ],
            justMyCode: true,
        };

        debug.startDebugging(workspaceFolder, debugConfig);
    }

    private async compileTunnelScript(ngrokAuthToken: string): Promise<string> {
        const tunnelPath = Uri.joinPath(
            this.context.extensionUri,
            "resources",
            "python",
            "tunnel.py"
        );

        let tunnelCode = await fs.readFile(tunnelPath.fsPath, "utf8");

        tunnelCode = tunnelCode.replace(
            'auth_token = ""',
            `auth_token = "${ngrokAuthToken}"`
        );

        return tunnelCode;
    }

    private async compileCommandString(
        program: string,
        args: Array<string>,
        syncDestination: SyncDestinationMapper,
        envVars: EnvVars,
        shouldDebug: boolean = false
    ): Promise<string> {
        const bootstrapPath = Uri.joinPath(
            this.context.extensionUri,
            "resources",
            "python",
            "bootstrap.py"
        );

        const argv = [
            syncDestination.localToRemote(new LocalUri(Uri.file(program)))
                .workspacePrefixPath,
            ...args,
        ];

        for (const key in envVars) {
            if (!/^[a-zA-Z_]{1,}[a-zA-Z0-9_]*$/.test(key)) {
                this._onErrorEmitter.fire(
                    `Invalid environment variable ${key}: Only lower and upper case letters, digits and '_'(underscore) are allowed.`
                );
                return "";
            }
        }

        let bootstrap = await fs.readFile(bootstrapPath.fsPath, "utf8");

        bootstrap = bootstrap.replace(
            '"PYTHON_FILE"',
            `"${
                syncDestination.localToRemote(new LocalUri(Uri.file(program)))
                    .workspacePrefixPath
            }"`
        );
        bootstrap = bootstrap.replace(
            '"REPO_PATH"',
            `"${syncDestination.remoteUri.workspacePrefixPath}"`
        );
        bootstrap = bootstrap.replace(
            "args = []",
            `args = ['${argv
                .map((arg) => this.escapePythonString(arg))
                .join("', '")}'];`
        );
        bootstrap = bootstrap.replace(
            "env = {}",
            `env = ${JSON.stringify(envVars)}`
        );

        if (shouldDebug) {
            bootstrap = bootstrap.replace(
                "start_debugger = False",
                "start_debugger = True"
            );
        }

        return bootstrap;
    }

    private escapePythonString(str: string): string {
        return str.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    }

    public async disconnect(): Promise<void> {
        this.tokenSource.cancel();
    }

    dispose() {
        this.disposables.forEach((obj) => obj.dispose());
    }
}
