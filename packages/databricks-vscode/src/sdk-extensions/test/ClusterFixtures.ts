/* eslint-disable @typescript-eslint/naming-convention */

import {Cluster} from "../Cluster";
import {
    mock,
    when,
    resetCalls,
    instance,
    anything,
    objectContaining,
} from "ts-mockito";
import {compute, ApiClient, Config} from "@databricks/sdk-experimental";

const testClusterDetails: compute.ClusterDetails = {
    cluster_id: "testClusterId",
    cluster_name: "testClusterName",
};

export async function getMockTestCluster() {
    const mockedClient = mock(ApiClient);
    const mockedConfig = mock(Config);
    when(mockedConfig.ensureResolved()).thenResolve();
    when(mockedClient.config).thenReturn(instance(mockedConfig));
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

    const mockedCluster = await Cluster.fromClusterId(
        instance(mockedClient),
        testClusterDetails.cluster_id!
    );

    resetCalls(mockedClient);

    return {mockedCluster, mockedClient, testClusterDetails};
}
