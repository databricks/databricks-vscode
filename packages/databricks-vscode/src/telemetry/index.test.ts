/* eslint-disable @typescript-eslint/naming-convention */
import TelemetryReporter from "@vscode/extension-telemetry";
import assert from "assert";
import {mock, instance, capture, when} from "ts-mockito";
import {Telemetry, updateUserMetadata} from ".";
import {Events} from "./constants";
import {DatabricksWorkspace} from "../configuration/DatabricksWorkspace";
import {AuthProvider} from "../configuration/auth/AuthProvider";
import {Uri} from "vscode";

describe(__filename, () => {
    let reporter: TelemetryReporter;
    let telemetry: Telemetry;
    beforeEach(async () => {
        reporter = mock(TelemetryReporter);
        telemetry = new Telemetry(instance(reporter));
    });
    it("should record expected properties and metrics", async () => {
        telemetry.recordEvent(Events.COMMAND_EXECUTION, {
            command: "testCommand",
            success: true,
            duration: 100,
        });
        const [eventName, props, metrics] = capture(
            reporter.sendTelemetryEvent
        ).last();
        assert.equal(eventName, "commandExecution");
        assert.deepEqual(props, {
            "version": "1.0",
            "event.command": "testCommand",
            "event.success": "true",
        });
        assert.deepEqual(metrics, {
            "event.duration": 100,
        });
    });

    it("sets user metadata correctly after logged in", async () => {
        const authProvider = mock(AuthProvider);
        when(authProvider.authType).thenReturn("azure-cli");
        const ws = mock(DatabricksWorkspace);
        when(ws.authProvider).thenReturn(instance(authProvider));
        when(ws.userName).thenReturn("miles@databricks.com");
        when(ws.host).thenReturn(Uri.parse("https://my.databricks.com"));
        await updateUserMetadata(instance(ws));

        telemetry.recordEvent(Events.COMMAND_EXECUTION, {
            command: "testCommand",
            success: true,
            duration: 100,
        });
        const [eventName, props, metrics] = capture(
            reporter.sendTelemetryEvent
        ).last();
        assert.equal(eventName, "commandExecution");
        assert.deepEqual(props, {
            "version": "1.0",
            "event.command": "testCommand",
            "event.success": "true",
            // Determined by running the test once with above username.
            "user.hashedUserName":
                "$2b$07$97f780c0d2a202b5f54aeOJ9MKnLacIH6dXoDUpQLfJXKjhYqxJLW",
            "user.host": "my.databricks.com",
            "user.authType": "azure-cli",
        });
        assert.deepEqual(metrics, {
            "event.duration": 100,
        });
    });
});
