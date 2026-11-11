import {
    newCachedTokenProvider,
    newTokenCredentials,
    type Credentials,
    type Token,
} from "@databricks/sdk-auth";
import { newM2mCredentials, newPatCredentials } from "@databricks/sdk-auth/credentials";
import { UserFacingError } from "../../../platform/errors";

export { azureCliTokenProvider } from "./azureCli";

const AUTH_DOCS_URL = "https://docs.databricks.com/dev-tools/vscode-ext/authentication.html";

/**
 * A profile whose auth type the extension can't use in-process. Its child
 * processes still work, because they resolve the profile themselves.
 */
export class UnsupportedAuthTypeError extends UserFacingError {
    constructor(profile: string, authType: string | undefined) {
        super(
            "UNSUPPORTED_AUTH_TYPE",
            `The Databricks extension can't sign in with profile '${profile}': its auth type ` +
                `'${authType ?? "unknown"}' isn't supported. Use OAuth or a personal access token instead ` +
                `(${AUTH_DOCS_URL}).`,
        );
    }
}

export interface CredentialSources {
    /** `databricks auth token --profile <p>` through the bundled CLI. */
    u2mToken(profile: string): Promise<Token>;
    /** `az account get-access-token`. */
    azureCliToken(tenantId?: string): Promise<Token>;
}

export interface CredentialProfile {
    readonly name: string;
    readonly host: string;
    readonly authType?: string;
    readonly token?: string;
    readonly clientId?: string;
    readonly clientSecret?: string;
    readonly accountId?: string;
    readonly azureTenantId?: string;
}

/**
 * Builds the credentials for a profile, by its auth type. The SDK caches no
 * token by itself, so every token credential is wrapped in its cache, which
 * refreshes a token in the background before it expires: without it, U2M
 * would run `databricks auth token` and M2M exchange a token on every call.
 */
export function credentialsFor(
    profile: CredentialProfile,
    sources: CredentialSources,
): Credentials {
    switch (profile.authType) {
        case "pat":
            if (!profile.token) {
                throw new UserFacingError("NO_TOKEN", `Profile '${profile.name}' has no token.`);
            }
            return newPatCredentials(profile.token);
        case "oauth-m2m": {
            if (!profile.clientId || !profile.clientSecret) {
                throw new UserFacingError(
                    "NO_CLIENT_SECRET",
                    `Profile '${profile.name}' has no client ID or secret.`,
                );
            }
            const m2m = newM2mCredentials({
                host: profile.host,
                clientId: profile.clientId,
                clientSecret: profile.clientSecret,
                ...(profile.accountId ? { accountId: profile.accountId } : {}),
            });
            return newTokenCredentials("oauth-m2m", newCachedTokenProvider(m2m));
        }
        case "databricks-cli":
            return newTokenCredentials(
                "databricks-cli",
                newCachedTokenProvider({ token: () => sources.u2mToken(profile.name) }),
            );
        case "azure-cli":
            return newTokenCredentials(
                "azure-cli",
                newCachedTokenProvider({
                    token: () => sources.azureCliToken(profile.azureTenantId),
                }),
            );
        default:
            throw new UnsupportedAuthTypeError(profile.name, profile.authType);
    }
}
