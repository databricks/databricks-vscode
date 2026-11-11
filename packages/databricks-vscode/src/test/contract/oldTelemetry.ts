/**
 * The old extension's telemetry events and metadata, as `databricks.databricks`
 * 2.20.0 declared them in `src/telemetry/constants.ts`, with type aliases
 * expanded. Extracted with the TypeScript compiler; don't edit by hand.
 * `telemetry.test.ts` checks the rewrite's events against it, so telemetry
 * stays comparable with the old extension's.
 */
export interface OldEvents {
    commandExecution: { command: string; success: boolean; duration: number };
    extensionActivation: Record<string, never>;
    extensionInitialization: { success: boolean; type?: "dabs" | "legacy" | "unknown" | undefined; duration: number };
    autoLogin: { success: boolean; source: "init" | "hostChange" | "targetChange"; duration: number };
    manualLogin: { success: boolean; source: "authTypeSwitch" | "authTypeLogin" | "command" | "api"; duration: number };
    autoMigration: { success: boolean; duration: number };
    manualMigration: { success: boolean; duration: number };
    bundleRun: { success: boolean; cancelled?: boolean | undefined; resourceType?: "pipelines" | "jobs" | undefined; runType?: "run" | "validate" | "partial-refresh" | "manual-input" | undefined; duration: number };
    bundleInit: { success: boolean; hasAiTools?: boolean | undefined; duration: number };
    bundleSubProjects: { count: number };
    connectionStateChanged: { newState: string };
    computeSelected: { type: "cluster" | "serverless" };
    workflowRun: { success: boolean; taskType: "unknown" | "python" | "notebook"; computeType: "cluster" | "serverless"; duration: number };
    dbconnectRun: { launchType: "run" | "debug"; computeType: "cluster" | "serverless" };
    openResourceExternally: { type: string };
    bundleTerraformEngineWarning: { action: "guide" | "hidden" | "dismissed" };
    aitoolsInstall: { result: "success" | "error" | "possible-success"; scope: "project" | "global"; source?: "initModal" | "sidePane" | undefined; agents?: string[] | undefined; cursorPlugin?: boolean | undefined; globalErrorCategory?: string | undefined; agentErrors?: Record<string, string> | undefined; duration: number };
    aitoolsUpdate: { success: boolean; scope: "project" | "global"; duration: number };
    aitoolsUninstall: { success: boolean; scope: "project" | "global"; duration: number };
    aitoolsCursorPluginPrompt: { success: boolean; source?: "initModal" | "sidePane" | "pluginButton" | undefined };
    "python_env.setup.detected": { managersDetected: ("unknown" | "uv" | "poetry" | "pip" | "conda")[]; primaryManager: "unknown" | "uv" | "poetry" | "pip" | "conda"; signals: string[]; pythonVersion?: string | undefined; interpreterSource: "unknown" | "uv" | "poetry" | "conda" | "system" | "venv"; hasLockfile: boolean; targetCompute: "cluster" | "serverless" | "none"; setupTrigger: "run" | "debug" | "auto_open" | "explicit_command"; setupMode: "uv" | "pip" | "fallback-pip" };
    "python_env.manual_setup.optout": { scope: "global" | "workspace"; source: "error_popup" | "command_palette" };
    "python_env.setup.attempt": { packageManager: "unknown" | "uv" | "poetry" | "pip" | "conda"; targetType: "cluster" | "serverless"; serverlessVersion?: string | undefined; mode: "default" | "constraints-only"; setupPreset: "python" | "full" | "dbconnect"; isGreenfield?: boolean | undefined; trigger: "initial" | "rerun" | "conflict_retry" };
    "python_env.setup.result": { outcome: "ok" | "failed" | "cancelled" | "not_started" | "no_compute"; setupPreset?: "python" | "full" | "dbconnect" | undefined; pythonSetupFlow?: "cancelled" | "uv_install_succeeded" | "installed_fallback" | "manual_selection_requested" | undefined; failurePhase?: "validate" | "preflight" | "resolve" | "fetch" | "merge" | "provision" | "adopt" | "persist" | undefined; errorCode?: "E_USAGE" | "E_MANAGER_UNSUPPORTED" | "E_NOT_WRITABLE" | "E_UV_MISSING" | "E_NO_TARGET" | "E_RESOLVE" | "E_ENV_UNSUPPORTED" | "E_FETCH" | "E_WRITE" | "E_MERGE" | "E_PYTHON_INSTALL" | "E_PROVISION" | "E_PROVISION_CONFLICT" | "E_VALIDATE" | undefined; envKey?: string | undefined; diskMutated?: boolean | undefined; indexUnreachable?: boolean | undefined; reportOffered?: boolean | undefined; warningsCount?: number | undefined; warningCodeCounts?: Record<string, number> | undefined; duration?: number | undefined };
    "python_env.drift": { trigger: "computeChange" | "workspaceOpen" | "setupCompleted"; fromEnvKey: string; toEnvKey: string };
    "python_env.adoption": { venvPresent: boolean; currentTargetType: "cluster" | "serverless" | "none" };
    "python_env.dbconnect_install": { outcome: "ok" | "failed"; duration: number };
}

