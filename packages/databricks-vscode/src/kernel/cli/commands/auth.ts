import { z } from "zod";
import { UserFacingError } from "../../../platform/errors";
import { CliError, type Cli, type CliCallContext } from "../Cli";

/**
 * Upper bound for the browser challenge of `auth login`. The CLI's default
 * is an hour, and where the OAuth round trip can't complete (WSL can't open
 * the Windows browser or receive the callback) the sign-in would appear to
 * hang for that long (databricks-vscode#1917).
 */
export const LOGIN_TIMEOUT_SECONDS = 300;

export interface AuthLoginOptions {
    /** Without one, the CLI opens login.databricks.com to pick a workspace. */
    readonly host?: string;
    readonly profile?: string;
    /** For unified hosts; kept on re-login so the profile keeps its workspace. */
    readonly workspaceId?: string;
}

/** The `--host` value: no trailing slash, plus `?w=` for unified hosts. */
function loginHost(options: AuthLoginOptions & { readonly host: string }): string {
    let host = options.host.replace(/\/+$/, "");
    if (options.workspaceId) {
        host += `?w=${options.workspaceId}`;
    }
    return host;
}

export function authLoginArgs(options: AuthLoginOptions): string[] {
    // --host whenever it's known: with only --profile, a profile that doesn't
    // exist yet has no host, and the CLI opens login.databricks.com instead of
    // the workspace. Only the wizard's "Sign in via login.databricks.com"
    // leaves it out. --profile too, so a re-login targets the right profile
    // when several share a host (#1877).
    const args = ["auth", "login"];
    if (options.host !== undefined) {
        args.push("--host", loginHost({ ...options, host: options.host }));
    }
    if (options.profile) {
        args.push("--profile", options.profile);
    }
    args.push("--timeout", `${LOGIN_TIMEOUT_SECONDS}s`);
    return args;
}

/**
 * `databricks auth login`: the OAuth U2M browser flow. The CLI writes the
 * profile and caches the token; the extension writes neither.
 */
export async function authLogin(
    cli: Cli,
    options: AuthLoginOptions,
    ctx: CliCallContext,
): Promise<void> {
    try {
        await cli.exec(authLoginArgs(options), ctx);
    } catch (e) {
        if (!(e instanceof CliError)) {
            throw e;
        }
        // Single quotes: a unified host carries "?w=…", and an unquoted "?" is
        // a glob in zsh and bash, so the pasted command would fail.
        const host =
            options.host !== undefined
                ? ` --host '${loginHost({ ...options, host: options.host })}'`
                : "";
        const profile = options.profile ? ` --profile ${options.profile}` : "";
        const manual = `databricks auth login${host}${profile}`;
        throw new UserFacingError(
            "LOGIN_FAILED",
            `Login failed with Databricks CLI: ${e.message}. ` +
                `Try running \`${manual}\` in a terminal to complete the login, then reload.`,
            { cause: e },
        );
    }
}

const tokenOutput = z.object({
    access_token: z.string().min(1),
    token_type: z.string().optional(),
    expiry: z.string(),
});

export interface CliToken {
    readonly value: string;
    readonly type?: string;
    readonly expiry: Date;
}

/** `databricks auth token`: a cached U2M token, refreshed by the CLI when close to expiry. */
export async function authToken(cli: Cli, profile: string, ctx: CliCallContext): Promise<CliToken> {
    const { stdout } = await cli.exec(["auth", "token", "--profile", profile], ctx);
    let raw: unknown;
    try {
        raw = JSON.parse(stdout);
    } catch {
        throw new Error("Can't parse the output of databricks auth token");
    }
    const parsed = tokenOutput.parse(raw);
    const expiry = new Date(parsed.expiry);
    if (Number.isNaN(expiry.getTime())) {
        throw new Error(`Can't parse the token expiry: ${parsed.expiry}`);
    }
    return { value: parsed.access_token, type: parsed.token_type, expiry };
}
