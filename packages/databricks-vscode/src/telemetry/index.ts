import TelemetryReporter, { TelemetryEventMeasurements, TelemetryEventProperties } from "@vscode/extension-telemetry";
import { DatabricksWorkspace } from "../configuration/DatabricksWorkspace";
import { isDevExtension } from "../utils/developmentUtils";
import { DEV_APP_INSIGHTS_CONFIGURATION_STRING, PROD_APP_INSIGHTS_CONFIGURATION_STRING, EventType } from "./constants";
import crypto from "crypto";
import { AuthType } from "../configuration/auth/AuthProvider";
import { Cloud } from "../utils/constants";
import { ExposedLoggers, NamedLogger, withLogContext } from "@databricks/databricks-sdk/dist/logging";
import { Loggers } from "../logger";

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

/** Record an event with associated properties and metrics. */
export function recordEvent<E extends EventType>({ eventName, properties, metrics }: E) {
    const r = getTelemetryReporter();
    // prefix properties & metrics with user/event
    const finalProperties: Record<string, string> = {}
    const finalMetrics: Record<string, number> = {}

    function addKeys<V>(source: Record<string, V> | undefined, target: Record<string, V>, prefix: string) {
        if (source !== undefined) {
            Object.keys(source).forEach((k) => target[prefix + "." + k] = source[k])
        }
    }
    addKeys(properties, finalProperties, "event");
    addKeys(userMetadata, finalProperties, "user");
    addKeys(metrics, finalMetrics, "event");

    r.sendTelemetryEvent(eventName, finalProperties, finalMetrics);
}
