import {commands, debug, ExtensionContext, Uri, window} from "vscode";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {FileUtils} from "../utils";
import {LocalUri} from "../sync/SyncDestination";
import {DatabricksPythonDebugConfiguration} from "./DatabricksDebugConfigurationProvider";
import {MsPythonExtensionWrapper} from "../language/MsPythonExtensionWrapper";
import path from "path";
import {FeatureManager, FeatureState} from "../feature-manager/FeatureManager";
import {
    escapeExecutableForTerminal,
    escapePathArgument,
} from "../utils/shellUtils";
import {CustomWhenContext} from "../vscode-objs/CustomWhenContext";
import {WorkspaceFolderManager} from "../vscode-objs/WorkspaceFolderManager";
import {Events, Telemetry} from "../telemetry";
import {PackageManagerTelemetry} from "../language/PackageManagerTelemetry";

/**
 * Run related commands
 */
export class RunCommands {
    constructor(
        private connection: ConnectionManager,
        private readonly workspaceFolderManager: WorkspaceFolderManager,
        private readonly pythonExtension: MsPythonExtensionWrapper,
        private readonly featureManager: FeatureManager,
        private readonly context: ExtensionContext,
        private readonly customWhenContext: CustomWhenContext,
        private readonly telemetry: Telemetry,
        private readonly packageManagerTelemetry: PackageManagerTelemetry
    ) {
        this.context.subscriptions.push(
            window.onDidChangeActiveTextEditor(async () =>
                this.updateRunAsWorkflowContext()
            )
        );
        this.updateRunAsWorkflowContext();
    }

    async updateRunAsWorkflowContext() {
        const uri = window.activeTextEditor?.document.uri;
        if (
            uri &&
            uri.scheme === "file" &&
            ((await FileUtils.isNotebook(new LocalUri(uri))) ||
                uri.fsPath.endsWith(".py"))
        ) {
            this.customWhenContext.setShowRunAsWorkflow(true);
        } else {
            this.customWhenContext.setShowRunAsWorkflow(false);
        }
    }

    /**
     * Run a Python file using the command execution API
     */
    runEditorContentsCommand() {
        return async (resource?: Uri) => {
            const targetResource = this.getTargetResource(resource);
            if (targetResource) {
                if (await FileUtils.isNotebook(new LocalUri(targetResource))) {
                    await window.showErrorMessage(
                        'Use "Run File as Workflow on Databricks" for running notebooks'
                    );
                    return;
                }

                if (this.connection.state === "CONNECTING") {
                    await this.connection.waitForConnect();
                }

                await debug.startDebugging(
                    undefined,
                    {
                        type: "databricks",
                        name: "Upload and Run File on Databricks",
                        request: "launch",
                        program: targetResource.fsPath,
                    },
                    {noDebug: true}
                );
            }
        };
    }

    /**
     * Run a Python file or notebook as a workflow on the connected cluster
     */
    runEditorContentsAsWorkflowCommand() {
        return async (resource?: Uri) => {
            const targetResource = this.getTargetResource(resource);
            if (targetResource) {
                if (this.connection.state === "CONNECTING") {
                    await this.connection.waitForConnect();
                }

                if (this.connection.syncDestinationMapper === undefined) {
                    throw new Error(
                        "No sync destination found. Maybe the databricks.yml is misconfgured."
                    );
                }

                await debug.startDebugging(
                    undefined,
                    {
                        type: "databricks-workflow",
                        name: "Run File on Databricks as Workflow",
                        request: "launch",
                        program: targetResource.fsPath,
                    },
                    {noDebug: true}
                );
            }
        };
    }

