import { describe, expect, it } from "vitest";
import {
    checkBuiltins,
    checkCluster,
    checkDatabricksConnectVersion,
    checkEnvironmentDependencies,
    checkWorkspaceHasUc,
    DATABRICKS_CONNECT_MINIMAL_VERSION,
    interpreterCompute,
    reinstallPlaceholder,
    suggestedDbConnectVersion,
    type ChecklistCompute,
} from "./checks";

const cluster = (
    dbrVersion: (number | "x")[],
    accessMode: string | undefined = "SINGLE_USER",
): ChecklistCompute => ({ kind: "cluster", dbrVersion, accessMode });
const serverless = (dbConnectVersion = "17.3"): ChecklistCompute => ({
    kind: "serverless",
    dbConnectVersion,
});

describe("checkCluster", () => {
    it("passes serverless and a Unity Catalog cluster on DBR 13 or later, with no row", () => {
        expect(checkCluster(serverless())).toEqual({ id: "checkCluster", available: true });
        for (const mode of ["SINGLE_USER", "SHARED", "USER_ISOLATION"]) {
            expect(checkCluster(cluster([13, 3, "x"], mode))).toEqual({
                id: "checkCluster",
                available: true,
            });
        }
        // A custom or unknown runtime isn't refused for its version.
        expect(checkCluster(cluster(["x", "x", "x"])).available).toBe(true);
    });

    it("asks to attach a cluster when none is", () => {
        expect(checkCluster({ kind: "none" })).toEqual({
            id: "checkCluster",
            available: false,
            title: "Attach a cluster",
            message: "Databricks Connect requires cluster DBR >= 13.0.0",
            action: "attachCluster",
            actionMessage: "Please attach a cluster to use Databricks Connect.",
        });
    });

    it("refuses a runtime before 13, with the old picker message", () => {
        expect(checkCluster(cluster([12, 2, "x"]))).toMatchObject({
            available: false,
            title: "Attach a cluster with DBR >= 13.0.0",
            actionMessage:
                "Databricks Connect requires cluster DBR >= 13.0.0. Currently it is 12.2.x. Please attach a new cluster.",
        });
    });

    it("refuses a cluster without a Unity Catalog access mode", () => {
        expect(checkCluster(cluster([15, 4, "x"], "NONE"))).toMatchObject({
            available: false,
            title: "Attach a cluster with Unity Catalog",
            message: "Databricks Connect requires a cluster with UC enabled",
            actionMessage: expect.stringContaining("Currently it is NONE.") as string,
        });
        expect(checkCluster({ kind: "cluster", dbrVersion: [15, 4, "x"] }).actionMessage).toContain(
            "Currently it is custom.",
        );
    });

    it("fails without a row while the attached cluster isn't read", () => {
        expect(checkCluster({ kind: "pending" })).toEqual({ id: "checkCluster", available: false });
    });
});

describe("checkWorkspaceHasUc", () => {
    it("passes with a readable catalog", () => {
        expect(checkWorkspaceHasUc({ kind: "found" })).toEqual({
            id: "checkWorkspaceHasUc",
            available: true,
        });
    });

    it("says Unity Catalog is missing without catalogs, or without a metastore", () => {
        const missing = {
            id: "checkWorkspaceHasUc",
            available: false,
            title: "The workspace should have Unity Catalog enabled",
            message: "No catalogues with read permission were found",
        };
        expect(checkWorkspaceHasUc({ kind: "none" })).toEqual(missing);
        expect(
            checkWorkspaceHasUc({
                kind: "failed",
                message: "METASTORE_DOES_NOT_EXIST: no metastore",
            }),
        ).toEqual(missing);
    });

    it("shows other failures on the row", () => {
        expect(checkWorkspaceHasUc({ kind: "failed", message: "PERMISSION_DENIED" })).toEqual({
            id: "checkWorkspaceHasUc",
            available: false,
            title: "Failed to check workspace permissions",
            message: "PERMISSION_DENIED",
        });
    });
});

describe("checkDatabricksConnectVersion", () => {
    it.each([
        // [installed, compute, available, title]
        ["15.4.2", serverless(), true, "Databricks Connect: 15.4.2"],
        ["17.3.1", serverless(), true, "Databricks Connect: 17.3.1"],
        ["15.3.0", serverless(), false, "Update databricks-connect"],
        ["14.3.1", serverless(), false, "Update databricks-connect"],
        ["12.2.0", cluster([13, 3, "x"]), false, "Update databricks-connect"],
        ["13.3.2", cluster([13, 3, "x"]), true, "Databricks Connect: 13.3.2"],
        ["13.3.2", cluster([15, 4, "x"]), true, "Databricks Connect: 13.3.2"],
        ["15.4.1", cluster([15, 4, "x"]), true, "Databricks Connect: 15.4.1"],
        ["15.4.1", cluster([15, "x", "x"]), true, "Databricks Connect: 15.4.1"],
        ["16.1.0", cluster([15, 4, "x"]), false, "Reinstall databricks-connect"],
        ["15.5.0", cluster([15, 4, "x"]), false, "Reinstall databricks-connect"],
        ["17.0.0", cluster(["x", "x", "x"]), true, "Databricks Connect: 17.0.0"],
        ["16.0.0", { kind: "none" } as ChecklistCompute, true, "Databricks Connect: 16.0.0"],
    ] as const)("%s on %j: available %s", (version, compute, available, title) => {
        const check = checkDatabricksConnectVersion(version, compute);
        expect(check).toMatchObject({ id: "checkEnvironmentDependencies", available, title });
        if (!available) {
            expect(check.action).toBe("reinstallDbConnect");
        }
    });

    it("keeps the old messages", () => {
        expect(checkDatabricksConnectVersion("15.3.0", serverless()).message).toBe(
            "Databricks Connect 15.3.0 doesn't support serverless, please update to 15.4.0 or higher.",
        );
        expect(checkDatabricksConnectVersion("12.2.0", cluster([13, 3, "x"])).message).toBe(
            "Databricks Connect 12.2.0 is outdated, please update to 13.0.0 or higher.",
        );
        expect(checkDatabricksConnectVersion("16.1.0", cluster([15, 4, "x"])).message).toBe(
            "Databricks Connect version (16.1.0) should be equal or lower than the cluster DBR version (15.4).",
        );
    });
});

