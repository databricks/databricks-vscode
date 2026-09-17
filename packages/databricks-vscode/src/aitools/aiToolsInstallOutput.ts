import {AiToolsInstallOutput} from "../cli/CliWrapper";

/**
 * The categorical error fields recorded on the AITOOLS_INSTALL event, derived
 * from an `aitools install --output json` result
 */
export interface AiToolsInstallErrorSummary {
    globalErrorCategory?: string;
    agentErrors?: Record<string, string>;
}

/**
 * A local-only, human-readable description of a failed install, folding the
 * top-level `error` and each non-installed agent's `message` into one string
 */
export function describeAiToolsInstallFailure(
    output: AiToolsInstallOutput | undefined
): string | undefined {
    if (output === undefined) {
        return undefined;
    }
    const lines: string[] = [];
    if (output.error) {
        lines.push(output.error);
    }
    for (const agent of output.agents) {
        if (agent.status !== "installed") {
            const detail = agent.message ?? "failed to install";
            lines.push(`${agent.name}: ${detail}`);
        }
    }
    return lines.length > 0 ? lines.join("\n") : undefined;
}

/**
 * Reduce an install result to the categorical error fields telemetry records:
 * the top-level failure category (if any), and a per-agent map of the agents that
 * did not install (failed or skipped) to their categorical error. Only
 * categories are emitted — never the CLI's free-form `error`/`message` strings.
 */
export function summarizeAiToolsInstallErrors(
    output: AiToolsInstallOutput | undefined
): AiToolsInstallErrorSummary {
    if (output === undefined) {
        return {};
    }
    const summary: AiToolsInstallErrorSummary = {};
    if (output.error_category !== undefined) {
        summary.globalErrorCategory = output.error_category;
    }
    const agentErrors: Record<string, string> = {};
    for (const agent of output.agents) {
        if (agent.error_category !== undefined) {
            agentErrors[agent.name] = agent.error_category;
        }
    }
    if (Object.keys(agentErrors).length > 0) {
        summary.agentErrors = agentErrors;
    }
    return summary;
}
