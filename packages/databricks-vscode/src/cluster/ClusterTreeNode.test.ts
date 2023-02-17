/* eslint-disable @typescript-eslint/naming-convention */

import assert from "assert";
import {mock, when, instance} from "ts-mockito";
import {ClusterModel} from "./ClusterModel";
import {Disposable} from "vscode";
import {clusterNodeToTreeItem, clusterNodeToTreeItems} from "./ClusterTreeNode";
import {ApiClient, Cluster, cluster} from "@databricks/databricks-sdk";

const mockListClustersResponse: cluster.ListClustersResponse = {
    clusters: [
        {
            cluster_id: "cluster-id-2",
            cluster_name: "cluster-name-2",
            cluster_source: "UI",
            creator_user_name: "user-2",
            driver_node_type_id: "Standard_DS3_v2",
            node_type_id: "Standard_DS3_v2",
            spark_version: "10.4.x-scala2.12",
            state: "TERMINATED",
        },
        {
            cluster_id: "cluster-id-1",
            cluster_name: "cluster-name-1",
            cluster_source: "UI",
            creator_user_name: "user-1",
            driver_node_type_id: "Standard_DS3_v2",
            node_type_id: "Standard_DS3_v2",
            spark_version: "10.4.x-scala2.12",
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

    it("should get cluster tree node items", async () => {
        const cluster = new Cluster(
            instance(mockApiClient),
            mockListClustersResponse.clusters![0]
        );

        const items = await clusterNodeToTreeItems(cluster);
        assert.deepEqual(items, [
            {
                description: "cluster-id-2",
                label: "Cluster ID",
            },
            {
                description: "Standard_DS3_v2",
                label: "Driver",
            },
            {
                description: "None (single node cluster)",
                label: "Worker",
            },
            {
                description: "10.4.x",
                label: "Databricks Runtime",
            },
            {
                description: "TERMINATED",
                label: "State",
            },
            {
                description: "user-2",
                label: "Creator",
            },
        ]);
    });

    it("should convert cluster node to tree item", () => {
        let cluster = new Cluster(
            instance(mock(ApiClient)),
            mockListClustersResponse.clusters![0]
        );

        let item = clusterNodeToTreeItem(cluster);
        assert.deepEqual(item, {
            collapsibleState: 1,
            contextValue: "cluster",
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

        item = clusterNodeToTreeItem(cluster);
        assert.deepEqual(item, {
            collapsibleState: 1,
            contextValue: "cluster",
            iconPath: {
                color: undefined,
                id: "debug-start",
            },
            id: "cluster-id-1",
            label: "cluster-name-1",
        });
    });
});
