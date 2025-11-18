import {AuthType} from "@databricks/sdk-experimental";
/** The production application insights instrumentation key for Databricks. */
export const PROD_APP_INSIGHTS_CONFIGURATION_KEY =
    "ebe191c5-f06b-4189-b68c-34fb5fbdb3f0";
/** The application insights instrumentation key used while developing on the VS Code extension */
export const DEV_APP_INSIGHTS_CONFIGURATION_KEY =
    "257d1561-5005-4a76-a3a8-7955df129e86";

/** The list of all events which can be monitored. */
/* eslint-disable @typescript-eslint/naming-convention */
export enum Events {
    COMMAND_EXECUTION = "commandExecution",
    EXTENSION_ACTIVATION = "extensionActivation",
    EXTENSION_INITIALIZATION = "extensionInitialization",
    AUTO_LOGIN = "autoLogin",
    MANUAL_LOGIN = "manualLogin",
    AUTO_MIGRATION = "autoMigration",
    MANUAL_MIGRATION = "manualMigration",
    BUNDLE_RUN = "bundleRun",
    BUNDLE_INIT = "bundleInit",
    BUNDLE_SUB_PROJECTS = "bundleSubProjects",
    CONNECTION_STATE_CHANGED = "connectionStateChanged",
    COMPUTE_SELECTED = "computeSelected",
    WORKFLOW_RUN = "workflowRun",
    DBCONNECT_RUN = "dbconnectRun",
    OPEN_RESOURCE_EXTERNALLY = "openResourceExternally",
}
/* eslint-enable @typescript-eslint/naming-convention */

export type AutoLoginSource = "init" | "hostChange" | "targetChange";
export type ManualLoginSource =
    | "authTypeSwitch"
    | "authTypeLogin"
    | "command"
    | "api";
export type BundleRunResourceType = "pipelines" | "jobs";
export type BundleRunType =
    | "run"
    | "validate"
    | "partial-refresh"
    | "manual-input";
export type WorkflowTaskType = "python" | "notebook" | "unknown";
export type LaunchType = "run" | "debug";
export type ComputeType = "cluster" | "serverless";

/** Documentation about all of the properties and metrics of the event. */
type EventDescription<T> = {[K in keyof T]?: {comment?: string}};

/**
 * The type of an event definition.
 *
 * The type parameter describes the set of properties and metrics which are expected when recording this
 * event. Values inhabiting this type are documentation about the event and its parameters: comments
 * explaining the event being collected and the interpretation of each parameter.
 */
export type EventType<P> = {comment?: string} & (P extends Record<
    string,
    unknown
>
    ? EventDescription<P>
    : unknown);

/** A metric which measures the duration of an event. */
type DurationMeasurement = {
    duration: number;
};

/** Returns a common description which applies to all durations measured with the metric system. */
function getDurationProperty(): EventDescription<DurationMeasurement> {
    return {
        duration: {
            comment: "The duration of the event, in milliseconds",
        },
    };
}

/**
 * All events recordable by this module must reside in this class.
 *
 * If an event has no additional metadata, set the type parameter of EventType<> to `undefined`.
 */
