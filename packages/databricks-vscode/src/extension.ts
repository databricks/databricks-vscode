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
import {ConfigurationDataProvider} from "./ui/configuration-view/ConfigurationDataProvider";
import {RunCommands} from "./run/RunCommands";
import {DatabricksDebugAdapterFactory} from "./run/DatabricksDebugAdapter";
import {DatabricksWorkflowDebugAdapterFactory} from "./run/DatabricksWorkflowDebugAdapter";
import {QuickstartCommands} from "./quickstart/QuickstartCommands";
import {showQuickStartOnFirstUse} from "./quickstart/QuickStart";
import {PublicApi} from "@databricks/databricks-vscode-types";
import {LoggerManager, Loggers} from "./logger";
import {logging} from "@databricks/databricks-sdk";
import {workspaceConfigs} from "./vscode-objs/WorkspaceConfigs";
import {
    FileUtils,
    PackageJsonUtils,
    TerraformUtils,
    UtilsCommands,
} from "./utils";
import {ConfigureAutocomplete} from "./language/ConfigureAutocomplete";
import {WorkspaceFsCommands, WorkspaceFsDataProvider} from "./workspace-fs";
import {CustomWhenContext} from "./vscode-objs/CustomWhenContext";
import {StateStorage} from "./vscode-objs/StateStorage";
import path from "node:path";
import {FeatureId, FeatureManager} from "./feature-manager/FeatureManager";
import {EnvironmentDependenciesVerifier} from "./language/EnvironmentDependenciesVerifier";
import {MsPythonExtensionWrapper} from "./language/MsPythonExtensionWrapper";
import {DatabricksEnvFileManager} from "./file-managers/DatabricksEnvFileManager";
import {getContextMetadata, Telemetry, toUserMetadata} from "./telemetry";
import "./telemetry/commandExtensions";
import {Events, Metadata} from "./telemetry/constants";
import {EnvironmentDependenciesInstaller} from "./language/EnvironmentDependenciesInstaller";
import {setDbnbCellLimits} from "./language/notebooks/DatabricksNbCellLimits";
import {DbConnectStatusBarButton} from "./language/DbConnectStatusBarButton";
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
import {TreeItemDecorationProvider} from "./ui/DecorationProvider";
import {BundleInitWizard} from "./bundle/BundleInitWizard";
import {DatabricksDebugConfigurationProvider} from "./run/DatabricksDebugConfigurationProvider";
import {BundleVariableModel} from "./bundle/models/BundleVariableModel";
import {BundleVariableTreeDataProvider} from "./ui/bundle-variables/BundleVariableTreeDataProvider";
import {ConfigurationTreeViewManager} from "./ui/configuration-view/ConfigurationTreeViewManager";
import {getCLIDependenciesEnvVars} from "./utils/envVarGenerators";
import {EnvironmentCommands} from "./language/EnvironmentCommands";
import {WorkspaceFolderManager} from "./vscode-objs/WorkspaceFolderManager";
import {SyncCommands} from "./sync/SyncCommands";
import {CodeSynchronizer} from "./sync";
import {BundlePipelinesManager} from "./bundle/BundlePipelinesManager";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const packageJson = require("../package.json");

const customWhenContext = new CustomWhenContext();

