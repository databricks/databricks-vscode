/* eslint-disable @typescript-eslint/naming-convention */
import {ApiClient} from "@databricks/sdk-experimental";
import {Cluster} from "../sdk-extensions";
import assert from "assert";
import {mock} from "ts-mockito";
import {
    formatClusterState,
    formatQuickPickClusterDetails,
} from "./ConnectionCommands";

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

    it("formatClusterState: maps RUNNING/TERMINATED to Active/Inactive and title-cases the rest", () => {
        assert.equal(formatClusterState("RUNNING"), "Active");
        assert.equal(formatClusterState("TERMINATED"), "Inactive");
        assert.equal(formatClusterState("PENDING"), "Pending");
        assert.equal(formatClusterState("RESTARTING"), "Restarting");
        assert.equal(formatClusterState("TERMINATING"), "Terminating");
        assert.equal(formatClusterState("ERROR"), "Error");
        assert.equal(formatClusterState("UNKNOWN"), "Unknown");
    });
});
