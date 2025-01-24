export type RunState =
    | "running"
    | "completed"
    | "unknown"
    | "error"
    | "timeout"
    | "cancelling"
    | "cancelled";
