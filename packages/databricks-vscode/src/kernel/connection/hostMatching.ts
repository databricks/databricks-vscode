/**
 * Workspace hosts: normalising, classifying by cloud, and deciding whether
 * two hosts are the same workspace. Ported from the old `utils/urlUtils.ts`.
 */

class UrlError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "UrlError";
    }
}

/** `https://<hostname>`, without path, query or trailing slash. Throws `UrlError`. */
export function normalizeHost(host: string): URL {
    const withScheme = /^https?:\/\//i.test(host) ? host : `https://${host}`;
    let url: URL;
    try {
        url = new URL(withScheme);
    } catch {
        throw new UrlError("Invalid host name");
    }
    if (url.protocol !== "https:") {
        throw new UrlError("Invalid protocol");
    }
    return new URL(`https://${url.hostname}`);
}

/** `normalizeHost` as a string without the trailing slash, or undefined when invalid. */
export function hostKey(host: string | undefined): string | undefined {
    if (host === undefined || host.trim() === "") {
        return undefined;
    }
    try {
        return normalizeHost(host.trim()).toString().replace(/\/$/, "");
    } catch {
        return undefined;
    }
}

/** The workspace a unified-host URL names with `?o=` or `?w=`, if any. */
export function workspaceIdFromHost(host: string): string | undefined {
    try {
        const url = new URL(/^https?:\/\//i.test(host) ? host : `https://${host}`);
        return url.searchParams.get("o") ?? url.searchParams.get("w") ?? undefined;
    } catch {
        return undefined;
    }
}

export interface WorkspaceRef {
    readonly host?: string;
    readonly workspaceId?: string;
}

/**
 * Whether two references name the same workspace. Scheme, case and trailing
 * slashes don't matter. Workspace IDs are compared only when both sides have
 * one, because on unified hosts one hostname serves many workspaces.
 */
export function sameWorkspace(a: WorkspaceRef, b: WorkspaceRef): boolean {
    const hostA = hostKey(a.host);
    if (hostA === undefined || hostA !== hostKey(b.host)) {
        return false;
    }
    const idA = a.workspaceId ?? (a.host ? workspaceIdFromHost(a.host) : undefined);
    const idB = b.workspaceId ?? (b.host ? workspaceIdFromHost(b.host) : undefined);
    return idA === undefined || idB === undefined || idA === idB;
}

export function isAzureHost(url: URL): boolean {
    return /(\.databricks\.azure\.us|\.databricks\.azure\.cn|\.azuredatabricks\.net)$/.test(
        url.hostname,
    );
}

export function isGcpHost(url: URL): boolean {
    return url.hostname.endsWith(".gcp.databricks.com");
}

export function isAwsHost(url: URL): boolean {
    return /(\.cloud\.databricks\.com|\.dev\.databricks\.com)$/.test(url.hostname);
}

/** Unified hosts: `*.databricks.com`, other than the AWS and GCP subdomains. */
export function isSpogHost(url: URL): boolean {
    return url.hostname.endsWith(".databricks.com") && !isAwsHost(url) && !isGcpHost(url);
}

/**
 * A host on a Databricks domain, of any cloud or a unified one. What only
 * Databricks could serve, such as a workspace's ID, is believed only of
 * these: any other server could claim anything.
 */
export function isDatabricksDomain(host: string): boolean {
    try {
        const url = normalizeHost(host);
        return isAwsHost(url) || isAzureHost(url) || isGcpHost(url) || isSpogHost(url);
    } catch {
        return false;
    }
}

export type ValidationResult = string | { message: string; type: "error" | "warning" } | undefined;

/** Validates the host typed into the sign-in wizard. Strings from `LoginWizard.ts`. */
export function validateDatabricksHost(host: string): ValidationResult {
    let url: URL;
    try {
        url = normalizeHost(host);
    } catch (e) {
        return (e as Error).message;
    }
    if (!isAzureHost(url) && !isGcpHost(url) && !isAwsHost(url) && !isSpogHost(url)) {
        return {
            message:
                "This is not a standard Databricks URL. Some features may not work as expected.",
            type: "warning",
        };
    }
    return undefined;
}

/**
 * The ways to create a profile for a host. Only what the CLI can write: OAuth
 * through `auth login`, and PAT through `configure`. Every cloud
 * supports both; other hosts get PAT only, as before.
 */
export function profileCreationMethods(url: URL): ("databricks-cli" | "pat")[] {
    if (isAzureHost(url) || isGcpHost(url) || isAwsHost(url) || isSpogHost(url)) {
        return ["databricks-cli", "pat"];
    }
    return ["pat"];
}
