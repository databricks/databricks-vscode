import {
    durationComment,
    telemetryEvent,
    type DurationMeasurement,
} from "../../kernel/telemetry/definitions";

export type BundleRunType = "run" | "validate" | "partial-refresh" | "manual-input";

/** The old `BundleRunResourceType`. */
export type BundleRunResourceType = "pipelines" | "jobs";

/** The old event, with the old properties. */
export const BUNDLE_RUN = telemetryEvent<
    {
        success: boolean;
        cancelled?: boolean;
        resourceType?: BundleRunResourceType;
        runType?: BundleRunType;
    } & DurationMeasurement
>("bundleRun", "Execute a bundle resource", {
    success: { comment: "false if the deploy or the CLI failed" },
    cancelled: { comment: "true if the user cancelled the deploy or the run" },
    resourceType: { comment: "jobs or pipelines" },
    runType: { comment: "run, validate, partial-refresh or manual-input" },
    ...durationComment,
});

export const BUNDLE_EXPLORER_EVENTS = [BUNDLE_RUN];
