import type { Credentials } from "@databricks/sdk-auth";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FakeProcessRunner } from "../../../test-support/fakeCli";
import { azureCliArgs, azureCliTokenProvider, parseAzureCliToken } from "./azureCli";
import { credentialsFor, UnsupportedAuthTypeError } from "./index";

describe("credentialsFor", () => {
    const sources = {
        u2mToken: vi.fn(async () => ({
            value: "u2m-token",
            expiry: new Date(Date.now() + 3600_000),
        })),
        azureCliToken: vi.fn(async () => ({ value: "az-token" })),
    };
    const base = { name: "p", host: "https://a.cloud.databricks.com" };

    it("PAT: a bearer token", async () => {
        const c = credentialsFor({ ...base, authType: "pat", token: "dapi-1" }, sources);
        expect(await c.authHeaders()).toEqual([{ key: "Authorization", value: "Bearer dapi-1" }]);
    });

    it("U2M: the CLI's token, cached", async () => {
        const c = credentialsFor({ ...base, authType: "databricks-cli" }, sources);
        await c.authHeaders();
        expect(await c.authHeaders()).toEqual([
            { key: "Authorization", value: "Bearer u2m-token" },
        ]);
        expect(sources.u2mToken).toHaveBeenCalledTimes(1);
        expect(sources.u2mToken).toHaveBeenCalledWith("p");
    });

    it("Azure CLI: the az token, with the profile's tenant", async () => {
        const c = credentialsFor(
            { ...base, authType: "azure-cli", azureTenantId: "tenant" },
            sources,
        );
        expect(await c.authHeaders()).toEqual([{ key: "Authorization", value: "Bearer az-token" }]);
        expect(sources.azureCliToken).toHaveBeenCalledWith("tenant");
    });

    it("M2M: needs a client ID and secret", () => {
        expect(() =>
            credentialsFor({ ...base, authType: "oauth-m2m", clientId: "id" }, sources),
        ).toThrow(/client ID or secret/);
        expect(
            credentialsFor(
                { ...base, authType: "oauth-m2m", clientId: "id", clientSecret: "s" },
                sources,
            ).name(),
        ).toBe("oauth-m2m");
    });

    it("refuses the auth types it can't use in-process, naming the profile", () => {
        for (const authType of ["google-id", "azure-msi", undefined]) {
            expect(() => credentialsFor({ ...base, authType }, sources)).toThrow(
                UnsupportedAuthTypeError,
            );
        }
    });
});

describe("token caching", () => {
    const base = { name: "p", host: "https://a.cloud.databricks.com" };
    const token = (value: string, lifetimeMs: number) => ({
        value,
        expiry: new Date(Date.now() + lifetimeMs),
    });
    const bearer = async (c: Credentials) => (await c.authHeaders())[0]?.value;
    const u2m = (u2mToken: () => Promise<{ value: string; expiry?: Date }>) =>
        credentialsFor(
            { ...base, authType: "databricks-cli" },
            { u2mToken, azureCliToken: vi.fn() },
        );

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it("makes one request for concurrent callers", async () => {
        let release!: () => void;
        const gate = new Promise<void>((r) => (release = r));
        const u2mToken = vi.fn(async () => {
            await gate;
            return token("t", 3600_000);
        });
        const c = u2m(u2mToken);
        const all = Promise.all([bearer(c), bearer(c), bearer(c)]);
        release();
        expect(await all).toEqual(["Bearer t", "Bearer t", "Bearer t"]);
        expect(u2mToken).toHaveBeenCalledTimes(1);
    });

    it("doesn't keep a failure: the next call asks again", async () => {
        const u2mToken = vi
            .fn()
            .mockRejectedValueOnce(new Error("expired"))
            .mockResolvedValueOnce(token("t", 3600_000));
        const c = u2m(u2mToken);
        await expect(c.authHeaders()).rejects.toThrow("expired");
        expect(await bearer(c)).toBe("Bearer t");
    });

    it("refreshes a token in the background before it expires, without making the caller wait", async () => {
        vi.useFakeTimers({ now: 0, toFake: ["Date"] });
        let n = 0;
        const u2mToken = vi.fn(async () => token(`t${++n}`, 10 * 60_000));
        const c = u2m(u2mToken);
        expect(await bearer(c)).toBe("Bearer t1");
        expect(await bearer(c)).toBe("Bearer t1");
        expect(u2mToken).toHaveBeenCalledTimes(1);
        // Past half of its life, a call still gets the old token and starts a refresh.
        vi.setSystemTime(6 * 60_000);
        expect(await bearer(c)).toBe("Bearer t1");
        await vi.waitFor(async () => expect(await bearer(c)).toBe("Bearer t2"));
        expect(u2mToken).toHaveBeenCalledTimes(2);
    });

    it("keeps a token whose refresh fails until it expires, then fails the call", async () => {
        vi.useFakeTimers({ now: 0, toFake: ["Date"] });
        const u2mToken = vi
            .fn()
            .mockResolvedValueOnce(token("t1", 10 * 60_000))
            .mockRejectedValue(new Error("refresh token is invalid"));
        const c = u2m(u2mToken);
        expect(await bearer(c)).toBe("Bearer t1");
        vi.setSystemTime(6 * 60_000);
        expect(await bearer(c)).toBe("Bearer t1");
        await vi.waitFor(() => expect(u2mToken).toHaveBeenCalledTimes(2));
        expect(await bearer(c)).toBe("Bearer t1");
        vi.setSystemTime(10 * 60_000 + 1);
        await expect(c.authHeaders()).rejects.toThrow("refresh token is invalid");
    });

    it("caches the Azure CLI and M2M tokens too", async () => {
        const azureCliToken = vi.fn(async () => token("az", 3600_000));
        const az = credentialsFor(
            { ...base, authType: "azure-cli" },
            { u2mToken: vi.fn(), azureCliToken },
        );
        await bearer(az);
        expect(await bearer(az)).toBe("Bearer az");
        expect(azureCliToken).toHaveBeenCalledTimes(1);

        // M2M discovers its token endpoint and asks it for a token, through the SDK's own requests.
        let issued = 0;
        vi.stubGlobal(
            "fetch",
            vi.fn(async (url: string | URL) => {
                const u = String(url);
                if (u.endsWith("/.well-known/databricks-config")) {
                    return Response.json({ oidc_endpoint: `${base.host}/oidc` });
                }
                if (u.endsWith("/oidc/.well-known/oauth-authorization-server")) {
                    return Response.json({ token_endpoint: `${base.host}/oidc/v1/token` });
                }
                if (u.endsWith("/oidc/v1/token")) {
                    issued++;
                    return Response.json({ access_token: `m2m-${issued}`, expires_in: 3600 });
                }
                return new Response("not found", { status: 404 });
            }),
        );
        const m2m = credentialsFor(
            { ...base, authType: "oauth-m2m", clientId: "id", clientSecret: "s" },
            { u2mToken: vi.fn(), azureCliToken: vi.fn() },
        );
        await bearer(m2m);
        expect(await bearer(m2m)).toBe("Bearer m2m-1");
        expect(issued).toBe(1);
    });
});

