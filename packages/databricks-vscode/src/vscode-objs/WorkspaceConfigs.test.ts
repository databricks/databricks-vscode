import * as assert from "assert";
import {ConfigurationTarget, workspace} from "vscode";
import {workspaceConfigs} from "./WorkspaceConfigs";

async function set(section: string, key: string, value?: boolean) {
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
});
