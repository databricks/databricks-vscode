import {describe} from "mocha";
import {ClusterManager} from "./ClusterManager";
import {
    ApiClient,
    compute,
    Time,
    TimeUnits,
    retries,
} from "@databricks/sdk-experimental";
import {Cluster} from "../sdk-extensions";
import {ClusterFixtures} from "../sdk-extensions/test";
import {
    anything,
    instance,
    mock,
    objectContaining,
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
        ({testClusterDetails} = await ClusterFixtures.getMockTestCluster());
        mockedClient = mock(ApiClient);
        when(
            mockedClient.request(
                objectContaining({
                    path: "/api/2.1/clusters/get",
                    method: "GET",
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
                objectContaining({
                    path: "/api/2.1/clusters/get",
                    method: "GET",
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
