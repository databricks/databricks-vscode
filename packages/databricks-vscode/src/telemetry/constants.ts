// The production application insights configuration string for Databricks
export const PROD_APP_INSIGHTS_CONFIGURATION_STRING = "InstrumentationKey=dc4ec136-d862-4379-8d5f-b1746222d7f5;IngestionEndpoint=https://eastus-8.in.applicationinsights.azure.com/;LiveEndpoint=https://eastus.livediagnostics.monitor.azure.com/"
// The application insights configuration string used while developing on the VS Code extension
export const DEV_APP_INSIGHTS_CONFIGURATION_STRING = "InstrumentationKey=dc4ec136-d862-4379-8d5f-b1746222d7f5;IngestionEndpoint=https://eastus-8.in.applicationinsights.azure.com/;LiveEndpoint=https://eastus.livediagnostics.monitor.azure.com/"

/** The list of all events which can be monitored. */
export enum Events {
    /** Execution of a command. */
    COMMAND_EXECUTION = "commandExecution",
}

type DurationMeasurement = {
    /** The duration of the measurement in milliseconds. */
    duration: number
}

// Every event must define a name, a set of properties, and a set of metrics.
// Property keys must be strings, and property values will be converted to string.
// Metric keys must be strings, and metric values must be numbers.
// New event definitions can be added to this union type.
export type EventType = {
    eventName: Events.COMMAND_EXECUTION,
    properties: {
        command: string,
        success: boolean,
    },
    metrics: DurationMeasurement,
}
