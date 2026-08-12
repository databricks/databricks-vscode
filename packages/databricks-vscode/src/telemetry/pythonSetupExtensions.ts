import {Events, Telemetry} from ".";
import {
    ComputeType,
    PrimaryManager,
    PythonSetupErrorCode,
    PythonSetupFailurePhase,
    PythonSetupMode,
    PythonSetupOutcome,
    PythonSetupRunTrigger,
} from "./constants";
import {PythonSetupWarning} from "../python-setup/models/PythonSetupResult";

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
     * Whether the project has no `pyproject.toml` yet, or `undefined` when the
     * signal would be misleading — for a pip/conda project the absence of a
     * `pyproject.toml` says nothing about greenfield-ness.
     */
    isGreenfield?: boolean;
    /**
     * Whether this is the first setup for the project this session or a re-run
     * over an environment already provisioned this session (session-scoped).
     * Same event, one enum dimension.
     */
    trigger: PythonSetupRunTrigger;
}

/** How a setup run ended, reduced to the categorical fields we report. */
export interface PythonSetupOutcomeReport {
    outcome: PythonSetupOutcome;
    failurePhase?: PythonSetupFailurePhase;
    errorCode?: PythonSetupErrorCode;
    envKey?: string;
    diskMutated?: boolean;
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
export type PythonSetupResultReporter = (
    report: PythonSetupOutcomeReport
) => void;

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
const ENV_KEY_PATTERNS = [
    /^serverless\/serverless-v\d+$/,
    /^dbr\/\d+\.\d+\.[A-Za-z0-9.-]{1,30}$/,
];

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
    return ENV_KEY_PATTERNS.some((p) => p.test(envKey))
        ? envKey
        : UNRECOGNISED_ENV_KEY;
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
 * - `W_USER_CONSTRAINT_CONFLICT` — a user dependency is provably disjoint from an
 *   env constraint.
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
    "W_USER_CONSTRAINT_CONFLICT",
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
function warningCodeCounts(
    warnings: PythonSetupWarning[]
): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const {code} of warnings) {
        const bucket = KNOWN_WARNING_CODES.has(code)
            ? code
            : UNRECOGNISED_WARNING_CODE;
        counts[bucket] = (counts[bucket] ?? 0) + 1;
    }
    return counts;
}

declare module "." {
    interface Telemetry {
        /**
         * Record the start of a uv-native Python environment setup run, and
         * return the reporter for its outcome.
         *
         * Emits PYTHON_ENV_SETUP_ATTEMPT immediately and returns a reporter for
         * PYTHON_ENV_SETUP_RESULT whose `duration` is measured from this call —
         * so the reported time covers the whole run as the user experiences it
         * (CLI spawn, provisioning, and interpreter adoption), not just the
         * CLI's internal pipeline. The CLI's own `durationMs` is deliberately
         * not used: it is documented as reserved and always 0.
         *
         * Returning the reporter (rather than exposing two independent record
         * methods) is what makes the attempt/result pairing structural: an
         * outcome cannot be reported without an attempt having been recorded.
         */
        recordPythonSetupAttempt(
            attempt: PythonSetupAttempt
        ): PythonSetupResultReporter;

        /**
         * Record that the setup CTA was a dead end: it was pressed with no
         * compute attached (or a serverless session with no chosen version), so
         * no run could start.
         *
         * Emits a lone PYTHON_ENV_SETUP_RESULT with `outcome: "no_compute"` and
         * no attempt, since no run was attempted. This is the one intentional
         * exception to the 1:1 pairing, and it exists because the alternative —
         * relying on `python_env.setup.detected` to cover early aborts — does not
         * work for this cohort: that event's `explicit_command` trigger fires
         * only from the *legacy* setup command, and the config view shows the
         * legacy checklist and the uv-native entry mutually exclusively.
         */
        recordPythonSetupNoCompute(): void;
    }
}

// Both payloads below name every field explicitly instead of spreading the
// caller's object. Spreading a *variable* switches off TypeScript's
// excess-property check, so any field later added to PythonSetupAttempt /
// PythonSetupOutcomeReport — or any wider object passed through this seam —
// would be emitted automatically, with objects JSON-stringified by
// recordEvent's addKeys. That would make this transport silently widen what is
// collected on a clean build. Enumerating the fields makes the event schema an
// allowlist the compiler enforces, which is what the privacy claim in this
// folder's README rests on. Optionals are spread individually so an absent one
// is omitted rather than serialized as the string "undefined".
Telemetry.prototype.recordPythonSetupAttempt = function (
    attempt: PythonSetupAttempt
): PythonSetupResultReporter {
    this.recordEvent(Events.PYTHON_ENV_SETUP_ATTEMPT, {
        packageManager: attempt.packageManager,
        targetType: attempt.targetType,
        mode: attempt.mode,
        trigger: attempt.trigger,
        ...(attempt.serverlessVersion !== undefined
            ? {serverlessVersion: attempt.serverlessVersion}
            : {}),
        ...(attempt.isGreenfield !== undefined
            ? {isGreenfield: attempt.isGreenfield}
            : {}),
    });

    // start() stamps the elapsed time onto the result event as `duration`.
    const reportResult = this.start(Events.PYTHON_ENV_SETUP_RESULT);
    // Enforce the 1:1 pairing rather than only documenting it: a second call
    // (from a future refactor that adds a terminal path without returning) is
    // dropped, so one attempt can never inflate into several results.
    let reported = false;
    return (report: PythonSetupOutcomeReport) => {
        if (reported) {
            return;
        }
        reported = true;
        reportResult({
            outcome: report.outcome,
            ...(report.failurePhase !== undefined
                ? {failurePhase: report.failurePhase}
                : {}),
            ...(report.errorCode !== undefined
                ? {errorCode: report.errorCode}
                : {}),
            ...(report.envKey !== undefined
                ? {envKey: categoricalEnvKey(report.envKey)}
                : {}),
            ...(report.diskMutated !== undefined
                ? {diskMutated: report.diskMutated}
                : {}),
            // A present `warnings` array means the CLI produced a result, so the
            // count is meaningful even at 0 (a clean merge) -- unlike the omitted
            // fields above, 0 is a value, not "unknown". The per-code histogram is
            // a categorical map JSON-stringified by recordEvent (objects go to
            // properties); it is omitted when empty so a no-warning run does not
            // carry a "{}" string.
            ...(report.warnings !== undefined
                ? {
                      warningsCount: report.warnings.length,
                      ...(report.warnings.length > 0
                          ? {
                                warningCodeCounts: warningCodeCounts(
                                    report.warnings
                                ),
                            }
                          : {}),
                  }
                : {}),
        });
    };
};

Telemetry.prototype.recordPythonSetupNoCompute = function () {
    // `duration` is deliberately omitted, not 0: nothing ran, and a zero would
    // drag the setup-time percentiles down. Recorded directly rather than via
    // start(), which always stamps an elapsed time.
    this.recordEvent(Events.PYTHON_ENV_SETUP_RESULT, {outcome: "no_compute"});
};
