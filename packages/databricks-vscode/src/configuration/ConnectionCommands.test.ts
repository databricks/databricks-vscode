/* eslint-disable @typescript-eslint/naming-convention */
import {ApiClient, Cluster} from "@databricks/databricks-sdk";
import assert from "assert";
import {mock} from "ts-mockito";
import {formatQuickPickClusterDetails} from "./ConnectionCommands";

describe(__filename, () => {
    it("attach cluster quickpick: correctly format cluster details", () => {
        const clusterDetails = formatQuickPickClusterDetails(
            new Cluster(mock(ApiClient), {
                cluster_id: "cluster-id-2",
                cluster_name: "cluster-name-2",
                creator_user_name: "user-2",
                state: "TERMINATED",
                cluster_memory_mb: 2048,
                cluster_cores: 4,
                spark_version: "spark-version",
            })
        );

        assert.equal(clusterDetails, `2 GB | 4 Cores | spark-version | user-2`);
    });
});
