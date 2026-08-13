import {CancellationTokenSource, Disposable, Event, EventEmitter} from "vscode";
import {CancellationLike} from "../gateways/PythonSetupCliClient";
import {PythonSetupDrift} from "../../telemetry/pythonSetupExtensions";
import {PythonSetupDriftTrigger} from "../../telemetry/constants";
import {isDrifted} from "../utils/driftDetection";

export interface PythonSetupDriftDeps {
    isVisible: () => Promise<boolean>;
    getPersistedEnvKey: () => string | undefined;
    resolveCurrentEnvKey: (
        token: CancellationLike
    ) => Promise<string | undefined>;
    recordDrift: (report: PythonSetupDrift) => void;
}

/**
 * Watches for compute drift: when the selected compute's environment key no
 * longer matches the one recorded by the last successful setup, exposes a
 * `drifted` flag (and fires `onDidChangeState`) that the config-view row renders
 * as an "out of date -- re-run setup" affordance.
 *
 * The check is deliberately passive: it runs a silent CLI `--dry-run` (no
 * progress UI, no prompt, no error surface), is gated by `isVisible` and the
 * presence of a persisted state, is debounced against rapid compute switches,
 * and treats any inability to resolve the current key as "unknown" -- never a
 * false alarm.
 */
export class PythonSetupDriftManager implements Disposable {
    private _drifted = false;
    /** `${from}->${to}` of the last reported mismatch, to dedupe telemetry. */
    private lastReported: string | undefined;
    private generation = 0;
    private debounceTimer: ReturnType<typeof setTimeout> | undefined;
    private inFlight: CancellationTokenSource | undefined;

    private readonly stateEmitter = new EventEmitter<void>();
    readonly onDidChangeState: Event<void> = this.stateEmitter.event;

    constructor(
        private readonly deps: PythonSetupDriftDeps,
        private readonly debounceMs: number = 500
    ) {}

    get drifted(): boolean {
        return this._drifted;
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
