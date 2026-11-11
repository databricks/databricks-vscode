import { telemetryEvent } from "../../kernel/telemetry/definitions";

export const OPEN_RESOURCE_EXTERNALLY = telemetryEvent<{ type: string }>(
    "openResourceExternally",
    "An external resource URL was opened",
    { type: { comment: "The resource type" } },
);

export const TREE_COMMAND_EVENTS = [OPEN_RESOURCE_EXTERNALLY];