export interface OldMetadata {
    user: { hashedUserName: string; host: string; workspaceId: string; authType: "default" | "pat" | "basic" | "azure-cli" | "azure-msi" | "azure-client-secret" | "google-credentials" | "google-id" | "metadata-service" | "databricks-cli" | "oauth-m2m" };
    context: { environmentType: "tests" | "prod"; mode: "remote" | "normal" };
}

/** The same, at run time: each event's property names. */
export const OLD_EVENT_PROPERTIES: {[E in keyof OldEvents]-?: (keyof OldEvents[E])[]} = {
    commandExecution: ["command", "success", "duration"],
    extensionActivation: [],
    extensionInitialization: ["success", "type", "duration"],
    autoLogin: ["success", "source", "duration"],
    manualLogin: ["success", "source", "duration"],
    autoMigration: ["success", "duration"],
    manualMigration: ["success", "duration"],
    bundleRun: ["success", "cancelled", "resourceType", "runType", "duration"],
    bundleInit: ["success", "hasAiTools", "duration"],
    bundleSubProjects: ["count"],
    connectionStateChanged: ["newState"],
    computeSelected: ["type"],
    workflowRun: ["success", "taskType", "computeType", "duration"],
    dbconnectRun: ["launchType", "computeType"],
    openResourceExternally: ["type"],
    bundleTerraformEngineWarning: ["action"],
    aitoolsInstall: ["result", "scope", "source", "agents", "cursorPlugin", "globalErrorCategory", "agentErrors", "duration"],
    aitoolsUpdate: ["success", "scope", "duration"],
    aitoolsUninstall: ["success", "scope", "duration"],
    aitoolsCursorPluginPrompt: ["success", "source"],
    "python_env.setup.detected": ["managersDetected", "primaryManager", "signals", "pythonVersion", "interpreterSource", "hasLockfile", "targetCompute", "setupTrigger", "setupMode"],
    "python_env.manual_setup.optout": ["scope", "source"],
    "python_env.setup.attempt": ["packageManager", "targetType", "serverlessVersion", "mode", "setupPreset", "isGreenfield", "trigger"],
    "python_env.setup.result": ["outcome", "setupPreset", "pythonSetupFlow", "failurePhase", "errorCode", "envKey", "diskMutated", "indexUnreachable", "reportOffered", "warningsCount", "warningCodeCounts", "duration"],
    "python_env.drift": ["trigger", "fromEnvKey", "toEnvKey"],
    "python_env.adoption": ["venvPresent", "currentTargetType"],
    "python_env.dbconnect_install": ["outcome", "duration"],
};

export const OLD_METADATA_PROPERTIES: {[M in keyof OldMetadata]-?: (keyof OldMetadata[M])[]} = {
    user: ["hashedUserName", "host", "workspaceId", "authType"],
    context: ["environmentType", "mode"],
};
