import * as assert from "assert";
import * as https from "node:https";
import * as http from "node:http";
import * as tls from "node:tls";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {reset, spy, when} from "ts-mockito";
import {HttpsProxyAgent} from "https-proxy-agent";
import {HttpProxyAgent} from "http-proxy-agent";
import {workspaceConfigs} from "../../vscode-objs/WorkspaceConfigs";
import {WorkspaceClient} from "@databricks/sdk-experimental";
import {
    applyProxyStrictSSLEnv,
    createWorkspaceClient,
    getDatabricksHttpAgent,
    resetProxyAgentCaches,
    setSystemCertificatesLoaderForTests,
    strictSSL,
} from "./proxyAgent";

// A syntactically-valid but throwaway PEM used to assert it lands in the agent's
// `ca` list. It never has to verify anything — the tests only check membership.
const FAKE_CA_PEM =
    "-----BEGIN CERTIFICATE-----\nMIIBFake\n-----END CERTIFICATE-----\n";

describe(__filename, () => {
    let configsSpy: typeof workspaceConfigs;
    let existingEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
        existingEnv = Object.assign({}, process.env);
        resetProxyAgentCaches();
        configsSpy = spy(workspaceConfigs);
        // Defaults: strict SSL on, no proxy or custom CA configured.
        when(configsSpy.proxyStrictSSL).thenReturn(true);
        when(configsSpy.httpProxy).thenReturn(undefined);
        when(configsSpy.httpNoProxy).thenReturn([]);
        when(configsSpy.proxyCaCert).thenReturn(undefined);
    });

    afterEach(() => {
        reset(configsSpy);
        setSystemCertificatesLoaderForTests();
        process.env = existingEnv;
    });

    describe("strictSSL / applyProxyStrictSSLEnv", () => {
        it("reflects the effective setting", () => {
            when(configsSpy.proxyStrictSSL).thenReturn(true);
            assert.strictEqual(strictSSL(), true);

            when(configsSpy.proxyStrictSSL).thenReturn(false);
            assert.strictEqual(strictSSL(), false);
        });

        it("sets DATABRICKS_SDK_PROXY_STRICT_SSL only when disabled", () => {
            when(configsSpy.proxyStrictSSL).thenReturn(false);
            applyProxyStrictSSLEnv();
            assert.strictEqual(
                process.env.DATABRICKS_SDK_PROXY_STRICT_SSL,
                "false"
            );

            when(configsSpy.proxyStrictSSL).thenReturn(true);
            applyProxyStrictSSLEnv();
            assert.strictEqual(
                process.env.DATABRICKS_SDK_PROXY_STRICT_SSL,
                undefined
            );
        });
    });

    describe("getDatabricksHttpAgent", () => {
        it("returns a plain https agent when no proxy is configured", async () => {
            const agent = await getDatabricksHttpAgent(
                new URL("https://example.com")
            );
            assert.ok(agent instanceof https.Agent);
            assert.ok(!(agent instanceof HttpsProxyAgent));
        });

        it("returns an https proxy agent when http.proxy is set", async () => {
            when(configsSpy.httpProxy).thenReturn("http://127.0.0.1:8080");
            const agent = await getDatabricksHttpAgent(
                new URL("https://example.com")
            );
            assert.ok(agent instanceof HttpsProxyAgent);
        });

        it("honours the http.proxy setting for http hosts", async () => {
            when(configsSpy.httpProxy).thenReturn("http://127.0.0.1:8080");
            const agent = await getDatabricksHttpAgent(
                new URL("http://example.com")
            );
            assert.ok(agent instanceof HttpProxyAgent);
        });

        it("uses HTTP_PROXY for http hosts when env proxies differ", async () => {
            process.env.HTTP_PROXY = "http://127.0.0.1:8080";
            process.env.HTTPS_PROXY = "http://127.0.0.1:8443";
            delete process.env.http_proxy;
            delete process.env.https_proxy;
            delete process.env.NO_PROXY;
            delete process.env.no_proxy;

            const agent = (await getDatabricksHttpAgent(
                new URL("http://example.com")
            )) as HttpProxyAgent<string>;

            assert.ok(agent instanceof HttpProxyAgent);
            assert.strictEqual(agent.proxy.href, "http://127.0.0.1:8080/");
        });

        it("returns a plain agent when the host matches noProxy", async () => {
            when(configsSpy.httpProxy).thenReturn("http://127.0.0.1:8080");
            when(configsSpy.httpNoProxy).thenReturn(["example.com"]);
            const agent = await getDatabricksHttpAgent(
                new URL("https://example.com")
            );
            assert.ok(agent instanceof https.Agent);
            assert.ok(!(agent instanceof HttpsProxyAgent));
        });

        it("returns a plain agent when the host matches NO_PROXY and http.noProxy is also set", async () => {
            process.env.NO_PROXY = "example.com";
            when(configsSpy.httpProxy).thenReturn("http://127.0.0.1:8080");
            when(configsSpy.httpNoProxy).thenReturn(["setting.example.com"]);

            const agent = await getDatabricksHttpAgent(
                new URL("https://example.com")
            );

            assert.ok(agent instanceof https.Agent);
            assert.ok(!(agent instanceof HttpsProxyAgent));
        });

        it("falls back to a plain http agent for http hosts without a proxy", async () => {
            const agent = await getDatabricksHttpAgent(
                new URL("http://example.com")
            );
            assert.ok(agent instanceof http.Agent);
            assert.ok(!(agent instanceof HttpProxyAgent));
        });

        it("sets the SDK default request timeout on plain agents", async () => {
            const agent = (await getDatabricksHttpAgent(
                new URL("https://example.com")
            )) as https.Agent;

            assert.strictEqual(
                (agent.options as https.AgentOptions).timeout,
                5000
            );
        });

        it("preserves the configured SDK request timeout on plain agents", async () => {
            const agent = (await getDatabricksHttpAgent(
                new URL("https://example.com"),
                60
            )) as https.Agent;

            assert.strictEqual(
                (agent.options as https.AgentOptions).timeout,
                60000
            );
        });

        it("preserves the configured SDK request timeout on proxy agents", async () => {
            when(configsSpy.httpProxy).thenReturn("http://127.0.0.1:8080");

            const agent = (await getDatabricksHttpAgent(
                new URL("https://example.com"),
                60
            )) as HttpsProxyAgent<string>;

            assert.strictEqual(agent.connectOpts.timeout, 60000);
        });

        it("merges the system trust store with Node's bundled roots (never replaces them)", async () => {
            // Inject the system store instead of reading the host's: CI runners
            // (notably headless Windows) can return an empty OS store, which
            // would legitimately omit `ca` and make this merge assertion flaky.
            // Re-listing a bundled root also exercises the dedupe path below.
            setSystemCertificatesLoaderForTests(async () => [
                FAKE_CA_PEM,
                tls.rootCertificates[0],
            ]);
            const agent = (await getDatabricksHttpAgent(
                new URL("https://example.com")
            )) as https.Agent;
            const ca = (agent.options as https.AgentOptions).ca;
            assert.ok(Array.isArray(ca));
            // tls.getCACertificates('system') returns only the OS store; setting
            // `ca` to that alone would drop Node's bundled public roots. The
            // agent must carry at least all of the bundled roots.
            assert.ok(
                (ca as unknown[]).length >= tls.rootCertificates.length,
                `expected >= ${tls.rootCertificates.length} CAs, got ${
                    (ca as unknown[]).length
                }`
            );
            // A known bundled root is still present.
            assert.ok((ca as string[]).includes(tls.rootCertificates[0]));
            // Deduped: the OS store often re-lists the bundled roots, but each
            // cert appears at most once in the handed-off list.
            assert.strictEqual(
                new Set(ca as string[]).size,
                (ca as string[]).length
            );
        });

        it("disables certificate verification when strict SSL is off", async () => {
            when(configsSpy.proxyStrictSSL).thenReturn(false);
            const agent = (await getDatabricksHttpAgent(
                new URL("https://example.com")
            )) as https.Agent;
            assert.strictEqual(
                (agent.options as https.AgentOptions).rejectUnauthorized,
                false
            );
        });

        // Drive an https:// target through a proxy and assert the CA / strict-SSL
        // land on the *endpoint* tunnel (the per-request `opts` that reach
        // `tls.connect` for the Databricks host), not just the proxy socket
        // (`connectOpts`). The base agent applies constructor options only to the
        // proxy connection, so a merged `ca` there never verifies the host — this
        // is the regression the CA-aware subclass fixes.
        async function captureEndpointConnectOpts(
            agent: HttpsProxyAgent<string>
        ) {
            let capturedOpts: https.AgentOptions | undefined;
            const superConnect = HttpsProxyAgent.prototype.connect;
            // `super.connect` in the subclass resolves to this at call time; stub
            // it so no real proxy connection is attempted.
            HttpsProxyAgent.prototype.connect = async function (_req, opts) {
                capturedOpts = opts as https.AgentOptions;
                return {} as never;
            };
            try {
                await agent.connect(
                    {} as never,
                    {
                        secureEndpoint: true,
                        host: "example.com",
                        port: 443,
                    } as never
                );
            } finally {
                HttpsProxyAgent.prototype.connect = superConnect;
            }
            return capturedOpts;
        }

        it("applies the CA to the endpoint TLS handshake through a proxy", async () => {
            when(configsSpy.httpProxy).thenReturn("http://127.0.0.1:8080");
            setSystemCertificatesLoaderForTests(async () => [FAKE_CA_PEM]);

            const agent = (await getDatabricksHttpAgent(
                new URL("https://example.com")
            )) as HttpsProxyAgent<string>;
            assert.ok(agent instanceof HttpsProxyAgent);

            const opts = await captureEndpointConnectOpts(agent);
            const ca = opts?.ca as string[];
            assert.ok(Array.isArray(ca));
            assert.ok(ca.includes(FAKE_CA_PEM));
            assert.strictEqual(opts?.rejectUnauthorized, true);
        });

        it("disables endpoint verification through a proxy when strict SSL is off", async () => {
            when(configsSpy.httpProxy).thenReturn("http://127.0.0.1:8080");
            when(configsSpy.proxyStrictSSL).thenReturn(false);

            const agent = (await getDatabricksHttpAgent(
                new URL("https://example.com")
            )) as HttpsProxyAgent<string>;

            const opts = await captureEndpointConnectOpts(agent);
            assert.strictEqual(opts?.rejectUnauthorized, false);
        });

        it("falls back to Node's bundled CAs when the system store can't be read", async () => {
            // @vscode/proxy-agent's own reader catches internally and reads the
            // host's real store, so swap the loader for one that rejects.
            setSystemCertificatesLoaderForTests(async () => {
                throw new Error("system store unavailable");
            });
            const agent = (await getDatabricksHttpAgent(
                new URL("https://example.com")
            )) as https.Agent;
            // `ca` must be omitted (not [] / undefined) so Node keeps its
            // bundled roots instead of trusting nothing.
            assert.ok(!("ca" in (agent.options as https.AgentOptions)));
            assert.strictEqual(
                (agent.options as https.AgentOptions).rejectUnauthorized,
                true
            );
        });

        it("merges databricks.proxy.caCert onto the trust store", async () => {
            const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dbx-ca-"));
            const pemPath = path.join(dir, "corp-ca.pem");
            fs.writeFileSync(pemPath, FAKE_CA_PEM);
            when(configsSpy.proxyCaCert).thenReturn(pemPath);
            try {
                const agent = (await getDatabricksHttpAgent(
                    new URL("https://example.com")
                )) as https.Agent;
                const ca = (agent.options as https.AgentOptions).ca as string[];
                assert.ok(Array.isArray(ca));
                assert.ok(ca.includes(FAKE_CA_PEM));
                // Still anchored on the bundled roots.
                assert.ok(ca.includes(tls.rootCertificates[0]));
            } finally {
                fs.rmSync(dir, {recursive: true, force: true});
            }
        });

        it("applies databricks.proxy.caCert even when the system store can't be read", async () => {
            const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dbx-ca-"));
            const pemPath = path.join(dir, "corp-ca.pem");
            fs.writeFileSync(pemPath, FAKE_CA_PEM);
            when(configsSpy.proxyCaCert).thenReturn(pemPath);
            setSystemCertificatesLoaderForTests(async () => {
                throw new Error("system store unavailable");
            });
            try {
                const agent = (await getDatabricksHttpAgent(
                    new URL("https://example.com")
                )) as https.Agent;
                const ca = (agent.options as https.AgentOptions).ca as string[];
                assert.ok(Array.isArray(ca));
                assert.ok(ca.includes(FAKE_CA_PEM));
                assert.ok(ca.includes(tls.rootCertificates[0]));
            } finally {
                fs.rmSync(dir, {recursive: true, force: true});
            }
        });

        it("ignores an unreadable databricks.proxy.caCert path", async () => {
            when(configsSpy.proxyCaCert).thenReturn(
                path.join(os.tmpdir(), "does-not-exist-xyz.pem")
            );
            // Must not throw; falls back to the rest of the trust store.
            const agent = (await getDatabricksHttpAgent(
                new URL("https://example.com")
            )) as https.Agent;
            const ca = (agent.options as https.AgentOptions).ca as string[];
            assert.ok(!ca || !ca.includes(FAKE_CA_PEM));
        });

        it("folds NODE_EXTRA_CA_CERTS into the trust store", async () => {
            const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dbx-ca-"));
            const pemPath = path.join(dir, "extra-ca.pem");
            fs.writeFileSync(pemPath, FAKE_CA_PEM);
            process.env.NODE_EXTRA_CA_CERTS = pemPath;
            try {
                const agent = (await getDatabricksHttpAgent(
                    new URL("https://example.com")
                )) as https.Agent;
                const ca = (agent.options as https.AgentOptions).ca as string[];
                assert.ok(Array.isArray(ca));
                assert.ok(ca.includes(FAKE_CA_PEM));
                // Still anchored on the bundled roots.
                assert.ok(ca.includes(tls.rootCertificates[0]));
            } finally {
                fs.rmSync(dir, {recursive: true, force: true});
            }
        });

        it("ignores an unreadable NODE_EXTRA_CA_CERTS path", async () => {
            process.env.NODE_EXTRA_CA_CERTS = path.join(
                os.tmpdir(),
                "does-not-exist-extra-xyz.pem"
            );
            // Must not throw; falls back to the rest of the trust store.
            const agent = (await getDatabricksHttpAgent(
                new URL("https://example.com")
            )) as https.Agent;
            const ca = (agent.options as https.AgentOptions).ca as string[];
            assert.ok(!ca || !ca.includes(FAKE_CA_PEM));
        });
    });

    describe("createWorkspaceClient", () => {
        it("builds a client tagged with the extension product and a proxy-aware agent", async () => {
            const client = await createWorkspaceClient(
                {host: "https://example.com", authType: "pat", token: "t"},
                new URL("https://example.com")
            );
            assert.ok(client instanceof WorkspaceClient);
            assert.strictEqual(client.apiClient.product, "databricks-vscode");
            const agent = await client.apiClient.getAgent();
            assert.ok(agent instanceof https.Agent);
        });

        it("preserves the configured SDK request timeout on the injected agent", async () => {
            const client = await createWorkspaceClient(
                {
                    host: "https://example.com",
                    authType: "pat",
                    token: "t",
                    httpTimeoutSeconds: 60,
                },
                new URL("https://example.com")
            );

            const agent = (await client.apiClient.getAgent()) as https.Agent;

            assert.strictEqual(
                (agent.options as https.AgentOptions).timeout,
                60000
            );
        });
    });
});
