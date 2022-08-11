/* eslint-disable @typescript-eslint/naming-convention */

import {v4 as uuidv4} from "uuid";
import {ApiClient} from "../api-client";
import {ClusterService} from "../apis/cluster";
import {Cluster} from "../services/Cluster";

export class IntegrationTestSetup {
    readonly testRunId: string;

    constructor(readonly client: ApiClient, readonly cluster: Cluster) {
        this.testRunId = uuidv4();
    }

    private static _instance: IntegrationTestSetup;
    static async getInstance(): Promise<IntegrationTestSetup> {
        if (!this._instance) {
            let client = new ApiClient("integration-tests", "0.0.1");

            if (!process.env["TEST_DEFAULT_CLUSTER_ID"]) {
                throw new Error(
                    "Environment variable 'TEST_DEFAULT_CLUSTER_ID' must be set"
                );
            }

            const clusterId =
                process.env["TEST_DEFAULT_CLUSTER_ID"]!.split("'").join("");

            const cluster = await Cluster.fromClusterId(client, clusterId);
            cluster.start();
            // wait for cluster to be running
            await cluster.waitForState("RUNNING");

            this._instance = new IntegrationTestSetup(client, cluster);
        }
        return this._instance;
    }
}

export function sleep(timeout: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, timeout);
    });
}
