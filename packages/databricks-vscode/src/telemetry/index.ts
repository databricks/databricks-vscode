import TelemetryReporter from "@vscode/extension-telemetry";
import {DatabricksWorkspace} from "../configuration/DatabricksWorkspace";
import {isDevExtension} from "../utils/developmentUtils";
import {
    DEV_APP_INSIGHTS_CONFIGURATION_STRING,
    EventType,
    EventTypes,
    PROD_APP_INSIGHTS_CONFIGURATION_STRING,
} from "./constants";
import crypto from "crypto";
import bcrypt from "bcryptjs";

export {Events, EventTypes} from "./constants";

let telemetryReporter: TelemetryReporter | undefined;

/**
 * A version number used for the telemetry metric schema. The version of the schema is always provided
 * as a field in the properties parameter when recording metrics. As the schema changes, please add
 * documentation here about the change to the schema. Bump the minor version when making forwards-
 * compatible changes, like adding a new field. Bump the major version when making forwards-incompatible
 * changes, like modifying the type of an existing field or removing a field.
 *
 * Version 1.0 schema:
 * properties: {
 *     "version": 1,
 *     "user.hashedUserName": bcrypt hash of the user's username,
 *     "user.host": the workspace hostname,
 *     "user.authType": the auth type used by the user to authenticate,
 *     "event.*": properties for the event,
 * }
 * metrics: {
 *     "event.*": metrics for the event
 * }
 */
const telemetryVersion = "1.0";

let userMetadata: Record<string, string> | undefined;

export async function updateUserMetadata(
    databricksWorkspace: DatabricksWorkspace | undefined
) {
    if (databricksWorkspace === undefined) {
        userMetadata = undefined;
        return;
    }
    const userName = databricksWorkspace.userName;
    // Salt is the first 22 characters of the hash of the username, meant to guard against
    // rainbow table attacks. 2^7 iterations takes ~13ms.
    const salt = crypto
        .createHash("sha256")
        .update(userName)
        .digest("hex")
        .substring(0, 22);
    const bcryptSalt = `$2b$07$${salt}`;
    const hashedUserName = await bcrypt.hash(userName, bcryptSalt);
    userMetadata = {
        hashedUserName: hashedUserName,
        host: databricksWorkspace.host.authority,
        authType: databricksWorkspace.authProvider.authType,
    };
}

function getTelemetryKey(): string {
    if (isDevExtension()) {
        return DEV_APP_INSIGHTS_CONFIGURATION_STRING;
    }
    return PROD_APP_INSIGHTS_CONFIGURATION_STRING;
}

function getTelemetryReporter(): TelemetryReporter | undefined {
    if (telemetryReporter) {
        return telemetryReporter;
    }

    // If we cannot initialize the telemetry reporter, don't break the entire extension.
    try {
        return new TelemetryReporter(getTelemetryKey());
    } catch (e) {
        return undefined;
    }
}

export class Telemetry {
    private reporter?: TelemetryReporter;

    constructor(reporter?: TelemetryReporter) {
        this.reporter = reporter;
    }

    static createDefault(): Telemetry {
        const reporter = getTelemetryReporter();
        return new Telemetry(reporter);
    }

    /**
     * Record an event with associated properties and metrics.
     *
     * The properties (i.e. attributes with a non-numeric value) and metrics (i.e. attributes with a numeric value)
     * are combined into a single object. This is separated by the telemetry library into separate objects for
     * consumption by the TelemetryReporter.
     */
    recordEvent<ES extends EventTypes, E extends keyof ES>(
        eventName: string,
        propsAndMetrics?: ES[E] extends EventType<infer R> ? R : never
    ) {
        // If telemetry reporter cannot be initialized, don't report the event.
        if (!this.reporter) {
            return;
        }

        // prefix properties & metrics with user/event
        const finalProperties: Record<string, string> = {
            version: telemetryVersion,
        };
        const finalMetrics: Record<string, number> = {};

        function addKeys(
            source: Record<string, unknown> | undefined,
            prefix: string
        ) {
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
                        finalProperties[newKey] = JSON.stringify(v);
                    } else {
                        finalProperties[newKey] = String(v);
                    }
                });
            }
        }
        addKeys(propsAndMetrics, "event");
        addKeys(userMetadata, "user");

        this.reporter.sendTelemetryEvent(
            eventName,
            finalProperties,
            finalMetrics
        );
    }
}
