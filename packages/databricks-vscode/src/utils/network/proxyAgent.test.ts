import * as assert from "assert";
import * as https from "node:https";
import * as http from "node:http";
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
    strictSSL,
} from "./proxyAgent";

describe(__filename, () => {
    let configsSpy: typeof workspaceConfigs;
    let existingEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
        existingEnv = Object.assign({}, process.env);
        resetProxyAgentCaches();
        configsSpy = spy(workspaceConfigs);
        // Defaults: strict SSL on, no proxy configured.
        when(configsSpy.proxyStrictSSL).thenReturn(true);
        when(configsSpy.httpProxy).thenReturn(undefined);
        when(configsSpy.httpNoProxy).thenReturn([]);
    });

    afterEach(() => {
        reset(configsSpy);
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

        it("returns a plain agent when the host matches noProxy", async () => {
            when(configsSpy.httpProxy).thenReturn("http://127.0.0.1:8080");
            when(configsSpy.httpNoProxy).thenReturn(["example.com"]);
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

        it("loads the system certificate trust store onto https agents", async () => {
            const agent = (await getDatabricksHttpAgent(
                new URL("https://example.com")
            )) as https.Agent;
            const ca = (agent.options as https.AgentOptions).ca;
            assert.ok(Array.isArray(ca) && ca.length > 0);
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

        it("falls back to Node's bundled CAs when the system store can't be read", async () => {
            // @vscode/proxy-agent reads the store via tls.getCACertificates,
            // which is absent/throws on older runtimes. Simulate that failure
            // on the shared (required) tls module proxy-agent also sees.
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const tls = require("node:tls");
            const original = tls.getCACertificates;
            tls.getCACertificates = () => {
                throw new Error("getCACertificates unavailable");
            };
            try {
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
            } finally {
                tls.getCACertificates = original;
            }
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
    });
});
