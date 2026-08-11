import path from "path";
import {
    PythonSetupComputeInfo,
    PythonSetupResult,
} from "../models/PythonSetupResult";

/**
 * Short, TL;DR summary of a successful `environments setup-local` run, shown in
 * a standard (non-modal) information notification. `title` is the headline;
 * `detail` is a tight ✓-checklist of what was done, one item per line (VS Code
 * preserves the newlines). Deliberately terse — the full provisioning log is a
 * click away via "View logs". Pure (no vscode import) so it is unit tested
 * against the golden fixtures.
 */
export interface PythonSetupSummary {
    title: string;
    detail: string;
}

export function formatSetupSummary(
    result: PythonSetupResult
): PythonSetupSummary {
    const isDefault = result.mode === "default";
    const title = isDefault
        ? "Python environment ready for Databricks Connect"
        : "Python environment ready — constraints applied";

    const lines: string[] = [];

    // Versions line: databricks-connect only exists in default mode.
    const pythonVersion = result.resolved?.pythonVersion ?? "";
    const dbconnect = result.resolved?.dbconnectVersion;
    lines.push(
        isDefault && dbconnect
            ? `✓ Python ${pythonVersion} + databricks-connect ${dbconnect}`
            : `✓ Python ${pythonVersion}`
    );
    lines.push("✓ Added matching constraints, built .venv (uv sync)");
    lines.push("✓ Selected .venv as the interpreter");

    // Warnings are safety-relevant, so a one-line flag survives the TL;DR even
    // though the details themselves stay in the log.
    if (result.warnings.length > 0) {
        const n = result.warnings.length;
        lines.push(
            `⚠ Completed with ${n} warning${n === 1 ? "" : "s"} — see logs`
        );
    }

    return {title, detail: lines.join("\n")};
}

/**
 * The full, verbose breakdown written to the "Databricks Python Environment
 * Setup" output channel on success, revealed by the notification's "View logs"
 * button. This is the home for everything the TL;DR notification omits
 * (compute, artifact source, backup path, venv path, full warning messages) —
 * necessary because in `--output json` mode the CLI streams little or nothing
 * to stderr on success, so without this the channel would be empty.
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
