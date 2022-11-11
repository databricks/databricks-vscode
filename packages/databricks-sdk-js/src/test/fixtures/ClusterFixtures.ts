/* eslint-disable @typescript-eslint/naming-convention */

import {ApiClient, Cluster} from "../..";
import {ClusterInfo} from "../../apis/clusters";
import {mock, when, resetCalls, instance, anything} from "ts-mockito";

const testClusterDetails: ClusterInfo = {
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
