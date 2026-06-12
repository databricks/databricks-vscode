import * as assert from "assert";
import {commands, ExtensionContext, Uri} from "vscode";
import {anything, instance, mock, verify, when} from "ts-mockito";
import {RunCommands} from "./RunCommands";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {MsPythonExtensionWrapper} from "../language/MsPythonExtensionWrapper";
import {FeatureManager, FeatureState} from "../feature-manager/FeatureManager";
import {CustomWhenContext} from "../vscode-objs/CustomWhenContext";
import {WorkspaceFolderManager} from "../vscode-objs/WorkspaceFolderManager";
import {Telemetry} from "../telemetry";

function featureState(available: boolean, executable?: string): FeatureState {
    return {
        available,
        steps: new Map([
            [
                "checkPythonEnvironment",
                {
                    id: "checkPythonEnvironment",
                    available,
                    title: "Active Environment: .venv",
                    message: executable,
                },
            ],
        ]),
    };
}

describe(__filename, () => {
    let featureManagerMock: FeatureManager;
    let pythonExtensionMock: MsPythonExtensionWrapper;
    let connectionManagerMock: ConnectionManager;
    let runCommands: RunCommands;

    beforeEach(() => {
        featureManagerMock = mock<FeatureManager>(FeatureManager);
        pythonExtensionMock = mock(MsPythonExtensionWrapper);
        connectionManagerMock = mock(ConnectionManager);
        when(connectionManagerMock.state).thenReturn("CONNECTED");
        runCommands = new RunCommands(
            instance(connectionManagerMock),
            instance(mock(WorkspaceFolderManager)),
            instance(pythonExtensionMock),
            instance(featureManagerMock),
            {subscriptions: []} as unknown as ExtensionContext,
            instance(mock(CustomWhenContext)),
            instance(mock(Telemetry))
        );
    });

    describe("createDbconnectDebugConfig", () => {
        it("should pin debugpy to the verified python executable", () => {
            const config = runCommands.createDbconnectDebugConfig(
                Uri.file("/project/src/main.py"),
                "/project/.venv/bin/python"
            );
            assert.strictEqual(config.type, "debugpy");
            assert.strictEqual(config.databricks, true);
            assert.strictEqual(
                config.program,
                Uri.file("/project/src/main.py").fsPath
            );
            assert.strictEqual(config.python, "/project/.venv/bin/python");
        });
    });

    describe("checkDbconnectEnabled", () => {
        it("should pass when the verified interpreter is still selected", async () => {
            when(
                featureManagerMock.isEnabled("environment.dependencies")
            ).thenResolve(featureState(true, "/project/.venv/bin/python"));
            when(pythonExtensionMock.getPythonExecutable()).thenResolve(
                "/project/.venv/bin/python"
            );

            const result = await runCommands["checkDbconnectEnabled"]();

            assert.strictEqual(result, true);
            verify(
                featureManagerMock.isEnabled("environment.dependencies", true)
            ).never();
        });

        it("should re-verify when the selected interpreter changed", async () => {
            when(
                featureManagerMock.isEnabled("environment.dependencies")
            ).thenResolve(featureState(true, "/old/python"));
            when(
                featureManagerMock.isEnabled("environment.dependencies", true)
            ).thenResolve(featureState(true, "/project/.venv/bin/python"));
            when(pythonExtensionMock.getPythonExecutable()).thenResolve(
                "/project/.venv/bin/python"
            );

            const result = await runCommands["checkDbconnectEnabled"]();

            assert.strictEqual(result, true);
            verify(
                featureManagerMock.isEnabled("environment.dependencies", true)
            ).once();
        });

        it("should not re-verify while disconnected", async () => {
            when(connectionManagerMock.state).thenReturn("DISCONNECTED");
            when(
                featureManagerMock.isEnabled("environment.dependencies")
            ).thenResolve(featureState(true, "/old/python"));
            when(pythonExtensionMock.getPythonExecutable()).thenResolve(
                "/project/.venv/bin/python"
            );

            const result = await runCommands["checkDbconnectEnabled"]();

            assert.strictEqual(result, true);
            verify(
                featureManagerMock.isEnabled("environment.dependencies", true)
            ).never();
        });

        it("should not re-verify when the feature is unavailable", async () => {
            when(featureManagerMock.isEnabled(anything())).thenResolve(
                featureState(false, undefined)
            );
            when(pythonExtensionMock.getPythonExecutable()).thenResolve(
                undefined
            );
            // Stub the setup command flow that runs for unavailable features.
            const registration = commands.registerCommand(
                "databricks.environment.setup",
                () => false
            );
            try {
                const result = await runCommands["checkDbconnectEnabled"]();
                assert.strictEqual(result, false);
                verify(
                    featureManagerMock.isEnabled(
                        "environment.dependencies",
                        true
                    )
                ).never();
            } finally {
                registration.dispose();
            }
        });
    });
});
