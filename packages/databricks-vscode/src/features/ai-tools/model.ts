import type {
    AiToolsAgent,
    AiToolsInstallOutput,
    AiToolsScope,
    AiToolsSkill,
} from "../../kernel/cli";

/** `checking` and `updating` show a spinner. */
export type AiToolsUpdateStatus =
    | "unknown"
    | "checking"
    | "updating"
    | "upToDate"
    | "updateAvailable"
    | "error";

export interface AiToolsAgentStatus {
    readonly displayName: string;
    readonly id: string;
    readonly type: "plugin" | "skills-only";
    readonly detected: boolean;
    /** False for agents that install only globally (Cursor, Codex CLI). */
    readonly supportsProjectScope: boolean;
    /** Set when the agent's tools are installed in the current scope. */
    readonly version?: string;
    /** A managed agent that received only the raw skills, not the plugin. */
    readonly skillsOnly?: boolean;
}

export interface AiToolsState {
    /** Undefined when nothing is installed. */
    readonly installLocation?: AiToolsScope;
    readonly updateStatus: AiToolsUpdateStatus;
    /** The installed AI tools release. */
    readonly version?: string;
    /** The last detection failed (an unreadable state file), as opposed to finding nothing. */
    readonly detectError: boolean;
    readonly agents: readonly AiToolsAgentStatus[];
}

/** The Cursor agent of `aitools list`. In Cursor, the marketplace plugin replaces it. */
export const CURSOR_AGENT_ID = "cursor";

export type AgentInstallBlockReason = "notDetected" | "scopeUnsupported";

/** Whether an agent can take the install at `scope`, once detected. */
export function supportsScope(agent: AiToolsAgentStatus, scope: AiToolsScope): boolean {
    return scope === "global" || agent.supportsProjectScope;
}

/**
 * Why an agent can't be installed at `scope`, or undefined if it can. The
 * install picker and the Agents rows share it.
 */
export function agentInstallBlockReason(
    agent: AiToolsAgentStatus,
    scope: AiToolsScope,
): AgentInstallBlockReason | undefined {
    if (!agent.detected) {
        return "notDetected";
    }
    if (!supportsScope(agent, scope)) {
        return "scopeUnsupported";
    }
    return undefined;
}

/** An update is available when an installed skill isn't at its latest version. */
export function updateStatusOf(
    skills: readonly AiToolsSkill[],
    scope: AiToolsScope,
): AiToolsUpdateStatus {
    return skills.some(
        (s) => s.installed[scope] !== undefined && s.installed[scope] !== s.latest_version,
    )
        ? "updateAvailable"
        : "upToDate";
}

export function agentStatusesOf(
    agents: readonly AiToolsAgent[],
    scope: AiToolsScope,
): AiToolsAgentStatus[] {
    return agents.map((agent) => {
        const installed = agent.installed[scope];
        return {
            displayName: agent.display_name,
            id: agent.name,
            type: agent.managed ? "plugin" : "skills-only",
            detected: agent.detected,
            supportsProjectScope: agent.supports_project_scope ?? true,
            ...(installed?.version !== undefined ? { version: installed.version } : {}),
            skillsOnly: agent.managed && installed?.delivery === "skills",
        };
    });
}

/** The categories of a failed install, for telemetry. Never the CLI's free-text messages. */
export interface AiToolsInstallErrorSummary {
    globalErrorCategory?: string;
    agentErrors?: Record<string, string>;
}

export function summarizeInstallErrors(
    output: AiToolsInstallOutput | undefined,
): AiToolsInstallErrorSummary {
    if (output === undefined) {
        return {};
    }
    const summary: AiToolsInstallErrorSummary = {};
    if (output.error_category !== undefined) {
        summary.globalErrorCategory = output.error_category;
    }
    const agentErrors = Object.fromEntries(
        output.agents
            .filter((a) => a.error_category !== undefined)
            .map((a) => [a.name, a.error_category!]),
    );
    if (Object.keys(agentErrors).length > 0) {
        summary.agentErrors = agentErrors;
    }
    return summary;
}

/** The top-level error and each agent that didn't install, one per line; shown to the user. */
export function describeInstallFailure(
    output: AiToolsInstallOutput | undefined,
): string | undefined {
    if (output === undefined) {
        return undefined;
    }
    const lines = [
        ...(output.error ? [output.error] : []),
        ...output.agents
            .filter((a) => a.status !== "installed")
            .map((a) => `${a.name}: ${a.message ?? "failed to install"}`),
    ];
    return lines.length > 0 ? lines.join("\n") : undefined;
}
