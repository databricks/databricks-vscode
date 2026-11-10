import type { ReadinessCheck } from "../readiness";
import type { InterpreterCompute } from "./interpreterCheck";

/**
 * What the checklist checks against: nothing attached, a cluster that isn't
 * read yet, a cluster with its runtime and access mode, or serverless.
 */
export type ChecklistCompute =
    | { readonly kind: "none" }
    | { readonly kind: "pending" }
    | {
          readonly kind: "cluster";
          readonly dbrVersion: readonly (number | "x")[];
          readonly accessMode?: string;
      }
    | { readonly kind: "serverless"; readonly dbConnectVersion: string };

/** The interpreter check reads only a known runtime, as before. */
export function interpreterCompute(compute: ChecklistCompute): InterpreterCompute | undefined {
    return compute.kind === "cluster" || compute.kind === "serverless" ? compute : undefined;
}

/** The old `Cluster.isUc`. */
const UC_ACCESS_MODES = ["SINGLE_USER", "SHARED", "USER_ISOLATION"];

/** The compute check: its failing row is calm, as "Select compute" is. */
export const CLUSTER_CHECK_ID = "checkCluster";
const UC = "checkWorkspaceHasUc";
const DEPENDENCIES = "checkEnvironmentDependencies";
const BUILTINS = "checkBuiltins";

/**
 * The checklist's compute row: the old
 * `EnvironmentDependenciesVerifier.checkCluster`, with the same strings.
 * Serverless passes; a cluster needs DBR 13 or later and a Unity Catalog
 * access mode. A passing check has no title, so no row. A cluster that
 * isn't read yet fails without a row: the check runs again once it is.
 */
export function checkCluster(compute: ChecklistCompute): ReadinessCheck {
    if (compute.kind === "serverless") {
        return { id: CLUSTER_CHECK_ID, available: true };
    }
    if (compute.kind === "pending") {
        return { id: CLUSTER_CHECK_ID, available: false };
    }
    if (compute.kind === "none") {
        return {
            id: CLUSTER_CHECK_ID,
            available: false,
            title: "Attach a cluster",
            message: "Databricks Connect requires cluster DBR >= 13.0.0",
            action: "attachCluster",
            actionMessage: "Please attach a cluster to use Databricks Connect.",
        };
    }
    const parts = compute.dbrVersion;
    const major = parts[0];
    if (major === undefined || (major !== "x" && major < 13)) {
        return {
            id: CLUSTER_CHECK_ID,
            available: false,
            title: "Attach a cluster with DBR >= 13.0.0",
            message: "Databricks Connect requires a cluster with DBR >= 13.0.0",
            action: "attachCluster",
            actionMessage: `Databricks Connect requires cluster DBR >= 13.0.0. Currently it is ${parts.join(".")}. Please attach a new cluster.`,
        };
    }
    if (compute.accessMode === undefined || !UC_ACCESS_MODES.includes(compute.accessMode)) {
        return {
            id: CLUSTER_CHECK_ID,
            available: false,
            title: "Attach a cluster with Unity Catalog",
            message: "Databricks Connect requires a cluster with UC enabled",
            action: "attachCluster",
            actionMessage: `Databricks Connect requires a Unity Catalog enabled cluster with Access Mode "Single User" or "Shared". Currently it is ${
                compute.accessMode ?? "custom"
            }. Please attach a new cluster.`,
        };
    }
    return { id: CLUSTER_CHECK_ID, available: true };
}

/** What listing the first page of catalogs found. */
export type CatalogProbe =
    | { readonly kind: "found" }
    | { readonly kind: "none" }
    | { readonly kind: "failed"; readonly message: string };

/**
 * The Unity Catalog row: the old `checkWorkspaceHasUc`. A workspace without
 * a metastore reads as "no catalogs", as before. Any other failure is shown
 * on the row and logged by the caller; the old check also showed a toast,
 * which a background check no longer does.
 */
export function checkWorkspaceHasUc(probe: CatalogProbe): ReadinessCheck {
    if (probe.kind === "found") {
        return { id: UC, available: true };
    }
    if (probe.kind === "failed" && !probe.message.includes("METASTORE_DOES_NOT_EXIST")) {
        return {
            id: UC,
            available: false,
            title: "Failed to check workspace permissions",
            message: probe.message,
        };
    }
    return {
        id: UC,
        available: false,
        title: "The workspace should have Unity Catalog enabled",
        message: "No catalogues with read permission were found",
    };
}

function versionParts(version: string): [number, number] {
    const parts = version.split(".");
    return [parseInt(parts[0] ?? "", 10), parseInt(parts[1] ?? "", 10)];
}

/**
 * The installed Databricks Connect against the compute: the old
 * `checkDatabricksConnectVersion`. Serverless needs 15.4 or later, any
 * compute 13 or later, and a cluster no newer a version than its runtime.
 */
