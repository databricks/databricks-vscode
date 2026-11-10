import { contextKey, type ContextKey } from "../../platform/contextKeys";
import type { HostCapabilities } from "./capabilities";

/**
 * Context keys for the host's capabilities, set only by the bootstrap,
 * through `ContextKeys`, and listed in `SHELL_CONTEXT_KEYS`. When-clauses use
 * these, never the host's kind.
 *
 * Each is true where the host lacks something, and false in a local window:
 * before activation every key is unset, so a clause like
 * `!databricks.context.host.noTunnel` still shows its command then, and
 * running it activates the extension (as `databricks.context.unityGateway.unavailable`).
 */

/** The window's identity is the session's: no profiles, no sign-in, no sign-out (`identity: "session"`). */
const FIXED_IDENTITY = contextKey<boolean>("databricks.context.host.fixedIdentity");

/** Python is the session's, not set up by the extension (`python.kind: "session"`). */
const GIVEN_PYTHON = contextKey<boolean>("databricks.context.host.givenPython");

/** The workspace's files are mounted on this machine, and the Explorer shows them (`workspaceFiles.kind: "mounted"`). */
const MOUNTED_WORKSPACE = contextKey<boolean>("databricks.context.host.mountedWorkspace");

/** The window's compute is the session's and can't change (`compute: "session"`): no choice of compute. */
const FIXED_COMPUTE = contextKey<boolean>("databricks.context.host.fixedCompute");

/** No new projects here (`newProjects: false`): the wizard's command and its entry points are hidden. */
const NO_NEW_PROJECTS = contextKey<boolean>("databricks.context.host.noNewProjects");

/** "Start SSH tunnel" can't open a window from here (`tunnel: false`). */
const NO_TUNNEL = contextKey<boolean>("databricks.context.host.noTunnel");

/** No AI tools here (`aiTools: false`). */
const NO_AI_TOOLS = contextKey<boolean>("databricks.context.host.noAiTools");

/** The old extension's key: true in a session window. No when-clause reads it; it stays for keybindings that do. */
export const REMOTE_MODE = contextKey<boolean>("databricks.context.remoteMode");

/** Each capability key with its value for `capabilities`. */
export function capabilityContextValues(
    capabilities: HostCapabilities,
): (readonly [ContextKey<boolean>, boolean])[] {
    return [
        [FIXED_IDENTITY, capabilities.identity !== "profiles"],
        [FIXED_COMPUTE, capabilities.compute === "session"],
        [GIVEN_PYTHON, capabilities.python.kind !== "managed"],
        [MOUNTED_WORKSPACE, capabilities.workspaceFiles.kind === "mounted"],
        [NO_NEW_PROJECTS, !capabilities.newProjects],
        [NO_TUNNEL, !capabilities.tunnel],
        [NO_AI_TOOLS, !capabilities.aiTools],
    ];
}

export const HOST_CONTEXT_KEYS = [
    FIXED_IDENTITY,
    FIXED_COMPUTE,
    GIVEN_PYTHON,
    MOUNTED_WORKSPACE,
    NO_NEW_PROJECTS,
    NO_TUNNEL,
    NO_AI_TOOLS,
    REMOTE_MODE,
];
