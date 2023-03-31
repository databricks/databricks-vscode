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

// eventName should be a string singleton for every case of the union.
export type EventType = {
    eventName: Events.COMMAND_EXECUTION,
    properties: {
        commandName: string,
    },
    metrics: DurationMeasurement,
}