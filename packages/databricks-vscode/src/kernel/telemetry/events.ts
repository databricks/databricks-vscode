import { durationComment, telemetryEvent, type DurationMeasurement } from "./definitions";

/** Events the bootstrap and the command registry send, rather than a feature. */
export const COMMAND_EXECUTION = telemetryEvent<
    { command: string; success: boolean } & DurationMeasurement
>("commandExecution", "Execution of a command", {
    command: { comment: "The command that was executed" },
    success: { comment: "true if the command succeeded, false otherwise" },
    ...durationComment,
});

export const EXTENSION_ACTIVATION = telemetryEvent(
    "extensionActivation",
    "Extension was activated",
);

export const CORE_EVENTS = [COMMAND_EXECUTION, EXTENSION_ACTIVATION];
