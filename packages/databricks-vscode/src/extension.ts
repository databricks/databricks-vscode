import {commands, debug, ExtensionContext, window, workspace} from "vscode";
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
import {ProjectConfigFileWatcher} from "./configuration/ProjectConfigFileWatcher";
import {QuickstartCommands} from "./quickstart/QuickstartCommands";
import {showQuickStartOnFirstUse} from "./quickstart/QuickStart";
import {PublicApi} from "@databricks/databricks-vscode-types";
import {LoggerManager, Loggers} from "./logger";
import {NamedLogger} from "@databricks/databricks-sdk/dist/logging";
import {workspaceConfigs} from "./WorkspaceConfigs";
import {PackageJsonUtils, UtilsCommands} from "./utils";
import {ConfigureAutocomplete} from "./language/ConfigureAutocomplete";
import TelemetryReporter from "@vscode/extension-telemetry";

export async function activate(
    context: ExtensionContext
): Promise<PublicApi | undefined> {
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

    // create telemetry reporter on extension activation
    const pkg = await PackageJsonUtils.getMetadata(context);
    const reporter = new TelemetryReporter(
        pkg.packageName,
        pkg.version,
        "dc4ec136-d862-4379-8d5f-b1746222d7f5",
        false
    );

    // ensure it gets properly disposed. Upon disposal the events will be flushed
    context.subscriptions.push(reporter);

    function registerCommand(
        command: string,
        callback: (...args: any[]) => any,
        thisArg?: any
    ) {
        return commands.registerCommand(
            command,
            (...args) => {
                reporter.sendTelemetryEvent(`command-${command}`);
                return callback.call(thisArg, ...args);
            },
            thisArg
        );
    }

    const loggerManager = new LoggerManager(context);
    if (workspaceConfigs.loggingEnabled) {
        loggerManager.initLoggers();
    }

    NamedLogger.getOrCreate(Loggers.Extension).debug("Metadata", {
        metadata: await PackageJsonUtils.getMetadata(context),
    });

    const configureAutocomplete = new ConfigureAutocomplete(
        context,
        workspace.workspaceFolders[0].uri.fsPath
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

    const synchronizer = new CodeSynchronizer(connectionManager, cli);
    const clusterModel = new ClusterModel(connectionManager);

    const connectionCommands = new ConnectionCommands(
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

    // Run/debug group
    const runCommands = new RunCommands(connectionManager, synchronizer);
    const debugFactory = new DatabricksDebugAdapterFactory(
        connectionManager,
        synchronizer,
        context
    );
    const debugWorkflowFactory = new DatabricksWorkflowDebugAdapterFactory(
        connectionManager,
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

    //utils
    const utilCommands = new UtilsCommands.UtilsCommands();
    context.subscriptions.push(
        registerCommand(
            "databricks.utils.openExternal",
            utilCommands.openExternalCommand(),
            utilCommands
        )
    );

    connectionManager.login(false).catch((e) => {
        NamedLogger.getOrCreate("Extension").error("Login error", e);
    });

    return {
        connectionManager: connectionManager,
    };
}

// this method is called when your extension is deactivated
export function deactivate() {}
