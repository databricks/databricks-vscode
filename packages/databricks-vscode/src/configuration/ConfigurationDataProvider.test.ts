/* eslint-disable @typescript-eslint/naming-convention */

import assert from "assert";
import {mock, when, instance} from "ts-mockito";
import {Disposable} from "vscode";
import {ConfigurationDataProvider} from "./ConfigurationDataProvider";
import {ApiClient, Cluster} from "@databricks/databricks-sdk";
import {ConnectionManager} from "./ConnectionManager";
import {resolveProviderResult} from "../test/utils";
import {SyncDestination} from "./SyncDestination";

describe(__filename, () => {
    let mockedConnectionManager: ConnectionManager;
    let disposables: Array<Disposable>;
    let onChangeClusterListener: (e: Cluster) => void;
    let onChangeSyncDestinationListener: (e: SyncDestination) => void;

    beforeEach(() => {
        disposables = [];
        mockedConnectionManager = mock(ConnectionManager);
        onChangeClusterListener = () => {};
        onChangeSyncDestinationListener = () => {};

        when(mockedConnectionManager.onChangeState).thenReturn((_handler) => {
            return {
                dispose() {},
            };
        });
        when(mockedConnectionManager.onChangeCluster).thenReturn((_handler) => {
            onChangeClusterListener = _handler;
            return {
                dispose() {},
            };
        });
        when(mockedConnectionManager.onChangeSyncDestination).thenReturn(
            (_handler) => {
                onChangeSyncDestinationListener = _handler;
                return {
                    dispose() {},
                };
            }
        );
    });

    afterEach(() => {
        disposables.forEach((d) => d.dispose());
    });

    it("should reload tree on cluster change", async () => {
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

    it("should reload tree on sync destination change", async () => {
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
        onChangeSyncDestinationListener(instance(mock(SyncDestination)));
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
                collapsibleState: 2,
                iconPath: {
                    color: undefined,
                    id: "tools",
                },
                id: "PROFILE",
                label: "Profile",
            },
            {
                collapsibleState: 2,
                contextValue: "clusterAttached",
                iconPath: {
                    color: undefined,
                    id: "server",
                },
                id: "CLUSTER",
                label: "Cluster",
            },
            {
                collapsibleState: 2,
                contextValue: "syncDestinationDetached",
                iconPath: {
                    color: undefined,
                    id: "repo",
                },
                id: "WORKSPACE",
                label: 'Workspace - "None attached"',
            },
        ]);
    });
});
