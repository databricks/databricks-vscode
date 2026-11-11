import {
    durationComment,
    telemetryEvent,
    type DurationMeasurement,
} from "../../kernel/telemetry/definitions";
import type {
    PythonSetupErrorCode,
    PythonSetupMode,
    PythonSetupPhaseName,
} from "../../kernel/cli/commands/environments";
import type {
    InterpreterSource,
    PackageManager,
    PrimaryManager,
} from "./setup/packageManagerDetection";
import type { ReportedSetupMode } from "./setup/pythonSetupGate";
import type { SetupPreset } from "./setup/uv/pythonSetupPresetPicker";

export type { PythonSetupErrorCode, PythonSetupMode, SetupPreset };

/** The compute targeted at the time of detection. */
export type TargetCompute = "cluster" | "serverless" | "none";
/** What triggered a package-manager detection emission. */
export type SetupTrigger = "auto_open" | "explicit_command" | "run" | "debug";

/** The old `PYTHON_ENV_SETUP_DETECTED`, with its name, properties and comments. */
export const PYTHON_ENV_SETUP_DETECTED = telemetryEvent<{
    managersDetected: PackageManager[];
    primaryManager: PrimaryManager;
    signals: string[];
    pythonVersion?: string;
    interpreterSource: InterpreterSource;
    hasLockfile: boolean;
    targetCompute: TargetCompute;
    setupTrigger: SetupTrigger;
    setupMode: ReportedSetupMode;
}>(
    "python_env.setup.detected",
    "The Python package/environment manager(s) detected for a project at setup time. " +
        "Measurement only: emits categorical data to size the real distribution of " +
        "pip/conda/uv/poetry usage across users. Contains no paths, package names, or other PII.",
    {
        managersDetected: {
            comment: 'All package managers with at least one firing signal, e.g. ["uv","pip"]',
        },
        primaryManager: {
            comment: "Best-guess primary manager (uv > poetry > conda > pip), or unknown",
        },
        signals: {
            comment:
                'The closed-set signal identifiers that fired, e.g. ["uv.lock","pyproject.tool.uv"]',
        },
        pythonVersion: {
            comment: 'Detected interpreter version, major.minor only (e.g. "3.11"), if available',
        },
        interpreterSource: { comment: "How the active interpreter was provisioned" },
        hasLockfile: { comment: "Whether a uv.lock or poetry.lock was found" },
        targetCompute: { comment: "The compute targeted at detection time (no cluster IDs/names)" },
        setupTrigger: { comment: "Which setup touchpoint triggered detection" },
        setupMode: {
            comment:
                "The environment-setup flow in effect at this detection: uv (uv-native setup), " +
                "pip (legacy/non-uv flow; the exact manager is in primaryManager), or fallback-pip " +
                "(user opted out via databricks.python.environmentSetup=manual). The auto|manual " +
                "setting is recoverable: fallback-pip <=> manual, uv|pip <=> auto. Emitted per " +
                "(trigger, project) like the rest of this event, so measure prevalence by distinct " +
                "user (common.vscodemachineid), not raw event share",
        },
    },
);

/** The compute a setup run targets. */
export type ComputeType = "cluster" | "serverless";

/** Where the manual opt-out was written: `workspace` with a folder open, `global` without. */
export type PythonSetupOptOutScope = "workspace" | "global";
/** Where the manual opt-out was triggered: the E_FETCH failure's "Use manual setup" button, or the palette. */
export type PythonSetupOptOutSource = "error_popup" | "command_palette";

/**
 * The first setup for the project this session (`initial`), a re-run over an
 * environment provisioned this session (`rerun`), or the "Retry DB Connect
 * setup" recovery of a constraint conflict (`conflict_retry`).
 */
export type PythonSetupRunTrigger = "initial" | "rerun" | "conflict_retry";

/** How Python was acquired, and the user's recovery path. */
export type PythonSetupFlow =
    | "uv_install_succeeded"
    | "installed_fallback"
    | "manual_selection_requested"
    | "cancelled";

/**
 * How a setup run ended. `not_started`: the CLI produced no result.
 * `no_compute`: the CTA was pressed with nothing to set up for, so it is
 * reported without an attempt.
 */
