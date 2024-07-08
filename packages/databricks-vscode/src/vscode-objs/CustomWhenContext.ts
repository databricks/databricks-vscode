import {commands} from "vscode";
import {workspaceConfigs} from "./WorkspaceConfigs";

// eslint-disable-next-line @typescript-eslint/naming-convention
export class CustomWhenContext {
    setLoggedIn(value: boolean) {
        commands.executeCommand(
            "setContext",
            "databricks.context.loggedIn",
            value
        );
    }

    setActivated(value: boolean) {
        commands.executeCommand(
            "setContext",
            "databricks.context.activated",
            value
        );
    }

    setDeploymentState(value: "idle" | "deploying") {
        commands.executeCommand(
            "setContext",
            "databricks.context.bundle.deploymentState",
            value
        );
    }

    isTargetSet(value: boolean) {
        commands.executeCommand(
            "setContext",
            "databricks.context.bundle.isTargetSet",
            value
        );
    }

    isDevTarget(value: boolean) {
        commands.executeCommand(
            "setContext",
            "databricks.context.bundle.isDevTarget",
            value
        );
    }

    setSubProjectsAvailable(value: boolean) {
        commands.executeCommand(
            "setContext",
            "databricks.context.subProjectsAvailable",
            value
        );
    }

    setPendingManualMigration(value: boolean) {
        commands.executeCommand(
            "setContext",
            "databricks.context.pendingManualMigration",
            value
        );
    }

    setInitialized() {
        commands.executeCommand(
            "setContext",
            "databricks.context.initialized",
            true
        );
    }

    updateShowClusterView() {
        commands.executeCommand(
            "setContext",
            "databricks.feature.views.cluster",
            workspaceConfigs.experimetalFeatureOverides.includes(
                "views.cluster"
            )
        );
    }

    updateShowWorkspaceView() {
        commands.executeCommand(
            "setContext",
            "databricks.feature.views.workspace",
            workspaceConfigs.experimetalFeatureOverides.includes(
                "views.workspace"
            )
        );
    }

    setIsActiveFileInActiveWorkspace(value: boolean) {
        commands.executeCommand(
            "setContext",
            "databricks.context.isActiveFileInActiveWorkspace",
            value
        );
    }
}
