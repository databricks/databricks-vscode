import * as assert from "assert";
import {anything, instance, mock, verify, when} from "ts-mockito";
import {EnvironmentCommands} from "./EnvironmentCommands";
import {
    FeatureManager,
    FeatureState,
    FeatureStepState,
} from "../feature-manager/FeatureManager";
import {MsPythonExtensionWrapper} from "./MsPythonExtensionWrapper";
import {EnvironmentDependenciesInstaller} from "./EnvironmentDependenciesInstaller";
import {EnvironmentProvisioner} from "./EnvironmentProvisioner";

function makeState(steps: Array<Partial<FeatureStepState> & {id: string}>) {
    const state: FeatureState = {
        available: steps.every((s) => s.available),
        steps: new Map(
            steps.map((s) => [
                s.id,
                {available: false, ...s} as FeatureStepState,
            ])
        ),
    };
    return state;
}

describe(__filename, () => {
    let featureManagerMock: FeatureManager;
    let provisionerMock: EnvironmentProvisioner;
    let commands: EnvironmentCommands;

    beforeEach(() => {
        featureManagerMock = mock<FeatureManager>(FeatureManager);
        provisionerMock = mock(EnvironmentProvisioner);
        commands = new EnvironmentCommands(
            instance(featureManagerMock),
            instance(mock(MsPythonExtensionWrapper)),
            instance(mock(EnvironmentDependenciesInstaller)),
            instance(provisionerMock)
        );
    });

    describe("shouldProvision", () => {
        it("should provision when only the python environment is failing", () => {
            const state = makeState([
                {id: "checkCluster", available: true},
                {id: "checkPythonEnvironment", available: false},
                {id: "checkEnvironmentDependencies", available: false},
            ]);
            assert.strictEqual(commands.shouldProvision(state), true);
        });

        it("should not provision when the cluster step is failing", () => {
            const state = makeState([
                {id: "checkCluster", available: false},
                {id: "checkPythonEnvironment", available: false},
            ]);
            assert.strictEqual(commands.shouldProvision(state), false);
        });

        it("should not provision when everything is available", () => {
            const state = makeState([
                {id: "checkCluster", available: true},
                {id: "checkPythonEnvironment", available: true},
            ]);
            assert.strictEqual(commands.shouldProvision(state), false);
        });

        it("should ignore failing optional steps", () => {
            const state = makeState([
                {id: "checkPythonEnvironment", available: false},
                {id: "checkBuiltins", available: false, optional: true},
            ]);
            assert.strictEqual(commands.shouldProvision(state), true);
        });

        it("should respect the requested step", () => {
            const state = makeState([
                {id: "checkPythonEnvironment", available: false},
            ]);
            assert.strictEqual(
                commands.shouldProvision(state, "checkPythonEnvironment"),
                true
            );
            assert.strictEqual(
                commands.shouldProvision(state, "checkCluster"),
                false
            );
        });
    });

    describe("_setup", () => {
        it("should provision when the experiment is enabled", async () => {
            when(featureManagerMock.isEnabled(anything())).thenResolve(
                makeState([{id: "checkPythonEnvironment", available: false}])
            );
            when(featureManagerMock.isEnabled(anything(), true)).thenResolve(
                makeState([{id: "checkPythonEnvironment", available: true}])
            );
            when(provisionerMock.enabled).thenReturn(true);
            when(provisionerMock.ensureEnvironment()).thenResolve({
                success: true,
            });

            await commands["_setup"]();

            verify(provisionerMock.ensureEnvironment()).once();
            verify(featureManagerMock.isEnabled(anything(), true)).once();
        });

        it("should not provision when the experiment is disabled", async () => {
            when(featureManagerMock.isEnabled(anything())).thenResolve(
                makeState([{id: "checkPythonEnvironment", available: true}])
            );
            when(provisionerMock.enabled).thenReturn(false);

            await commands["_setup"]();

            verify(provisionerMock.ensureEnvironment()).never();
        });
    });
});
