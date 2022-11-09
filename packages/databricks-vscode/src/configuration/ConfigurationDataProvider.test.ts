/* eslint-disable @typescript-eslint/naming-convention */

import assert from "assert";
import {mock, when, instance, anything} from "ts-mockito";
import {Disposable} from "vscode";
import {ConfigurationDataProvider} from "./ConfigurationDataProvider";
import {ApiClient, Cluster} from "@databricks/databricks-sdk";
import {ConnectionManager} from "./ConnectionManager";
import {resolveProviderResult} from "../test/utils";
import {SyncDestination} from "./SyncDestination";
import {CodeSynchronizer} from "../sync/CodeSynchronizer";

describe(__filename, () => {
    let connectionManagerMock: ConnectionManager;
    let disposables: Array<Disposable>;
    let onChangeClusterListener: (e: Cluster) => void;
    let onChangeSyncDestinationListener: (e: SyncDestination) => void;
    let sync: CodeSynchronizer;

    beforeEach(() => {
        disposables = [];
        connectionManagerMock = mock(ConnectionManager);
        when(connectionManagerMock.state).thenReturn("DISCONNECTED");
        onChangeClusterListener = () => {};
        onChangeSyncDestinationListener = () => {};

        when(connectionManagerMock.onDidChangeState).thenReturn(() => {
            return {
                dispose() {},
            };
        });
        when(connectionManagerMock.onDidChangeCluster).thenReturn(
            (_handler) => {
                onChangeClusterListener = _handler;
                return {
                    dispose() {},
                };
            }
        );
        when(connectionManagerMock.onDidChangeSyncDestination).thenReturn(
            (_handler) => {
                onChangeSyncDestinationListener = _handler;
                return {
                    dispose() {},
                };
            }
        );

        const syncMock = mock(CodeSynchronizer);
        when(syncMock.onDidChangeState(anything())).thenReturn({
            dispose() {},
        });
        sync = instance(syncMock);
    });

    afterEach(() => {
        disposables.forEach((d) => d.dispose());
    });

    it("should reload tree on cluster change", async () => {
        const connectionManager = instance(connectionManagerMock);
        const provider = new ConfigurationDataProvider(connectionManager, sync);
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
        const connectionManager = instance(connectionManagerMock);
        const provider = new ConfigurationDataProvider(connectionManager, sync);
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
        const connectionManager = instance(connectionManagerMock);
        const provider = new ConfigurationDataProvider(connectionManager, sync);
        disposables.push(provider);

        const children = await resolveProviderResult(provider.getChildren());
        assert(children);
        assert.equal(children.length, 0);
    });

    it("should return cluster children", async () => {
        const cluster = new Cluster(instance(mock(ApiClient)), {
            cluster_id: "cluster-id-2",
            cluster_name: "cluster-name-2",
            cluster_source: "UI",
            creator_user_name: "user-2",
            spark_version: "10.4.x-scala2.12",
            state: "TERMINATED",
        });

        when(connectionManagerMock.state).thenReturn("CONNECTED");
        when(connectionManagerMock.cluster).thenReturn(cluster);

        const connectionManager = instance(connectionManagerMock);
        const provider = new ConfigurationDataProvider(connectionManager, sync);
        disposables.push(provider);

        const children = await resolveProviderResult(provider.getChildren());
        assert.deepEqual(children, [
            {
                collapsibleState: 2,
                contextValue: "workspace",
                iconPath: {
                    color: undefined,
                    id: "account",
                },
                id: "WORKSPACE",
                label: "Workspace",
            },
            {
                collapsibleState: 2,
                contextValue: "clusterStopped",
                iconPath: {
                    color: undefined,
                    id: "server",
                },
                id: "CLUSTER",
                label: "Cluster",
            },
            {
                collapsibleState: 2,
                contextValue: "syncDetached",
                iconPath: {
                    color: undefined,
                    id: "repo",
                },
                id: "REPO",
                label: 'Repo - "None attached"',
            },
        ]);
    });
});
