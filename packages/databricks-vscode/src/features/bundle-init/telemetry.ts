import {
    durationComment,
    telemetryEvent,
    type DurationMeasurement,
} from "../../kernel/telemetry/definitions";

/** The old event. */
export const BUNDLE_INIT = telemetryEvent<
    { success: boolean; hasAiTools: boolean } & DurationMeasurement
>("bundleInit", "Initialize a new bundle project", {
    success: { comment: "true if the wizard created a project that the extension then found" },
    hasAiTools: {
        comment:
            "Whether Databricks AI tools are already installed when the project is initialized",
    },
    ...durationComment,
});

export const BUNDLE_INIT_EVENTS = [BUNDLE_INIT];
