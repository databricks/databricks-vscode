/* eslint-disable @typescript-eslint/naming-convention */

import {v4 as uuidv4} from "uuid";
import {Cluster} from "../services/Cluster";
import {WorkspaceClient} from "../WorkspaceClient";

export class IntegrationTestSetup {
    readonly testRunId: string;

    constructor(readonly client: WorkspaceClient, readonly cluster: Cluster) {
        this.testRunId = uuidv4();
    }

    private static _instance: IntegrationTestSetup;
    static async getInstance(): Promise<IntegrationTestSetup> {
        if (!this._instance) {
            const client = new WorkspaceClient(
                {},
                {
                    product: "integration-tests",
                    productVersion: "0.0.1",
                }
            );

            if (!process.env["TEST_DEFAULT_CLUSTER_ID"]) {
                throw new Error(
                    "Environment variable 'TEST_DEFAULT_CLUSTER_ID' must be set"
                );
            }

            const clusterId =
                process.env["TEST_DEFAULT_CLUSTER_ID"]!.split("'").join("");

            const cluster = await Cluster.fromClusterId(
                client.apiClient,
                clusterId
            );
            await cluster.start();

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
