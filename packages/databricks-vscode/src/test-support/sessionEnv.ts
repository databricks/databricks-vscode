/**
 * What the extension host of a session window inherits: a window that the
 * CLI's SSH tunnel opened on Databricks compute. Recorded with CLI
 * 1.20.0, on serverless and on a dedicated cluster. The names and
 * shapes are the real ones; the values are made up.
 *
 * There is no `DATABRICKS_CONFIG_FILE` and no `~/.databrickscfg` on the
 * compute. Tests that build a kernel from these still pass a missing config
 * file, so that the machine running them isn't read.
 */
import { detectHost, type SessionHost } from "../kernel/host";

/** `vscode.env.remoteName` in a session window. */
export const SESSION_REMOTE_NAME = "ssh-remote";

/** The workspace's canonical URL, which the session gets instead of a profile's alias. */
export const SESSION_HOST = "https://example-session.cloud.databricks.com";

/** `x-databricks-org-id` on every response of the session's workspace. */
export const SESSION_WORKSPACE_ID = "1234123412341234";

/** The notebook's `apiToken`: 36 characters, neither a `dapi` token nor a JWT. */
export const SESSION_TOKEN = "0a1b2c3d-4e5f-6a7b-8c9d-0e1f2a3b4c5d";

/** The interpreter (`sys.executable`), not a virtual environment's folder. */
export const SERVERLESS_INTERPRETER =
    "/local_disk0/.ephemeral_nfs/envs/pythonEnv-0f6b3c2a/bin/python";
export const DEDICATED_INTERPRETER =
    "/local_disk0/.ephemeral_nfs/envs/pythonEnv-7d8e9f0a/bin/python";

export const SERVERLESS_CLUSTER_ID = "1019-051229-ab12cd34-v2n";
export const DEDICATED_CLUSTER_ID = "1019-052823-ef56gh78";

const TUNNEL_TAGS = {
    DATABRICKS_CLI_UPSTREAM: "databricks_ssh_tunnel",
    DATABRICKS_CLI_UPSTREAM_VERSION: "1.20.0",
    DATABRICKS_SDK_UPSTREAM: "databricks_ssh_tunnel",
    DATABRICKS_SDK_UPSTREAM_VERSION: "1.20.0",
};

/** A serverless session: aarch64, a throwaway non-root user, Databricks Connect installed. */
export const SERVERLESS_SESSION_ENV: Readonly<Record<string, string>> = {
    DATABRICKS_REMOTE_ENV: "1",
    DATABRICKS_VIRTUAL_ENV: SERVERLESS_INTERPRETER,
    DATABRICKS_HOST: SESSION_HOST,
    DATABRICKS_TOKEN: SESSION_TOKEN,
    DATABRICKS_CLUSTER_ID: SERVERLESS_CLUSTER_ID,
    IS_SERVERLESS: "TRUE",
    DATABRICKS_JUPYTER_SERVERLESS: "true",
    DATA_SECURITY_MODE: "SHARED",
    DATABRICKS_RUNTIME_VERSION: "client.4.10",
    DATABRICKS_CLI_PATH:
        "/Workspace/Users/me@example.com/.databricks/ssh-tunnel/1.20.0/databricks_cli_1.20.0_linux_arm64/databricks",
    ...TUNNEL_TAGS,
    // The shell VS Code resolves sets another one than the session's interpreter.
    VIRTUAL_ENV: "/local_disk0/.ephemeral_nfs/cluster_libraries/python",
    HOME: "/home/spark-0f6b3c2a-1d2e",
    DB_HOME: "/databricks",
    VSCODE_AGENT_FOLDER: "/home/spark-0f6b3c2a-1d2e/.vscode-server",
};

/** A dedicated (single-user) cluster's session: x86_64, root, no Databricks Connect. */
export const DEDICATED_SESSION_ENV: Readonly<Record<string, string>> = {
    DATABRICKS_REMOTE_ENV: "1",
    DATABRICKS_VIRTUAL_ENV: DEDICATED_INTERPRETER,
    DATABRICKS_HOST: SESSION_HOST,
    DATABRICKS_TOKEN: SESSION_TOKEN,
    DATABRICKS_CLUSTER_ID: DEDICATED_CLUSTER_ID,
    DATA_SECURITY_MODE: "SINGLE_USER",
    DATABRICKS_RUNTIME_VERSION: "17.3",
    DATABRICKS_CLI_PATH:
        "/Workspace/Users/me@example.com/.databricks/ssh-tunnel/1.20.0/databricks_cli_1.20.0_linux_amd64/databricks",
    ...TUNNEL_TAGS,
    VIRTUAL_ENV: "/local_disk0/.ephemeral_nfs/cluster_libraries/python",
    HOME: "/root",
    DB_HOME: "/databricks",
    VSCODE_AGENT_FOLDER: "/root/.vscode-server",
};

function sessionOf(env: Readonly<Record<string, string>>): SessionHost {
    const host = detectHost(env, { remoteName: SESSION_REMOTE_NAME });
    if (host.kind !== "session") {
        throw new Error("Not a session's environment");
    }
    return host;
}

/** The hosts `detectHost` makes of them, for `fakeKernel({host})`. */
export const SERVERLESS_SESSION = sessionOf(SERVERLESS_SESSION_ENV);
export const DEDICATED_SESSION = sessionOf(DEDICATED_SESSION_ENV);
