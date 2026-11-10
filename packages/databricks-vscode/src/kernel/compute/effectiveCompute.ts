import type { Overrides } from "../project/TargetFiles";
import { isSupportedVersion } from "./serverlessVersion";

/** Where code runs (COMP-03), and why. */
export type Compute =
    | {
          readonly kind: "cluster";
          readonly clusterId: string;
          /** `override`: the user attached it; `bundle`: validate's `compute_id` or `cluster_id`. */
          readonly source: "override" | "bundle";
      }
    | {
          readonly kind: "serverless";
          /** The environment version (COMP-02), when one was chosen and is supported. */
          readonly version?: string;
          /**
           * `override`: the user chose it; `profile`: `serverless_compute_id = auto`;
           * `default`: nothing is chosen in a connected workspace, so serverless is the default.
           */
          readonly source: "override" | "profile" | "default";
      };

/** What `ComputeService.select` writes. `none` detaches the cluster. */
export type ComputeChoice =
    | { readonly kind: "cluster"; readonly clusterId: string }
    | { readonly kind: "serverless"; readonly version?: string }
    | { readonly kind: "none" };

export interface ComputeInputs {
    /** The active target's `vscode.overrides.json`. */
    readonly overrides?: Overrides;
    /** Validate's `bundle.compute_id ?? bundle.cluster_id`, for the active target. */
    readonly bundleClusterId?: string;
    /** The connection profile's `serverless_compute_id`. */
    readonly serverlessComputeId?: string;
    /**
     * Serverless is the default when nothing is chosen: a connected workspace in a local window.
     * Not set in a session window, whose compute is the tunnel's.
     */
    readonly defaultServerless?: boolean;
}

/**
 * The effective compute, in this order: the explicit choice in the
 * overrides, then the bundle's cluster, then `serverless_compute_id = auto`
 * in the profile, then serverless by default. An explicit `serverless: false`
 * (a cluster was attached or detached) turns the profile's default and the
 * serverless default off, as the old `ConnectionManager` did.
 * A pure function: `ComputeService.effective` re-derives it when an input
 * changes, so nothing mirrors it.
 */
export function effectiveCompute(inputs: ComputeInputs): Compute | undefined {
    const overrides = inputs.overrides ?? {};
    if (overrides.serverless === true) {
        return serverless(overrides, "override");
    }
    if (typeof overrides.clusterId === "string" && overrides.clusterId !== "") {
        return { kind: "cluster", clusterId: overrides.clusterId, source: "override" };
    }
    if (inputs.bundleClusterId !== undefined && inputs.bundleClusterId !== "") {
        return { kind: "cluster", clusterId: inputs.bundleClusterId, source: "bundle" };
    }
    if (overrides.serverless === undefined && inputs.serverlessComputeId === "auto") {
        return serverless(overrides, "profile");
    }
    if (overrides.serverless === undefined && inputs.defaultServerless === true) {
        return serverless(overrides, "default");
    }
    return undefined;
}

function serverless(overrides: Overrides, source: "override" | "profile" | "default"): Compute {
    // The file is hand-editable and may predate the supported range.
    const version =
        typeof overrides.serverlessVersion === "string" &&
        isSupportedVersion(overrides.serverlessVersion)
            ? overrides.serverlessVersion
            : undefined;
    return { kind: "serverless", source, ...(version !== undefined ? { version } : {}) };
}

/**
 * The overrides that `select` writes for `choice`, given what is effective
 * now. As before: attaching a cluster turns serverless off only if it was
 * on; choosing serverless detaches the cluster and unchecks "Override Jobs
 * cluster in bundle", and keeps a stored version unless a new one is given;
 * detaching removes the cluster and records that no compute is wanted, so the
 * serverless default doesn't refill it. Serverless that is chosen or from the profile stays.
 */
export function overridesFor(
    choice: ComputeChoice,
    current: Compute | undefined,
    options: { readonly fillsOnDetach?: boolean } = {},
): Partial<Overrides> {
    switch (choice.kind) {
        case "cluster":
            return current?.kind === "serverless"
                ? { clusterId: choice.clusterId, serverless: false, serverlessVersion: undefined }
                : { clusterId: choice.clusterId };
        case "serverless":
            return {
                serverless: true,
                useClusterOverride: false,
                clusterId: undefined,
                ...(choice.version !== undefined ? { serverlessVersion: choice.version } : {}),
            };
        case "none":
            // Serverless that is chosen or set by the profile stays as it is. Where the default
            // would fill the target again, the detach is stored, so it holds on reload.
            return current?.kind === "serverless" && current.source !== "default"
                ? { clusterId: undefined }
                : options.fillsOnDetach === true
                  ? { clusterId: undefined, serverless: false }
                  : { clusterId: undefined };
    }
}

/**
 * The cluster that bundle CLI calls get as `DATABRICKS_CLUSTER_ID`
 * (COMP-06): the attached one, while "Override Jobs cluster in bundle" is
 * checked. Only a cluster from the overrides counts. Validate's
 * `cluster_id` already reflects the variable, so deriving it from validate
 * would keep a detached cluster forever.
 */
export function bundleClusterOverride(overrides: Overrides | undefined): string | undefined {
    if (overrides?.useClusterOverride !== true || overrides.serverless === true) {
        return undefined;
    }
    return typeof overrides.clusterId === "string" && overrides.clusterId !== ""
        ? overrides.clusterId
        : undefined;
}
