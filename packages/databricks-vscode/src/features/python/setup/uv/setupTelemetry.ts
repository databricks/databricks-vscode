import type { TelemetryRecorder } from "../../../../kernel/telemetry";
import type { PrimaryManager } from "../packageManagerDetection";
import {
    PYTHON_ENV_ADOPTION,
    PYTHON_ENV_DRIFT,
    PYTHON_ENV_MANUAL_SETUP_OPTOUT,
    PYTHON_ENV_SETUP_ATTEMPT,
    PYTHON_ENV_SETUP_RESULT,
    type ComputeType,
    type PythonSetupDriftTrigger,
    type PythonSetupErrorCode,
    type PythonSetupFailurePhase,
    type PythonSetupFlow,
    type PythonSetupMode,
    type PythonSetupOptOutScope,
    type PythonSetupOptOutSource,
    type PythonSetupOutcome,
    type PythonSetupRunTrigger,
    type SetupPreset,
    type TargetCompute,
} from "../../telemetry";
import type { PythonSetupWarning } from "./result";

/*
 * The uv flow's telemetry, ported from the old `pythonSetupExtensions.ts`.
 * The old module patched these onto `Telemetry.prototype`; here they are
 * functions over the feature's recorder.
 */

/**
 * What a starting setup run is about to do. Everything here is known before the
 * CLI is spawned: the project's package manager (from the visibility gate's
 * detection), the compute target, and the provisioning mode.
 */
export interface PythonSetupAttempt {
    packageManager: PrimaryManager;
    targetType: ComputeType;
    /** The chosen serverless environment version; absent for clusters. */
    serverlessVersion?: string;
    mode: PythonSetupMode;
    /**
     * The preset tier the user picked (full | dbconnect | python). Kept
     * alongside {@link mode} because the two-value mode field cannot represent
     * the orthogonal skip axes the picker enables: a `dbconnect` run skips the
     * pins yet still reports `mode: "default"`.
     */
    setupPreset: SetupPreset;
    /**
     * Whether the project has no `pyproject.toml` yet, or `undefined` when the
     * signal would be misleading — for a pip/conda project the absence of a
     * `pyproject.toml` says nothing about greenfield-ness.
     */
    isGreenfield?: boolean;
    /**
     * Whether this is the first setup for the project this session (`initial`), a
     * re-run over an environment already provisioned this session (`rerun`), or a
     * constraint-conflict recovery — the `Retry DB Connect setup` click on a
     * failed Full-preset run (`conflict_retry`). Session-scoped; same event, one
     * enum dimension.
     */
    trigger: PythonSetupRunTrigger;
}

/** A detected drift, reduced to the categorical fields we report. */
export interface PythonSetupDrift {
    trigger: PythonSetupDriftTrigger;
    /** The recorded environment key the .venv was provisioned against. */
    fromEnvKey: string;
    /** The environment key the currently selected compute resolves to. */
    toEnvKey: string;
}

/**
 * A once-per-session adoption reading for a project with a Python setup on
 * record: whether the managed environment is still in place, and the compute
 * kind attached when the reading was taken. Both categorical/boolean.
 */
export interface PythonSetupAdoption {
    /** Whether the project's managed `.venv` interpreter still exists on disk. */
    venvPresent: boolean;
    /** The compute kind attached at the time of the reading. */
    currentTargetType: TargetCompute;
}

/** How a setup run ended, reduced to the categorical fields we report. */
export interface PythonSetupOutcomeReport {
    outcome: PythonSetupOutcome;
    pythonSetupFlow?: PythonSetupFlow;
    failurePhase?: PythonSetupFailurePhase;
    errorCode?: PythonSetupErrorCode;
    envKey?: string;
    diskMutated?: boolean;
    /**
     * Blocked package index vs. a genuine dependency conflict — both arrive as
     * `E_PROVISION`, so this splits them to gauge how often proxies bite. Set on
     * every CLI setup failure (`false` is meaningful — the rate's denominator);
     * omitted with no CLI result and on post-CLI adopt/persist failures.
     */
    indexUnreachable?: boolean;
    /**
     * Whether a "Report this problem" affordance was surfaced for this failure.
     * Present on every failure outcome (`failed` / `not_started`): `true` when a
     * report was offered (a post-preflight defect), `false` otherwise (including
     * the never-report-worthy preflight/local/network codes — `false` is the
     * offer rate's denominator). Omitted for non-failure outcomes. Filter by
     * `failurePhase` to isolate the post-preflight population.
     */
    reportOffered?: boolean;
    /**
     * The CLI's merge-phase warnings, verbatim from the result. Present whenever
     * the CLI produced a result (so `[]` reads as "a run happened with no
     * warnings"); absent when no result exists (cancelled / not_started /
     * no_compute). Passed raw — the count and the categorical per-code histogram
     * are derived at emission (see {@link warningCodeCounts}), the same split as
     * {@link categoricalEnvKey}.
     */
    warnings?: PythonSetupWarning[];
}

