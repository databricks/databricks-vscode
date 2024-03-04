import {AuthType} from "@databricks/databricks-sdk";
/** The production application insights configuration string for Databricks. */
export const PROD_APP_INSIGHTS_CONFIGURATION_STRING =
    "InstrumentationKey=ebe191c5-f06b-4189-b68c-34fb5fbdb3f0;IngestionEndpoint=https://eastus2-3.in.applicationinsights.azure.com/;LiveEndpoint=https://eastus2.livediagnostics.monitor.azure.com/";
/** The application insights configuration string used while developing on the VS Code extension */
export const DEV_APP_INSIGHTS_CONFIGURATION_STRING =
    "InstrumentationKey=257d1561-5005-4a76-a3a8-7955df129e86;IngestionEndpoint=https://eastus2-3.in.applicationinsights.azure.com/;LiveEndpoint=https://eastus2.livediagnostics.monitor.azure.com/";

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
    CONNECTION_STATE_CHANGED = "connectionStateChanged",
}
/* eslint-enable @typescript-eslint/naming-convention */

export type AutoLoginSource = "init" | "hostChange" | "targetChange";
export type ManualLoginSource = "authTypeSwitch" | "authTypeLogin" | "command";
export type BundleRunResourceType = "pipelines" | "jobs";

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
    [Events.EXTENSION_INITIALIZATION]: EventType<{
        success: boolean;
        type?: "dabs" | "legacy" | "unknown";
    }> = {
        comment: "Extension services were initialized",
    };
    [Events.AUTO_LOGIN]: EventType<{
        success: boolean;
        source: AutoLoginSource;
    }> = {
        comment: "Extension logged in automatically",
    };
    [Events.MANUAL_LOGIN]: EventType<{
        success: boolean;
        source: ManualLoginSource;
    }> = {
        comment: "User logged in manually",
    };
    [Events.AUTO_MIGRATION]: EventType<{
        success: boolean;
    }> = {
        comment: "Extension migrated automatically",
    };
    [Events.MANUAL_MIGRATION]: EventType<{
        success: boolean;
    }> = {
        comment: "User migrated manually",
    };
    [Events.BUNDLE_RUN]: EventType<{
        success: boolean;
        resourceType?: BundleRunResourceType;
    }> = {
        comment: "Execute a bundle resource",
    };
    [Events.CONNECTION_STATE_CHANGED]: EventType<{
        newState: string;
    }> = {
        comment: "State of ConnectionManager has changed",
        newState: {
            comment: "The new state of the connection",
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
        authType: AuthType;
    }> = {
        hashedUserName: {
            comment: "A hash of the user name computed using bcrypt",
        },
        host: {
            comment:
                "The hostname of the workspace that the user is connected to",
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
