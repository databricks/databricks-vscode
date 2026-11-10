import { describe, expect, it } from "vitest";
import { Telemetry, type TelemetryRecorder } from "../../kernel/telemetry/Telemetry";
import { fakeLog, fakeReporter } from "../../test-support/fakes";
import { startChatReport } from "./chatReport";
import { IncompleteReplyError, StreamError } from "./replyErrors";

const request = { model: "system.ai.gpt-5", messagesCount: 2, toolsCount: 1 };

/** The properties the report records for a request that failed with `error`. */
function failedWith(error: unknown): Record<string, string> {
    const reporter = fakeReporter();
    startChatReport(new Telemetry(reporter), fakeLog(), request).finish({
        outcome: "failed",
        error,
    });
    return reporter.events[0]?.properties ?? {};
}

describe("startChatReport", () => {
    it("records the request once, with its duration and its first part's time", () => {
        const reporter = fakeReporter();
        let telemetryClock = 1000;
        let chatClock = 0;
        const report = startChatReport(
            new Telemetry(reporter, () => telemetryClock),
            fakeLog(),
            request,
            () => chatClock,
        );

        report.streamStarted();
        chatClock = 40;
        report.partShown();
        chatClock = 90;
        report.partShown();
        telemetryClock = 1250;
        report.finish({ outcome: "ok" });

        expect(reporter.events).toEqual([
            {
                name: "unityGatewayChat",
                properties: {
                    "version": "1.0",
                    "event.outcome": "ok",
                    "event.model": "system.ai.gpt-5",
                    "event.replyStarted": "true",
                },
                measurements: {
                    "event.messagesCount": 2,
                    "event.toolsCount": 1,
                    "event.timeToFirstPart": 40,
                    "event.duration": 250,
                },
            },
        ]);
    });

    it("logs a failure to record and does not throw", () => {
        const reporter = fakeReporter();
        reporter.sendTelemetryEvent = () => {
            throw new Error("reporter disposed");
        };
        const log = fakeLog();
        const report = startChatReport(new Telemetry(reporter), log, request);

        expect(() => report.finish({ outcome: "cancelled" })).not.toThrow();
        expect(log.entries).toContainEqual(
            expect.objectContaining({
                level: "error",
                message: "Can't record a Unity Gateway chat request",
            }),
        );
    });

    it("logs a failure to start the timer and records nothing, without throwing", () => {
        const broken: TelemetryRecorder = {
            isEnabled: true,
            record: () => {},
            start: () => {
                throw new Error("no clock");
            },
        };
        const log = fakeLog();
        const report = startChatReport(broken, log, request);

        expect(() => report.finish({ outcome: "ok" })).not.toThrow();
        expect(log.entries.filter((e) => e.level === "error")).toHaveLength(1);
    });

    it("records only the first finish, whichever path ends the request", () => {
        const reporter = fakeReporter();
        const report = startChatReport(new Telemetry(reporter), fakeLog(), request);

        report.finish({ outcome: "notConnected" });
        report.finish({ outcome: "failed", error: new Error("prompt failed") });

        expect(reporter.events).toHaveLength(1);
        expect(reporter.events[0]?.properties).toMatchObject({ "event.outcome": "notConnected" });
    });

    it.each([
        "RESOURCE_EXHAUSTED",
        "REQUEST_LIMIT_EXCEEDED",
        "UNAUTHENTICATED",
        "ECONNREFUSED",
        "UND_ERR_SOCKET",
        "ERR_HTTP2_STREAM_ERROR",
        "context_length_exceeded",
        "rate_limit_error",
        "server_error",
    ])("records the code %s as it is", (code) => {
        expect(failedWith(new StreamError("x", code))["event.errorCode"]).toBe(code);
    });

    it.each(["max_output_tokens", "max_tokens", "end_turn", "content_filter"])(
        "records the stop reason %s as it is",
        (reason) => {
            expect(failedWith(new IncompleteReplyError(reason))["event.stopReason"]).toBe(reason);
        },
    );

    it.each([
        "alice",
        "Alice",
        "AliceSmith",
        "alice@example.com",
        "connect to alice",
        "deadbeef0123",
        "3f2a9c",
        "A1B2C3",
        "ABC123",
        "TKN_12345",
        "user_1234",
        "x",
        `E${"_X".repeat(40)}`,
    ])("records %s, which isn't shaped like a code, as other", (value) => {
        expect(failedWith(new StreamError("x", value))["event.errorCode"]).toBe("other");
        expect(failedWith(new IncompleteReplyError(value))["event.stopReason"]).toBe("other");
    });

    it("records the error's name, not its class's", () => {
        class Renamed extends Error {
            constructor() {
                super("x");
                this.name = "TimeoutError";
            }
        }
        const badName = Object.assign(new Error("x"), { name: "Token_Error" });

        expect(failedWith(new Renamed())["event.errorName"]).toBe("TimeoutError");
        expect(failedWith(badName)["event.errorName"]).toBe("other");
    });
});
