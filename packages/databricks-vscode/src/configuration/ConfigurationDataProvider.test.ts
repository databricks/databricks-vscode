/* eslint-disable @typescript-eslint/naming-convention */

import * as assert from "assert";
import {mock, when, instance} from "ts-mockito";
import {Disposable} from "vscode";
import {ConfigurationDataProvider} from "./ConfigurationDataProvider";
import {ApiClient, Cluster} from "@databricks/databricks-sdk";
import {ConnectionManager} from "./ConnectionManager";
import {resolveProviderResult} from "../test/utils";

describe(__filename, () => {
    let mockedConnectionManager: ConnectionManager;
    let disposables: Array<Disposable>;
    let onChangeClusterListener: (e: Cluster) => void;

    beforeEach(() => {
        disposables = [];
        mockedConnectionManager = mock(ConnectionManager);
        onChangeClusterListener = () => {};
        when(mockedConnectionManager.onChangeCluster).thenReturn((_handler) => {
            onChangeClusterListener = _handler;
            return {
                dispose() {},
            };
        });
    });

    afterEach(() => {
        disposables.forEach((d) => d.dispose());
    });

    it("should reload tree on model change", async () => {
        let connectionManager = instance(mockedConnectionManager);
        let provider = new ConfigurationDataProvider(connectionManager);
        disposables.push(provider);

        let called = false;
        disposables.push(
            provider.onDidChangeTreeData(() => {
                called = true;
            })
        );

        assert(!called);
        onChangeClusterListener(new Cluster(instance(mock(ApiClient)), {}));
        assert(called);
    });

    it("should get empty roots", async () => {
        let connectionManager = instance(mockedConnectionManager);
        let provider = new ConfigurationDataProvider(connectionManager);
        disposables.push(provider);

        let children = await resolveProviderResult(provider.getChildren());
        assert(children);
        assert.equal(children.length, 0);
    });

    it("should return cluster children", async () => {
        let cluster = new Cluster(instance(mock(ApiClient)), {
            cluster_id: "cluster-id-2",
            cluster_name: "cluster-name-2",
            cluster_source: "UI",
            creator_user_name: "user-2",
            spark_version: "Spark 3.2.1",
            state: "TERMINATED",
        });

        when(mockedConnectionManager.state).thenReturn("CONNECTED");
        when(mockedConnectionManager.cluster).thenReturn(cluster);

        let connectionManager = instance(mockedConnectionManager);
        let provider = new ConfigurationDataProvider(connectionManager);
        disposables.push(provider);

        let children = await resolveProviderResult(provider.getChildren());
        assert.deepEqual(children, [
            {
                collapsibleState: 0,
                id: "CONNECTION",
                label: "Profile: null",
            },
            {
                collapsibleState: 2,
                contextValue: "clusterStopped",
                iconPath: {
                    color: undefined,
                    id: "debug-stop",
                },
                id: "CLUSTER",
                label: "Cluster: cluster-name-2",
            },
            {
                collapsibleState: 2,
                id: "WORKSPACE",
                label: "Workspace",
            },
        ]);
    });
});