export class EventTypes {
    [Events.COMMAND_EXECUTION]: EventType<
        {
            command: string;
            success: boolean;
        } & DurationMeasurement
    > = {
        comment: "Execution of a command",
        command: {
            comment: "The command that was executed",
        },
        success: {
            comment: "true if the command succeeded, false otherwise",
        },
        ...getDurationProperty(),
    };
    [Events.EXTENSION_ACTIVATION]: EventType<undefined> = {
        comment: "Extension was activated",
    };
    [Events.EXTENSION_INITIALIZATION]: EventType<
        {
            success: boolean;
            type?: "dabs" | "legacy" | "unknown";
        } & DurationMeasurement
    > = {
        comment: "Extension services were initialized",
    };
    [Events.AUTO_LOGIN]: EventType<
        {
            success: boolean;
            source: AutoLoginSource;
        } & DurationMeasurement
    > = {
        comment: "Extension logged in automatically",
    };
    [Events.MANUAL_LOGIN]: EventType<
        {
            success: boolean;
            source: ManualLoginSource;
        } & DurationMeasurement
    > = {
        comment: "User logged in manually",
    };
    [Events.AUTO_MIGRATION]: EventType<
        {
            success: boolean;
        } & DurationMeasurement
    > = {
        comment: "Extension migrated automatically",
    };
    [Events.MANUAL_MIGRATION]: EventType<
        {
            success: boolean;
        } & DurationMeasurement
    > = {
        comment: "User migrated manually",
    };
    [Events.BUNDLE_RUN]: EventType<
        {
            success: boolean;
            cancelled?: boolean;
            resourceType?: BundleRunResourceType;
            runType?: BundleRunType;
        } & DurationMeasurement
    > = {
        comment: "Execute a bundle resource",
    };
    [Events.BUNDLE_INIT]: EventType<
        {
            success: boolean;
        } & DurationMeasurement
    > = {
        comment: "Initialize a new bundle project",
    };
    [Events.BUNDLE_SUB_PROJECTS]: EventType<{
        count: number;
    }> = {
        comment: "Sub-projects in the active workspace folder",
        count: {
            comment: "Amount of sub-projects in the active workspace folder",
        },
    };
    [Events.CONNECTION_STATE_CHANGED]: EventType<{
        newState: string;
    }> = {
        comment: "State of ConnectionManager has changed",
        newState: {
            comment: "The new state of the connection",
        },
    };
    [Events.COMPUTE_SELECTED]: EventType<{
        type: ComputeType;
    }> = {
        comment: "A compute was selected",
        type: {
            comment: "The type of the compute",
        },
    };
    [Events.WORKFLOW_RUN]: EventType<
        {
            success: boolean;
            taskType: WorkflowTaskType;
            computeType: ComputeType;
        } & DurationMeasurement
    > = {
        comment: "A workflow task was run",
        taskType: {
            comment: "The type of the workflow task",
        },
        computeType: {
            comment: "The type of the compute",
        },
    };
    [Events.DBCONNECT_RUN]: EventType<{
        launchType: LaunchType;
        computeType: ComputeType;
    }> = {
        comment: "A Databricks Connect debug run",
        computeType: {
            comment: "The type of the compute",
        },
    };
    [Events.OPEN_RESOURCE_EXTERNALLY]: EventType<{
        type: string;
    }> = {
        comment: "An external resource URL was opened",
        type: {
            comment: "The resource type",
        },
    };
}

/**
 * A convenience type to extract the type of the propsAndMetrics parameter from the type of the
 * field of EventTypes
 */
export type EventProperties = {
    [P in keyof EventTypes]: EventTypes[P] extends EventType<infer R>
        ? R extends Record<string, unknown>
            ? R
            : never
        : never;
};

export type EventReporter<E extends keyof EventTypes> = (
    props: Omit<EventProperties[E], "duration">
) => void;

export type EnvironmentType = "tests" | "prod";

/**
 * Additional metadata collected from the extension, independent of the event itself.
 */
/* eslint-disable @typescript-eslint/naming-convention */
export enum Metadata {
    USER = "user",
    CONTEXT = "context",
}
/* eslint-enable @typescript-eslint/naming-convention */

/**
 * The definitions of all additional metadata collected by the telemetry.
 *
 * The fields of this class should be defined in the Metadata enum.
 */
export class MetadataTypes {
    [Metadata.USER]: EventType<{
        hashedUserName: string;
        host: string;
        workspaceId: string;
        authType: AuthType;
    }> = {
        hashedUserName: {
            comment: "A hash of the user name computed using bcrypt",
        },
        host: {
            comment:
                "The hostname of the workspace that the user is connected to",
        },
        workspaceId: {
            comment: "The id of the workspace",
        },
        authType: {
            comment: "The kind of authentication used by the user",
        },
    };
    [Metadata.CONTEXT]: EventType<{environmentType: EnvironmentType}> = {
        environmentType: {
            comment:
                "A type of the environment this extension is running with (test, staging, prod)",
        },
    };
}

/** The type of all extra metadata collected by the extension. */
export type ExtraMetadata = {
    [P in keyof MetadataTypes]: MetadataTypes[P] extends EventType<infer R>
        ? Partial<R>
        : never;
};
