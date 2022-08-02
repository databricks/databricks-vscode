import {commands, ExtensionContext, window} from "vscode";
import {CliWrapper} from "./cli/CliWrapper";
import {ConnectionCommands} from "./configuration/ConnectionCommands";
import {ConnectionManager} from "./configuration/ConnectionManager";
import {ClusterListDataProvider} from "./cluster/ClusterListDataProvider";
import {ClusterModel} from "./cluster/ClusterModel";
import {ClusterCommands} from "./cluster/ClusterCommands";
import {ConfigurationDataProvider} from "./configuration/ConfigurationDataProvider";
import {WorkflowCommands} from "./workflow/WorkflowCommands";

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
            "databricks.connection.detachCluster",
            connectionCommands.detachClusterCommand(),
            connectionCommands
        )
    );

    // Workflow group
    const workflowCommands = new WorkflowCommands(connectionManager, context);
    context.subscriptions.push(
        commands.registerCommand(
            "databricks.run.runEditorContentsAsWorkflow",
            workflowCommands.runEditorContentsAsWorkflow(),
            workflowCommands
        )
    );

    // Cluster group
    const clusterModel = new ClusterModel(connectionManager);
    const clusterTreeDataProvider = new ClusterListDataProvider(clusterModel);
    let clusterCommands = new ClusterCommands(clusterModel);

    context.subscriptions.push(
        clusterModel,
        clusterTreeDataProvider,

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
    window.registerTreeDataProvider("clusterList", clusterTreeDataProvider);
}

// this method is called when your extension is deactivated
export function deactivate() {}
