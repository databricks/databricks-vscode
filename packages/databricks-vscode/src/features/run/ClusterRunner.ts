import path from "node:path";
import {
    CommandExecutionClient,
    type GetCommandStatusResponse,
} from "@databricks/sdk-commandexecution/v2";
import {
    localToRemote,
    remoteToLocal,
    workspacePath,
    type SyncDestination,
} from "../../kernel/bundle/SyncDestination";
import { calls } from "../../kernel/connection/ApiClients";
import type { Connection } from "../../kernel/connection/ConnectionService";
import { errorMessage, isCancellation } from "../../platform/errors";
import { sleep } from "../../platform/timers";
import { bootstrapCommand, invalidEnvironmentVariable } from "./bootstrap";
import {
    parseErrorResult,
    renderErrorEnvelope,
    STDOUT_ERROR_BOUNDARY,
    type Frame,
} from "./ErrorParser";
import type { RunContext } from "./RunContext";

/** A line for the debug console, linked to a file and line when it has one. */
export interface RunOutput {
    readonly type: "out" | "err";
    readonly text: string;
    readonly filePath: string;
    readonly line: number;
}

/** What a `databricks` launch configuration runs (RUN-03). */
export interface RunRequest {
    /** An absolute local path. */
    readonly program: string;
    readonly args?: readonly string[];
    readonly env?: Readonly<Record<string, string>>;
}

export interface ClusterRunnerOptions {
    /** How often the context and the command are polled. */
    readonly pollIntervalMs?: number;
    readonly now?: () => number;
}

/** The old runtime's states; the session reads `state` when it is stopped. */
export type RuntimeState =
    | "STOPPED"
    | "CREATE_CONTEXT"
    | "SYNCING"
    | "EXECUTING"
    | "CANCELED"
    | "FINISHED";

const RUNNING_STATES = ["RUNNING", "RESIZING"];
const DONE = ["Finished", "Error", "Cancelled"];

/** The command's status and results; the API uses one poll for both. */
type CommandResult = GetCommandStatusResponse;

/**
 * "Upload and Run File" (RUN-01): uploads the bundle's files, then runs the
 * file on the attached cluster through the Command Execution API, and sends
 * its output, with tracebacks mapped to local files, to the debug console.
 * Ported from the old `DatabricksRuntime`. The upload goes through
 * `BundleOperations.syncOnce`, the execution through
 * `@databricks/sdk-commandexecution`, and `bootstrap.py` gets its arguments
 * as JSON. Independent of the debug adapter, so it is tested on its own.
 */
export class ClusterRunner {
    private runtimeState: RuntimeState = "STOPPED";
    private readonly pollIntervalMs: number;
    private readonly now: () => number;

    constructor(
        private readonly ctx: RunContext,
        options: ClusterRunnerOptions = {},
    ) {
        this.pollIntervalMs = options.pollIntervalMs ?? 1000;
        this.now = options.now ?? Date.now;
    }

    get state(): RuntimeState {
        return this.runtimeState;
    }

    /**
     * Runs the file. Resolves with the exit code once it ends: 0 when the
     * command finished, 1 when it failed, was cancelled through `signal`, or
     * stopped at a prompt.
     */
    async run(
        request: RunRequest,
        signal: AbortSignal,
        emit: (output: RunOutput) => void,
    ): Promise<number> {
        const start = this.now();
        const { program } = request;
        const log = (message: string) =>
            emit({
                type: "out",
                text: `${new Date(this.now()).toLocaleString()} - ${message}`,
                filePath: program,
                line: 0,
            });
        try {
            const connection = await this.ctx.connection(signal, () =>
                log("Connecting to databricks..."),
            );
            const target = await this.ctx.target(signal);
            if (target.mode !== "development") {
                this.ctx.prompts.changeTargetMode(target.mode);
                return 1;
            }
            const destination = target.destination;
            if (destination === undefined) {
                throw new Error("No sync destination found");
            }
            const env = request.env ?? {};
            const invalid = invalidEnvironmentVariable(env);
            if (invalid !== undefined) {
                throw new Error(invalid);
            }
            // The notification, and its Cancel, last until the run ends: the old one went away with the upload.
            const exitCode = await this.ctx.progress(signal, (runSignal, report) =>
                this.upload(runSignal, log).then(() =>
                    this.runOnCluster(
                        { ...request, env },
                        connection,
                        destination,
                        runSignal,
                        report,
                        log,
                        emit,
                    ),
                ),
            );
            if (exitCode === 0) {
                log(`Done (took ${this.now() - start}ms)`);
                this.runtimeState = "FINISHED";
            }
            return exitCode;
        } catch (e) {
            if (isCancellation(e) || signal.aborted) {
                this.runtimeState = "CANCELED";
                emit({ type: "err", text: "Cancelled", filePath: program, line: 0 });
                return 1;
            }
            const name = e instanceof Error ? e.name : "Error";
            emit({ type: "err", text: `${name}: ${errorMessage(e)}`, filePath: program, line: 0 });
            this.ctx.showError(`${name}: ${errorMessage(e)}`);
            return 1;
        }
    }

    private async upload(signal: AbortSignal, log: (message: string) => void): Promise<void> {
        log("Uploading assets to databricks workspace...");
        this.runtimeState = "SYNCING";
        await this.ctx.upload(signal).catch((e: unknown) => {
            throw isCancellation(e)
                ? e
                : new Error(`Error synchronising bundle assets. ${errorMessage(e)}`, { cause: e });
        });
        await this.ctx.focusDebugConsole();
    }

