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
import {ConfigurationDataProvider} from "./configuration/ui/ConfigurationDataProvider";
import {RunCommands} from "./run/RunCommands";
import {DatabricksDebugAdapterFactory} from "./run/DatabricksDebugAdapter";
import {DatabricksWorkflowDebugAdapterFactory} from "./run/DatabricksWorkflowDebugAdapter";
import {CodeSynchronizer} from "./sync/CodeSynchronizer";
import {QuickstartCommands} from "./quickstart/QuickstartCommands";
import {showQuickStartOnFirstUse} from "./quickstart/QuickStart";
import {PublicApi} from "@databricks/databricks-vscode-types";
import {LoggerManager, Loggers} from "./logger";
import {logging} from "@databricks/databricks-sdk";
import {workspaceConfigs} from "./vscode-objs/WorkspaceConfigs";
import {PackageJsonUtils, UtilsCommands} from "./utils";
import {ConfigureAutocomplete} from "./language/ConfigureAutocomplete";
import {
    WorkspaceFsAccessVerifier,
    WorkspaceFsCommands,
    WorkspaceFsDataProvider,
} from "./workspace-fs";
import {CustomWhenContext} from "./vscode-objs/CustomWhenContext";
import {StateStorage} from "./vscode-objs/StateStorage";
import path from "node:path";
import {FeatureId, FeatureManager} from "./feature-manager/FeatureManager";
import {DbConnectAccessVerifier} from "./language/DbConnectAccessVerifier";
import {MsPythonExtensionWrapper} from "./language/MsPythonExtensionWrapper";
import {DatabricksEnvFileManager} from "./file-managers/DatabricksEnvFileManager";
import {getContextMetadata, Telemetry, toUserMetadata} from "./telemetry";
import "./telemetry/commandExtensions";
import {Events, Metadata} from "./telemetry/constants";
import {DbConnectInstallPrompt} from "./language/DbConnectInstallPrompt";
import {setDbnbCellLimits} from "./language/notebooks/DatabricksNbCellLimits";
import {DbConnectStatusBarButton} from "./language/DbConnectStatusBarButton";
import {NotebookAccessVerifier} from "./language/notebooks/NotebookAccessVerifier";
import {NotebookInitScriptManager} from "./language/notebooks/NotebookInitScriptManager";
import {showRestartNotebookDialogue} from "./language/notebooks/restartNotebookDialogue";
import {
    BundleWatcher,
    BundleFileSet,
    registerBundleAutocompleteProvider,
} from "./bundle";
import {showWhatsNewPopup} from "./whatsNewPopup";
import {BundleValidateModel} from "./bundle/models/BundleValidateModel";
import {ConfigModel} from "./configuration/models/ConfigModel";
import {OverrideableConfigModel} from "./configuration/models/OverrideableConfigModel";
import {BundlePreValidateModel} from "./bundle/models/BundlePreValidateModel";
import {BundleRemoteStateModel} from "./bundle/models/BundleRemoteStateModel";
import {BundleResourceExplorerTreeDataProvider} from "./ui/bundle-resource-explorer/BundleResourceExplorerTreeDataProvider";
import {BundleCommands} from "./ui/bundle-resource-explorer/BundleCommands";
import {BundleRunTerminalManager} from "./bundle/run/BundleRunTerminalManager";
import {BundleRunStatusManager} from "./bundle/run/BundleRunStatusManager";
import {BundleProjectManager} from "./bundle/BundleProjectManager";

const customWhenContext = new CustomWhenContext();

