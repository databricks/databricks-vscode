/* eslint-disable @typescript-eslint/naming-convention */
import {
    ApiClient,
    ApiError,
    compute,
    Config,
    iam,
    WorkspaceClient,
} from "@databricks/sdk-experimental";
import assert from "assert";
import {
    anything,
    instance,
    mock,
    objectContaining,
    reset,
    spy,
    verify,
    when,
} from "ts-mockito";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {ClusterLoader} from "./ClusterLoader";
import {workspaceConfigs} from "../vscode-objs/WorkspaceConfigs";

const me: iam.User = {
    entitlements: [],
    groups: [
        {
            value: "group-1",
            display: "group-1",
        },
    ],
    userName: "user-1",
    roles: [],
};
const mockListClustersResponse: compute.ListClustersResponse = {
    clusters: [
        {
            cluster_id: "cluster-id-2",
            cluster_name: "cluster-name-2",
            cluster_source: "UI",
            creator_user_name: "user-2",
            state: "TERMINATED",
        },
        {
            cluster_id: "cluster-id-1",
            cluster_name: "cluster-name-1",
            cluster_source: "UI",
            creator_user_name: me.userName,
            state: "RUNNING",
        },
        {
            cluster_id: "cluster-id-3",
            cluster_name: "cluster-name-3",
            cluster_source: "API",
            creator_user_name: me.userName,
            state: "RUNNING",
        },
        {
            cluster_id: "cluster-id-5",
            cluster_name: "cluster-name-5",
            cluster_source: "JOB",
            creator_user_name: me.userName,
            state: "RUNNING",
        },
        {
            cluster_id: "cluster-id-4",
            cluster_name: "cluster-name-4",
            cluster_source: "API",
            creator_user_name: "user-2",
            state: "RUNNING",
            single_user_name: me.userName,
            access_mode: "SINGLE_USER",
        } as compute.ClusterDetails & {access_mode: "SINGLE_USER"},
    ],
};

