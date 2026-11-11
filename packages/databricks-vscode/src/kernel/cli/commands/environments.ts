import { z } from "zod";
import { CliError, type Cli, type CliCallContext } from "../Cli";

/*
 * `databricks environments setup-local --output json` (PYENV-02): matches a
 * local uv-managed `.venv` to a cluster or a serverless version. The schema
 * mirrors the CLI's `libs/localenv/result.go` (schema version 1), keeps
 * unknown fields (`looseObject`), and accepts `null` wherever the CLI prints
 * it for an absent value. Golden outputs from CLI 1.19.0 in
 * `fixtures/environments/` pin it, beside the old acceptance fixtures in
 * `features/python/setup/uv/fixtures/`.
 */

/** Stable failure classes in `error.code`. Unknown codes still parse (a newer CLI may add some). */
const SETUP_LOCAL_ERROR_CODES = [
    "E_USAGE",
    "E_MANAGER_UNSUPPORTED",
    "E_NOT_WRITABLE",
    "E_UV_MISSING",
    "E_NO_TARGET",
    "E_RESOLVE",
    "E_ENV_UNSUPPORTED",
    "E_FETCH",
    "E_WRITE",
    "E_MERGE",
    "E_PYTHON_INSTALL",
    "E_PROVISION",
    "E_PROVISION_CONFLICT",
    "E_VALIDATE",
] as const;
export type PythonSetupErrorCode = (typeof SETUP_LOCAL_ERROR_CODES)[number];

/** The canonical phases, always reported in this order. */
const SETUP_LOCAL_PHASES = [
    "preflight",
    "resolve",
    "fetch",
    "merge",
    "provision",
    "validate",
] as const;
export type PythonSetupPhaseName = (typeof SETUP_LOCAL_PHASES)[number];

/** `constraints-only` omits the databricks-connect dependency. */
export type PythonSetupMode = "default" | "constraints-only";
/** How the CLI got the interpreter it provisioned with. */
type PythonResolution = "uv_install_succeeded" | "installed_fallback";

/** `null` and a missing key both read as absent. */
const optional = <T extends z.ZodType>(schema: T) =>
    schema.nullish().transform((v) => v ?? undefined);

const compute = z.looseObject({
    source: z.string(),
    clusterId: optional(z.string()),
    serverlessVersion: optional(z.string()),
    envKey: z.string(),
});

const resolved = z.looseObject({
    pythonVersion: z.string(),
    /** Absent in constraints-only mode. */
    dbconnectVersion: optional(z.string()),
    artifactSource: z.string(),
});

const phase = z.looseObject({ phase: z.string(), status: z.string() });
const warning = z.looseObject({ code: z.string(), message: z.string() });

const setupError = z.looseObject({
    code: z.string(),
    failurePhase: z.string(),
    message: z.string(),
    diskMutated: z.boolean(),
});

const plan = z.looseObject({
    wouldWrite: z.string(),
    wouldBackup: optional(z.string()),
    wouldInstallPython: optional(z.string()),
    diff: z.string(),
});

/** The single object `setup-local` prints, on success and on failure. */
const setupLocalResult = z.looseObject({
    schemaVersion: z.number(),
    command: z.string(),
    ok: z.boolean(),
    mode: z.string(),
    dryRun: z.boolean(),
    pythonResolution: optional(z.string()),
    /** The compute it provisioned against (`target` before databricks/cli#6100). */
    compute: optional(compute),
    resolved: optional(resolved),
    greenfield: z.boolean(),
    /** Only under `--dry-run`. */
    plan: optional(plan),
    /**
     * Only for a real run. In slash form, relative to the working directory
     * (`.venv`, or `../../.venv` for a uv workspace member), or absolute when
     * `UV_PROJECT_ENVIRONMENT` is.
     */
    venvPath: optional(z.string()),
    /** The pre-merge `pyproject.toml`; only when there was one. */
    backupPath: optional(z.string()),
    /** Only for a uv workspace member: the absolute workspace root, whose `pyproject.toml` holds the pins. */
    uvWorkspaceRoot: optional(z.string()),
    /** The backup of the root `pyproject.toml`, when the run changed that file. */
    uvWorkspaceBackupPath: optional(z.string()),
    /** Always arrays, but a drifted CLI may drop them. */
    phases: optional(z.array(phase)).transform((v) => v ?? []),
    warnings: optional(z.array(warning)).transform((v) => v ?? []),
    /** Null on success. */
    error: setupError.nullish().transform((v) => v ?? null),
    durationMs: z.number(),
});

export interface PythonSetupComputeInfo {
    source: string;
    clusterId?: string;
    serverlessVersion?: string;
    envKey: string;
}

interface PythonSetupResolvedInfo {
    pythonVersion: string;
    /** Absent in constraints-only mode. */
    dbconnectVersion?: string;
    artifactSource: "network" | "cache";
}

