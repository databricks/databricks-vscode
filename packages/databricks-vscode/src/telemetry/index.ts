import TelemetryReporter, { TelemetryEventMeasurements, TelemetryEventProperties } from "@vscode/extension-telemetry";
import { DatabricksWorkspace } from "../configuration/DatabricksWorkspace";
import { isDevExtension } from "../utils/developmentUtils";
import { DEV_APP_INSIGHTS_CONFIGURATION_STRING, PROD_APP_INSIGHTS_CONFIGURATION_STRING } from "./constants";
import crypto from "crypto";
import { Command } from "@databricks/databricks-sdk";

let telemetryReporter: TelemetryReporter | undefined;

let userMetadata: Record<string, string> | undefined;

export { Events } from "./constants";

export function updateUserMetadata(databricksWorkspace: DatabricksWorkspace | undefined) {
    if (databricksWorkspace === undefined) {
        userMetadata = undefined;
        return;
    }
    const hash = crypto.createHash('sha256');
    hash.update(databricksWorkspace.userName);
    userMetadata = {
        hashedUserId: hash.digest('hex'),
        workspaceId: "123", // TODO: get the workspace Id
        cloud: "aws", // TODO: get the cloud
        authType: databricksWorkspace.authProvider.authType,
    };
}

function getTelemetryKey(): string {
    if (isDevExtension()) {
        return DEV_APP_INSIGHTS_CONFIGURATION_STRING;
    }
    return PROD_APP_INSIGHTS_CONFIGURATION_STRING;
}

function getTelemetryReporter(): TelemetryReporter {
    if (telemetryReporter) {
        return telemetryReporter;
    }

    telemetryReporter = new TelemetryReporter(getTelemetryKey());
    return telemetryReporter;
}

export function setTelemetryReporter(r: TelemetryReporter) {
    if (!isDevExtension()) {
        throw new Error('TelemetryRecorder cannot be manually set in production');
    }
    telemetryReporter = r;
}


/** The list of all events which can be monitored. */
enum Events {
    COMMAND_EXECUTION = "commandExecution",
}

/** Documentation about all of the properties and metrics of the event. */
type EventDescription<T> = { [K in keyof T]?: { comment?: string } }

/**
 * The type of an event definition.
 * 
 * The type parameter describes the set of properties and metrics which are expected when recording this
 * event. Values inhabiting this type are documentation about the event and its parameters: comments
 * explaining the event being collected and the interpretation of each parameter.
 */
type EventType<P extends Record<string, unknown>> = {
    comment?: string
} & EventDescription<P>;

/** A metric which measures the duration of an event. */
type DurationMeasurement = {
    duration: number
}

/** Returns a common description which applies to all durations measured with the metric system. */
function getDurationProperty(): EventDescription<DurationMeasurement> {
    return {
        duration: {
            comment: "The duration of the event, in milliseconds",
        }
    }
}

/**
 * All events recordable by this module must reside in this class.
 */
class EventTypes {
    [Events.COMMAND_EXECUTION]: EventType<{
        command: string,
        success: boolean,
    } & DurationMeasurement> = {
        comment: "Execution of a command",
        command: {
            comment: "The command that was executed",
        },
        success: {
            comment: "true if the command succeeded, false otherwise",
        },
        ...getDurationProperty()
    }
}

/** All fields of T whose type is T1 */
type PickType<T, T1> = { [K in keyof T as T[K] extends T1 ? K : never]: T[K] };

/** All fields of T whose type is not T1 */
type ExcludeType<T, T1> = { [K in keyof T as T[K] extends T1 ? never : K] : T[K] };

/**
 * Record an event with associated properties and metrics.
 * 
 * The properties (i.e. attributes with a non-numeric value) and metrics (i.e. attributes with a numeric value)
 * are separated. This matches the interface exposed by Application Insights.
 */
export function recordEvent<ES extends EventTypes, E extends keyof ES>(
    eventName: string,
    properties?: ES[E] extends EventType<infer R> ? ExcludeType<R, number> : never,
    metrics?: ES[E] extends EventType<infer R> ? PickType<R, number> : never,
) {
    const r = getTelemetryReporter();

    // prefix properties & metrics with user/event
    const finalProperties: Record<string, string> = {}
    const finalMetrics: Record<string, number> = {}

    function addKeys(source: Record<string, unknown> | undefined, target: Record<string, unknown>, prefix: string) {
        if (source !== undefined) {
            Object.keys(source).forEach((k) => target[prefix + "." + k] = source[k])
        }
    }

    // Why does this typecheck? finalProperties: Record<string, string> is mutable and treated as a subtype of
    // Record<string, unknown>. This means I could put an unknown value in finalProperties, even if it were not a string...
    addKeys(properties, finalProperties, "event");
    addKeys(userMetadata, finalProperties, "user");
    addKeys(metrics, finalMetrics, "event");

    r.sendTelemetryEvent(eventName, finalProperties, finalMetrics);
}

/**
 * Record an event with associated properties and metrics.
 * 
 * The properties (i.e. attributes with a non-numeric value) and metrics (i.e. attributes with a numeric value)
 * are combined into a single object. This is separated by the telemetry library into separate objects for
 * consumption by the TelemetryReporter.
 */
export function recordEvent2<ES extends EventTypes, E extends keyof ES>(
    eventName: string,
    propsAndMetrics?: ES[E] extends EventType<infer R> ? R : never,
) {
    const r = getTelemetryReporter();

    // prefix properties & metrics with user/event
    const finalProperties: Record<string, string> = {}
    const finalMetrics: Record<string, number> = {}

    function addKeys(source: Record<string, unknown> | undefined, prefix: string) {
        if (source !== undefined) {
            Object.keys(source).forEach((k) => {
                const newKey = prefix + "." + k;
                const v = source[k];
                // Numeric observations are added to metrics. All other observations are added to properties.
                if (typeof v === "number") {
                    finalMetrics[newKey] = v;
                } else if (typeof v === "string") {
                    finalProperties[newKey] = v;
                } else if (typeof v === "object") {
                    finalProperties[newKey] = JSON.stringify(v)
                } else {
                    finalProperties[newKey] = String(v);
                }
            })
        }
    }
    addKeys(propsAndMetrics, "event");
    addKeys(userMetadata, "user");

    r.sendTelemetryEvent(eventName, finalProperties, finalMetrics);
}
