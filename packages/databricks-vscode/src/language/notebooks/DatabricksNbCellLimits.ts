import {workspaceConfigs} from "../../vscode-objs/WorkspaceConfigs";

export function setDbNbCellLimits() {
    if (workspaceConfigs.jupyterCellMarkerRegex === undefined) {
        workspaceConfigs.jupyterCellMarkerRegex =
            "^(# Databricks notebook source|# COMMAND ----------)";
    }

    const jupyterCellMarkerRegex = workspaceConfigs.jupyterCellMarkerRegex;

    ["# Databricks notebook source", "# COMMAND ----------"].forEach(
        (value) => {
            if (!jupyterCellMarkerRegex.includes(value)) {
                workspaceConfigs.jupyterCellMarkerRegex = `^${value}|${workspaceConfigs.jupyterCellMarkerRegex}`;
            }
        }
    );

    workspaceConfigs.jupyterCellMarkerDefault = "# COMMAND ----------";
}
