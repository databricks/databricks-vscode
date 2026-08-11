import {PythonSetupResult} from "../models/PythonSetupResult";

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
