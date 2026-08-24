import * as assert from "assert";
import type {Disposable} from "vscode";
import {EnvironmentDependenciesVerifier} from "./EnvironmentDependenciesVerifier";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {MsPythonExtensionWrapper} from "./MsPythonExtensionWrapper";
import {EnvironmentDependenciesInstaller} from "./EnvironmentDependenciesInstaller";
import {ConfigureAutocomplete} from "./ConfigureAutocomplete";
import {PackageManagerTelemetry} from "./PackageManagerTelemetry";

// ConnectionManager/MsPythonExtensionWrapper expose their VS Code Events as
// instance properties (`emitter.event`), which ts-mockito can't stub — calling
// them throws "not a function" during construction. Hand-rolled stubs give the
// constructor real no-op event subscriptions and let us drive the one handler
// under test directly.
const noopEvent = () => ({dispose() {}}) as Disposable;

describe(__filename, () => {
    let showCalls: unknown[];

    function makeVerifier(isUvActive: () => Promise<boolean>) {
        const connectionManager = {
            serverless: false,
            cluster: undefined,
            onDidChangeCluster: noopEvent,
            onDidChangeState: noopEvent,
        } as unknown as ConnectionManager;

        const pythonExtension = {
            pythonEnvironment: Promise.resolve({
                version: {major: 3, minor: 10, micro: 0},
                environment: {name: ".venv"},
                executable: {uri: {fsPath: "/project/.venv/bin/python"}},
            }),
            getPythonExecutable: async () => "/project/.venv/bin/python",
            // databricks-connect missing: the legacy path would offer to install
            // it on an interpreter change.
            getPackageDetailsFromEnvironment: async () => undefined,
            onDidChangePythonExecutable: noopEvent,
        } as unknown as MsPythonExtensionWrapper;

        const installer = {
            show: (advertisement?: boolean) => {
                showCalls.push(advertisement);
                return Promise.resolve();
            },
            onDidTryInstallation: noopEvent,
        } as unknown as EnvironmentDependenciesInstaller;

        const configureAutocomplete = {
            shouldSetupBuiltins: async () => false,
            onDidUpdate: noopEvent,
        } as unknown as ConfigureAutocomplete;

        const packageManagerTelemetry =
            {} as unknown as PackageManagerTelemetry;

        return new EnvironmentDependenciesVerifier(
            connectionManager,
            pythonExtension,
            installer,
            configureAutocomplete,
            packageManagerTelemetry,
            isUvActive
        );
    }

    beforeEach(() => {
        showCalls = [];
    });

    it("offers the legacy install prompt on interpreter change when uv is not active", async () => {
        const verifier = makeVerifier(async () => false);

        await verifier["onInterpreterChanged"]();

        assert.deepStrictEqual(showCalls, [true]);
    });

    it("suppresses the legacy install prompt on interpreter change when uv is active", async () => {
        const verifier = makeVerifier(async () => true);

        await verifier["onInterpreterChanged"]();

        assert.deepStrictEqual(showCalls, []);
    });
});
