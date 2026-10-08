import * as assert from "assert";
import {ConfigurationTarget, workspace} from "vscode";
import {explicitBoolean, workspaceConfigs} from "./WorkspaceConfigs";

async function set(section: string, key: string, value?: boolean) {
    await workspace
        .getConfiguration(section)
        .update(key, value, ConfigurationTarget.Global);
}

describe(__filename, () => {
    describe("explicitBoolean", () => {
        it("prefers the workspace value over the global value", () => {
            assert.strictEqual(
                explicitBoolean({
                    globalValue: true,
                    workspaceValue: false,
                }),
                false
            );
        });

        it("treats null and missing values as unset", () => {
            const nullValue = null;
            assert.strictEqual(
                explicitBoolean({
                    globalValue: nullValue,
                    workspaceValue: nullValue,
                }),
                undefined
            );
            assert.strictEqual(
                explicitBoolean({
                    globalValue: false,
                    workspaceValue: nullValue,
                }),
                false
            );
            assert.strictEqual(explicitBoolean(undefined), undefined);
        });
    });

    // The Settings UI removes a user value that equals the default, so a
    // missing (implicitly `false`) default would make `false` impossible to set.
    for (const key of ["proxy.strictSSL", "proxy.useSystemCertificates"]) {
        it(`declares a true default for databricks.${key}`, () => {
            assert.strictEqual(
                workspace.getConfiguration("databricks").inspect(key)
                    ?.defaultValue,
                true
            );
        });
    }

    describe("proxyStrictSSL", () => {
        afterEach(async () => {
            await set("databricks", "proxy.strictSSL", undefined);
            await set("http", "proxyStrictSSL", undefined);
        });

        it("defaults to true", () => {
            assert.strictEqual(workspaceConfigs.proxyStrictSSL, true);
        });

        it("falls back to http.proxyStrictSSL when unset", async () => {
            await set("http", "proxyStrictSSL", false);
            assert.strictEqual(workspaceConfigs.proxyStrictSSL, false);
        });

        it("lets databricks.proxy.strictSSL override http.proxyStrictSSL", async () => {
            await set("http", "proxyStrictSSL", false);
            await set("databricks", "proxy.strictSSL", true);
            assert.strictEqual(workspaceConfigs.proxyStrictSSL, true);

            await set("http", "proxyStrictSSL", true);
            await set("databricks", "proxy.strictSSL", false);
            assert.strictEqual(workspaceConfigs.proxyStrictSSL, false);
        });
    });

    describe("proxyUseSystemCertificates", () => {
        afterEach(async () => {
            await set("databricks", "proxy.useSystemCertificates", undefined);
            await set("http", "systemCertificates", undefined);
        });

        it("defaults to true", () => {
            assert.strictEqual(
                workspaceConfigs.proxyUseSystemCertificates,
                true
            );
        });

        it("falls back to http.systemCertificates when unset", async () => {
            await set("http", "systemCertificates", false);
            assert.strictEqual(
                workspaceConfigs.proxyUseSystemCertificates,
                false
            );
        });

        it("lets databricks.proxy.useSystemCertificates override http.systemCertificates", async () => {
            await set("http", "systemCertificates", false);
            await set("databricks", "proxy.useSystemCertificates", true);
            assert.strictEqual(
                workspaceConfigs.proxyUseSystemCertificates,
                true
            );

            await set("http", "systemCertificates", true);
            await set("databricks", "proxy.useSystemCertificates", false);
            assert.strictEqual(
                workspaceConfigs.proxyUseSystemCertificates,
                false
            );
        });
    });
});
