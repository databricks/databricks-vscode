import {commands, workspace} from "vscode";

// eslint-disable-next-line @typescript-eslint/naming-convention
export const CustomWhenContext = {
    setLoggedIn(value: boolean) {
        commands.executeCommand(
            "setContext",
            "databricks.context.loggedIn",
            value
        );
    },

    setActivated(value: boolean) {
        commands.executeCommand(
            "setContext",
            "databricks.context.activated",
            value
        );
    },

    updateShowClusterView() {
        commands.executeCommand(
            "setContext",
            "databricks.feature.views.cluster",
            (
                workspace
                    .getConfiguration("databricks")
                    .get("experiments.optInto") as string[]
            ).includes("views.cluster")
        );
    },

    updateShowWorkspaceView() {
        commands.executeCommand(
            "setContext",
            "databricks.feature.views.workspace",
            (
                workspace
                    .getConfiguration("databricks")
                    .get("experiments.optInto") as string[]
            ).includes("views.workspace")
        );
    },
};
