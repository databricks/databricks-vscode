import {
    PythonSetupResult,
    PythonSetupErrorCode,
} from "../models/PythonSetupResult";
import {PrimaryManager} from "../../language/packageManagerDetection";
import {
    PythonSetupErrorAction,
    isIndexUnreachableFailure,
} from "./errorMessages";

/**
 * The two GitHub repositories a post-preflight setup-local failure can be
 * reported against. A failure is only ever "report-worthy" when it points at a
 * defect we own — a bad published constraint (`databricks/environments`) or a
 * bug in the extension/CLI wiring (`databricks/databricks-vscode`) — never a
 * local/user/network condition, which stays actionable from the message alone.
 */
export type ReportRepo =
    | "databricks/environments"
    | "databricks/databricks-vscode";

/**
 * Post-preflight error codes that indicate a defect worth reporting, and the
 * repo each belongs to. Deliberately a closed allowlist: every code absent here
 * (the preflight/local/network set — E_UV_MISSING, E_USAGE, E_NO_TARGET,
 * E_MANAGER_UNSUPPORTED, E_NOT_WRITABLE, E_PYTHON_INSTALL, E_FETCH, E_RESOLVE)
 * is user- or environment-fixable and gets no report prompt.
 *
 * - Constraint-content defects → `databricks/environments`: the published
 *   constraints have no entry for the runtime, don't resolve, or don't validate.
 * - Extension/CLI behaviour defects → `databricks/databricks-vscode`: merging
 *   into or writing the user's pyproject.toml broke.
 */
/* eslint-disable @typescript-eslint/naming-convention */
const REPORT_ROUTING: Partial<Record<PythonSetupErrorCode, ReportRepo>> = {
    E_ENV_UNSUPPORTED: "databricks/environments",
    E_PROVISION: "databricks/environments",
    E_VALIDATE: "databricks/environments",
    E_MERGE: "databricks/databricks-vscode",
    E_WRITE: "databricks/databricks-vscode",
};
/* eslint-enable @typescript-eslint/naming-convention */

/**
 * Static, session-scoped context stamped into every report so a maintainer sees
 * which build produced the failure. Injected (not read from globals) so the
 * URL builders stay pure and unit-testable. `platform` is `process.platform`.
 */
export interface ReportEnvironment {
    extensionVersion: string;
    cliVersion?: string;
    platform: string;
    packageManager?: PrimaryManager;
}

/** Cap on the redacted stderr embedded in a report, so the deep-link URL stays
 * well under GitHub's practical query-length limit even after URL-encoding. */
const REPORT_STDERR_BUDGET = 1200;

/** The label shared by every "Report this problem" affordance, so the button and
 * its log mirror never drift apart. */
export const REPORT_ACTION_LABEL = "Report this problem";

/**
 * The repo a failed result should be reported against, or `undefined` when the
 * failure is not report-worthy. A blocked package index arrives as `E_PROVISION`
 * but is a local network condition, not a constraint defect — so it is excluded
 * even though `E_PROVISION` is otherwise routed (matching the same distinction
 * {@link isIndexUnreachableFailure} draws for the error copy).
 */
export function reportRepoForResult(
    result: PythonSetupResult
): ReportRepo | undefined {
    const err = result.error;
    if (!err) {
        return undefined;
    }
    if (isIndexUnreachableFailure(result)) {
        return undefined;
    }
    return REPORT_ROUTING[err.code];
}

/** Whether a failed result should surface a "Report this problem" affordance. */
export function isReportWorthy(result: PythonSetupResult): boolean {
    return reportRepoForResult(result) !== undefined;
}

/**
 * Best-effort scrub of CLI stderr before it is embedded in a public issue: no
 * usernames, local paths, tokens, or emails. This is defence-in-depth, not the
 * sole guard — the deep-link only *pre-fills* GitHub's new-issue form, which the
 * user reviews and submits themselves. The tail is kept (uv prints its
 * resolution summary last) and marked when truncated to the length budget.
 */
