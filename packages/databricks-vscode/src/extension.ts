import {
    commands,
    debug,
    ExtensionContext,
    tasks,
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
import {CliCommands} from "./cli/CliCommands";
import {DatabricksDebugAdapterFactory} from "./run/DatabricksDebugAdapter";
import {DatabricksWorkflowDebugAdapterFactory} from "./run/DabaricksWorkflowDebugAdapter";
import {SyncCommands} from "./sync/SyncCommands";
import {CodeSynchronizer} from "./sync/CodeSynchronizer";
import {BricksTaskProvider} from "./cli/BricksTasks";
import {ProjectConfigFileWatcher} from "./configuration/ProjectConfigFileWatcher";
import {QuickstartCommands} from "./quickstart/QuickstartCommands";
import {showQuickStartOnFirstUse} from "./quickstart/QuickStart";
import {PublicApi} from "@databricks/databricks-vscode-types";
import {initLoggers} from "./logger";
import {UtilsCommands} from "./utils/UtilsCommands";

export function activate(context: ExtensionContext): PublicApi | undefined {
    const a = workspace.workspaceFolders;
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
    initLoggers(workspace.workspaceFolders[0].uri.path);

    let cli = new CliWrapper(context);
    // Configuration group
    let connectionManager = new ConnectionManager(cli);
    connectionManager.login(false);

    const synchronizer = new CodeSynchronizer(connectionManager, cli);
    const clusterModel = new ClusterModel(connectionManager);

    let connectionCommands = new ConnectionCommands(
        connectionManager,
        clusterModel
    );
    let configurationDataProvider = new ConfigurationDataProvider(
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
        commands.registerCommand(
            "databricks.connection.login",
            connectionCommands.loginCommand(),
            connectionCommands
        ),
        commands.registerCommand(
            "databricks.connection.logout",
            connectionCommands.logoutCommand(),
            connectionCommands
        ),
        commands.registerCommand(
            "databricks.connection.configureProject",
            connectionCommands.configureProjectCommand(),
            connectionCommands
        ),
        commands.registerCommand(
            "databricks.connection.openDatabricksConfigFile",
            connectionCommands.openDatabricksConfigFileCommand(),
            connectionCommands
        ),
        commands.registerCommand(
            "databricks.connection.attachCluster",
            connectionCommands.attachClusterCommand(),
            connectionCommands
        ),
        commands.registerCommand(
            "databricks.connection.attachClusterQuickPick",
            connectionCommands.attachClusterQuickPickCommand(),
            connectionCommands
        ),
        commands.registerCommand(
            "databricks.connection.detachCluster",
            connectionCommands.detachClusterCommand(),
            connectionCommands
        ),
        commands.registerCommand(
            "databricks.connection.attachSyncDestination",
            connectionCommands.attachSyncDestinationCommand(),
            connectionCommands
        ),
        commands.registerCommand(
            "databricks.connection.detachSyncDestination",
            connectionCommands.detachWorkspaceCommand(),
            connectionCommands
        )
    );

    // Run/debug group
    const runCommands = new RunCommands(connectionManager, synchronizer);
    const debugFactory = new DatabricksDebugAdapterFactory(
        connectionManager,
        synchronizer
    );
    const debugWorkflowFactory = new DatabricksWorkflowDebugAdapterFactory(
        connectionManager,
        context,
        synchronizer
    );

    context.subscriptions.push(
        commands.registerCommand(
            "databricks.run.runEditorContents",
            runCommands.runEditorContentsCommand(),
            runCommands
        ),
        commands.registerCommand(
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
    let clusterCommands = new ClusterCommands(clusterModel, connectionManager);

    context.subscriptions.push(
        clusterModel,
        clusterTreeDataProvider,
        window.registerTreeDataProvider("clusterView", clusterTreeDataProvider),

        commands.registerCommand(
            "databricks.cluster.refresh",
            clusterCommands.refreshCommand(),
            clusterCommands
        ),
        commands.registerCommand(
            "databricks.cluster.filterByAll",
            clusterCommands.filterCommand("ALL"),
            clusterCommands
        ),
        commands.registerCommand(
            "databricks.cluster.filterByRunning",
            clusterCommands.filterCommand("RUNNING"),
            clusterCommands
        ),
        commands.registerCommand(
            "databricks.cluster.filterByMe",
            clusterCommands.filterCommand("ME"),
            clusterCommands
        ),
        commands.registerCommand(
            "databricks.cluster.start",
            clusterCommands.startClusterCommand,
            clusterCommands
        ),
        commands.registerCommand(
            "databricks.cluster.stop",
            clusterCommands.stopClusterCommand,
            clusterCommands
        )
    );

    // Sync
    const syncCommands = new SyncCommands(synchronizer);
    context.subscriptions.push(
        commands.registerCommand(
            "databricks.sync.start",
            syncCommands.startCommand("incremental"),
            syncCommands
        ),
        commands.registerCommand(
            "databricks.sync.startFull",
            syncCommands.startCommand("full"),
            syncCommands
        ),
        commands.registerCommand(
            "databricks.sync.stop",
            syncCommands.stopCommand(),
            syncCommands
        )
    );

    // CLI commands
    const cliCommands = new CliCommands(cli);
    context.subscriptions.push(
        tasks.registerTaskProvider(
            "databricks",
            new BricksTaskProvider(connectionManager, cli)
        ),
        commands.registerCommand(
            "databricks.cli.testBricksCli",
            cliCommands.testBricksCommand(),
            cliCommands
        )
    );

    context.subscriptions.push(
        new ProjectConfigFileWatcher(connectionManager, workspace.rootPath)
    );

    // Quickstart
    const quickstartCommands = new QuickstartCommands(context);
    context.subscriptions.push(
        commands.registerCommand(
            "databricks.quickstart.open",
            quickstartCommands.openQuickstartCommand(),
            quickstartCommands
        )
    );

    showQuickStartOnFirstUse(context);

    //utils
    const utilCommands = new UtilsCommands();
    context.subscriptions.push(
        commands.registerCommand(
            "databricks.utils.openExternal",
            utilCommands.openExternalCommand(),
            utilCommands
        )
    );

    return {
        connectionManager: connectionManager,
    };
}

// this method is called when your extension is deactivated
export function deactivate() {}
