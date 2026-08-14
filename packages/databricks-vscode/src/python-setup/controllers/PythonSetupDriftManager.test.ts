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
    it("derives state from persisted setup before any check runs", () => {
        // On a fresh reload, before any dry-run, the state must already reflect
        // the persisted record: `ready` when one exists, `unset` when it doesn't.
        const withState = new PythonSetupDriftManager(makeDeps().deps);
        expect(withState.state).to.equal("ready");
        withState.dispose();

        const {deps} = makeDeps({getPersistedEnvKey: () => undefined});
        const withoutState = new PythonSetupDriftManager(deps);
        expect(withoutState.state).to.equal("unset");
        withoutState.dispose();
    });

    it("flags drift and reports telemetry when keys differ", async () => {
        const {deps, recorded} = makeDeps();
        const m = new PythonSetupDriftManager(deps);
        let fired = 0;
        m.onDidChangeState(() => fired++);

        await m.evaluate("computeChange");

        expect(m.state).to.equal("drifted");
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

    it("stays ready when the keys match", async () => {
        const {deps, recorded} = makeDeps({
            resolveCurrentEnvKey: async () => "serverless/serverless-v4",
        });
        const m = new PythonSetupDriftManager(deps);
        await m.evaluate("workspaceOpen");
        expect(m.state).to.equal("ready");
        expect(recorded).to.have.length(0);
        m.dispose();
    });

    it("is a no-op when not visible", async () => {
        const {deps, recorded} = makeDeps({isVisible: async () => false});
        const m = new PythonSetupDriftManager(deps);
        await m.evaluate("workspaceOpen");
        expect(m.state).to.not.equal("drifted");
        expect(recorded).to.have.length(0);
        m.dispose();
    });

    it("is unset when there is no persisted state", async () => {
        const {deps} = makeDeps({getPersistedEnvKey: () => undefined});
        const m = new PythonSetupDriftManager(deps);
        await m.evaluate("workspaceOpen");
        expect(m.state).to.equal("unset");
        m.dispose();
    });

    it("leaves the state unchanged when the current key is unknown", async () => {
        // Start drifted, then a later check can't resolve the key: stay drifted.
        const {deps} = makeDeps();
        const m = new PythonSetupDriftManager(deps);
        await m.evaluate("computeChange");
        expect(m.state).to.equal("drifted");

        (deps as {resolveCurrentEnvKey: unknown}).resolveCurrentEnvKey =
            async () => undefined;
        await m.evaluate("workspaceOpen");
        expect(m.state).to.equal("drifted");
        m.dispose();
    });

    it("returns to ready once the keys match again", async () => {
        const {deps} = makeDeps();
        const m = new PythonSetupDriftManager(deps);
        await m.evaluate("computeChange");
        expect(m.state).to.equal("drifted");

        (deps as {resolveCurrentEnvKey: unknown}).resolveCurrentEnvKey =
            async () => "serverless/serverless-v4";
        await m.evaluate("setupCompleted");
        expect(m.state).to.equal("ready");
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

    it("retries the same compute after a transient resolution failure", async () => {
        // A dry-run that comes back "unknown" (transient CLI/network failure)
        // must NOT record the descriptor: otherwise the no-op skip above would
        // latch this compute and every later same-identity trigger would be
        // dropped, so a genuine drift would never be detected until the compute
        // changed or a reload happened. The next same-descriptor check must
        // re-run the dry-run and pick up the drift.
        let key: string | undefined = undefined;
        const {deps, calls} = makeDeps({
            resolveCurrentEnvKey: async () => {
                calls.resolve++;
                return key;
            },
        });
        const m = new PythonSetupDriftManager(deps);

        await m.evaluate("computeChange"); // resolves undefined -> unknown
        expect(calls.resolve).to.equal(1);
        expect(m.state).to.equal("ready"); // unchanged, no false drift

        key = "dbr/15.4.x-scala2.12"; // now the dry-run succeeds and shows drift
        await m.evaluate("computeChange"); // SAME descriptor -> must not be skipped
        expect(calls.resolve).to.equal(2);
        expect(m.state).to.equal("drifted");
        m.dispose();
    });

    it("returns to ready when no comparable compute is attached", async () => {
        // Start drifted, then compute is detached: drift is meaningless, so the
        // state must clear back to ready rather than linger as drifted.
        const {deps} = makeDeps();
        const m = new PythonSetupDriftManager(deps);
        await m.evaluate("computeChange");
        expect(m.state).to.equal("drifted");

        (deps as {getComputeDescriptor: unknown}).getComputeDescriptor = () =>
            undefined;
        await m.evaluate("computeChange");
        expect(m.state).to.equal("ready");
        m.dispose();
    });

    it("stays silent and leaves the state unchanged when a dep rejects", async () => {
        // A rejecting dep must resolve quietly to "unknown" -- no throw, no
        // unhandled rejection, and the state is left as-is.
        const {deps, recorded} = makeDeps({
            isVisible: async () => {
                throw new Error("network down");
            },
        });
        const m = new PythonSetupDriftManager(deps);

        // A rejection does not flag drift.
        await m.evaluate("workspaceOpen");
        expect(m.state).to.equal("ready");
        expect(recorded).to.have.length(0);

        // Now become drifted, then a rejecting dep must not retract it.
        (deps as {isVisible: unknown}).isVisible = async () => true;
        await m.evaluate("computeChange");
        expect(m.state).to.equal("drifted");

        (deps as {resolveCurrentEnvKey: unknown}).resolveCurrentEnvKey =
            async () => {
                throw new Error("dry-run failed");
            };
        await m.evaluate("workspaceOpen");
        expect(m.state).to.equal("drifted");
        m.dispose();
    });
});
