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

/**
 * Guidance shown when no compute target is resolvable. Single-sourced here (and
 * mapped from the CLI's `E_NO_TARGET`) so the orchestrator's pre-flight check
 * and the CLI-reported error surface the identical copy.
 */
export const NO_COMPUTE_TARGET_MESSAGE =
    "Select a cluster or serverless compute before setting up the environment.";

/**
 * uv's official installation guide. Single-sourced here so the popup action and
 * its test point at the same page; the extension deliberately links to the docs
 * (which pick the right installer per platform) rather than running an installer
 * itself.
 */
export const UV_INSTALL_DOCS_URL =
    "https://docs.astral.sh/uv/getting-started/installation/";

/**
 * uv's guide to configuring a package index. Single-sourced here so the popup
 * action for a blocked index and its test point at the same page.
 */
export const UV_INDEX_DOCS_URL =
    "https://docs.astral.sh/uv/configuration/indexes/";

/**
 * "Cannot reach the host" phrases in uv's error text (matched case-insensitively).
 * TLS-interception and proxy-auth (407) are deliberately left out: they need a
 * CA-trust / credentials fix, not a different index.
 */
const INDEX_CONNECTIVITY_SYMPTOMS = [
    "connection refused",
    "connect error", // e.g. "tcp connect error"
    "connection reset",
    "timed out",
    "name resolution", // DNS: "… name resolution" (Linux)
    "failed to lookup address", // DNS: macOS getaddrinfo phrasing
    "dns error",
    "network is unreachable",
    "no route to host",
    "could not connect",
];

/**
 * True when an E_PROVISION failure is a blocked *package index* (pypi.org blocked,
 * proxy needed), not a dependency conflict — both share the code, so the conflict
 * copy would misdirect. The CLI emits no distinct code, so we read uv's message.
 *
 * Non-obvious choices: the index marker is the PEP 503 "/simple/" path (so a
 * git-*named* package like /simple/gitpython/ still counts), backed by structural
 * exclusion of git sources and direct distribution URLs — which can also carry
 * "/simple/". E_PYTHON_INSTALL is excluded (its CPython download uses a different
 * mirror this can't fix). Precision over recall: an unmatched phrasing falls back
 * to the per-code copy, never wrong remediation.
 */
export function isIndexUnreachableFailure(result: PythonSetupResult): boolean {
    const err = result.error;
    if (!err || err.code !== "E_PROVISION") {
        return false;
    }
    const msg = err.message?.toLowerCase() ?? "";
    // A git source or a direct distribution URL can also "failed to fetch" and may
    // even carry "/simple/" in their path (an org named "simple", a wheel under a
    // /simple/ dir) — but neither is a package index, so exclude them structurally.
    if (
        msg.includes("git+") ||
        msg.includes("git repository") ||
        msg.includes(".whl") ||
        msg.includes(".tar.")
    ) {
        return false;
    }
    // "/simple/" with the trailing slash: the real index fetch URL is always
    // {index}/simple/{package}/ (never a name like /simplejson-… or a file).
    if (!msg.includes("failed to fetch") || !msg.includes("/simple/")) {
        return false;
    }
    return INDEX_CONNECTIVITY_SYMPTOMS.some((s) => msg.includes(s));
}

/**
 * An optional remediation button to attach to a failure popup: a label and the
 * external URL it opens. Kept alongside {@link getPythonSetupErrorMessage} so the
 * copy and its call-to-action live together.
 */
