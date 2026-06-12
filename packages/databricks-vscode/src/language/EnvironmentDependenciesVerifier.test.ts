import * as assert from "assert";
import {Disposable, Uri} from "vscode";
import {mock, instance, when} from "ts-mockito";
import {EnvironmentDependenciesVerifier} from "./EnvironmentDependenciesVerifier";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {MsPythonExtensionWrapper} from "./MsPythonExtensionWrapper";
import {EnvironmentDependenciesInstaller} from "./EnvironmentDependenciesInstaller";
import {ConfigureAutocomplete} from "./ConfigureAutocomplete";
import {ResolvedEnvironment} from "./MsPythonExtensionApi";
import {Cluster} from "../sdk-extensions";

function fakeEnvironment(
    version?: {major: number; minor: number; micro: number},
    name = ".venv",
    executablePath = "/project/.venv/bin/python"
): ResolvedEnvironment {
    return {
        id: executablePath,
        path: executablePath,
        executable: {uri: Uri.file(executablePath)},
        environment: {
            type: "VirtualEnvironment",
            name,
            folderUri: Uri.file("/project/.venv"),
        },
        version,
    } as unknown as ResolvedEnvironment;
}

describe(__filename, () => {
    let connectionManagerMock: ConnectionManager;
    let pythonExtensionMock: MsPythonExtensionWrapper;
    let verifier: EnvironmentDependenciesVerifier;

    const noopEvent = () => new Disposable(() => {});

    beforeEach(() => {
        connectionManagerMock = mock(ConnectionManager);
        when(connectionManagerMock.onDidChangeCluster).thenReturn(noopEvent);
        when(connectionManagerMock.onDidChangeState).thenReturn(noopEvent);

        pythonExtensionMock = mock(MsPythonExtensionWrapper);
        when(pythonExtensionMock.onDidChangePythonExecutable).thenReturn(
            noopEvent
        );

        const installerMock = mock(EnvironmentDependenciesInstaller);
        when(installerMock.onDidTryInstallation).thenReturn(noopEvent);

        const autocompleteMock = mock(ConfigureAutocomplete);
        when(autocompleteMock.onDidUpdate).thenReturn(noopEvent);

        verifier = new EnvironmentDependenciesVerifier(
            instance(connectionManagerMock),
            instance(pythonExtensionMock),
            instance(installerMock),
            instance(autocompleteMock)
        );
    });

    function setupEnvironment(env?: ResolvedEnvironment) {
        when(pythonExtensionMock.pythonEnvironment).thenReturn(
            Promise.resolve(env)
        );
        when(pythonExtensionMock.getPythonExecutable()).thenResolve(
            env?.executable.uri?.fsPath
        );
    }

    describe("serverless (default dbconnect version 17.3)", () => {
        beforeEach(() => {
            when(connectionManagerMock.serverless).thenReturn(true);
            when(connectionManagerMock.cluster).thenReturn(undefined);
        });

        it("should accept python 3.12 without warnings", async () => {
            setupEnvironment(fakeEnvironment({major: 3, minor: 12, micro: 4}));
            const step = await verifier.checkPythonEnvironment();
            assert.strictEqual(step.available, true);
            assert.strictEqual(step.warning, undefined);
            assert.strictEqual(step.title, "Active Environment: .venv");
            assert.strictEqual(step.message, "/project/.venv/bin/python");
        });

        it("should reject python 3.13 (higher than the remote version)", async () => {
            setupEnvironment(fakeEnvironment({major: 3, minor: 13, micro: 1}));
            const step = await verifier.checkPythonEnvironment();
            assert.strictEqual(step.available, false);
            assert.strictEqual(
                step.title,
                "Activate an environment with Python 3.12"
            );
            assert.ok(step.message?.includes("must match"));
            assert.ok(
                step.message?.includes("Current Python version is 3.13.1")
            );
        });

        it("should reject python 3.9", async () => {
            setupEnvironment(fakeEnvironment({major: 3, minor: 9, micro: 6}));
            const step = await verifier.checkPythonEnvironment();
            assert.strictEqual(step.available, false);
            assert.strictEqual(
                step.title,
                "Activate an environment with Python 3.12"
            );
        });

        it("should reject when no environment is active", async () => {
            setupEnvironment(undefined);
            const step = await verifier.checkPythonEnvironment();
            assert.strictEqual(step.available, false);
            assert.strictEqual(
                step.title,
                "Activate an environment with Python 3.12"
            );
            assert.ok(step.message?.includes("No active environments found"));
        });
    });

    describe("clusters", () => {
        function setupCluster(dbrVersion: (number | "x")[]) {
            when(connectionManagerMock.serverless).thenReturn(false);
            when(connectionManagerMock.cluster).thenReturn({
                dbrVersion,
            } as unknown as Cluster);
        }

        it("should accept a matching python version", async () => {
            setupCluster([15, 4]);
            setupEnvironment(fakeEnvironment({major: 3, minor: 11, micro: 9}));
            const step = await verifier.checkPythonEnvironment();
            assert.strictEqual(step.available, true);
            assert.strictEqual(step.warning, undefined);
        });

        it("should accept a non-matching python >= 3.10 with a warning", async () => {
            setupCluster([15, 4]);
            setupEnvironment(fakeEnvironment({major: 3, minor: 10, micro: 2}));
            const step = await verifier.checkPythonEnvironment();
            assert.strictEqual(step.available, true);
            assert.ok(step.warning?.includes("Use Python 3.11"));
            assert.ok(step.warning?.includes("DBR 15"));
        });

        it("should reject python below 3.10", async () => {
            setupCluster([15, 4]);
            setupEnvironment(fakeEnvironment({major: 3, minor: 9, micro: 6}));
            const step = await verifier.checkPythonEnvironment();
            assert.strictEqual(step.available, false);
            assert.strictEqual(
                step.title,
                "Activate an environment with Python 3.11"
            );
        });

        it("should fall back to '3.10 or greater' for unknown DBR versions", async () => {
            setupCluster(["x", "x"]);
            setupEnvironment(undefined);
            const step = await verifier.checkPythonEnvironment();
            assert.strictEqual(step.available, false);
            assert.strictEqual(
                step.title,
                "Activate an environment with Python 3.10 or greater"
            );
        });
    });
});
