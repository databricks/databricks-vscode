import {
    commands,
    debug,
    ExtensionContext,
    extensions,
    window,
    workspace,
} from "vscode";
import {CliWrapper} from "./cli/CliWrapper";
import {ConnectionCommands} from "./configuration/ConnectionCommands";
import {ConnectionManager} from "./configuration/ConnectionManager";
import {ClusterListDataProvider} from "./cluster/ClusterListDataProvider";
import {ClusterModel} from "./cluster/ClusterModel";
import {ClusterCommands} from "./cluster/ClusterCommands";
import {ConfigurationDataProvider} from "./configuration/ConfigurationDataProvider";
import {RunCommands} from "./run/RunCommands";
import {DatabricksDebugAdapterFactory} from "./run/DatabricksDebugAdapter";
import {DatabricksWorkflowDebugAdapterFactory} from "./run/DatabricksWorkflowDebugAdapter";
import {SyncCommands} from "./sync/SyncCommands";
import {CodeSynchronizer} from "./sync/CodeSynchronizer";
import {ProjectConfigFileWatcher} from "./file-managers/ProjectConfigFileWatcher";
import {QuickstartCommands} from "./quickstart/QuickstartCommands";
import {showQuickStartOnFirstUse} from "./quickstart/QuickStart";
import {PublicApi} from "@databricks/databricks-vscode-types";
import {LoggerManager, Loggers} from "./logger";
import {NamedLogger} from "@databricks/databricks-sdk/dist/logging";
import {workspaceConfigs} from "./vscode-objs/WorkspaceConfigs";
import {PackageJsonUtils, UtilsCommands} from "./utils";
import {ConfigureAutocomplete} from "./language/ConfigureAutocomplete";
import {
    WorkspaceFsAccessVerifier,
    WorkspaceFsCommands,
    WorkspaceFsDataProvider,
} from "./workspace-fs";
import {generateBundleSchema} from "./bundle/GenerateBundle";
import {CustomWhenContext} from "./vscode-objs/CustomWhenContext";
import {WorkspaceStateManager} from "./vscode-objs/WorkspaceState";
import path from "node:path";
import {MetadataServiceManager} from "./configuration/auth/MetadataServiceManager";
import {FeatureManager} from "./feature-manager/FeatureManager";
import {DbConnectAccessVerifier} from "./language/DbConnectAccessVerifier";
import {MsPythonExtensionWrapper} from "./language/MsPythonExtensionWrapper";
import {DatabricksEnvFileManager} from "./file-managers/DatabricksEnvFileManager";
import {Telemetry, toUserMetadata} from "./telemetry";
import "./telemetry/commandExtensions";
import {Events, Metadata} from "./telemetry/constants";