export type PythonSetupOutcome = "ok" | "failed" | "cancelled" | "not_started" | "no_compute";

/** The CLI's six phases, plus the two extension-side steps after it exits: `adopt` and `persist`. */
export type PythonSetupFailurePhase = PythonSetupPhaseName | "adopt" | "persist";

/** What prompted a drift check. */
export type PythonSetupDriftTrigger = "computeChange" | "workspaceOpen" | "setupCompleted";

/** Whether Databricks Connect ran a file or debugged it. */
export type LaunchType = "run" | "debug";

export const PYTHON_ENV_MANUAL_SETUP_OPTOUT = telemetryEvent<{
    scope: PythonSetupOptOutScope;
    source: PythonSetupOptOutSource;
}>(
    "python_env.manual_setup.optout",
    "The user opted out of automated uv-native Python setup by switching " +
        "databricks.python.environmentSetup to manual, so an existing interpreter is used " +
        "as-is. Recorded only when the setting write succeeds. Categorical data only.",
    {
        scope: {
            comment:
                "Which configuration scope was written: workspace (a project folder is open) or " +
                "global (no folder; the fallback so the write still lands)",
        },
        source: {
            comment:
                "Where the opt-out was triggered: error_popup (the 'Use manual setup' button on the E_FETCH setup failure) or command_palette",
        },
    },
);

export const PYTHON_ENV_SETUP_ATTEMPT = telemetryEvent<{
    packageManager: PrimaryManager;
    targetType: ComputeType;
    serverlessVersion?: string;
    mode: PythonSetupMode;
    setupPreset: SetupPreset;
    isGreenfield?: boolean;
    trigger: PythonSetupRunTrigger;
}>(
    "python_env.setup.attempt",
    "A uv-native Python environment setup run is starting: emitted once the compute " +
        "target is known and immediately before the CLI is spawned, so every attempt has " +
        "exactly one matching python_env.setup.result. Categorical data only — no cluster " +
        "IDs/names, paths, or package names.",
    {
        trigger: {
            comment:
                "initial (first setup for the project this session), rerun (re-running over an " +
                "environment already provisioned this session, e.g. via the ready row's Re-run " +
                "button), or conflict_retry (a Full-preset run hit a cluster-vs-local dependency " +
                "conflict and the user clicked 'Retry DB Connect setup', which re-runs with " +
                "--no-constraints). conflict_retry counts conflict-recovery runs that started " +
                "(a click whose pre-retry pyproject.toml restore fails, coalesces, or no-ops " +
                "records none); pair it with the matching result's outcome for the recovery " +
                "success rate. Session-scoped: a " +
                "run after a window reload reads as initial again",
        },
        packageManager: {
            comment:
                "The package manager detected for the project (uv > poetry > conda > pip), or unknown",
        },
        targetType: { comment: "Whether the environment targets a cluster or serverless" },
        serverlessVersion: {
            comment: 'The chosen serverless environment version (e.g. "5"); omitted for clusters',
        },
        mode: {
            comment:
                "Whether databricks-connect is included (default) or only the runtime constraints (constraints-only)",
        },
        setupPreset: {
            comment:
                "The preset tier the user picked: full (matching Python + Databricks Connect + " +
                "pinned cluster dependencies), dbconnect (matching Python + Databricks Connect, " +
                "no pins), or python (matching Python only). Disambiguates the two orthogonal " +
                "skip axes that the two-value mode field cannot: a dbconnect run skips the pins " +
                "yet reports mode=default",
        },
        isGreenfield: {
            comment:
                "Whether the project has no pyproject.toml yet. Omitted unless the project is " +
                "uv-suitable (the same predicate that gates the setup entry): for a project " +
                "driven by poetry/conda or a real pip workflow the absence of a pyproject.toml " +
                "says nothing about greenfield-ness, so the signal would be misleading. Note a " +
                "packaging-shaped pyproject.toml is attributed to pip yet is still reported on, " +
                "so this is NOT equivalent to packageManager being uv or unknown",
        },
    },
);

