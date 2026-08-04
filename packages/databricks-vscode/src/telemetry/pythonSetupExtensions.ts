import {Events, Telemetry} from ".";
import {
    ComputeType,
    PrimaryManager,
    PythonSetupErrorCode,
    PythonSetupFailurePhase,
    PythonSetupMode,
    PythonSetupOutcome,
} from "./constants";

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
}

/** How a setup run ended, reduced to the categorical fields we report. */
export interface PythonSetupOutcomeReport {
    outcome: PythonSetupOutcome;
    failurePhase?: PythonSetupFailurePhase;
    errorCode?: PythonSetupErrorCode;
    envKey?: string;
    diskMutated?: boolean;
}

/** Reports the outcome of the run whose attempt returned it. */
export type PythonSetupResultReporter = (
    report: PythonSetupOutcomeReport
) => void;

/**
 * Drop keys whose value is `undefined`.
 *
 * `recordEvent` stringifies an explicit `undefined` to the literal "undefined",
 * so passing an absent optional through would pollute the event schema with a
 * bogus value. Callers build reports straight from optional chaining
 * (`result.error?.code`), so the filtering belongs here rather than at every
 * call site.
 */
function withoutUndefined<T extends object>(source: T): Partial<T> {
    return Object.fromEntries(
        Object.entries(source).filter(([, v]) => v !== undefined)
    ) as Partial<T>;
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
    }
}

Telemetry.prototype.recordPythonSetupAttempt = function (
    attempt: PythonSetupAttempt
): PythonSetupResultReporter {
    this.recordEvent(Events.PYTHON_ENV_SETUP_ATTEMPT, {
        ...withoutUndefined(attempt),
        // Re-assert the required fields: withoutUndefined widens everything to
        // optional, and the event schema requires these three.
        packageManager: attempt.packageManager,
        targetType: attempt.targetType,
        mode: attempt.mode,
    });

    // start() stamps the elapsed time onto the result event as `duration`.
    const reportResult = this.start(Events.PYTHON_ENV_SETUP_RESULT);
    return (report: PythonSetupOutcomeReport) =>
        reportResult({
            ...withoutUndefined(report),
            outcome: report.outcome,
        });
};
