import { describe, expect, it } from "vitest";
import {
    DEDICATED_CLUSTER_ID,
    DEDICATED_INTERPRETER,
    DEDICATED_SESSION_ENV,
    SERVERLESS_CLUSTER_ID,
    SERVERLESS_INTERPRETER,
    SERVERLESS_SESSION_ENV,
    SESSION_HOST,
    SESSION_REMOTE_NAME,
} from "../../test-support/sessionEnv";
import { detectHost, type Host, type SessionHost, type WindowInfo } from "./Host";

const REMOTE = { remoteName: SESSION_REMOTE_NAME };
const LOCAL = {};

/** The variables of a session without what makes it one. */
function without(env: Readonly<Record<string, string>>, ...names: string[]) {
    return Object.fromEntries(Object.entries(env).filter(([k]) => !names.includes(k)));
}

/** What `detectHost` makes of `env` in a remote window, which must be a session. */
function session(
    env: Record<string, string | undefined>,
    window: WindowInfo = REMOTE,
): SessionHost {
    const host = detectHost(env, window);
    expect(host.kind).toBe("session");
    return host as SessionHost;
}

describe("detectHost", () => {
    it.each<[string, Record<string, string | undefined>, { remoteName?: string }, Host]>([
        [
            "a serverless session",
            SERVERLESS_SESSION_ENV,
            REMOTE,
            {
                kind: "session",
                entry: "sshTunnel",
                host: SESSION_HOST,
                auth: "pat",
                compute: {
                    kind: "serverless",
                    clusterId: SERVERLESS_CLUSTER_ID,
                    runtimeVersion: "client.4.10",
                },
                interpreter: SERVERLESS_INTERPRETER,
                tunnelCli: SERVERLESS_SESSION_ENV.DATABRICKS_CLI_PATH,
                warnings: [],
            },
        ],
        [
            "a dedicated cluster's session",
            DEDICATED_SESSION_ENV,
            REMOTE,
            {
                kind: "session",
                entry: "sshTunnel",
                host: SESSION_HOST,
                auth: "pat",
                compute: {
                    kind: "cluster",
                    clusterId: DEDICATED_CLUSTER_ID,
                    runtimeVersion: "17.3",
                },
                interpreter: DEDICATED_INTERPRETER,
                tunnelCli: DEDICATED_SESSION_ENV.DATABRICKS_CLI_PATH,
                warnings: [],
            },
        ],
        ["a local window", {}, LOCAL, { kind: "local" }],
        // remoteName names VS Code's transport, not Databricks.
        ["Remote-SSH to a machine that isn't Databricks compute", {}, REMOTE, { kind: "local" }],
        [
            "Databricks compute without the tunnel's session",
            without(DEDICATED_SESSION_ENV, "DATABRICKS_REMOTE_ENV", "DATABRICKS_VIRTUAL_ENV"),
            REMOTE,
            { kind: "compute", runtimeVersion: "17.3" },
        ],
        [
            "DB_HOME alone, too common a name to tell by",
            { DB_HOME: "/databricks" },
            LOCAL,
            { kind: "local" },
        ],
        [
            "DATABRICKS_REMOTE_ENV other than 1",
            { ...SERVERLESS_SESSION_ENV, DATABRICKS_REMOTE_ENV: "true" },
            REMOTE,
            { kind: "compute", runtimeVersion: "client.4.10" },
        ],
    ])("%s", (_name, env, window, expected) => {
        expect(detectHost(env, window)).toEqual(expected);
    });

    it("is a session without an interpreter when DATABRICKS_VIRTUAL_ENV is missing, and says so", () => {
        const host = session(without(SERVERLESS_SESSION_ENV, "DATABRICKS_VIRTUAL_ENV"));
        expect(host.interpreter).toBeUndefined();
        expect(host.warnings).toEqual([
            "DATABRICKS_VIRTUAL_ENV isn't set: the session's interpreter isn't selected.",
        ]);
    });

    it("stays a session in a window VS Code doesn't call remote, and warns: the variables may have leaked", () => {
        expect(session(SERVERLESS_SESSION_ENV, LOCAL).warnings.join(" ")).toContain(
            "VS Code doesn't call remote",
        );
    });

    it("reads M2M credentials, and no credentials at all, without keeping their values", () => {
        const base = without(SERVERLESS_SESSION_ENV, "DATABRICKS_TOKEN");
        expect(
            session({ ...base, DATABRICKS_CLIENT_ID: "id", DATABRICKS_CLIENT_SECRET: "secret" })
                .auth,
        ).toBe("oauth-m2m");
        expect(session({ ...base, DATABRICKS_CLIENT_ID: "id" }).auth).toBeUndefined();
        expect(JSON.stringify(session(SERVERLESS_SESSION_ENV))).not.toContain(
            SERVERLESS_SESSION_ENV.DATABRICKS_TOKEN,
        );
    });

    it("normalises the host, and leaves an invalid one for the connection to report", () => {
        const host = (value: string) =>
            session({ ...SERVERLESS_SESSION_ENV, DATABRICKS_HOST: value }).host;
        expect(host("Example-Session.cloud.databricks.com/")).toBe(SESSION_HOST);
        expect(host("http://insecure")).toBeUndefined();
    });

    it("tells serverless by either variable, and has no compute without a cluster ID", () => {
        const cluster = without(
            SERVERLESS_SESSION_ENV,
            "IS_SERVERLESS",
            "DATABRICKS_JUPYTER_SERVERLESS",
        );
        expect(session(cluster).compute?.kind).toBe("cluster");
        expect(session({ ...cluster, DATABRICKS_JUPYTER_SERVERLESS: "true" }).compute?.kind).toBe(
            "serverless",
        );
        expect(session({ ...cluster, IS_SERVERLESS: "true" }).compute?.kind).toBe("serverless");
        expect(
            session(without(SERVERLESS_SESSION_ENV, "DATABRICKS_CLUSTER_ID")).compute,
        ).toBeUndefined();
    });
});
