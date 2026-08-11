import path from "path";
import {
    PythonSetupComputeInfo,
    PythonSetupResult,
} from "../models/PythonSetupResult";

/**
 * Human-readable summary of a successful `environments setup-local` run, shown
 * in a completion modal. `title` is the bold dialog heading; `detail` is the
 * multi-line body (VS Code preserves its newlines). All copy is derived from
 * the result — mode drives the databricks-connect clause, artifactSource drives
 * download-vs-cache wording, and the backup/warnings lines appear only when the
 * corresponding fields are populated. Pure (no vscode import) so it is unit
 * tested against the golden fixtures.
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
            ? `Python ${pythonVersion} · databricks-connect ${dbconnect}`
            : `Python ${pythonVersion}`
    );

    const compute = computeLabel(result.compute);
    if (compute) {
        lines.push(`Compute: ${compute}`);
    }

    lines.push("", "What was done");

    lines.push(
        result.resolved?.artifactSource === "cache"
            ? "✓ Reused cached Databricks packages"
            : "✓ Downloaded Databricks packages"
    );
    lines.push("✓ Added matching Databricks constraints to pyproject.toml");
    lines.push("✓ Built the virtual environment with uv sync");
    lines.push("✓ Selected .venv as the workspace interpreter");

    if (result.backupPath) {
        lines.push(
            `✓ Backed up your previous pyproject.toml (${path.basename(
                result.backupPath
            )})`
        );
    }

    if (result.venvPath) {
        lines.push("", `Virtual environment: ${result.venvPath}`);
    }

    if (result.warnings.length > 0) {
        lines.push("", "⚠ Warnings");
        for (const w of result.warnings) {
            lines.push(`• ${w.message}`);
        }
    }

    return {title, detail: lines.join("\n")};
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
