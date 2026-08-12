import {AuthType} from "@databricks/sdk-experimental";
/** The production application insights instrumentation key for Databricks. */
export const PROD_APP_INSIGHTS_CONFIGURATION_KEY =
    "ebe191c5-f06b-4189-b68c-34fb5fbdb3f0";
/** The application insights instrumentation key used while developing on the VS Code extension */
export const DEV_APP_INSIGHTS_CONFIGURATION_KEY =
    "257d1561-5005-4a76-a3a8-7955df129e86";

/** The list of all events which can be monitored. */
/* eslint-disable @typescript-eslint/naming-convention */
export enum Events {
    COMMAND_EXECUTION = "commandExecution",
    EXTENSION_ACTIVATION = "extensionActivation",
    EXTENSION_INITIALIZATION = "extensionInitialization",
    AUTO_LOGIN = "autoLogin",
    MANUAL_LOGIN = "manualLogin",
    AUTO_MIGRATION = "autoMigration",
    MANUAL_MIGRATION = "manualMigration",
    BUNDLE_RUN = "bundleRun",
    BUNDLE_INIT = "bundleInit",
    BUNDLE_SUB_PROJECTS = "bundleSubProjects",
    CONNECTION_STATE_CHANGED = "connectionStateChanged",
    COMPUTE_SELECTED = "computeSelected",
    WORKFLOW_RUN = "workflowRun",
    DBCONNECT_RUN = "dbconnectRun",
    OPEN_RESOURCE_EXTERNALLY = "openResourceExternally",
    PYTHON_ENV_SETUP_DETECTED = "python_env.setup.detected",
    PYTHON_ENV_SETUP_ATTEMPT = "python_env.setup.attempt",
    PYTHON_ENV_SETUP_RESULT = "python_env.setup.result",
    AITOOLS_INSTALL = "aitoolsInstall",
    AITOOLS_UPDATE = "aitoolsUpdate",
    AITOOLS_UNINSTALL = "aitoolsUninstall",
    AITOOLS_CURSOR_PLUGIN_PROMPT = "aitoolsCursorPluginPrompt",
}
/* eslint-enable @typescript-eslint/naming-convention */

export type AutoLoginSource = "init" | "hostChange" | "targetChange";
export type ManualLoginSource =
    | "authTypeSwitch"
    | "authTypeLogin"
    | "command"
    | "api";
export type BundleRunResourceType = "pipelines" | "jobs";
export type BundleRunType =
    | "run"
    | "validate"
    | "partial-refresh"
    | "manual-input";
export type WorkflowTaskType = "python" | "notebook" | "unknown";
export type LaunchType = "run" | "debug";
export type ComputeType = "cluster" | "serverless";
export type AiToolsScope = "project" | "global";

/**
 * Where an AI tools install was triggered from: the first-load init modal prompt
 * or the manual affordance in the configuration side pane.
 */
export type AiToolsInstallSource = "initModal" | "sidePane";

/**
 * Where the Cursor plugin prompt was triggered from: as part of an install flow
 * ('initModal' / 'sidePane', matching {@link AiToolsInstallSource}), or the
 * standalone "add Databricks plugin to Cursor" button on the AI tools row
 * ('pluginButton').
 */
export type AiToolsCursorPluginSource = AiToolsInstallSource | "pluginButton";

/**
 * Outcome of an AI tools install:
 *  - `'success'` — the install ran and completed without error.
 *  - `'error'` — the install ran and failed.
 *  - `'possible-success'` — the user completed the flow but the actual install
 *    is not observable by the extension, so we can't confirm it landed. Today
 *    this is the Cursor-plugin-only case: the plugin is added via Cursor's
 *    marketplace modal (see {@link AiToolsManager.addCursorPlugin}), which we
 *    can open but can't verify the user acted on. Tracked separately so it
 *    doesn't inflate the confirmed `'success'` count.
 */
export type AiToolsInstallResult = "success" | "error" | "possible-success";

