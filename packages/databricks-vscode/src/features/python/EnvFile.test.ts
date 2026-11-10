import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { childEnv, type ChildCompute, type ChildConnection } from "../../kernel/cli/childEnv";
import { FakeFileEvents } from "../../test-support/fakeFiles";
import { fakeLog } from "../../test-support/fakes";
import { useTempDirs } from "../../test-support/tempDir";
import {
    ENV_FILE,
    EnvFileWriter,
    SERVERLESS_DEFAULT_KEY,
    envFileVariables,
    formatEnvFile,
    parseUserEnvFile,
    type EnvFileInputs,
} from "./EnvFile";

/* eslint-disable @typescript-eslint/naming-convention */

/** Shared with `resources/python/tests/test_dbconnect_bootstrap.py`, which reads them back. */
const GOLDEN = path.join(__dirname, "fixtures", "env-file");
const UPDATE = process.env["UPDATE_GOLDENS"] === "1";

const HOST = "https://adb-1234.azuredatabricks.net";
const TOKEN = "dapi-ambient-secret";
/** An extension host whose environment carries credentials and compute that must not reach the file. */
const BASE = {
    PATH: "/usr/bin",
    HOME: "/home/user",
    DATABRICKS_TOKEN: TOKEN,
    DATABRICKS_CLIENT_SECRET: "ambient-client-secret",
    DATABRICKS_HOST: "https://ambient.cloud.databricks.com",
    DATABRICKS_CLUSTER_ID: "ambient-cluster",
};

function inputs(
    connection: ChildConnection,
    compute: ChildCompute | undefined,
    options: {
        proxy?: { httpProxy?: string; noProxy?: string[] };
        base?: Record<string, string>;
    } = {},
): Omit<EnvFileInputs, "user"> {
    return {
        child: childEnv({
            base: options.base ?? BASE,
            configFile: "/home/user/.databrickscfg",
            connection,
            cliPath: "/extension/bin/databricks",
            proxy: options.proxy,
            compute,
        }),
        clearAmbient: connection.kind === "profile",
        projectRoot: "/work/my project",
        target: "dev",
        extensionVersion: "2.20.0",
        progressBar: true,
    };
}

const profile = (authType: string): ChildConnection => ({
    kind: "profile",
    host: HOST,
    profile: "DEFAULT",
    authType,
});
const cluster: ChildCompute = { kind: "cluster", clusterId: "0123-456789-abc" };
const serverless: ChildCompute = { kind: "serverless" };

const CASES: Record<string, Omit<EnvFileInputs, "user">> = {
    "pat.cluster": inputs(profile("pat"), cluster),
    "oauth-m2m.serverless": inputs(profile("oauth-m2m"), serverless),
    "databricks-cli.cluster": inputs(profile("databricks-cli"), cluster),
    "azure-cli.serverless": inputs(profile("azure-cli"), serverless),
    "remote.environment": inputs({ kind: "session", host: HOST, authType: "pat" }, serverless, {
        base: { ...BASE, DATABRICKS_HOST: HOST, DATABRICKS_SERVERLESS_COMPUTE_ID: "auto" },
    }),
    "pat.proxy": inputs(profile("pat"), cluster, {
        proxy: { httpProxy: "http://proxy.corp:3128", noProxy: ["localhost"] },
        base: { ...BASE, NO_PROXY: "127.0.0.1" },
    }),
    "pat.no-compute": inputs(profile("pat"), undefined),
};

const read = (file: string) => fs.readFileSync(file, "utf-8").replace(/\r\n/g, "\n");
const normalise = (content: string) => content.replace(/\r\n/g, "\n");

