import {execFileSync, spawn} from "node:child_process";
import {mkdtempSync} from "node:fs";
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
env.TEST_E2E_ROOT ||= mkdtempSync(path.join(os.tmpdir(), "vscode-e2e-"));

function cliJson(args) {
    try {
        return JSON.parse(
            execFileSync("databricks", args, {
                encoding: "utf8",
                timeout: 30_000,
                stdio: ["ignore", "pipe", "pipe"],
            })
        );
    } catch {
        // Do not print captured authentication output: it may contain a token.
        throw new Error(
            `Cannot resolve profile '${profile}'. Run databricks auth login --profile ${profile} and retry.`
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

console.log(`E2E files and logs: ${env.TEST_E2E_ROOT}`);
const runner = path.join(
    path.dirname(require.resolve("@wdio/cli/package.json")),
    "bin",
    "wdio.js"
);
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
