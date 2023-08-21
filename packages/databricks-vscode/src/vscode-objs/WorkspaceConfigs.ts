import {ConfigurationTarget, workspace} from "vscode";
import {SyncDestinationType} from "../sync/SyncDestination";

export const workspaceConfigs = {
    get maxFieldLength() {
        return (
            workspace
                .getConfiguration("databricks")
                .get<number>("logs.maxFieldLength") ?? 40
        );
    },
    get truncationDepth() {
        return (
            workspace
                .getConfiguration("databricks")
                .get<number>("logs.truncationDepth") ?? 2
        );
    },
    get maxArrayLength() {
        return (
            workspace
                .getConfiguration("databricks")
                .get<number>("logs.maxArrayLength") ?? 2
        );
    },
    get loggingEnabled() {
        return (
            workspace
                .getConfiguration("databricks")
                .get<boolean>("logs.enabled") ?? true
        );
    },
    get onlyShowAccessibleClusters() {
        return (
            workspace
                .getConfiguration("databricks")
                .get<boolean>("clusters.onlyShowAccessibleClusters") ?? false
        );
    },
    get cliVerboseMode() {
        const legacyVerboseMode =
            workspace
                .getConfiguration("databricks")
                .get<boolean>("bricks.verboseMode") ?? false;

        const verboseMode =
            workspace
                .getConfiguration("databricks")
                .get<boolean>("cli.verboseMode") ?? false;

        return verboseMode || legacyVerboseMode;
    },

    get syncDestinationType() {
        return (
            workspace
                .getConfiguration("databricks")
                .get<SyncDestinationType>("sync.destinationType") ?? "workspace"
        );
    },

    get enableFilesInWorkspace() {
        return this.syncDestinationType === "workspace";
    },

    async setSyncDestinationType(destinationType: SyncDestinationType) {
        await workspace
            .getConfiguration("databricks")
            .update(
                "sync.destinationType",
                destinationType,
                ConfigurationTarget.Workspace
            );
    },
    get databrickscfgLocation() {
        const config = workspace
            .getConfiguration("databricks")
            .get<string>("overrideDatabricksConfigFile");
        return config === "" || config === undefined ? undefined : config;
    },

    get userEnvFile() {
        const config = workspace
            .getConfiguration("databricks")
            .get<string>("python.envFile");

        return config === "" || config === undefined ? undefined : config;
    },

    set userEnvFile(value: string | undefined) {
        workspace
            .getConfiguration("databricks")
            .update("python.envFile", value, ConfigurationTarget.Workspace);
    },

    get experimetalFeatureOverides() {
        return workspace
            .getConfiguration("databricks")
            .get<Array<string>>("experiments.optInto", []);
    },

    /**
     * set the python.envFile configuration in the ms-python extension
     */
    set msPythonEnvFile(value: string | undefined) {
        workspace
            .getConfiguration("python")
            .update("envFile", value, ConfigurationTarget.Workspace);
    },

    /**
     * get the python.envFile configuration in the ms-python extension
     */
    get msPythonEnvFile() {
        return workspace.getConfiguration("python").get<string>("envFile");
    },

    get jupyterCellMarkerRegex(): string | undefined {
        return workspace
            .getConfiguration("jupyter")
            .get<string>("interactiveWindow.cellMarker.codeRegex");
    },

    set jupyterCellMarkerRegex(value: string | undefined) {
        workspace
            .getConfiguration("jupyter")
            .update(
                "interactiveWindow.cellMarker.codeRegex",
                value,
                ConfigurationTarget.Workspace
            );
    },

    /**
     * Get the jupyterCellMarkerDefault configuration in the ms-python extension.
     * This config tells jupyter how new cells should be marked, by default.
     */
    set jupyterCellMarkerDefault(value: string) {
        workspace
            .getConfiguration("jupyter")
            .update(
                "interactiveWindow.cellMarker.default",
                value,
                ConfigurationTarget.Workspace
            );
    },

    get wsfsRearrangeCells(): boolean {
        return (
            workspace
                .getConfiguration("databricks")
                .get<boolean>("wsfs.rearrangeCells") ?? true
        );
    },

    get ipythonDir(): string | undefined {
        return workspace
            .getConfiguration("databricks")
            .get<string>("ipythonDir");
    },
};
