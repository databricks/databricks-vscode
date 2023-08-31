/* eslint-disable @typescript-eslint/naming-convention */

import * as crypto from "crypto";
import {Cluster} from "../Cluster";
import {WorkspaceClient} from "@databricks/databricks-sdk";

export class IntegrationTestSetup {
    readonly testRunId: string;

    constructor(
        readonly client: WorkspaceClient,
        readonly cluster: Cluster
    ) {
        this.testRunId = crypto.randomUUID();
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
