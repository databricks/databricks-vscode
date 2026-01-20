import "@databricks/sdk-experimental";
import * as assert from "assert";
import {instance, mock, when} from "ts-mockito";
import {Uri} from "vscode";
import {ProfileAuthProvider} from "../configuration/auth/AuthProvider";
import type {ConnectionManager} from "../configuration/ConnectionManager";
import {DatabricksWorkspace} from "../configuration/DatabricksWorkspace";
import {LocalUri, SyncDestinationMapper} from "../sync/SyncDestination";
import {PackageMetaData} from "../utils/packageJsonUtils";
import {LazyCustomSyncTerminal, SyncTask} from "./SyncTasks";
import type {CliWrapper} from "./CliWrapper";
import {ConfigModel} from "../configuration/models/ConfigModel";

describe(__filename, () => {
    let connection: ConnectionManager;
    let cli: CliWrapper;

    beforeEach(() => {
        connection = mock<ConnectionManager>();
        when(connection.metadataServiceUrl).thenReturn("http://localhost:1234");
        when(connection.serverless).thenReturn(false);
        cli = mock<CliWrapper>();
    });

    it("should create a sync task", () => {
        const task = new SyncTask(
            instance(connection),
            instance(mock<ConfigModel>()),
            instance(cli),
            "incremental",
            {
                version: "1.0.0",
            } as PackageMetaData,
            () => {}
        );

        assert.equal(task.definition.type, "databricks");
        assert.equal(task.definition.task, "sync");
        assert.equal(task.isBackground, true);
        assert.deepEqual(task.problemMatchers, ["$databricks-sync"]);
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
                    "profile",
                    instance(cli)
                )
            );
            when(mockDbWorkspace.host).thenReturn(
                new URL("https://000000000000.00.azuredatabricks.net/")
            );

            const mockSyncDestination = mock(SyncDestinationMapper);
            when(mockSyncDestination.localUri).thenReturn(
                new LocalUri(Uri.file("/path/to/local/workspace"))
            );

            when(connection.databricksWorkspace).thenReturn(
                instance(mockDbWorkspace)
            );

            when(connection.syncDestinationMapper).thenReturn(
                instance(mockSyncDestination)
            );

            const mockConfigModel = mock(ConfigModel);
            when(mockConfigModel.target).thenReturn("dev");
            terminal = new LazyCustomSyncTerminal(
                instance(connection),
                instance(mockConfigModel),
                instance(cli),
                "full",
                {
                    version: "1.0.0",
                } as PackageMetaData,
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
                    DATABRICKS_CLI_UPSTREAM: "databricks-vscode",
                    DATABRICKS_CLI_UPSTREAM_VERSION: "1.0.0",
                    DATABRICKS_BUNDLE_TARGET: "dev",
                    DATABRICKS_HOST:
                        "https://000000000000.00.azuredatabricks.net/",
                    DATABRICKS_AUTH_TYPE: "metadata-service",
                    DATABRICKS_METADATA_SERVICE_URL: "http://localhost:1234",
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
                    DATABRICKS_CLI_UPSTREAM: "databricks-vscode",
                    DATABRICKS_CLI_UPSTREAM_VERSION: "1.0.0",
                    DATABRICKS_BUNDLE_TARGET: "dev",
                    DATABRICKS_HOST:
                        "https://000000000000.00.azuredatabricks.net/",
                    DATABRICKS_AUTH_TYPE: "metadata-service",
                    DATABRICKS_METADATA_SERVICE_URL: "http://localhost:1234",
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