    /** Checks the cluster, then runs the file in an execution context, which it destroys afterwards. */
    private async runOnCluster(
        request: RunRequest & { readonly env: Readonly<Record<string, string>> },
        connection: Connection,
        destination: SyncDestination,
        signal: AbortSignal,
        report: (message: string) => void,
        log: (message: string) => void,
        emit: (output: RunOutput) => void,
    ): Promise<number> {
        const compute = this.ctx.compute();
        if (compute?.kind !== "cluster") {
            this.ctx.prompts.attachCluster();
            return 1;
        }
        const cluster = await this.ctx.getCluster(compute.clusterId, signal);
        if (!RUNNING_STATES.includes(cluster.state)) {
            this.ctx.prompts.startCluster();
            return 1;
        }

        log(`Creating execution context on cluster ${cluster.id} ...`);
        report(`Creating execution context on cluster ${cluster.id}`);
        this.runtimeState = "CREATE_CONTEXT";
        const client = connection.api.get(CommandExecutionClient);
        const contextId = await this.createContext(client, cluster.id, signal);
        try {
            const relative = path
                .relative(destination.localRoot, request.program)
                .split(path.sep)
                .join("/");
            log(`Running ${relative} ...\n`);
            report(`Running ${relative}`);
            this.runtimeState = "EXECUTING";
            const remoteFile = workspacePath(localToRemote(request.program, destination));
            const command = bootstrapCommand(await this.ctx.readResource("bootstrap.py"), {
                pythonFile: remoteFile,
                repoPath: workspacePath(destination.remoteRoot),
                argv: [remoteFile, ...(request.args ?? [])],
                env: request.env,
            });
            const result = await this.execute(client, cluster.id, contextId, command, signal);
            this.emitResult(result, request.program, destination, emit);
            return 0;
        } finally {
            // Best-effort: the context goes away with the cluster anyway.
            await client
                .destroy({ clusterId: cluster.id, contextId }, calls.write())
                .catch((e: unknown) =>
                    this.ctx.log.debug("Can't destroy the execution context", e),
                );
        }
    }

    private async createContext(
        client: CommandExecutionClient,
        clusterId: string,
        signal: AbortSignal,
    ): Promise<string> {
        const { contextId } = await client.create(
            { clusterId, language: "python" },
            calls.write({ signal }),
        );
        for (;;) {
            const { status } = await client.getContextStatus(
                { clusterId, contextId },
                calls.read({ signal }),
            );
            if (status === "Running") {
                return contextId;
            }
            if (status === "Error") {
                throw new Error(`Can't create an execution context on cluster ${clusterId}`);
            }
            await sleep(this.pollIntervalMs, signal);
        }
    }

    /** Polls until the command is done. Aborting cancels the command first. */
    private async execute(
        client: CommandExecutionClient,
        clusterId: string,
        contextId: string,
        command: string,
        signal: AbortSignal,
    ): Promise<CommandResult> {
        const { commandId } = await client.execute(
            { clusterId, contextId, language: "python", command },
            calls.write({ signal }),
        );
        const cancel = () => {
            client
                .cancel({ clusterId, contextId, commandId }, calls.write())
                .catch((e: unknown) => this.ctx.log.debug("Can't cancel the command", e));
        };
        signal.addEventListener("abort", cancel, { once: true });
        try {
            for (;;) {
                const result = await client.getCommandStatus(
                    { clusterId, contextId, commandId },
                    calls.read({ signal }),
                );
                if (result.status !== undefined && DONE.includes(result.status)) {
                    return result;
                }
                await sleep(this.pollIntervalMs, signal);
            }
        } finally {
            signal.removeEventListener("abort", cancel);
        }
    }

    /** As before: text, with the error envelope after the boundary; a parsed traceback; or the raw results. */
    private emitResult(
        result: CommandResult,
        program: string,
        destination: SyncDestination,
        emit: (output: RunOutput) => void,
    ) {
        const results = result.results;
        if (results?.resultType === "text") {
            const data = typeof results.data === "string" ? results.data : "";
            const boundary = data.indexOf(STDOUT_ERROR_BOUNDARY);
            if (boundary === -1) {
                emit({ type: "out", text: data, filePath: program, line: 0 });
                return;
            }
            // The script printed and then failed: `bootstrap.py` sends the captured stdout, the boundary, then a structured traceback.
            const stdout = data.slice(0, boundary);
            if (stdout.length > 0) {
                emit({ type: "out", text: stdout, filePath: program, line: 0 });
            }
            for (const frame of renderErrorEnvelope(
                data.slice(boundary + STDOUT_ERROR_BOUNDARY.length),
            )) {
                emit(this.tracebackFrame(frame, destination));
            }
        } else if (results?.resultType === "error") {
            for (const frame of parseErrorResult(results)) {
                emit(this.tracebackFrame(frame, destination));
            }
        } else {
            emit({
                type: "out",
                text: JSON.stringify(results, null, 2),
                filePath: program,
                line: 0,
            });
        }
    }

    /** A frame whose remote file is one of the bundle's, linked to the local file. */
    private tracebackFrame(frame: Frame, destination: SyncDestination): RunOutput {
        const localFile =
            frame.file === undefined
                ? undefined
                : remoteToLocal(path.posix.normalize(frame.file), destination);
        return {
            type: "out",
            text:
                frame.file !== undefined && localFile !== undefined
                    ? frame.text.replace(frame.file, localFile)
                    : frame.text,
            filePath: localFile ?? "",
            line: frame.line ?? 0,
        };
    }
}
