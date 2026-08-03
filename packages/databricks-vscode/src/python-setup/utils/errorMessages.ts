import path from "path";
import {
    PythonSetupResult,
    PythonSetupErrorCode,
} from "../models/PythonSetupResult";

/**
 * Maps a failed `environments setup-local` result to a concise, actionable
 * message for the user. The wording is intentionally friendlier/shorter than
 * the CLI's own error text (which is still available via "Show Logs"), but stays
 * consistent with it — e.g. env-unsupported points at the latest LTS runtime, and
 * manager-unsupported names uv, matching the CLI's guidance.
 *
 * A disk-state-aware suffix is always appended: reassurance that nothing was
 * changed, a pointer to the backup file for rollback, or — for a greenfield run
 * that wrote a brand-new pyproject.toml (no backup to restore) — a note that a
 * new file was created.
 */

/* eslint-disable @typescript-eslint/naming-convention */
const BASE_MESSAGE: Record<
    PythonSetupErrorCode,
    (r: PythonSetupResult) => string
> = {
    E_USAGE: () => "Invalid setup arguments.",
    E_MANAGER_UNSUPPORTED: () =>
        "Automated setup requires a uv project. Add a pyproject.toml with a " +
        "[tool.uv] table (or run `uv init`), then try again.",
    E_NOT_WRITABLE: () =>
        "The project folder is not writable. Check its permissions and try again.",
    E_UV_MISSING: () =>
        "uv was not found and could not be installed automatically. Install uv, then try again.",
    E_NO_TARGET: () =>
        "Select a cluster or serverless compute before setting up the environment.",
    E_RESOLVE: () =>
        "Could not resolve the selected compute. Check the cluster/serverless selection and try again.",
    E_ENV_UNSUPPORTED: (r) => {
        const key = r.target?.envKey;
        const which = key ? `for ${key}` : "for the selected compute";
        return (
            `No matched environment ${which}. ` +
            "If this is a new runtime, try the latest LTS runtime."
        );
    },
    E_FETCH: () =>
        "Could not reach the environment constraints repository and no local cache is available. " +
        "Check your network connection and try again.",
    E_WRITE: () => "Failed to write pyproject.toml.",
    E_MERGE: () =>
        "Failed to merge the runtime constraints into your existing pyproject.toml.",
    E_PYTHON_INSTALL: () =>
        "uv could not install the required Python version for this runtime.",
    E_PROVISION: () =>
        "uv could not resolve the project's dependencies (a version conflict). " +
        "Review the conflict in the logs and adjust your dependencies.",
    E_VALIDATE: () =>
        "The provisioned environment did not match the selected runtime.",
};
/* eslint-enable @typescript-eslint/naming-convention */

const GENERIC = "Python environment setup failed.";

export function getPythonSetupErrorMessage(result: PythonSetupResult): string {
    const err = result.error;
    if (!err) {
        return GENERIC;
    }
    const base = BASE_MESSAGE[err.code]?.(result) ?? GENERIC;
    return base + diskStateSuffix(result, err);
}

/**
 * Trailing sentence describing what, if anything, changed on disk — so we never
 * point the user at a rollback path that does not exist.
 */
function diskStateSuffix(
    result: PythonSetupResult,
    err: NonNullable<PythonSetupResult["error"]>
): string {
    if (!err.diskMutated) {
        return " No changes were made to your project.";
    }
    // Greenfield is checked first: it authoritatively means no prior file
    // existed, so there is nothing to restore even if a backupPath were set.
    if (result.greenfield) {
        return " A new pyproject.toml was created in your project (there was no previous version to restore).";
    }
    // path.basename tolerates trailing separators and returns "" for an empty
    // input, so the falsy check below still falls through when there's no name.
    const backupName = result.backupPath
        ? path.basename(result.backupPath)
        : undefined;
    if (backupName) {
        // An existing pyproject.toml was backed up before it was modified.
        return ` Your original pyproject.toml is preserved as ${backupName}.`;
    }
    // Disk was mutated but no backup was recorded — avoid naming a .bak file
    // that may not exist.
    return " Your project files may have been modified.";
}
