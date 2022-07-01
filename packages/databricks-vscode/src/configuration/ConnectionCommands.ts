import {Cluster} from "@databricks/databricks-sdk";
import {homedir} from "node:os";
import {Uri, window, workspace} from "vscode";
import {ConnectionManager} from "./ConnectionManager";

export class ConnectionCommands {
    constructor(private connectionManager: ConnectionManager) {}
    /**
     * Try logging in with previously selected profile. If login fails or no profile
     * exists then ask user to configure or select a profile. The selected profile
     * is stored in project settings.
     */
    loginCommand() {
        return () => {
            this.connectionManager.login(true);
        };
    }

    /**
     * disconnect fomr Databricks and remove profile from project settings.
     *
     */
    logoutCommand() {
        return () => {
            this.connectionManager.logout();
        };
    }

    configureProjectCommand() {
        return () => {
            this.connectionManager.configureProject();
        };
    }

    openDatabricksConfigFileCommand() {
        return async () => {
            console.log(
                "really opening file",
                Uri.joinPath(Uri.file(homedir()), ".databrickscfg").path
            );
            const doc = await workspace.openTextDocument(
                Uri.joinPath(Uri.file(homedir()), ".databrickscfg")
            );
            await window.showTextDocument(doc);
        };
    }

    /**
     * Attach to cluster from settings. If attach fails or no cluster is configured
     * then show dialog to select (or create) a cluster. The selected cluster is saved
     * in settings.
     */
    attachClusterCommand() {
        return async (cluster: Cluster) => {
            await this.connectionManager.attachCluster(cluster);
        };
    }

    /**
     * Set cluster to undefined and remove cluster ID from settings file
     */
    detachClusterCommand() {
        return async () => {
            await this.connectionManager.detachCluster();
        };
    }

    /**
     * Attach to a workspace from settings. If attach fails or no workspace is configured
     * then show dialog to select (or create) one. Selected workspaces is saved in settings.
     */
    attachWorkspaceCommand() {
        return () => {
            // delete profile
        };
    }

    /**
     * Set workspace to undefined and remove workspace path from settings file.
     */
    detachWorkspaceCommand() {
        return () => {
            // delete profile
        };
    }
}
