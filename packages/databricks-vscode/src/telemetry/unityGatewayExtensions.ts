import {ConfigError, logging} from "@databricks/sdk-experimental";
import {Events, Telemetry} from ".";
import type {UnityGatewayConnection, UnityGatewayFailure} from "./constants";
import {Loggers} from "../logger";

export type UnityGatewayListingReport =
    | {outcome: "ok"; modelsCount: number}
    | {outcome: "failed"; error: unknown}
    | {outcome: "cancelled"};

export type UnityGatewayListingReporter = (
    report: UnityGatewayListingReport
) => void;

declare module "." {
    interface Telemetry {
        startUnityGatewayModelListing(
            connection: UnityGatewayConnection
        ): UnityGatewayListingReporter;
    }
}

const UPPER_SNAKE_CASE = /^[A-Z][A-Z0-9_]{0,63}$/;
const PASCAL_CASE = /^[A-Z][A-Za-z0-9]{0,63}$/;
const UNRECOGNISED = "other";

Telemetry.prototype.startUnityGatewayModelListing = function (
    connection: UnityGatewayConnection
): UnityGatewayListingReporter {
    const report = this.start(Events.UNITY_GATEWAY_MODEL_LISTING);
    return (listing) => {
        // So telemetry can't change what the provider returns or caches.
        try {
            report({
                outcome: listing.outcome,
                ...(listing.outcome === "ok"
                    ? {modelsCount: listing.modelsCount}
                    : {}),
                ...(listing.outcome === "failed"
                    ? failureFields(listing.error)
                    : {}),
                ...connectionFields(connection),
            });
        } catch (e) {
            logging.NamedLogger.getOrCreate(Loggers.Extension).error(
                "Can't record a Unity Gateway model listing",
                e
            );
        }
    };
};

function failureFields(e: unknown): UnityGatewayFailure {
    if (typeof e !== "object" || e === null) {
        return {};
    }
    const {httpStatusCode, code, name} = e as Record<string, unknown>;
    return {
        // Not `instanceof ApiError`, which would load the V2 SDK at
        // activation. ApiError reports -1 when it isn't an HTTP error.
        ...(typeof httpStatusCode === "number" && httpStatusCode > 0
            ? {httpStatus: httpStatusCode}
            : {}),
        ...(typeof code === "string"
            ? {errorCode: categorical(code, UPPER_SNAKE_CASE)}
            : {}),
        // ConfigError's name is "Error".
        ...(e instanceof ConfigError
            ? {errorName: "ConfigError"}
            : typeof name === "string"
              ? {errorName: categorical(name, PASCAL_CASE)}
              : {}),
    };
}

function connectionFields(
    connection: UnityGatewayConnection
): UnityGatewayConnection {
    return {
        ...(connection.workspaceId !== undefined
            ? {workspaceId: connection.workspaceId}
            : {}),
        ...(connection.authType !== undefined
            ? {authType: connection.authType}
            : {}),
    };
}

/** Codes and names could hold a message or an email. */
function categorical(value: string, shape: RegExp): string {
    return shape.test(value) ? value : UNRECOGNISED;
}
