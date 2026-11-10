import {
    durationComment,
    telemetryEvent,
    type DurationMeasurement,
} from "../../kernel/telemetry/definitions";

/** The old event. `legacy` (a `project.json` project) can't happen any more. */
export const EXTENSION_INITIALIZATION = telemetryEvent<
    { success: boolean; type?: "dabs" | "legacy" | "unknown" } & DurationMeasurement
>("extensionInitialization", "Extension services were initialized", {
    success: { comment: "true if the project detection finished" },
    type: { comment: "dabs when a bundle project was detected, unknown otherwise" },
    ...durationComment,
});

export const BUNDLE_SUB_PROJECTS = telemetryEvent<{ count: number }>(
    "bundleSubProjects",
    "Sub-projects in the active workspace folder",
    { count: { comment: "Amount of sub-projects in the active workspace folder" } },
);

export const PROJECT_EVENTS = [EXTENSION_INITIALIZATION, BUNDLE_SUB_PROJECTS];
