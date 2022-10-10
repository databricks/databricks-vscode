/* eslint-disable @typescript-eslint/naming-convention */

import assert from "assert";
import {
    mock,
    when,
    anything,
    anyString,
    instance,
    verify,
    spy,
} from "ts-mockito";
import {ApiClient, Cluster, cluster} from "@databricks/databricks-sdk";
import {ClusterModel} from "./ClusterModel";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {Disposable} from "vscode";
import {ClusterLoader} from "./ClusterLoader";

const me = "user-1";
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
            creator_user_name: me,
            state: "RUNNING",
        },
    ],
};

describe(__filename, () => {
    let mockedConnectionManager: ConnectionManager;
    let mockedApiClient: ApiClient;
    let disposables: Array<Disposable>;
    let mockedClusterLoader: ClusterLoader;

    beforeEach(() => {
        disposables = [];
        mockedConnectionManager = mock(ConnectionManager);
        mockedApiClient = mock<ApiClient>();
        when<cluster.ListClustersResponse>(
            mockedApiClient.request(anyString(), "GET", anything(), anything())
        ).thenResolve(mockListClustersResponse);
        when(mockedConnectionManager.apiClient).thenReturn(
            instance(mockedApiClient)
        );
        mockedClusterLoader = spy(
            new ClusterLoader(instance(mockedConnectionManager))
        );
        when(mockedClusterLoader.clusters).thenReturn(
            new Map(
                mockListClustersResponse.clusters?.map((c) => {
                    return [
                        c.cluster_id!,
                        new Cluster(instance(mockedApiClient), c),
                    ];
                })
            )
        );
    });

    afterEach(() => {
        disposables.forEach((d) => d.dispose());
    });

    it("should sort by state", async () => {
        let model = new ClusterModel(
            instance(mockedConnectionManager),
            instance(mockedClusterLoader)
        );
        let roots = model.roots;

        assert(roots);
        assert.equal(roots.length, 2);
        assert.equal(roots[0].state, "RUNNING");
        assert.equal(roots[1].state, "TERMINATED");
    });

    it("should filter by me", async () => {
        when(mockedConnectionManager.me).thenReturn(me);

        let model = new ClusterModel(
            instance(mockedConnectionManager),
            instance(mockedClusterLoader)
        );
        let roots = model.roots;

        assert(roots);
        assert.equal(roots.length, 2);

        let called = false;
        disposables.push(
            model.onDidChange(() => {
                called = true;
            })
        );

        model.filter = "ME";
        assert(called);

        roots = model.roots;

        assert(roots);
        assert.equal(roots.length, 1);
        assert.equal(roots[0].creator, me);
    });
});
