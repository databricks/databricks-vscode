/* eslint-disable @typescript-eslint/naming-convention */

import {ApiClient, Cluster} from "..";
import * as assert from "node:assert";
import {mock, when, instance, deepEqual, verify, anything} from "ts-mockito";
import Time, {TimeUnits} from "../retries/Time";
import {getMockTestCluster} from "../test/fixtures/ClusterFixtures";
import {ClusterInfo} from "../apis/clusters";
import {TokenFixture} from "../test/fixtures/TokenFixtures";
import FakeTimers from "@sinonjs/fake-timers";

describe(__filename, function () {
    this.timeout(new Time(10, TimeUnits.minutes).toMillSeconds().value);

    let mockedClient: ApiClient;
    let mockedCluster: Cluster;
    let testClusterDetails: ClusterInfo;
    let fakeTimer: FakeTimers.InstalledClock;

    beforeEach(async () => {
        ({mockedCluster, mockedClient, testClusterDetails} =
            await getMockTestCluster());

        fakeTimer = FakeTimers.install();
    });

    afterEach(() => {
        fakeTimer.uninstall();
    });

    it("calling start on a non terminated state should not throw an error", async () => {
        when(
            mockedClient.request(
                "/api/2.0/clusters/get",
                "GET",
                deepEqual({
                    cluster_id: testClusterDetails.cluster_id,
                }),
                anything()
            )
        ).thenResolve(
            {
                ...testClusterDetails,
                state: "PENDING",
            },
            {
                ...testClusterDetails,
                state: "PENDING",
            },
            {
                ...testClusterDetails,
                state: "PENDING",
            },
            {
                ...testClusterDetails,
                state: "PENDING",
            },
            {
                ...testClusterDetails,
                state: "PENDING",
            },
            {
                ...testClusterDetails,
                state: "RUNNING",
            }
        );

        await mockedCluster.refresh();
        assert.notEqual(mockedCluster.state, "RUNNING");

        const startPromise = mockedCluster.start();
        await fakeTimer.runToLastAsync();
        await startPromise;
        assert.equal(mockedCluster.state, "RUNNING");

        verify(
            mockedClient.request(
                "/api/2.0/clusters/get",
                anything(),
                anything(),
                anything()
            )
        ).times(6);

        verify(
            mockedClient.request(
                "/api/2.0/clusters/start",
                anything(),
                anything(),
                anything()
            )
        ).never();
    });

    it("should terminate cluster", async () => {
        when(
            mockedClient.request(
                "/api/2.0/clusters/get",
                "GET",
                deepEqual({
                    cluster_id: testClusterDetails.cluster_id,
                }),
                anything()
            )
        ).thenResolve(
            {
                ...testClusterDetails,
                state: "RUNNING",
            },
            {
                ...testClusterDetails,
                state: "TERMINATING",
            },
            {
                ...testClusterDetails,
                state: "TERMINATED",
            }
        );

        when(
            mockedClient.request(
                "/api/2.0/clusters/delete",
                "POST",
                deepEqual({
                    cluster_id: testClusterDetails.cluster_id,
                }),
                anything()
            )
        ).thenResolve({});

        assert.equal(mockedCluster.state, "RUNNING");

        const stopPromise = mockedCluster.stop();
        await fakeTimer.runToLastAsync();
        await stopPromise;

        assert.equal(mockedCluster.state, "TERMINATED");

        verify(
            mockedClient.request(
                "/api/2.0/clusters/get",
                anything(),
                anything(),
                anything()
            )
        ).times(3);

        verify(
            mockedClient.request(
                "/api/2.0/clusters/delete",
                anything(),
                anything(),
                anything()
            )
        ).once();
    });

    it("should terminate non running clusters", async () => {
        when(
            mockedClient.request(
                "/api/2.0/clusters/get",
                "GET",
                deepEqual({
                    cluster_id: testClusterDetails.cluster_id,
                }),
                anything()
            )
        ).thenResolve(
            {
                ...testClusterDetails,
                state: "PENDING",
            },
            {
                ...testClusterDetails,
                state: "TERMINATING",
            },
            {
                ...testClusterDetails,
                state: "TERMINATED",
            }
        );

        await mockedCluster.refresh();
        assert.notEqual(mockedCluster.state, "RUNNING");

        const stopPromise = mockedCluster.stop();
        await fakeTimer.runToLastAsync();
        await stopPromise;

        assert.equal(mockedCluster.state, "TERMINATED");

        verify(
            mockedClient.request(
                "/api/2.0/clusters/get",
                anything(),
                anything(),
                anything()
            )
        ).times(3);

        verify(
            mockedClient.request(
                "/api/2.0/clusters/delete",
                anything(),
                anything(),
                anything()
            )
        ).once();
    });

    it("should cancel cluster start", async () => {
        const whenMockGetCluster = when(
            mockedClient.request(
                "/api/2.0/clusters/get",
                "GET",
                deepEqual({
                    cluster_id: testClusterDetails.cluster_id,
                }),
                anything()
            )
        );

        whenMockGetCluster.thenResolve({
            ...testClusterDetails,
            state: "PENDING",
        });

        when(
            mockedClient.request(
                "/api/2.0/clusters/delete",
                "POST",
                deepEqual({
                    cluster_id: testClusterDetails.cluster_id,
                }),
                anything()
            )
        ).thenCall(() => {
            whenMockGetCluster.thenResolve(
                {
                    ...testClusterDetails,
                    state: "TERMINATING",
                },
                {
                    ...testClusterDetails,
                    state: "TERMINATED",
                }
            );
            return {};
        });

        const token = mock(TokenFixture);
        when(token.isCancellationRequested).thenReturn(false, false, true);
        //mocked cluster is initially in running state, this gets it to pending state
        await mockedCluster.refresh();

        assert.equal(mockedCluster.state, "PENDING");
        const startPromise = mockedCluster.start(instance(token));
        await fakeTimer.runToLastAsync();
        await startPromise;

        verify(token.isCancellationRequested).thrice();
    });

    it("should parse DBR from spark_version", () => {
        const mockedClient = mock(ApiClient);
        const clusterDetails = {
            spark_version: "7.3.x-scala2.12",
        };
        const cluster = new Cluster(instance(mockedClient), clusterDetails);

        const versions = [
            ["11.x-snapshot-aarch64-scala2.12", [11, "x", "x"]],
            ["10.4.x-scala2.12", [10, 4, "x"]],
            ["7.3.x-scala2.12", [7, 3, "x"]],
            [
                "custom:custom-local__11.3.x-snapshot-cpu-ml-scala2.12__unknown__head__7335a01__cb1aa83__jenkins__641f1a5__format-2.lz4",
                [11, 3, "x"],
            ],
        ];

        for (const [sparkVersion, expectedDbr] of versions) {
            clusterDetails.spark_version = sparkVersion as string;
            assert.deepEqual(cluster.dbrVersion, expectedDbr);
        }
    });

    it("should return correct URLs", async () => {
        const mockedClient = mock(ApiClient);
        when(mockedClient.host).thenResolve(
            new URL("https://test.cloud.databricks.com")
        );
        const clusterDetails = {
            cluster_id: "1118-013127-82wynr8t",
        };
        const cluster = new Cluster(instance(mockedClient), clusterDetails);

        assert.equal(
            await cluster.url,
            "https://test.cloud.databricks.com/#setting/clusters/1118-013127-82wynr8t/configuration"
        );

        assert.equal(
            await cluster.driverLogsUrl,
            "https://test.cloud.databricks.com/#setting/clusters/1118-013127-82wynr8t/driverLogs"
        );

        assert.equal(
            await cluster.metricsUrl,
            "https://test.cloud.databricks.com/#setting/clusters/1118-013127-82wynr8t/metrics"
        );

        assert.equal(
            await cluster.getSparkUiUrl(),
            "https://test.cloud.databricks.com/#setting/clusters/1118-013127-82wynr8t/sparkUi"
        );

        assert.equal(
            await cluster.getSparkUiUrl("7189805239423176682"),
            "https://test.cloud.databricks.com/#setting/sparkui/1118-013127-82wynr8t/driver-7189805239423176682"
        );
    });
});