export async function activate(
    context: ExtensionContext
): Promise<PublicApi | undefined> {
    customWhenContext.setActivated(false);

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

    const workspaceUri = workspace.workspaceFolders[0].uri;
    const stateStorage = new StateStorage(context);

    // Add the databricks binary to the PATH environment variable in terminals
    context.environmentVariableCollection.clear();
    context.environmentVariableCollection.persistent = false;
    context.environmentVariableCollection.prepend(
        "PATH",
        `${context.asAbsolutePath("./bin")}${path.delimiter}`
    );

    const loggerManager = new LoggerManager(context);
    if (workspaceConfigs.loggingEnabled) {
        loggerManager.initLoggers();
    }

    const telemetry = Telemetry.createDefault();
    telemetry.setMetadata(Metadata.CONTEXT, getContextMetadata());

    const packageMetadata = await PackageJsonUtils.getMetadata(context);
    logging.NamedLogger.getOrCreate(Loggers.Extension).debug("Metadata", {
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
        stateStorage
    );

    context.subscriptions.push(
        telemetry.registerCommand(
            "databricks.logs.openFolder",
            loggerManager.openLogFolder,
            loggerManager
        )
    );

    // manage contexts for experimental features
    function updateFeatureContexts() {
        customWhenContext.updateShowClusterView();
        customWhenContext.updateShowWorkspaceView();
    }

    updateFeatureContexts();
    context.subscriptions.push(
        workspace.onDidChangeConfiguration(updateFeatureContexts)
    );

    // Configuration group
    let cliLogFilePath;
    try {
        cliLogFilePath = await loggerManager.getLogFile("databricks-cli");
    } catch (e) {
        logging.NamedLogger.getOrCreate(Loggers.Extension).error(
            "Failed to create a log file for the CLI",
            e
        );
    }
    const cli = new CliWrapper(context, cliLogFilePath);
    const bundleFileSet = new BundleFileSet(workspace.workspaceFolders[0].uri);
    const bundleFileWatcher = new BundleWatcher(bundleFileSet);
    const bundleValidateModel = new BundleValidateModel(
        bundleFileWatcher,
        cli,
        workspaceUri
    );

    const overrideableConfigModel = new OverrideableConfigModel(stateStorage);
    const bundlePreValidateModel = new BundlePreValidateModel(
        bundleFileSet,
        bundleFileWatcher
    );
    const bundleRemoteStateModel = new BundleRemoteStateModel(
        cli,
        workspaceUri,
        workspaceConfigs,
        bundleValidateModel
    );
    const configModel = new ConfigModel(
        bundleValidateModel,
        overrideableConfigModel,
        bundlePreValidateModel,
        bundleRemoteStateModel,
        customWhenContext,
        stateStorage
    );

    const connectionManager = new ConnectionManager(
        cli,
        configModel,
        workspaceUri,
        customWhenContext
    );
    context.subscriptions.push(
        bundleFileWatcher,
        bundleValidateModel,
        overrideableConfigModel,
        bundlePreValidateModel,
        bundleRemoteStateModel,
        configModel,
        connectionManager,
        connectionManager.onDidChangeState(async (state) => {
            telemetry.setMetadata(
                Metadata.USER,
                await toUserMetadata(connectionManager)
            );
            telemetry.recordEvent(Events.CONNECTION_STATE_CHANGED, {
                newState: connectionManager.state,
            });
            if (state === "CONNECTED") {
                telemetry.recordEvent(Events.SYNC_DESTINATION, {
                    destination: workspaceConfigs.syncDestinationType,
                });
            }
        })
    );

    const metadataService = await connectionManager.startMetadataService();
    context.subscriptions.push(metadataService);

    const bundleProjectManager = new BundleProjectManager(
        context,
        cli,
        customWhenContext,
        connectionManager,
        configModel,
        bundleFileSet,
        workspaceUri
    );
    context.subscriptions.push(
        bundleProjectManager,
        telemetry.registerCommand(
            "databricks.bundle.openSubProject",
            bundleProjectManager.openSubProjects,
            bundleProjectManager
        ),
        telemetry.registerCommand(
            "databricks.bundle.initNewProject",
            bundleProjectManager.initNewProject,
            bundleProjectManager
        ),
        telemetry.registerCommand(
            "databricks.bundle.startManualMigration",
            bundleProjectManager.startManualMigration,
            bundleProjectManager
        )
    );

    const workspaceFsDataProvider = new WorkspaceFsDataProvider(
        connectionManager
    );
    const workspaceFsCommands = new WorkspaceFsCommands(
        workspace.workspaceFolders[0].uri,
        connectionManager,
        workspaceFsDataProvider
    );

    context.subscriptions.push(
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

    const wsfsAccessVerifier = new WorkspaceFsAccessVerifier(
        connectionManager,
        stateStorage,
        synchronizer,
        telemetry
    );

    context.subscriptions.push(wsfsAccessVerifier);

    const dbConnectInstallPrompt = new DbConnectInstallPrompt(
        stateStorage,
        pythonExtensionWrapper
    );
    const featureManager = new FeatureManager<FeatureId>([]);
    featureManager.registerFeature(
        "debugging.dbconnect",
        () =>
            new DbConnectAccessVerifier(
                connectionManager,
                pythonExtensionWrapper,
                dbConnectInstallPrompt
            )
    );

    featureManager.registerFeature(
        "notebooks.dbconnect",
        () =>
            new NotebookAccessVerifier(
                featureManager,
                pythonExtensionWrapper,
                stateStorage
            )
    );

    const dbConnectStatusBarButton = new DbConnectStatusBarButton(
        featureManager
    );

    const notebookInitScriptManager = new NotebookInitScriptManager(
        workspace.workspaceFolders[0].uri,
        context,
        connectionManager,
        featureManager,
        pythonExtensionWrapper
    );

    context.subscriptions.push(
        notebookInitScriptManager,
        telemetry.registerCommand(
            "databricks.notebookInitScript.verify",
            notebookInitScriptManager.verifyInitScriptCommand,
            notebookInitScriptManager
        )
    );

    const databricksEnvFileManager = new DatabricksEnvFileManager(
        workspace.workspaceFolders[0].uri,
        featureManager,
        dbConnectStatusBarButton,
        connectionManager,
        context,
        notebookInitScriptManager
    );

    context.subscriptions.push(
        workspace.onDidOpenNotebookDocument(() =>
            featureManager.isEnabled("notebooks.dbconnect")
        ),
        featureManager.onDidChangeState(
            "notebooks.dbconnect",
            async (featureState) => {
                const dbconnectState = await featureManager.isEnabled(
                    "debugging.dbconnect"
                );
                if (!dbconnectState.avaliable) {
                    return; // Only take action of notebook errors, when dbconnect is avaliable
                }
                if (featureState.action) {
                    featureState.action();
                } else if (
                    !featureState.isDisabledByFf &&
                    featureState.reason
                ) {
                    window.showErrorMessage(
                        `Error while trying to initialise Databricks Notebooks. Some features may not work. Reason: ${featureState.reason}`
                    );
                }
            }
        )
    );

    notebookInitScriptManager.updateInitScript().catch((e) => {
        logging.NamedLogger.getOrCreate(Loggers.Extension).error(
            "Failed to update init script",
            e
        );
        if (e instanceof Error) {
            window.showWarningMessage(
                `Failed to update databricks notebook init script. ` +
                    `Some databricks notebook features may not work. ${e.message}`
            );
        }
    });

    databricksEnvFileManager.init();
    context.subscriptions.push(
        databricksEnvFileManager,
        showRestartNotebookDialogue(databricksEnvFileManager)
    );
    featureManager.isEnabled("debugging.dbconnect");

    const configureAutocomplete = new ConfigureAutocomplete(
        context,
        stateStorage,
        workspace.workspaceFolders[0].uri.fsPath,
        pythonExtensionWrapper,
        dbConnectInstallPrompt
    );
    context.subscriptions.push(
        configureAutocomplete,
        telemetry.registerCommand(
            "databricks.autocomplete.configure",
            configureAutocomplete.configureCommand,
            configureAutocomplete
        )
    );

    const configurationDataProvider = new ConfigurationDataProvider(
        connectionManager,
        bundleProjectManager,
        synchronizer,
        configModel
    );

    const connectionCommands = new ConnectionCommands(
        workspaceFsCommands,
        connectionManager,
        clusterModel,
        configModel
    );

    context.subscriptions.push(
        configurationDataProvider,
        synchronizer,

        window.registerTreeDataProvider(
            "configurationView",
            configurationDataProvider
        ),
        telemetry.registerCommand(
            "databricks.connection.bundle.selectTarget",
            connectionCommands.selectTarget,
            connectionCommands
        ),
        telemetry.registerCommand(
            "databricks.connection.logout",
            connectionCommands.logoutCommand,
            connectionCommands
        ),
        telemetry.registerCommand(
            "databricks.connection.configureLogin",
            connectionCommands.configureLoginCommand,
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
        )
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
            clusterCommands.refreshCommand,
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

    // Bundle resource explorer
    const bundleRunTerminalManager = new BundleRunTerminalManager(
        bundleRemoteStateModel
    );
    const bundleRunStatusManager = new BundleRunStatusManager(
        bundleRemoteStateModel,
        bundleRunTerminalManager
    );
    const bundleResourceExplorerTreeDataProvider =
        new BundleResourceExplorerTreeDataProvider(
            configModel,
            bundleRunStatusManager,
            context,
            connectionManager
        );

    const bundleCommands = new BundleCommands(
        bundleRemoteStateModel,
        bundleRunStatusManager
    );
    context.subscriptions.push(
        bundleResourceExplorerTreeDataProvider,
        bundleCommands,
        bundleRunTerminalManager,
        window.registerTreeDataProvider(
            "dabsResourceExplorerView",
            bundleResourceExplorerTreeDataProvider
        ),
        telemetry.registerCommand(
            "databricks.bundle.refreshRemoteState",
            bundleCommands.refreshRemoteStateCommand,
            bundleCommands
        ),
        telemetry.registerCommand(
            "databricks.bundle.deploy",
            bundleCommands.deployCommand,
            bundleCommands
        ),
        telemetry.registerCommand(
            "databricks.bundle.deployAndRun",
            bundleCommands.deployAndRun,
            bundleCommands
        ),
        telemetry.registerCommand(
            "databricks.bundle.cancelRun",
            bundleCommands.cancelRun,
            bundleCommands
        )
    );

    // Run/debug group
    const runCommands = new RunCommands(connectionManager);
    const debugFactory = new DatabricksDebugAdapterFactory(
        connectionManager,
        bundleCommands,
        context,
        wsfsAccessVerifier
    );
    const debugWorkflowFactory = new DatabricksWorkflowDebugAdapterFactory(
        connectionManager,
        wsfsAccessVerifier,
        context,
        bundleCommands
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
        logging.NamedLogger.getOrCreate("Extension").error(
            "Quick Start error",
            e
        );
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
    registerBundleAutocompleteProvider(
        cli,
        bundleFileSet,
        bundleFileWatcher,
        context
    ).catch((e) => {
        logging.NamedLogger.getOrCreate("Extension").error(
            "Failed to load bundle schema: ",
            e
        );
    });

    setDbnbCellLimits(
        workspace.workspaceFolders[0].uri,
        connectionManager
    ).catch((e) => {
        logging.NamedLogger.getOrCreate(Loggers.Extension).error(
            "Error while setting jupyter configs for parsing databricks notebooks",
            e
        );
    });

    showWhatsNewPopup(context, stateStorage)
        .catch((e) => {
            logging.NamedLogger.getOrCreate(Loggers.Extension).error(
                "Error while showing popup for what's new",
                e
            );
        })
        .finally(() => {
            stateStorage.set(
                "databricks.lastInstalledExtensionVersion",
                packageMetadata.version
            );
        });

    context.subscriptions.push(
        commands.registerCommand("databricks.internal.clearOverrides", () => {
            stateStorage.set("databricks.bundle.overrides", undefined);
            configModel.setTarget(undefined);
            configModel.setAuthProvider(undefined);
        })
    );

    bundleProjectManager
        .configureWorkspace()
        .catch((e) => {
            logging.NamedLogger.getOrCreate(Loggers.Extension).error(
                "Failed to configure workspace",
                e
            );
            window.showErrorMessage(e);
        })
        .finally(() => {
            customWhenContext.setInitialized();
        });

    customWhenContext.setActivated(true);
    telemetry.recordEvent(Events.EXTENSION_ACTIVATED);

    const publicApi: PublicApi = {
        version: 1,
        connectionManager: connectionManager,
    };
    return publicApi;
}

// this method is called when your extension is deactivated
export function deactivate() {
    customWhenContext.setActivated(false);
}