export async function activate(
    context: ExtensionContext
): Promise<PublicApi | undefined> {
    CustomWhenContext.setActivated(false);

    if (extensions.getExtension("databricks.databricks-vscode") !== undefined) {
        await commands.executeCommand(
            "workbench.extensions.uninstallExtension",
            "databricks.databricks-vscode"
        );

        await commands.executeCommand("workbench.action.reloadWindow");
    }

    if (!(await PackageJsonUtils.checkArchCompat(context))) {
        return undefined;
    }

    if (
        workspace.workspaceFolders === undefined ||
        workspace.workspaceFolders?.length === 0
    ) {
        window.showErrorMessage("Open a folder to use Databricks extension");
        /*
            We force the user to open a folder from the databricks sidebar view. Returning
            here blocks all other commands from running. 
            Since the workspace is reloaded when a folder is opened, the activation function
            is called again. Therefore this won't block the activation of the extension on a
            valid workspace.
        */
        return undefined;
    }

    const workspaceStateManager = new WorkspaceStateManager(context);

    // Add the bricks binary to the PATH environment variable in terminals
    context.environmentVariableCollection.persistent = true;
    context.environmentVariableCollection.prepend(
        "PATH",
        `${context.asAbsolutePath("./bin")}${path.delimiter}`
    );

    const loggerManager = new LoggerManager(context);
    if (workspaceConfigs.loggingEnabled) {
        loggerManager.initLoggers();
    }

    const telemetry = Telemetry.createDefault();

    const packageMetadata = await PackageJsonUtils.getMetadata(context);
    NamedLogger.getOrCreate(Loggers.Extension).debug("Metadata", {
        metadata: packageMetadata,
    });

    const pythonExtension = extensions.getExtension("ms-python.python");
    if (pythonExtension === undefined) {
        window.showWarningMessage(
            "VSCode Extension for Databricks requires Microsoft Python."
        );
        return;
    }
    if (!pythonExtension.isActive) {
        await pythonExtension.activate();
    }

    const pythonExtensionWrapper = new MsPythonExtensionWrapper(
        pythonExtension,
        workspace.workspaceFolders[0].uri,
        workspaceStateManager
    );

    const configureAutocomplete = new ConfigureAutocomplete(
        context,
        workspaceStateManager,
        workspace.workspaceFolders[0].uri.fsPath,
        pythonExtensionWrapper
    );
    context.subscriptions.push(
        configureAutocomplete,
        telemetry.registerCommand(
            "databricks.autocomplete.configure",
            configureAutocomplete.configureCommand,
            configureAutocomplete
        )
    );

    context.subscriptions.push(
        telemetry.registerCommand(
            "databricks.logs.openFolder",
            loggerManager.openLogFolder,
            loggerManager
        )
    );

    const cli = new CliWrapper(context);

    // Configuration group
    const connectionManager = new ConnectionManager(cli);
    context.subscriptions.push(
        connectionManager.onDidChangeState(async () => {
            telemetry.setMetadata(
                Metadata.USER,
                await toUserMetadata(connectionManager.databricksWorkspace)
            );
            telemetry.recordEvent(Events.CONNECTION_STATE_CHANGED, {
                newState: connectionManager.state,
            });
        })
    );
    const metadataServiceManager = new MetadataServiceManager(
        connectionManager
    );
    await metadataServiceManager.listen();

    const workspaceFsDataProvider = new WorkspaceFsDataProvider(
        connectionManager
    );
    const workspaceFsCommands = new WorkspaceFsCommands(
        workspace.workspaceFolders[0].uri,
        workspaceStateManager,
        connectionManager,
        workspaceFsDataProvider
    );

    context.subscriptions.push(
        metadataServiceManager,
        window.registerTreeDataProvider(
            "workspaceFsView",
            workspaceFsDataProvider
        ),
        telemetry.registerCommand(
            "databricks.wsfs.refresh",
            workspaceFsCommands.refresh,
            workspaceFsCommands
        ),
        telemetry.registerCommand(
            "databricks.wsfs.createFolder",
            workspaceFsCommands.createFolder,
            workspaceFsCommands
        )
    );

    const synchronizer = new CodeSynchronizer(
        connectionManager,
        cli,
        packageMetadata
    );
    const clusterModel = new ClusterModel(connectionManager);

    const connectionCommands = new ConnectionCommands(
        workspaceFsCommands,
        connectionManager,
        clusterModel
    );

    const wsfsAccessVerifier = new WorkspaceFsAccessVerifier(
        connectionManager,
        workspaceStateManager,
        synchronizer
    );

    context.subscriptions.push(wsfsAccessVerifier);

    const configurationDataProvider = new ConfigurationDataProvider(
        connectionManager,
        synchronizer,
        workspaceStateManager,
        wsfsAccessVerifier
    );

    context.subscriptions.push(
        configurationDataProvider,
        synchronizer,

        window.registerTreeDataProvider(
            "configurationView",
            configurationDataProvider
        ),
        telemetry.registerCommand(
            "databricks.connection.logout",
            connectionCommands.logoutCommand(),
            connectionCommands
        ),
        telemetry.registerCommand(
            "databricks.connection.configureWorkspace",
            connectionCommands.configureWorkspaceCommand(),
            connectionCommands
        ),
        telemetry.registerCommand(
            "databricks.connection.openDatabricksConfigFile",
            connectionCommands.openDatabricksConfigFileCommand(),
            connectionCommands
        ),
        telemetry.registerCommand(
            "databricks.connection.attachCluster",
            connectionCommands.attachClusterCommand(),
            connectionCommands
        ),
        telemetry.registerCommand(
            "databricks.connection.attachClusterQuickPick",
            connectionCommands.attachClusterQuickPickCommand(),
            connectionCommands
        ),
        telemetry.registerCommand(
            "databricks.connection.detachCluster",
            connectionCommands.detachClusterCommand(),
            connectionCommands
        ),
        telemetry.registerCommand(
            "databricks.connection.attachSyncDestination",
            connectionCommands.attachSyncDestinationCommand(),
            connectionCommands
        ),
        telemetry.registerCommand(
            "databricks.connection.detachSyncDestination",
            connectionCommands.detachWorkspaceCommand(),
            connectionCommands
        )
    );

    // Run/debug group
    const runCommands = new RunCommands(connectionManager);
    const debugFactory = new DatabricksDebugAdapterFactory(
        connectionManager,
        synchronizer,
        context,
        wsfsAccessVerifier
    );
    const debugWorkflowFactory = new DatabricksWorkflowDebugAdapterFactory(
        connectionManager,
        wsfsAccessVerifier,
        context,
        synchronizer
    );

    context.subscriptions.push(
        telemetry.registerCommand(
            "databricks.run.runEditorContents",
            runCommands.runEditorContentsCommand(),
            runCommands
        ),
        telemetry.registerCommand(
            "databricks.run.runEditorContentsAsWorkflow",
            runCommands.runEditorContentsAsWorkflowCommand(),
            runCommands
        ),
        debug.registerDebugAdapterDescriptorFactory("databricks", debugFactory),
        debugFactory,
        debug.registerDebugAdapterDescriptorFactory(
            "databricks-workflow",
            debugWorkflowFactory
        ),
        debugWorkflowFactory
    );

    // Cluster group
    const clusterTreeDataProvider = new ClusterListDataProvider(clusterModel);
    const clusterCommands = new ClusterCommands(
        clusterModel,
        connectionManager
    );

    context.subscriptions.push(
        clusterModel,
        clusterTreeDataProvider,
        window.registerTreeDataProvider("clusterView", clusterTreeDataProvider),

        telemetry.registerCommand(
            "databricks.cluster.refresh",
            clusterCommands.refreshCommand(),
            clusterCommands
        ),
        telemetry.registerCommand(
            "databricks.cluster.filterByAll",
            clusterCommands.filterCommand("ALL"),
            clusterCommands
        ),
        telemetry.registerCommand(
            "databricks.cluster.filterByRunning",
            clusterCommands.filterCommand("RUNNING"),
            clusterCommands
        ),
        telemetry.registerCommand(
            "databricks.cluster.filterByMe",
            clusterCommands.filterCommand("ME"),
            clusterCommands
        ),
        telemetry.registerCommand(
            "databricks.cluster.start",
            clusterCommands.startClusterCommand,
            clusterCommands
        ),
        telemetry.registerCommand(
            "databricks.cluster.stop",
            clusterCommands.stopClusterCommand,
            clusterCommands
        )
    );

    // Sync
    const syncCommands = new SyncCommands(synchronizer);
    context.subscriptions.push(
        telemetry.registerCommand(
            "databricks.sync.start",
            syncCommands.startCommand("incremental"),
            syncCommands
        ),
        telemetry.registerCommand(
            "databricks.sync.startFull",
            syncCommands.startCommand("full"),
            syncCommands
        ),
        telemetry.registerCommand(
            "databricks.sync.stop",
            syncCommands.stopCommand(),
            syncCommands
        )
    );

    context.subscriptions.push(
        new ProjectConfigFileWatcher(
            connectionManager,
            workspace.rootPath!,
            cli.bricksPath
        )
    );

    // Quickstart
    const quickstartCommands = new QuickstartCommands(context);
    context.subscriptions.push(
        telemetry.registerCommand(
            "databricks.quickstart.open",
            quickstartCommands.openQuickstartCommand(),
            quickstartCommands
        )
    );

    showQuickStartOnFirstUse(context).catch((e) => {
        NamedLogger.getOrCreate("Extension").error("Quick Start error", e);
    });

    // Utils
    const utilCommands = new UtilsCommands.UtilsCommands();
    context.subscriptions.push(
        telemetry.registerCommand(
            "databricks.utils.openExternal",
            utilCommands.openExternalCommand(),
            utilCommands
        ),
        telemetry.registerCommand("databricks.call", (fn) => {
            if (fn) {
                fn();
            }
        })
    );

    // generate a json schema for bundle root and load a custom provider into
    // redhat.vscode-yaml extension to validate bundle config files with this schema
    generateBundleSchema(cli).catch((e) => {
        NamedLogger.getOrCreate("Extension").error(
            "Failed to load bundle schema: ",
            e
        );
    });

    const featureManager = new FeatureManager<"debugging.dbconnect">([
        "debugging.dbconnect",
    ]);
    featureManager.registerFeature(
        "debugging.dbconnect",
        () =>
            new DbConnectAccessVerifier(
                connectionManager,
                pythonExtensionWrapper,
                workspaceStateManager,
                context
            )
    );
    const databricksEnvFileManager = new DatabricksEnvFileManager(
        workspace.workspaceFolders[0].uri,
        featureManager,
        connectionManager,
        context
    );
    context.subscriptions.push(
        databricksEnvFileManager,
        databricksEnvFileManager.onDidChangeEnvironmentVariables(() => {
            if (workspace.notebookDocuments.length) {
                window.showInformationMessage(
                    "Environment variables have changed. Restart all jupyter kernels to pickup the latest environment variables."
                );
            }
        })
    );
    featureManager.isEnabled("debugging.dbconnect");

    connectionManager.login(false).catch((e) => {
        NamedLogger.getOrCreate(Loggers.Extension).error("Login error", e);
    });

    CustomWhenContext.setActivated(true);
    telemetry.recordEvent(Events.EXTENSION_ACTIVATED);
    return {
        connectionManager: connectionManager,
    };
}

// this method is called when your extension is deactivated
export function deactivate() {
    CustomWhenContext.setActivated(false);
}
