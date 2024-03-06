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
import {QuickstartCommands} from "./quickstart/QuickstartCommands";
import {showQuickStartOnFirstUse} from "./quickstart/QuickStart";
import {PublicApi} from "@databricks/databricks-vscode-types";
import {LoggerManager, Loggers} from "./logger";
import {logging} from "@databricks/databricks-sdk";
import {workspaceConfigs} from "./vscode-objs/WorkspaceConfigs";
import {FileUtils, PackageJsonUtils, UtilsCommands} from "./utils";
import {ConfigureAutocomplete} from "./language/ConfigureAutocomplete";
import {WorkspaceFsCommands, WorkspaceFsDataProvider} from "./workspace-fs";
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
import {TreeItemDecorationProvider} from "./ui/bundle-resource-explorer/DecorationProvider";
import {BundleInitWizard} from "./bundle/BundleInitWizard";
import {DatabricksDebugConfigurationProvider} from "./run/DatabricksDebugConfigurationProvider";

const customWhenContext = new CustomWhenContext();

export async function activate(
    context: ExtensionContext
): Promise<PublicApi | undefined> {
    customWhenContext.setActivated(false);
    customWhenContext.setDeploymentState("idle");

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

    const telemetry = Telemetry.createDefault();
    telemetry.setMetadata(Metadata.CONTEXT, getContextMetadata());

    const loggerManager = new LoggerManager(context);
    if (workspaceConfigs.loggingEnabled) {
        loggerManager.initLoggers();
    }

    let cliLogFilePath;
    try {
        cliLogFilePath = await loggerManager.getLogFile("databricks-cli");
    } catch (e) {
        logging.NamedLogger.getOrCreate(Loggers.Extension).error(
            "Failed to create a log file for the CLI",
            e
        );
    }
    const cli = new CliWrapper(context, loggerManager, cliLogFilePath);
    context.extensionPath;

    if (
        workspace.workspaceFolders === undefined ||
        workspace.workspaceFolders?.length === 0
    ) {
        context.subscriptions.push(
            telemetry.registerCommand(
                "databricks.bundle.initNewProject",
                async () => {
                    const bundleInitWizard = new BundleInitWizard(
                        cli,
                        telemetry
                    );
                    await bundleInitWizard.initNewProject();
                }
            )
        );
        // We show a welcome view when there's no workspace folders, prompting users
        // to either open a new folder or to initialize a new databricks project.
        // In both cases we expect the workspace to be reloaded and the extension will
        // be activated again.
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
        workspaceUri,
        stateStorage
    );

    context.subscriptions.push(
        telemetry.registerCommand(
            "databricks.logs.openFolder",
            loggerManager.openLogFolder,
            loggerManager
        ),
        telemetry.registerCommand(
            "databricks.bundle.showLogs",
            () => loggerManager.showOutputChannel("Databricks Bundle Logs"),
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
    const bundleFileSet = new BundleFileSet(workspaceUri);
    const bundleFileWatcher = new BundleWatcher(bundleFileSet, workspaceUri);
    const bundleValidateModel = new BundleValidateModel(
        bundleFileWatcher,
        cli,
        workspaceUri
    );

    const overrideableConfigModel = new OverrideableConfigModel(workspaceUri);
    const bundlePreValidateModel = new BundlePreValidateModel(
        bundleFileSet,
        bundleFileWatcher
    );
    const bundleRemoteStateModel = new BundleRemoteStateModel(
        cli,
        workspaceUri,
        workspaceConfigs
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
        customWhenContext,
        telemetry
    );
    context.subscriptions.push(
        bundleFileWatcher,
        bundleValidateModel,
        overrideableConfigModel,
        bundlePreValidateModel,
        bundleRemoteStateModel,
        configModel,
        connectionManager,
        connectionManager.onDidChangeState(async () => {
            telemetry.setMetadata(
                Metadata.USER,
                await toUserMetadata(connectionManager)
            );
            telemetry.recordEvent(Events.CONNECTION_STATE_CHANGED, {
                newState: connectionManager.state,
            });
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
        workspaceUri,
        telemetry
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
        workspaceUri,
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

    const clusterModel = new ClusterModel(connectionManager);

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

    const databricksEnvFileManager = new DatabricksEnvFileManager(
        workspaceUri,
        featureManager,
        connectionManager,
        configModel
    );

    const notebookInitScriptManager = new NotebookInitScriptManager(
        workspaceUri,
        context,
        connectionManager,
        featureManager,
        pythonExtensionWrapper,
        databricksEnvFileManager,
        configModel
    );

    context.subscriptions.push(
        dbConnectStatusBarButton,
        notebookInitScriptManager,
        telemetry.registerCommand(
            "databricks.notebookInitScript.verify",
            notebookInitScriptManager.verifyInitScriptCommand,
            notebookInitScriptManager
        ),
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
                        `Error while trying to initialize Databricks Notebooks. Some features may not work. Reason: ${featureState.reason}`
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
        workspaceUri.fsPath,
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
        configModel
    );

    const connectionCommands = new ConnectionCommands(
        workspaceFsCommands,
        connectionManager,
        clusterModel,
        configModel,
        cli
    );

    context.subscriptions.push(
        configurationDataProvider,

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
            FileUtils.openDatabricksConfigFile
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
            "databricks.connection.saveNewProfile",
            connectionCommands.saveNewProfileCommand,
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
        configModel,
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
        bundleRunStatusManager,
        bundleValidateModel,
        customWhenContext,
        telemetry
    );
    const decorationProvider = new TreeItemDecorationProvider(
        bundleResourceExplorerTreeDataProvider,
        configurationDataProvider
    );
    context.subscriptions.push(
        bundleResourceExplorerTreeDataProvider,
        bundleCommands,
        bundleRunTerminalManager,
        decorationProvider,
        window.registerFileDecorationProvider(decorationProvider),
        window.registerTreeDataProvider(
            "dabsResourceExplorerView",
            bundleResourceExplorerTreeDataProvider
        ),
        telemetry.registerCommand(
            "databricks.bundle.refreshRemoteState",
            bundleCommands.refreshCommand,
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
    const databricksDebugConfigurationProvider =
        new DatabricksDebugConfigurationProvider(
            context,
            databricksEnvFileManager
        );

    const runCommands = new RunCommands(
        connectionManager,
        workspace.workspaceFolders[0],
        pythonExtensionWrapper,
        featureManager,
        context
    );
    const debugFactory = new DatabricksDebugAdapterFactory(
        connectionManager,
        configModel,
        bundleCommands,
        context
    );
    const debugWorkflowFactory = new DatabricksWorkflowDebugAdapterFactory(
        connectionManager,
        configModel,
        context,
        bundleCommands
    );

    context.subscriptions.push(
        debug.registerDebugConfigurationProvider(
            "python",
            databricksDebugConfigurationProvider
        ),
        debug.registerDebugConfigurationProvider(
            "debugpy",
            databricksDebugConfigurationProvider
        ),
        telemetry.registerCommand(
            "databricks.run.dbconnect.debug",
            runCommands.debugFileUsingDbconnect,
            runCommands
        ),
        telemetry.registerCommand(
            "databricks.run.dbconnect.run",
            runCommands.runFileUsingDbconnect,
            runCommands
        ),
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
        telemetry.registerCommand(
            "databricks.utils.copy",
            utilCommands.copyToClipboardCommand(),
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

    setDbnbCellLimits(workspaceUri, connectionManager).catch((e) => {
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

    const recordInitializationEvent = telemetry.start(
        Events.EXTENSION_INITIALIZATION
    );
    bundleProjectManager
        .configureWorkspace()
        .catch((e) => {
            recordInitializationEvent({success: false});
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
    telemetry.recordEvent(Events.EXTENSION_ACTIVATION);

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
