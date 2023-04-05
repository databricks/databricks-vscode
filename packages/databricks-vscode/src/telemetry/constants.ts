/** The production application insights configuration string for Databricks. */
export const PROD_APP_INSIGHTS_CONFIGURATION_STRING =
    "InstrumentationKey=dc4ec136-d862-4379-8d5f-b1746222d7f5;IngestionEndpoint=https://eastus-8.in.applicationinsights.azure.com/;LiveEndpoint=https://eastus.livediagnostics.monitor.azure.com/";
/** The application insights configuration string used while developing on the VS Code extension */
export const DEV_APP_INSIGHTS_CONFIGURATION_STRING =
    "InstrumentationKey=1404ec6e-9499-48ce-8c67-9bb8b3440218;IngestionEndpoint=https://eastus2-3.in.applicationinsights.azure.com/;LiveEndpoint=https://eastus2.livediagnostics.monitor.azure.com/";

/** The list of all events which can be monitored. */
/* eslint-disable @typescript-eslint/naming-convention */
export enum Events {
    COMMAND_EXECUTION = "commandExecution",
}
/* eslint-enable @typescript-eslint/naming-convention */

/** Documentation about all of the properties and metrics of the event. */
type EventDescription<T> = {[K in keyof T]?: {comment?: string}};

/**
 * The type of an event definition.
 *
 * The type parameter describes the set of properties and metrics which are expected when recording this
 * event. Values inhabiting this type are documentation about the event and its parameters: comments
 * explaining the event being collected and the interpretation of each parameter.
 */
export type EventType<P extends Record<string, unknown>> = {
    comment?: string;
} & EventDescription<P>;

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

/** All events recordable by this module must reside in this class.  */
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
}
