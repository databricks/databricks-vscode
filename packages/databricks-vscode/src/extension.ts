import {
    commands,
    debug,
    env,
    ExtensionContext,
    extensions,
    ProgressLocation,
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
import {ProjectConfigFileWatcher} from "./configuration/ProjectConfigFileWatcher";
import {QuickstartCommands} from "./quickstart/QuickstartCommands";
import {showQuickStartOnFirstUse} from "./quickstart/QuickStart";
import {PublicApi} from "@databricks/databricks-vscode-types";
import {LoggerManager, Loggers} from "./logger";
import {NamedLogger} from "@databricks/databricks-sdk/dist/logging";
import {workspaceConfigs} from "./WorkspaceConfigs";
import {PackageJsonUtils, UtilsCommands} from "./utils";
import {ConfigureAutocomplete} from "./language/ConfigureAutocomplete";
import {WorkspaceFsCommands, WorkspaceFsDataProvider} from "./workspace-fs";
import {generateBundleSchema} from "./bundle/GenerateBundle";
import {execFile} from "child_process";
import {promisify} from "util";

/**
 * VSCode associates extensions with ids. We had to change the id of the extension from `databricks.databricks-vsode`
 * to `databricks.databricks` after private preview. This check prompts all private preview users to uninstall the
 * old extension, either manually or by attempting to unsintall it automatically.
 */
async function hasOldExtension() {
    const ext = await extensions.getExtension("databricks.databricks-vscode");
    if (ext === undefined) {
        return false;
    }
    const choice = await window.showErrorMessage(
        `Please uninstall the old databricks extension. Run rm -rf ${ext.extensionPath}`,
        {modal: true},
        "Try deleting automatically",
        "Delete Manually"
    );

    if (choice === "Try deleting automatically") {
        const {stderr} = await window.withProgress(
            {location: ProgressLocation.Notification},
            async (progress) => {
                progress.report({message: `Deleting ${ext.extensionPath}`});
                return await promisify(execFile)(`rm`, [
                    "-r",
                    ext.extensionPath,
                ]);
            }
        );

        if (stderr !== "") {
            const shouldCopy = await window.showErrorMessage(
                `Couldn't delete old databricks extension. Please run rm -r "${ext.extensionPath}" manually.`,
                {modal: true, detail: stderr},
                "Copy command to clipboard"
            );

            if (shouldCopy === "Copy command to clipboard") {
                await env.clipboard.writeText(`rm -r "${ext.extensionPath}"`);
            }
            window.showErrorMessage("Could not activate Databricks extension");
            return true;
        }

        commands.executeCommand("Developer: Reload Window");
    }
}

export async function activate(
    context: ExtensionContext
): Promise<PublicApi | undefined> {
    if (await hasOldExtension()) {
        return undefined;
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
        `${context.asAbsolutePath("./bin")}:`
    );

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
        commands.registerCommand(
            "databricks.autocomplete.configure",
            configureAutocomplete.configureCommand,
            configureAutocomplete
        )
    );

    context.subscriptions.push(
        commands.registerCommand(
            "databricks.logs.openFolder",
            loggerManager.openLogFolder,
            loggerManager
        )
    );

    const cli = new CliWrapper(context);
    // Configuration group
    const connectionManager = new ConnectionManager(cli);

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
        commands.registerCommand(
            "databricks.wsfs.attachSyncDestination",
            workspaceFsCommands.attachSyncDestination,
            workspaceFsCommands
        ),
        commands.registerCommand(
            "databricks.wsfs.refresh",
            workspaceFsCommands.refresh,
            workspaceFsCommands
        ),
        commands.registerCommand(
            "databricks.wsfs.createFolder",
            workspaceFsCommands.createFolder,
            workspaceFsCommands
        )
    );

    const synchronizer = new CodeSynchronizer(connectionManager, cli);
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
        commands.registerCommand(
            "databricks.connection.logout",
            connectionCommands.logoutCommand(),
            connectionCommands
        ),
        commands.registerCommand(
            "databricks.connection.configureWorkspace",
            connectionCommands.configureWorkspaceCommand(),
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
        synchronizer,
        context
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
    const clusterCommands = new ClusterCommands(
        clusterModel,
        connectionManager
    );

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

    showQuickStartOnFirstUse(context).catch((e) => {
        NamedLogger.getOrCreate("Extension").error("Quick Start error", e);
    });

    // Utils
    const utilCommands = new UtilsCommands.UtilsCommands();
    context.subscriptions.push(
        commands.registerCommand(
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

    connectionManager.login(false).catch((e) => {
        NamedLogger.getOrCreate("Extension").error("Login error", e);
    });

    return {
        connectionManager: connectionManager,
    };
}

// this method is called when your extension is deactivated
export function deactivate() {}
