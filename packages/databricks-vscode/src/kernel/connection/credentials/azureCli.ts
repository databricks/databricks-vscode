import { z } from "zod";
import type { Token, TokenProvider } from "@databricks/sdk-auth";
import type { ProcessRunner } from "../../../platform/process";

/** The Azure Databricks application, the resource every workspace token is for. */
const AZURE_DATABRICKS_RESOURCE_ID = "2ff814a6-3304-4ab8-85cb-cd0e6f879c1d";

const output = z.object({
    accessToken: z.string().min(1),
    tokenType: z.string().optional(),
    /** Seconds since the epoch; newer `az` versions only. */
    expires_on: z.number().optional(),
    /** Local time, "2026-10-02 17:33:00.000000". */
    expiresOn: z.string().optional(),
});

/** A tenant ID (a GUID) or a domain name, such as `contoso.onmicrosoft.com`. */
const TENANT = /^[A-Za-z0-9][A-Za-z0-9.-]*$/;

/**
 * `az` runs in a shell (see below), which would read anything but a tenant ID
 * or a domain name in the profile's `azure_tenant_id` as shell syntax. The
 * config file can come from a workspace setting
 * (`databricks.overrideDatabricksConfigFile`), so any other value is refused.
 */
export function azureCliArgs(tenantId?: string): string[] {
    const args = [
        "account",
        "get-access-token",
        "--resource",
        AZURE_DATABRICKS_RESOURCE_ID,
        "--output",
        "json",
    ];
    if (tenantId) {
        // The config parser keeps quotes around a value; the CLI and the shell drop one pair.
        const tenant = /^(["'])(.*)\1$/.exec(tenantId)?.[2] ?? tenantId;
        if (!TENANT.test(tenant)) {
            throw new Error(
                `The profile's azure_tenant_id "${tenantId}" isn't a tenant ID or a domain name.`,
            );
        }
        args.push("--tenant", tenant);
    }
    return args;
}

/** Parses `az account get-access-token`. */
export function parseAzureCliToken(stdout: string): Token {
    const parsed = output.parse(JSON.parse(stdout));
    let expiry: Date | undefined;
    if (parsed.expires_on !== undefined) {
        expiry = new Date(parsed.expires_on * 1000);
    } else if (parsed.expiresOn !== undefined) {
        // Local time without a zone, which `Date` reads as local time.
        expiry = new Date(parsed.expiresOn.replace(" ", "T"));
    }
    return {
        value: parsed.accessToken,
        ...(parsed.tokenType ? { type: parsed.tokenType } : {}),
        ...(expiry !== undefined && !Number.isNaN(expiry.getTime()) ? { expiry } : {}),
    };
}

/**
 * Tokens from the Azure CLI (`auth_type = azure-cli`), which the modular SDK
 * lacks. `az` must be signed in already; the extension
 * doesn't run `az login`.
 */
export function azureCliTokenProvider(
    runner: ProcessRunner,
    options: { readonly tenantId?: string; readonly env?: Record<string, string> },
): TokenProvider {
    return {
        async token() {
            // A bare `az` on PATH, which is `az.cmd` on Windows, needs a shell.
            const result = await runner.run("az", azureCliArgs(options.tenantId), {
                shell: true,
                env: options.env,
                closeStdin: true,
            });
            if (result.exitCode !== 0) {
                throw new Error(
                    `Can't get an Azure CLI token: ${result.stderr.trim() || `az exited with code ${result.exitCode}`}`,
                );
            }
            return parseAzureCliToken(result.stdout);
        },
    };
}
