import {expect} from "chai";
import {CancellationLike} from "../gateways/PythonSetupCliClient";
import {
    PythonSetupDriftDeps,
    PythonSetupDriftManager,
} from "./PythonSetupDriftManager";

function makeDeps(over: Partial<PythonSetupDriftDeps> = {}): {
    deps: PythonSetupDriftDeps;
    recorded: unknown[];
    calls: {resolve: number};
} {
    const recorded: unknown[] = [];
    const calls = {resolve: 0};
    const deps: PythonSetupDriftDeps = {
        isVisible: async () => true,
        getPersistedEnvKey: () => "serverless/serverless-v4",
        getComputeDescriptor: () => "cluster:c1",
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        resolveCurrentEnvKey: async (_token: CancellationLike) => {
            calls.resolve++;
            return "dbr/15.4.x-scala2.12";
        },
        recordDrift: (r) => recorded.push(r),
        ...over,
    };
    return {deps, recorded, calls};
}

describe("PythonSetupDriftManager", () => {
    it("flags drift and reports telemetry when keys differ", async () => {
        const {deps, recorded} = makeDeps();
        const m = new PythonSetupDriftManager(deps);
        let fired = 0;
        m.onDidChangeState(() => fired++);

        await m.evaluate("computeChange");

        expect(m.drifted).to.be.true;
        expect(fired).to.equal(1);
        expect(recorded).to.deep.equal([
            {
                trigger: "computeChange",
                fromEnvKey: "serverless/serverless-v4",
                toEnvKey: "dbr/15.4.x-scala2.12",
            },
        ]);
        m.dispose();
    });

    it("does not flag drift when the keys match", async () => {
        const {deps, recorded} = makeDeps({
            resolveCurrentEnvKey: async () => "serverless/serverless-v4",
        });
        const m = new PythonSetupDriftManager(deps);
        await m.evaluate("workspaceOpen");
        expect(m.drifted).to.be.false;
        expect(recorded).to.have.length(0);
        m.dispose();
    });

    it("is a no-op when not visible", async () => {
        const {deps, recorded} = makeDeps({isVisible: async () => false});
        const m = new PythonSetupDriftManager(deps);
        await m.evaluate("workspaceOpen");
        expect(m.drifted).to.be.false;
        expect(recorded).to.have.length(0);
        m.dispose();
    });

    it("does not flag drift when there is no persisted state", async () => {
        const {deps} = makeDeps({getPersistedEnvKey: () => undefined});
        const m = new PythonSetupDriftManager(deps);
        await m.evaluate("workspaceOpen");
        expect(m.drifted).to.be.false;
        m.dispose();
    });

    it("leaves the flag unchanged when the current key is unknown", async () => {
        // Start drifted, then a later check can't resolve the key: stay drifted.
        const {deps} = makeDeps();
        const m = new PythonSetupDriftManager(deps);
        await m.evaluate("computeChange");
        expect(m.drifted).to.be.true;

        (deps as {resolveCurrentEnvKey: unknown}).resolveCurrentEnvKey =
            async () => undefined;
        await m.evaluate("workspaceOpen");
        expect(m.drifted).to.be.true;
        m.dispose();
    });

    it("clears drift once the keys match again", async () => {
        const {deps} = makeDeps();
        const m = new PythonSetupDriftManager(deps);
        await m.evaluate("computeChange");
        expect(m.drifted).to.be.true;

        (deps as {resolveCurrentEnvKey: unknown}).resolveCurrentEnvKey =
            async () => "serverless/serverless-v4";
        await m.evaluate("setupCompleted");
        expect(m.drifted).to.be.false;
        m.dispose();
    });

    it("reports the same mismatch only once until it clears", async () => {
        const {deps, recorded} = makeDeps();
        const m = new PythonSetupDriftManager(deps);
        await m.evaluate("computeChange");
        await m.evaluate("workspaceOpen"); // same mismatch, no new telemetry
        expect(recorded).to.have.length(1);

        // Clears, then a mismatch recurs on a DIFFERENT compute -> reported
        // again (a different descriptor is required, since a compute-change with
        // the same identity is skipped as a no-op runtime-state transition).
        (deps as {resolveCurrentEnvKey: unknown}).resolveCurrentEnvKey =
            async () => "serverless/serverless-v4";
        await m.evaluate("setupCompleted");
        (deps as {getComputeDescriptor: unknown}).getComputeDescriptor = () =>
            "cluster:c2";
        (deps as {resolveCurrentEnvKey: unknown}).resolveCurrentEnvKey =
            async () => "dbr/15.4.x-scala2.12";
        await m.evaluate("computeChange");
        expect(recorded).to.have.length(2);
        m.dispose();
    });

    it("skips the dry-run when a compute-change leaves the identity unchanged", async () => {
        // Same descriptor across two compute-change triggers models a cluster
        // runtime-state transition (RUNNING -> TERMINATED): the env key cannot
        // have changed, so the CLI dry-run must not run a second time.
        const {deps, calls} = makeDeps();
        const m = new PythonSetupDriftManager(deps);
        await m.evaluate("computeChange");
        expect(calls.resolve).to.equal(1);
        await m.evaluate("computeChange");
        expect(calls.resolve).to.equal(1);
        m.dispose();
    });

    it("clears drift when no comparable compute is attached", async () => {
        // Start drifted, then compute is detached: drift is meaningless, so the
        // stale flag must clear rather than linger.
        const {deps} = makeDeps();
        const m = new PythonSetupDriftManager(deps);
        await m.evaluate("computeChange");
        expect(m.drifted).to.be.true;

        (deps as {getComputeDescriptor: unknown}).getComputeDescriptor = () =>
            undefined;
        await m.evaluate("computeChange");
        expect(m.drifted).to.be.false;
        m.dispose();
    });

    it("stays silent and leaves the flag unchanged when a dep rejects", async () => {
        // A rejecting dep must resolve quietly to "unknown" -- no throw, no
        // unhandled rejection, and the drift flag is left as-is.
        const {deps, recorded} = makeDeps({
            isVisible: async () => {
                throw new Error("network down");
            },
        });
        const m = new PythonSetupDriftManager(deps);

        // Starts not drifted: a rejection leaves it false.
        await m.evaluate("workspaceOpen");
        expect(m.drifted).to.be.false;
        expect(recorded).to.have.length(0);

        // Now start drifted, then a rejecting dep must not retract the flag.
        (deps as {isVisible: unknown}).isVisible = async () => true;
        await m.evaluate("computeChange");
        expect(m.drifted).to.be.true;

        (deps as {resolveCurrentEnvKey: unknown}).resolveCurrentEnvKey =
            async () => {
                throw new Error("dry-run failed");
            };
        await m.evaluate("workspaceOpen");
        expect(m.drifted).to.be.true;
        m.dispose();
    });
});