// Package-manager / interpreter unions are owned by the pure detection module
// (the single source of truth) and re-exported here so the event schema and the
// classifier can never drift apart. The detection module has no runtime imports,
// so this is a type-only dependency with no cycle.
import type {
    PackageManager,
    PrimaryManager,
    InterpreterSource,
} from "../language/packageManagerDetection";
export type {PackageManager, PrimaryManager, InterpreterSource};

/** The compute targeted at the time of detection. */
export type TargetCompute = ComputeType | "none";
/** What triggered a package-manager detection emission. */
export type SetupTrigger = "auto_open" | "explicit_command" | "run" | "debug";

/**
 * Whether a setup run is the first for the project *this session* (`initial`)
 * or a re-run over an environment already provisioned this session (`rerun`,
 * e.g. the "Re-run Python setup" button on the ready row). Derived from the
 * session-scoped ready state, so a run after a window reload reads as `initial`
 * again. One event, one enum dimension — so re-runs stay analysable without
 * fingerprinting on the command id.
 */
export type PythonSetupRunTrigger = "initial" | "rerun";

// The uv-native ("VPEX") python-setup flow mirrors the CLI's `environments
// setup-local --output json` contract, so the setup event unions are owned by
// the result model (the TypeScript view of that contract) and re-exported here.
// Type-only, so the event schema can never drift from the wire shape it
// describes.
import type {
    PythonSetupMode,
    PythonSetupPhaseName,
    PythonSetupErrorCode,
} from "../python-setup/models/PythonSetupResult";
export type {PythonSetupMode, PythonSetupErrorCode};

/**
 * How a setup run ended.
 *
 * `not_started` is distinct from `failed`: the CLI never produced a result
 * (spawn/parse error), so no phase or error code exists to attribute. And
 * `cancelled` is distinct from both — a user abandoning a slow setup is the
 * signal that the provisioning time is unacceptable, not that it broke.
 *
 * `no_compute` is the pre-flight dead end: the user pressed the CTA with no
 * cluster attached (or a serverless session with no chosen version), so nothing
 * could run. It is reported without a preceding attempt — see
 * {@link Telemetry.recordPythonSetupNoCompute} — because measuring how often the
 * button is a dead end is the whole point of tracking it.
 */
export type PythonSetupOutcome =
    | "ok"
    | "failed"
    | "cancelled"
    | "not_started"
    | "no_compute";

/**
 * Where a failed setup broke: the CLI's six canonical phases, plus the two
 * extension-side steps that run after the CLI has already exited ok (so its own
 * `phases` array cannot describe them).
 *
 * - `adopt` — pointing the MS Python extension at the provisioned venv.
 *   Adoption is the point of the flow: an unselected venv is unusable from the
 *   editor, so failing here is a setup failure.
 * - `persist` — recording the drift-detection baseline and readiness. The
 *   environment works, but the extension's own state did not stick.
 */
export type PythonSetupFailurePhase =
    | PythonSetupPhaseName
    | "adopt"
    | "persist";

/** Documentation about all of the properties and metrics of the event. */
type EventDescription<T> = {[K in keyof T]?: {comment?: string}};

/**
 * The type of an event definition.
 *
 * The type parameter describes the set of properties and metrics which are expected when recording this
 * event. Values inhabiting this type are documentation about the event and its parameters: comments
 * explaining the event being collected and the interpretation of each parameter.
 */
export type EventType<P> = {comment?: string} & (P extends Record<
    string,
    unknown
>
    ? EventDescription<P>
    : unknown);

/** A metric which measures the duration of an event. */
type DurationMeasurement = {
    duration: number;
};

/** Returns a common description which applies to all durations measured with the metric system. */
function getDurationProperty(): EventDescription<DurationMeasurement> {
    return {
        duration: {
            comment: "The duration of the event, in milliseconds",
        },
    };
}

/**
 * All events recordable by this module must reside in this class.
 *
 * If an event has no additional metadata, set the type parameter of EventType<> to `undefined`.
 */
