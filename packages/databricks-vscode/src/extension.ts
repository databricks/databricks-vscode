import {commands, debug, ExtensionContext, window, workspace} from "vscode";
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
import {ProjectConfigFile} from "./configuration/ProjectConfigFile";

export function activate(context: ExtensionContext) {
    let cli = new CliWrapper();

    // Configuration group
    let connectionManager = new ConnectionManager(cli);
    connectionManager.login(false);

    let connectionCommands = new ConnectionCommands(connectionManager);
    let configurationDataProvider = new ConfigurationDataProvider(
        connectionManager
    );
    window.registerTreeDataProvider(
        "configurationView",
        configurationDataProvider
    );

    context.subscriptions.push(
        configurationDataProvider,

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
    const runCommands = new RunCommands(connectionManager, context);
    const debugFactory = new DatabricksDebugAdapterFactory(connectionManager);
    const debugWorkflowFactory = new DatabricksWorkflowDebugAdapterFactory(
        connectionManager,
        context
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
    const clusterModel = new ClusterModel(connectionManager);
    const clusterTreeDataProvider = new ClusterListDataProvider(clusterModel);
    let clusterCommands = new ClusterCommands(clusterModel);

    context.subscriptions.push(
        clusterModel,
        clusterTreeDataProvider,
        window.registerTreeDataProvider("clusterList", clusterTreeDataProvider),

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
        )
    );

    // Tasks
    const cliCommands = new CliCommands(connectionManager, cli);
    context.subscriptions.push(
        commands.registerCommand(
            "databricks.cli.startSync",
            cliCommands.startSyncCommand("incremental"),
            cliCommands
        ),
        commands.registerCommand(
            "databricks.cli.startSyncFull",
            cliCommands.startSyncCommand("full"),
            cliCommands
        ),
        commands.registerCommand(
            "databricks.cli.stopSync",
            cliCommands.stopSyncCommand(),
            cliCommands
        ),
        commands.registerCommand(
            "databricks.cli.testBricksCli",
            cliCommands.testBricksCommand(context),
            cliCommands
        )
    );

    const configFileWatcher = workspace.createFileSystemWatcher(
        ProjectConfigFile.getProjectConfigFilePath(),
        true
    );

    context.subscriptions.push(
        configFileWatcher.onDidChange(async (e) => {
            await connectionManager.login();
        }),
        configFileWatcher.onDidDelete(async (e) => {
            await connectionManager.logout();
        })
    );
}

// this method is called when your extension is deactivated
export function deactivate() {}
