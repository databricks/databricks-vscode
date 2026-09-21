import {ConfigurationTarget, Disposable, workspace} from "vscode";
import {Time, TimeUnits} from "@databricks/sdk-experimental";

/**
 * How the extension provisions the local Python environment. `auto` runs the
 * uv-native setup (`databricks environments setup-local`) for suitable projects;
 * `manual` disables it so an existing interpreter/environment is used as-is.
 */
export type PythonEnvironmentSetupMode = "auto" | "manual";

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

    get databrickscfgLocation() {
        const config = workspace
            .getConfiguration("databricks")
            .get<string>("overrideDatabricksConfigFile");
        return config || process.env.DATABRICKS_CONFIG_FILE || undefined;
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

    get showDatabricksConnectProgress(): boolean {
        return (
            workspace
                .getConfiguration("databricks")
                .get<boolean>("connect.progress") ?? true
        );
    },

    get ipythonDir(): string | undefined {
        const dir = workspace
            .getConfiguration("databricks")
            .get<string>("ipythonDir");
        if (dir === "") {
            return undefined;
        }
        return dir;
    },

    get serverlessDbconnectVersion(): string {
        return (
            workspace
                .getConfiguration("databricks")
                .get<string>("connect.serverlessDbconnectVersion") ?? "17.3"
        );
    },

    // Any value other than "manual" (unset, "auto", or an unexpected string)
    // resolves to "auto" so the default and malformed configs both keep the
    // automated setup — the historical behavior.
    get pythonEnvironmentSetup(): PythonEnvironmentSetupMode {
        return workspace
            .getConfiguration("databricks")
            .get<string>("python.environmentSetup") === "manual"
            ? "manual"
            : "auto";
    },

    // Notify on changes to `python.environmentSetup`. Kept in the adapter so
    // both reading the setting and observing its changes stay behind the
    // vscode-objs seam, instead of feature/UI code reaching into `workspace`.
    // The caller owns the returned Disposable.
    onDidChangePythonEnvironmentSetup(listener: () => void): Disposable {
        return workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration("databricks.python.environmentSetup")) {
                listener();
            }
        });
    },

    // Write `python.environmentSetup` — the one-click "Use manual setup" escape
    // hatch on a failed setup writes "manual" here. Returns the update Thenable
    // so the caller can await/handle it.
    setPythonEnvironmentSetup(
        mode: PythonEnvironmentSetupMode,
        target: ConfigurationTarget
    ): Thenable<void> {
        return workspace
            .getConfiguration("databricks")
            .update("python.environmentSetup", mode, target);
    },

    get bundleRemoteStateRefreshInterval(): number {
        const config =
            workspace
                .getConfiguration("databricks")
                .get<number>("bundle.remoteStateRefreshInterval") ?? 5;

        return new Time(config, TimeUnits.minutes).toMillSeconds().value;
    },
};

export type WorkspaceConfigs = typeof workspaceConfigs;