interface PythonSetupPhaseEntry {
    phase: PythonSetupPhaseName;
    status: "ok" | "error" | "pending";
}

interface PythonSetupPlan {
    wouldWrite: string;
    wouldBackup?: string;
    wouldInstallPython?: string;
    diff: string;
}

export interface PythonSetupWarning {
    code: string;
    message: string;
}

interface PythonSetupError {
    code: PythonSetupErrorCode;
    failurePhase: PythonSetupPhaseName;
    message: string;
    diskMutated: boolean;
}

/**
 * The parsed result. The schema checks the shape; the closed vocabularies
 * (codes, phases, modes) are typed narrowly for the extension's own use, and
 * a value outside them still parses.
 */
export interface PythonSetupResult {
    schemaVersion: number;
    command: string;
    ok: boolean;
    mode: PythonSetupMode;
    dryRun: boolean;
    pythonResolution?: PythonResolution;
    compute?: PythonSetupComputeInfo;
    resolved?: PythonSetupResolvedInfo;
    greenfield: boolean;
    plan?: PythonSetupPlan;
    venvPath?: string;
    backupPath?: string;
    uvWorkspaceRoot?: string;
    uvWorkspaceBackupPath?: string;
    phases: PythonSetupPhaseEntry[];
    warnings: PythonSetupWarning[];
    /** Always present: null on success. */
    error: PythonSetupError | null;
    durationMs: number;
}

/** stdout wasn't a setup-local result. Its message carries the CLI's stderr, which explains why. */
export class SetupLocalParseError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "SetupLocalParseError";
    }
}

/** What to set up for, which steps to skip, and whether only to plan. */
export interface SetupLocalInvocation {
    /** `--dry-run`: resolve the compute and report its environment key without writing anything (drift detection). */
    readonly dryRun?: boolean;
    readonly compute:
        | { readonly kind: "cluster"; readonly clusterId: string }
        | { readonly kind: "serverless"; readonly version: string };
    /** `--no-constraints`: don't pin the remote Python version and dependencies. */
    readonly skipConstraints?: boolean;
    /** `--no-dbconnect`: don't add databricks-connect. */
    readonly skipDbconnect?: boolean;
    /** The hidden `--constraint-source-url`, for development only. */
    readonly constraintSourceUrl?: string;
}

/**
 * The arguments, in a fixed order: compute, skip flags, dry run, source,
 * output. No `--profile`: the connection reaches the CLI through `childEnv`,
 * as for bundle calls. The serverless version is the bare number ("5").
 */
export function setupLocalArgs(inv: SetupLocalInvocation): string[] {
    const args = ["environments", "setup-local"];
    if (inv.compute.kind === "cluster") {
        args.push("--cluster-id", inv.compute.clusterId);
    } else {
        args.push("--serverless-version", inv.compute.version);
    }
    if (inv.skipConstraints) {
        args.push("--no-constraints");
    }
    if (inv.skipDbconnect) {
        args.push("--no-dbconnect");
    }
    if (inv.dryRun) {
        args.push("--dry-run");
    }
    if (inv.constraintSourceUrl) {
        args.push("--constraint-source-url", inv.constraintSourceUrl);
    }
    args.push("--output", "json");
    return args;
}

/** Parses stdout. Throws `SetupLocalParseError` for anything but a result object. */
export function parseSetupLocalResult(stdout: string): PythonSetupResult {
    let json: unknown;
    try {
        json = JSON.parse(stdout);
    } catch (e) {
        throw new SetupLocalParseError(`CLI did not return valid JSON: ${(e as Error).message}`);
    }
    const parsed = setupLocalResult.safeParse(json);
    if (!parsed.success) {
        throw new SetupLocalParseError(
            `CLI JSON is not a setup-local result: ${z.prettifyError(parsed.error)}`,
        );
    }
    return parsed.data as unknown as PythonSetupResult;
}

/**
 * Runs `setup-local`. Resolves with the result whether it succeeded or not:
 * a failed setup exits non-zero and still prints its result, so callers
 * branch on `ok` and `error`. Throws `SetupLocalParseError` when there is no
 * result (an auth error printed before one was built, a crash), with stderr
 * appended, and `CancelledError` when aborted.
 */
export async function environmentsSetupLocal(
    cli: Cli,
    inv: SetupLocalInvocation,
    ctx: CliCallContext,
): Promise<PythonSetupResult> {
    let stdout: string;
    let stderr: string;
    try {
        ({ stdout, stderr } = await cli.exec(setupLocalArgs(inv), ctx));
    } catch (e) {
        if (!(e instanceof CliError)) {
            throw e;
        }
        ({ stdout, stderr } = e);
    }
    try {
        return parseSetupLocalResult(stdout);
    } catch (e) {
        const detail = stderr.trim();
        if (detail && e instanceof SetupLocalParseError) {
            e.message = `${e.message}\n${detail}`;
        }
        throw e;
    }
}
