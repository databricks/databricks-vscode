import {
    ExitedEvent,
    InitializedEvent,
    LoggingDebugSession,
    OutputEvent,
    Source,
    TerminatedEvent,
} from "@vscode/debugadapter";
import {DebugProtocol} from "@vscode/debugprotocol";
import {basename} from "node:path";

import {
    DebugAdapterDescriptor,
    DebugAdapterDescriptorFactory,
    DebugAdapterInlineImplementation,
    Disposable,
    ProviderResult,
    commands,
    window,
    ExtensionContext,
} from "vscode";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {CodeSynchronizer} from "../sync/CodeSynchronizer";
import {DatabricksRuntime} from "./DatabricksRuntime";
import {Subject} from "./Subject";

/**
 * This interface describes the mock-debug specific launch attributes
 * (which are not part of the Debug Adapter Protocol).
 * The schema for these attributes lives in the package.json of the mock-debug extension.
 * The interface should always match this schema.
 */
interface ILaunchRequestArguments extends DebugProtocol.LaunchRequestArguments {
    /** An absolute path to the "program" to debug. */
    program: string;

    /** Command line arguments */
    args?: string[];

    /** Env variables */
    env?: Record<string, string>;
}

export class DatabricksDebugAdapterFactory
    implements DebugAdapterDescriptorFactory, Disposable
{
    constructor(
        private connection: ConnectionManager,
        private codeSynchroniser: CodeSynchronizer,
        private context: ExtensionContext
    ) {}

    dispose() {}

    createDebugAdapterDescriptor(): ProviderResult<DebugAdapterDescriptor> {
        return new DebugAdapterInlineImplementation(
            new DatabricksDebugSession(
                this.connection,
                this.codeSynchroniser,
                this.context
            )
        );
    }
}

export class DatabricksDebugSession extends LoggingDebugSession {
    private runtime: DatabricksRuntime;
    private _configurationDone = new Subject();
    private disposables: Disposable[] = [];

    constructor(
        connection: ConnectionManager,
        codeSynchronizer: CodeSynchronizer,
        context: ExtensionContext
    ) {
        super();

        this.runtime = new DatabricksRuntime(
            connection,
            codeSynchronizer,
            context
        );

        this.disposables.push(
            this.runtime,
            this.runtime.onDidSendOutput(
                ({type, text, filePath, line, column}) => {
                    let category: string;
                    switch (type) {
                        case "prio":
                            category = "important";
                            break;
                        case "out":
                            category = "stdout";
                            break;
                        case "err":
                            category = "stderr";
                            break;
                        default:
                            category = "console";
                            break;
                    }
                    const e: OutputEvent = new OutputEvent(
                        `${text}\n`,
                        category
                    );
                    const body = e.body as any;

                    if (
                        text === "start" ||
                        text === "startCollapsed" ||
                        text === "end"
                    ) {
                        body.group = text;
                        e.body.output = `group-${text}\n`;
                    }

                    body.source = this.createSource(filePath);
                    body.line = line;
                    body.column = column;

                    this.sendEvent(e);
                }
            ),

            this.runtime.onDidEnd(() => {
                this.sendEvent(new TerminatedEvent());
            }),

            this.runtime.onError((errorMessage) => {
                window.showErrorMessage(errorMessage);
                this.sendEvent(new ExitedEvent(1));
                this.sendEvent(new TerminatedEvent());
            })
        );
    }

    /**
     * The 'initialize' request is the first request called by the frontend
     * to interrogate the features the debug adapter provides.
     */
    protected initializeRequest(
        response: DebugProtocol.InitializeResponse,
        args: DebugProtocol.InitializeRequestArguments
    ): void {
        args.supportsProgressReporting = true;

        args.supportsInvalidatedEvent = false;

        // build and return the capabilities of this debug adapter:
        response.body = response.body || {};

        // the adapter implements the configurationDone request.
        response.body.supportsConfigurationDoneRequest = true;

        // make VS Code use 'evaluate' when hovering over source
        response.body.supportsEvaluateForHovers = false;

        // make VS Code show a 'step back' button
        response.body.supportsStepBack = false;

        // make VS Code support data breakpoints
        response.body.supportsDataBreakpoints = false;

        // make VS Code support completion in REPL
        response.body.supportsCompletionsRequest = false;
        response.body.completionTriggerCharacters = [];

        // make VS Code send cancel request
        response.body.supportsCancelRequest = true;

        // make VS Code send the breakpointLocations request
        response.body.supportsBreakpointLocationsRequest = false;

        // make VS Code provide "Step in Target" functionality
        response.body.supportsStepInTargetsRequest = false;

        // the adapter defines two exceptions filters, one with support for conditions.
        response.body.supportsExceptionFilterOptions = false;
        response.body.exceptionBreakpointFilters = [];

        // make VS Code send exceptionInfo request
        response.body.supportsExceptionInfoRequest = false;

        // make VS Code send setVariable request
        response.body.supportsSetVariable = false;

        // make VS Code send setExpression request
        response.body.supportsSetExpression = false;

        // make VS Code send disassemble request
        response.body.supportsDisassembleRequest = false;
        response.body.supportsSteppingGranularity = false;
        response.body.supportsInstructionBreakpoints = false;

        // make VS Code able to read and write variable memory
        response.body.supportsReadMemoryRequest = false;
        response.body.supportsWriteMemoryRequest = false;

        response.body.supportSuspendDebuggee = true;
        response.body.supportTerminateDebuggee = true;

        this.sendResponse(response);

        // since this debug adapter can accept configuration requests like 'setBreakpoint' at any time,
        // we request them early by sending an 'initializeRequest' to the frontend.
        // The frontend will end the configuration sequence by calling 'configurationDone' request.
        this.sendEvent(new InitializedEvent());
    }

    /**
     * Called at the end of the configuration sequence.
     * Indicates that all breakpoints etc. have been sent to the DA and that the 'launch' can start.
     */
    protected configurationDoneRequest(
        response: DebugProtocol.ConfigurationDoneResponse,
        args: DebugProtocol.ConfigurationDoneArguments
    ): void {
        super.configurationDoneRequest(response, args);

        // notify the launchRequest that configuration has finished
        this._configurationDone.notify();
    }

    protected async disconnectRequest(): Promise<void> {
        await this.runtime.disconnect();
    }

    protected async attachRequest(
        response: DebugProtocol.AttachResponse,
        args: ILaunchRequestArguments
    ) {
        return this.launchRequest(response, args);
    }

    protected async launchRequest(
        response: DebugProtocol.LaunchResponse,
        args: ILaunchRequestArguments
    ) {
        // wait 1 second until configuration has finished (and configurationDoneRequest has been called)
        await this._configurationDone.wait(1000);

        // show debug output view
        await commands.executeCommand("workbench.panel.repl.view.focus");

        // start the program in the runtime
        await this.runtime.start(args.program, args.args || [], args.env || {});
        this.sendResponse(response);
    }

    private createSource(filePath: string): Source {
        return new Source(
            basename(filePath),
            this.convertDebuggerPathToClient(filePath)
        );
    }

    dispose() {
        this.disposables.forEach((obj) => obj.dispose());
    }
}
