import {
    durationComment,
    telemetryEvent,
    type DurationMeasurement,
} from "../../kernel/telemetry/definitions";

/** The old `WorkflowTaskType`. */
export type WorkflowTaskType = "python" | "notebook" | "unknown";

/** The old `ComputeType`. */
export type ComputeType = "cluster" | "serverless";

/** The old event, recorded when a workflow run ends or fails after its checks. */
export const WORKFLOW_RUN = telemetryEvent<
    { success: boolean; taskType: WorkflowTaskType; computeType: ComputeType } & DurationMeasurement
>("workflowRun", "A workflow task was run", {
    success: { comment: "true if the run was submitted and its output shown" },
    taskType: { comment: "The type of the workflow task" },
    computeType: { comment: "The type of the compute" },
    ...durationComment,
});

export const RUN_EVENTS = [WORKFLOW_RUN];
