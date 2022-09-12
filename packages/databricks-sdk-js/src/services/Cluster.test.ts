/* eslint-disable @typescript-eslint/naming-convention */

import {ApiClient, Cluster} from "..";
import chai, {assert} from "chai";
import {mock, when, instance, deepEqual, verify, anything} from "ts-mockito";
import chaiAsPromised from "chai-as-promised";
import Time, {TimeUnits} from "../retries/Time";
import getMockTestCluster from "../test/fixtures/ClusterFixtures";
import {ClusterInfo} from "../apis/clusters";
import TokenFixture from "../test/fixtures/TokenFixture";
import {RetryConfigs} from "../retries/retries";

chai.use(chaiAsPromised);

describe(__filename, function () {
    this.timeout(new Time(10, TimeUnits.minutes).toMillSeconds().value);

    let mockedClient: ApiClient;
    let mockedCluster: Cluster;
    let testClusterDetails: ClusterInfo;

    beforeEach(async () => {
        ({mockedCluster, mockedClient, testClusterDetails} =
            await getMockTestCluster());

        RetryConfigs.waitTime = (attempt) => {
            return new Time(0, TimeUnits.milliseconds);
        };
    });

    it("calling start on a non terminated state should not throw an error", async () => {
        when(
            mockedClient.request(
                "/api/2.0/clusters/get",
                "GET",
                deepEqual({
                    cluster_id: testClusterDetails.cluster_id,
                })
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

        await mockedCluster.start();
        assert.equal(mockedCluster.state, "RUNNING");

        verify(
            mockedClient.request(
                "/api/2.0/clusters/get",
                anything(),
                anything()
            )
        ).times(6);

        verify(
            mockedClient.request(
                "/api/2.0/clusters/start",
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
                })
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
                })
            )
        ).thenResolve({});

        assert.equal(mockedCluster.state, "RUNNING");

        await mockedCluster.stop();
        assert.equal(mockedCluster.state, "TERMINATED");

        verify(
            mockedClient.request(
                "/api/2.0/clusters/get",
                anything(),
                anything()
            )
        ).times(3);

        verify(
            mockedClient.request(
                "/api/2.0/clusters/delete",
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
                })
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

        await mockedCluster.stop();
        assert.equal(mockedCluster.state, "TERMINATED");

        verify(
            mockedClient.request(
                "/api/2.0/clusters/get",
                anything(),
                anything()
            )
        ).times(3);

        verify(
            mockedClient.request(
                "/api/2.0/clusters/delete",
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
                })
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
                })
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
        await mockedCluster.start(instance(token));

        verify(token.isCancellationRequested).thrice();
        assert.equal(mockedCluster.state, "TERMINATED");
    });
});
