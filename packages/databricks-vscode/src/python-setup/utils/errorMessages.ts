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

/** uv's project overview — for E_MANAGER_UNSUPPORTED (no uv project present). */
export const UV_PROJECTS_DOCS_URL =
    "https://docs.astral.sh/uv/concepts/projects/";

/** uv's Python-version guide — for E_PYTHON_INSTALL. */
export const UV_PYTHON_INSTALL_DOCS_URL =
    "https://docs.astral.sh/uv/guides/install-python/";

/** uv's resolution concept page — for a genuine E_PROVISION dependency conflict. */
export const UV_RESOLUTION_DOCS_URL =
    "https://docs.astral.sh/uv/concepts/resolution/";

/**
 * Databricks VS Code extension "configure your project" guide, anchored at the
 * "Select compute for running code and jobs" section — for E_NO_TARGET /
 * E_RESOLVE, where the fix is picking a valid cluster or serverless compute in
 * the Configuration view. `#cluster` is that section's curated, stable anchor
 * (a Databricks-authored `db-defined-anchor`), preferred over the auto-generated
 * heading slug, which would break if the heading text changed.
 */
export const DATABRICKS_CONFIGURE_DOCS_URL =
    "https://docs.databricks.com/aws/en/dev-tools/vscode-ext/configure#cluster";

/** Databricks Runtime release notes (supported versions) — for E_ENV_UNSUPPORTED. */
export const DATABRICKS_RUNTIME_DOCS_URL =
    "https://docs.databricks.com/aws/en/release-notes/runtime/";

/**
 * New-issue page for the published environment constraints. Surfaced only as a
 * soft, conditional pointer in the log for a genuine `E_PROVISION` conflict —
 * not a button — because such a conflict is usually the user's own dependencies,
 * not a constraint defect (see the report-worthiness routing in reportSetupIssue).
 */
export const DATABRICKS_ENVIRONMENTS_NEW_ISSUE_URL =
    "https://github.com/databricks/environments/issues/new";

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
 * Command that flips `databricks.python.environmentSetup` to `manual` for the
 * current project. Surfaced as the E_FETCH remediation button so a user whose
 * network blocks the constraints host can opt out in one click. Defined here
 * (next to the action that references it) and reused by the command registration
 * so the two cannot drift.
 */
export const USE_MANUAL_SETUP_COMMAND_ID =
    "databricks.environment.useManualPythonSetup";

/**
 * An optional remediation button to attach to a failure popup. Exactly one of
 * `url` / `command` is set — a discriminated union (`?: never` on the other arm)
 * forbids both/neither at compile time, while still letting callers read
 * `action.url` / `action.command` as `string | undefined` without narrowing.
 * `url` opens an external page (docs, issue); `command` runs a VS Code command
 * (e.g. the one-click switch to manual setup). Kept alongside
 * {@link getPythonSetupErrorMessage} so the copy and its call-to-action live together.
 */
export type PythonSetupErrorAction =
    | {label: string; url: string; command?: never}
    | {label: string; command: string; url?: never};

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
        "Could not reach the runtime constraints on raw.githubusercontent.com, and no local cache is available. " +
        'If your network blocks it, allowlist that host — or set "databricks.python.environmentSetup" to ' +
        '"manual" to skip automated setup and use your existing environment.',
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
 * Documentation link per error code, surfaced both as the failure popup's
 * remediation button and — via {@link formatSetupFailureDetail} — in the output
 * channel. Sparse by design: codes whose fix no single page reliably explains
 * (E_USAGE, E_NOT_WRITABLE, E_WRITE, E_MERGE, E_VALIDATE, E_FETCH) are absent and
 * get the message alone rather than a link that might misdirect.
 *
 * `E_UV_MISSING` lives here so every code-keyed link takes one path; the
 * blocked-index variant of `E_PROVISION` cannot — it is told apart by the CLI's
 * message, not its code — so it is resolved ahead of this map (see below).
 */