export function redactSetupStderr(
    raw: string,
    maxLength: number = 2000
): string {
    let out = raw
        // Emails first: an address never spans a path separator, so running it
        // ahead of the path rules can't be undone by them.
        .replace(
            /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
            "<redacted-email>"
        )
        // Databricks personal access tokens and bearer credentials.
        .replace(/dapi[A-Za-z0-9]{10,}/gi, "<redacted-token>")
        .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer <redacted-token>")
        // Home-directory paths: keep the shape, drop the username segment.
        .replace(/([A-Za-z]:\\Users\\)([^\\/\s"']+)/gi, "$1<redacted>")
        .replace(/(\/Users\/)([^/\s"']+)/g, "$1<redacted>")
        .replace(/(\/home\/)([^/\s"']+)/g, "$1<redacted>");

    if (out.length > maxLength) {
        out = "…[truncated]\n" + out.slice(out.length - maxLength);
    }
    return out;
}

/** The bare new-issue page for a repo — used for the readable log mirror (the
 * button carries the full pre-filled deep-link instead). */
export function reportNewIssueBaseUrl(repo: ReportRepo): string {
    return `https://github.com/${repo}/issues/new`;
}

/**
 * The report link mirrored into the failure log as a {@link PythonSetupErrorAction}
 * (for {@link formatSetupFailureDetail}'s report-line param) — the readable bare
 * new-issue URL, not the popup's long pre-filled deep-link.
 */
export function reportLogLink(repo: ReportRepo): PythonSetupErrorAction {
    return {label: REPORT_ACTION_LABEL, url: reportNewIssueBaseUrl(repo)};
}

/**
 * The same report link as a ready-to-append log block, for failure paths that
 * have no {@link formatSetupFailureDetail} of their own (spawn/parse, adopt).
 */
export function reportLogMirror(repo: ReportRepo): string {
    return `\n${REPORT_ACTION_LABEL}: ${reportNewIssueBaseUrl(repo)}\n`;
}

function buildReportBody(ctx: {
    errorCode?: string;
    failurePhase?: string;
    envKey?: string;
    env: ReportEnvironment;
    redactedStderr?: string;
}): string {
    const lines = [
        "Automated setup of the local Python environment failed after its " +
            "pre-flight checks. The details below were collected automatically " +
            "(local paths, usernames, and credentials redacted). Please add " +
            "anything else that helps us reproduce it.",
        "",
    ];
    const field = (label: string, value?: string) => {
        if (value !== undefined && value.length > 0) {
            lines.push(`**${label}:** ${value}`);
        }
    };
    field("Error code", ctx.errorCode);
    field("Failing phase", ctx.failurePhase);
    field("Environment key", ctx.envKey);
    field("Package manager", ctx.env.packageManager);
    field("Extension version", ctx.env.extensionVersion);
    field("CLI version", ctx.env.cliVersion);
    field("OS", ctx.env.platform);
    if (ctx.redactedStderr !== undefined && ctx.redactedStderr.length > 0) {
        lines.push(
            "",
            "### CLI output (auto-redacted)",
            "```",
            ctx.redactedStderr,
            "```"
        );
    }
    return lines.join("\n");
}

/**
 * The pre-filled GitHub new-issue deep-link for a report. Title and body are
 * URL-encoded so the query carries no raw whitespace or newlines.
 */
export function buildSetupReportUrl(ctx: {
    repo: ReportRepo;
    errorCode?: string;
    failurePhase?: string;
    envKey?: string;
    env: ReportEnvironment;
    redactedStderr?: string;
}): string {
    const phasePart = ctx.failurePhase
        ? ` in the ${ctx.failurePhase} phase`
        : "";
    const title = `[setup-local] ${ctx.errorCode ?? "failure"}${phasePart}`;
    const body = buildReportBody(ctx);
    return (
        `${reportNewIssueBaseUrl(ctx.repo)}?title=${encodeURIComponent(
            title
        )}` + `&body=${encodeURIComponent(body)}`
    );
}

/**
 * The "Report this problem" button/link for a CLI-reported failure, or
 * `undefined` when the failure is not report-worthy. Reuses
 * {@link PythonSetupErrorAction} so the notification seam opens it exactly like
 * a doc link.
 */
export function getPythonSetupReportAction(
    result: PythonSetupResult,
    env: ReportEnvironment
): PythonSetupErrorAction | undefined {
    const repo = reportRepoForResult(result);
    if (!repo) {
        return undefined;
    }
    const err = result.error!;
    return {
        label: REPORT_ACTION_LABEL,
        url: buildSetupReportUrl({
            repo,
            errorCode: err.code,
            failurePhase: err.failurePhase,
            envKey: result.compute?.envKey,
            env,
            redactedStderr: redactSetupStderr(
                err.message,
                REPORT_STDERR_BUDGET
            ),
        }),
    };
}

/**
 * The "Report this problem" action for an extension-side failure with no CLI
 * result — a spawn/parse error or a post-CLI adopt failure. These are always
 * the extension's own defect, so they route to `databricks/databricks-vscode`.
 */
export function buildExtensionFailureReportAction(
    env: ReportEnvironment,
    opts: {phase: string; message: string}
): PythonSetupErrorAction {
    return {
        label: REPORT_ACTION_LABEL,
        url: buildSetupReportUrl({
            repo: "databricks/databricks-vscode",
            failurePhase: opts.phase,
            env,
            redactedStderr: redactSetupStderr(
                opts.message,
                REPORT_STDERR_BUDGET
            ),
        }),
    };
}
