import { telemetryEvent } from "../../kernel/telemetry/definitions";

/** The old `ComputeType`. */
export type ComputeType = "cluster" | "serverless";

/** The old event: it fires when the effective compute becomes another cluster, or serverless. */
export const COMPUTE_SELECTED = telemetryEvent<{ type: ComputeType }>(
    "computeSelected",
    "A compute was selected",
    {
        type: { comment: "The type of the compute" },
    },
);

export const COMPUTE_EVENTS = [COMPUTE_SELECTED];
