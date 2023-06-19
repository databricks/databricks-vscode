import {workspaceConfigs} from "../../vscode-objs/WorkspaceConfigs";

export function setDbnbCellLimits() {
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