export class EventTypes {
    [Events.COMMAND_EXECUTION]: EventType<
        {
            command: string;
            success: boolean;
        } & DurationMeasurement
    > = {
        comment: "Execution of a command",
        command: {
            comment: "The command that was executed",
        },
        success: {
            comment: "true if the command succeeded, false otherwise",
        },
        ...getDurationProperty(),
    };
    [Events.EXTENSION_ACTIVATION]: EventType<undefined> = {
        comment: "Extension was activated",
    };
    [Events.EXTENSION_INITIALIZATION]: EventType<
        {
            success: boolean;
            type?: "dabs" | "legacy" | "unknown";
        } & DurationMeasurement
    > = {
        comment: "Extension services were initialized",
    };
    [Events.AUTO_LOGIN]: EventType<
        {
            success: boolean;
            source: AutoLoginSource;
        } & DurationMeasurement
    > = {
        comment: "Extension logged in automatically",
    };
    [Events.MANUAL_LOGIN]: EventType<
        {
            success: boolean;
            source: ManualLoginSource;
        } & DurationMeasurement
    > = {
        comment: "User logged in manually",
    };
    [Events.AUTO_MIGRATION]: EventType<
        {
            success: boolean;
        } & DurationMeasurement
    > = {
        comment: "Extension migrated automatically",
    };
    [Events.MANUAL_MIGRATION]: EventType<
        {
            success: boolean;
        } & DurationMeasurement
    > = {
        comment: "User migrated manually",
    };
    [Events.BUNDLE_RUN]: EventType<
        {
            success: boolean;
            cancelled?: boolean;
            resourceType?: BundleRunResourceType;
            runType?: BundleRunType;
        } & DurationMeasurement
    > = {
        comment: "Execute a bundle resource",
    };
    [Events.BUNDLE_INIT]: EventType<
        {
            success: boolean;
            hasAiTools?: boolean;
        } & DurationMeasurement
    > = {
        comment: "Initialize a new bundle project",
        hasAiTools: {
            comment:
                "Whether Databricks AI tools are already installed when the project is initialized",
        },
    };
    [Events.BUNDLE_SUB_PROJECTS]: EventType<{
        count: number;
    }> = {
        comment: "Sub-projects in the active workspace folder",
        count: {
            comment: "Amount of sub-projects in the active workspace folder",
        },
    };
    [Events.CONNECTION_STATE_CHANGED]: EventType<{
        newState: string;
    }> = {
        comment: "State of ConnectionManager has changed",
        newState: {
            comment: "The new state of the connection",
        },
    };
    [Events.COMPUTE_SELECTED]: EventType<{
        type: ComputeType;
    }> = {
        comment: "A compute was selected",
        type: {
            comment: "The type of the compute",
        },
    };
    [Events.WORKFLOW_RUN]: EventType<
        {
            success: boolean;
            taskType: WorkflowTaskType;
            computeType: ComputeType;
        } & DurationMeasurement
    > = {
        comment: "A workflow task was run",
        taskType: {
            comment: "The type of the workflow task",
        },
        computeType: {
            comment: "The type of the compute",
        },
    };
    [Events.DBCONNECT_RUN]: EventType<{
        launchType: LaunchType;
        computeType: ComputeType;
    }> = {
        comment: "A Databricks Connect debug run",
        computeType: {
            comment: "The type of the compute",
        },
    };
    [Events.OPEN_RESOURCE_EXTERNALLY]: EventType<{
        type: string;
    }> = {
        comment: "An external resource URL was opened",
        type: {
            comment: "The resource type",
        },
    };
    [Events.AITOOLS_INSTALL]: EventType<
        {
            result: AiToolsInstallResult;
            scope: AiToolsScope;
            source?: AiToolsInstallSource;
            agents?: string[];
            cursorPlugin?: boolean;
        } & DurationMeasurement
    > = {
        comment: "Install Databricks AI tools",
        result: {
            comment:
                "The install outcome: 'success' (ran and completed), 'error' (ran and failed), or 'possible-success' (the user completed the flow but the install is not observable by the extension, e.g. the Cursor-plugin-only case). Kept separate so 'possible-success' doesn't inflate the confirmed 'success' count.",
        },
        scope: {
            comment: "The install scope (project or global)",
        },
        source: {
            comment:
                "Where the install was triggered from: 'initModal' (first-load prompt) or 'sidePane' (manual click in the configuration view)",
        },
        agents: {
            comment:
                'The coding agents whose skills were installed via the CLI (the closed set of agent ids, e.g. ["claude-code","cursor"]). Excludes the Cursor plugin, which is tracked separately by cursorPlugin. Undefined when no explicit selection was made (the CLI acts on every detected agent).',
        },
        cursorPlugin: {
            comment:
                "In Cursor, whether the Databricks marketplace plugin (a superset of the Cursor skills) was installed as part of this flow, rather than the cursor skills via the CLI",
        },
    };
    [Events.AITOOLS_UPDATE]: EventType<
        {
            success: boolean;
            scope: AiToolsScope;
        } & DurationMeasurement
    > = {
        comment: "Update Databricks AI tools",
        success: {
            comment: "true if the update succeeded, false otherwise",
        },
        scope: {
            comment: "The update scope (project or global)",
        },
    };
    [Events.AITOOLS_UNINSTALL]: EventType<
        {
            success: boolean;
            scope: AiToolsScope;
        } & DurationMeasurement
    > = {
        comment: "Uninstall Databricks AI tools",
        success: {
            comment: "true if the uninstall succeeded, false otherwise",
        },
        scope: {
            comment: "The uninstall scope (project or global)",
        },
    };
    [Events.AITOOLS_CURSOR_PLUGIN_PROMPT]: EventType<{
        success: boolean;
        source?: AiToolsCursorPluginSource;
    }> = {
        comment:
            "Prompted the user to install the Databricks plugin from the Cursor marketplace (opened the install modal). We can only observe that we opened the modal, not whether the user actually added the plugin.",
        success: {
            comment:
                "true if the marketplace modal was opened, false if opening it failed",
        },
        source: {
            comment:
                "Where the plugin prompt was triggered from: 'initModal' (first-load install prompt) or 'sidePane' (install triggered from the configuration view), both via the install flow, or 'pluginButton' (the standalone add-plugin button on the AI tools row)",
        },
    };
    [Events.PYTHON_ENV_SETUP_DETECTED]: EventType<{
        managersDetected: PackageManager[];
        primaryManager: PrimaryManager;
        signals: string[];
        pythonVersion?: string;
        interpreterSource: InterpreterSource;
        hasLockfile: boolean;
        targetCompute: TargetCompute;
        setupTrigger: SetupTrigger;
    }> = {
        comment:
            "The Python package/environment manager(s) detected for a project at setup time. " +
            "Measurement only: emits categorical data to size the real distribution of " +
            "pip/conda/uv/poetry usage across users. Contains no paths, package names, or other PII.",
        managersDetected: {
            comment:
                'All package managers with at least one firing signal, e.g. ["uv","pip"]',
        },
        primaryManager: {
            comment:
                "Best-guess primary manager (uv > poetry > conda > pip), or unknown",
        },
        signals: {
            comment:
                'The closed-set signal identifiers that fired, e.g. ["uv.lock","pyproject.tool.uv"]',
        },
        pythonVersion: {
            comment:
                'Detected interpreter version, major.minor only (e.g. "3.11"), if available',
        },
        interpreterSource: {
            comment: "How the active interpreter was provisioned",
        },
        hasLockfile: {
            comment: "Whether a uv.lock or poetry.lock was found",
        },
        targetCompute: {
            comment:
                "The compute targeted at detection time (no cluster IDs/names)",
        },
        setupTrigger: {
            comment: "Which setup touchpoint triggered detection",
        },
    };
    [Events.PYTHON_ENV_SETUP_ATTEMPT]: EventType<{
        packageManager: PrimaryManager;
        targetType: ComputeType;
        serverlessVersion?: string;
        mode: PythonSetupMode;
        isGreenfield?: boolean;
        trigger: PythonSetupRunTrigger;
    }> = {
        comment:
            "A uv-native Python environment setup run is starting: emitted once the compute " +
            "target is known and immediately before the CLI is spawned, so every attempt has " +
            "exactly one matching python_env.setup.result. Categorical data only — no cluster " +
            "IDs/names, paths, or package names.",
        trigger: {
            comment:
                "initial (first setup for the project this session) or rerun (re-running over an " +
                "environment already provisioned this session, e.g. via the ready row's Re-run " +
                "button). Session-scoped: a run after a window reload reads as initial again",
        },
        packageManager: {
            comment:
                "The package manager detected for the project (uv > poetry > conda > pip), or unknown",
        },
        targetType: {
            comment: "Whether the environment targets a cluster or serverless",
        },
        serverlessVersion: {
            comment:
                'The chosen serverless environment version (e.g. "5"); omitted for clusters',
        },
        mode: {
            comment:
                "Whether databricks-connect is included (default) or only the runtime constraints (constraints-only)",
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
    };
    [Events.PYTHON_ENV_SETUP_RESULT]: EventType<{
        outcome: PythonSetupOutcome;
        failurePhase?: PythonSetupFailurePhase;
        errorCode?: PythonSetupErrorCode;
        envKey?: string;
        diskMutated?: boolean;
        warningsCount?: number;
        // A code->count histogram, not a list: JSON-stringified into a property
        // by recordEvent (numbers alone become metrics). Keys are a closed
        // categorical set (the CLI's W_* codes, or "other"); never the warning
        // messages, which carry package names and version specifiers.
        warningCodeCounts?: Record<string, number>;
        // Optional rather than the usual required DurationMeasurement: the
        // `no_compute` outcome is reported without a run having started, so
        // there is no elapsed time. Emitting 0 there would drag the
        // setup-time percentiles toward zero.
        duration?: number;
    }> = {
        comment:
            "The outcome of a uv-native Python environment setup run. Pairs 1:1 with a preceding " +
            "python_env.setup.attempt, except for outcome=no_compute, which is reported on its own " +
            "when the user pressed the CTA with nothing attached to set up for. The failure phase " +
            "localises where the funnel breaks without requiring funnel tracking. Categorical data only.",
        outcome: {
            comment:
                "ok | failed | cancelled (user aborted) | not_started (the CLI produced no " +
                "result) | no_compute (the CTA was a dead end: nothing was attached to set up for)",
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
        // Measured by the extension around the whole run, not read from the
        // CLI's own durationMs (documented as reserved and always 0). This is
        // also the latency the user actually experiences: it includes process
        // spawn and interpreter adoption.
        ...getDurationProperty(),
    };
}

/**
 * A convenience type to extract the type of the propsAndMetrics parameter from the type of the
 * field of EventTypes
 */
export type EventProperties = {
    [P in keyof EventTypes]: EventTypes[P] extends EventType<infer R>
        ? R extends Record<string, unknown>
            ? R
            : never
        : never;
};

export type EventReporter<E extends keyof EventTypes> = (
    props: Omit<EventProperties[E], "duration">
) => void;

export type EnvironmentType = "tests" | "prod";

/**
 * Additional metadata collected from the extension, independent of the event itself.
 */
/* eslint-disable @typescript-eslint/naming-convention */
export enum Metadata {
    USER = "user",
    CONTEXT = "context",
}
/* eslint-enable @typescript-eslint/naming-convention */

/**
 * The definitions of all additional metadata collected by the telemetry.
 *
 * The fields of this class should be defined in the Metadata enum.
 */
export class MetadataTypes {
    [Metadata.USER]: EventType<{
        hashedUserName: string;
        host: string;
        workspaceId: string;
        authType: AuthType;
    }> = {
        hashedUserName: {
            comment: "A hash of the user name computed using bcrypt",
        },
        host: {
            comment:
                "The hostname of the workspace that the user is connected to",
        },
        workspaceId: {
            comment: "The id of the workspace",
        },
        authType: {
            comment: "The kind of authentication used by the user",
        },
    };
    [Metadata.CONTEXT]: EventType<{environmentType: EnvironmentType}> = {
        environmentType: {
            comment:
                "A type of the environment this extension is running with (test, staging, prod)",
        },
    };
}

/** The type of all extra metadata collected by the extension. */
export type ExtraMetadata = {
    [P in keyof MetadataTypes]: MetadataTypes[P] extends EventType<infer R>
        ? Partial<R>
        : never;
};