export function checkDatabricksConnectVersion(
    version: string,
    compute: ChecklistCompute,
): ReadinessCheck {
    const [major, minor] = versionParts(version);
    if (compute.kind === "serverless" && (major < 15 || (major === 15 && minor < 4))) {
        return {
            id: DEPENDENCIES,
            available: false,
            title: "Update databricks-connect",
            message: `Databricks Connect ${version} doesn't support serverless, please update to 15.4.0 or higher.`,
            action: "reinstallDbConnect",
        };
    }
    if (major < 13) {
        return {
            id: DEPENDENCIES,
            available: false,
            title: "Update databricks-connect",
            message: `Databricks Connect ${version} is outdated, please update to 13.0.0 or higher.`,
            action: "reinstallDbConnect",
        };
    }
    if (
        compute.kind === "cluster" &&
        compute.dbrVersion[0] !== "x" &&
        compute.dbrVersion[0] !== undefined
    ) {
        const dbrMajor = compute.dbrVersion[0];
        const dbrMinor = compute.dbrVersion[1];
        const higher =
            major > dbrMajor ||
            (major === dbrMajor && dbrMinor !== "x" && dbrMinor !== undefined && minor > dbrMinor);
        if (higher) {
            return {
                id: DEPENDENCIES,
                available: false,
                title: "Reinstall databricks-connect",
                message: `Databricks Connect version (${version}) should be equal or lower than the cluster DBR version (${dbrMajor}.${dbrMinor}).`,
                action: "reinstallDbConnect",
            };
        }
    }
    return { id: DEPENDENCIES, available: true, title: `Databricks Connect: ${version}` };
}

/** What reading the interpreter's packages found. */
export type PackageProbe =
    | { readonly kind: "installed"; readonly version: string }
    | { readonly kind: "missing" }
    | { readonly kind: "failed"; readonly message: string };

/**
 * The Databricks Connect row: the old `checkEnvironmentDependencies`. It
 * needs a passing interpreter check. Reading the packages failed shows on
 * the row, with a check-again action, and no toast.
 */
export function checkEnvironmentDependencies(
    interpreterAvailable: boolean,
    probe: PackageProbe | undefined,
    compute: ChecklistCompute,
): ReadinessCheck {
    if (!interpreterAvailable || probe === undefined) {
        return {
            id: DEPENDENCIES,
            available: false,
            title: "Can't install databricks-connect without an active python environment",
        };
    }
    if (probe.kind === "installed") {
        return checkDatabricksConnectVersion(probe.version, compute);
    }
    if (probe.kind === "missing") {
        return {
            id: DEPENDENCIES,
            available: false,
            title: "Install databricks-connect",
            message: "databricks-connect package is not installed in the current environment.",
            action: "installDbConnect",
        };
    }
    return {
        id: DEPENDENCIES,
        available: false,
        title: "Failed to check dependencies",
        message: probe.message,
        action: "recheck",
    };
}

/** Whether `__builtins__.pyi` declares the Databricks globals (`autocomplete/Autocomplete`). */
export type BuiltinsProbe =
    | { readonly kind: "configured" }
    | { readonly kind: "needed" }
    | { readonly kind: "failed"; readonly message: string };

/**
 * The optional autocomplete row: the old `checkBuiltins`. It is checked only
 * once Databricks Connect passes, and never blocks readiness. A failed check
 * shows on the row with a check-again action; the old one also showed a
 * toast.
 */
export function checkBuiltins(
    dependenciesAvailable: boolean,
    probe: BuiltinsProbe | undefined,
): ReadinessCheck {
    if (!dependenciesAvailable || probe === undefined || probe.kind === "configured") {
        return { id: BUILTINS, available: true };
    }
    if (probe.kind === "needed") {
        return {
            id: BUILTINS,
            available: false,
            optional: true,
            title: "Setup Databricks builtins for autocompletion",
            message:
                "Optional: create a __builtins__.pyi file to enable autocompletion for Databricks builtins.",
            action: "configureAutocomplete",
        };
    }
    return {
        id: BUILTINS,
        available: false,
        optional: true,
        title: "Failed to check Databricks builtins definition",
        message: probe.message,
        action: "recheck",
    };
}

/** The minimum Databricks Connect, suggested when the runtime is unknown (the old `DATABRICKS_CONNECT_VERSION`). */
export const DATABRICKS_CONNECT_MINIMAL_VERSION = "13.3.2";

/**
 * The version to install: the old `getSuggestedVersion`. Serverless takes
 * `databricks.connect.serverlessDbconnectVersion` (`17.3` → `17.3.*`), a
 * cluster its runtime (`15.4.x` → `15.4.*`), anything else the minimum.
 */
export function suggestedDbConnectVersion(compute: ChecklistCompute): string {
    if (compute.kind === "serverless") {
        const parts = compute.dbConnectVersion.split(".");
        return `${parts[0]}.${parts[1] ?? "3"}.*`;
    }
    const parts = compute.kind === "cluster" ? compute.dbrVersion : [];
    if (parts.length < 2 || parts[0] === "x") {
        return DATABRICKS_CONNECT_MINIMAL_VERSION;
    }
    const minor = parts[1] === "x" ? "*" : String(parts[1]);
    return `${String(parts[0])}.${minor}${minor === "*" ? "" : ".*"}`;
}

/**
 * The placeholder for "Reinstall Databricks Connect": the old command's,
 * from the cluster's runtime; undefined (the suggested version) otherwise.
 */
export function reinstallPlaceholder(compute: ChecklistCompute): string | undefined {
    if (
        compute.kind !== "cluster" ||
        compute.dbrVersion[0] === "x" ||
        compute.dbrVersion[0] === undefined
    ) {
        return undefined;
    }
    const minor = compute.dbrVersion[1] === "x" ? "*" : String(compute.dbrVersion[1]);
    return `${compute.dbrVersion[0]}.${minor}.*`;
}
