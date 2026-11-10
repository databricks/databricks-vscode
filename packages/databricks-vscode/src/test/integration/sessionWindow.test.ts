/**
 * A session window (SSH-03): the real features and kernel, over the
 * environment a session's extension host inherits (`test-support/sessionEnv.ts`).
 */
import fs from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DebugProtocol } from "@vscode/debugprotocol";
import { bundleExplorer } from "../../features/bundle-explorer";
import { DEPLOY } from "../../features/bundle-explorer/BundleCommands";
import {
    ATTACH_CLUSTER,
    compute,
    CLUSTER_START,
    CLUSTER_STOP,
    DETACH_CLUSTER,
} from "../../features/compute";
import { connection } from "../../features/connection";
import { SHOW_CONNECTION_MENU } from "../../features/connection/ConnectionStatusBarItem";
import { bundleInit, INIT_NEW_PROJECT } from "../../features/bundle-init";
import { project } from "../../features/project";
import { run } from "../../features/run";
import { sync, SYNC_START } from "../../features/sync";
import {
    RUN_EDITOR_CONTENTS,
    RUN_EDITOR_CONTENTS_AS_WORKFLOW,
} from "../../features/run/RunCommands";
import { UC_REFRESH, unityCatalog } from "../../features/unity-catalog";
import { python } from "../../features/python";
import { ATTACH_CLUSTER_QUICK_PICK } from "../../kernel/compute/commands";
import { registerFeatures, startFeatures } from "../../kernel/feature";
import { detectHost } from "../../kernel/host";
import { MutableState, when } from "../../platform/reactive";
import { StateStore } from "../../platform/state";
import type { ConfigurationItem } from "../../platform/ui/sections";
import { fakeFeatureHost, fakeKernel, fakeMemento } from "../../test-support/fakes";
import { FakeFileEvents } from "../../test-support/fakeFiles";
import { FakeHttpClient, SCIM_ME } from "../../test-support/fakeHttp";
import { FakeMsPython } from "../../test-support/fakeMsPython";
import {
    SERVERLESS_INTERPRETER,
    SERVERLESS_SESSION_ENV,
    SESSION_HOST,
    SESSION_REMOTE_NAME,
    SESSION_WORKSPACE_ID,
} from "../../test-support/sessionEnv";
import { useTempDirs } from "../../test-support/tempDir";
import { host as vscode } from "../../test-support/vscode";

const tempDir = useTempDirs();

/** A bundle whose dev target names no host: the CLI falls back to the session's. */
const NO_HOST = "bundle: {name: demo}\ntargets:\n  dev: {default: true, mode: development}\n";

/** A unified host that, as a profile's alias, serves the session's workspace; it says only that it is unified. */
const ALIAS = "https://session-alias.databricks.com";

/** A serverless session's window: the folder holds a bundle, the environment the credentials. */
async function setup(
    env: Record<string, string | undefined>,
    bundle = NO_HOST,
    /** The laptop's global state, which local windows share with it. */
    global = fakeMemento(),
    options: {
        python?: boolean;
        /** The bundle's own `cluster_id` for the dev target, as validate reports it. */
        bundleClusterId?: string;
        /** The dev target's saved choices, `vscode.overrides.json`. */
        overrides?: Record<string, unknown>;
    } = {},
) {
    const t = tempDir();
    t.write("project/databricks.yml", bundle);
    if (options.overrides !== undefined) {
        t.write(
            "project/.databricks/bundle/dev/vscode.overrides.json",
            JSON.stringify(options.overrides),
        );
    }
    const root = t.path("project");
    vscode.folders = [root];
    const msPython = new FakeMsPython();
    if (options.python !== false) {
        msPython.install();
    }
    const http = new FakeHttpClient()
        .on("GET", SCIM_ME, {
            body: { userName: "me" },
            headers: { "x-databricks-org-id": SESSION_WORKSPACE_ID },
        })
        .on("GET", "/.well-known/databricks-config", (request) =>
            new URL(request.url).origin === ALIAS
                ? { body: { host_type: "unified", account_id: "acc" } }
                : { status: 404, body: {} },
        );
    const fullEnv = {
        // For the local window below: a session's kernel reads no config file at all.
        DATABRICKS_CONFIG_FILE: t.path("none"),
        ...SERVERLESS_SESSION_ENV,
        ...env,
    };
    const kernel = fakeKernel({
        env: fullEnv,
        host: detectHost(fullEnv, { remoteName: SESSION_REMOTE_NAME }),
        httpClient: http,
        folders: new MutableState<readonly string[]>([root]),
        files: new FakeFileEvents(),
        state: new StateStore({ global, workspace: fakeMemento() }),
    });
    const validates: Record<string, string>[] = [];
    const bundleClusterId = options.bundleClusterId;
    kernel.runner.on(["bundle", "validate"], (_args, options) => {
        validates.push(options.env as Record<string, string>);
        return {
            stdout: JSON.stringify({
                bundle: {
                    name: "demo",
                    target: "dev",
                    mode: "development",
                    ...(bundleClusterId !== undefined ? { cluster_id: bundleClusterId } : {}),
                },
            }),
        };
    });
    kernel.runner.on(["bundle", "summary"], {
        stdout: JSON.stringify({ bundle: { name: "demo", target: "dev" } }),
    });
    const fake = fakeFeatureHost(kernel);
    const registered = registerFeatures(
        [project, connection, bundleExplorer, python, unityCatalog, compute, run, bundleInit],
        fake.host,
    );
    kernel.start();
    startFeatures(registered);
    await when(kernel.connection.state, (s) => s.status !== "connecting");
    // The Target section's rows are synchronous.
    const targetRow = () =>
        (
            fake.host.sections
                .list()
                .find((s) => s.id === "project.target")
                ?.getChildren() as ConfigurationItem[] | undefined
        )?.[0];
    return { kernel, fake, msPython, root, validates, targetRow };
}

