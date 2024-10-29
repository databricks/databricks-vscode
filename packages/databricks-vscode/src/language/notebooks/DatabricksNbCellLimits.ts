import {workspaceConfigs} from "../../vscode-objs/WorkspaceConfigs";
import {FileUtils} from "../../utils";
import {ConnectionManager} from "../../configuration/ConnectionManager";
import {WorkspaceFolderManager} from "../../vscode-objs/WorkspaceFolderManager";

export async function setDbnbCellLimits(
    workspaceFolderManager: WorkspaceFolderManager,
    connectionManager: ConnectionManager
) {
    await FileUtils.waitForDatabricksProject(
        workspaceFolderManager.activeWorkspaceFolder.uri,
        connectionManager
    );
    if (workspaceConfigs.jupyterCellMarkerRegex === undefined) {
        workspaceConfigs.jupyterCellMarkerRegex =
            "^(# Databricks notebook source|# COMMAND ----------)";
    }

    let jupyterCellMarkerRegex = workspaceConfigs.jupyterCellMarkerRegex;

    ["# Databricks notebook source", "# COMMAND ----------"].forEach(
        (value) => {
            if (!jupyterCellMarkerRegex.includes(value)) {
                jupyterCellMarkerRegex = `^${value}|${jupyterCellMarkerRegex}`;
            }
        }
    );

    workspaceConfigs.jupyterCellMarkerRegex = jupyterCellMarkerRegex;
    workspaceConfigs.jupyterCellMarkerDefault = "# COMMAND ----------";
}