/* eslint-disable @typescript-eslint/naming-convention */
const DOC_LINKS: Partial<Record<PythonSetupErrorCode, PythonSetupErrorAction>> =
    {
        E_UV_MISSING: {label: "Install uv", url: UV_INSTALL_DOCS_URL},
        E_MANAGER_UNSUPPORTED: {
            label: "Set up a uv project",
            url: UV_PROJECTS_DOCS_URL,
        },
        E_PYTHON_INSTALL: {
            label: "Install a Python version",
            url: UV_PYTHON_INSTALL_DOCS_URL,
        },
        E_PROVISION: {
            label: "Resolve dependency conflicts",
            url: UV_RESOLUTION_DOCS_URL,
        },
        E_NO_TARGET: {
            label: "Configure compute",
            url: DATABRICKS_CONFIGURE_DOCS_URL,
        },
        E_RESOLVE: {
            label: "Configure compute",
            url: DATABRICKS_CONFIGURE_DOCS_URL,
        },
        E_ENV_UNSUPPORTED: {
            label: "Databricks Runtime versions",
            url: DATABRICKS_RUNTIME_DOCS_URL,
        },
    };
/* eslint-enable @typescript-eslint/naming-convention */

/**
 * The remediation button / doc link for a failure, if any. A blocked index maps
 * to uv's index-config docs; every other link is keyed by error code via
 * {@link DOC_LINKS}. Codes absent from the map (e.g. E_USAGE, E_FETCH) are
 * actionable from the message and logs alone.
 */
export function getPythonSetupErrorAction(
    result: PythonSetupResult
): PythonSetupErrorAction | undefined {
    const err = result.error;
    if (!err) {
        return undefined;
    }
    // A blocked package index arrives as E_PROVISION and is distinguished by the
    // CLI's message, not its code — so resolve it before the code-keyed map,
    // ahead of E_PROVISION's generic dependency-conflict link.
    if (isIndexUnreachableFailure(result)) {
        return {label: "Configure package index", url: UV_INDEX_DOCS_URL};
    }
    // E_FETCH is the blocked-GitHub case (see the message/detail copy). Rather
    // than only pointing at the setting, offer a one-click switch to manual mode.
    if (err.code === "E_FETCH") {
        return {
            label: "Use manual setup",
            command: USE_MANUAL_SETUP_COMMAND_ID,
        };
    }
    return DOC_LINKS[err.code];
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
 *
 * `reportLink`, when given, is a "Report this problem" link mirrored into the log
 * so it outlives the dismissed notification — see the report-issue helpers.
 */
export function formatSetupFailureDetail(
    result: PythonSetupResult,
    reportLink?: PythonSetupErrorAction
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
    // E_FETCH means the published runtime constraints (on GitHub) were
    // unreachable and nothing was cached — most often a corporate network that
    // blocks raw.githubusercontent.com. Spell out both fixes here; the popup only
    // summarises them.
    if (err.code === "E_FETCH") {
        lines.push(
            "",
            "Automated setup downloads runtime constraints from raw.githubusercontent.com " +
                "(the databricks/environments repository), which your network appears to block. " +
                "You have two options:",
            "",
            "  1. Ask your network admin to allowlist raw.githubusercontent.com, then re-run setup.",
            '  2. Or skip automated setup and manage the environment yourself: set the "databricks.python.environmentSetup" ' +
                'setting to "manual". The extension then uses your existing interpreter/.venv (with its databricks-connect) as-is.'
        );
    }
    // A genuine E_PROVISION conflict gets no report button (it is usually the
    // user's own dependencies). But if the *published constraints* are what
    // conflict, that is a defect worth reporting — so offer a soft, conditional
    // pointer here. Excludes the blocked-index variant, a local network issue.
    if (err.code === "E_PROVISION" && !isIndexUnreachableFailure(result)) {
        lines.push(
            "",
            "If you believe this conflict comes from the published runtime " +
                "constraints rather than your own project dependencies, report " +
                `it to the environments repository: ${DATABRICKS_ENVIRONMENTS_NEW_ISSUE_URL}`
        );
    }
    // The same doc link the popup offers as a button, spelled out here so the URL
    // is reachable from the log even after the notification is dismissed. Only
    // url-actions have something to print; a command-action (e.g. the E_FETCH
    // "Use manual setup" button) has its guidance in the block above instead.
    const action = getPythonSetupErrorAction(result);
    if (action && action.url) {
        lines.push("", `${action.label}: ${action.url}`);
    }
    // The report link is mirrored here too (a bare new-issue URL, not the popup's
    // long pre-filled deep-link) so it survives the notification being dismissed.
    // It is additive to the doc link above: a report-worthy code can carry both.
    if (reportLink && reportLink.url) {
        lines.push("", `${reportLink.label}: ${reportLink.url}`);
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
