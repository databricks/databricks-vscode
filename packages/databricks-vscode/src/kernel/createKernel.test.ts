import { newPatCredentials } from "@databricks/sdk-auth/credentials";
import { ScimClient } from "@databricks/sdk-scim/v1";
import https from "node:https";
import { describe, expect, it, vi } from "vitest";
import { ContextKeys } from "../platform/contextKeys";
import type { Logger } from "../platform/log";
import { Settings } from "../platform/settings";
import { StateStore } from "../platform/state";
import { FakeProcessRunner } from "../test-support/fakeCli";
import { FakeHttpClient, SCIM_ME } from "../test-support/fakeHttp";
import { fakeKernel, fakeLog, fakeMemento, fakeSettings } from "../test-support/fakes";
import { startLocalHttps, trustLocalCa } from "../test-support/localHttps";
import { useTempDirs } from "../test-support/tempDir";
import { when } from "../platform/reactive";
import { ApiClients, calls } from "./connection/ApiClients";
import { createKernel } from "./createKernel";

const tempDir = useTempDirs();

// No other test in this file sets the SDK's product, so what it sends comes from createKernel.
function kernel(
    version: string,
    log: Logger = fakeLog(),
    options: { settings?: Settings; env?: Record<string, string> } = {},
) {
    return createKernel({
        extension: {
            id: "databricks.databricks",
            version,
            logPath: "/nonexistent/logs",
            asAbsolutePath: (p) => `/ext/${p}`,
            cliVersion: "1.20.0",
            isDevelopment: false,
            globalStoragePath: "/nonexistent/storage",
        },
        state: new StateStore({ global: fakeMemento(), workspace: fakeMemento() }),
        settings:
            options.settings ??
            new Settings({
                getConfiguration: () => ({
                    get: () => undefined,
                    inspect: () => undefined,
                    update: async () => {},
                }),
                onDidChangeConfiguration: () => ({ dispose: () => {} }),
            }),
        contextKeys: new ContextKeys(async () => {}),
        log,
        runner: new FakeProcessRunner(),
        env: options.env ?? {},
    });
}