/** Reports the outcome of the run whose attempt returned it. */
export type PythonSetupResultReporter = (report: PythonSetupOutcomeReport) => void;

/**
 * The env-key shapes the CLI produces: `serverless/serverless-v<N>` and
 * `dbr/<sparkVersion>` (see `EnvKeyForServerless` / `EnvKeyForSparkVersion`).
 *
 * The DBR arm matches the Spark-version grammar (`15.4.x-scala2.12`,
 * `14.3.x-photon-scala2.12`) rather than "alphanumerics and punctuation": the
 * looser form would admit a cluster *name*, which is user-chosen and routinely
 * contains a person's name (`dbr/janes-dev-cluster` would have passed). The
 * leading `<major>.<minor>.` requirement and the length bound are what keep this
 * a closed vocabulary.
 */
const ENV_KEY_PATTERNS = [/^serverless\/serverless-v\d+$/, /^dbr\/\d+\.\d+\.[A-Za-z0-9.-]{1,30}$/];

/**
 * Reported in place of an env key that does not match a known shape.
 */
const UNRECOGNISED_ENV_KEY = "other";

/**
 * Constrain `envKey` to the CLI's documented shapes before it is emitted.
 *
 * The key is copied from CLI JSON that {@link parsePythonSetupResult}
 * deliberately validates only minimally, and the DBR arm is a raw
 * `"dbr/" + sparkVersion` concatenation. Without this, schema drift or an
 * unexpected runtime string would put unbounded — potentially identifying —
 * high-cardinality content into a field documented as a closed vocabulary.
 * Anything unrecognised collapses to {@link UNRECOGNISED_ENV_KEY}, which keeps
 * the dimension categorical while still flagging that drift happened.
 */
function categoricalEnvKey(envKey: string | undefined): string | undefined {
    if (envKey === undefined) {
        return undefined;
    }
    return ENV_KEY_PATTERNS.some((p) => p.test(envKey)) ? envKey : UNRECOGNISED_ENV_KEY;
}

/**
 * The CLI's closed set of merge-phase warning codes (see `libs/localenv/result.go`).
 * All are emitted from the merge phase, where an existing project's pins can
 * conflict with the environment's managed pins:
 *
 * - `W_REQUIRES_PYTHON_OVERRIDDEN` — the user's `requires-python` is replaced.
 * - `W_DBCONNECT_PIN_OVERRIDDEN` — the user's databricks-connect pin is replaced.
 * - `W_DBCONNECT_PIN_DUPLICATED` — a retained databricks-connect pin now sits
 *   alongside the managed one, with no version satisfying both (needs a manual fix).
 * - `W_DBCONNECT_CONSOLIDATED` — a conflicting databricks-connect pin outside the
 *   managed dev group (in `[project].dependencies`, an optional-dependency extra, or
 *   another dependency group) was removed so a single managed pin survives.
 * - `W_USER_CONSTRAINT_CONFLICT` — a user dependency is provably disjoint from an
 *   env constraint.
 * - `W_UV_WORKSPACE_CONSTRAINTS_REPLACED` — for a uv workspace member, the pins
 *   in the root pyproject.toml, which every member shares, are replaced.
 *
 * Held as a set so an unknown code (schema drift, or a code added CLI-side before
 * this list is updated) collapses to {@link UNRECOGNISED_WARNING_CODE} rather than
 * silently minting a new histogram bucket -- the same closed-vocabulary discipline
 * {@link categoricalEnvKey} applies to the env key.
 */
const KNOWN_WARNING_CODES: ReadonlySet<string> = new Set([
    "W_REQUIRES_PYTHON_OVERRIDDEN",
    "W_DBCONNECT_PIN_OVERRIDDEN",
    "W_DBCONNECT_PIN_DUPLICATED",
    "W_DBCONNECT_CONSOLIDATED",
    "W_USER_CONSTRAINT_CONFLICT",
    "W_UV_WORKSPACE_CONSTRAINTS_REPLACED",
]);

/** Bucket for a warning code outside {@link KNOWN_WARNING_CODES}. */
const UNRECOGNISED_WARNING_CODE = "other";

/**
 * Reduce the CLI's warnings to a per-code count, collapsing unknown codes to
 * `other`. The result is a bounded, categorical histogram (at most one bucket per
 * known code, plus `other`) — never the free-form warning messages, which carry
 * package names and version specifiers. Returns an empty object for no warnings,
 * so the caller can decide whether to emit the field at all.
 */
