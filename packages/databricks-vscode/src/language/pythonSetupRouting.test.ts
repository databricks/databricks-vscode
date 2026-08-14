import * as assert from "assert";
import {routeEnvironmentSetup} from "./pythonSetupRouting";

describe(__filename, () => {
    function makeUv(visible: boolean) {
        const calls = {setup: 0};
        return {
            uv: {
                isVisible: () => Promise.resolve(visible),
                setup: async () => {
                    calls.setup++;
                },
            },
            calls,
        };
    }

    it("routes to the uv flow when it is the active surface", async () => {
        const {uv, calls} = makeUv(true);
        const legacyCalls: (string | undefined)[] = [];
        const legacy = {
            setup: async (stepId?: string) => {
                legacyCalls.push(stepId);
            },
        };

        await routeEnvironmentSetup(uv, legacy, "checkPythonEnvironment");

        assert.strictEqual(calls.setup, 1);
        assert.deepStrictEqual(legacyCalls, []);
    });

    it("routes to the legacy checklist (with the step id) when uv is not active", async () => {
        const {uv, calls} = makeUv(false);
        const legacyCalls: (string | undefined)[] = [];
        const legacy = {
            setup: async (stepId?: string) => {
                legacyCalls.push(stepId);
            },
        };

        await routeEnvironmentSetup(uv, legacy, "checkPythonEnvironment");

        assert.strictEqual(calls.setup, 0);
        assert.deepStrictEqual(legacyCalls, ["checkPythonEnvironment"]);
    });
});
