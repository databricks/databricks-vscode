import { WorkspacesClient } from "@databricks/sdk-workspaces/v1";
import type { Credentials } from "@databricks/sdk-auth";
import { ApiError } from "@databricks/sdk-core/apierror";
import type { HttpClient } from "@databricks/sdk-core/http";
import { ScimClient } from "@databricks/sdk-scim/v1";
import type { Logger } from "../../platform/log";
import type { ChildConnection } from "../cli/childEnv";
import { CliError } from "../cli/Cli";
import {
    AccountApiProfileError,
    AccountOnlyProfileError,
    accountOnlyError,
    isAccountApiHost,
    WebPageResponseError,
} from "./accountOnly";
import { runningWorkspaces, type AccountWorkspace } from "./accountWorkspaces";
import { pathValue } from "./pathValue";
import { ApiClients, calls, sdkLogger } from "./ApiClients";
import { nodeHttpClient } from "./nodeHttpClient";
import type { Connection } from "./ConnectionService";
import { credentialsFor, type CredentialSources } from "./credentials";
import type { HostMetadataCache } from "./hostMetadata";
import type { ProfileInfo } from "./Profiles";
import type { ConnectionSource, TargetWorkspace } from "./resolveConnection";
import { unreachableError } from "./unreachable";

/** What a connection is opened with: a profile's, or the environment's. */
export interface ConnectionTarget {
    readonly credentials: Credentials;
    readonly host: string;
    readonly workspaceId?: string;
    /** The profile's `account_id`: with no workspace ID, it may be signed in to the account only. */
    readonly accountId?: string;
    readonly profile?: string;
    readonly authType: string;
    readonly child: ChildConnection;
    readonly serverlessComputeId?: string;
    /** Where the workspace ID came from, when a bundle target gave it. */
    readonly targetWorkspace?: TargetWorkspace;
}

/**
 * The target for a profile with a host. Throws for an auth type the extension
 * can't use in-process. `targetWorkspace` is a bundle target's
 * workspace for a profile without one, which children get too.
 */
export function profileTarget(
    info: ProfileInfo,
    sources: CredentialSources,
    targetWorkspace?: TargetWorkspace,
): ConnectionTarget {
    const host = info.host!;
    const credentials = credentialsFor(
        {
            name: info.name,
            host,
            authType: info.authType,
            token: info.profile.token?.value,
            clientId: info.profile.clientId,
            clientSecret: info.profile.clientSecret?.value,
            accountId: info.accountId,
            azureTenantId: info.profile.extra?.azure_tenant_id,
        },
        sources,
    );
    const authType = info.authType ?? "unknown";
    const fromTarget = targetWorkspace?.workspaceId;
    return {
        credentials,
        host,
        workspaceId: info.workspaceId ?? fromTarget,
        ...(info.accountId !== undefined ? { accountId: info.accountId } : {}),
        profile: info.name,
        authType,
        child: {
            kind: "profile",
            host,
            profile: info.name,
            authType,
            ...(fromTarget !== undefined ? { workspaceId: fromTarget } : {}),
        },
        serverlessComputeId: info.profile.extra?.serverless_compute_id,
        ...(targetWorkspace !== undefined ? { targetWorkspace } : {}),
    };
}

export interface OpenConnectionDeps {
    readonly httpClient?: HttpClient;
    readonly hostMetadata: HostMetadataCache;
    readonly log: Logger;
}

/**
 * Builds the clients for a target and checks them with SCIM `me`. A profile
 * signed in to the account only fails with `AccountOnlyProfileError`, one
 * for account APIs with `AccountApiProfileError`.
 */
export async function openConnection(
    target: ConnectionTarget,
    source: ConnectionSource,
    deps: OpenConnectionDeps,
    signal: AbortSignal,
): Promise<Connection> {
    const { credentials, host, workspaceId, profile, authType, child, serverlessComputeId } =
        target;
    if (profile !== undefined && isAccountApiHost(host)) {
        throw new AccountApiProfileError(profile);
    }
    const recorder = new ResponseRecorder(deps.httpClient ?? nodeHttpClient());
    const api = new ApiClients({
        host,
        workspaceId,
        credentials,
        logger: sdkLogger(deps.log.child("sdk")),
        httpClient: recorder,
    });
    let me;
    try {
        me = await api.get(ScimClient).me({}, calls.read({ signal, connecting: true }));
    } catch (error) {
        const cause = recorder.webPage
            ? new WebPageResponseError(host, error)
            : (unreachableError(host, error) ?? error);
        throw await accountOnlyError(target, cause, deps.hostMetadata, signal);
    }
    return {
        host,
        workspaceId: workspaceId ?? recorder.orgId,
        profile,
        authType,
        userName: me.userName ?? "",
        source,
        api,
        ...(serverlessComputeId ? { serverlessComputeId } : {}),
        ...(target.targetWorkspace !== undefined
            ? { targetWorkspace: target.targetWorkspace }
            : {}),
        child,
    };
}