beforeEach(() => vscode.reset());

describe("a session window", () => {
    it("connects with the session's credentials, activates the folder's project, and selects the session's interpreter", async () => {
        const s = await setup({});
        expect(s.kernel.connection.connection).toMatchObject({
            host: SESSION_HOST,
            // From the responses: the session's environment doesn't name it.
            workspaceId: SESSION_WORKSPACE_ID,
            profile: undefined,
            authType: "pat",
        });
        await when(s.kernel.project.initialized, (i) => i);
        expect(s.kernel.project.active.value?.root).toBe(s.root);
        await vi.waitFor(() =>
            expect(s.msPython.adopted).toEqual([
                { path: SERVERLESS_INTERPRETER, resource: undefined },
            ]),
        );
    });

    it("says the session's venv needs the Python extension when it's missing or disabled", async () => {
        const s = await setup({}, NO_HOST, fakeMemento(), { python: false });
        expect(s.kernel.connection.connection).toMatchObject({ host: SESSION_HOST });
        await vi.waitFor(() =>
            expect(vscode.errors).toEqual([
                {
                    message:
                        "Selecting the session's Python environment needs the Python extension (ms-python.python). Install it, or enable it if it's disabled.",
                    actions: ["Install"],
                },
            ]),
        );
        expect(s.msPython.adopted).toEqual([]);
    });

    it("validates a target in the session's workspace, with the root pinned, and neither its compute nor a profile", async () => {
        const s = await setup({});
        await when(s.kernel.bundle.validated, (v) => v.status === "ready");
        expect(s.kernel.targetAccess.value).toMatchObject({
            status: "decided",
            access: { usable: true, via: "noHost" },
        });
        expect(s.validates).toHaveLength(1);
        expect(s.validates[0]).toMatchObject({
            DATABRICKS_HOST: SESSION_HOST,
            DATABRICKS_TOKEN: SERVERLESS_SESSION_ENV.DATABRICKS_TOKEN,
            DATABRICKS_BUNDLE_ROOT: s.root,
            DATABRICKS_CONFIG_FILE: s.kernel.configFile(),
        });
        expect(s.validates[0]).not.toHaveProperty("DATABRICKS_CLUSTER_ID");
        expect(s.targetRow()?.description).toBe("dev");
    });

    it("pauses a target in another workspace: no bundle command runs, and the Target row says why", async () => {
        const s = await setup(
            {},
            "bundle: {name: demo}\ntargets:\n  dev: {default: true, mode: development, workspace: {host: https://elsewhere.example.com}}\n",
        );
        await when(s.kernel.targetAccess, (a) => a.status === "decided");
        expect(s.kernel.targetAccess.value).toMatchObject({ access: { usable: false } });
        await new Promise((r) => setTimeout(r, 100));
        expect(s.validates).toEqual([]);
        expect(s.targetRow()?.description).toBe("dev (paused)");
        await vscode.commands.get(DEPLOY)!();
        expect(vscode.errors.map((e) => e.message)).toEqual([
            `Bundle commands for target "dev" are paused in this session window: it deploys to https://elsewhere.example.com, which may be another workspace than this session's. Point the target at this session's workspace (${SESSION_HOST}), or work on the project from a local window.`,
        ]);
        expect(s.kernel.runner.calls.filter((c) => c.args.includes("deploy"))).toEqual([]);
        // The kernel's backstop: a bundle call for it can't get the session's token.
        expect(() =>
            s.kernel.childEnv({ cli: true, bundle: { root: s.root, target: "dev" } }),
        ).toThrow("are paused in this session window");
    });

    it("names the missing variables, and Unity Catalog's Refresh connects again", async () => {
        const s = await setup({ DATABRICKS_TOKEN: undefined });
        expect(s.kernel.connection.state.value).toMatchObject({ status: "error" });
        expect((s.kernel.connection.state.value as { error: Error }).error.message).toContain(
            "The session's environment lacks DATABRICKS_TOKEN",
        );
        const reconnect = vi.spyOn(s.kernel.connection, "reconnect");
        await vscode.commands.get(UC_REFRESH)!();
        expect(reconnect).toHaveBeenCalledOnce();
        expect(s.kernel.connection.state.value).toMatchObject({ status: "error" });
    });

    it("runs a target on a profile's unified alias once a local window has seen it serve the session's workspace", async () => {
        const aliasTarget = `bundle: {name: demo}\ntargets:\n  dev: {default: true, mode: development, workspace: {host: ${ALIAS}}}\n`;
        const laptop = fakeMemento();

        // Without a local window's record, nothing names the workspace: paused, with ?o= as the remedy.
        const before = await setup({}, aliasTarget, laptop);
        const paused = await when(before.kernel.targetAccess, (a) => a.status === "decided");
        expect(paused).toMatchObject({
            access: {
                usable: false,
                remedy: expect.stringContaining(`?o=${SESSION_WORKSPACE_ID}`),
            },
        });
        before.kernel.dispose();

        // A local window signs in with a profile on the alias, which names no workspace.
        const t = tempDir();
        const local = fakeKernel({
            env: {
                DATABRICKS_CONFIG_FILE: t.write(
                    ".databrickscfg",
                    `[DEFAULT]\nhost = ${ALIAS}\ntoken = dapi-x\n`,
                ),
            },
            httpClient: new FakeHttpClient().on("GET", SCIM_ME, {
                body: { userName: "me" },
                headers: { "x-databricks-org-id": SESSION_WORKSPACE_ID },
            }),
            state: new StateStore({ global: laptop, workspace: fakeMemento() }),
        });
        local.start();
        await when(local.connection.state, (s) => s.status === "connected");
        await vi.waitFor(() =>
            expect(laptop.store.get("databricks.connection.workspaceIdsByHost")).toEqual({
                [ALIAS]: [SESSION_WORKSPACE_ID],
            }),
        );
        local.dispose();

        const after = await setup({}, aliasTarget, laptop);
        const usable = await when(after.kernel.targetAccess, (a) => a.status === "decided");
        expect(usable).toMatchObject({ access: { usable: true, via: "recordedWorkspace" } });
        await when(after.kernel.bundle.validated, (v) => v.status === "ready");
    });

    it("gives children the session's credentials, without its compute or a config file to reroute them", async () => {
        const s = await setup({ DATABRICKS_CONFIG_PROFILE: "DEFAULT" });
        const env = s.kernel.childEnv({ cli: true });
        expect(env).toMatchObject({
            DATABRICKS_HOST: SESSION_HOST,
            DATABRICKS_TOKEN: SERVERLESS_SESSION_ENV.DATABRICKS_TOKEN,
            DATABRICKS_CONFIG_FILE: s.kernel.configFile(),
            DATABRICKS_CLI_UPSTREAM: "databricks-vscode",
        });
        expect(fs.existsSync(s.kernel.configFile())).toBe(false);
        expect(env).not.toHaveProperty("DATABRICKS_CLUSTER_ID");
        expect(env).not.toHaveProperty("DATABRICKS_CONFIG_PROFILE");
        // Signed out, a child gets no credentials, as in a local window.
        expect(s.kernel.childEnv({ connection: null })).not.toHaveProperty("DATABRICKS_TOKEN");
    });

    it("offers the session's connection menu, and refuses to sign in or out", async () => {
        const s = await setup({});
        let labels: string[] = [];
        vscode.pickFrom = (items) => {
            labels = items.map((i) => i.label);
            return undefined;
        };
        await vscode.commands.get(SHOW_CONNECTION_MENU)!();
        expect(labels).toEqual([
            "$(refresh) Reconnect",
            "$(link-external) Open the workspace in a browser",
            "$(copy) Copy the workspace's host",
        ]);
        for (const id of [
            "databricks.connection.configureLogin",
            "databricks.connection.logout",
            "databricks.connection.openDatabricksConfigFile",
        ]) {
            await vscode.commands.get(id)!();
        }
        expect(vscode.errors.map((e) => e.message)).toEqual([
            "A session window is signed in with the SSH tunnel's credentials for this workspace, and can't use a profile. To use another workspace or profile, open a local window (File > New Window) and sign in there.",
            "A session window is signed in with the SSH tunnel's credentials for this workspace, and can't use a profile. Close this window to end the session; its credentials go with it.",
            "A session window doesn't read a Databricks configuration file: its credentials come from the SSH tunnel. Edit your profiles from a local window.",
        ]);
        expect(vscode.quickInputs).toEqual([]);
        expect(s.kernel.connection.connection?.host).toBe(SESSION_HOST);
    });

    it("is a local window without DATABRICKS_REMOTE_ENV, whatever else the environment holds", async () => {
        const s = await setup({ DATABRICKS_REMOTE_ENV: "" });
        expect(s.kernel.capabilities.identity).toBe("profiles");
        await when(s.kernel.project.initialized, (i) => i);
        expect(s.kernel.project.active.value?.root).toBe(vscode.folders[0]);
        expect(s.msPython.adopted).toEqual([]);
    });

    it("has no compute row in the Project view, and keeps the session's compute in the Connection view", async () => {
        const s = await setup({});
        await when(s.kernel.project.initialized, (i) => i);
        // The Project view is the configuration view; the Connection view is the sign-in view.
        const projectSections = s.fake.host.sections.list();
        expect(projectSections.map((section) => section.id)).not.toContain("compute.cluster");
        const rows = projectSections.flatMap((section) => {
            const children = section.getChildren();
            return Array.isArray(children) ? children : [];
        });
        expect(rows.map((row) => row.command?.command)).not.toContain(ATTACH_CLUSTER_QUICK_PICK.id);
        const connectionSections = s.fake.host.sections.list("signIn");
        expect(connectionSections.map((section) => section.id)).toContain("compute.session");
        const sessionRows = connectionSections.flatMap(
            (section) => section.getChildren() as { label?: unknown }[],
        );
        expect(sessionRows.map((row) => row.label)).toContain("Session compute");
    });

    it("refuses to choose, attach or detach compute, and to upload and run a file, with what to do instead", async () => {
        const s = await setup({});
        await when(s.kernel.project.initialized, (i) => i);
        for (const id of [
            ATTACH_CLUSTER_QUICK_PICK.id,
            ATTACH_CLUSTER,
            DETACH_CLUSTER,
            RUN_EDITOR_CONTENTS,
            RUN_EDITOR_CONTENTS_AS_WORKFLOW,
        ]) {
            await vscode.commands.get(id)!();
        }
        const computeText =
            "This window runs on the session's compute, shown in the Connection view, and it can't change. To choose compute for this project's jobs and runs, open the project in a local window.";
        const runText =
            "It runs on the compute chosen for the project, and a session window can't choose compute. Run the file with the session's Python, or deploy the bundle and run a job from the bundle views.";
        expect(vscode.errors.map((e) => e.message)).toEqual([
            computeText,
            computeText,
            computeText,
            runText,
            runText,
        ]);
    });

    it("refuses to create a project, and says to create it in a local window", async () => {
        const s = await setup({});
        await when(s.kernel.project.initialized, (i) => i);
        await vscode.commands.get(INIT_NEW_PROJECT)!();
        expect(vscode.errors.map((e) => e.message)).toEqual([
            "A project created in a session window takes minutes to show in its folders, so it can't be opened here right away. Create the project in a local window, or run `databricks bundle init` in this window's terminal and open its folder once it shows.",
        ]);
        expect(vscode.terminals).toEqual([]);
        expect(vscode.quickInputs).toEqual([]);
    });

    it("refuses a launch configuration that would run a file on the project's compute, with the same text", async () => {
        const s = await setup({});
        await when(s.kernel.project.initialized, (i) => i);
        const runText = `It runs on the compute chosen for the project, and a session window can't choose compute. Run the file with the session's Python, or deploy the bundle and run a job from the bundle views.`;
        for (const type of ["databricks", "databricks-workflow"]) {
            const adapter = (
                vscode.debugAdapters.get(type)!.createDebugAdapterDescriptor({}) as {
                    implementation: {
                        handleMessage(m: DebugProtocol.ProtocolMessage): void;
                        onDidSendMessage(
                            listener: (m: DebugProtocol.ProtocolMessage) => void,
                        ): void;
                    };
                }
            ).implementation;
            const sent: DebugProtocol.ProtocolMessage[] = [];
            adapter.onDidSendMessage((m) => sent.push(m));
            const request = (seq: number, command: string, args: unknown) =>
                adapter.handleMessage({
                    seq,
                    type: "request",
                    command,
                    arguments: args,
                } as DebugProtocol.Request);
            request(1, "initialize", { adapterID: type });
            request(2, "configurationDone", {});
            request(3, "launch", { program: `${s.root}/main.py` });
            await vi.waitFor(() =>
                expect(
                    sent.some(
                        (m) =>
                            m.type === "response" &&
                            (m as DebugProtocol.Response).command === "launch",
                    ),
                ).toBe(true),
            );
            const launch = sent.find(
                (m): m is DebugProtocol.Response =>
                    m.type === "response" && (m as DebugProtocol.Response).command === "launch",
            );
            expect(launch?.success, type).toBe(false);
            expect(launch?.body, type).toMatchObject({ error: { format: runText } });
        }
    });

    it("ignores saved compute choices: they don't change the effective compute or a deploy's cluster", async () => {
        const saved = await setup({}, NO_HOST, fakeMemento(), {
            overrides: { clusterId: "c-saved", useClusterOverride: true },
        });
        await when(saved.kernel.bundle.validated, (v) => v.status === "ready");
        expect(saved.kernel.compute.effective.value).toBeUndefined();
        await saved.kernel.bundle.operations.deploy();
        const deploy = saved.kernel.runner.calls.find((c) => c.args.includes("deploy"));
        expect(deploy?.options.env).not.toHaveProperty("DATABRICKS_CLUSTER_ID");

        const serverless = await setup({}, NO_HOST, fakeMemento(), {
            overrides: { serverless: true, serverlessVersion: "4" },
        });
        await when(serverless.kernel.bundle.validated, (v) => v.status === "ready");
        expect(serverless.kernel.compute.effective.value).toBeUndefined();
    });

    it("doesn't start or stop the bundle's cluster from the palette: a session names none without a row", async () => {
        const s = await setup({}, NO_HOST, fakeMemento(), { bundleClusterId: "c-bundle" });
        await when(s.kernel.bundle.validated, (v) => v.status === "ready");
        await vscode.commands.get(CLUSTER_START)!();
        await vscode.commands.get(CLUSTER_STOP)!();
        expect(vscode.errors.map((e) => e.message)).toEqual([
            "No cluster is attached.",
            "No cluster is attached.",
        ]);
        expect(vscode.warnings).toEqual([]);
    });

    it("syncs with the session's compute, not a saved cluster choice", async () => {
        const s = await setup({}, NO_HOST, fakeMemento(), {
            overrides: { clusterId: "c-saved", useClusterOverride: true },
        });
        await when(s.kernel.bundle.validated, (v) => v.status === "ready");
        startFeatures(registerFeatures([sync], s.fake.host));
        await vscode.commands.get(SYNC_START)!();
        const started = s.kernel.runner.started.find((p) => p.args[1] === "sync");
        expect(started?.args).toContain("--watch");
        expect(started?.options.env).not.toHaveProperty("DATABRICKS_CLUSTER_ID");
        s.kernel.dispose();
    });

    it("still uses the bundle's own cluster_id over the saved choices", async () => {
        const s = await setup({}, NO_HOST, fakeMemento(), {
            bundleClusterId: "c-bundle",
            overrides: { clusterId: "c-saved", useClusterOverride: true },
        });
        await when(s.kernel.bundle.validated, (v) => v.status === "ready");
        expect(s.kernel.compute.effective.value).toEqual({
            kind: "cluster",
            clusterId: "c-bundle",
            source: "bundle",
        });
    });
});
