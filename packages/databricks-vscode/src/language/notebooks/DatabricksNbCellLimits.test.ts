import {randomUUID} from "crypto";
import os from "os";
import path from "path";
import {ConfigurationTarget, Uri, workspace} from "vscode";
import type {WorkspaceConfiguration} from "vscode";
import {instance, mock, reset, spy, verify, when} from "ts-mockito";
import {ConnectionManager} from "../../configuration/ConnectionManager";
import {WorkspaceFolderManager} from "../../vscode-objs/WorkspaceFolderManager";
import {setDbnbCellLimits} from "./DatabricksNbCellLimits";

describe("Databricks notebook cell markers", () => {
    let workspaceSpy: typeof workspace;
    let databricksConfig: WorkspaceConfiguration;
    let jupyterConfig: WorkspaceConfiguration;
    let workspaceFolderManager: WorkspaceFolderManager;
    let connectionManager: ConnectionManager;

    beforeEach(() => {
        workspaceSpy = spy(workspace);
        databricksConfig = mock<WorkspaceConfiguration>();
        jupyterConfig = mock<WorkspaceConfiguration>();
        when(workspaceSpy.getConfiguration("databricks")).thenReturn(
            instance(databricksConfig)
        );
        when(workspaceSpy.getConfiguration("jupyter")).thenReturn(
            instance(jupyterConfig)
        );
        when(
            jupyterConfig.get<string>("interactiveWindow.cellMarker.codeRegex")
        ).thenReturn("^# custom");
        workspaceFolderManager = mock(WorkspaceFolderManager);
        when(workspaceFolderManager.activeProjectUri).thenReturn(
            Uri.file(path.join(os.tmpdir(), randomUUID()))
        );
        connectionManager = mock(ConnectionManager);
        when(connectionManager.waitForConnect()).thenResolve();
    });

    afterEach(() => {
        reset(workspaceSpy);
    });

    it("leaves Jupyter settings untouched when automatic configuration is disabled", async () => {
        when(
            databricksConfig.get<boolean>(
                "notebooks.configureJupyterCellMarkers"
            )
        ).thenReturn(false);

        await setDbnbCellLimits(
            instance(workspaceFolderManager),
            instance(connectionManager)
        );

        verify(workspaceSpy.getConfiguration("jupyter")).never();
    });

    for (const enabled of [undefined, true]) {
        it(`preserves custom markers when automatic configuration is ${
            enabled === undefined ? "unset" : "enabled"
        }`, async () => {
            when(
                databricksConfig.get<boolean>(
                    "notebooks.configureJupyterCellMarkers"
                )
            ).thenReturn(enabled);

            await setDbnbCellLimits(
                instance(workspaceFolderManager),
                instance(connectionManager)
            );

            verify(
                jupyterConfig.update(
                    "interactiveWindow.cellMarker.codeRegex",
                    "^# COMMAND ----------|^# Databricks notebook source|^# custom",
                    ConfigurationTarget.Workspace
                )
            ).once();
            verify(
                jupyterConfig.update(
                    "interactiveWindow.cellMarker.default",
                    "# COMMAND ----------",
                    ConfigurationTarget.Workspace
                )
            ).once();
        });
    }
});
