import { ApiError } from "@databricks/sdk-core/apierror";
import { UserFacingError } from "../../platform/errors";
import type { HostMetadataCache } from "./hostMetadata";

/**
 * Profiles signed in to an account on a unified host, but not to one of its
 * workspaces: `account_id` without `workspace_id`. Without a terminal, `auth
 * login` on a unified host can't ask which workspace, and saves such a
 * profile. Its requests then reach the account API, which refuses SCIM `Me`
 * with an account-admin error that points at the wrong fix.
 */

/** How the host was confirmed as unified: by its metadata, or assumed when that can't be read. */
export type HostMetadataResult = "unified" | "unavailable";

/** The connection's error for such a profile. Its remedy is "Select a workspace". */
export class AccountOnlyProfileError extends UserFacingError {
    constructor(
        readonly profile: string,
        readonly host: string,
        readonly hostMetadata: HostMetadataResult,
        cause?: unknown,
    ) {
        super(
            "ACCOUNT_ONLY_PROFILE",
            `Profile '${profile}' is signed in to the account on ${host}, not to one of its workspaces. Select a workspace to use with it.`,
            { cause },
        );
    }
}

/**
 * A personal access token profile with no workspace, on a unified host. The
 * token reaches the account, not a workspace, and nothing in the extension can
 * choose one for it, so its reason says so; the remedy stays with the user.
 */
export class NoWorkspaceProfileError extends UserFacingError {
    constructor(
        readonly profile: string,
        readonly host: string,
        cause?: unknown,
    ) {
        super(
            "NO_WORKSPACE_PROFILE",
            `Profile '${profile}' names no workspace on ${host}, which serves several. A personal access token can't connect without one.`,
            { cause },
        );
    }
}

/** A profile for account APIs, on an `accounts.*` host, where no workspace can be chosen. */
export class AccountApiProfileError extends UserFacingError {
    constructor(readonly profile: string) {
        super(
            "ACCOUNT_API_PROFILE",
            `Profile '${profile}' is for account APIs; pick a workspace profile.`,
        );
    }
}

/**
 * An API call answered with a web page (2xx, `text/html`) instead of JSON, as
 * some hosts answer SCIM `Me` from a profile signed in to the account only. The
 * SDK can't parse it, and would report "[object Object]".
 */
export class WebPageResponseError extends Error {
    constructor(
        readonly host: string,
        cause?: unknown,
    ) {
        super(`${host} answered with a web page, not the Databricks API.`, { cause });
        this.name = "WebPageResponseError";
    }
}

/** The account console's hosts, such as `accounts.cloud.databricks.com`. */
export function isAccountApiHost(host: string): boolean {
    try {
        return /^accounts(-dod)?\./.test(new URL(host).hostname);
    } catch {
        return false;
    }
}

/** A profile, or a target, that names an account and no workspace. */
export function isAccountOnly(p: {
    readonly accountId?: string;
    readonly workspaceId?: string;
}): boolean {
    return p.accountId !== undefined && p.workspaceId === undefined;
}

/** What detection needs to know about the profile a connection was opened with. */
export interface AccountOnlyCandidate {
    readonly profile?: string;
    readonly host: string;
    readonly accountId?: string;
    readonly workspaceId?: string;
    readonly authType?: string;
}

/** The check was refused: a 401 or 403, or a web page, as some hosts answer an account-only token. */
function isRefusal(error: unknown): boolean {
    return (
        error instanceof WebPageResponseError ||
        (error instanceof ApiError &&
            (error.httpStatusCode === 401 || error.httpStatusCode === 403))
    );
}

/**
 * The error for a connection check (SCIM `Me`) that failed, when the check was
 * refused and the host is unified:
 * - a profile that names an account but no workspace gets an
 *   `AccountOnlyProfileError` (remedy: select a workspace), also when the
 *   host's metadata can't be read;
 * - a personal access token profile that names no workspace and no account
 *   gets a `NoWorkspaceProfileError`, only when the metadata says unified.
 * Unified is decided by the host's metadata, never by the error's text.
 * Otherwise `error` itself.
 */
export async function accountOnlyError(
    target: AccountOnlyCandidate,
    error: unknown,
    metadata: HostMetadataCache,
    signal?: AbortSignal,
): Promise<unknown> {
    if (target.profile === undefined || !isRefusal(error)) {
        return error;
    }
    const accountOnly = isAccountOnly(target);
    const noWorkspacePat =
        !accountOnly &&
        target.accountId === undefined &&
        target.workspaceId === undefined &&
        target.authType === "pat";
    if (!accountOnly && !noWorkspacePat) {
        return error;
    }
    const meta = await metadata.get(target.host, signal);
    if (meta === undefined) {
        return accountOnly
            ? new AccountOnlyProfileError(target.profile, target.host, "unavailable", error)
            : error;
    }
    if (meta.hostType !== "unified") {
        return error;
    }
    return accountOnly
        ? new AccountOnlyProfileError(target.profile, target.host, "unified", error)
        : new NoWorkspaceProfileError(target.profile, target.host, error);
}
