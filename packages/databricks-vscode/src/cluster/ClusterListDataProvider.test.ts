/* eslint-disable @typescript-eslint/naming-convention */

import assert from "assert";
import {mock, when, instance} from "ts-mockito";
import {ClusterModel} from "./ClusterModel";
import {Disposable, TreeItem} from "vscode";
import {ClusterListDataProvider} from "./ClusterListDataProvider";
import {ApiClient, Cluster, cluster} from "@databricks/databricks-sdk";
import {resolveProviderResult} from "../test/utils";

const mockListClustersResponse: cluster.ListClustersResponse = {
    clusters: [
        {
            cluster_id: "cluster-id-2",
            cluster_name: "cluster-name-2",
            cluster_source: "UI",
            creator_user_name: "user-2",
            spark_version: "Spark 3.2.1",
            state: "TERMINATED",
        },
        {
            cluster_id: "cluster-id-1",
            cluster_name: "cluster-name-1",
            cluster_source: "UI",
            creator_user_name: "user-1",
            spark_version: "Spark 3.2.5",
            state: "RUNNING",
        },
    ],
};

describe(__filename, () => {
    let mockedClusterModel: ClusterModel;
    let disposables: Array<Disposable>;
    let onModelChangeListener: () => void;
    let mockApiClient: ApiClient;

    beforeEach(() => {
        disposables = [];
        mockedClusterModel = mock(ClusterModel);
        onModelChangeListener = () => {};
        when(mockedClusterModel.onDidChange).thenReturn((_handler) => {
            onModelChangeListener = _handler;
            return {
                dispose() {},
            };
        });
        mockApiClient = mock(ApiClient);
        when(mockedClusterModel.roots).thenReturn(
            mockListClustersResponse.clusters!.map(
                (m: any) => new Cluster(instance(mockApiClient), m)
            )
        );
        when(mockApiClient.host).thenResolve(
            new URL("https://www.example.com")
        );
    });

    afterEach(() => {
        disposables.forEach((d) => d.dispose());
    });

    it("should reload tree on model change", async () => {
        let model = instance(mockedClusterModel);
        let provider = new ClusterListDataProvider(model);
        disposables.push(provider);

        let called = false;
        disposables.push(
            provider.onDidChangeTreeData(() => {
                called = true;
            })
        );

        assert(!called);
        onModelChangeListener();
        assert(called);
    });

    it("should get roots", async () => {
        let model = instance(mockedClusterModel);
        let provider = new ClusterListDataProvider(model);
        disposables.push(provider);

        let children = await resolveProviderResult(provider.getChildren());
        assert(children);
        assert.equal(children.length, 2);
    });

    it("should return cluster children", async () => {
        let model = instance(mockedClusterModel);
        let provider = new ClusterListDataProvider(model);
        disposables.push(provider);

        let cluster = new Cluster(
            instance(mockApiClient),
            mockListClustersResponse.clusters![0]
        );
        let children = await resolveProviderResult(
            provider.getChildren(cluster)
        );
        assert(children);
        assert.equal(children.length, 5);
    });

    it("should get cluster tree node items", async () => {
        let cluster = new Cluster(
            instance(mockApiClient),
            mockListClustersResponse.clusters![0]
        );

        let items = await ClusterListDataProvider.clusterNodeToTreeItems(
            cluster
        );
        assert.deepEqual(items, [
            {
                description: "cluster-id-2",
                label: "Cluster ID:",
            },
            {
                contextValue: "copyable",
                description:
                    "www.example.com/#setting/clusters/cluster-id-2/configuration",
                label: "URL:",
            },
            {
                description: "Spark 3.2.1",
                label: "Spark version:",
            },
            {
                description: "TERMINATED",
                label: "State:",
            },
            {
                description: "user-2",
                label: "Creator:",
            },
        ]);
    });

    it("should convert cluster node to tree item", () => {
        let cluster = new Cluster(
            instance(mock(ApiClient)),
            mockListClustersResponse.clusters![0]
        );

        let item = ClusterListDataProvider.clusterNodeToTreeItem(cluster);
        assert.deepEqual(item, {
            collapsibleState: 1,
            iconPath: {
                color: undefined,
                id: "debug-stop",
            },
            id: "cluster-id-2",
            label: "cluster-name-2",
        });

        cluster = new Cluster(
            instance(mock(ApiClient)),
            mockListClustersResponse.clusters![1]
        );

        item = ClusterListDataProvider.clusterNodeToTreeItem(cluster);
        assert.deepEqual(item, {
            collapsibleState: 1,
            iconPath: {
                color: undefined,
                id: "debug-start",
            },
            id: "cluster-id-1",
            label: "cluster-name-1",
        });
    });
});