export async function activate(
    context: ExtensionContext
): Promise<PublicApi | undefined> {
    customWhenContext.setActivated(false);
    customWhenContext.setDeploymentState("idle");

    const stateStorage = new StateStorage(context);
    const packageMetadata = await PackageJsonUtils.getMetadata(context);

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

    // Loggers
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

    // Quickstart
    const quickstartCommands = new QuickstartCommands(context);
    context.subscriptions.push(
        telemetry.registerCommand(
            "databricks.quickstart.open",
            quickstartCommands.openQuickstartCommand(),
            quickstartCommands
        )
    );

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

    const workspaceFolderManager = new WorkspaceFolderManager(
        customWhenContext,
        stateStorage
    );

    // Add the databricks binary to the PATH environment variable in terminals
    context.environmentVariableCollection.clear();
    context.environmentVariableCollection.persistent = false;
    context.environmentVariableCollection.append(
        "PATH",
        `${path.delimiter}${context.asAbsolutePath("./bin")}`
    );

    // Export CLI_UPSTREAM vars to the terminal to see if extension users use the CLI directly
    context.environmentVariableCollection.replace(
        "DATABRICKS_CLI_UPSTREAM",
        "databricks-vscode-terminal"
    );
    context.environmentVariableCollection.replace(
        "DATABRICKS_CLI_UPSTREAM_VERSION",
        packageMetadata.version
    );

    // We always use bundled terraform and databricks provider.
    // Updating environment collection means that the variables will be set in all terminals.
    // If users use different CLI version in their terminal it will only pick the variables if
    // the dependency versions (that we set together with bin and config paths) match the internal versions of the CLI.
    const cliDeps = getCLIDependenciesEnvVars(context);
    for (const [key, value] of Object.entries(cliDeps)) {
        logging.NamedLogger.getOrCreate(Loggers.Extension).debug(
            `Setting env var ${key}=${value}`
        );
        context.environmentVariableCollection.replace(key, value);
    }
    TerraformUtils.updateTerraformCliConfig(
        context,
        packageJson.terraformMetadata
    ).catch((e) => {
        logging.NamedLogger.getOrCreate(Loggers.Extension).error(
            "Failed to update terraform cli config",
            e
        );
    });

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
        workspaceFolderManager,
        stateStorage
    );

    cli.setPythonExtension(pythonExtensionWrapper);

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
    const bundleFileSet = new BundleFileSet(workspaceFolderManager);
    const bundleFileWatcher = new BundleWatcher(
        bundleFileSet,
        workspaceFolderManager
    );
    const bundleValidateModel = new BundleValidateModel(
        bundleFileWatcher,
        cli,
        workspaceFolderManager
    );

    const overrideableConfigModel = new OverrideableConfigModel(
        workspaceFolderManager
    );
    const bundlePreValidateModel = new BundlePreValidateModel(
        bundleFileSet,
        bundleFileWatcher
    );
    const bundleRemoteStateModel = new BundleRemoteStateModel(
        cli,
        workspaceFolderManager,
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
        workspaceFolderManager,
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
        commands.registerCommand("databricks.internal.showOutput", () => {
            loggerManager.showOutputChannel("Databricks Logs");
        }),
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
        workspaceFolderManager,
        telemetry
    );
    context.subscriptions.push(
        bundleProjectManager,
        telemetry.registerCommand(
            "databricks.bundle.selectActiveProjectFolder",
            bundleProjectManager.selectActiveProjectFolder,
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
        workspaceFolderManager,
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

    const configureAutocomplete = new ConfigureAutocomplete(
        context,
        stateStorage,
        workspaceFolderManager
    );
    context.subscriptions.push(
        configureAutocomplete,
        telemetry.registerCommand(
            "databricks.autocomplete.configure",
            configureAutocomplete.configureCommand,
            configureAutocomplete
        )
    );

    const environmentDependenciesInstaller =
        new EnvironmentDependenciesInstaller(
            connectionManager,
            pythonExtensionWrapper
        );
    const featureManager = new FeatureManager<FeatureId>([]);
    featureManager.registerFeature(
        "environment.dependencies",
        () =>
            new EnvironmentDependenciesVerifier(
                connectionManager,
                pythonExtensionWrapper,
                environmentDependenciesInstaller,
                configureAutocomplete
            )
    );
    const environmentCommands = new EnvironmentCommands(
        featureManager,
        pythonExtensionWrapper,
        environmentDependenciesInstaller
    );
    context.subscriptions.push(
        telemetry.registerCommand(
            "databricks.environment.setup",
            environmentCommands.setup,
            environmentCommands
        ),
        telemetry.registerCommand(
            "databricks.environment.refresh",
            environmentCommands.refresh,
            environmentCommands
        ),
        telemetry.registerCommand(
            "databricks.environment.selectPythonInterpreter",
            environmentCommands.selectPythonInterpreter,
            environmentCommands
        ),
        telemetry.registerCommand(
            "databricks.environment.reinstallDBConnect",
            async () =>
                environmentCommands.reinstallDBConnect(
                    connectionManager.cluster
                )
        )
    );

    const dbConnectStatusBarButton = new DbConnectStatusBarButton(
        featureManager
    );

    const databricksEnvFileManager = new DatabricksEnvFileManager(
        workspaceFolderManager,
        featureManager,
        connectionManager,
        configModel
    );

    const notebookInitScriptManager = new NotebookInitScriptManager(
        workspaceFolderManager,
        context,
        connectionManager,
        featureManager,
        pythonExtensionWrapper,
        databricksEnvFileManager
    );

    context.subscriptions.push(
        dbConnectStatusBarButton,
        notebookInitScriptManager,
        telemetry.registerCommand(
            "databricks.notebookInitScript.verify",
            notebookInitScriptManager.verifyInitScriptCommand,
            notebookInitScriptManager
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
        workspaceFolderManager.onDidChangeActiveProjectFolder(() => {
            databricksEnvFileManager.dispose();
            databricksEnvFileManager.init();
        }),
        showRestartNotebookDialogue(databricksEnvFileManager)
    );
    featureManager.isEnabled("environment.dependencies");

    const codeSynchroniser = new CodeSynchronizer(
        connectionManager,
        configModel,
        cli,
        packageMetadata
    );

    const syncCommands = new SyncCommands(codeSynchroniser);
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
    const configurationDataProvider = new ConfigurationDataProvider(
        connectionManager,
        codeSynchroniser,
        bundleProjectManager,
        configModel,
        cli,
        featureManager,
        workspaceFolderManager
    );
    const configurationView = window.createTreeView("configurationView", {
        treeDataProvider: configurationDataProvider,
    });

    const configurationTreeViewManager = new ConfigurationTreeViewManager(
        configurationView,
        configModel
    );

    const clusterModel = new ClusterModel(connectionManager);

    const connectionCommands = new ConnectionCommands(
        workspaceFsCommands,
        connectionManager,
        clusterModel,
        configModel,
        cli
    );

    context.subscriptions.push(
        configurationDataProvider,
        configurationView,
        configurationTreeViewManager,
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
    const bundlePipelinesManager = new BundlePipelinesManager(
        connectionManager,
        bundleRunStatusManager,
        configModel
    );
    const bundleResourceExplorerTreeDataProvider =
        new BundleResourceExplorerTreeDataProvider(
            context,
            configModel,
            connectionManager,
            bundleRunStatusManager,
            bundlePipelinesManager
        );

    const bundleCommands = new BundleCommands(
        bundleRemoteStateModel,
        bundleRunStatusManager,
        bundlePipelinesManager,
        bundleValidateModel,
        configModel,
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
        bundlePipelinesManager,
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
            "databricks.bundle.forceDeploy",
            bundleCommands.forceDeployCommand,
            bundleCommands
        ),
        telemetry.registerCommand(
            "databricks.bundle.forceDestroy",
            bundleCommands.forceDestroyCommand,
            bundleCommands
        ),
        telemetry.registerCommand(
            "databricks.bundle.deployAndRunFromInput",
            bundleCommands.deployAndRunFromInput,
            bundleCommands
        ),
        telemetry.registerCommand(
            "databricks.bundle.deployAndRunJob",
            bundleCommands.deployAndRun,
            bundleCommands
        ),
        telemetry.registerCommand(
            "databricks.bundle.deployAndRunPipeline",
            bundleCommands.deployAndRun,
            bundleCommands
        ),
        telemetry.registerCommand(
            "databricks.bundle.deployAndValidatePipeline",
            bundleCommands.deployAndValidate,
            bundleCommands
        ),
        telemetry.registerCommand(
            "databricks.bundle.deployAndRunSelectedTables",
            bundleCommands.deployAndRunSelectedTables,
            bundleCommands
        ),
        telemetry.registerCommand(
            "databricks.bundle.clearPipelineDiagnostics",
            bundleCommands.clearPipelineDiagnostics,
            bundleCommands
        ),
        telemetry.registerCommand(
            "databricks.bundle.showPipelineEventDetails",
            bundleCommands.showPipelineEventDetails,
            bundleCommands
        ),
        telemetry.registerCommand(
            "databricks.bundle.cancelRun",
            bundleCommands.cancelRun,
            bundleCommands
        ),
        telemetry.registerCommand(
            "databricks.bundle.destroy",
            bundleCommands.destroy,
            bundleCommands
        )
    );

    // Bundle variables
    const bundleVariableModel = new BundleVariableModel(
        configModel,
        bundleValidateModel,
        workspaceFolderManager
    );
    cli.bundleVariableModel = bundleVariableModel;
    const bundleVariableTreeDataProvider = new BundleVariableTreeDataProvider(
        bundleVariableModel
    );
    context.subscriptions.push(
        bundleVariableModel,
        window.registerTreeDataProvider(
            "dabsVariableView",
            bundleVariableTreeDataProvider
        ),
        telemetry.registerCommand(
            "databricks.bundle.variable.openFile",
            bundleVariableModel.openBundleVariableFile,
            bundleVariableModel
        ),
        telemetry.registerCommand(
            "databricks.bundle.variable.reset",
            bundleVariableModel.deleteBundleVariableFile,
            bundleVariableModel
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
        workspaceFolderManager,
        pythonExtensionWrapper,
        featureManager,
        context,
        customWhenContext,
        telemetry
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
        bundleCommands,
        telemetry
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

    setDbnbCellLimits(workspaceFolderManager, connectionManager).catch((e) => {
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

    const configureWorkspace = () => {
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
    };

    configureWorkspace();
    workspaceFolderManager.onDidChangeActiveProjectFolder(configureWorkspace);

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
