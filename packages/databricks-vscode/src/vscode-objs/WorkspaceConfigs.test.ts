import * as assert from "assert";
import {ConfigurationTarget, workspace} from "vscode";
import {workspaceConfigs} from "./WorkspaceConfigs";

async function set(section: string, key: string, value?: unknown) {
    await workspace
        .getConfiguration(section)
        .update(key, value, ConfigurationTarget.Global);
}

describe(__filename, () => {
    describe("proxyStrictSSL", () => {
        async function reset() {
            await set("http", "proxyStrictSSL", undefined);
        }
        beforeEach(reset);
        afterEach(reset);

        it("defaults to true", () => {
            assert.strictEqual(workspaceConfigs.proxyStrictSSL, true);
        });

        it("follows http.proxyStrictSSL", async () => {
            await set("http", "proxyStrictSSL", false);
            assert.strictEqual(workspaceConfigs.proxyStrictSSL, false);
        });
    });

    describe("onDidChangeProxyStrictSSL", () => {
        async function reset() {
            await set("http", "proxyStrictSSL", undefined);
            await set("databricks", "proxy.caCert", undefined);
        }
        beforeEach(reset);
        afterEach(reset);

        it("fires only for http.proxyStrictSSL", async () => {
            let calls = 0;
            let resolveFired: () => void;
            const fired = new Promise<void>((resolve) => {
                resolveFired = resolve;
            });
            const disposable = workspaceConfigs.onDidChangeProxyStrictSSL(
                () => {
                    calls++;
                    resolveFired();
                }
            );
            try {
                await set("databricks", "proxy.caCert", "/etc/corp-ca.pem");
                await set("http", "proxyStrictSSL", false);
                await fired;
                assert.strictEqual(calls, 1);
            } finally {
                disposable.dispose();
            }
        });
    });

    describe("configuredDeprecatedProxySettings", () => {
        async function reset() {
            await set("databricks", "proxy.strictSSL", undefined);
            await set("databricks", "proxy.caCert", undefined);
        }
        beforeEach(reset);
        afterEach(reset);

        it("is empty when neither setting is set", () => {
            assert.deepStrictEqual(
                workspaceConfigs.configuredDeprecatedProxySettings,
                []
            );
        });

        it("treats null and empty values as unset", async () => {
            const nullValue = null;
            await set("databricks", "proxy.strictSSL", nullValue);
            await set("databricks", "proxy.caCert", "");
            assert.deepStrictEqual(
                workspaceConfigs.configuredDeprecatedProxySettings,
                []
            );
        });

        it("lists the settings that are set", async () => {
            await set("databricks", "proxy.strictSSL", true);
            await set("databricks", "proxy.caCert", "/etc/corp-ca.pem");
            assert.deepStrictEqual(
                workspaceConfigs.configuredDeprecatedProxySettings,
                ["databricks.proxy.strictSSL", "databricks.proxy.caCert"]
            );
        });
    });
});