/** Whether a profile's credentials reach a workspace: `unknown` when the check itself failed. */
export type WorkspaceAccess = "ok" | "denied" | "unknown";

/**
 * Checks, before any login, that a target's credentials reach a workspace:
 * SCIM `Me` with `X-Databricks-Workspace-Id`. A 403 or 404 is `denied`; any
 * other failure (a 401, a server or network error) is logged and `unknown`,
 * so a valid ID is never blocked by the check.
 */
export async function checkWorkspaceAccess(
    target: ConnectionTarget,
    workspaceId: string,
    deps: OpenConnectionDeps,
    signal?: AbortSignal,
): Promise<WorkspaceAccess> {
    const api = new ApiClients({
        host: target.host,
        workspaceId,
        credentials: target.credentials,
        logger: sdkLogger(deps.log.child("sdk")),
        ...(deps.httpClient !== undefined ? { httpClient: deps.httpClient } : {}),
    });
    try {
        await api.get(ScimClient).me({}, calls.read({ signal, maxRetries: 0 }));
        return "ok";
    } catch (error) {
        if (
            error instanceof ApiError &&
            (error.httpStatusCode === 403 || error.httpStatusCode === 404)
        ) {
            return "denied";
        }
        deps.log.warn(`Can't check access to workspace ${workspaceId} on ${target.host}`, error);
        return "unknown";
    }
}

/** How long listing an account's workspaces may take: the list is optional, so the choice doesn't wait long. */
const LIST_WORKSPACES_TIMEOUT_MS = 10_000;

/**
 * The account's workspaces, with a target's credentials and no workspace
 * header. Its own `ApiClients`, as `checkWorkspaceAccess` has: the profile
 * isn't connected, so there is no `connection.api`. One try, not a read's
 * retries: a non-admin may not be allowed to list them, and some hosts answer
 * that with a 503.
 */
export async function listAccountWorkspaces(
    target: ConnectionTarget,
    accountId: string,
    deps: OpenConnectionDeps,
): Promise<AccountWorkspace[]> {
    const api = new ApiClients({
        host: target.host,
        credentials: target.credentials,
        logger: sdkLogger(deps.log.child("sdk")),
        ...(deps.httpClient !== undefined ? { httpClient: deps.httpClient } : {}),
    });
    const { workspaces = [] } = await api
        .get(WorkspacesClient)
        .listWorkspacesPublic(
            { accountId: pathValue(accountId) },
            calls.read({ maxRetries: 0, timeout: LIST_WORKSPACES_TIMEOUT_MS }),
        );
    return runningWorkspaces(workspaces);
}

/** What fixes a failed connection, when the user can. */
export type ConnectRemedy = "signInAgain" | "selectWorkspace";

/**
 * An expired OAuth session: the CLI can't refresh a U2M token, and `auth
 * login` fixes it. A profile signed in to the account only: choosing a
 * workspace does.
 */
export function connectRemedy(
    authType: string | undefined,
    error: unknown,
): ConnectRemedy | undefined {
    if (error instanceof AccountOnlyProfileError) {
        return "selectWorkspace";
    }
    return authType === "databricks-cli" && error instanceof CliError ? "signInAgain" : undefined;
}

/**
 * A session's token the workspace rejects, expired most likely: nothing in
 * the window renews it (the CLI sets it once), so
 * only a new session, started from a local window, does.
 */
export function sessionRemedy(error: unknown): "restartSession" | undefined {
    return error instanceof ApiError && error.httpStatusCode === 401 ? "restartSession" : undefined;
}

/**
 * Remembers `x-databricks-org-id`, the workspace ID that every workspace
 * response carries; the old extension read it from the SCIM `me` response.
 * And whether the last response was a web page rather than the API's JSON.
 */
class ResponseRecorder implements HttpClient {
    orgId?: string;
    webPage = false;

    constructor(private readonly base: HttpClient) {}

    async send(request: Parameters<HttpClient["send"]>[0]) {
        const response = await this.base.send(request);
        const orgId = response.headers.get("x-databricks-org-id");
        if (orgId) {
            this.orgId = orgId;
        }
        this.webPage =
            response.statusCode >= 200 &&
            response.statusCode < 300 &&
            (response.headers.get("content-type") ?? "").startsWith("text/html");
        return response;
    }
}
