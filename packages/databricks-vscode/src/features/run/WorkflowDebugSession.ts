import { DebugSession, ExitedEvent, InitializedEvent, TerminatedEvent } from "@vscode/debugadapter";
import type { DebugProtocol } from "@vscode/debugprotocol";
import { hasProgram, NO_PROGRAM, refusal } from "./DatabricksDebugSession";
import { Subject } from "./Subject";
import type { WorkflowRunner } from "./WorkflowRunner";

/** The `databricks-workflow` launch attributes (RUN-03). */
export interface WorkflowLaunchArguments extends DebugProtocol.LaunchRequestArguments {
    /** An absolute path to the file. */
    program: string;
    /** A notebook's widget values. */
    parameters?: Record<string, string>;
    /** A Python file's command-line arguments. */
    args?: string[];
}

/**
 * The `databricks-workflow` debug adapter (RUN-02). It only translates the
 * protocol: `WorkflowRunner` runs, and shows the run in its panel. Ported
 * from the old `DatabricksWorkflowDebugAdapter`.
 */
export class WorkflowDebugSession extends DebugSession {
    private readonly configurationDone = new Subject();
    private readonly controller = new AbortController();

    constructor(
        private readonly runner: WorkflowRunner,
        private readonly showError: (message: string) => void,
        /** Why this window can't run the workflow (a session's fixed compute): a launch fails with it. */
        private readonly unavailable?: string,
    ) {
        super();
    }

    protected override initializeRequest(response: DebugProtocol.InitializeResponse): void {
        response.body = {
            ...response.body,
            supportsConfigurationDoneRequest: true,
            supportsCancelRequest: true,
            supportTerminateDebuggee: true,
        };
        this.sendResponse(response);
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
        args: WorkflowLaunchArguments,
    ): void {
        void this.launch(response, args);
    }

    protected override launchRequest(
        response: DebugProtocol.LaunchResponse,
        args: WorkflowLaunchArguments,
    ): void {
        void this.launch(response, args);
    }

    /** Runs the workflow, then ends the session and answers the request. */
    private async launch(
        response: DebugProtocol.Response,
        args: WorkflowLaunchArguments,
    ): Promise<void> {
        await this.configurationDone.wait(1000).catch(() => {});
        if (this.unavailable !== undefined) {
            this.sendErrorResponse(response, refusal(this.unavailable));
            this.sendEvent(new TerminatedEvent());
            return;
        }
        if (!hasProgram(args)) {
            this.sendErrorResponse(response, NO_PROGRAM);
            this.sendEvent(new TerminatedEvent());
            return;
        }
        const result = await this.runner.run(
            { program: args.program, parameters: args.parameters ?? {}, args: args.args ?? [] },
            this.controller.signal,
        );
        if (!result.ok) {
            if (result.error !== undefined) {
                this.showError(result.error);
            }
            this.sendEvent(new ExitedEvent(1));
        }
        this.sendEvent(new TerminatedEvent());
        this.sendResponse(response);
    }

    protected override disconnectRequest(response: DebugProtocol.DisconnectResponse): void {
        this.controller.abort();
        this.sendResponse(response);
    }

    override dispose(): void {
        this.controller.abort();
        super.dispose();
    }
}
