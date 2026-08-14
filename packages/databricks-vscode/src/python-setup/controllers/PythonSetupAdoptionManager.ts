import {TargetCompute} from "../../telemetry/constants";
import {PythonSetupAdoption} from "../../telemetry/pythonSetupExtensions";

export interface PythonSetupAdoptionDeps {
    /** The active project's root, or undefined when none is resolvable. */
    projectRoot: () => string | undefined;
    /**
     * Whether the persisted setup state can be attributed to the active project.
     * `setupState` is a single workspace-scoped key with no per-project
     * namespacing, so in a multi-root workspace it may belong to a sibling root:
     * checking a different root's `.venv` against it would emit a spurious
     * `venvPresent: false` and inflate the denominator. False there suppresses the
     * reading rather than emit an untrustworthy one.
     */
    isAttributable: () => boolean;
    /**
     * Whether a uv-native setup is on record for the workspace (the persisted
     * `databricks.pythonSetup.setupState` exists). The gauge is emitted only
     * when true, so the event's presence is the adoption-rate denominator.
     */
    isVpexActive: () => boolean;
    /** The compute kind attached right now (cluster / serverless / none). */
    getTargetType: () => TargetCompute;
    /** Whether the project's managed `.venv` interpreter exists on disk. */
    venvExists: (root: string) => boolean;
    /** Emit the gauge. Wraps telemetry; must be best-effort (never throw). */
    record: (report: PythonSetupAdoption) => void;
}

/**
 * Emits the once-per-session {@link PythonSetupAdoption} gauge: for a project
 * that has a uv-native Python setup on record, whether its managed `.venv` is
 * still present and what compute is attached. Purely a measurement — it reads
 * state and records, never changing the flow it observes.
 *
 * Deliberately thin: the caller fires {@link report} on a trigger where the
 * compute is known (a `CONNECTED` transition), and this dedupes so repeats are
 * safe. Distinct from {@link PythonSetupDriftManager}, which measures compute
 * env-key drift; this measures whether the environment still exists at all.
 */
export class PythonSetupAdoptionManager {
    /** Project roots already reported this session, to emit at most once each. */
    private readonly reported = new Set<string>();

    constructor(private readonly deps: PythonSetupAdoptionDeps) {}

    /**
     * Read and emit the gauge for the active project if it is VPEX-active and
     * has not been reported yet this session. Wrapped so telemetry can never
     * throw into the caller (best-effort); the reported latch is set only after
     * a successful record, so a transient read failure retries next time rather
     * than silently swallowing the session's one reading.
     */
    report(): void {
        try {
            const root = this.deps.projectRoot();
            if (root === undefined || this.reported.has(root)) {
                return;
            }
            // Ambiguous attribution (multi-root workspace): the shared setupState
            // key may describe a different root, so a reading here could be a
            // spurious venvPresent=false. Suppress without latching.
            if (!this.deps.isAttributable()) {
                return;
            }
            // Not VPEX-active: no setup on record, so there is nothing to gauge.
            // Do NOT latch — a setup completing later this session should still
            // get reported on a subsequent call.
            if (!this.deps.isVpexActive()) {
                return;
            }
            this.deps.record({
                venvPresent: this.deps.venvExists(root),
                currentTargetType: this.deps.getTargetType(),
            });
            this.reported.add(root);
        } catch {
            // Measurement must never break the observed flow. A throw here (a
            // failed read, a telemetry error) is swallowed and, because the latch
            // was not set, retried on the next trigger.
        }
    }
}