    private async checkDbconnectEnabled() {
        let featureState = await this.featureManager.isEnabled(
            "environment.dependencies"
        );
        if (
            featureState.available &&
            // Re-checks block on an established connection, so don't force
            // one while disconnected.
            this.connection.state === "CONNECTED" &&
            (await this.isPythonEnvironmentStale(featureState))
        ) {
            // The Python extension doesn't always notify us about interpreter
            // changes, so the cached state can refer to a previously selected
            // interpreter. Re-check before launching anything with it.
            featureState = await this.featureManager.isEnabled(
                "environment.dependencies",
                true
            );
        }
        if (featureState.available) {
            return true;
        }
        // Run the setup flow, then re-check: a successful setup should let the
        // launch proceed instead of aborting and making the user re-trigger.
        await commands.executeCommand("databricks.environment.setup");
        return (await this.featureManager.isEnabled("environment.dependencies"))
            .available;
    }

    private async isPythonEnvironmentStale(featureState: FeatureState) {
        // For an accepted checkPythonEnvironment step the message holds
        // the path of the verified python executable.
        const verifiedExecutable = featureState.steps.get(
            "checkPythonEnvironment"
        )?.message;
        const currentExecutable =
            await this.pythonExtension.getPythonExecutable();
        return (
            verifiedExecutable !== undefined &&
            verifiedExecutable !== currentExecutable
        );
    }

    private getTargetResource(resource?: Uri): Uri | undefined {
        if (!resource && window.activeTextEditor) {
            return window.activeTextEditor.document.uri;
        }
        return resource;
    }

    /**
     * Shared preflight for the run and debug Databricks Connect launchers:
     * verifies the environment, resolves the target file, and resolves the
     * python interpreter. Run and debug must use the *same* interpreter, so it
     * is resolved here in one place. Returns undefined (after surfacing an
     * error message) when any step fails.
     */
    private async resolveDbconnectLaunch(
        resource?: Uri
    ): Promise<{targetResource: Uri; executable: string} | undefined> {
        if (!(await this.checkDbconnectEnabled())) {
            return undefined;
        }
        const targetResource = this.getTargetResource(resource);
        if (!targetResource) {
            window.showErrorMessage("Open a file to run on Databricks");
            return undefined;
        }
        const executable = await this.pythonExtension.getPythonExecutable();
        if (!executable) {
            window.showErrorMessage("No python executable found");
            return undefined;
        }
        return {targetResource, executable};
    }

    createDbconnectDebugConfig(
        targetResource: Uri,
        executable: string
    ): DatabricksPythonDebugConfiguration {
        return {
            program: targetResource.fsPath,
            type: "debugpy",
            name: "Databricks Connect",
            request: "launch",
            databricks: true,
            console: "integratedTerminal",
            env: {...process.env},
            // Pin debugpy to the interpreter we have verified. Without this
            // debugpy falls back to the Python extension's selected
            // interpreter for the workspace folder, which can differ from the
            // environment used by "run" and by the verification checks.
            python: executable,
        };
    }

    async debugFileUsingDbconnect(resource?: Uri) {
        const launch = await this.resolveDbconnectLaunch(resource);
        if (!launch) {
            return;
        }
        const config = this.createDbconnectDebugConfig(
            launch.targetResource,
            launch.executable
        );

        await debug.startDebugging(
            this.workspaceFolderManager.activeWorkspaceFolder,
            config
        );

        this.telemetry.recordEvent(Events.DBCONNECT_RUN, {
            launchType: "debug",
            computeType: this.connection.serverless ? "serverless" : "cluster",
        });
        void this.packageManagerTelemetry.emitDetection("debug");
    }

    async runFileUsingDbconnect(resource?: Uri) {
        const launch = await this.resolveDbconnectLaunch(resource);
        if (!launch) {
            return;
        }
        const {targetResource, executable} = launch;

        const terminal = window.activeTerminal ?? window.createTerminal();
        const bootstrapPath = this.context.asAbsolutePath(
            path.join("resources", "python", "dbconnect-bootstrap.py")
        );
        terminal.show();
        terminal.sendText(
            `${escapeExecutableForTerminal(executable)} ${escapePathArgument(
                bootstrapPath
            )} ${escapePathArgument(targetResource.fsPath)}`
        );

        this.telemetry.recordEvent(Events.DBCONNECT_RUN, {
            launchType: "run",
            computeType: this.connection.serverless ? "serverless" : "cluster",
        });
        void this.packageManagerTelemetry.emitDetection("run");
    }
}
