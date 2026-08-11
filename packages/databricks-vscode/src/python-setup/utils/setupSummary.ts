import path from "path";
import {
    PythonSetupComputeInfo,
    PythonSetupResult,
} from "../models/PythonSetupResult";

/**
 * The one-line message shown in the success notification. Deliberately terse
 * and use-case-neutral (a local environment for a Databricks project, not tied
 * to Databricks Connect specifically) — the full breakdown lives behind the
 * notification's "View Details" button via {@link formatSetupLog}.
 */
export const SETUP_READY_MESSAGE =
    "Python environment ready — .venv created and selected for your " +
    "Databricks project.";

/**
 * The full, verbose breakdown written to the "Databricks Python Environment
 * Setup" output channel on success, revealed by the notification's "View
 * Details" button. This is the home for everything the one-line message omits
 * (versions, compute, artifact source, backup path, venv path, full warning
 * messages) — necessary because in `--output json` mode the CLI streams little
 * or nothing to stderr on success, so without this the channel would be empty.
 *
 * Returned with a leading and trailing newline so it reads as its own block
 * beneath any CLI output already streamed to the channel.
 */
export function formatSetupLog(result: PythonSetupResult): string {
    const isDefault = result.mode === "default";
    const lines: string[] = [
        isDefault
            ? "Python environment ready for Databricks Connect."
            : "Python environment ready — constraints applied.",
        "",
    ];

    lines.push(`Python:             ${result.resolved?.pythonVersion ?? ""}`);
    if (isDefault && result.resolved?.dbconnectVersion) {
        lines.push(`databricks-connect: ${result.resolved.dbconnectVersion}`);
    }
    const compute = computeLabel(result.compute);
    if (compute) {
        lines.push(`Compute:            ${compute}`);
    }
    lines.push(
        `Packages:           ${
            result.resolved?.artifactSource === "cache"
                ? "reused from cache"
                : "downloaded from network"
        }`
    );

    lines.push("", "What was done:");
    lines.push("  • Added matching Databricks constraints to pyproject.toml");
    lines.push("  • Built the virtual environment with uv sync");
    lines.push("  • Selected .venv as the workspace interpreter");
    if (result.backupPath) {
        lines.push(
            `  • Backed up your previous pyproject.toml (${path.basename(
                result.backupPath
            )})`
        );
    }

    if (result.venvPath) {
        lines.push("", `Virtual environment: ${result.venvPath}`);
    }

    if (result.warnings.length > 0) {
        lines.push("", "Warnings:");
        for (const w of result.warnings) {
            lines.push(`  • ${w.message}`);
        }
    }

    return `\n${lines.join("\n")}\n`;
}

/**
 * Short label for the compute the environment was provisioned against.
 * Serverless carries a `v`-prefixed version already; a cluster carries its id.
 */
function computeLabel(
    compute: PythonSetupComputeInfo | undefined
): string | undefined {
    if (!compute) {
        return undefined;
    }
    if (compute.serverlessVersion) {
        return `serverless ${compute.serverlessVersion}`;
    }
    if (compute.clusterId) {
        return `cluster ${compute.clusterId}`;
    }
    return compute.source || undefined;
}
