/**
 * TypeScript view of the `databricks environments setup-local --output json`
 * contract. Field names, optionality, and the phase/error shapes mirror the
 * CLI's own Go structs in `libs/localenv/result.go` (schema version 1). The
 * golden fixtures in `./fixtures/setupLocalResults.ts` — captured verbatim from
 * the CLI acceptance suite — are the executable proof that this view matches.
 *
 * Only the fields the extension actually consumes are typed narrowly; the rest
 * are kept faithful to the contract so a future consumer has them available.
 */

/* eslint-disable @typescript-eslint/naming-convention */

/** Provisioning mode. `constraints-only` omits the databricks-connect dep. */
export type PythonSetupMode = "default" | "constraints-only";

/** Canonical execution phases, always reported in this order. */
export type PythonSetupPhaseName =
    | "preflight"
    | "resolve"
    | "fetch"
    | "merge"
    | "provision"
    | "validate";

/** Per-phase status in the `phases` array. */
export type PythonSetupPhaseStatus = "ok" | "error" | "pending";

/**
 * Stable failure-class identifiers surfaced in `error.code`. Matches the CLI's
 * ErrorCode set. `E_AUTH` / `E_PYTHON_POLICY` appear in the spec but are never
 * emitted by the CLI (auth is handled by the shared workspace-client preflight
 * before a result object is built), so they are intentionally absent here.
 */
export type PythonSetupErrorCode =
    | "E_USAGE"
    | "E_MANAGER_UNSUPPORTED"
    | "E_NOT_WRITABLE"
    | "E_UV_MISSING"
    | "E_NO_TARGET"
    | "E_RESOLVE"
    | "E_ENV_UNSUPPORTED"
    | "E_FETCH"
    | "E_WRITE"
    | "E_MERGE"
    | "E_PYTHON_INSTALL"
    | "E_PROVISION"
    | "E_VALIDATE";

export interface PythonSetupTargetInfo {
    source: string;
    clusterId?: string;
    serverlessVersion?: string;
    envKey: string;
}

export interface PythonSetupResolvedInfo {
    pythonVersion: string;
    /** Omitted (absent) in constraints-only mode. */
    dbconnectVersion?: string;
    artifactSource: "network" | "cache";
}

export interface PythonSetupPhaseEntry {
    phase: PythonSetupPhaseName;
    status: PythonSetupPhaseStatus;
}

export interface PythonSetupPlan {
    wouldWrite: string;
    wouldBackup?: string;
    wouldInstallPython?: string;
    diff: string;
}

export interface PythonSetupWarning {
    code: string;
    message: string;
}

export interface PythonSetupError {
    code: PythonSetupErrorCode;
    failurePhase: PythonSetupPhaseName;
    message: string;
    diskMutated: boolean;
}

/**
 * Root of the `--output json` object. `error` is always present as a key —
 * `null` on success, populated on failure. `phases` and `warnings` are always
 * arrays (never null). `plan` is present only under `--dry-run`; `venvPath` and
 * `backupPath` only on a real run.
 */
export interface PythonSetupResult {
    schemaVersion: number;
    command: string;
    ok: boolean;
    mode: PythonSetupMode;
    dryRun: boolean;
    target?: PythonSetupTargetInfo;
    resolved?: PythonSetupResolvedInfo;
    greenfield: boolean;
    plan?: PythonSetupPlan;
    venvPath?: string;
    backupPath?: string;
    phases: PythonSetupPhaseEntry[];
    warnings: PythonSetupWarning[];
    error: PythonSetupError | null;
    durationMs: number;
}

/* eslint-enable @typescript-eslint/naming-convention */

/** Thrown when the CLI stdout is not a parseable setup-local result object. */
export class PythonSetupParseError extends Error {}

/**
 * Parse the single JSON object the CLI prints to stdout under `--output json`.
 * Throws {@link PythonSetupParseError} when stdout is not valid JSON or is not a
 * result object (missing the required boolean `ok`). Validation is deliberately
 * minimal — enough to distinguish "a result" from "garbage/partial output" —
 * because the golden fixtures, not this function, police the full shape.
 */
export function parsePythonSetupResult(stdout: string): PythonSetupResult {
    let obj: unknown;
    try {
        obj = JSON.parse(stdout);
    } catch (e) {
        throw new PythonSetupParseError(
            `CLI did not return valid JSON: ${(e as Error).message}`
        );
    }
    if (
        typeof obj !== "object" ||
        obj === null ||
        typeof (obj as {ok?: unknown}).ok !== "boolean"
    ) {
        throw new PythonSetupParseError(
            "CLI JSON is not a setup-local result (missing boolean `ok`)"
        );
    }
    return obj as PythonSetupResult;
}

/** Whether a parsed result represents a successful run. */
export function isPythonSetupSuccess(r: PythonSetupResult): boolean {
    return r.ok === true;
}
