/* eslint-disable @typescript-eslint/naming-convention */
import TelemetryReporter from "@vscode/extension-telemetry";
import assert from "assert";
import {mock, instance, capture, when} from "ts-mockito";
import {Telemetry, getContextMetadata, toUserMetadata} from ".";
import {Events, Metadata} from "./constants";
import {DatabricksWorkspace} from "../configuration/DatabricksWorkspace";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {ApiClient, Config} from "@databricks/databricks-sdk";

describe(__filename, () => {
    let reporter: TelemetryReporter;
    let telemetry: Telemetry;
    const defaultClusterId = process.env["TEST_DEFAULT_CLUSTER_ID"];
    beforeEach(async () => {
        reporter = mock(TelemetryReporter);
        telemetry = new Telemetry(instance(reporter));
    });
    afterEach(() => {
        process.env["TEST_DEFAULT_CLUSTER_ID"] = defaultClusterId;
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

    it("sets context metadata with prod env type", async () => {
        delete process.env["DATABRICKS_VSCODE_INTEGRATION_TEST"];
        telemetry.setMetadata(Metadata.CONTEXT, getContextMetadata());
        telemetry.recordEvent(Events.COMMAND_EXECUTION, {
            command: "testCommand",
            success: true,
            duration: 100,
        });
        const [eventName, props] = capture(reporter.sendTelemetryEvent).last();
        assert.equal(eventName, "commandExecution");
        assert.deepEqual(props, {
            "version": "1.0",
            "event.command": "testCommand",
            "event.success": "true",
            "context.environmentType": "prod",
        });
    });

    it("sets context metadata with tests env type", async () => {
        process.env["DATABRICKS_VSCODE_INTEGRATION_TEST"] = "true";
        telemetry.setMetadata(Metadata.CONTEXT, getContextMetadata());
        telemetry.recordEvent(Events.COMMAND_EXECUTION, {
            command: "testCommand",
            success: true,
            duration: 100,
        });
        const [eventName, props] = capture(reporter.sendTelemetryEvent).last();
        assert.equal(eventName, "commandExecution");
        assert.deepEqual(props, {
            "version": "1.0",
            "event.command": "testCommand",
            "event.success": "true",
            "context.environmentType": "tests",
        });
    });

    it("sets user metadata correctly after logged in", async () => {
        const ws = mock(DatabricksWorkspace);
        when(ws.userName).thenReturn("miles@databricks.com");
        when(ws.host).thenReturn(new URL("https://my.databricks.com"));
        const cm = mock(ConnectionManager);
        when(cm.databricksWorkspace).thenReturn(instance(ws));
        const mockConfig = mock(Config);
        when(mockConfig.authType).thenReturn("azure-cli");
        const mockClient = mock(ApiClient);
        when(mockClient.config).thenReturn(instance(mockConfig));
        when(cm.apiClient).thenReturn(instance(mockClient));

        telemetry.setMetadata(
            Metadata.USER,
            await toUserMetadata(instance(cm))
        );

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
