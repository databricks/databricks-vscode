/* eslint-disable @typescript-eslint/naming-convention */
import {anything, instance, mock, when} from "ts-mockito";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {DatabricksWorkspace} from "../configuration/DatabricksWorkspace";
import {ApiClient, Cluster, Config} from "@databricks/databricks-sdk";
import {
    getAuthEnvVars,
    getDbConnectEnvVars,
    getProxyEnvVars,
} from "./envVarGenerators";
import {Uri} from "vscode";
import assert from "assert";
import {AuthProvider} from "../configuration/auth/AuthProvider";
import {FeatureId, FeatureManager} from "../feature-manager/FeatureManager";

describe(__filename, () => {
    let mockConnectionManager: ConnectionManager;
    let mockDatabricksWorkspace: DatabricksWorkspace;
    let mockCluster: Cluster;
    const mockClusterId = "clusterId";
    const mockHost = "http://example.com";
    let mockApiClient: ApiClient;

    beforeEach(() => {
        mockConnectionManager = mock(ConnectionManager);
        mockDatabricksWorkspace = mock(DatabricksWorkspace);
        mockCluster = mock(Cluster);
        mockApiClient = mock(ApiClient);

        when(mockConnectionManager.databricksWorkspace).thenReturn(
            instance(mockDatabricksWorkspace)
        );
        when(mockDatabricksWorkspace.host).thenReturn(Uri.parse(mockHost));

        when(mockCluster.id).thenReturn(mockClusterId);
        when(mockConnectionManager.cluster).thenReturn(instance(mockCluster));

        when(mockConnectionManager.apiClient).thenReturn(
            instance(mockApiClient)
        );
        when(mockApiClient.host).thenResolve(new URL(mockHost));
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
            DATABRICKS_CLUSTER_ID: mockClusterId,
        });
    });

    describe("getProxyEnvVars", () => {
        it("should generate correct proxyEnvVars with lowerCase settings", () => {
            process.env.http_proxy = "http://example.com";
            process.env.https_proxy = "https://example.com";
            const actual = getProxyEnvVars();
            assert.deepEqual(actual, {
                HTTP_PROXY: "http://example.com",
                HTTPS_PROXY: "https://example.com",
            });
        });

        it("should generate correct proxyEnvVars with upperCase settings", () => {
            process.env.HTTP_PROXY = "http://example.com";
            process.env.HTTPS_PROXY = "https://example.com";
            const actual = getProxyEnvVars();
            assert.deepEqual(actual, {
                HTTP_PROXY: "http://example.com",
                HTTPS_PROXY: "https://example.com",
            });
        });

        after(() => {
            delete process.env.http_proxy;
            delete process.env.https_proxy;
            delete process.env.HTTP_PROXY;
            delete process.env.HTTPS_PROXY;
        });
    });

    describe("getDbConnectEnvVars", () => {
        const mockWorkspacePath = Uri.file("example");
        let mockAuthProvider: AuthProvider;
        let mockFeatureManager: FeatureManager<FeatureId>;
        beforeEach(() => {
            when(mockApiClient.product).thenReturn("test");
            when(mockApiClient.productVersion).thenReturn("0.0.1");
            mockAuthProvider = mock(AuthProvider);
            when(mockDatabricksWorkspace.authProvider).thenReturn(
                instance(mockAuthProvider)
            );
            mockFeatureManager = mock(FeatureManager<FeatureId>);
            when(
                mockFeatureManager.isEnabled("debugging.dbconnect")
            ).thenResolve({
                avaliable: true,
            });
        });

        it("should generate correct dbconnect env vars when auth type is not profile", async () => {
            when(mockAuthProvider.authType).thenReturn("azure-cli");

            const actual = await getDbConnectEnvVars(
                instance(mockConnectionManager),
                mockWorkspacePath,
                instance(mockFeatureManager)
            );

            assert.deepEqual(actual, {
                SPARK_CONNECT_USER_AGENT: "test/0.0.1",
                DATABRICKS_PROJECT_ROOT: mockWorkspacePath.fsPath,
            });
        });

        it("should generate correct dbconnect env vars when auth type is profile", async () => {
            when(mockAuthProvider.authType).thenReturn("profile");
            const mockConfig = mock(Config);
            when(mockApiClient.config).thenReturn(instance(mockConfig));
            when(mockConfig.authenticate(anything())).thenCall((headers) => {
                headers["Authorization"] = "Bearer token";
            });
            const actual = await getDbConnectEnvVars(
                instance(mockConnectionManager),
                mockWorkspacePath,
                instance(mockFeatureManager)
            );

            assert.deepEqual(actual, {
                SPARK_CONNECT_USER_AGENT: "test/0.0.1",
                DATABRICKS_PROJECT_ROOT: mockWorkspacePath.fsPath,
                SPARK_REMOTE: `sc://${
                    Uri.parse(mockHost).authority
                }:443/;token=token;use_ssl=true;x-databricks-cluster-id=${mockClusterId}`,
            });
        });
    });
});