describe("checkEnvironmentDependencies", () => {
    it("needs a passing interpreter first", () => {
        expect(checkEnvironmentDependencies(false, undefined, serverless())).toEqual({
            id: "checkEnvironmentDependencies",
            available: false,
            title: "Can't install databricks-connect without an active python environment",
        });
    });

    it("offers the install when the package is missing", () => {
        expect(checkEnvironmentDependencies(true, { kind: "missing" }, serverless())).toEqual({
            id: "checkEnvironmentDependencies",
            available: false,
            title: "Install databricks-connect",
            message: "databricks-connect package is not installed in the current environment.",
            action: "installDbConnect",
        });
    });

    it("checks the installed version against the compute", () => {
        expect(
            checkEnvironmentDependencies(
                true,
                { kind: "installed", version: "17.3.1" },
                serverless(),
            ),
        ).toMatchObject({ available: true, title: "Databricks Connect: 17.3.1" });
    });

    it("shows a failed read on the row, to check again", () => {
        expect(
            checkEnvironmentDependencies(
                true,
                { kind: "failed", message: "pip: not found" },
                serverless(),
            ),
        ).toEqual({
            id: "checkEnvironmentDependencies",
            available: false,
            title: "Failed to check dependencies",
            message: "pip: not found",
            action: "recheck",
        });
    });
});

describe("checkBuiltins (PYENV-09)", () => {
    it("has no row until Databricks Connect passes, or once the builtins are configured", () => {
        expect(checkBuiltins(false, { kind: "needed" })).toEqual({
            id: "checkBuiltins",
            available: true,
        });
        expect(checkBuiltins(true, undefined)).toEqual({ id: "checkBuiltins", available: true });
        expect(checkBuiltins(true, { kind: "configured" })).toEqual({
            id: "checkBuiltins",
            available: true,
        });
    });

    it("offers the builtins file, optionally", () => {
        expect(checkBuiltins(true, { kind: "needed" })).toEqual({
            id: "checkBuiltins",
            available: false,
            optional: true,
            title: "Setup Databricks builtins for autocompletion",
            message:
                "Optional: create a __builtins__.pyi file to enable autocompletion for Databricks builtins.",
            action: "configureAutocomplete",
        });
    });

    it("shows a failed check on the row, with check-again", () => {
        expect(
            checkBuiltins(true, {
                kind: "failed",
                message: "Can't read internal type stubs for autocompletion. ENOENT",
            }),
        ).toEqual({
            id: "checkBuiltins",
            available: false,
            optional: true,
            title: "Failed to check Databricks builtins definition",
            message: "Can't read internal type stubs for autocompletion. ENOENT",
            action: "recheck",
        });
    });
});

describe("the version to install (PYENV-08)", () => {
    it.each([
        [serverless("17.3"), "17.3.*"],
        [serverless("16"), "16.3.*"],
        [serverless("15.4"), "15.4.*"],
        [cluster([15, 4, "x"]), "15.4.*"],
        [cluster([16, "x", "x"]), "16.*"],
        [cluster(["x", "x", "x"]), DATABRICKS_CONNECT_MINIMAL_VERSION],
        [{ kind: "none" } as ChecklistCompute, DATABRICKS_CONNECT_MINIMAL_VERSION],
        [{ kind: "pending" } as ChecklistCompute, DATABRICKS_CONNECT_MINIMAL_VERSION],
    ] as const)("%j suggests %s", (compute, version) => {
        expect(suggestedDbConnectVersion(compute)).toBe(version);
    });

    it("prefills the reinstall prompt from the cluster's runtime only", () => {
        expect(reinstallPlaceholder(cluster([14, 3, "x"]))).toBe("14.3.*");
        expect(reinstallPlaceholder(cluster(["x", "x", "x"]))).toBe(undefined);
        expect(reinstallPlaceholder(serverless())).toBe(undefined);
    });
});

describe("interpreterCompute", () => {
    it("passes a known runtime on to the interpreter check", () => {
        expect(interpreterCompute(serverless())).toEqual({
            kind: "serverless",
            dbConnectVersion: "17.3",
        });
        expect(interpreterCompute(cluster([15, 4, "x"]))).toMatchObject({
            kind: "cluster",
            dbrVersion: [15, 4, "x"],
        });
        expect(interpreterCompute({ kind: "none" })).toBe(undefined);
        expect(interpreterCompute({ kind: "pending" })).toBe(undefined);
    });
});
