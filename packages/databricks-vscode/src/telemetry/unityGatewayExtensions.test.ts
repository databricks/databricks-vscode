/* eslint-disable @typescript-eslint/naming-convention */

import assert from "assert";
import {TelemetryReporter} from "@vscode/extension-telemetry";
import {Config, ConfigError, logging} from "@databricks/sdk-experimental";
import {ApiError} from "@databricks/sdk-core/apierror";
import {anything, capture, instance, mock, verify, when} from "ts-mockito";
import {Telemetry} from ".";
import type {UnityGatewayConnection} from "./constants";
import "./unityGatewayExtensions";

describe(__filename, () => {
    let reporter: TelemetryReporter;
    let telemetry: Telemetry;

    beforeEach(() => {
        reporter = mock(TelemetryReporter);
        telemetry = new Telemetry(instance(reporter));
    });

    function startListing(
        connection: UnityGatewayConnection = {
            workspaceId: "1234",
            authType: "databricks-cli",
        }
    ) {
        return telemetry.startUnityGatewayModelListing(connection);
    }

    function sentEvent() {
        verify(
            reporter.sendTelemetryEvent(anything(), anything(), anything())
        ).once();
        const [name, props, metrics] = capture(
            reporter.sendTelemetryEvent
        ).last();
        const {"event.duration": duration, ...counts} = metrics ?? {};
        assert.ok(typeof duration === "number" && duration >= 0);
        return {name, props, counts};
    }

    function apiError(status: number, body: object) {
        return ApiError.fromHttpError(
            status,
            new Headers(),
            new TextEncoder().encode(JSON.stringify(body))
        )!;
    }

    describe("startUnityGatewayModelListing", () => {
        it("records a listing that completed", () => {
            startListing()({outcome: "ok", modelsCount: 3});

            const {name, props, counts} = sentEvent();
            assert.equal(name, "unity_gateway.model_listing");
            assert.deepStrictEqual(props, {
                "version": "1.0",
                "event.outcome": "ok",
                "event.workspaceId": "1234",
                "event.authType": "databricks-cli",
            });
            assert.deepStrictEqual(counts, {"event.modelsCount": 3});
        });

        it("records the status and the gateway's code of a refusal", () => {
            startListing()({
                outcome: "failed",
                error: apiError(429, {
                    error_code: "REQUEST_LIMIT_EXCEEDED",
                    message: "Tokens-per-minute (TPM) rate limit exceeded",
                }),
            });

            const {props, counts} = sentEvent();
            assert.equal(props?.["event.outcome"], "failed");
            assert.equal(props?.["event.errorCode"], "REQUEST_LIMIT_EXCEEDED");
            assert.equal(props?.["event.errorName"], "ApiError");
            assert.deepStrictEqual(counts, {"event.httpStatus": 429});
        });

        it("records the code of a connection that failed", () => {
            startListing()({
                outcome: "failed",
                error: Object.assign(new AggregateError([], ""), {
                    code: "ECONNREFUSED",
                }),
            });

            const {props, counts} = sentEvent();
            assert.equal(props?.["event.errorCode"], "ECONNREFUSED");
            assert.equal(props?.["event.errorName"], "AggregateError");
            assert.deepStrictEqual(counts, {});
        });

        it("records no status for an error that isn't an HTTP error", () => {
            startListing()({
                outcome: "failed",
                error: Object.assign(new Error("No response"), {
                    httpStatusCode: -1,
                    code: "UNKNOWN",
                }),
            });

            const {props, counts} = sentEvent();
            assert.equal(props?.["event.errorCode"], "UNKNOWN");
            assert.deepStrictEqual(counts, {});
        });

        it("records a sign-in that couldn't produce a token", () => {
            startListing()({
                outcome: "failed",
                error: new ConfigError(
                    "databricks-cli: cannot get access token: expired",
                    new Config({})
                ),
            });

            const {props} = sentEvent();
            assert.equal(props?.["event.errorName"], "ConfigError");
            assert.equal(props?.["event.errorCode"], undefined);
        });

        it("records a listing that timed out", () => {
            startListing()({
                outcome: "failed",
                error: new DOMException("timed out", "TimeoutError"),
            });

            const {props} = sentEvent();
            assert.equal(props?.["event.errorName"], "TimeoutError");
            assert.equal(props?.["event.errorCode"], undefined);
        });

        it("records a failure that isn't an error object", () => {
            startListing()({outcome: "failed", error: undefined});

            const {props, counts} = sentEvent();
            assert.deepStrictEqual(props, {
                "version": "1.0",
                "event.outcome": "failed",
                "event.workspaceId": "1234",
                "event.authType": "databricks-cli",
            });
            assert.deepStrictEqual(counts, {});
        });

        it("records a cancelled listing without failure fields", () => {
            startListing()({outcome: "cancelled"});

            const {props, counts} = sentEvent();
            assert.deepStrictEqual(props, {
                "version": "1.0",
                "event.outcome": "cancelled",
                "event.workspaceId": "1234",
                "event.authType": "databricks-cli",
            });
            assert.deepStrictEqual(counts, {});
        });

        it("records codes and names that aren't the expected shape as other", () => {
            startListing()({
                outcome: "failed",
                error: Object.assign(
                    new Error("Refused for jane@example.com"),
                    {
                        httpStatusCode: 400,
                        code: "jane@example.com",
                        name: "Jane's error",
                    }
                ),
            });

            const {props} = sentEvent();
            assert.equal(props?.["event.errorCode"], "other");
            assert.equal(props?.["event.errorName"], "other");
            assert.doesNotMatch(JSON.stringify(props), /jane/i);
        });

        it("leaves out the connection fields it doesn't have", () => {
            startListing({})({outcome: "ok", modelsCount: 0});

            const {props} = sentEvent();
            assert.equal(props?.["event.workspaceId"], undefined);
            assert.equal(props?.["event.authType"], undefined);
        });

        it("logs, rather than throws, an event it can't send", () => {
            const failure = new Error("reporter disposed");
            when(
                reporter.sendTelemetryEvent(anything(), anything(), anything())
            ).thenThrow(failure);
            const logged: unknown[][] = [];
            const {error} = logging.NamedLogger.prototype;
            logging.NamedLogger.prototype.error = (...args: unknown[]) => {
                logged.push(args);
            };
            try {
                startListing()({outcome: "ok", modelsCount: 1});
            } finally {
                logging.NamedLogger.prototype.error = error;
            }

            assert.deepStrictEqual(logged, [
                ["Can't record a Unity Gateway model listing", failure],
            ]);
        });
    });
});
