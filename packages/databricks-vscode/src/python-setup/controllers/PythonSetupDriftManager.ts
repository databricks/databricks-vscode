import {CancellationTokenSource, Disposable, Event, EventEmitter} from "vscode";
import {CancellationLike} from "../gateways/PythonSetupCliClient";
import {PythonSetupDrift} from "../../telemetry/pythonSetupExtensions";
import {PythonSetupDriftTrigger} from "../../telemetry/constants";
import {isDrifted} from "../utils/driftDetection";

export interface PythonSetupDriftDeps {
    isVisible: () => Promise<boolean>;
    getPersistedEnvKey: () => string | undefined;
    /**
     * A cheap, synchronous descriptor of the currently selected compute's
     * IDENTITY (e.g. `"cluster:<id>:<sparkVersion>"`, `"serverless:v5"`), or
     * `undefined` when no comparable compute is attached (nothing selected, or
     * serverless with no chosen version). Unlike {@link resolveCurrentEnvKey}
     * this never spawns the CLI. It lets the manager (a) skip the dry-run when a
     * compute-change trigger fires but the identity is unchanged -- a cluster
     * runtime-state transition rather than a switch -- and (b) clear a stale
     * drift flag when nothing comparable is attached.
     */
    getComputeDescriptor: () => string | undefined;
    resolveCurrentEnvKey: (
        token: CancellationLike
    ) => Promise<string | undefined>;
    recordDrift: (report: PythonSetupDrift) => void;
}

/**
 * The config-view row's derived state, from the persisted setup record vs. the
 * selected compute:
 *  - `unset`   — no successful setup on record (show the initial CTA);
 *  - `ready`   — a setup is on record and the compute still matches (or drift
 *    can't be assessed — the fail-safe direction);
 *  - `drifted` — a setup is on record but the selected compute no longer matches.
 */
export type PythonSetupDriftState = "unset" | "ready" | "drifted";

/**
 * Watches for compute drift: when the selected compute's environment key no
 * longer matches the one recorded by the last successful setup, exposes a
 * {@link PythonSetupDriftState} (and fires `onDidChangeState`) that the
 * config-view row renders — `drifted` becomes an "out of date -- re-run setup"
 * affordance.
 *
 * The check is deliberately passive: it runs a silent CLI `--dry-run` (no
 * progress UI, no prompt, no error surface), is gated by `isVisible` and the
 * presence of a persisted state, is debounced against rapid compute switches,
 * and treats any inability to resolve the current key as "unknown" -- never a
 * false alarm. To avoid needless dry-runs it skips a compute-change check whose
 * compute identity is unchanged (a runtime-state transition, not a switch), and
 * it clears drift outright when no comparable compute is attached.
 */
export class PythonSetupDriftManager implements Disposable {
    private _drifted = false;
    /** `${from}->${to}` of the last reported mismatch, to dedupe telemetry. */
    private lastReported: string | undefined;
    /** Compute descriptor evaluated last, to skip no-op compute-change checks. */
    private lastComputeDescriptor: string | undefined;
    private generation = 0;
    private debounceTimer: ReturnType<typeof setTimeout> | undefined;
    private inFlight: CancellationTokenSource | undefined;

    private readonly stateEmitter = new EventEmitter<void>();
    readonly onDidChangeState: Event<void> = this.stateEmitter.event;

    constructor(
        private readonly deps: PythonSetupDriftDeps,
        private readonly debounceMs: number = 500
    ) {}

    /**
     * The row's derived state. Persisted state is read live so it reflects the
     * current project across window reloads: with a setup on record the row
     * stays `ready` (or `drifted` once a mismatch is detected) instead of
     * reverting to the initial CTA; with none it is `unset`. The mismatch flag
     * is only ever set while a setup is on record, so ordering here is moot.
     */
    get state(): PythonSetupDriftState {
        if (this.deps.getPersistedEnvKey() === undefined) {
            return "unset";
        }
        return this._drifted ? "drifted" : "ready";
    }