const mockClusterPermissions: Map<string, iam.ObjectPermissions> = new Map([
    [
        "cluster-id-1",
        {
            access_control_list: [{user_name: me.userName}],
        },
    ],
    [
        "cluster-id-2",
        {
            access_control_list: [{group_name: me.groups![0].display}],
        },
    ],
    [
        "cluster-id-3",
        {
            access_control_list: [],
        },
    ],
    [
        "cluster-id-4",
        {
            access_control_list: [{group_name: me.groups![0].display}],
        },
    ],
    [
        "cluster-id-5",
        {
            access_control_list: [],
        },
    ],
]);
describe(__filename, () => {
    let mockedConnectionManager: ConnectionManager;
    let mockedWorkspaceClient: WorkspaceClient;
    let mockedApiClient: ApiClient;

    beforeEach(() => {
        mockedConnectionManager = mock(ConnectionManager);
        mockedWorkspaceClient = mock<WorkspaceClient>();
        mockedApiClient = mock<ApiClient>();

        when<compute.ListClustersResponse>(
            mockedApiClient.request(
                objectContaining({
                    path: "/api/2.1/clusters/list",
                    method: "GET",
                }),
                anything()
            ) as Promise<compute.ListClustersResponse>
        ).thenResolve(mockListClustersResponse);
        when(mockedConnectionManager.workspaceClient).thenReturn(
            instance(mockedWorkspaceClient)
        );
        for (const [clusterId, perms] of mockClusterPermissions.entries()) {
            when<iam.ObjectPermissions>(
                mockedApiClient.request(
                    objectContaining({
                        path: `/api/2.0/permissions/clusters/${clusterId}`,
                        method: "GET",
                    }),
                    anything()
                ) as Promise<iam.ObjectPermissions>
            ).thenResolve(perms);
        }
        when(mockedConnectionManager.databricksWorkspace).thenReturn({
            user: me,
            userName: me.userName,
            supportFilesInReposForCluster: () => true,
        } as any);

        const mockedConfig = mock(Config);
        when(mockedConfig.ensureResolved()).thenResolve();
        when(mockedApiClient.config).thenReturn(instance(mockedConfig));
        when(mockedWorkspaceClient.apiClient).thenReturn(
            instance(mockedApiClient)
        );
    });

    it("should only load accessible clusters", async () => {
        const loader = spy(
            new ClusterLoader(instance(mockedConnectionManager))
        );
        when(loader.running).thenReturn(true);
        when(loader.stopped).thenReturn(false);
        instance(loader)._load();
        for (const [id] of instance(loader).clusters.entries()) {
            assert.ok(
                ["cluster-id-2", "cluster-id-1", "cluster-id-4"].includes(id)
            );
        }
    });

    describe("with onlyShowAccessibleClusters", () => {
        let configsSpy: typeof workspaceConfigs;

        beforeEach(() => {
            configsSpy = spy(workspaceConfigs);
            when(configsSpy.onlyShowAccessibleClusters).thenReturn(true);
        });

        afterEach(() => {
            reset(configsSpy);
        });

        function permissionsRequest(clusterId: string) {
            return mockedApiClient.request(
                objectContaining({
                    path: `/api/2.0/permissions/clusters/${clusterId}`,
                    method: "GET",
                }),
                anything()
            );
        }

        function runningLoader() {
            const loader = spy(
                new ClusterLoader(instance(mockedConnectionManager))
            );
            when(loader.running).thenReturn(true);
            when(loader.stopped).thenReturn(false);
            return {loader: instance(loader), loaderSpy: loader};
        }

        it("doesn't re-read cached permissions on the next pass", async () => {
            const {loader} = runningLoader();
            await loader._load();
            await loader._load();

            verify(permissionsRequest("cluster-id-1")).once();
            verify(permissionsRequest("cluster-id-3")).once();
            assert.deepStrictEqual([...loader.clusters.keys()].sort(), [
                "cluster-id-1",
                "cluster-id-2",
                "cluster-id-4",
            ]);
        });

        for (const cleanup of [true, false]) {
            it(`re-reads permissions after restart(${cleanup})`, async () => {
                const {loader, loaderSpy} = runningLoader();
                await loader._load();
                // Don't start the background loop; only the cache reset matters.
                when(loaderSpy.stop()).thenResolve();
                when(loaderSpy.start()).thenResolve();
                await loader.restart(cleanup);
                await loader._load();

                verify(permissionsRequest("cluster-id-1")).twice();
            });
        }

        it("hides and caches clusters whose permissions return 403", async () => {
            when(permissionsRequest("cluster-id-1")).thenReject(
                new ApiError("forbidden", "PERMISSION_DENIED", 403, {}, [])
            );
            const {loader} = runningLoader();
            await loader._load();
            await loader._load();

            assert.ok(!loader.clusters.has("cluster-id-1"));
            verify(permissionsRequest("cluster-id-1")).once();
        });

        it("keeps at most 8 permission requests in flight", async () => {
            const clusters: compute.ClusterDetails[] = Array.from(
                {length: 30},
                (_, i) => ({
                    cluster_id: `many-${i}`,
                    cluster_name: `many-${i}`,
                    cluster_source: "UI",
                    state: "RUNNING",
                })
            );
            when(
                mockedApiClient.request(
                    objectContaining({
                        path: "/api/2.1/clusters/list",
                        method: "GET",
                    }),
                    anything()
                ) as Promise<compute.ListClustersResponse>
            ).thenResolve({clusters});

            let inFlight = 0;
            let maxInFlight = 0;
            for (const c of clusters) {
                when(permissionsRequest(c.cluster_id!)).thenCall(async () => {
                    inFlight++;
                    maxInFlight = Math.max(maxInFlight, inFlight);
                    await new Promise((resolve) => setTimeout(resolve, 1));
                    inFlight--;
                    return {access_control_list: [{user_name: me.userName}]};
                });
            }

            const {loader} = runningLoader();
            await loader._load();

            assert.strictEqual(maxInFlight, 8);
            assert.strictEqual(loader.clusters.size, clusters.length);
        });
    });
});
