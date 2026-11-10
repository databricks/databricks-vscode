import { basename } from "node:path";
import {
    DebugSession,
    ExitedEvent,
    InitializedEvent,
    OutputEvent,
    Source,
    TerminatedEvent,
} from "@vscode/debugadapter";
import type { DebugProtocol } from "@vscode/debugprotocol";
import { ClusterRunner, type ClusterRunnerOptions, type RunOutput } from "./ClusterRunner";
import type { RunContext } from "./RunContext";
import { Subject } from "./Subject";

/** The `databricks` launch attributes (RUN-03); `package.json`'s `debuggers` declares them. */
export interface ClusterLaunchArguments extends DebugProtocol.LaunchRequestArguments {
    /** An absolute path to the Python file. */
    program: string;
    args?: string[];
    env?: Record<string, string>;
}

/**
 * VS Code doesn't check a launch configuration's required attributes, so a
 * `launch.json` entry can come without `program`. Both adapters answer it
 * with this error (a DAP error response, which VS Code shows).
 */
export const NO_PROGRAM = {
    id: 1,
    format: 'The launch configuration has no "program": set it to the file to run, for example "${file}".',
    showUser: true,
} as const satisfies DebugProtocol.Message;

/** A launch the window refuses: the DAP error VS Code shows, as `NO_PROGRAM` is. */
export function refusal(text: string): DebugProtocol.Message {
    return { id: 2, format: text, showUser: true };
}

export function hasProgram(args: { readonly program?: unknown }): boolean {
    return typeof args.program === "string" && args.program !== "";
}

/** What a debug session needs besides the runner's context. */
export interface SessionUi {
    /** `workbench.panel.repl.view.focus`. */
    focusDebugConsole(): Promise<void>;
    /** Why this window can't run the file (a session's fixed compute): a launch fails with it. */
    readonly unavailable?: string;
}

/**
 * The `databricks` debug adapter (RUN-01), inline in the extension host. It
 * only translates the protocol: `ClusterRunner` uploads and runs. Ported
 * from the old `DatabricksDebugAdapter`; its capabilities are unchanged.
 */
export class DatabricksDebugSession extends DebugSession {
    private readonly configurationDone = new Subject();
    private readonly controller = new AbortController();
    private readonly runner: ClusterRunner;

    constructor(
        ctx: RunContext,
        private readonly ui: SessionUi,
        options: ClusterRunnerOptions = {},
    ) {
        super();
        this.runner = new ClusterRunner(ctx, options);
    }

    protected override initializeRequest(response: DebugProtocol.InitializeResponse): void {
        response.body = {
            ...response.body,
            supportsConfigurationDoneRequest: true,
            supportsEvaluateForHovers: false,
            supportsStepBack: false,
            supportsDataBreakpoints: false,
            supportsCompletionsRequest: false,
            completionTriggerCharacters: [],
            supportsCancelRequest: true,
            supportsBreakpointLocationsRequest: false,
            supportsStepInTargetsRequest: false,
            supportsExceptionFilterOptions: false,
            exceptionBreakpointFilters: [],
            supportsExceptionInfoRequest: false,
            supportsSetVariable: false,
            supportsSetExpression: false,
            supportsDisassembleRequest: false,
            supportsSteppingGranularity: false,
            supportsInstructionBreakpoints: false,
            supportsReadMemoryRequest: false,
            supportsWriteMemoryRequest: false,
            supportSuspendDebuggee: true,
            supportTerminateDebuggee: true,
        };
        this.sendResponse(response);
        // Configuration requests may come at any time; `configurationDone` ends them.
        this.sendEvent(new InitializedEvent());
    }

    protected override configurationDoneRequest(
        response: DebugProtocol.ConfigurationDoneResponse,
        args: DebugProtocol.ConfigurationDoneArguments,
    ): void {
        super.configurationDoneRequest(response, args);
        this.configurationDone.notify();
    }

    protected override attachRequest(
        response: DebugProtocol.AttachResponse,
        args: ClusterLaunchArguments,
    ): void {
        void this.launch(response, args);
    }

    protected override launchRequest(
        response: DebugProtocol.LaunchResponse,
        args: ClusterLaunchArguments,
    ): void {
        void this.launch(response, args);
    }

    /** Runs the file, then answers the request and ends the session. */
    private async launch(
        response: DebugProtocol.Response,
        args: ClusterLaunchArguments,
    ): Promise<void> {
        // As before, wait up to a second for the configuration to finish; then go ahead anyway.
        await this.configurationDone.wait(1000).catch(() => {});
        if (this.ui.unavailable !== undefined) {
            this.sendErrorResponse(response, refusal(this.ui.unavailable));
            this.sendEvent(new TerminatedEvent());
            return;
        }
        if (!hasProgram(args)) {
            this.sendErrorResponse(response, NO_PROGRAM);
            this.sendEvent(new TerminatedEvent());
            return;
        }
        await this.ui.focusDebugConsole();
        const exitCode = await this.runner.run(
            { program: args.program, args: args.args ?? [], env: args.env ?? {} },
            this.controller.signal,
            (output) => this.output(output),
        );
        this.sendResponse(response);
        if (exitCode !== 0) {
            this.sendEvent(new ExitedEvent(exitCode));
        }
        this.sendEvent(new TerminatedEvent());
    }

    protected override disconnectRequest(response: DebugProtocol.DisconnectResponse): void {
        if (this.runner.state !== "FINISHED" && this.runner.state !== "CANCELED") {
            this.sendEvent(new OutputEvent("Execution terminated\n", "stderr"));
        }
        this.controller.abort();
        this.sendResponse(response);
    }

    /** One line of output; `start`, `startCollapsed` and `end` open and close groups, as before. */
    private output({ type, text, filePath, line }: RunOutput) {
        const event = new OutputEvent(
            `${text}\n`,
            type === "err" ? "stderr" : "stdout",
        ) as DebugProtocol.OutputEvent;
        if (text === "start" || text === "startCollapsed" || text === "end") {
            event.body.group = text;
            event.body.output = `group-${text}\n`;
        }
        if (filePath !== "") {
            event.body.source = new Source(
                basename(filePath),
                this.convertDebuggerPathToClient(filePath),
            );
            event.body.line = line;
            event.body.column = 0;
        }
        this.sendEvent(event);
    }

    override dispose(): void {
        this.controller.abort();
        super.dispose();
    }
}
