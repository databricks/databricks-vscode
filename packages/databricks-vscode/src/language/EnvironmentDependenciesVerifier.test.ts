import assert from "assert";
import {mock, when, instance} from "ts-mockito";
import {Uri} from "vscode";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {MsPythonExtensionWrapper} from "./MsPythonExtensionWrapper";
import {EnvironmentDependenciesInstaller} from "./EnvironmentDependenciesInstaller";
import {EnvironmentDependenciesVerifier} from "./EnvironmentDependenciesVerifier";
import {ConfigureAutocomplete} from "./ConfigureAutocomplete";
import {ResolvedEnvironment} from "./MsPythonExtensionApi";
import {Cluster} from "../sdk-extensions";

function makeResolvedEnv(
    overrides: Partial<ResolvedEnvironment> = {}
): ResolvedEnvironment {
    return {
        id: "env-1",
        path: "/home/user/venv/bin/python",
        executable: {
            uri: Uri.file("/home/user/venv/bin/python"),
            bitness: "64-bit",
            sysPrefix: "/home/user/venv",
        },
        environment: {
            type: "VirtualEnvironment",
            name: "my-venv",
            folderUri: Uri.file("/home/user/venv"),
            workspaceFolder: undefined,
        },
        version: {
            major: 3,
            minor: 10,
            micro: 0,
            release: {level: "final", serial: 0},
            sysVersion: "3.10.0",
        },
        tools: [],
        ...overrides,
    } as ResolvedEnvironment;
}

function makeGlobalResolvedEnv(
    overrides: Partial<ResolvedEnvironment> = {}
): ResolvedEnvironment {
    return makeResolvedEnv({
        id: "global-python",
        path: "/usr/bin/python3",
        executable: {
            uri: Uri.file("/usr/bin/python3"),
            bitness: "64-bit",
            sysPrefix: "/usr",
        },
        environment: undefined,
        ...overrides,
    });
}

