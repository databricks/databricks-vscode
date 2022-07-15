/* eslint-disable @typescript-eslint/naming-convention */

import * as assert from "assert";
import {mock, when, anything, anyString, instance, verify} from "ts-mockito";
import {ApiClient, ListClustersResponse} from "@databricks/databricks-sdk";
import {ClusterModel} from "./ClusterModel";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {Disposable} from "vscode";

const me = "user-1";
const mockListClustersResponse: ListClustersResponse = {
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
        {
            cluster_id: "cluster-id-3",
            cluster_name: "cluster-name-3",
            cluster_source: "JOB",
            creator_user_name: "user-3",
            state: "RUNNING",
        },
    ],
};

describe(__filename, () => {
    let mockedConnectionManager: ConnectionManager;
    let mockedApiClient: ApiClient;
    let disposables: Array<Disposable>;

    beforeEach(() => {
        disposables = [];
        mockedConnectionManager = mock(ConnectionManager);
        mockedApiClient = mock<ApiClient>();
        when<ListClustersResponse>(
            mockedApiClient.request(anyString(), "GET", anything())
        ).thenResolve(mockListClustersResponse);
        when(mockedConnectionManager.apiClient).thenReturn(
            instance(mockedApiClient)
        );
    });

    afterEach(() => {
        disposables.forEach((d) => d.dispose());
    });

    it("should filter out jobs clusters", async () => {
        let model = new ClusterModel(instance(mockedConnectionManager));
        let roots = await model.roots;

        assert(roots);
        assert.equal(roots.length, 2);

        for (let cluster of roots) {
            assert.equal(cluster.source, "UI");
        }
    });

    it("should sort by state", async () => {
        let model = new ClusterModel(instance(mockedConnectionManager));
        let roots = await model.roots;

        assert(roots);
        assert.equal(roots.length, 2);
        assert.equal(roots[0].state, "RUNNING");
        assert.equal(roots[1].state, "TERMINATED");
    });

    it("should filter by me", async () => {
        when(mockedConnectionManager.me).thenReturn(me);

        let model = new ClusterModel(instance(mockedConnectionManager));
        let roots = await model.roots;

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

        roots = await model.roots;

        assert(roots);
        assert.equal(roots.length, 1);
        assert.equal(roots[0].creator, me);
    });

    it("should reload clusters after refresh()", async () => {
        let model = new ClusterModel(instance(mockedConnectionManager));
        let roots = await model.roots;

        let called = false;
        disposables.push(
            model.onDidChange(() => {
                called = true;
            })
        );

        verify(mockedApiClient.request(anyString(), "GET", anything())).times(
            1
        );
        assert(!called);

        // no reload should happen here
        roots = await model.roots;
        verify(mockedApiClient.request(anyString(), "GET", anything())).times(
            1
        );
        assert(!called);

        // reload after refresh
        model.refresh();
        roots = await model.roots;
        verify(mockedApiClient.request(anyString(), "GET", anything())).times(
            2
        );
        assert(called);

        assert(roots);
        assert.equal(roots.length, 2);
    });
});
