/* eslint-disable @typescript-eslint/naming-convention */

import {ApiClient, Cluster} from "../..";
import {GetClusterResponse} from "../../apis/cluster";
import {mock, when, deepEqual, resetCalls, instance} from "ts-mockito";

const testClusterDetails: GetClusterResponse = {
    cluster_id: "testClusterId",
    cluster_name: "testClusterName",
};

export default async function getMockTestCluster() {
    const mockedClient = mock(ApiClient);
    when(
        mockedClient.request(
            "/api/2.0/clusters/get",
            "GET",
            deepEqual({
                cluster_id: testClusterDetails.cluster_id,
            })
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
