/* eslint-disable @typescript-eslint/naming-convention */

import {ApiClient, Cluster} from "../..";
import {mock, when, resetCalls, instance, anything} from "ts-mockito";
import {ClusterDetails} from "../../apis/compute";

const testClusterDetails: ClusterDetails = {
    cluster_id: "testClusterId",
    cluster_name: "testClusterName",
};

export async function getMockTestCluster() {
    const mockedClient = mock(ApiClient);
    when(
        mockedClient.request(
            "/api/2.0/clusters/get",
            "GET",
            anything(),
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
