/**
 * Main runner for executing code on Databricks
 *
 * The runner should be independend from the VSCode UI and testable using only unit tests.
 */

import {CancellationTokenSource, Event, EventEmitter, Uri} from "vscode";

import {SyncDestination} from "../configuration/SyncDestination";
import {ConnectionManager} from "../configuration/ConnectionManager";

export interface OutputEvent {
    type: "prio" | "out" | "err";
    text: string;
    filePath: string;
    line: number;
    column: number;
}

export interface FileAccessor {
    readFile(path: string): Promise<Uint8Array>;
    writeFile(path: string, contents: Uint8Array): Promise<void>;
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
        private fileAccessor: FileAccessor
    ) {
        console.log("Activate Databricks debugger");
    }

    /**
     * Start executing the given program.
     */
    public async start(program: string, args: Array<string>): Promise<void> {
        console.log(`starting program ${program}`);

        let cluster = this.connection.cluster;
        if (!cluster) {
            return this._onErrorEmitter.fire(
                "You must attach to a cluster to run on Databricks"
            );
        }
        let syncDestination = this.connection.syncDestination;
        if (!syncDestination) {
            return this._onErrorEmitter.fire(
                "You must configure code synchronization to run on Databricks"
            );
        }

        const bytes = await this.fileAccessor.readFile(program);
        const lines = new TextDecoder().decode(bytes).split(/\r?\n/);

        let executionContext = await cluster.createExecutionContext("python");

        this.token.onCancellationRequested(async () => {
            await executionContext.destroy();
        });

        this._onDidSendOutputEmitter.fire({
            type: "out",
            text: `${new Date()} Running on Databricks ...`,
            filePath: program,
            line: lines.length,
            column: 0,
        });

        let response = await executionContext.execute(
            this.compileCommandString(program, lines, args, syncDestination),
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
        } else {
            this._onDidSendOutputEmitter.fire({
                type: "out",
                text: JSON.stringify(result.results as any, null, 2),
                filePath: program,
                line: lines.length,
                column: 0,
            });
        }

        await executionContext.destroy();
        this._onDidEndEmitter.fire();
    }

    private compileCommandString(
        program: string,
        programLines: Array<string>,
        args: Array<string>,
        syncDestination: SyncDestination
    ): string {
        return [
            // set working directory
            `import os; os.chdir("${syncDestination.localToRemoteDir(
                Uri.file(program)
            )}");`,

            // update class path
            `import sys; sys.path.append("${syncDestination.path.path}")`,

            // inject command line arguments
            `import sys; sys.argv = ['${args
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
        console.log("disconnect");
        this.tokenSource.cancel();
    }
}