function warningCodeCounts(warnings: PythonSetupWarning[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const { code } of warnings) {
        const bucket = KNOWN_WARNING_CODES.has(code) ? code : UNRECOGNISED_WARNING_CODE;
        counts[bucket] = (counts[bucket] ?? 0) + 1;
    }
    return counts;
}

/** A manual-setup opt-out, reduced to the categorical fields we report. */
export interface ManualSetupOptOut {
    scope: PythonSetupOptOutScope;
    source: PythonSetupOptOutSource;
}

type Recorder = Pick<TelemetryRecorder, "record">;

// The payloads below name every field instead of spreading the caller's
// object: a spread would switch off the excess-property check, so any field
// later added to an input would be collected silently. Optionals are spread
// one by one, so an absent one is omitted.

/**
 * Records the start of a setup run, and returns the reporter for its outcome.
 * The result's `duration` is measured from this call, so it covers the whole
 * wait the user sees. A second report is dropped, so one attempt never has
 * two results.
 */
export function recordPythonSetupAttempt(
    telemetry: Recorder,
    attempt: PythonSetupAttempt,
    now: () => number = () => performance.now(),
): PythonSetupResultReporter {
    telemetry.record(PYTHON_ENV_SETUP_ATTEMPT, {
        packageManager: attempt.packageManager,
        targetType: attempt.targetType,
        mode: attempt.mode,
        setupPreset: attempt.setupPreset,
        trigger: attempt.trigger,
        ...(attempt.serverlessVersion !== undefined
            ? { serverlessVersion: attempt.serverlessVersion }
            : {}),
        ...(attempt.isGreenfield !== undefined ? { isGreenfield: attempt.isGreenfield } : {}),
    });
    const started = now();
    let reported = false;
    return (report: PythonSetupOutcomeReport) => {
        if (reported) {
            return;
        }
        reported = true;
        telemetry.record(PYTHON_ENV_SETUP_RESULT, {
            outcome: report.outcome,
            // Also on the result, so outcomes split by preset without a join.
            setupPreset: attempt.setupPreset,
            ...(report.pythonSetupFlow !== undefined
                ? { pythonSetupFlow: report.pythonSetupFlow }
                : {}),
            ...(report.failurePhase !== undefined ? { failurePhase: report.failurePhase } : {}),
            ...(report.errorCode !== undefined ? { errorCode: report.errorCode } : {}),
            ...(report.envKey !== undefined ? { envKey: categoricalEnvKey(report.envKey) } : {}),
            ...(report.diskMutated !== undefined ? { diskMutated: report.diskMutated } : {}),
            ...(report.indexUnreachable !== undefined
                ? { indexUnreachable: report.indexUnreachable }
                : {}),
            ...(report.reportOffered !== undefined ? { reportOffered: report.reportOffered } : {}),
            // A present `warnings` means the CLI produced a result, so 0 is a value.
            ...(report.warnings !== undefined
                ? {
                      warningsCount: report.warnings.length,
                      ...(report.warnings.length > 0
                          ? { warningCodeCounts: warningCodeCounts(report.warnings) }
                          : {}),
                  }
                : {}),
            duration: now() - started,
        });
    };
}

/**
 * Records that the CTA was a dead end: nothing was attached to set up for.
 * No attempt precedes it, and no `duration`: nothing ran.
 */
export function recordPythonSetupNoCompute(telemetry: Recorder): void {
    telemetry.record(PYTHON_ENV_SETUP_RESULT, { outcome: "no_compute" });
}

/** Records a newly detected drift, with both keys in the closed vocabulary. */
export function recordPythonSetupDrift(telemetry: Recorder, report: PythonSetupDrift): void {
    telemetry.record(PYTHON_ENV_DRIFT, {
        trigger: report.trigger,
        fromEnvKey: categoricalEnvKey(report.fromEnvKey)!,
        toEnvKey: categoricalEnvKey(report.toEnvKey)!,
    });
}

/** Records the once-per-session adoption gauge. */
export function recordPythonSetupAdoption(telemetry: Recorder, report: PythonSetupAdoption): void {
    telemetry.record(PYTHON_ENV_ADOPTION, {
        venvPresent: report.venvPresent,
        currentTargetType: report.currentTargetType,
    });
}

/** Records a genuine auto -> manual opt-out. */
export function recordManualSetupOptOut(telemetry: Recorder, report: ManualSetupOptOut): void {
    telemetry.record(PYTHON_ENV_MANUAL_SETUP_OPTOUT, {
        scope: report.scope,
        source: report.source,
    });
}
