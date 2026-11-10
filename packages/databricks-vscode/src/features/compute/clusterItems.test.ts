import { describe, expect, it } from "vitest";
import {
    clusterUrl,
    dbrVersion,
    formatClusterState,
    formatQuickPickClusterDetails,
    sortClusters,
    type ClusterDetails,
} from "../../kernel/compute/clusters";
import { clusterDetailItems, clusterTreeItem } from "./clusterItems";
import { applyFilter } from "./ComputeView";

const stopped: ClusterDetails = {
    id: "cluster-id-2",
    name: "cluster-name-2",
    state: "TERMINATED",
    creator: "user-2",
    driverNodeTypeId: "Standard_DS3_v2",
    nodeTypeId: "Standard_DS3_v2",
    sparkVersion: "10.4.x-scala2.12",
};
const running: ClusterDetails = {
    ...stopped,
    id: "cluster-id-1",
    name: "cluster-name-1",
    state: "RUNNING",
    creator: "user-1",
};

describe("cluster items", () => {
    // Ported from ConnectionCommands.test.ts.
    it("formats a picker item's details", () => {
        expect(
            formatQuickPickClusterDetails({
                id: "cluster-id-2",
                name: "cluster-name-2",
                creator: "user-2",
                state: "TERMINATED",
                memoryMb: 2048,
                cores: 4,
                sparkVersion: "spark-version",
            }),
        ).toBe("2 GB | 4 Cores | spark-version | user-2");
    });

    it("formatClusterState: maps RUNNING/TERMINATED to Active/Inactive and title-cases the rest", () => {
        expect(
            [
                "RUNNING",
                "TERMINATED",
                "PENDING",
                "RESTARTING",
                "TERMINATING",
                "ERROR",
                "UNKNOWN",
            ].map(formatClusterState),
        ).toEqual([
            "Active",
            "Inactive",
            "Pending",
            "Restarting",
            "Terminating",
            "Error",
            "Unknown",
        ]);
    });

    // Ported from ClusterListDataProvider.test.ts.
    it("lists a cluster's details as the workspace does", () => {
        expect(clusterDetailItems(stopped)).toEqual([
            { description: "cluster-id-2", label: "Cluster ID" },
            { description: "Standard_DS3_v2", label: "Driver" },
            { description: "None (single node cluster)", label: "Worker" },
            { description: "10.4.x", label: "Databricks Runtime" },
            { description: "TERMINATED", label: "State" },
            { description: "user-2", label: "Creator" },
        ]);
        expect(
            clusterDetailItems({ ...running, workers: { kind: "autoscale", min: 1, max: 3 } })[2],
        ).toEqual({ label: "Worker", description: "Standard_DS3_v2, 1-3 workers" });
        expect(clusterDetailItems({ ...running, workers: { kind: "fixed", count: 2 } })[2]).toEqual(
            { label: "Worker", description: "Standard_DS3_v2, 2 workers" },
        );
        expect(clusterDetailItems({ ...stopped, stateMessage: "Inactivity" })[4]).toEqual({
            label: "State",
            description: "TERMINATED - Inactivity",
        });
    });

    it("renders a cluster row with its state's icon", () => {
        expect(clusterTreeItem(stopped)).toMatchObject({
            label: "cluster-name-2",
            id: "cluster-id-2",
            iconPath: { id: "debug-stop" },
            collapsibleState: 1,
        });
        expect(clusterTreeItem(running)).toMatchObject({
            iconPath: { id: "debug-start" },
            contextValue: "cluster.running",
        });
    });

    // Ported from ClusterModel.test.ts.
    it("sorts by state, then by name, and filters by creator or state", () => {
        expect(sortClusters([stopped, running]).map((c) => c.state)).toEqual([
            "RUNNING",
            "TERMINATED",
        ]);
        expect(
            sortClusters([
                { ...running, name: "b" },
                { ...running, name: "a" },
            ]).map((c) => c.name),
        ).toEqual(["a", "b"]);
        expect(applyFilter([stopped, running], "ME", "user-1").map((c) => c.creator)).toEqual([
            "user-1",
        ]);
        expect(applyFilter([stopped, running], "RUNNING", undefined).map((c) => c.id)).toEqual([
            "cluster-id-1",
        ]);
        expect(applyFilter([stopped, running], "ALL", undefined)).toHaveLength(2);
    });

    // Ported from Cluster.test.ts.
    it("should parse DBR from spark_version", () => {
        const versions: [string, Array<number | "x">][] = [
            ["11.x-snapshot-aarch64-scala2.12", [11, "x", "x"]],
            ["10.4.x-scala2.12", [10, 4, "x"]],
            ["7.3.x-scala2.12", [7, 3, "x"]],
            [
                "custom:custom-local__11.3.x-snapshot-cpu-ml-scala2.12__unknown__head__7335a01__cb1aa83__jenkins__641f1a5__format-2.lz4",
                [11, 3, "x"],
            ],
            ["nonsense", ["x", "x", "x"]],
        ];
        for (const [sparkVersion, expected] of versions) {
            expect(dbrVersion(sparkVersion)).toEqual(expected);
        }
    });

    it("should return correct URLs", () => {
        expect(clusterUrl("https://test.cloud.databricks.com/", "1118-013127-82wynr8t")).toBe(
            "https://test.cloud.databricks.com/#setting/clusters/1118-013127-82wynr8t/configuration",
        );
    });
});
