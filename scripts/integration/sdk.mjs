// `yarn workspace databricks test:integ:sdk`: the extension's own SDK clients against the
// workspace the integration-test CI names in DATABRICKS_HOST and its credentials (lib.mjs), in
// packages/databricks-vscode/src/test/integration-sdk/ (vitest.integ.config.mts).
//
// The suite connects as the extension does, from a `[DEFAULT]` personal access token profile in
// DATABRICKS_CONFIG_FILE. So the credentials become a `ci` profile, the CLI makes a one-hour token
// of it, and the token is revoked at the end.
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { childEnv, ciConfigFile, CI_PROFILE } from "./lib.mjs";

const repo = path.resolve(import.meta.dirname, "../..");
const extensionDir = path.join(repo, "packages/databricks-vscode");
const cli = path.join(
    extensionDir,
    "bin",
    process.platform === "win32" ? "databricks.exe" : "databricks",
);

const runDir = fs.mkdtempSync(path.join(os.tmpdir(), "databricks-vscode-integ-sdk-"));
const ciConfig = path.join(runDir, "ci.databrickscfg");
fs.writeFileSync(ciConfig, ciConfigFile(process.env), { mode: 0o600 });
const cliEnv = childEnv(process.env, ciConfig);

let tokenId;
let status = 1;
try {
    execFileSync(
        process.execPath,
        ["--use-system-ca", path.join(extensionDir, "scripts/fetchCli.mjs")],
        {
            stdio: "inherit",
        },
    );
    // The token goes from the CLI to the config file only, never to the output.
    const created = JSON.parse(
        execFileSync(
            cli,
            [
                "tokens",
                "create",
                "--profile",
                CI_PROFILE,
                "--lifetime-seconds",
                "3600",
                "--comment",
                "databricks-vscode SDK integration tests",
                "-o",
                "json",
            ],
            { env: cliEnv, encoding: "utf-8" },
        ),
    );
    tokenId = created.token_info.token_id;
    const config = path.join(runDir, "databrickscfg");
    fs.writeFileSync(
        config,
        `[DEFAULT]\nhost = ${process.env.DATABRICKS_HOST}\ntoken = ${created.token_value}\n`,
        { mode: 0o600 },
    );
    status =
        spawnSync(
            process.execPath,
            [
                path.join(repo, "node_modules/vitest/vitest.mjs"),
                "run",
                "--config",
                "vitest.integ.config.mts",
            ],
            { cwd: extensionDir, env: childEnv(process.env, config), stdio: "inherit" },
        ).status ?? 1;
} finally {
    if (tokenId !== undefined) {
        const revoked = spawnSync(cli, ["tokens", "delete", tokenId, "--profile", CI_PROFILE], {
            env: cliEnv,
        });
        if (revoked.status !== 0) {
            console.error(
                `Couldn't revoke the SDK test token ${tokenId}; revoke it in the workspace's settings.`,
            );
        }
    }
    fs.rmSync(runDir, { recursive: true, force: true });
}
process.exit(status);