describe("Azure CLI", () => {
    it("asks for a token for the Azure Databricks resource", () => {
        expect(azureCliArgs("t")).toEqual([
            "account",
            "get-access-token",
            "--resource",
            "2ff814a6-3304-4ab8-85cb-cd0e6f879c1d",
            "--output",
            "json",
            "--tenant",
            "t",
        ]);
    });

    it("prefers expires_on, the epoch seconds", () => {
        const token = parseAzureCliToken(
            JSON.stringify({
                accessToken: "a",
                tokenType: "Bearer",
                expiresOn: "2026-10-02 17:33:00.000000",
                expires_on: 1790000000,
            }),
        );
        expect(token).toEqual({ value: "a", type: "Bearer", expiry: new Date(1790000000 * 1000) });
    });

    it("passes a tenant ID or a domain name to az", () => {
        expect(azureCliArgs("72f988bf-86f1-41af-91ab-2d7cd011db47").slice(-2)).toEqual([
            "--tenant",
            "72f988bf-86f1-41af-91ab-2d7cd011db47",
        ]);
        expect(azureCliArgs("contoso.onmicrosoft.com").slice(-2)).toEqual([
            "--tenant",
            "contoso.onmicrosoft.com",
        ]);
    });

    it("takes a tenant written in quotes, as the shell and the CLI read it", () => {
        expect(azureCliArgs('"72f988bf-86f1-41af-91ab-2d7cd011db47"').slice(-2)).toEqual([
            "--tenant",
            "72f988bf-86f1-41af-91ab-2d7cd011db47",
        ]);
        expect(azureCliArgs("'contoso.onmicrosoft.com'").slice(-2)).toEqual([
            "--tenant",
            "contoso.onmicrosoft.com",
        ]);
    });

    it("refuses a tenant that would reach az's shell as a command, and runs nothing", async () => {
        const runner = new FakeProcessRunner();
        for (const tenant of [
            "t; touch /tmp/x",
            "t && calc",
            "$(id)",
            "t`id`",
            "t | x",
            "t\nid",
            't" x',
        ]) {
            await expect(
                azureCliTokenProvider(runner, { tenantId: tenant }).token(),
            ).rejects.toThrow(
                `The profile's azure_tenant_id "${tenant}" isn't a tenant ID or a domain name.`,
            );
        }
        expect(runner.calls).toEqual([]);
    });

    it("reports az's error", async () => {
        const runner = new FakeProcessRunner().on(["account"], {
            exitCode: 1,
            stderr: "Please run 'az login'",
        });
        await expect(azureCliTokenProvider(runner, {}).token()).rejects.toThrow(
            "Please run 'az login'",
        );
        expect(runner.calls[0]).toMatchObject({ command: "az", options: { shell: true } });
    });
});
