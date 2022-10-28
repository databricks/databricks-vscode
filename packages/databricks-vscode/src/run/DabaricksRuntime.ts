/**
 * Main runner for executing code on Databricks
 *
 * The runner should be independend from the VSCode UI and testable using only unit tests.
 */

import {
    CancellationTokenSource,
    commands,
    Event,
    EventEmitter,
    Uri,
    window,
} from "vscode";

import {SyncDestination} from "../configuration/SyncDestination";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {promptForClusterStart} from "./prompts";
import {CodeSynchronizer} from "../sync/CodeSynchronizer";

export interface OutputEvent {
    type: "prio" | "out" | "err";
    text: string;
    filePath: string;
    line: number;
    column: number;
}

export interface FileAccessor {
    readFile(path: string): Promise<string>;
}

export class DatabricksRuntime {
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

    constructor(
        private connection: ConnectionManager,
        private fileAccessor: FileAccessor = {
            readFile: async (path) => {
                return "";
            },
        },
        private codeSynchronizer: CodeSynchronizer
    ) {}

    /**
     * Start executing the given program.
     */
    public async start(program: string, args: Array<string>): Promise<void> {
        const start = Date.now();

        try {
            if (this.connection.state === "CONNECTING") {
                this._onDidSendOutputEmitter.fire({
                    type: "out",
                    text: `${new Date()} Connecting to cluster ...`,
                    filePath: program,
                    line: 0,
                    column: 0,
                });
                await this.connection.waitForConnect();
            }

            let cluster = this.connection.cluster;
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

            let syncDestination = this.connection.syncDestination;
            if (!syncDestination) {
                return this._onErrorEmitter.fire(
                    "You must configure code synchronization to run on Databricks"
                );
            }

            const lines = (await this.fileAccessor.readFile(program)).split(
                /\r?\n/
            );

            let executionContext = await cluster.createExecutionContext(
                "python"
            );

            this.token.onCancellationRequested(async () => {
                await executionContext.destroy();
            });

            this._onDidSendOutputEmitter.fire({
                type: "out",
                text: `${new Date()} Running ${syncDestination.getRelativePath(
                    Uri.file(program)
                )} on Cluster ${cluster.id} ...`,
                filePath: program,
                line: lines.length,
                column: 0,
            });

            // We wait for sync to complete so that the local files are consistant
            // with the remote repo files
            await this.codeSynchronizer.waitForSyncComplete();
            let response = await executionContext.execute(
                this.compileCommandString(
                    program,
                    lines,
                    args,
                    syncDestination
                ),
                undefined,
                this.token
            );
            let result = response.result;

            if (result.results!.resultType === "text") {
                this._onDidSendOutputEmitter.fire({
                    type: "out",
                    text: (result.results as any).data,
                    filePath: program,
                    line: lines.length,
                    column: 0,
                });
            } else if (result.results!.resultType === "error") {
                this._onDidSendOutputEmitter.fire({
                    type: "out",
                    text: (result.results! as any).cause,
                    filePath: program,
                    line: lines.length,
                    column: 0,
                });
                this._onDidSendOutputEmitter.fire({
                    type: "out",
                    text: (result.results! as any).summary,
                    filePath: program,
                    line: lines.length,
                    column: 0,
                });
            } else {
                this._onDidSendOutputEmitter.fire({
                    type: "out",
                    text: JSON.stringify(result.results as any, null, 2),
                    filePath: program,
                    line: lines.length,
                    column: 0,
                });
            }

            this._onDidSendOutputEmitter.fire({
                type: "out",
                text: `${new Date()} Done (took ${Date.now() - start}ms)`,
                filePath: program,
                line: lines.length,
                column: 0,
            });

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

    private compileCommandString(
        program: string,
        programLines: Array<string>,
        args: Array<string>,
        syncDestination: SyncDestination
    ): string {
        const argv = [
            syncDestination.localToRemote(Uri.file(program)),
            ...args,
        ];

        return [
            // set working directory
            `import os; os.chdir("${syncDestination.localToRemoteDir(
                Uri.file(program)
            )}");`,

            // update python path
            `import sys; sys.path.append("${syncDestination.path.path}")`,

            // inject command line arguments
            `import sys; sys.argv = ['${argv
                .map((arg) => this.escapePythonString(arg))
                .join("', '")}'];`,

            // Set log level to "ERROR". See https://kb.databricks.com/notebooks/cmd-c-on-object-id-p0.html
            `import logging; logger = spark._jvm.org.apache.log4j; logging.getLogger("py4j.java_gateway").setLevel(logging.ERROR)`,
            ...programLines,
        ].join("\n");
    }

    private escapePythonString(str: string): string {
        return str.replace(/'/g, "\\'").replace(/\\/g, "\\\\");
    }

    public async disconnect(): Promise<void> {
        this.tokenSource.cancel();
    }
}
