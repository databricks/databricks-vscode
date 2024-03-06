import TelemetryReporter from "@vscode/extension-telemetry";
import {DatabricksWorkspace} from "../configuration/DatabricksWorkspace";
import {isDevExtension} from "../utils/developmentUtils";
import {
    DEV_APP_INSIGHTS_CONFIGURATION_STRING,
    EventProperties,
    EventTypes,
    ExtraMetadata,
    Metadata,
    MetadataTypes,
    PROD_APP_INSIGHTS_CONFIGURATION_STRING,
} from "./constants";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import {ConnectionManager} from "../configuration/ConnectionManager";

export {Events, EventTypes} from "./constants";
export type {EventReporter} from "./constants";

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

async function getDatabricksWorkspaceMetadata(
    databricksWorkspace: DatabricksWorkspace | undefined
): Promise<ExtraMetadata[Metadata.USER]> {
    if (databricksWorkspace === undefined) {
        return {};
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
    return {
        hashedUserName: hashedUserName,
        host: databricksWorkspace.host.host,
    };
}

function getAuthTypeMetadata(
    connctionManager: ConnectionManager
): ExtraMetadata[Metadata.USER] {
    const authType = connctionManager.apiClient?.config.authType;
    if (authType === undefined) {
        return {};
    }
    return {authType};
}

export async function toUserMetadata(
    connctionManager: ConnectionManager
): Promise<ExtraMetadata[Metadata.USER]> {
    const dbWorkspaceMetadata = await getDatabricksWorkspaceMetadata(
        connctionManager.databricksWorkspace
    );
    const authType = getAuthTypeMetadata(connctionManager);
    return {...dbWorkspaceMetadata, ...authType};
}

export function getContextMetadata(): ExtraMetadata[Metadata.CONTEXT] {
    return {
        environmentType: process.env["TEST_DEFAULT_CLUSTER_ID"]
            ? "tests"
            : "prod",
    };
}

function getTelemetryKey(): string {
    if (isDevExtension()) {
        return DEV_APP_INSIGHTS_CONFIGURATION_STRING;
    }
    return PROD_APP_INSIGHTS_CONFIGURATION_STRING;
}

function getTelemetryReporter(): TelemetryReporter | undefined {
    // If we cannot initialize the telemetry reporter, don't break the entire extension.
    try {
        return new TelemetryReporter(getTelemetryKey());
    } catch (e) {
        return undefined;
    }
}

export class Telemetry {
    private reporter?: TelemetryReporter;
    private extraMetadata: Partial<ExtraMetadata>;

    constructor(reporter?: TelemetryReporter) {
        this.reporter = reporter;
        this.extraMetadata = {};
    }

    static createDefault(): Telemetry {
        const reporter = getTelemetryReporter();
        return new Telemetry(reporter);
    }

    /**
     * Add additional metadata as defined in MetadataTypes to all events tracked via this Telemetry instance.
     * @param prefix The type of metadata. The string value of this is prefixed to all property keys when logged.
     * @param properties The properties to log for this metadata.
     */
    setMetadata<E extends keyof MetadataTypes>(
        prefix: E,
        properties: ExtraMetadata[E]
    ) {
        this.extraMetadata[prefix] = properties;
    }

    /**
     * Record an event with associated properties and metrics.
     *
     * The properties (i.e. attributes with a non-numeric value) and metrics (i.e. attributes with a numeric value)
     * are combined into a single object. This is separated by the telemetry library into separate objects for
     * consumption by the TelemetryReporter.
     */
    recordEvent<E extends keyof EventTypes>(
        eventName: E,
        propsAndMetrics?: EventProperties[E]
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
        Object.entries(this.extraMetadata).forEach(([prefix, props]) =>
            addKeys(props, prefix)
        );

        this.reporter.sendTelemetryEvent(
            eventName as string,
            finalProperties,
            finalMetrics
        );
    }

    start<E extends keyof EventTypes>(eventName: E) {
        const start = performance.now();
        return (props: Omit<EventProperties[E], "duration">) => {
            const duration = performance.now() - start;
            this.recordEvent(eventName, {duration, ...(props as any)});
        };
    }
}
