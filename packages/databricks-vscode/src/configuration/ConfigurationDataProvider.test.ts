/* eslint-disable @typescript-eslint/naming-convention */

import assert from "assert";
import {mock, when, instance, anything} from "ts-mockito";
import {Disposable} from "vscode";
import {ConfigurationDataProvider} from "./ConfigurationDataProvider";
import {ApiClient} from "@databricks/databricks-sdk";
import {Cluster} from "../sdk-extensions";
import {ConnectionManager} from "./ConnectionManager";
import {resolveProviderResult} from "../test/utils";
import {SyncDestinationMapper} from "../sync/SyncDestination";
import {CodeSynchronizer} from "../sync/CodeSynchronizer";
import {StateStorage} from "../vscode-objs/StateStorage";
import {WorkspaceFsAccessVerifier} from "../workspace-fs";
import {FeatureManager} from "../feature-manager/FeatureManager";
import {Telemetry} from "../telemetry";

describe(__filename, () => {
    let connectionManagerMock: ConnectionManager;
    let disposables: Array<Disposable>;
    let onChangeClusterListener: (e: Cluster) => void;
    let onChangeSyncDestinationListener: (e: SyncDestinationMapper) => void;
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
        disposables.forEach((d) => {
            try {
                d.dispose();
            } catch (e) {}
        });
    });

    it("should reload tree on cluster change", async () => {
        const connectionManager = instance(connectionManagerMock);
        const provider = new ConfigurationDataProvider(
            connectionManager,
            sync,
            instance(mock(StateStorage)),
            instance(mock(WorkspaceFsAccessVerifier)),
            instance(mock(FeatureManager<"debugging.dbconnect">)),
            instance(mock(Telemetry))
        );
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
        const provider = new ConfigurationDataProvider(
            connectionManager,
            sync,
            instance(mock(StateStorage)),
            instance(mock(WorkspaceFsAccessVerifier)),
            instance(mock(FeatureManager<"debugging.dbconnect">)),
            instance(mock(Telemetry))
        );
        disposables.push(provider);

        let called = false;
        disposables.push(
            provider.onDidChangeTreeData(() => {
                called = true;
            })
        );

        assert(!called);
        onChangeSyncDestinationListener(instance(mock(SyncDestinationMapper)));
        assert(called);
    });

    it("should get empty roots", async () => {
        const connectionManager = instance(connectionManagerMock);
        const provider = new ConfigurationDataProvider(
            connectionManager,
            sync,
            instance(mock(StateStorage)),
            instance(mock(WorkspaceFsAccessVerifier)),
            instance(mock(FeatureManager<"debugging.dbconnect">)),
            instance(mock(Telemetry))
        );
        disposables.push(provider);

        const children = await resolveProviderResult(provider.getChildren());
        assert(children);
        assert.equal(children.length, 0);
    });

    it("should return cluster children", async () => {
        const mockApiClient = mock(ApiClient);
        when(mockApiClient.host).thenResolve(
            new URL("https://www.example.com")
        );
        const cluster = new Cluster(instance(mockApiClient), {
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
        const provider = new ConfigurationDataProvider(
            connectionManager,
            sync,
            instance(mock(StateStorage)),
            instance(mock(WorkspaceFsAccessVerifier)),
            instance(mock(FeatureManager<"debugging.dbconnect">)),
            instance(mock(Telemetry))
        );
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
                url: undefined,
            },
            {
                collapsibleState: 2,
                contextValue: "databricks.cluster.terminated",
                iconPath: {
                    color: undefined,
                    id: "server",
                },
                id: "CLUSTER",
                label: "Cluster",
                url: "https://www.example.com/#setting/clusters/cluster-id-2/configuration",
            },
            {
                collapsibleState: 2,
                contextValue: "syncDetached",
                iconPath: {
                    color: undefined,
                    id: "file-directory",
                },
                id: "SYNC-DESTINATION",
                label: 'Sync Destination - "None attached"',
            },
        ]);
    });
});
