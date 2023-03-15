import {ConfigurationTarget, workspace} from "vscode";
import {SyncDestinationType} from "../sync/SyncDestination";

export const workspaceConfigs = {
    get maxFieldLength() {
        return (
            workspace
                .getConfiguration("databricks")
                ?.get<number>("logs.maxFieldLength") ?? 40
        );
    },
    get truncationDepth() {
        return (
            workspace
                .getConfiguration("databricks")
                ?.get<number>("logs.truncationDepth") ?? 2
        );
    },
    get maxArrayLength() {
        return (
            workspace
                .getConfiguration("databricks")
                ?.get<number>("logs.maxArrayLength") ?? 2
        );
    },
    get loggingEnabled() {
        return (
            workspace
                .getConfiguration("databricks")
                ?.get<boolean>("logs.enabled") ?? true
        );
    },
    get onlyShowAccessibleClusters() {
        return (
            workspace
                .getConfiguration("databricks")
                ?.get<boolean>("clusters.onlyShowAccessibleClusters") ?? false
        );
    },
    get bricksVerboseMode() {
        return (
            workspace
                .getConfiguration("databricks")
                ?.get<boolean>("bricks.verboseMode") ?? false
        );
    },

    get syncDestinationType() {
        return (
            workspace
                .getConfiguration("databricks")
                ?.get<SyncDestinationType>("sync.destinationType") ?? "repo"
        );
    },

    get enableFilesInWorkspace() {
        return this.syncDestinationType === "workspace";
    },

    async setSyncDestinationType(destinationType: SyncDestinationType) {
        await workspace
            .getConfiguration("databricks")
            ?.update(
                "sync.destinationType",
                destinationType,
                ConfigurationTarget.Workspace
            );
    },
    get databrickscfgLocation() {
        const config = workspace
            .getConfiguration("databricks")
            ?.get<string>("overrideDatabricksConfigFile");
        return config === "" || config === undefined ? undefined : config;
    },
};
