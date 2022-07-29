/* eslint-disable @typescript-eslint/naming-convention */

import {v4 as uuidv4} from "uuid";
import {ApiClient} from "../api-client";
import {ClusterService} from "../apis/cluster";

export class IntegrationTestSetup {
    readonly testRunId: string;

    constructor(readonly client: ApiClient, readonly clusterId: string) {
        this.testRunId = uuidv4();
    }

    private static _instance: IntegrationTestSetup;
    static async getInstance(): Promise<IntegrationTestSetup> {
        if (!this._instance) {
            let client = new ApiClient();
            let clustersApi = new ClusterService(client);

            if (!process.env["TEST_DEFAULT_CLUSTER_ID"]) {
                throw new Error(
                    "Environment variable 'TEST_DEFAULT_CLUSTER_ID' must be set"
                );
            }

            const clusterId =
                process.env["TEST_DEFAULT_CLUSTER_ID"]!.split("'").join("");
            clustersApi.start({cluster_id: clusterId});

            // wait for cluster to be running
            while (true) {
                let cluster = await clustersApi.get({cluster_id: clusterId});
                if (cluster.state === "RUNNING") {
                    break;
                }

                await new Promise((resolve) => {
                    setTimeout(resolve, 1000);
                });
            }
            this._instance = new IntegrationTestSetup(client, clusterId);
        }
        return this._instance;
    }
}

export function sleep(timeout: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, timeout);
    });
}
