import {describe} from "mocha";
import {ClusterManager} from "./ClusterManager";
import {
    ApiClient,
    compute,
    Cluster,
    Time,
    TimeUnits,
    retries,
} from "@databricks/databricks-sdk";
import {ClusterFixture} from "@databricks/databricks-sdk/dist/test/fixtures";
import {
    anything,
    deepEqual,
    instance,
    mock,
    resetCalls,
    verify,
    when,
} from "ts-mockito";
import assert from "assert";

describe(__filename, async () => {
    let mockedCluster: Cluster;
    let mockedClient: ApiClient;
    let testClusterDetails: compute.ClusterDetails;

    beforeEach(async () => {
        ({testClusterDetails} = await ClusterFixture.getMockTestCluster());
        mockedClient = mock(ApiClient);
        when(
            mockedClient.request(
                "/api/2.0/clusters/get",
                "GET",
                deepEqual({
                    // eslint-disable-next-line
                    cluster_id: testClusterDetails.cluster_id,
                }),
                anything()
            )
        ).thenResolve({
            ...testClusterDetails,
            state: "RUNNING",
        });
        mockedCluster = await Cluster.fromClusterId(
            instance(mockedClient),
            testClusterDetails.cluster_id!
        );

        resetCalls(mockedClient);

        retries.DEFAULT_RETRY_CONFIG.waitTime = () => {
            return new Time(0, TimeUnits.milliseconds);
        };
    });

    it("should start a cluster with progress", async () => {
        when(
            mockedClient.request(
                "/api/2.0/clusters/get",
                "GET",
                deepEqual({
                    // eslint-disable-next-line
                    cluster_id: testClusterDetails.cluster_id,
                }),
                anything()
            )
        ).thenResolve(
            {
                ...testClusterDetails,
                state: "TERMINATED",
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
        assert.equal(mockedCluster.state, "TERMINATED");
        interface OnProgContainer {
            onProgress: (state: compute.State) => void;
        }
        const mockOnProgContainer = mock<OnProgContainer>();
        await new ClusterManager(mockedCluster).start(
            instance(mockOnProgContainer).onProgress
        );

        verify(mockOnProgContainer.onProgress("RUNNING")).calledAfter(
            mockOnProgContainer.onProgress("PENDING")
        );

        assert.equal(mockedCluster.state, "RUNNING");
    });
});
