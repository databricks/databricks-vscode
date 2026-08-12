import path from "path";
import {
    PythonSetupComputeInfo,
    PythonSetupResult,
} from "../models/PythonSetupResult";

export interface PythonSetupNotification {
    message: string;
    /** True when the run had warnings — the caller shows a warning toast. */
    isWarning: boolean;
}

/**
 * The one-line message shown in the success notification. Deliberately terse
 * and use-case-neutral (a local environment for a Databricks project, not tied
 * to Databricks Connect specifically) — the full breakdown lives behind the
 * notification's "View Details" button via {@link formatSetupLog}. When the run
 * completed with warnings the message says so and `isWarning` flips, so the
 * caller can raise a warning toast rather than a plain info one; the warnings
 * themselves are listed in the details.
 */
export function formatSetupNotification(
    result: PythonSetupResult
): PythonSetupNotification {
    const tail = ".venv created and selected for your Databricks project.";
    const n = result.warnings.length;
    if (n === 0) {
        return {
            message: `Python environment ready — ${tail}`,
            isWarning: false,
        };
    }
    return {
        message:
            `Python environment ready, with ${n} ` +
            `warning${n === 1 ? "" : "s"} — ${tail}`,
        isWarning: true,
    };
}

/**
 * The full, verbose breakdown written to the "Databricks Python Environment
 * Setup" output channel on success, revealed by the notification's "View
 * Details" button. This is the home for everything the one-line message omits
 * (versions, compute, backup path, how to run notebooks, full warning
 * messages) — necessary because in `--output json` mode the CLI streams little
 * or nothing to stderr on success, so without this the channel would be empty.
 *
 * `projectName` is the human-readable name uv associated with the venv (from
 * pyproject's `[project].name`, else the project folder name), surfaced by the
 * caller from `.venv/pyvenv.cfg`. It is shown in parentheses beside the venv
 * folder when known; when omitted the bare `.venv` folder name stands alone.
 *
 * Returned with a leading and trailing newline so it reads as its own block
 * beneath any CLI output already streamed to the channel.
 */
export function formatSetupLog(
    result: PythonSetupResult,
    projectName?: string
): string {
    const isDefault = result.mode === "default";
    // The venv folder is always `.venv`; when the caller resolved the project
    // name, show it alongside so the line reads like the label VS Code puts on
    // the interpreter (e.g. ".venv (my-project)").
    const venvLabel = projectName ? `.venv (${projectName})` : ".venv";
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

    lines.push("", "What was done:");
    lines.push("  • Added matching Databricks constraints to pyproject.toml");
    lines.push(
        `  • Built a new virtual environment with uv sync called ${venvLabel}`
    );
    lines.push(`  • Selected ${venvLabel} as the workspace interpreter`);
    if (result.backupPath) {
        lines.push(
            `  • Backed up your previous pyproject.toml (${path.basename(
                result.backupPath
            )})`
        );
    }

    // Name the environment to look for in the picker when we have it; the
    // interpreter path is the version-proof anchor either way.
    const selectedHint = projectName
        ? `is selected: ${projectName} (\`.venv/bin/python\`).`
        : "is selected (`.venv/bin/python`).";
    lines.push(
        "",
        "To run notebooks using this virtual environment, click Select " +
            "Kernel in the upper right of a notebook and ensure that the " +
            `virtual environment ${selectedHint}`
    );

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
        return `Serverless ${compute.serverlessVersion}`;
    }
    if (compute.clusterId) {
        return `cluster ${compute.clusterId}`;
    }
    return compute.source || undefined;
}
