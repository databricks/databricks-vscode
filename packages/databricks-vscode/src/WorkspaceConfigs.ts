import {workspace} from "vscode";

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
                ?.get<boolean>("clusters.onlyShowAccessibleClusters") ?? true
        );
    },
    get bricksVerboseMode() {
        return (
            workspace
                .getConfiguration("databricks")
                ?.get<boolean>("bricks.verboseMode") ?? false
        );
    },
};
