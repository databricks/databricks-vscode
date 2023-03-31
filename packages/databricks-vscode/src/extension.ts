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
import {FeatureManager} from "./feature-manager/FeatureManager";
import {DbConnectAccessVerifier} from "./language/DbConnectAccessVerifier";
import {MsPythonExtensionWrapper} from "./language/MsPythonExtensionWrapper";
import { updateUserMetadata } from "./telemetry";
import { registerCommand } from "./utils/commandRegistration";

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
        workspace.workspaceFolders[0].uri
    );
    const workspaceStateManager = new WorkspaceStateManager(context);

    const configureAutocomplete = new ConfigureAutocomplete(
        context,
        workspaceStateManager,
        workspace.workspaceFolders[0].uri.fsPath,
        pythonExtensionWrapper
    );
    context.subscriptions.push(
        configureAutocomplete,
        registerCommand(
            "databricks.autocomplete.configure",
            configureAutocomplete.configureCommand,
            configureAutocomplete
        )
    );

    context.subscriptions.push(
        registerCommand(
            "databricks.logs.openFolder",
            loggerManager.openLogFolder,
            loggerManager
        )
    );

    const cli = new CliWrapper(context);
    // Configuration group
    const connectionManager = new ConnectionManager(cli);
    connectionManager.onDidChangeDatabricksWorkspace(updateUserMetadata)

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
        window.registerTreeDataProvider(
            "workspaceFsView",
            workspaceFsDataProvider
        ),
        registerCommand(
            "databricks.wsfs.attachSyncDestination",
            workspaceFsCommands.attachSyncDestination,
            workspaceFsCommands
        ),
        registerCommand(
            "databricks.wsfs.refresh",
            workspaceFsCommands.refresh,
            workspaceFsCommands
        ),
        registerCommand(
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
    const configurationDataProvider = new ConfigurationDataProvider(
        connectionManager,
        synchronizer
    );

    context.subscriptions.push(
        configurationDataProvider,
        synchronizer,

        window.registerTreeDataProvider(
            "configurationView",
            configurationDataProvider
        ),
        registerCommand(
            "databricks.connection.logout",
            connectionCommands.logoutCommand(),
            connectionCommands
        ),
        registerCommand(
            "databricks.connection.configureWorkspace",
            connectionCommands.configureWorkspaceCommand(),
            connectionCommands
        ),
        registerCommand(
            "databricks.connection.openDatabricksConfigFile",
            connectionCommands.openDatabricksConfigFileCommand(),
            connectionCommands
        ),
        registerCommand(
            "databricks.connection.attachCluster",
            connectionCommands.attachClusterCommand(),
            connectionCommands
        ),
        registerCommand(
            "databricks.connection.attachClusterQuickPick",
            connectionCommands.attachClusterQuickPickCommand(),
            connectionCommands
        ),
        registerCommand(
            "databricks.connection.detachCluster",
            connectionCommands.detachClusterCommand(),
            connectionCommands
        ),
        registerCommand(
            "databricks.connection.attachSyncDestination",
            connectionCommands.attachSyncDestinationCommand(),
            connectionCommands
        ),
        registerCommand(
            "databricks.connection.detachSyncDestination",
            connectionCommands.detachWorkspaceCommand(),
            connectionCommands
        )
    );

    const wsfsAccessVerifier = new WorkspaceFsAccessVerifier(
        connectionManager,
        synchronizer
    );
    context.subscriptions.push(wsfsAccessVerifier);

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
        registerCommand(
            "databricks.run.runEditorContents",
            runCommands.runEditorContentsCommand(),
            runCommands
        ),
        registerCommand(
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

        registerCommand(
            "databricks.cluster.refresh",
            clusterCommands.refreshCommand(),
            clusterCommands
        ),
        registerCommand(
            "databricks.cluster.filterByAll",
            clusterCommands.filterCommand("ALL"),
            clusterCommands
        ),
        registerCommand(
            "databricks.cluster.filterByRunning",
            clusterCommands.filterCommand("RUNNING"),
            clusterCommands
        ),
        registerCommand(
            "databricks.cluster.filterByMe",
            clusterCommands.filterCommand("ME"),
            clusterCommands
        ),
        registerCommand(
            "databricks.cluster.start",
            clusterCommands.startClusterCommand,
            clusterCommands
        ),
        registerCommand(
            "databricks.cluster.stop",
            clusterCommands.stopClusterCommand,
            clusterCommands
        )
    );

    // Sync
    const syncCommands = new SyncCommands(synchronizer);
    context.subscriptions.push(
        registerCommand(
            "databricks.sync.start",
            syncCommands.startCommand("incremental"),
            syncCommands
        ),
        registerCommand(
            "databricks.sync.startFull",
            syncCommands.startCommand("full"),
            syncCommands
        ),
        registerCommand(
            "databricks.sync.stop",
            syncCommands.stopCommand(),
            syncCommands
        )
    );

    context.subscriptions.push(
        new ProjectConfigFileWatcher(connectionManager, workspace.rootPath)
    );

    // Quickstart
    const quickstartCommands = new QuickstartCommands(context);
    context.subscriptions.push(
        registerCommand(
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
        registerCommand(
            "databricks.utils.openExternal",
            utilCommands.openExternalCommand(),
            utilCommands
        )
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
    const dbConnectAccessVerifier = new DbConnectAccessVerifier(
        connectionManager,
        pythonExtensionWrapper,
        workspaceStateManager
    );
    featureManager.registerFeature(
        "debugging.dbconnect",
        dbConnectAccessVerifier
    );
    context.subscriptions.push(
        dbConnectAccessVerifier,
        featureManager.onDidChangeState(
            "debugging.dbconnect",
            async (state) => {
                if (state.avaliable) {
                    window.showInformationMessage("Db Connect is enabled");
                    return;
                }
                if (state.reason) {
                    window.showErrorMessage(
                        `DB Connect is disabled because ${state.reason}`
                    );
                }
                if (state.action) {
                    await state.action();
                }
            }
        )
    );
    featureManager.isEnabled("debugging.dbconnect");

    context.subscriptions.push(
        commands.registerCommand(
            "databricks.test.pipFreeze",
            dbConnectAccessVerifier.checkDbConnectInstall,
            dbConnectAccessVerifier
        )
    );
    connectionManager.login(false).catch((e) => {
        NamedLogger.getOrCreate(Loggers.Extension).error("Login error", e);
    });

    CustomWhenContext.setActivated(true);
    return {
        connectionManager: connectionManager,
    };
}

// this method is called when your extension is deactivated
export function deactivate() {
    CustomWhenContext.setActivated(false);
}
