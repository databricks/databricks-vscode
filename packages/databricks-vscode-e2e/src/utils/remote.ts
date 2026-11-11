import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { readProfileSection } from "./bundle-fixtures.ts";

/**
 * The environment of a Databricks SSH session (remote mode, SSH-03), for the
 * spec that checks it: `wdio.conf.ts` calls this in `beforeSession`, before
 * that spec's VS Code starts, so the extension host inherits it. The
 * connection comes from the `[DEFAULT]` profile's PAT or M2M credentials,
 * as the session's environment carries them; a profile without either
 * leaves the environment alone, and the spec skips itself. The session's
 * interpreter is a virtual environment's, made with `uv` (or
 * `python3 -m venv`) under `dir`. As on real compute, `DATABRICKS_VIRTUAL_ENV`
 * names the interpreter, not the environment's folder.
 */
export function prepareRemoteEnvironment(configFile: string | undefined, dir: string): void {
    const section =
        configFile && fs.existsSync(configFile)
            ? readProfileSection(fs.readFileSync(configFile, "utf-8"), "DEFAULT")
            : undefined;
    const value = (key: string) =>
        new RegExp(`^\\s*${key}\\s*=\\s*(.+?)\\s*$`, "m").exec(section ?? "")?.[1];
    const host = value("host");
    const token = value("token");
    const clientId = value("client_id");
    const clientSecret = value("client_secret");
    if (
        host === undefined ||
        (token === undefined && (clientId === undefined || clientSecret === undefined))
    ) {
        return;
    }
    const venv = path.join(dir, "remote-venv");
    fs.rmSync(venv, { recursive: true, force: true });
    try {
        execFileSync("uv", ["venv", "--python", "3.12", venv], {
            stdio: "inherit",
            shell: process.platform === "win32",
        });
    } catch {
        execFileSync(process.platform === "win32" ? "python" : "python3", ["-m", "venv", venv], {
            stdio: "inherit",
        });
    }
    Object.assign(process.env, {
        DATABRICKS_REMOTE_ENV: "1",
        DATABRICKS_VIRTUAL_ENV: path.join(
            venv,
            process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
        ),
        // A serverless session's compute, as the bootstrap describes it; nothing reads the ID on serverless.
        DATABRICKS_CLUSTER_ID: "e2e-serverless-session",
        IS_SERVERLESS: "TRUE",
        DATABRICKS_RUNTIME_VERSION: "client.4.10",
        DATABRICKS_HOST: host,
        ...(token !== undefined
            ? { DATABRICKS_TOKEN: token }
            : { DATABRICKS_CLIENT_ID: clientId, DATABRICKS_CLIENT_SECRET: clientSecret }),
    });
}