    /** Debounced entry point for triggers (compute change, open, setup done). */
    check(trigger: PythonSetupDriftTrigger): void {
        if (this.debounceTimer !== undefined) {
            clearTimeout(this.debounceTimer);
        }
        this.debounceTimer = setTimeout(() => {
            this.debounceTimer = undefined;
            void this.evaluate(trigger);
        }, this.debounceMs);
    }

    /**
     * The awaitable core. Public so it is unit-testable directly; production
     * code reaches it through the debounced {@link check}.
     */
    async evaluate(trigger: PythonSetupDriftTrigger): Promise<void> {
        const myGeneration = ++this.generation;

        // Cancel any dry-run still running for a superseded trigger.
        this.inFlight?.cancel();
        this.inFlight?.dispose();
        const source = new CancellationTokenSource();
        this.inFlight = source;

        try {
            const visible = await this.deps.isVisible();

            // A newer trigger started while we awaited: drop this stale result
            // so an out-of-order early return cannot retract a fresher flag.
            if (myGeneration !== this.generation) {
                return;
            }
            if (!visible) {
                this.setDrifted(false);
                return;
            }
            const persisted = this.deps.getPersistedEnvKey();
            if (persisted === undefined) {
                this.setDrifted(false);
                return;
            }
            const descriptor = this.deps.getComputeDescriptor();
            // No comparable compute attached (detached, or serverless with no
            // chosen version): drift is meaningless -- you cannot be drifted from
            // nothing -- so clear any stale flag instead of leaving it set.
            if (descriptor === undefined) {
                this.lastComputeDescriptor = undefined;
                this.setDrifted(false);
                return;
            }
            // A compute-change trigger whose resolved identity is unchanged is a
            // runtime-state transition (e.g. a cluster going RUNNING ->
            // TERMINATED), not a compute switch. The environment key is derived
            // from the identity, so it cannot have changed: skip the dry-run.
            // workspaceOpen / setupCompleted always re-evaluate -- the first
            // check must run, and a completed setup moves the persisted baseline.
            if (
                trigger === "computeChange" &&
                descriptor === this.lastComputeDescriptor
            ) {
                return;
            }
            this.lastComputeDescriptor = descriptor;
            const current = await this.deps.resolveCurrentEnvKey(source.token);

            // A newer trigger started while we awaited: drop this stale result.
            if (myGeneration !== this.generation) {
                return;
            }
            // Could not resolve the current key -> unknown. Leave the flag as-is
            // rather than clearing (a transient network/auth failure must not
            // silently retract a real drift warning).
            if (current === undefined) {
                return;
            }

            const drifted = isDrifted(persisted, current);
            this.setDrifted(drifted);

            if (drifted) {
                const mismatch = `${persisted}->${current}`;
                if (this.lastReported !== mismatch) {
                    this.lastReported = mismatch;
                    this.deps.recordDrift({
                        trigger,
                        fromEnvKey: persisted,
                        toEnvKey: current,
                    });
                }
            }
        } catch {
            // Any failure resolving the current state (e.g. isVisible or the
            // dry-run rejecting) is treated as "unknown": stay silent and leave
            // the drift flag untouched -- never surface UI, never a false alarm,
            // never retract a real warning. Same fail-safe direction as the
            // `current === undefined` branch above.
        } finally {
            if (this.inFlight === source) {
                source.dispose();
                this.inFlight = undefined;
            }
        }
    }

    private setDrifted(value: boolean): void {
        if (!value) {
            // Reset the telemetry dedupe latch so a recurrence is reported again.
            this.lastReported = undefined;
        }
        if (value === this._drifted) {
            return;
        }
        this._drifted = value;
        this.stateEmitter.fire();
    }

    dispose(): void {
        if (this.debounceTimer !== undefined) {
            clearTimeout(this.debounceTimer);
        }
        this.inFlight?.cancel();
        this.inFlight?.dispose();
        this.stateEmitter.dispose();
    }
}
