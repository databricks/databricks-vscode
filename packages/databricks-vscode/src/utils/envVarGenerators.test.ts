/* eslint-disable @typescript-eslint/naming-convention */
import {anything, instance, mock, reset, spy, when} from "ts-mockito";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {DatabricksWorkspace} from "../configuration/DatabricksWorkspace";
import {ApiClient, Config} from "@databricks/sdk-experimental";
import {Cluster} from "../sdk-extensions";
import {
    getAuthEnvVars,
    getCommonDatabricksEnvVars,
    getDbConnectEnvVars,
    getProxyEnvVars,
} from "./envVarGenerators";
import {Uri} from "vscode";
import assert from "assert";
import {AuthProvider} from "../configuration/auth/AuthProvider";
import {workspaceConfigs} from "../vscode-objs/WorkspaceConfigs";

describe(__filename, () => {
    let mockConnectionManager: ConnectionManager;
    let mockDatabricksWorkspace: DatabricksWorkspace;
    let mockCluster: Cluster;
    const mockClusterId = "clusterId";
    const mockHost = "http://example.com";
    let mockApiClient: ApiClient;
    let existingEnv: any;
    let configsSpy: typeof workspaceConfigs;

    beforeEach(() => {
        configsSpy = spy(workspaceConfigs);
        // Default: no proxy configured via VS Code settings, so getProxyEnvVars
        // falls back to the process env vars the tests set explicitly.
        when(configsSpy.httpProxy).thenReturn(undefined);
        when(configsSpy.httpNoProxy).thenReturn([]);
        mockConnectionManager = mock(ConnectionManager);
        mockDatabricksWorkspace = mock(DatabricksWorkspace);
        mockCluster = mock(Cluster);
        mockApiClient = mock(ApiClient);

        when(mockConnectionManager.databricksWorkspace).thenReturn(
            instance(mockDatabricksWorkspace)
        );
        when(mockDatabricksWorkspace.host).thenReturn(new URL(mockHost));

        when(mockCluster.id).thenReturn(mockClusterId);
        when(mockConnectionManager.cluster).thenReturn(instance(mockCluster));

        when(mockConnectionManager.apiClient).thenReturn(
            instance(mockApiClient)
        );
        when(mockApiClient.host).thenResolve(new URL(mockHost));
        existingEnv = Object.assign({}, process.env);
    });

    afterEach(() => {
        reset(configsSpy);
        process.env = existingEnv;
    });

    it("should generate correct authEnvVars", () => {
        when(mockConnectionManager.metadataServiceUrl).thenReturn(
            "http://example.com/metadata-service"
        );

        const actual = getAuthEnvVars(instance(mockConnectionManager));
        assert.deepEqual(actual, {
            DATABRICKS_HOST: mockHost + "/",
            DATABRICKS_AUTH_TYPE: "metadata-service",
            DATABRICKS_METADATA_SERVICE_URL:
                "http://example.com/metadata-service",
        });
    });

    it("should generate correct proxyEnvVars with lowerCase settings", () => {
        process.env.http_proxy = "http://example.com";
        process.env.https_proxy = "https://example.com";
        process.env.no_proxy = "https://example.com";
        const actual = getProxyEnvVars();
        assert.deepEqual(actual, {
            HTTP_PROXY: "http://example.com",
            HTTPS_PROXY: "https://example.com",
            NO_PROXY: "https://example.com",
        });
    });

    it("should generate correct proxyEnvVars with upperCase settings", () => {
        process.env.HTTP_PROXY = "http://example.com";
        process.env.HTTPS_PROXY = "https://example.com";
        process.env.NO_PROXY = "https://example.com";
        const actual = getProxyEnvVars();
        assert.deepEqual(actual, {
            HTTP_PROXY: "http://example.com",
            HTTPS_PROXY: "https://example.com",
            NO_PROXY: "https://example.com",
        });
    });

    it("should use the http.proxy setting for both schemes when set", () => {
        delete process.env.HTTP_PROXY;
        delete process.env.HTTPS_PROXY;
        delete process.env.http_proxy;
        delete process.env.https_proxy;
        when(configsSpy.httpProxy).thenReturn("http://proxy.local:8080");

        const actual = getProxyEnvVars();
        assert.deepEqual(actual, {
            HTTP_PROXY: "http://proxy.local:8080",
            HTTPS_PROXY: "http://proxy.local:8080",
            NO_PROXY: undefined,
        });
    });

    it("should let the http.proxy setting win over env vars", () => {
        process.env.HTTP_PROXY = "http://env-proxy.local:1";
        process.env.HTTPS_PROXY = "http://env-proxy.local:1";
        when(configsSpy.httpProxy).thenReturn("http://setting-proxy.local:2");

        const actual = getProxyEnvVars();
        assert.deepEqual(actual, {
            HTTP_PROXY: "http://setting-proxy.local:2",
            HTTPS_PROXY: "http://setting-proxy.local:2",
            NO_PROXY: undefined,
        });
    });

    it("should merge http.noProxy setting with the NO_PROXY env var", () => {
        delete process.env.no_proxy;
        process.env.NO_PROXY = "shared.example.com,env.example.com";
        when(configsSpy.httpNoProxy).thenReturn([
            "setting.example.com",
            "shared.example.com",
        ]);

        const actual = getProxyEnvVars();
        assert.deepEqual(actual, {
            HTTP_PROXY: undefined,
            HTTPS_PROXY: undefined,
            // Deduped: "shared.example.com" appears in both sources but once here.
            NO_PROXY: "setting.example.com,shared.example.com,env.example.com",
        });
    });

    it("should generate env vars with expected cluster id", () => {
        const actual = getCommonDatabricksEnvVars(
            instance(mockConnectionManager),
            "target"
        );
        assert.deepEqual(actual, {
            DATABRICKS_BUNDLE_TARGET: "target",
            DATABRICKS_CLUSTER_ID: mockClusterId,
            DATABRICKS_SERVERLESS_COMPUTE_ID: undefined,
            HTTP_PROXY: undefined,
            HTTPS_PROXY: undefined,
            NO_PROXY: undefined,
        });
    });

    it("should generate env vars with serverless", () => {
        when(mockConnectionManager.serverless).thenReturn(true);
        const actual = getCommonDatabricksEnvVars(
            instance(mockConnectionManager),
            "target"
        );
        assert.deepEqual(actual, {
            DATABRICKS_BUNDLE_TARGET: "target",
            DATABRICKS_CLUSTER_ID: undefined,
            DATABRICKS_SERVERLESS_COMPUTE_ID: "auto",
            HTTP_PROXY: undefined,
            HTTPS_PROXY: undefined,
            NO_PROXY: undefined,
        });
    });

    describe("getDbConnectEnvVars", () => {
        const mockWorkspacePath = Uri.file("example");
        let mockAuthProvider: AuthProvider;

        beforeEach(() => {
            when(mockApiClient.product).thenReturn("test");
            when(mockApiClient.productVersion).thenReturn("0.0.1");
            mockAuthProvider = mock(AuthProvider);
            when(mockDatabricksWorkspace.authProvider).thenReturn(
                instance(mockAuthProvider)
            );
        });

        it("should generate correct dbconnect env vars when auth type is not profile", async () => {
            when(mockAuthProvider.authType).thenReturn("azure-cli");

            const actual = await getDbConnectEnvVars(
                instance(mockConnectionManager),
                mockWorkspacePath,
                true
            );

            assert.deepEqual(actual, {
                SPARK_CONNECT_USER_AGENT: "test/0.0.1",
                DATABRICKS_PROJECT_ROOT: mockWorkspacePath.fsPath,
                SPARK_CONNECT_PROGRESS_BAR_ENABLED: "1",
            });
        });

        it("should append our user agent any existing SPARK_CONNECT_USER_AGENT in VS Code parent env", async () => {
            process.env.SPARK_CONNECT_USER_AGENT = "existing";
            when(mockAuthProvider.authType).thenReturn("azure-cli");

            const actual = await getDbConnectEnvVars(
                instance(mockConnectionManager),
                mockWorkspacePath,
                true
            );

            assert.deepEqual(actual, {
                SPARK_CONNECT_USER_AGENT: "existing test/0.0.1",
                DATABRICKS_PROJECT_ROOT: mockWorkspacePath.fsPath,
                SPARK_CONNECT_PROGRESS_BAR_ENABLED: "1",
            });
        });

        it("should generate correct dbconnect env vars when auth type is pat", async () => {
            const mockConfig = mock(Config);
            when(mockApiClient.config).thenReturn(instance(mockConfig));
            when(mockConfig.authenticate(anything())).thenCall(
                (headers: Headers) => {
                    headers.set("Authorization", "Bearer token");
                }
            );
            when(mockConnectionManager.authType).thenReturn("pat");

            const actual = await getDbConnectEnvVars(
                instance(mockConnectionManager),
                mockWorkspacePath,
                true
            );

            assert.deepEqual(actual, {
                SPARK_CONNECT_USER_AGENT: "test/0.0.1",
                DATABRICKS_PROJECT_ROOT: mockWorkspacePath.fsPath,
                SPARK_CONNECT_PROGRESS_BAR_ENABLED: "1",
                SPARK_REMOTE: `sc://${
                    Uri.parse(mockHost).authority
                }:443/;token=token;use_ssl=true;x-databricks-cluster-id=${mockClusterId}`,
            });
        });

        it("should generate correct dbconnect env vars when auth type is not pat", async () => {
            const mockConfig = mock(Config);
            when(mockApiClient.config).thenReturn(instance(mockConfig));
            when(mockConfig.authenticate(anything())).thenCall(
                (headers: Headers) => {
                    headers.set("Authorization", "Bearer token");
                }
            );
            when(mockConnectionManager.authType).thenReturn("azure-cli");

            const actual = await getDbConnectEnvVars(
                instance(mockConnectionManager),
                mockWorkspacePath,
                true
            );

            assert.deepEqual(actual, {
                SPARK_CONNECT_USER_AGENT: "test/0.0.1",
                DATABRICKS_PROJECT_ROOT: mockWorkspacePath.fsPath,
                SPARK_CONNECT_PROGRESS_BAR_ENABLED: "1",
            });
        });
    });
});
