import {workspaceConfigs} from "../../vscode-objs/WorkspaceConfigs";
import {FileUtils} from "../../utils";
import {Uri} from "vscode";
import {ConnectionManager} from "../../configuration/ConnectionManager";

export async function setDbnbCellLimits(
    workspacePath: Uri,
    connectionManager: ConnectionManager
) {
    await FileUtils.waitForDatabricksProject(workspacePath, connectionManager);
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
