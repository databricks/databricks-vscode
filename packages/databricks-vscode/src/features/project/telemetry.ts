import {
    durationComment,
    telemetryEvent,
    type DurationMeasurement,
} from "../../kernel/telemetry/definitions";

/**
 * The old event. `legacy` (a `project.json` project) can't happen any more.
 * For a folder without a bundle it ends before the sub-project search,
 * which `BUNDLE_SUB_PROJECT_SEARCH` measures.
 */
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

export const BUNDLE_SUB_PROJECT_SEARCH = telemetryEvent<
    { success: boolean; count: number; followSymlinks: boolean } & DurationMeasurement
>(
    "bundleSubProjectSearch",
    "The first search for sub-projects, when the active workspace folder has no bundle",
    {
        success: { comment: "false if the search failed" },
        count: { comment: "Amount of sub-projects found" },
        followSymlinks: {
            comment:
                "VS Code's search.followSymlinks setting, with which the search follows linked folders",
        },
        duration: {
            comment:
                "From the start of the first project detection to the end of the search, in milliseconds. The old extension's extensionInitialization measured the same span for such a folder",
        },
    },
);

export const PROJECT_EVENTS = [
    EXTENSION_INITIALIZATION,
    BUNDLE_SUB_PROJECTS,
    BUNDLE_SUB_PROJECT_SEARCH,
];