describe("createKernel", () => {
    it("names the extension and its version in the SDK clients' User-Agent", async () => {
        kernel("9.8.7").dispose();
        const http = new FakeHttpClient().on("GET", SCIM_ME, { body: { userName: "me" } });
        const clients = new ApiClients({
            host: "https://a.cloud.databricks.com",
            credentials: newPatCredentials("dapi-1"),
            httpClient: http,
        });
        await clients.get(ScimClient).me({}, calls.read());
        expect(http.requests[0]!.headers.get("User-Agent")).toContain("databricks-vscode/9.8.7");
    });

    it("logs a version that isn't semver instead of throwing", () => {
        const log = fakeLog();
        expect(() => kernel("not-a-version", log).dispose()).not.toThrow();
        expect(log.entries.filter((e) => e.level === "warn").map((e) => e.message)).toEqual([
            "Invalid extension version for User-Agent: not-a-version",
        ]);
    });

    it("sends a connection's requests through the node transport, not fetch", async () => {
        const local = await startLocalHttps((_req, res) => {
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ userName: "me" }));
        });
        // A profile's host drops its port, so the requests are sent to the local server here.
        const t = tempDir();
        const config = t.write(
            "databrickscfg",
            "[DEFAULT]\nhost = https://localhost\ntoken = dapi-test\n",
        );
        // The local certificate is pinned, and verification stays on: http.proxyStrictSSL is at its default.
        const restoreCa = trustLocalCa(local.ca);
        const settings = new Settings({
            getConfiguration: () => ({
                get: () => undefined,
                inspect: () => undefined,
                update: async () => {},
            }),
            onDidChangeConfiguration: () => ({ dispose: () => {} }),
        });
        const realRequest = https.request;
        const request = vi
            .spyOn(https, "request")
            .mockImplementation((url: unknown, options: unknown, callback: unknown) => {
                const target = new URL((url as URL).pathname + (url as URL).search, local.url);
                return realRequest(target, options as https.RequestOptions, callback as never);
            });
        const fetchSpy = vi.spyOn(globalThis, "fetch");
        const k = kernel("1.0.0", fakeLog(), {
            settings,
            env: { DATABRICKS_CONFIG_FILE: config },
        });
        try {
            k.start();
            await vi.waitFor(() => expect(k.connection.state.value.status).toBe("connected"));
            expect(request).toHaveBeenCalled();
            const options = request.mock.calls[0]?.[1] as Record<string, unknown>;
            expect(options.rejectUnauthorized).toBe(true);
            expect(options).not.toHaveProperty("agent");
            expect(fetchSpy).not.toHaveBeenCalled();
        } finally {
            k.dispose();
            restoreCa();
            await local.close();
            vi.restoreAllMocks();
        }
    });

    it("checks certificates as http.proxyStrictSSL says, read for each request", async () => {
        const local = await startLocalHttps((_req, res) => {
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ userName: "me" }));
        });
        const t = tempDir();
        const config = t.write(
            "databrickscfg",
            "[DEFAULT]\nhost = https://localhost\ntoken = dapi-test\n",
        );
        // The setting's own name, not the constant: a misspelt key would read the default.
        const values: Record<string, unknown> = { "http.proxyStrictSSL": false };
        const realRequest = https.request;
        const request = vi
            .spyOn(https, "request")
            .mockImplementation((url: unknown, options: unknown, callback: unknown) => {
                const target = new URL((url as URL).pathname + (url as URL).search, local.url);
                return realRequest(target, options as https.RequestOptions, callback as never);
            });
        // Nothing trusts the local certificate, so only the setting lets the connection through.
        const k = kernel("1.0.0", fakeLog(), {
            settings: fakeSettings(values),
            env: { DATABRICKS_CONFIG_FILE: config },
        });
        try {
            k.start();
            await vi.waitFor(() => expect(k.connection.state.value.status).toBe("connected"));
            const state = k.connection.state.value;
            if (state.status !== "connected") {
                throw new Error(state.status);
            }
            expect(request.mock.calls.at(-1)?.[1]).toMatchObject({ rejectUnauthorized: false });

            values["http.proxyStrictSSL"] = true;
            await expect(
                state.connection.api.get(ScimClient).me({}, calls.read()),
            ).rejects.toMatchObject({ code: "DEPTH_ZERO_SELF_SIGNED_CERT" });
            expect(request.mock.calls.at(-1)?.[1]).toMatchObject({ rejectUnauthorized: true });
        } finally {
            k.dispose();
            await local.close();
            vi.restoreAllMocks();
        }
    });
    it("keeps checking certificates when a workspace sets the deprecated databricks.proxy.strictSSL", async () => {
        const local = await startLocalHttps((_req, res) => {
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ userName: "me" }));
        });
        const t = tempDir();
        const config = t.write(
            "databrickscfg",
            "[DEFAULT]\nhost = https://localhost\ntoken = dapi-test\n",
        );
        const realRequest = https.request;
        const request = vi
            .spyOn(https, "request")
            .mockImplementation((url: unknown, options: unknown, callback: unknown) => {
                const target = new URL((url as URL).pathname + (url as URL).search, local.url);
                return realRequest(target, options as https.RequestOptions, callback as never);
            });
        // A repository's .vscode/settings.json can set it; nothing reads it any more.
        const settings = new Settings({
            getConfiguration: () => ({
                get: () => undefined,
                inspect: (key: string) =>
                    key === "proxy.strictSSL" ? { workspaceValue: false } : undefined,
                update: async () => {},
            }),
            onDidChangeConfiguration: () => ({ dispose: () => {} }),
        });
        const k = kernel("1.0.0", fakeLog(), {
            settings,
            env: { DATABRICKS_CONFIG_FILE: config },
        });
        try {
            k.start();
            await vi.waitFor(() => expect(request).toHaveBeenCalled());
            expect(request.mock.calls[0]?.[1]).toMatchObject({ rejectUnauthorized: true });
        } finally {
            k.dispose();
            await local.close();
            vi.restoreAllMocks();
        }
    });
});

