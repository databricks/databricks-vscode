//
// Enums.
//

export type DataPlaneClusterEventType =
    | "NODE_BLACKLISTED"
    | "NODE_EXCLUDED_DECOMMISSIONED";

//
// Subtypes used in request/response types.
//

export interface DataPlaneEventDetails {
    event_type?: DataPlaneClusterEventType;
    timestamp?: number;
    host_id?: string;
    executor_failures?: number;
}
