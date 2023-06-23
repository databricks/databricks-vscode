import {commands} from "vscode";
import {workspaceConfigs} from "./WorkspaceConfigs";

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
            workspaceConfigs.experimetalFeatureOverides.includes(
                "views.cluster"
            )
        );
    },

    updateShowWorkspaceView() {
        commands.executeCommand(
            "setContext",
            "databricks.feature.views.workspace",
            workspaceConfigs.experimetalFeatureOverides.includes(
                "views.workspace"
            )
        );
    },
};
