import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
    childEnv,
    ciConfigFile,
    CI_PROFILE,
    clusterAction,
    extensionSources,
    integrationSpecs,
    MOCK_ONLY,
} from "./lib.mjs";

const repo = path.resolve(import.meta.dirname, "../..");
const specDir = path.join(repo, "packages/databricks-vscode-e2e/src");
const fromDir = path.join(repo, "packages/databricks-vscode");

function tempDir(files) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "integration-lib-test-"));
    for (const f of files) {
        fs.writeFileSync(path.join(dir, f), "");
    }
    return dir;
}

await test("integrationSpecs", async (t) => {
    await t.test("lists each spec once, relative to the extension package, with `/`", () => {
        const specs = integrationSpecs(specDir, fromDir, {});
        assert.ok(specs.length > 30);
        const auth = specs.find((s) => s.baseName === "auth");
        assert.deepEqual(auth, {
            path: "../databricks-vscode-e2e/src/auth.e2e.ts",
            baseName: "auth",
            ucws: false,
        });
        assert.equal(new Set(specs.map((s) => s.path)).size, specs.length);
        for (const s of specs) {
            assert.ok(fs.existsSync(path.join(fromDir, s.path)), s.path);
        }
    });

    await t.test("marks the Unity Catalog specs", () => {
        const specs = integrationSpecs(specDir, fromDir, {});
        assert.equal(specs.find((s) => s.baseName === "unity_catalog.ucws")?.ucws, true);
        assert.equal(specs.find((s) => s.baseName === "sync")?.ucws, false);
    });

    await t.test("leaves out the mock-only specs, which exist, and SSH unless asked", () => {
        for (const name of MOCK_ONLY.keys()) {
            assert.ok(fs.existsSync(path.join(specDir, `${name}.e2e.ts`)), name);
        }
        const names = integrationSpecs(specDir, fromDir, {}).map((s) => s.baseName);
        assert.deepEqual(
            names.filter((n) => MOCK_ONLY.has(n) || n === "ssh_connection.ucws"),
            [],
        );
        assert.ok(
            integrationSpecs(specDir, fromDir, { TEST_SSH_E2E: "true" })
                .map((s) => s.baseName)
                .includes("ssh_connection.ucws"),
        );
    });

    await t.test("reads only spec files, sorted", () => {
        const dir = tempDir(["b.e2e.ts", "a.ucws.e2e.ts", "helpers.ts", "notes.md"]);
        assert.deepEqual(
            integrationSpecs(dir, dir, {}).map((s) => s.path),
            ["a.ucws.e2e.ts", "b.e2e.ts"],
        );
    });
});

await test("ciConfigFile", async (t) => {
    const host = "https://a.cloud.databricks.com";

    await t.test("makes the ci profile from a token", () => {
        assert.equal(
            ciConfigFile({ DATABRICKS_HOST: host, DATABRICKS_TOKEN: "dapi-x" }),
            `[${CI_PROFILE}]\nhost = ${host}\ntoken = dapi-x\n`,
        );
    });

    await t.test("or from an OAuth service principal", () => {
        assert.equal(
            ciConfigFile({
                DATABRICKS_HOST: host,
                DATABRICKS_CLIENT_ID: "id",
                DATABRICKS_CLIENT_SECRET: "secret",
            }),
            `[ci]\nhost = ${host}\nclient_id = id\nclient_secret = secret\n`,
        );
    });

    await t.test("or from an Azure service principal", () => {
        assert.equal(
            ciConfigFile({
                DATABRICKS_HOST: host,
                ARM_CLIENT_ID: "id",
                ARM_CLIENT_SECRET: "secret",
                ARM_TENANT_ID: "tenant",
            }),
            `[ci]\nhost = ${host}\nazure_client_id = id\nazure_client_secret = secret\nazure_tenant_id = tenant\n`,
        );
    });

    await t.test("prefers a token, and needs a host and credentials", () => {
        assert.match(
            ciConfigFile({ DATABRICKS_HOST: host, DATABRICKS_TOKEN: "t", ARM_CLIENT_ID: "id" }),
            /token = t\n$/,
        );
        assert.throws(() => ciConfigFile({ DATABRICKS_TOKEN: "t" }), /DATABRICKS_HOST/);
        assert.throws(
            () => ciConfigFile({ DATABRICKS_HOST: host, DATABRICKS_CLIENT_ID: "id" }),
            /No credentials/,
        );
    });
});

await test("childEnv", async (t) => {
    await t.test("drops the CI's credentials and points at the config file", () => {
        const env = childEnv(
            {
                PATH: "/bin",
                DATABRICKS_HOST: "h",
                DATABRICKS_TOKEN: "t",
                DATABRICKS_AUTH_TYPE: "pat",
                DATABRICKS_CONFIG_FILE: "/old",
                DATABRICKS_E2E_EXTENSIONS: "/x.vsix",
                ARM_CLIENT_SECRET: "s",
                GOOGLE_CREDENTIALS: "g",
                TEST_DEFAULT_CLUSTER_ID: "c-1",
            },
            "/new",
        );
        assert.deepEqual(env, {
            PATH: "/bin",
            DATABRICKS_E2E_EXTENSIONS: "/x.vsix",
            TEST_DEFAULT_CLUSTER_ID: "c-1",
            DATABRICKS_CONFIG_FILE: "/new",
        });
    });
});

await test("extensionSources", async (t) => {
    await t.test("joins a folder's VSIXs with the path delimiter, sorted", () => {
        const dir = tempDir(["b-1.0.0-universal.vsix", "a-2.0.0-universal.vsix", "README.md"]);
        assert.equal(
            extensionSources(dir),
            [
                path.join(dir, "a-2.0.0-universal.vsix"),
                path.join(dir, "b-1.0.0-universal.vsix"),
            ].join(path.delimiter),
        );
    });

    await t.test("is undefined without a folder or VSIXs, for the Marketplace", () => {
        assert.equal(extensionSources(undefined), undefined);
        assert.equal(extensionSources(path.join(os.tmpdir(), "no-such-folder-x")), undefined);
        assert.equal(extensionSources(tempDir(["README.md"])), undefined);
    });
});

await test("clusterAction", async (t) => {
    await t.test("starts a stopped cluster, waits for a changing one", () => {
        assert.equal(clusterAction("RUNNING"), "ready");
        assert.equal(clusterAction("TERMINATED"), "start");
        assert.equal(clusterAction("ERROR"), "start");
        assert.equal(clusterAction("PENDING"), "wait");
        assert.equal(clusterAction("RESTARTING"), "wait");
        // It can't start until it has stopped.
        assert.equal(clusterAction("TERMINATING"), "wait");
    });
});
