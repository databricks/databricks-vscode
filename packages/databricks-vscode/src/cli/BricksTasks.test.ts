import "@databricks/databricks-sdk";
import * as assert from "assert";
import {instance, mock, when} from "ts-mockito";
import {Uri} from "vscode";
import {ProfileAuthProvider} from "../configuration/auth/AuthProvider";
import type {ConnectionManager} from "../configuration/ConnectionManager";
import {DatabricksWorkspace} from "../configuration/DatabricksWorkspace";
import {SyncDestination} from "../configuration/SyncDestination";
import {PackageMetaData} from "../utils/packageJsonUtils";
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
            {} as PackageMetaData,
            () => {}
        );

        assert.equal(task.definition.type, "databricks");
        assert.equal(task.definition.task, "sync");
        assert.equal(task.isBackground, true);
        assert.deepEqual(task.problemMatchers, ["$bricks-sync"]);
    });

    describe("pseudo terminal", () => {
        let env: NodeJS.ProcessEnv;

        beforeEach(() => {
            // Save environment.
            env = process.env;

            // Create copy so it is safe to mutate it in tests.
            process.env = {
                ...env,
            };
        });

        afterEach(() => {
            // Restore original environment.
            process.env = env;
        });

        let terminal: LazyCustomSyncTerminal;

        beforeEach(() => {
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

            terminal = new LazyCustomSyncTerminal(
                instance(connection),
                instance(cli),
                "full",
                {} as PackageMetaData,
                () => {}
            );
        });

        it("should receive correct environment variables", () => {
            delete process.env["HTTP_PROXY"];
            delete process.env["HTTPS_PROXY"];

            assert.deepEqual(terminal.getProcessOptions(), {
                cwd: Uri.file("/path/to/local/workspace").fsPath,
                env: {
                    /* eslint-disable @typescript-eslint/naming-convention */
                    BRICKS_ROOT: Uri.file("/path/to/local/workspace").fsPath,
                    DATABRICKS_CONFIG_PROFILE: "profile",
                    BRICKS_UPSTREAM: "databricks-vscode",
                    BRICKS_UPSTREAM_VERSION: undefined,
                    DATABRICKS_CONFIG_FILE: undefined,
                    HOME: process.env.HOME,
                    PATH: process.env.PATH,
                    /* eslint-enable @typescript-eslint/naming-convention */
                },
            });
        });

        it("should pass through proxy variables if set", () => {
            process.env.HTTP_PROXY = "http_proxy";
            process.env.HTTPS_PROXY = "https_proxy";

            assert.deepEqual(terminal.getProcessOptions(), {
                cwd: Uri.file("/path/to/local/workspace").fsPath,
                env: {
                    /* eslint-disable @typescript-eslint/naming-convention */
                    BRICKS_ROOT: Uri.file("/path/to/local/workspace").fsPath,
                    DATABRICKS_CONFIG_PROFILE: "profile",
                    DATABRICKS_CONFIG_FILE: undefined,
                    BRICKS_UPSTREAM: "databricks-vscode",
                    BRICKS_UPSTREAM_VERSION: undefined,
                    HOME: process.env.HOME,
                    PATH: process.env.PATH,
                    HTTP_PROXY: "http_proxy",
                    HTTPS_PROXY: "https_proxy",
                    /* eslint-enable @typescript-eslint/naming-convention */
                },
            });
        });
    });
});