describe("child environments, by call (certificate and proxy variables)", () => {
    const tempDir = useTempDirs();
    // A host env that sets every certificate and proxy variable.
    const hostEnv = {
        HOME: "/home/me",
        PATH: "/usr/bin",
        SSL_CERT_FILE: "/corp/bundle.pem",
        SSL_CERT_DIR: "/corp/certs",
        HTTP_PROXY: "http://env-http:1",
        HTTPS_PROXY: "http://env-https:2",
        NO_PROXY: "env.example.com",
        http_proxy: "http://lower-http:3",
        https_proxy: "http://lower-https:4",
        no_proxy: "lower.example.com",
    };
    const CERT_AND_PROXY = [
        "SSL_CERT_FILE",
        "SSL_CERT_DIR",
        "HTTP_PROXY",
        "HTTPS_PROXY",
        "NO_PROXY",
        "http_proxy",
        "https_proxy",
        "no_proxy",
    ];
    const pick = (env: Record<string, string | undefined> = {}) =>
        Object.fromEntries(CERT_AND_PROXY.filter((k) => k in env).map((k) => [k, env[k]]));
    const hostCertAndProxy = pick(hostEnv);
    const freshToken = JSON.stringify({
        access_token: "u2m",
        expiry: new Date(Date.now() + 3600_000).toISOString(),
    });

    /** A kernel whose host env is `hostEnv`, with `http.proxy` set or not. */
    function withSettings(httpProxy: string | undefined) {
        const dir = tempDir();
        const file = dir.write(
            ".databrickscfg",
            "[DEFAULT]\nhost = https://a.cloud.databricks.com\nauth_type = databricks-cli\n",
        );
        const http = new FakeHttpClient().on("GET", SCIM_ME, { body: { userName: "me" } });
        const settings = fakeSettings(httpProxy === undefined ? {} : { "http.proxy": httpProxy });
        const kernel = fakeKernel({
            env: { ...hostEnv, DATABRICKS_CONFIG_FILE: file },
            settings,
            httpClient: http,
        });
        kernel.runner.on(["auth", "token"], { stdout: freshToken });
        return kernel;
    }

    it("a U2M token refresh runs `auth token` with the host env, and without http.proxy (2.22.0)", async () => {
        const kernel = withSettings("http://setting:8080");
        kernel.start();
        await when(kernel.connection.state, (s) => s.status !== "connecting");
        const token = kernel.runner.calls.find(
            (c) => c.args[0] === "auth" && c.args[1] === "token",
        );
        expect(token).toBeDefined();
        expect(pick(token!.options.env)).toEqual(hostCertAndProxy);
        // The extension's config file still reaches the CLI.
        expect(token!.options.env!.DATABRICKS_CONFIG_FILE).toBe(kernel.configFile());
    });

    it("a CLI call from the kernel gets the curated certificate and proxy variables (2.22.0's CLI wrapper)", () => {
        const kernel = withSettings("http://setting:8080");
        expect(pick(kernel.childEnv({ connection: null, cli: true }))).toEqual({
            HTTP_PROXY: "http://setting:8080",
            HTTPS_PROXY: "http://setting:8080",
            NO_PROXY: "env.example.com",
        });
    });

    it("a per-call option reaches childEnv: `inherited` keeps the host env as it is", () => {
        const kernel = withSettings("http://setting:8080");
        expect(
            pick(kernel.childEnv({ connection: null, cli: true, environment: "inherited" })),
        ).toEqual(hostCertAndProxy);
    });

    it("a setup-local style child gets the host env with http.proxy over it", () => {
        const kernel = withSettings("http://setting:8080");
        expect(
            pick(kernel.childEnv({ connection: null, cli: true, environment: "hostAndProxy" })),
        ).toMatchObject({
            SSL_CERT_FILE: "/corp/bundle.pem",
            HTTP_PROXY: "http://setting:8080",
        });
    });
});
