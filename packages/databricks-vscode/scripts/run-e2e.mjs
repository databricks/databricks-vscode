import {execFileSync, spawn} from "node:child_process";
import {existsSync, mkdtempSync, rmSync} from "node:fs";
import {createRequire} from "node:module";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";

const require = createRequire(import.meta.url);
const packageRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    ".."
);
const args = process.argv.slice(2);
const profileIndex = args.indexOf("--profile");
const profile = profileIndex < 0 ? undefined : args[profileIndex + 1];
if (profileIndex >= 0) {
    if (!profile || profile.startsWith("--")) {
        throw new Error("--profile requires a Databricks profile name");
    }
    args.splice(profileIndex, 2);
}

const env = {...process.env};
env.PATH = `${path.dirname(process.execPath)}${path.delimiter}${
    env.PATH || ""
}`;
// Only a root this script minted is ours to delete: a caller-supplied
// TEST_E2E_ROOT, and CI's unset one, are left alone.
const ownsTestRoot = !env.CI && !env.TEST_E2E_ROOT;
if (ownsTestRoot) {
    env.TEST_E2E_ROOT = mkdtempSync(path.join(os.tmpdir(), "vscode-e2e-"));
    // A run leaves a .databrickscfg holding a token or client secret under
    // test-root, plus a few hundred MiB of editor and extension data, and
    // nothing else removes them. Keep logs/ — that's why you run this locally.
    process.on("exit", () => {
        for (const dir of ["test-root", "user-data-dir", "extension test"]) {
            rmSync(path.join(env.TEST_E2E_ROOT, dir), {
                recursive: true,
                force: true,
            });
        }
    });
}

// A fresh clone has only the package-local CLI (bin/ is gitignored, filled in by
// `package:cli:fetch`); a bare `databricks` may be absent or another version.
const cliBinary = path.join(
    packageRoot,
    "bin",
    process.platform === "win32" ? "databricks.exe" : "databricks"
);
const cli = existsSync(cliBinary) ? cliBinary : "databricks";

function cliJson(cliArgs) {
    let stdout;
    try {
        stdout = execFileSync(cli, cliArgs, {
            encoding: "utf8",
            timeout: 30_000,
            stdio: ["ignore", "pipe", "pipe"],
        });
    } catch (error) {
        // Never include the captured output in these messages: `auth token`
        // prints an access token.
        if (error.code === "ENOENT") {
            throw new Error(
                `Cannot run the Databricks CLI at '${cli}'. Run yarn workspace databricks run package:cli:fetch and retry.`
            );
        }
        if (error.signal || error.code === "ETIMEDOUT") {
            throw new Error(
                `The Databricks CLI did not finish within 30s while resolving profile '${profile}'.`
            );
        }
        throw new Error(
            `Cannot resolve profile '${profile}'. Run databricks auth login --profile ${profile} and retry.`
        );
    }
    try {
        return JSON.parse(stdout);
    } catch {
        throw new Error(
            `The Databricks CLI did not return JSON while resolving profile '${profile}'.`
        );
    }
}

if (profile) {
    const description = cliJson([
        "auth",
        "describe",
        "--profile",
        profile,
        "--output",
        "json",
    ]);
    const token = cliJson(["auth", "token", "--profile", profile]);
    if (!description.details?.host || !token.access_token) {
        throw new Error(
            "The selected profile did not return a workspace host and access token"
        );
    }
    for (const key of Object.keys(env)) {
        if (key.startsWith("DATABRICKS_")) {
            delete env[key];
        }
    }
    env.DATABRICKS_HOST = description.details.host;
    env.DATABRICKS_TOKEN = token.access_token;
    env.DATABRICKS_AUTH_TYPE = "pat";
}

if (
    !env.DATABRICKS_CONFIG_PROFILE &&
    (!env.DATABRICKS_HOST ||
        !(
            env.DATABRICKS_TOKEN ||
            (env.DATABRICKS_CLIENT_ID && env.DATABRICKS_CLIENT_SECRET)
        ))
) {
    throw new Error(
        "Pass --profile <name> for a local OAuth login, or set DATABRICKS_HOST and PAT/OAuth M2M credentials as in CI."
    );
}

console.log(`E2E logs: ${env.TEST_E2E_ROOT || packageRoot}/logs`);
// WDIO 9 exports its entry point but keeps package.json private.
let runnerRoot = path.dirname(require.resolve("@wdio/cli"));
while (!existsSync(path.join(runnerRoot, "bin", "wdio.js"))) {
    const parent = path.dirname(runnerRoot);
    if (parent === runnerRoot) {
        throw new Error("Cannot locate the WebdriverIO CLI executable");
    }
    runnerRoot = parent;
}
const runner = path.join(runnerRoot, "bin", "wdio.js");
const child = spawn(
    process.execPath,
    [
        runner,
        "run",
        "src/test/e2e/wdio.conf.ts",
        "--tsConfigPath",
        "src/test/e2e/tsconfig.json",
        ...args,
    ],
    {
        cwd: packageRoot,
        env,
        stdio: "inherit",
    }
);
child.on("error", (error) => {
    console.error(error.message);
    process.exitCode = 1;
});
child.on("exit", (code) => {
    process.exitCode = code ?? 1;
});
for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => child.kill(signal));
}