export interface PythonSetupErrorAction {
    label: string;
    url: string;
}

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
    E_NO_TARGET: () => NO_COMPUTE_TARGET_MESSAGE,
    E_RESOLVE: () =>
        "Could not resolve the selected compute. Check the cluster/serverless selection and try again.",
    E_ENV_UNSUPPORTED: (r) => {
        const key = r.compute?.envKey;
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

/**
 * Popup copy for a blocked index, replacing E_PROVISION's misleading conflict
 * text. Summary only — the copy-pasteable fix lives in {@link formatSetupFailureDetail}.
 */
const INDEX_UNREACHABLE_MESSAGE =
    "Couldn't reach the Python package index — this often means a corporate " +
    "network is blocking the public index (pypi.org) and a proxy is required. " +
    "Point uv at your organization's package index (set the UV_INDEX_URL " +
    "environment variable, or add an index-url to your pip config), then try " +
    "again. See the logs for details.";

export function getPythonSetupErrorMessage(result: PythonSetupResult): string {
    const err = result.error;
    if (!err) {
        return GENERIC;
    }
    // Checked before the per-code map: a blocked index arrives as E_PROVISION,
    // whose generic "dependency conflict" copy points at the wrong cause.
    const base = isIndexUnreachableFailure(result)
        ? INDEX_UNREACHABLE_MESSAGE
        : BASE_MESSAGE[err.code]?.(result) ?? GENERIC;
    return base + diskStateSuffix(result, err);
}

/**
 * The remediation button, if any: a blocked index → uv's index-config docs, or
 * `E_UV_MISSING` → uv's install docs. Other codes are actionable from the message
 * and logs alone.
 */
export function getPythonSetupErrorAction(
    result: PythonSetupResult
): PythonSetupErrorAction | undefined {
    if (isIndexUnreachableFailure(result)) {
        return {label: "Configure package index", url: UV_INDEX_DOCS_URL};
    }
    if (result.error?.code === "E_UV_MISSING") {
        return {label: "Install uv", url: UV_INSTALL_DOCS_URL};
    }
    return undefined;
}

/**
 * The detailed failure text for the "Databricks Python Environment Setup" output
 * channel — the counterpart to {@link getPythonSetupErrorMessage}'s concise
 * popup copy. The popup is mapped from the error *code* and deliberately drops
 * the CLI's raw `error.message`; under `--output json` that message (e.g. uv's
 * version-conflict explanation) is otherwise nowhere the user can see it. This
 * puts it, the failing phase/code, and the per-phase status line into the log
 * so "review the conflict in the logs" actually leads somewhere.
 *
 * Returns `undefined` when the result carries no error, i.e. there is nothing to
 * add to the log.
 */
export function formatSetupFailureDetail(
    result: PythonSetupResult
): string | undefined {
    const err = result.error;
    if (!err) {
        return undefined;
    }
    const lines = [
        `Setup failed in the ${err.failurePhase} phase (${err.code}).`,
    ];
    if (err.message) {
        lines.push(err.message);
    }
    if (result.phases.length > 0) {
        lines.push(
            "Phases: " +
                result.phases.map((p) => `${p.phase}=${p.status}`).join(", ")
        );
    }
    // For a blocked index, follow the raw error with concrete, copy-pasteable
    // remediation — the popup only summarises it. Kept here (not the popup) so
    // the multi-line commands render as-is in the output channel.
    if (isIndexUnreachableFailure(result)) {
        lines.push(
            "",
            "This looks like the Python package index (pypi.org) is unreachable — " +
                "often a corporate network that blocks it and requires a proxy. Point uv " +
                "at your organization's package index in one of these ways, then re-run setup:",
            "",
            "  1. Set the UV_INDEX_URL environment variable to https://<your-proxy>/simple",
            "       macOS/Linux:  export UV_INDEX_URL=https://<your-proxy>/simple",
            "       Windows:      setx UV_INDEX_URL https://<your-proxy>/simple",
            "",
            "  2. Or add an index-url to your pip config (pip.conf, or pip.ini on Windows);",
            "     the CLI bridges it to uv:",
            "       [global]",
            "       index-url = https://<your-proxy>/simple",
            "     Use index-url (not extra-index-url) so pypi.org is replaced, not merely supplemented."
        );
    }
    // Bracket with blank lines so the block stands apart from any streamed CLI
    // output already in the channel.
    return `\n${lines.join("\n")}\n`;
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
