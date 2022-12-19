import "@databricks/databricks-sdk";
import * as assert from "assert";
import {instance, mock, when} from "ts-mockito";
import {Uri} from "vscode";
import {ProfileAuthProvider} from "../configuration/auth/AuthProvider";
import type {ConnectionManager} from "../configuration/ConnectionManager";
import {DatabricksWorkspace} from "../configuration/DatabricksWorkspace";
import {SyncDestination} from "../configuration/SyncDestination";
import {LazyCustomSyncTerminal, SyncTask} from "./BricksTasks";
import type {CliWrapper} from "./CliWrapper";

describe(__filename, () => {
    let connection: ConnectionManager;
    let cli: CliWrapper;

    beforeEach(() => {
        connection = mock<ConnectionManager>();
        cli = mock<CliWrapper>();
    });

    it("should create a sync task", () => {
        const task = new SyncTask(
            instance(connection),
            instance(cli),
            "incremental",
            () => {}
        );

        assert.equal(task.definition.type, "databricks");
        assert.equal(task.definition.task, "sync");
        assert.equal(task.isBackground, true);
        assert.deepEqual(task.problemMatchers, ["$bricks-sync"]);
    });

    it("should create pseudo terminal with correct environment variables", () => {
        const mockDbWorkspace = mock(DatabricksWorkspace);
        when(mockDbWorkspace.authProvider).thenReturn(
            new ProfileAuthProvider(
                new URL("https://000000000000.00.azuredatabricks.net/"),
                "profile"
            )
        );

        const mockSyncDestination = mock(SyncDestination);
        when(mockSyncDestination.vscodeWorkspacePath).thenReturn(
            Uri.file("/path/to/local/workspace")
        );

        when(connection.databricksWorkspace).thenReturn(
            instance(mockDbWorkspace)
        );
        when(connection.syncDestination).thenReturn(
            instance(mockSyncDestination)
        );

        const terminal = new LazyCustomSyncTerminal(
            instance(connection),
            instance(cli),
            "full",
            () => {}
        );

        console.log(terminal.getProcessOptions());

        assert.deepEqual(terminal.getProcessOptions(), {
            cwd: Uri.file("/path/to/local/workspace").fsPath,
            env: {
                /* eslint-disable @typescript-eslint/naming-convention */
                BRICKS_ROOT: Uri.file("/path/to/local/workspace").fsPath,
                DATABRICKS_CONFIG_PROFILE: "profile",
                DATABRICKS_CONFIG_FILE: undefined,
                HOME: process.env.HOME,
                PATH: process.env.PATH,
                /* eslint-enable @typescript-eslint/naming-convention */
            },
        });
    });
});
