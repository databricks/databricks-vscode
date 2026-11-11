// The integration-test CI's side of this repo: the scripts it runs (package.json in
// packages/databricks-vscode: `ts-node scripts/list_integration_tests.ts`, `test:integ:extension`,
// `package:cli:fetch`, `test:integ:sdk`) and what they share. The CI runs the e2e specs one per
// job against real workspaces, and passes a workspace's host and credentials as DATABRICKS_* and
// ARM_* variables, with TEST_DEFAULT_CLUSTER_ID.
import fs from "node:fs";
import path from "node:path";

/** Specs that only pass against the mock workspace (packages/databricks-vscode-e2e/mock), with why. */
export const MOCK_ONLY = new Map([
    ["proxy_tls.trust", "runs only in the mock's proxy windows (wdio.mock.conf.ts)"],
    ["auth.no-folder", "checks the mock workspace's host, workspace ID and user"],
]);

/**
 * The CI's matrix: one entry per spec in `specDir`, with its path relative to `fromDir` (with `/`),
 * its name, and whether it needs a workspace with Unity Catalog (`.ucws.`). Mock-only specs are left
 * out, and the SSH spec unless TEST_SSH_E2E is "true", as the old suite's list did.
 * @param {string} specDir
 * @param {string} fromDir
 * @param {Record<string, string | undefined>} env
 */
export function integrationSpecs(specDir, fromDir, env) {
    return fs
        .readdirSync(specDir)
        .filter((f) => f.endsWith(".e2e.ts"))
        .sort()
        .map((f) => ({ file: f, name: f.slice(0, -".e2e.ts".length) }))
        .filter(({ name }) => !MOCK_ONLY.has(name))
        .filter(({ name }) => env.TEST_SSH_E2E === "true" || name !== "ssh_connection.ucws")
        .map(({ file, name }) => ({
            path: path.relative(fromDir, path.join(specDir, file)).split(path.sep).join("/"),
            baseName: name,
            ucws: name.includes(".ucws"),
        }));
}

/** The profile the CI's credentials become, for the CLI. */
export const CI_PROFILE = "ci";

/**
 * A config file with a `[ci]` profile for the workspace the CI's variables name: a token, an OAuth
 * service principal, or an Azure service principal, whichever they hold. Throws without a host or
 * any credentials. The specs then sign in with a short-lived token that the CLI makes from it.
 * @param {Record<string, string | undefined>} env
 */
export function ciConfigFile(env) {
    const host = env.DATABRICKS_HOST;
    if (!host) {
        throw new Error("DATABRICKS_HOST isn't set: the CI passes the workspace's host in it.");
    }
    const fields = [["host", host]];
    if (env.DATABRICKS_TOKEN) {
        fields.push(["token", env.DATABRICKS_TOKEN]);
    } else if (env.DATABRICKS_CLIENT_ID && env.DATABRICKS_CLIENT_SECRET) {
        fields.push(
            ["client_id", env.DATABRICKS_CLIENT_ID],
            ["client_secret", env.DATABRICKS_CLIENT_SECRET],
        );
    } else if (env.ARM_CLIENT_ID && env.ARM_CLIENT_SECRET && env.ARM_TENANT_ID) {
        fields.push(
            ["azure_client_id", env.ARM_CLIENT_ID],
            ["azure_client_secret", env.ARM_CLIENT_SECRET],
            ["azure_tenant_id", env.ARM_TENANT_ID],
        );
    } else {
        throw new Error(
            "No credentials for DATABRICKS_HOST: set DATABRICKS_TOKEN, DATABRICKS_CLIENT_ID and DATABRICKS_CLIENT_SECRET, or ARM_CLIENT_ID, ARM_CLIENT_SECRET and ARM_TENANT_ID.",
        );
    }
    return `[${CI_PROFILE}]\n${fields.map(([k, v]) => `${k} = ${v}`).join("\n")}\n`;
}

/**
 * `env` without the CI's credentials, with DATABRICKS_CONFIG_FILE set to `configFile`: the
 * extension, the CLI and the SDK would otherwise sign in with the variables rather than the profile
 * (the CI also sets DATABRICKS_AUTH_TYPE=pat). The e2e package's own DATABRICKS_E2E_* settings stay.
 * @param {Record<string, string | undefined>} env
 * @param {string} configFile
 */
export function childEnv(env, configFile) {
    const kept = Object.entries(env).filter(
        ([k]) =>
            !/^(ARM_|GOOGLE_CREDENTIALS$)/.test(k) &&
            (!k.startsWith("DATABRICKS_") || k.startsWith("DATABRICKS_E2E_")),
    );
    return { ...Object.fromEntries(kept), DATABRICKS_CONFIG_FILE: configFile };
}

/**
 * The extension pack's members from a folder of VSIXs (EXTENSION_VSIX_DIR), as
 * DATABRICKS_E2E_EXTENSIONS wants them: the files, joined with the path delimiter. Undefined without
 * a folder, so the e2e config uses the Marketplace.
 * @param {string | undefined} vsixDir
 */
export function extensionSources(vsixDir) {
    if (!vsixDir || !fs.existsSync(vsixDir)) {
        return undefined;
    }
    const files = fs
        .readdirSync(vsixDir)
        .filter((f) => f.endsWith(".vsix"))
        .sort()
        .map((f) => path.join(vsixDir, f));
    return files.length > 0 ? files.join(path.delimiter) : undefined;
}

/**
 * What to do about TEST_DEFAULT_CLUSTER_ID's state, as `clusters get` reports it: start it, wait
 * for it, or nothing. The specs that run code expect it running, as the old suite's setup made it.
 * @param {string} state
 * @returns {"start" | "wait" | "ready"}
 */
export function clusterAction(state) {
    if (state === "RUNNING") {
        return "ready";
    }
    if (state === "TERMINATED" || state === "ERROR") {
        return "start";
    }
    // PENDING, RESTARTING, RESIZING, TERMINATING: check again once it settles.
    return "wait";
}