export const PYTHON_ENV_SETUP_RESULT = telemetryEvent<{
    outcome: PythonSetupOutcome;
    setupPreset?: SetupPreset;
    pythonSetupFlow?: PythonSetupFlow;
    failurePhase?: PythonSetupFailurePhase;
    errorCode?: PythonSetupErrorCode;
    envKey?: string;
    diskMutated?: boolean;
    indexUnreachable?: boolean;
    reportOffered?: boolean;
    warningsCount?: number;
    // A code->count histogram, not a list. Keys are a closed set (the CLI's
    // W_* codes, or "other"), never the messages, which name packages.
    warningCodeCounts?: Record<string, number>;
    // Optional: `no_compute` is reported without a run, and a 0 would drag
    // the setup-time percentiles down.
    duration?: number;
}>(
    "python_env.setup.result",
    "The outcome of a uv-native Python environment setup run. Pairs 1:1 with a preceding " +
        "python_env.setup.attempt, except for outcome=no_compute, which is reported on its own " +
        "when the user pressed the CTA with nothing attached to set up for. The failure phase " +
        "localises where the funnel breaks without requiring funnel tracking. Categorical data only.",
    {
        outcome: {
            comment:
                "ok | failed | cancelled (user aborted) | not_started (the CLI produced no result) | no_compute (the CTA was a dead end: nothing was attached to set up for)",
        },
        setupPreset: {
            comment:
                "The preset tier the user picked (full / dbconnect / python), mirrored from the " +
                "matching attempt so provision errors and outcomes can be split by setup mode " +
                "without joining to python_env.setup.attempt. Present on every result except " +
                "no_compute, which is emitted without a preceding attempt. See the attempt " +
                "event's setupPreset for the tier semantics",
        },
        pythonSetupFlow: {
            comment:
                "Whether uv downloaded Python, an installed compatible Python was used, " +
                "manual interpreter selection was requested, or the operation was cancelled. " +
                "Categorical only; never contains an interpreter path or version",
        },
        failurePhase: {
            comment:
                "Which phase broke: the CLI's preflight/resolve/fetch/merge/provision/validate, " +
                'or the extension-side "adopt" (venv provisioned but not selectable as the ' +
                'interpreter) / "persist" (state bookkeeping failed). Omitted unless the ' +
                "outcome is failed",
        },
        errorCode: {
            comment:
                "The CLI's stable failure-class code (E_*). Omitted when the CLI reported no error object",
        },
        envKey: {
            comment:
                'The resolved environment key (e.g. "dbr/15.4.x-scala2.12", ' +
                '"serverless/serverless-v5") — a runtime coordinate, never a cluster ID or name. ' +
                'Constrained to those two shapes before emission; anything else becomes "other". ' +
                "Omitted when the run failed before resolving one",
        },
        diskMutated: {
            comment:
                "Whether the failed run had already modified project files. Omitted when the CLI reported no error object",
        },
        indexUnreachable: {
            comment:
                "Whether the failure was uv being unable to reach the package index (a blocked pypi.org " +
                "needing a proxy) rather than a dependency conflict — both arrive as E_PROVISION. Present " +
                "on every CLI setup failure, so false is meaningful (a non-index failure, the rate's " +
                "denominator); omitted with no CLI result and on post-CLI adopt/persist failures",
        },
        reportOffered: {
            comment:
                'Whether the failure surfaced a "Report this problem" affordance — a deep-link to file a ' +
                "pre-filled issue against databricks/environments (constraint-content defect) or " +
                "databricks/databricks-vscode (extension/CLI defect). Present on every failure outcome " +
                "(failed / not_started): true when a report was offered, false otherwise (including the " +
                "preflight/local/network codes that are never report-worthy — false is the offer rate's " +
                "denominator). Omitted for non-failure outcomes; filter by failurePhase for the " +
                "post-preflight population",
        },
        warningsCount: {
            comment:
                "How many merge-phase advisories the CLI emitted (env-owned pins conflicting with the " +
                "user's existing project) — a proxy for merge quality. 0 is a real value (a clean " +
                "merge); omitted only when the CLI produced no result at all (cancelled/not_started/no_compute)",
        },
        warningCodeCounts: {
            comment:
                "Per-code histogram of the merge warnings (e.g. W_DBCONNECT_PIN_DUPLICATED: 1), so a " +
                "consumer sees which conflicts occurred, not just how many. Codes are a closed set; any " +
                'unrecognised code collapses to "other". Omitted when there were no warnings. Categorical ' +
                "counts only — never the human-readable warning messages",
        },
        // Measured around the whole run, including spawn and adoption; the
        // CLI's own `durationMs` is reserved and always 0.
        ...durationComment,
    },
);

