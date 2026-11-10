import { describe, expect, it } from "vitest";
import { fakeReporter } from "../../test-support/fakes";
import { telemetryEvent } from "./definitions";
import { COMMAND_EXECUTION, EXTENSION_ACTIVATION } from "./events";
import { contextMetadata } from "./environment";
import { Telemetry } from "./Telemetry";
import { toUserMetadata } from "./userMetadata";

const command = { command: "testCommand", success: true, duration: 100 };

describe("Telemetry", () => {
    it("splits event fields into string properties and numeric measurements", () => {
        const reporter = fakeReporter();
        new Telemetry(reporter).record(COMMAND_EXECUTION, command);
        expect(reporter.events).toEqual([
            {
                name: "commandExecution",
                properties: {
                    "version": "1.0",
                    "event.command": "testCommand",
                    "event.success": "true",
                },
                measurements: { "event.duration": 100 },
            },
        ]);
    });

    it("serializes objects and skips undefined fields", () => {
        const reporter = fakeReporter();
        const event = telemetryEvent<{ a?: string; b: object }>("e", "c", {
            a: { comment: "" },
            b: { comment: "" },
        });
        new Telemetry(reporter).record(event, { b: { x: 1 } });
        expect(reporter.events[0]?.properties).toEqual({ "version": "1.0", "event.b": '{"x":1}' });
    });

    it("records events without properties", () => {
        const reporter = fakeReporter();
        new Telemetry(reporter).record(EXTENSION_ACTIVATION);
        expect(reporter.events[0]?.name).toBe("extensionActivation");
    });

    it.each([
        [{}, "prod"],
        [{ DATABRICKS_VSCODE_INTEGRATION_TEST: "true" }, "tests"],
    ])("adds context metadata, with the next flavor (%o)", (env, environmentType) => {
        const reporter = fakeReporter();
        const telemetry = new Telemetry(reporter);
        telemetry.setMetadata("context", contextMetadata("remote", env));
        telemetry.record(COMMAND_EXECUTION, command);
        expect(reporter.events[0]?.properties).toMatchObject({
            "context.environmentType": environmentType,
            "context.mode": "remote",
            "context.flavor": "next",
        });
    });

    it("adds user metadata with the same user-name hash as the old extension", async () => {
        const reporter = fakeReporter();
        const telemetry = new Telemetry(reporter);
        telemetry.setMetadata(
            "user",
            await toUserMetadata({
                userName: "miles@databricks.com",
                host: "my.databricks.com",
                workspaceId: "workspace-id",
                authType: "azure-cli",
            }),
        );
        telemetry.record(COMMAND_EXECUTION, command);
        expect(reporter.events[0]?.properties).toEqual({
            "version": "1.0",
            "event.command": "testCommand",
            "event.success": "true",
            // The value the old extension's test pinned for this user name.
            "user.hashedUserName": "$2b$07$97f780c0d2a202b5f54aeOJ9MKnLacIH6dXoDUpQLfJXKjhYqxJLW",
            "user.host": "my.databricks.com",
            "user.authType": "azure-cli",
            "user.workspaceId": "workspace-id",
        });
    });

    it("measures durations with start()", () => {
        const reporter = fakeReporter();
        let now = 1000;
        const telemetry = new Telemetry(reporter, () => now);
        const done = telemetry.start(COMMAND_EXECUTION);
        now = 1250;
        done({ command: "c", success: true });
        expect(reporter.events[0]?.measurements).toEqual({ "event.duration": 250 });
    });

    it("does nothing without a reporter", () => {
        const telemetry = new Telemetry(undefined);
        expect(telemetry.isEnabled).toBe(false);
        expect(() => telemetry.record(EXTENSION_ACTIVATION)).not.toThrow();
    });
});