describe("envFileVariables", () => {
    it.each(Object.keys(CASES))("matches the golden file %s.env", (name) => {
        const content = normalise(formatEnvFile(envFileVariables(CASES[name]!)));
        const file = path.join(GOLDEN, `${name}.env`);
        if (UPDATE) {
            fs.mkdirSync(GOLDEN, { recursive: true });
            fs.writeFileSync(file, content);
        }
        expect(content).toBe(read(file));
    });

    it.each(Object.keys(CASES))("never writes a credential (%s)", (name) => {
        const content = formatEnvFile(envFileVariables(CASES[name]!));
        expect(content).not.toContain(TOKEN);
        expect(content).not.toContain("ambient-client-secret");
        expect(content).not.toContain("ambient-cluster");
    });

    it("clears the ambient credentials and compute for a profile connection", () => {
        const vars = envFileVariables(CASES["pat.cluster"]!);
        expect(vars).toMatchObject({
            DATABRICKS_TOKEN: "",
            DATABRICKS_CLIENT_SECRET: "",
            DATABRICKS_SERVERLESS_COMPUTE_ID: "",
            DATABRICKS_HOST: HOST,
            DATABRICKS_CONFIG_PROFILE: "DEFAULT",
            DATABRICKS_CONFIG_FILE: "/home/user/.databrickscfg",
            DATABRICKS_CLUSTER_ID: "0123-456789-abc",
            DATABRICKS_BUNDLE_TARGET: "dev",
            DATABRICKS_PROJECT_ROOT: "/work/my project",
            DATABRICKS_ENV_FILE_VERSION: "1",
        });
        expect(vars.DATABRICKS_CLI_PATH).toBe("");
        expect(vars).not.toHaveProperty("PATH");
    });

    it("gives U2M children the CLI path", () => {
        expect(envFileVariables(CASES["databricks-cli.cluster"]!).DATABRICKS_CLI_PATH).toBe(
            "/extension/bin/databricks",
        );
    });

    it("writes the workspace a bundle target names, for a profile without one", () => {
        const connection: ChildConnection = {
            kind: "profile",
            host: HOST,
            profile: "DEFAULT",
            authType: "databricks-cli",
            workspaceId: "1234567890",
        };
        expect(envFileVariables(inputs(connection, cluster)).DATABRICKS_WORKSPACE_ID).toBe(
            "1234567890",
        );
    });

    it("leaves a remote-mode connection's environment alone", () => {
        const vars = envFileVariables(CASES["remote.environment"]!);
        expect(vars).not.toHaveProperty("DATABRICKS_TOKEN");
        expect(vars).not.toHaveProperty("DATABRICKS_CONFIG_PROFILE");
        expect(vars.DATABRICKS_HOST).toBe(HOST);
        expect(vars.DATABRICKS_SERVERLESS_COMPUTE_ID).toBe("auto");
    });

    it("appends our user agent to the host's, and follows the progress setting", () => {
        const vars = envFileVariables({
            ...CASES["pat.cluster"]!,
            sparkUserAgent: "corp/1.0",
            progressBar: false,
        });
        expect(vars.SPARK_CONNECT_USER_AGENT).toBe("corp/1.0 databricks-vscode/2.20.0");
        expect(vars.SPARK_CONNECT_PROGRESS_BAR_ENABLED).toBe("0");
    });

    it("marks the serverless default, and nothing else, so a kernel starts no session for it", () => {
        const serverlessChild = {
            ...CASES["pat.cluster"]!,
            child: { ...CASES["pat.cluster"]!.child, DATABRICKS_SERVERLESS_COMPUTE_ID: "auto" },
        };
        // The default keeps its serverless compute: Databricks Connect runs still use it.
        const asDefault = envFileVariables({ ...serverlessChild, computeDefault: true });
        expect(asDefault[SERVERLESS_DEFAULT_KEY]).toBe("1");
        expect(asDefault.DATABRICKS_SERVERLESS_COMPUTE_ID).toBe("auto");
        // A chosen serverless compute, a profile's `auto` and a cluster carry no marker.
        for (const inputs of [serverlessChild, CASES["pat.cluster"]!]) {
            const vars = envFileVariables({ ...inputs, computeDefault: false });
            expect(vars).not.toHaveProperty(SERVERLESS_DEFAULT_KEY);
        }
        expect(envFileVariables(serverlessChild)).not.toHaveProperty(SERVERLESS_DEFAULT_KEY);
    });

    it("lets the user's python.envFile win", () => {
        const user = parseUserEnvFile(
            "# my settings\nDATABRICKS_CONFIG_PROFILE=other\nMY_VAR=a=b\nMY_VAR=second\nEMPTY=\n=novalue\n",
        );
        expect(user).toEqual({ DATABRICKS_CONFIG_PROFILE: "other", MY_VAR: "a=b" });
        const vars = envFileVariables({ ...CASES["pat.cluster"]!, user });
        expect(vars.DATABRICKS_CONFIG_PROFILE).toBe("other");
        expect(vars.MY_VAR).toBe("a=b");
    });

    it("formats sorted KEY=value lines ending with a newline", () => {
        expect(normalise(formatEnvFile({ B: "2", A: "1", C: "" }))).toBe("A=1\nB=2\nC=\n");
    });
});