export const PYTHON_ENV_DRIFT = telemetryEvent<{
    trigger: PythonSetupDriftTrigger;
    fromEnvKey: string;
    toEnvKey: string;
}>(
    "python_env.drift",
    "Emitted when the selected compute's environment key no longer matches the one the " +
        "local .venv was provisioned against (from databricks.pythonSetup.setupState). Reported " +
        "once per newly-detected distinct mismatch, not on every trigger. Categorical data only.",
    {
        trigger: {
            comment: "What prompted the check: computeChange | workspaceOpen | setupCompleted",
        },
        fromEnvKey: {
            comment:
                'The recorded environment key (e.g. "serverless/serverless-v4", ' +
                '"dbr/15.4.x-scala2.12"). Constrained to those shapes before emission; anything ' +
                'else becomes "other". Never a cluster id or name',
        },
        toEnvKey: {
            comment:
                'The environment key the currently selected compute resolves to, same closed vocabulary as fromEnvKey (else "other")',
        },
    },
);

export const PYTHON_ENV_ADOPTION = telemetryEvent<{
    venvPresent: boolean;
    currentTargetType: TargetCompute;
}>(
    "python_env.adoption",
    "A once-per-session adoption gauge for a project that has a uv-native Python setup on " +
        "record (databricks.pythonSetup.setupState is present). Emitted only in that case, so " +
        "its mere presence is a per-session denominator of VPEX-managed projects; it then " +
        "reports whether the managed environment is still in place. Distinct from " +
        "python_env.drift, which compares compute env keys — this reports whether the .venv " +
        "still physically exists, which drift never checks. Categorical/boolean data only.",
    {
        venvPresent: {
            comment:
                "Whether the project's managed .venv interpreter still exists on disk. False means " +
                "the environment was provisioned once but is now gone (deleted or never restored)",
        },
        currentTargetType: {
            comment:
                "The compute kind attached when the session check ran (cluster | serverless | none), so adoption can be sliced by compute. No cluster IDs or names",
        },
    },
);

/** How a checklist install of Databricks Connect ended. */
export type DbConnectInstallOutcome = "ok" | "failed";

/** The old `PYTHON_ENV_DBCONNECT_INSTALL`, with its name, properties and comments. */
export const PYTHON_ENV_DBCONNECT_INSTALL = telemetryEvent<
    { outcome: DbConnectInstallOutcome } & DurationMeasurement
>(
    "python_env.dbconnect_install",
    "The outcome of a legacy (pre-VPEX) databricks-connect install run — the old " +
        "environment-setup flow driven by EnvironmentDependenciesInstaller.install(). Its own " +
        "event (not python_env.setup.result) so the legacy and uv-native flows stay cleanly " +
        "separable in analysis. Categorical/numeric data only — no versions, paths, or names.",
    {
        outcome: {
            comment:
                "ok if the databricks-connect (and nbformat) install completed, failed if it threw",
        },
        // Measured around the install itself, so it is the pip work only: it
        // excludes the prompts (interpreter, version) answered before it runs.
        ...durationComment,
    },
);

/** The old `DBCONNECT_RUN`, with its comments. */
export const DBCONNECT_RUN = telemetryEvent<{ launchType: LaunchType; computeType: ComputeType }>(
    "dbconnectRun",
    "A Databricks Connect debug run",
    {
        launchType: { comment: "Whether the file was run or debugged" },
        computeType: { comment: "The type of the compute" },
    },
);

export const PYTHON_EVENTS = [
    PYTHON_ENV_SETUP_DETECTED,
    PYTHON_ENV_MANUAL_SETUP_OPTOUT,
    PYTHON_ENV_SETUP_ATTEMPT,
    PYTHON_ENV_SETUP_RESULT,
    PYTHON_ENV_DRIFT,
    PYTHON_ENV_ADOPTION,
    PYTHON_ENV_DBCONNECT_INSTALL,
    DBCONNECT_RUN,
];
