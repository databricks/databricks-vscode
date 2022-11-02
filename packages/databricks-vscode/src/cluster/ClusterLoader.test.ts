/* eslint-disable @typescript-eslint/naming-convention */
import {
    ApiClient,
    cluster,
    permissions,
    scim,
} from "@databricks/databricks-sdk";
import assert from "assert";
import {anything, instance, mock, spy, when} from "ts-mockito";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {ClusterLoader} from "./ClusterLoader";

const me: scim.User = {
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
const mockListClustersResponse: cluster.ListClustersResponse = {
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
        },
    ],
};

const mockClusterPermissions: Map<string, permissions.ObjectPermissions> =
    new Map([
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
    ]);
describe(__filename, () => {
    let mockedConnectionManager: ConnectionManager;
    let mockedApiClient: ApiClient;

    beforeEach(() => {
        mockedConnectionManager = mock(ConnectionManager);
        mockedApiClient = mock<ApiClient>();
        when<cluster.ListClustersResponse>(
            mockedApiClient.request(
                "/api/2.0/clusters/list",
                "GET",
                anything(),
                anything()
            )
        ).thenResolve(mockListClustersResponse);
        when(mockedConnectionManager.apiClient).thenReturn(
            instance(mockedApiClient)
        );
        for (let [id, perms] of mockClusterPermissions.entries()) {
            when<permissions.ObjectPermissions>(
                mockedApiClient.request(
                    `/api/2.0/permissions/clusters/${id}`,
                    "GET",
                    anything(),
                    anything()
                )
            ).thenResolve(perms);
        }
        when(mockedConnectionManager.databricksWorkspace).thenReturn({
            user: me,
            userName: me.userName,
        } as any);
    });

    it("should only load accessible clusters", async () => {
        const loader = spy(
            new ClusterLoader(instance(mockedConnectionManager))
        );
        when(loader.running).thenReturn(true);
        when(loader.stopped).thenReturn(false);
        instance(loader)._load();
        for (let [id, _] of instance(loader).clusters.entries()) {
            assert.ok(
                ["cluster-id-2", "cluster-id-1", "cluster-id-4"].includes(id)
            );
        }
    });
});