describe(__filename, () => {
    let mockedConnectionManager: ConnectionManager;
    let mockedPythonExtension: MsPythonExtensionWrapper;
    let mockedInstaller: EnvironmentDependenciesInstaller;
    let mockedAutocomplete: ConfigureAutocomplete;
    let verifier: EnvironmentDependenciesVerifier;

    beforeEach(() => {
        mockedConnectionManager = mock(ConnectionManager);
        mockedPythonExtension = mock(MsPythonExtensionWrapper);
        mockedInstaller = mock(EnvironmentDependenciesInstaller);
        mockedAutocomplete = mock(ConfigureAutocomplete);

        when(mockedConnectionManager.cluster).thenReturn(undefined);
        when(mockedConnectionManager.serverless).thenReturn(false);

        when(mockedConnectionManager.onDidChangeCluster).thenReturn((() => ({
            dispose: () => {},
        })) as any);
        when(mockedConnectionManager.onDidChangeState).thenReturn((() => ({
            dispose: () => {},
        })) as any);
        when(mockedPythonExtension.onDidChangePythonExecutable).thenReturn(
            (() => ({dispose: () => {}})) as any
        );
        when(mockedInstaller.onDidTryInstallation).thenReturn((() => ({
            dispose: () => {},
        })) as any);
        when(mockedAutocomplete.onDidUpdate).thenReturn((() => ({
            dispose: () => {},
        })) as any);

        verifier = new EnvironmentDependenciesVerifier(
            instance(mockedConnectionManager),
            instance(mockedPythonExtension),
            instance(mockedInstaller),
            instance(mockedAutocomplete)
        );
    });

    afterEach(() => {
        verifier.dispose();
    });

    it("should accept a global interpreter with correct Python version", async () => {
        const globalEnv = makeGlobalResolvedEnv();
        when(mockedPythonExtension.pythonEnvironment).thenReturn(
            Promise.resolve(globalEnv)
        );
        when(mockedPythonExtension.getPythonExecutable()).thenResolve(
            "/usr/bin/python3"
        );

        const mockedCluster = mock(Cluster);
        when(mockedCluster.dbrVersion).thenReturn([13, 3]);
        when(mockedConnectionManager.cluster).thenReturn(
            instance(mockedCluster)
        );

        const result = await verifier.checkPythonEnvironment();
        assert.ok(result.available);
    });

    it("should display executable path as name for global interpreters", async () => {
        const globalEnv = makeGlobalResolvedEnv();
        when(mockedPythonExtension.pythonEnvironment).thenReturn(
            Promise.resolve(globalEnv)
        );
        when(mockedPythonExtension.getPythonExecutable()).thenResolve(
            "/usr/bin/python3"
        );

        const result = await verifier.checkPythonEnvironment();
        assert.ok(result.available);
        assert.ok(result.title?.includes("/usr/bin/python3"));
    });

    it("should display environment name for virtual environments", async () => {
        const venvEnv = makeResolvedEnv();
        when(mockedPythonExtension.pythonEnvironment).thenReturn(
            Promise.resolve(venvEnv)
        );
        when(mockedPythonExtension.getPythonExecutable()).thenResolve(
            "/home/user/venv/bin/python"
        );

        const result = await verifier.checkPythonEnvironment();
        assert.ok(result.available);
        assert.ok(result.title?.includes("my-venv"));
    });

    it("should reject global interpreter without version", async () => {
        const globalEnv = makeGlobalResolvedEnv({
            version: undefined,
        });
        when(mockedPythonExtension.pythonEnvironment).thenReturn(
            Promise.resolve(globalEnv)
        );

        const result = await verifier.checkPythonEnvironment();
        assert.ok(!result.available);
    });

    it("should reject global interpreter without executable uri", async () => {
        const globalEnv = makeGlobalResolvedEnv({
            executable: {
                uri: undefined,
                bitness: "64-bit",
                sysPrefix: "/usr",
            },
        });
        when(mockedPythonExtension.pythonEnvironment).thenReturn(
            Promise.resolve(globalEnv)
        );

        const result = await verifier.checkPythonEnvironment();
        assert.ok(!result.available);
    });

    it("should reject when env is undefined", async () => {
        when(mockedPythonExtension.pythonEnvironment).thenReturn(
            Promise.resolve(undefined)
        );

        const result = await verifier.checkPythonEnvironment();
        assert.ok(!result.available);
    });

    it("should reject global interpreter with Python version too low", async () => {
        const globalEnv = makeGlobalResolvedEnv({
            version: {
                major: 3,
                minor: 9,
                micro: 0,
                release: {level: "final", serial: 0},
                sysVersion: "3.9.0",
            },
        });
        when(mockedPythonExtension.pythonEnvironment).thenReturn(
            Promise.resolve(globalEnv)
        );

        const result = await verifier.checkPythonEnvironment();
        assert.ok(!result.available);
    });

    it("should show version mismatch warning for global interpreter with DBR 15", async () => {
        const globalEnv = makeGlobalResolvedEnv();
        when(mockedPythonExtension.pythonEnvironment).thenReturn(
            Promise.resolve(globalEnv)
        );
        when(mockedPythonExtension.getPythonExecutable()).thenResolve(
            "/usr/bin/python3"
        );

        const mockedCluster = mock(Cluster);
        when(mockedCluster.dbrVersion).thenReturn([15, 1]);
        when(mockedConnectionManager.cluster).thenReturn(
            instance(mockedCluster)
        );

        const result = await verifier.checkPythonEnvironment();
        assert.ok(result.available);
        assert.ok(result.warning);
        assert.ok(result.warning!.includes("3.11"));
    });

    it("should not warn when global interpreter matches DBR 15", async () => {
        const globalEnv = makeGlobalResolvedEnv({
            version: {
                major: 3,
                minor: 11,
                micro: 2,
                release: {level: "final", serial: 0},
                sysVersion: "3.11.2",
            },
        });
        when(mockedPythonExtension.pythonEnvironment).thenReturn(
            Promise.resolve(globalEnv)
        );
        when(mockedPythonExtension.getPythonExecutable()).thenResolve(
            "/usr/bin/python3"
        );

        const mockedCluster = mock(Cluster);
        when(mockedCluster.dbrVersion).thenReturn([15, 1]);
        when(mockedConnectionManager.cluster).thenReturn(
            instance(mockedCluster)
        );

        const result = await verifier.checkPythonEnvironment();
        assert.ok(result.available);
        assert.strictEqual(result.warning, undefined);
    });

    it("should accept global interpreter for serverless with Python 3.11", async () => {
        const globalEnv = makeGlobalResolvedEnv({
            version: {
                major: 3,
                minor: 11,
                micro: 0,
                release: {level: "final", serial: 0},
                sysVersion: "3.11.0",
            },
        });
        when(mockedPythonExtension.pythonEnvironment).thenReturn(
            Promise.resolve(globalEnv)
        );
        when(mockedPythonExtension.getPythonExecutable()).thenResolve(
            "/usr/bin/python3"
        );
        when(mockedConnectionManager.serverless).thenReturn(true);

        const result = await verifier.checkPythonEnvironment();
        assert.ok(result.available);
    });

    it("should reject global interpreter for serverless with Python 3.10", async () => {
        const globalEnv = makeGlobalResolvedEnv();
        when(mockedPythonExtension.pythonEnvironment).thenReturn(
            Promise.resolve(globalEnv)
        );
        when(mockedConnectionManager.serverless).thenReturn(true);

        const result = await verifier.checkPythonEnvironment();
        assert.ok(!result.available);
    });

    it("should reject env without environment and without executable uri", async () => {
        const env = makeResolvedEnv({
            environment: undefined,
            executable: {
                uri: undefined,
                bitness: "64-bit",
                sysPrefix: "/some/global",
            },
        });
        when(mockedPythonExtension.pythonEnvironment).thenReturn(
            Promise.resolve(env)
        );

        const result = await verifier.checkPythonEnvironment();
        assert.ok(!result.available);
    });
});