describe("EnvFileWriter", () => {
    const tempDir = useTempDirs();

    function writer(
        options: {
            inputs?: () => Omit<EnvFileInputs, "user"> | undefined;
            userEnvFile?: () => string | undefined;
        } = {},
    ) {
        const t = tempDir();
        const root = t.path("project");
        fs.mkdirSync(root);
        const files = new FakeFileEvents();
        const log = fakeLog();
        const w = new EnvFileWriter({
            root,
            inputs: options.inputs ?? (() => ({ ...CASES["pat.cluster"]!, projectRoot: root })),
            userEnvFile: options.userEnvFile ?? (() => undefined),
            files,
            log,
        });
        return { t, root, files, w, file: path.join(root, ENV_FILE) };
    }

    it("writes .databricks/.databricks.env, creating the folder", async () => {
        const s = writer();
        await s.w.update("test");
        const content = read(s.file);
        expect(content).toContain("DATABRICKS_CONFIG_PROFILE=DEFAULT\n");
        expect(content).toContain(`DATABRICKS_PROJECT_ROOT=${s.root}\n`);
        expect(content).not.toContain(TOKEN);
        s.w.dispose();
    });

    it("doesn't rewrite an unchanged file", async () => {
        const s = writer();
        await s.w.update("first");
        const old = new Date(2000, 0, 1);
        fs.utimesSync(s.file, old, old);
        await s.w.update("second");
        expect(fs.statSync(s.file).mtime.getTime()).toBe(old.getTime());
        s.w.dispose();
    });

    it("tells when it wrote new content, and not for an unchanged file", async () => {
        const s = writer();
        let changes = 0;
        s.w.onDidChange(() => changes++);
        await s.w.update("first");
        await s.w.update("unchanged");
        expect(changes).toBe(1);
        fs.writeFileSync(s.file, "STALE=1\n");
        await s.w.update("stale");
        expect(changes).toBe(2);
        s.w.dispose();
    });

    it("writes nothing while signed out", async () => {
        const s = writer({ inputs: () => undefined });
        await s.w.update("signed out");
        expect(fs.existsSync(s.file)).toBe(false);
        s.w.dispose();
    });

    it("merges the user's env file, and follows its changes", async () => {
        let userFile: string | undefined;
        const s = writer({ userEnvFile: () => userFile });
        userFile = s.t.write("project/.env", "MY_VAR=one\n");
        await s.w.update("start");
        expect(read(s.file)).toContain("MY_VAR=one\n");
        expect(s.files.watched()).toEqual([`${s.root} .env`]);

        fs.writeFileSync(userFile, "MY_VAR=two\n");
        s.files.touch(userFile);
        await new Promise((r) => setTimeout(r, 200));
        await s.w.update("settle");
        expect(read(s.file)).toContain("MY_VAR=two\n");
        s.w.dispose();
        expect(s.files.watched()).toEqual([]);
    });

    it("ignores a python.envFile that points at its own file", async () => {
        let own: string | undefined;
        const s = writer({ userEnvFile: () => own });
        own = s.file;
        fs.mkdirSync(path.dirname(s.file), { recursive: true });
        fs.writeFileSync(s.file, "DATABRICKS_TOKEN=leaked\nMY_VAR=x\n");
        await s.w.update("start");
        const content = read(s.file);
        expect(content).not.toContain("leaked");
        expect(content).not.toContain("MY_VAR");
        s.w.dispose();
    });

    it("skips a user env file that doesn't exist", async () => {
        const s = writer({ userEnvFile: () => "/nonexistent/.env" });
        await s.w.update("start");
        expect(read(s.file)).toContain("DATABRICKS_ENV_FILE_VERSION=1\n");
        s.w.dispose();
    });
});
