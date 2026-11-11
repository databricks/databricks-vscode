// `yarn workspace databricks test:integ:extension --spec <path>`: one e2e spec against the
// workspace the integration-test CI names in DATABRICKS_HOST and its credentials (lib.mjs). The
// path is the matrix's, relative to packages/databricks-vscode (scripts/list_integration_tests.ts).
//
// It turns the credentials into a `ci` profile, starts TEST_DEFAULT_CLUSTER_ID if it isn't
// running, installs uv for the Databricks Connect specs if it's missing, then runs
// `run-spec.sh real <spec> --profile ci`, which signs the spec in with a two-hour token of that
// profile and revokes it at the end. The e2e logs are copied to packages/databricks-vscode/logs,
// where the CI collects them. EXTENSION_VSIX_DIR, a folder of the extension pack's VSIXs, becomes
// DATABRICKS_E2E_EXTENSIONS.
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { childEnv, ciConfigFile, CI_PROFILE, clusterAction, extensionSources } from "./lib.mjs";

const repo = path.resolve(import.meta.dirname, "../..");
const extensionDir = path.join(repo, "packages/databricks-vscode");
const e2eDir = path.join(repo, "packages/databricks-vscode-e2e");
const cli = path.join(
    extensionDir,
    "bin",
    process.platform === "win32" ? "databricks.exe" : "databricks",
);

const specIndex = process.argv.indexOf("--spec");
const specArg = specIndex === -1 ? undefined : process.argv[specIndex + 1];
if (specArg === undefined) {
    console.error(
        "usage: test:integ:extension --spec <path to an e2e spec, from packages/databricks-vscode>",
    );
    process.exit(2);
}
// run-spec.sh takes the spec's path in the e2e package.
const spec = path.relative(e2eDir, path.resolve(process.cwd(), specArg)).split(path.sep).join("/");

const runDir = fs.mkdtempSync(path.join(os.tmpdir(), "databricks-vscode-integ-"));
const configFile = path.join(runDir, "databrickscfg");
fs.writeFileSync(configFile, ciConfigFile(process.env), { mode: 0o600 });
const env = childEnv(process.env, configFile);
env.DATABRICKS_E2E_EXTENSIONS ??= extensionSources(process.env.EXTENSION_VSIX_DIR);
if (env.DATABRICKS_E2E_EXTENSIONS === undefined) {
    delete env.DATABRICKS_E2E_EXTENSIONS;
}
// The package index the CI gives pip, for uv too: setup_local and run_dbconnect install with both.
if (env.PIP_INDEX_URL && !env.UV_INDEX_URL) {
    env.UV_INDEX_URL = env.PIP_INDEX_URL;
}

let status = 1;
try {
    execFileSync(
        process.execPath,
        ["--use-system-ca", path.join(extensionDir, "scripts/fetchCli.mjs")],
        {
            stdio: "inherit",
        },
    );
    if (env.TEST_DEFAULT_CLUSTER_ID) {
        await ensureClusterRunning(env.TEST_DEFAULT_CLUSTER_ID);
    }
    ensureUv();
    status =
        spawnSync(
            "bash",
            [path.join(e2eDir, "run-spec.sh"), "real", spec, "--profile", CI_PROFILE],
            {
                cwd: repo,
                env,
                stdio: "inherit",
            },
        ).status ?? 1;
} finally {
    const logs = path.join(e2eDir, "logs");
    if (fs.existsSync(logs)) {
        fs.cpSync(logs, path.join(extensionDir, "logs"), { recursive: true });
    }
    fs.rmSync(runDir, { recursive: true, force: true });
}
process.exit(status);

/** Starts the cluster if it's stopped and waits until it runs, for at most 30 minutes. */
async function ensureClusterRunning(clusterId) {
    const deadline = Date.now() + 30 * 60_000;
    for (;;) {
        const { state } = JSON.parse(
            execFileSync(
                cli,
                ["clusters", "get", clusterId, "--profile", CI_PROFILE, "-o", "json"],
                {
                    env,
                    encoding: "utf-8",
                },
            ),
        );
        const action = clusterAction(state);
        if (action === "ready") {
            return;
        }
        if (Date.now() > deadline) {
            throw new Error(`Cluster ${clusterId} is still ${state} after 30 minutes.`);
        }
        console.log(
            `Cluster ${clusterId} is ${state}; ${action === "start" ? "starting it" : "waiting"}.`,
        );
        if (action === "start") {
            // Waits until the cluster runs.
            execFileSync(cli, ["clusters", "start", clusterId, "--profile", CI_PROFILE], {
                env,
                stdio: "inherit",
            });
        } else {
            await new Promise((resolve) => setTimeout(resolve, 15_000));
        }
    }
}

/** uv, which `setup_local` and `run_dbconnect` need, from the package index pip is configured with. */
function ensureUv() {
    if (spawnSync("uv", ["--version"], { env }).status === 0) {
        return;
    }
    for (const python of ["python", "python3"]) {
        if (
            spawnSync(python, ["-m", "pip", "install", "uv"], { env, stdio: "inherit" }).status ===
            0
        ) {
            return;
        }
    }
    console.warn("Couldn't install uv: the specs that set up Python with it will fail.");
}
