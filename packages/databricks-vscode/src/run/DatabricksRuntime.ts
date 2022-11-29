/**
 * Main runner for executing code on Databricks
 *
 * The runner should be independend from the VSCode UI and testable using only unit tests.
 */

import {
    CancellationTokenSource,
    commands,
    Disposable,
    Event,
    EventEmitter,
    ExtensionContext,
    Uri,
} from "vscode";

import {SyncDestination} from "../configuration/SyncDestination";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {promptForClusterStart} from "./prompts";
import {CodeSynchronizer} from "../sync/CodeSynchronizer";
import * as fs from "node:fs/promises";

export interface OutputEvent {
    type: "prio" | "out" | "err";
    text: string;
    filePath: string;
    line: number;
    column: number;
}

type EnvVars = Record<string, string>;

export class DatabricksRuntime implements Disposable {
    private _onDidEndEmitter: EventEmitter<void> = new EventEmitter<void>();
    readonly onDidEnd: Event<void> = this._onDidEndEmitter.event;

    private _onErrorEmitter: EventEmitter<string> = new EventEmitter<string>();
    readonly onError: Event<string> = this._onErrorEmitter.event;

    private _onDidSendOutputEmitter: EventEmitter<OutputEvent> =
        new EventEmitter<OutputEvent>();
    readonly onDidSendOutput: Event<OutputEvent> =
        this._onDidSendOutputEmitter.event;

    private tokenSource = new CancellationTokenSource();
    private token = this.tokenSource.token;

    private disposables: Disposable[] = [];

    constructor(
        private connection: ConnectionManager,
        private codeSynchronizer: CodeSynchronizer,
        private context: ExtensionContext
    ) {}

    /**
     * Start executing the given program.
     */
    public async start(
        program: string,
        args: Array<string>,
        envVars: EnvVars
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
                await this.connection.waitForConnect();
            }

            const cluster = this.connection.cluster;
            if (!cluster) {
                return this._onErrorEmitter.fire(
                    "You must attach to a cluster to run on Databricks"
                );
            }

            const isClusterRunning = await promptForClusterStart(
                cluster,
                async () => {
                    this._onErrorEmitter.fire(
                        "Cancel execution because cluster is not running."
                    );
                },
                async () => {
                    this._onDidSendOutputEmitter.fire({
                        type: "err",
                        text: `Starting cluster ${cluster?.name} ...`,
                        filePath: program,
                        column: 0,
                        line: 0,
                    });
                }
            );
            if (!isClusterRunning) {
                return;
            }

            const syncDestination = this.connection.syncDestination;
            if (!syncDestination) {
                return this._onErrorEmitter.fire(
                    "You must configure code synchronization to run on Databricks"
                );
            }

            log(`Creating execution context on cluster ${cluster.id} ...`);

            const executionContext = await cluster.createExecutionContext(
                "python"
            );

            this.token.onCancellationRequested(async () => {
                await executionContext.destroy();
            });

            // We wait for sync to complete so that the local files are consistant
            // with the remote repo files
            log(
                `Synchronizing code to ${syncDestination.relativeRepoPath} ...`
            );

            this.disposables.push(
                this.codeSynchronizer.onDidChangeState((state) => {
                    if (state === "STOPPED") {
                        return this._onErrorEmitter.fire(
                            "Execution cancelled because sync was stopped"
                        );
                    }
                })
            );

            if (this.codeSynchronizer.state === "STOPPED") {
                await commands.executeCommand("databricks.sync.start");
            }

            // We wait for sync to complete so that the local files are consistant
            // with the remote repo files
            await this.codeSynchronizer.waitForSyncComplete();

            log(
                `Running ${syncDestination.getRelativePath(
                    Uri.file(program)
                )} ...\n`
            );

            const response = await executionContext.execute(
                await this.compileCommandString(
                    program,
                    args,
                    syncDestination,
                    envVars
                ),
                undefined,
                this.token
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
                this._onDidSendOutputEmitter.fire({
                    type: "out",
                    text: (result.results! as any).cause,
                    filePath: program,
                    line: 0,
                    column: 0,
                });
                this._onDidSendOutputEmitter.fire({
                    type: "out",
                    text: (result.results! as any).summary,
                    filePath: program,
                    line: 0,
                    column: 0,
                });
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

    private async compileCommandString(
        program: string,
        args: Array<string>,
        syncDestination: SyncDestination,
        envVars: EnvVars
    ): Promise<string> {
        const bootstrapPath = Uri.joinPath(
            this.context.extensionUri,
            "resources",
            "python",
            "bootstrap.py"
        );

        const argv = [
            syncDestination.localToRemote(Uri.file(program)),
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
            `"${syncDestination.localToRemote(Uri.file(program))}"`
        );
        bootstrap = bootstrap.replace(
            '"REPO_PATH"',
            `"${syncDestination.path.path}"`
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
