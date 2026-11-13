import fs from "node:fs";
import { EOL } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ThemeIcon } from "vscode";
import { registerFeatures, startFeatures } from "../../kernel/feature";
import { liveListenerCount } from "../../platform/event";
import { MutableState, when } from "../../platform/reactive";
import type { ConfigurationItem } from "../../platform/ui/sections";
import { environmentOf, PROBE_ENV, PROBE_SETTINGS } from "../../test-support/childEnvironment";
import { apiCluster, FakeClusters } from "../../test-support/fakeClusters";
import { fakeFeatureHost, fakeKernel, fakeSettings } from "../../test-support/fakes";
import { FakeFileEvents } from "../../test-support/fakeFiles";
import { FakeHttpClient, SCIM_ME } from "../../test-support/fakeHttp";
import { installExtensionPack } from "../../test-support/extensionPack";
import { FakeMsPython, resolvedEnvironment } from "../../test-support/fakeMsPython";
import { useTempDirs } from "../../test-support/tempDir";
import { host as vscode } from "../../test-support/vscode";
import { escapeExecutableForTerminal, escapePathArgument } from "../../platform/shell";
import { configurationView } from "../configuration-view";
import { connection } from "../connection";
import { SKIP_CONFIGURE } from "./autocomplete/Autocomplete";
import { CELL_MARKERS_WRITTEN } from "./notebooks/cellMarkers";
import { initScriptName } from "./notebooks/InitScripts";
import { SETUP_STATES } from "./setup/uv/SetupStates";
import { Uri } from "../../test-support/vscode";
import {
    CONFIGURE_AUTOCOMPLETE,
    DBCONNECT_DEBUG_FILE,
    DBCONNECT_RUN_FILE,
    ENVIRONMENT_REFRESH,
    REINSTALL_DBCONNECT,
    SELECT_PYTHON_INTERPRETER,
    ENVIRONMENT_SETUP,
    INSTALL_UV,
    python,
    RERUN_PYTHON_ENV,
    USE_MANUAL_PYTHON_SETUP,
    VERIFY_NOTEBOOK_INIT_SCRIPT,
} from "./index";
import { ENVIRONMENT_GROUP_ID } from "./PythonEnvironmentSection";

/* eslint-disable @typescript-eslint/naming-convention */

const A = "https://a.cloud.databricks.com";
const CATALOGS = "/api/2.1/unity-catalog/catalogs";
const tempDir = useTempDirs();
const PACKAGE = path.resolve(__dirname, "../../..");
/** The startup script and the autocomplete stub are the package's; other resources keep the fake path the assertions use. */
const EXTENSION = {
    id: "databricks.databricks",
    version: "2.20.0",
    logPath: "/tmp/databricks-vscode-test-logs",
    asAbsolutePath: (p: string) =>
        /^resources[\\/]python[\\/](stubs|00-databricks-init)/.test(p)
            ? path.join(PACKAGE, p)
            : `/extension/${p}`,
    cliVersion: "1.19.0",
    isDevelopment: false,
    globalStoragePath: "/tmp/databricks-vscode-test-storage",
};
const settle = (ms = 20) => new Promise((r) => setTimeout(r, ms));
/** A project venv's interpreter, in the layout `venvInterpreterPath` expects: `Scripts\python.exe` on Windows. */
const VENV_PYTHON = process.platform === "win32" ? ".venv/Scripts/python.exe" : ".venv/bin/python";
/** The bootstrap under the fake `/extension`, joined as the extension joins it. */
const BOOTSTRAP = `/extension/${path.join("resources", "python", "dbconnect-bootstrap.py")}`;

/** The real kernel, connected to a project with a development and a production target, with python registered. */
async function setup(
    options: {
        files?: Record<string, string>;
        settings?: Record<string, unknown>;
        overrides?: Record<string, unknown>;
        productionDefault?: boolean;
        /** The host env and settings that tell the child environments apart. */
        probe?: boolean;
    } = {},
) {
    const t = tempDir();
    const config = t.write(".databrickscfg", `[DEFAULT]\nhost = ${A}\ntoken = dapi-default\n`);
    t.write(
        "project/databricks.yml",
        options.productionDefault
            ? `bundle: {name: demo}\ntargets:\n  dev: {mode: development, workspace: {host: ${A}}}\n  prod: {default: true, mode: production, workspace: {host: ${A}}}\n`
            : `bundle: {name: demo}\ntargets:\n  dev: {default: true, mode: development, workspace: {host: ${A}}}\n  prod: {mode: production, workspace: {host: ${A}}}\n`,
    );
    for (const [name, content] of Object.entries(options.files ?? {})) {
        t.write(`project/${name}`, content);
    }
    if (options.overrides !== undefined) {
        t.write(
            "project/.databricks/bundle/dev/vscode.overrides.json",
            JSON.stringify(options.overrides),
        );
    }
    const root = t.path("project");
    vscode.folders = [root];
    const http = new FakeHttpClient()
        .on("GET", SCIM_ME, () => ({ body: { userName: "me" } }))
        .on("GET", CATALOGS, () => ({ body: { catalogs: [{ name: "main" }] } }));
    const clusters = new FakeClusters([
        apiCluster("c-1", {
            cluster_name: "shared",
            spark_version: "15.4.x-scala2.12",
            data_security_mode: "SINGLE_USER",
        }),
    ]);
    clusters.install(http);
    const files = new FakeFileEvents();
    // Never the user's ~/.ipython.
    const settings: Record<string, unknown> = {
        "databricks.ipythonDir": t.path("ipython"),
        ...(options.probe ? PROBE_SETTINGS : {}),
        ...options.settings,
    };
    const kernelSettings = fakeSettings(settings);
    const kernel = fakeKernel({
        extension: EXTENSION,
        env: { ...(options.probe ? PROBE_ENV : {}), DATABRICKS_CONFIG_FILE: config },
        httpClient: http,
        folders: new MutableState<readonly string[]>([root]),
        files,
        settings: kernelSettings,
        // The attached cluster is re-read on this interval while it is observed.
        computePollIntervalMs: 20,
    });
    const mode = (target: string) => (target === "dev" ? "development" : "production");
    kernel.runner.on(["bundle", "validate"], (args) => ({
        stdout: JSON.stringify({ bundle: { name: "demo", target: args[3], mode: mode(args[3]!) } }),
    }));
    kernel.runner.on(["bundle", "summary"], (args) => ({
        stdout: JSON.stringify({ bundle: { name: "demo", target: args[3] } }),
    }));
    // The interpreter's packages: none, unless a test installs some.
    const packages: { name: string; version: string }[] = [];
    kernel.runner.on(["-m", "pip", "list"], () => ({ stdout: JSON.stringify(packages) }));
    const fake = fakeFeatureHost(kernel);
    const registered = registerFeatures([configurationView, connection, python], fake.host);
    /** Starts the kernel and the features without waiting for a connection or a bundle. */
    const boot = () => {
        kernel.start();
        startFeatures(registered);
    };
    const start = async () => {
        boot();
        await when(kernel.connection.state, (s) => s.status === "connected");
        await when(kernel.bundle.validated, (s) => s.status === "ready");
    };
    const section = () => fake.host.sections.list().find((s) => s.id === "python.environment");
    const rows = async (parent?: ConfigurationItem) => (await section()?.getChildren(parent)) ?? [];
    /** The rows once the evaluation in flight, if any, has published. */
    const rowsWhenSettled = async (parent?: ConfigurationItem) => {
        await settle(300);
        return rows(parent);
    };
    const run = (command: string, ...args: unknown[]) =>
        vscode.commands.get(command)?.(...args) as Promise<unknown>;
    const detections = () =>
        fake.reporter.events.filter((e) => e.name === "python_env.setup.detected");
    const events = (name: string) => fake.reporter.events.filter((e) => e.name === name);
    return {
        t,
        root,
        kernel,
        http,
        clusters,
        /** Changes a setting and tells the listeners, as an edit does. */
        changeSetting: kernelSettings.change,
        files,
        packages,
        rows,
        rowsWhenSettled,
        run,
        boot,
        start,
        detections,
        events,
        fake,
        settings,
    };
}

describe("python feature", () => {
    beforeEach(() => vscode.reset());

    it("shows the uv row for a uv-suitable project (python_setup_visibility)", async () => {
        const s = await setup();
        await s.start();
        expect((await s.rowsWhenSettled()).map((r) => r.label)).toEqual([
            "Set up Python environment",
        ]);
    });

    it("shows the Python Environment group for a pip project (python_setup_visibility_legacy)", async () => {
        new FakeMsPython().install();
        const s = await setup({ files: { "requirements.txt": "requests\n" } });
        await s.start();
        const [group] = await s.rowsWhenSettled();
        expect(group).toMatchObject({
            label: "Python Environment",
            id: ENVIRONMENT_GROUP_ID,
            contextValue: "databricks.environment.root.error",
        });
        // Serverless is the default compute, so there's no cluster to attach, and DB Connect 17 needs Python 3.12.
        expect((await s.rows(group)).map((r) => r.label)).toEqual([
            "Activate an environment with Python 3.12",
            "Can't install databricks-connect without an active python environment",
        ]);
    });

    it("moves between the surfaces when a marker file appears or goes", async () => {
        const s = await setup();
        await s.start();
        expect((await s.rowsWhenSettled()).map((r) => r.label)).toEqual([
            "Set up Python environment",
        ]);
        s.files.touch(s.t.write("project/poetry.lock", ""));
        expect((await s.rowsWhenSettled()).map((r) => r.label)).toEqual(["Python Environment"]);
    });

    it("follows databricks.python.environmentSetup", async () => {
        const s = await setup({ settings: { "databricks.python.environmentSetup": "manual" } });
        await s.start();
        expect((await s.rowsWhenSettled()).map((r) => r.label)).toEqual(["Python Environment"]);
    });

    it("creates no status bar item for the Python state", async () => {
        const s = await setup();
        await s.start();
        await s.rowsWhenSettled();
        expect(
            vscode.statusBarItems.filter(
                (i) => !i.disposed && i.text.includes("Databricks Connect"),
            ),
        ).toEqual([]);
    });

    it("shows nothing for a production target, or signed out", async () => {
        const s = await setup();
        await s.start();
        expect(await s.rowsWhenSettled()).toHaveLength(1);
        await s.kernel.project.selectTarget("prod");
        await when(
            s.kernel.bundle.validated,
            (v) => v.status === "ready" && v.value.target === "prod",
        );
        expect(await s.rows()).toEqual([]);
        await s.kernel.project.selectTarget("dev");
        await when(
            s.kernel.bundle.validated,
            (v) => v.status === "ready" && v.value.target === "dev",
        );
        expect(await s.rowsWhenSettled()).toHaveLength(1);
        await s.kernel.connection.signOut();
        expect(await s.rows()).toEqual([]);
    });

    it("loads ms-python only when the rows show, and checks its interpreter against the attached cluster", async () => {
        const fakePython = new FakeMsPython().install();
        const s = await setup({
            files: { "requirements.txt": "x\n" },
            overrides: { clusterId: "c-1" },
        });
        expect(fakePython.activations).toBe(0);
        await s.start();
        const [group] = await s.rowsWhenSettled();
        expect(fakePython.activations).toBe(1);
        expect(fakePython.lookups[0]).toBe(s.root);
        // The cluster's DBR 15 asks for Python 3.11 once it is read.
        await when(s.kernel.compute.attachedCluster, (c) => c?.details !== undefined);
        expect((await s.rowsWhenSettled(group)).map((r) => r.label)).toEqual([
            "Activate an environment with Python 3.11",
            "Can't install databricks-connect without an active python environment",
        ]);

        s.packages.push({ name: "databricks-connect", version: "15.4.1" });
        fakePython.select(
            resolvedEnvironment({
                executable: s.t.write("venv/bin/python"),
                version: [3, 12, 1],
                tools: ["Conda"],
                type: "Conda",
                name: "dbx",
            }),
        );
        const [readyGroup] = await s.rowsWhenSettled();
        expect(readyGroup.contextValue).toBe("databricks.environment.root.success");
        expect((await s.rows(readyGroup)).map((r) => r.label)).toEqual([
            "Active Environment: dbx",
            "Use python 3.11 to match DBR 15 requirements. Current Python version is 3.12.1.",
            "Databricks Connect: 15.4.1",
            "Setup Databricks builtins for autocompletion",
        ]);
    });

    it("doesn't load ms-python for a production target", async () => {
        const fakePython = new FakeMsPython().install();
        const s = await setup({ productionDefault: true });
        await s.start();
        expect(s.kernel.project.target.value).toBe("prod");
        await settle(300);
        expect(fakePython.activations).toBe(0);
    });

    it("refreshes with progress in the configuration view", async () => {
        const s = await setup();
        await s.start();
        await s.rowsWhenSettled();
        s.t.write("project/environment.yml", "name: x\n");
        // No file event: refresh is what notices it.
        await s.run(ENVIRONMENT_REFRESH);
        expect(vscode.progress).toHaveLength(1);
        expect((await s.rows()).map((r) => r.label)).toEqual(["Python Environment"]);
    });

    it("records python_env.setup.detected once per project, when the first evaluation finishes while connected", async () => {
        const s = await setup({ files: { "uv.lock": "version = 1\n" } });
        await s.start();
        await s.rowsWhenSettled();
        await s.run(ENVIRONMENT_REFRESH);
        await settle();
        expect(s.detections()).toHaveLength(1);
        expect(s.detections()[0]!.properties).toMatchObject({
            "event.primaryManager": "uv",
            "event.setupTrigger": "auto_open",
            "event.setupMode": "uv",
            "event.targetCompute": "serverless",
            "event.hasLockfile": "true",
        });
    });

    describe("the uv setup", () => {
        const FIXTURES = path.join(__dirname, "../../kernel/cli/commands/fixtures/environments");
        const fixture = (name: string) => fs.readFileSync(path.join(FIXTURES, name), "utf-8");
        const FULL = "$(star-full) Full environment setup";
        const serverless = { serverless: true, serverlessVersion: "4" };

        /** Answers setup-local like the CLI: a real run creates the `.venv`; a dry run reports `envKey`. */
        function cliSetupLocal(
            s: Awaited<ReturnType<typeof setup>>,
            options: { dryRunEnvKey?: string } = {},
        ) {
            s.kernel.runner.on(["environments", "setup-local"], (args) => {
                if (args.includes("--dry-run")) {
                    const result = JSON.parse(fixture("dry-run.serverless.json"));
                    if (options.dryRunEnvKey !== undefined) {
                        result.compute.envKey = options.dryRunEnvKey;
                    }
                    return { stdout: JSON.stringify(result) };
                }
                s.t.write(`project/${VENV_PYTHON}`);
                s.t.write("project/.venv/pyvenv.cfg", "uv = 0.9.0\nprompt = demo\n");
                return { stdout: fixture("success.serverless.json") };
            });
        }

        /** Runs a setup command, answering the preset picker with the Full tier. */
        async function runSetup(s: Awaited<ReturnType<typeof setup>>, command: string) {
            const before = vscode.quickInputs.length;
            const done = s.run(command);
            for (let i = 0; i < 100 && vscode.quickInputs.length === before; i++) {
                await settle(10);
            }
            const picker = vscode.quickInputs.at(-1)!;
            expect(picker.title).toBe("Set up Python environment for serverless v4");
            expect(picker.items[0]!.label).toBe(FULL);
            picker.acceptSelection([FULL]);
            await done;
            return picker;
        }

        const setupCalls = (s: Awaited<ReturnType<typeof setup>>) =>
            s.kernel.runner.calls.filter((c) => c.args[0] === "environments");

        it("routes databricks.environment.setup to setup-local, adopts the .venv and shows the row ready", async () => {
            const fakePython = new FakeMsPython().install();
            const s = await setup({ overrides: serverless });
            cliSetupLocal(s);
            await s.start();
            expect((await s.rowsWhenSettled()).map((r) => r.label)).toEqual([
                "Set up Python environment",
            ]);

            await runSetup(s, ENVIRONMENT_SETUP);
            const [call] = setupCalls(s).filter((c) => !c.args.includes("--dry-run"));
            expect(call!.args).toEqual([
                "environments",
                "setup-local",
                "--serverless-version",
                "4",
                "--output",
                "json",
            ]);
            expect(call!.options.cwd).toBe(s.root);
            expect(call!.options.env).toMatchObject({
                DATABRICKS_CONFIG_PROFILE: "DEFAULT",
                DATABRICKS_BUNDLE_TARGET: "dev",
            });
            expect(fakePython.adopted).toEqual([
                { path: path.join(s.root, VENV_PYTHON), resource: s.root },
            ]);
            expect(s.kernel.state.get(SETUP_STATES)?.[s.root]).toMatchObject({
                envKey: "serverless/serverless-v4",
                pythonVersion: "3.12",
            });
            expect((await s.rowsWhenSettled()).map((r) => r.label)).toEqual([
                "Python environment ready",
            ]);
            expect(vscode.infos.map((i) => i.message)).toContain(
                "Python environment ready — .venv created and selected for your Databricks project.",
            );
            expect(s.events("python_env.setup.attempt")).toHaveLength(1);
            expect(s.events("python_env.setup.result")[0]!.properties).toMatchObject({
                "event.outcome": "ok",
            });
        });

        it("runs setup-local with the host env and http.proxy over it, as 2.22.0 did", async () => {
            new FakeMsPython().install();
            const s = await setup({ overrides: serverless, probe: true });
            cliSetupLocal(s);
            await s.start();
            await s.rowsWhenSettled();
            await runSetup(s, ENVIRONMENT_SETUP);
            const [call] = setupCalls(s).filter((c) => !c.args.includes("--dry-run"));
            expect(environmentOf(call?.options.env)).toBe("hostAndProxy");
        });

        it("shows a fresh toast when re-run on a ready environment", async () => {
            new FakeMsPython().install();
            const s = await setup({ overrides: serverless });
            cliSetupLocal(s);
            await s.start();
            await s.rowsWhenSettled();
            await runSetup(s, ENVIRONMENT_SETUP);
            await settle(50);
            vscode.infos.length = 0;
            await runSetup(s, RERUN_PYTHON_ENV);
            await settle(50);
            expect(vscode.infos.map((i) => i.message)).toEqual([
                "Python environment ready — .venv created and selected for your Databricks project.",
            ]);
            expect(s.events("python_env.setup.attempt").at(-1)!.properties).toMatchObject({
                "event.trigger": "rerun",
            });
        });

        it("reads out of sync when the compute's environment key no longer matches", async () => {
            new FakeMsPython().install();
            const s = await setup({ overrides: serverless });
            cliSetupLocal(s, { dryRunEnvKey: "serverless/serverless-v2" });
            await s.start();
            await s.rowsWhenSettled();
            await runSetup(s, ENVIRONMENT_SETUP);
            // The drift check is debounced by 500 ms after the setup completes.
            await settle(900);
            expect((await s.rowsWhenSettled()).map((r) => r.label)).toEqual([
                "Python environment is out of sync",
            ]);
            expect(s.events("python_env.drift")[0]!.properties).toMatchObject({
                "event.fromEnvKey": "serverless/serverless-v4",
                "event.toEnvKey": "serverless/serverless-v2",
            });
        });

        it("asks for a serverless version while the uv setup is the surface (COMP-02)", async () => {
            const s = await setup();
            await s.start();
            await s.rowsWhenSettled();
            expect(s.kernel.compute.serverlessVersionRequired.value).toBe(true);
            await s.kernel.project.selectTarget("prod");
            await settle(50);
            expect(s.kernel.compute.serverlessVersionRequired.value).toBe(false);
        });

        it("doesn't ask for a serverless version for a pip project", async () => {
            const s = await setup({ files: { "requirements.txt": "x\n" } });
            await s.start();
            await s.rowsWhenSettled();
            expect(s.kernel.compute.serverlessVersionRequired.value).toBe(false);
        });

        it("writes the env file when the session starts while connected: a profile, the compute, no token", async () => {
            const s = await setup({ overrides: { clusterId: "c-1" } });
            await s.start();
            const file = path.join(s.root, ".databricks", ".databricks.env");
            for (let i = 0; i < 50 && !fs.existsSync(file); i++) {
                await settle(20);
            }
            const content = fs.readFileSync(file, "utf-8");
            expect(content).toContain("DATABRICKS_CONFIG_PROFILE=DEFAULT");
            expect(content).toContain("DATABRICKS_CLUSTER_ID=c-1");
            expect(content).toContain(`DATABRICKS_TOKEN=${EOL}`);
            expect(content).not.toContain("dapi-default");
        });

        it("marks the serverless default in the env file, and a chosen serverless has no marker", async () => {
            const s = await setup();
            await s.start();
            const file = path.join(s.root, ".databricks", ".databricks.env");
            for (let i = 0; i < 50 && !fs.existsSync(file); i++) {
                await settle(20);
            }
            const asDefault = fs.readFileSync(file, "utf-8");
            expect(asDefault).toContain(`DATABRICKS_SERVERLESS_COMPUTE_ID=auto${EOL}`);
            expect(asDefault).toContain(`DATABRICKS_SERVERLESS_COMPUTE_DEFAULT=1${EOL}`);
        });

        it("writes no default marker for a chosen serverless compute", async () => {
            const s = await setup({ overrides: { serverless: true, serverlessVersion: "4" } });
            await s.start();
            const file = path.join(s.root, ".databricks", ".databricks.env");
            for (let i = 0; i < 50 && !fs.existsSync(file); i++) {
                await settle(20);
            }
            const chosen = fs.readFileSync(file, "utf-8");
            expect(chosen).toContain(`DATABRICKS_SERVERLESS_COMPUTE_ID=auto${EOL}`);
            expect(chosen).not.toContain("DATABRICKS_SERVERLESS_COMPUTE_DEFAULT");
        });

        it("runs the setup when the selected interpreter lacks databricks-connect, and stops quietly if the setup doesn't install it", async () => {
            const fakePython = new FakeMsPython({ selectOnUpdate: true }).install();
            const s = await setup({ overrides: serverless });
            cliSetupLocal(s);
            // A uv-made venv has no pip, so only uv's listing can read it (none here).
            s.kernel.runner.on(["-m", "pip", "list"], {
                exitCode: 1,
                stderr: "No module named pip\n",
            });
            s.kernel.runner.on(["pip", "list"], () => ({ stdout: JSON.stringify(s.packages) }));
            // The uv setup's `.venv` exists; the selected interpreter is a global one without databricks-connect.
            s.t.write(`project/${VENV_PYTHON}`);
            s.t.write("project/.venv/pyvenv.cfg", "uv = 0.9.0\n");
            await s.kernel.state.set(SETUP_STATES, {
                [s.root]: {
                    envKey: "serverless/serverless-v4",
                    pythonVersion: "3.12",
                    timestamp: "2026-10-03T00:00:00Z",
                },
            });
            const other = s.t.write("other/bin/python");
            const otherEnv = resolvedEnvironment({
                executable: other,
                version: [3, 12, 13],
                type: "Global",
                sysPrefix: path.join(s.root, "other"),
            });
            const venvEnv = resolvedEnvironment({
                executable: path.join(s.root, VENV_PYTHON),
                version: [3, 12, 13],
                sysPrefix: path.join(s.root, ".venv"),
            });
            fakePython.known = [otherEnv, venvEnv];
            fakePython.select(otherEnv);
            await s.start();

            vscode.activeEditor = Uri.file(path.join(s.root, "hello.py"));
            await runSetup(s, DBCONNECT_RUN_FILE);
            // The setup ran for real, adopted the `.venv`, and the run stopped: no terminal, no error.
            expect(setupCalls(s).filter((c) => !c.args.includes("--dry-run"))).toHaveLength(1);
            expect(fakePython.adopted).toEqual([
                { path: path.join(s.root, VENV_PYTHON), resource: s.root },
            ]);
            expect(vscode.terminals.find((t) => t.name === "Databricks Connect")).toBeUndefined();
            expect(vscode.errors).toEqual([]);
        });

        it("lets a uv that never answers go on once the probe's timeout passes", async () => {
            const fakePython = new FakeMsPython().install();
            const s = await setup({ overrides: serverless });
            // The probe's timeout, shortened: the real one is 10 s.
            const original = AbortSignal.timeout.bind(AbortSignal);
            const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation(() => original(1));
            try {
                // uv hangs: only its abort ends the spawn.
                s.kernel.runner.on(
                    ["--version"],
                    (_args, options) =>
                        new Promise((_resolve, reject) =>
                            options.signal?.addEventListener("abort", () =>
                                reject(options.signal?.reason),
                            ),
                        ),
                );
                const python = s.t.write(`project/${VENV_PYTHON}`);
                s.t.write("project/.venv/pyvenv.cfg", "uv = 0.9.0\n");
                await s.kernel.state.set(SETUP_STATES, {
                    [s.root]: {
                        envKey: "serverless/serverless-v4",
                        pythonVersion: "3.12",
                        timestamp: "2026-10-03T00:00:00Z",
                    },
                });
                fakePython.select(
                    resolvedEnvironment({
                        executable: python,
                        version: [3, 12, 13],
                        sysPrefix: path.join(s.root, ".venv"),
                    }),
                );
                await s.start();

                vscode.activeEditor = Uri.file(path.join(s.root, "hello.py"));
                await s.run(DBCONNECT_RUN_FILE);
                expect(vscode.terminals.find((t) => t.name === "Databricks Connect")).toBeDefined();
                expect(vscode.errors).toEqual([]);
            } finally {
                timeout.mockRestore();
            }
        });

        it("runs the active file with Databricks Connect in a terminal rooted at the project", async () => {
            const fakePython = new FakeMsPython().install();
            const s = await setup({ overrides: serverless });
            // The uv setup's `.venv` has Databricks Connect; the run checks it through uv's listing.
            s.packages.push({ name: "databricks-connect", version: "17.3.1" });
            s.kernel.runner.on(["pip", "list"], () => ({ stdout: JSON.stringify(s.packages) }));
            const python = s.t.write(`project/${VENV_PYTHON}`);
            s.t.write("project/.venv/pyvenv.cfg", "uv = 0.9.0\n");
            await s.kernel.state.set(SETUP_STATES, {
                [s.root]: {
                    envKey: "serverless/serverless-v4",
                    pythonVersion: "3.12",
                    timestamp: "2026-10-03T00:00:00Z",
                },
            });
            fakePython.select(
                resolvedEnvironment({
                    executable: python,
                    version: [3, 12, 13],
                    sysPrefix: path.join(s.root, ".venv"),
                }),
            );
            await s.start();
            expect((await s.rowsWhenSettled()).map((r) => r.label)).toEqual([
                "Python environment ready",
            ]);

            vscode.activeEditor = Uri.file(path.join(s.root, "hello.py"));
            await s.run(DBCONNECT_RUN_FILE);
            const terminal = vscode.terminals.find((t) => t.name === "Databricks Connect")!;
            expect(terminal.creationOptions.cwd).toBe(s.root);
            expect(terminal.sent).toEqual([
                [
                    escapeExecutableForTerminal(python, "posix"),
                    escapePathArgument(BOOTSTRAP, "posix"),
                    escapePathArgument(path.join(s.root, "hello.py"), "posix"),
                ].join(" "),
            ]);
            expect(s.events("dbconnectRun")[0]!.properties).toMatchObject({
                "event.launchType": "run",
                "event.computeType": "serverless",
            });
            expect(fs.existsSync(path.join(s.root, ".databricks", ".databricks.env"))).toBe(true);
        });

        it("turns automated setup off with useManualPythonSetup", async () => {
            const settings: Record<string, unknown> = {};
            const s = await setup({ settings });
            await s.start();
            await s.run(USE_MANUAL_PYTHON_SETUP);
            expect(
                s.kernel.settings.get({
                    section: "databricks",
                    key: "python.environmentSetup",
                    defaultValue: "auto",
                }),
            ).toBe("manual");
            expect(s.events("python_env.manual_setup.optout")[0]!.properties).toMatchObject({
                "event.scope": "workspace",
                "event.source": "command_palette",
            });
            expect(vscode.infos.at(-1)!.message).toContain(
                "Automated Python environment setup is now off for this project",
            );
        });

        it("installs uv in a terminal once confirmed", async () => {
            const s = await setup();
            await s.start();
            vscode.nextMessageChoice = "Install uv";
            await s.run(INSTALL_UV);
            const terminal = vscode.terminals.find((t) => t.name === "Install uv")!;
            expect(terminal.sent[0]).toContain(
                process.platform === "win32"
                    ? "https://astral.sh/uv/install.ps1"
                    : "https://astral.sh/uv/install.sh",
            );
        });
    });

    describe("the checklist's actions and debugging", () => {
        const serverless = { serverless: true, serverlessVersion: "4" };
        const pip = { "requirements.txt": "ipykernel\n" };

        /** A pip project on serverless, with ms-python and a `.venv` it can create. */
        async function legacy(options: { known?: boolean } = {}) {
            const { msPython: fakePython } = installExtensionPack(
                new FakeMsPython({ selectOnUpdate: true }),
            );
            const s = await setup({ files: pip, overrides: serverless });
            const venv = resolvedEnvironment({
                executable: s.t.write("project/.venv/bin/python"),
                version: [3, 12, 4],
                sysPrefix: path.join(s.root, ".venv"),
            });
            if (options.known) {
                fakePython.known = [venv];
            }
            // ms-python's create flow: makes the venv and selects it.
            vscode.commands.set("python.createEnvironment", async () => fakePython.select(venv));
            // pip install puts the package in the list pip reads.
            s.kernel.runner.on(["-m", "pip", "install"], (args) => {
                const [name, version] = args[3]!.split("==");
                s.packages.push({
                    name: name!,
                    version: version === "17.3.*" ? "17.3.1" : (version ?? "5.10.4"),
                });
                return {};
            });
            await s.start();
            return { s, fakePython, venv };
        }

        it("shows the checklist with the interpreter to activate", async () => {
            const { s } = await legacy();
            const [group] = await s.rowsWhenSettled();
            expect((await s.rows(group)).map((r) => r.label)).toEqual([
                "Activate an environment with Python 3.12",
                "Can't install databricks-connect without an active python environment",
            ]);
        });

        it("sets up: creates the environment, offers the install once, installs and reads ready (run_dbconnect)", async () => {
            const { s } = await legacy();
            await s.rowsWhenSettled();
            vscode.nextMessageChoice = "Install";
            await s.run(ENVIRONMENT_SETUP);
            await settle(500);

            expect(vscode.executed.map((e) => e.command)).toContain("python.createEnvironment");
            // One prompt, from the interpreter change; the setup doesn't add an error that also says "Databricks Connect".
            const prompts = vscode.infos.filter((i) => i.message.includes("Databricks Connect"));
            expect(prompts.map((p) => p.actions)).toEqual([
                ["Install", "Change environment", "Change version"],
            ]);
            expect(vscode.errors).toEqual([]);
            expect(s.kernel.runner.argv.filter((a) => a[2] === "install")).toEqual([
                [
                    "-m",
                    "pip",
                    "install",
                    "databricks-connect==17.3.*",
                    "--disable-pip-version-check",
                ],
                ["-m", "pip", "install", "nbformat", "--disable-pip-version-check"],
            ]);
            expect(
                vscode.outputChannels.find((c) => c.name === "Databricks Connect")?.text,
            ).toContain("databricks-connect==17.3.*");
            expect(s.events("python_env.dbconnect_install")[0]?.properties).toMatchObject({
                "event.outcome": "ok",
            });

            // The install re-evaluated readiness itself; no refresh was needed.
            const [group] = await s.rows();
            expect(group?.contextValue).toBe("databricks.environment.root.success");
            expect((await s.rows(group)).map((r) => r.label)).toEqual([
                "Active Environment: .venv",
                "Databricks Connect: 17.3.1",
                "Setup Databricks builtins for autocompletion",
            ]);
        });

        it("picks from the known environments with selectPythonInterpreter", async () => {
            const { s, fakePython, venv } = await legacy({ known: true });
            await s.rowsWhenSettled();
            vscode.pickFrom = (items) => items.find((i) => i.label === "3.12.4 .venv");
            await s.run(SELECT_PYTHON_INTERPRETER);
            expect(fakePython.adopted).toEqual([{ path: venv.path, resource: s.root }]);
        });

        it("reinstalls with the version asked for", async () => {
            const { s, fakePython, venv } = await legacy();
            fakePython.select(venv);
            await s.rowsWhenSettled();
            vscode.nextInput = "17.3.*";
            await s.run(REINSTALL_DBCONNECT);
            expect(vscode.inputBoxes.at(-1)).toMatchObject({
                prompt: "Enter a version of the Databricks Connect",
                value: "17.3.*",
            });
            expect(s.kernel.runner.argv.some((a) => a[3] === "databricks-connect==17.3.*")).toBe(
                true,
            );
            const [group] = await s.rows();
            expect((await s.rows(group)).map((r) => r.label)).toContain(
                "Databricks Connect: 17.3.1",
            );
        });

        it("refuses to reinstall without an environment", async () => {
            const { s } = await legacy();
            await s.rowsWhenSettled();
            await s.run(REINSTALL_DBCONNECT);
            expect(vscode.errors.map((e) => e.message)).toEqual([
                "Activate a python environment first.",
            ]);
        });

        it("debugs the active file with debugpy, and the provider adds the Databricks variables (RUN-05, RUN-06)", async () => {
            const { s, fakePython, venv } = await legacy();
            s.packages.push({ name: "databricks-connect", version: "17.3.1" });
            fakePython.select(venv);
            await s.rowsWhenSettled();
            vscode.activeEditor = Uri.file(path.join(s.root, "hello.py"));
            await s.run(DBCONNECT_DEBUG_FILE);
            const [session] = vscode.debugSessions;
            expect(session?.configuration).toMatchObject({
                type: "debugpy",
                databricks: true,
                program: path.join(s.root, "hello.py"),
                cwd: s.root,
                python: venv.path,
            });
            expect(s.events("dbconnectRun")[0]?.properties).toMatchObject({
                "event.launchType": "debug",
                "event.computeType": "serverless",
            });

            const [provider] = vscode.debugConfigurationProviders.get("debugpy") as {
                resolveDebugConfigurationWithSubstitutedVariables(
                    f: unknown,
                    c: Record<string, unknown>,
                ): Promise<Record<string, unknown>>;
            }[];
            expect(vscode.debugConfigurationProviders.get("python")).toHaveLength(1);
            const resolved = await provider!.resolveDebugConfigurationWithSubstitutedVariables(
                undefined,
                { ...session!.configuration },
            );
            expect(resolved).toMatchObject({
                program: BOOTSTRAP,
                args: [path.join(s.root, "hello.py")],
            });
            expect(resolved["env"]).toMatchObject({
                DATABRICKS_CONFIG_PROFILE: "DEFAULT",
                DATABRICKS_SERVERLESS_COMPUTE_ID: "auto",
                DATABRICKS_TOKEN: "",
            });
            expect(JSON.stringify(resolved["env"])).not.toContain("dapi-default");
        });
    });
    describe("notebooks and autocomplete", () => {
        const serverless = { serverless: true, serverlessVersion: "4" };
        const pip = { "requirements.txt": "ipykernel\n" };
        const initScript = fs.readFileSync(
            path.join(PACKAGE, "resources/python/00-databricks-init.py"),
            "utf-8",
        );

        /** A pip project on serverless whose `.venv` has Databricks Connect: the checklist reads ready. */
        async function ready(options: { ipython?: boolean; startupFiles?: string[] } = {}) {
            const fakePython = new FakeMsPython().install();
            const s = await setup({ files: pip, overrides: serverless });
            for (const name of options.startupFiles ?? []) {
                s.t.write(`ipython/profile_default/startup/${name}`, "");
            }
            const venv = resolvedEnvironment({
                executable: s.t.write("project/.venv/bin/python"),
                version: [3, 12, 4],
                sysPrefix: path.join(s.root, ".venv"),
            });
            s.packages.push({ name: "databricks-connect", version: "17.3.1" });
            if (options.ipython !== false) {
                s.packages.push({ name: "ipython", version: "8.0.0" });
            }
            s.kernel.runner.on(["-m", "pip", "install"], (args) => {
                s.packages.push({ name: args[3]!, version: "1.0.0" });
                return {};
            });
            fakePython.select(venv);
            await s.start();
            await s.rowsWhenSettled();
            const startup = s.t.path("ipython/profile_default/startup");
            const ipythonRuns = () =>
                s.kernel.runner.calls.filter((c) => c.args[0] === "-m" && c.args[1] === "IPython");
            return { s, venv, startup, ipythonRuns };
        }

        it("offers the builtins as an optional row, and appends the stub to __builtins__.pyi from it (PYENV-09)", async () => {
            const { s } = await ready();
            const [group] = await s.rows();
            expect(group?.contextValue).toBe("databricks.environment.root.success");
            expect((await s.rows(group)).map((r) => r.label)).toContain(
                "Setup Databricks builtins for autocompletion",
            );

            vscode.nextMessageChoice = "Continue";
            await s.run(ENVIRONMENT_SETUP, "checkBuiltins");
            const builtins = path.join(s.root, "__builtins__.pyi");
            expect(vscode.infos[0]).toEqual({
                message: `Create ${builtins}?`,
                actions: ["Continue", "Cancel", "Never for this workspace"],
            });
            expect(fs.readFileSync(builtins, "utf-8")).toContain(
                "from databricks.sdk.runtime import *",
            );
            expect(vscode.infos.at(-1)?.message).toBe(
                "Python environment and Databricks Connect are set up.",
            );
            const [after] = await s.rowsWhenSettled();
            expect((await s.rows(after)).map((r) => r.label)).not.toContain(
                "Setup Databricks builtins for autocompletion",
            );
        });

        it('puts __builtins__.pyi under python.analysis.stubPath, and remembers "Never for this workspace" until configure runs again', async () => {
            const { s } = await ready();
            s.settings["python.analysis.stubPath"] = "typings";
            vscode.nextMessageChoice = "Never for this workspace";
            await s.run(CONFIGURE_AUTOCOMPLETE);
            expect(vscode.infos[0]?.message).toBe(
                `Create ${path.join(s.root, "typings", "__builtins__.pyi")}?`,
            );
            expect(s.kernel.state.get(SKIP_CONFIGURE)).toBe(true);
            const [group] = await s.rowsWhenSettled();
            expect((await s.rows(group)).map((r) => r.label)).not.toContain(
                "Setup Databricks builtins for autocompletion",
            );

            vscode.nextMessageChoice = "Continue";
            await s.run(CONFIGURE_AUTOCOMPLETE);
            expect(s.kernel.state.get(SKIP_CONFIGURE)).toBe(false);
            expect(fs.existsSync(path.join(s.root, "typings", "__builtins__.pyi"))).toBe(true);
        });

        it("doesn't touch python.analysis.extraPaths", async () => {
            const { s } = await ready();
            expect(Object.keys(s.settings)).not.toContain("python.analysis.extraPaths");
        });

        it("writes the Databricks cell markers once per workspace (RUN-09)", async () => {
            installExtensionPack();
            const s = await setup();
            await s.start();
            await settle(50);
            expect(s.settings["jupyter.interactiveWindow.cellMarker.codeRegex"]).toBe(
                "^(# Databricks notebook source|# COMMAND ----------)",
            );
            expect(s.settings["jupyter.interactiveWindow.cellMarker.default"]).toBe(
                "# COMMAND ----------",
            );
            expect(s.kernel.state.get(CELL_MARKERS_WRITTEN)).toBe(true);

            // Removed by the user, they stay removed in the next session.
            delete s.settings["jupyter.interactiveWindow.cellMarker.codeRegex"];
            await s.kernel.project.selectTarget("prod");
            await when(
                s.kernel.bundle.validated,
                (v) => v.status === "ready" && v.value.target === "prod",
            );
            await settle(50);
            expect(s.settings["jupyter.interactiveWindow.cellMarker.codeRegex"]).toBe(undefined);
        });

        it("writes the cell markers once Jupyter is installed or enabled, and not before", async () => {
            const s = await setup();
            await s.start();
            await settle(50);
            expect(s.settings["jupyter.interactiveWindow.cellMarker.codeRegex"]).toBe(undefined);
            expect(s.kernel.state.get(CELL_MARKERS_WRITTEN)).toBe(false);

            installExtensionPack();
            vscode.extensionsChanged.fire();
            await settle(50);
            expect(s.settings["jupyter.interactiveWindow.cellMarker.codeRegex"]).toBe(
                "^(# Databricks notebook source|# COMMAND ----------)",
            );
            expect(s.kernel.state.get(CELL_MARKERS_WRITTEN)).toBe(true);
        });

        it("installs the startup script when the environment is ready, removing outdated copies (RUN-08)", async () => {
            const { startup } = await ready({
                startupFiles: ["00-databricks-init-0123.py", "10-mine.py"],
            });
            await settle(50);
            expect(fs.readdirSync(startup).sort()).toEqual([
                initScriptName(initScript),
                "10-mine.py",
            ]);
            expect(fs.readFileSync(path.join(startup, initScriptName(initScript)), "utf-8")).toBe(
                initScript,
            );
        });

        it("verifies the script on demand in the project's interpreter, with the project's variables", async () => {
            const { s, venv, startup, ipythonRuns } = await ready();
            await s.run(VERIFY_NOTEBOOK_INIT_SCRIPT);
            const [call] = ipythonRuns();
            expect(call).toMatchObject({
                command: venv.path,
                args: ["-m", "IPython", path.join(startup, initScriptName(initScript))],
                options: { cwd: s.root },
            });
            expect(call?.options.env).toMatchObject({
                DATABRICKS_CONFIG_PROFILE: "DEFAULT",
                DATABRICKS_PROJECT_ROOT: s.root,
                DATABRICKS_SERVERLESS_COMPUTE_ID: "auto",
            });
            expect(call?.options.env).not.toHaveProperty("DATABRICKS_TOKEN");
            expect(vscode.progress.length).toBeGreaterThan(0);
            expect(vscode.infos.map((i) => i.message)).toContain(
                "Successfully verified Databricks notebook init scripts",
            );
        });

        it('reports the script\'s errors in the "Databricks Notebooks" channel', async () => {
            const { s } = await ready();
            s.kernel.runner.on(["-m", "IPython"], {
                stderr: "create_and_register_databricks_globals:ModuleNotFoundError:No module named 'databricks.connect'\n",
            });
            vscode.nextErrorChoice = "Open Output Window";
            await s.run(VERIFY_NOTEBOOK_INIT_SCRIPT);
            await settle();
            expect(vscode.errors.map((e) => e.message)).toEqual([
                "There were errors when running the notebook init script. See the Databricks Notebook output window for more details.",
            ]);
            const channel = vscode.outputChannels.find((c) => c.name === "Databricks Notebooks");
            expect(channel?.text).toContain(`Errors in ${initScriptName(initScript)}:`);
            expect(channel?.text).toContain(
                "create_and_register_databricks_globals - ModuleNotFoundError: No module named 'databricks.connect'",
            );
            expect(channel?.shown).toBe(1);
        });

        it("offers to install IPython, then verifies", async () => {
            const { s, ipythonRuns } = await ready({ ipython: false });
            vscode.nextErrorChoice = "Install and try again";
            await s.run(VERIFY_NOTEBOOK_INIT_SCRIPT);
            await settle(300);
            expect(vscode.errors[0]?.message).toBe(
                "Cannot verify databricks notebook init script. IPython is not installed in the current environment: .venv",
            );
            expect(s.kernel.runner.argv).toContainEqual([
                "-m",
                "pip",
                "install",
                "ipython",
                "--disable-pip-version-check",
            ]);
            expect(ipythonRuns()).toHaveLength(1);
        });

        it("says why verifying failed after installing IPython", async () => {
            const { s, ipythonRuns } = await ready({ ipython: false });
            s.settings["databricks.ipythonDir"] = s.t.write("not-a-dir", "");
            vscode.nextErrorChoice = "Install and try again";
            await s.run(VERIFY_NOTEBOOK_INIT_SCRIPT);
            await settle(300);
            expect(s.kernel.runner.argv).toContainEqual([
                "-m",
                "pip",
                "install",
                "ipython",
                "--disable-pip-version-check",
            ]);
            expect(ipythonRuns()).toEqual([]);
            expect(vscode.errors.map((e) => e.message)).toEqual([
                "Cannot verify databricks notebook init script. IPython is not installed in the current environment: .venv",
                expect.stringMatching(
                    /^Failed to verify databricks notebook init scripts: .*ENOTDIR/,
                ),
            ]);
        });

        it("verifies once per interpreter when a notebook comes to the front", async () => {
            const { s, ipythonRuns } = await ready();
            vscode.activeNotebook = Uri.file(path.join(s.root, "a.ipynb"));
            vscode.notebookOpened.fire({});
            // The env file's write is coalesced first.
            await settle(300);
            expect(ipythonRuns()).toHaveLength(1);
            vscode.activeNotebookChanged.fire({ notebook: { uri: vscode.activeNotebook } });
            await settle(300);
            expect(ipythonRuns()).toHaveLength(1);
        });

        it("doesn't verify while no notebook is in front", async () => {
            const { ipythonRuns } = await ready();
            await settle(300);
            expect(ipythonRuns()).toEqual([]);
        });

        it("says why verifying failed when databricks.ipythonDir is a file", async () => {
            const { s, ipythonRuns } = await ready();
            s.settings["databricks.ipythonDir"] = s.t.write("not-a-dir", "");
            await s.run(VERIFY_NOTEBOOK_INIT_SCRIPT);
            await settle();
            expect(ipythonRuns()).toEqual([]);
            expect(vscode.errors).toHaveLength(1);
            expect(vscode.errors[0]!.message).toContain(
                "Failed to verify databricks notebook init scripts",
            );
            expect(vscode.errors[0]!.message).toContain("ENOTDIR");
            expect(
                vscode.outputChannels.find((c) => c.name === "Databricks Notebooks")?.text,
            ).toContain("ENOTDIR");
        });

        it("says why verifying failed when pip can't list the interpreter's packages", async () => {
            const { s, ipythonRuns } = await ready();
            s.kernel.runner.on(["-m", "pip", "list"], {
                exitCode: 1,
                stderr: "/project/.venv/bin/python: No module named pip\n",
            });
            await s.run(VERIFY_NOTEBOOK_INIT_SCRIPT);
            await settle();
            expect(ipythonRuns()).toEqual([]);
            expect(vscode.errors).toEqual([
                {
                    message:
                        "Failed to verify databricks notebook init scripts: /project/.venv/bin/python: No module named pip",
                    actions: ["Open Output Window"],
                },
            ]);
        });

        it("installs the startup script in a databricks.ipythonDir that doesn't exist yet", async () => {
            const { s, startup } = await ready();
            const fresh = s.t.path("does/not/exist/yet");
            s.settings["databricks.ipythonDir"] = fresh;
            await s.run(VERIFY_NOTEBOOK_INIT_SCRIPT);
            await settle();
            expect(fs.readdirSync(path.join(fresh, "profile_default", "startup"))).toEqual([
                initScriptName(initScript),
            ]);
            expect(fs.readdirSync(startup)).toEqual([initScriptName(initScript)]);
            expect(vscode.infos.map((i) => i.message)).toContain(
                "Successfully verified Databricks notebook init scripts",
            );
        });
    });
});

describe("python feature probes", () => {
    beforeEach(() => vscode.reset());
    const FIXTURES = path.join(__dirname, "../../kernel/cli/commands/fixtures/environments");
    const fixture = (name: string) => fs.readFileSync(path.join(FIXTURES, name), "utf-8");
    const FULL = "$(star-full) Full environment setup";
    const serverless = { serverless: true, serverlessVersion: "4" };

    /** Starts a setup command and answers the preset picker with the Full tier; resolves with the command's promise. */
    async function startSetup(
        s: Awaited<ReturnType<typeof setup>>,
        command: string,
        ...args: unknown[]
    ) {
        const before = vscode.quickInputs.length;
        const done = s.run(command, ...args);
        for (let i = 0; i < 100 && vscode.quickInputs.length === before; i++) {
            await settle(10);
        }
        vscode.quickInputs.at(-1)!.acceptSelection([FULL]);
        return done;
    }
    const realRuns = (s: Awaited<ReturnType<typeof setup>>) =>
        s.kernel.runner.calls.filter(
            (c) => c.args[0] === "environments" && !c.args.includes("--dry-run"),
        );

    describe("setup-local failures", () => {
        it("maps a failed run's error JSON to its message and actions, and closes the progress", async () => {
            new FakeMsPython().install();
            const s = await setup({ overrides: serverless });
            s.kernel.runner.on(["environments", "setup-local"], () => ({
                exitCode: 1,
                stdout: fixture("error.cluster.json"),
                stderr: "",
            }));
            await s.start();
            await s.rowsWhenSettled();
            await startSetup(s, ENVIRONMENT_SETUP);
            await settle(50);
            expect(vscode.errors).toEqual([
                {
                    message:
                        "Could not resolve the selected compute. Check the cluster/serverless selection and try again. No changes were made to your project.",
                    actions: ["Configure compute", "Show Logs"],
                },
            ]);
            expect(vscode.progressRunning).toBe(0);
            expect((await s.rowsWhenSettled()).map((r) => r.label)).toEqual([
                "Set up Python environment",
            ]);
            expect(s.events("python_env.setup.result")[0]!.properties).toMatchObject({
                "event.outcome": "failed",
                "event.errorCode": "E_RESOLVE",
            });
        });

        it("keeps a failed setup red through a target switch, and calms it once the compute changes", async () => {
            new FakeMsPython().install();
            const s = await setup({ overrides: serverless });
            // The production target has the same compute, so a switch changes nothing about it.
            s.t.write(
                "project/.databricks/bundle/prod/vscode.overrides.json",
                JSON.stringify(serverless),
            );
            s.kernel.runner.on(["environments", "setup-local"], {
                exitCode: 1,
                stdout: fixture("error.cluster.json"),
            });
            await s.start();
            await s.rowsWhenSettled();
            await startSetup(s, ENVIRONMENT_SETUP);
            await settle(50);
            const setupRow = async () =>
                (await s.rowsWhenSettled()).find((r) => r.label === "Set up Python environment");
            const color = async () => {
                const icon = (await setupRow())?.iconPath as ThemeIcon | undefined;
                return icon?.color?.id;
            };
            expect(await color()).toBe("errorForeground");

            await s.kernel.project.selectTarget("prod");
            await when(
                s.kernel.bundle.validated,
                (v) => v.status === "ready" && v.value.target === "prod",
            );
            await s.kernel.project.selectTarget("dev");
            await when(
                s.kernel.bundle.validated,
                (v) => v.status === "ready" && v.value.target === "dev",
            );
            await settle(50);
            expect(await color()).toBe("errorForeground");

            await s.kernel.compute.select({ kind: "serverless", version: "5" });
            await settle(50);
            expect(await color()).toBeUndefined();
        });

        describe("the red of a failed setup", () => {
            const failing = { exitCode: 1, stdout: fixture("error.cluster.json") };
            const setupRow = async (s: Awaited<ReturnType<typeof setup>>) =>
                (await s.rowsWhenSettled()).find((r) => r.label === "Set up Python environment");
            const isRed = async (s: Awaited<ReturnType<typeof setup>>) =>
                (await setupRow(s))?.iconPath !== undefined &&
                ((await setupRow(s))!.iconPath as ThemeIcon).color?.id === "errorForeground";

            /** A setup-local that fails once the test lets it finish. */
            function heldFailingSetupLocal(s: Awaited<ReturnType<typeof setup>>) {
                const finish: (() => void)[] = [];
                s.kernel.runner.on(
                    ["environments", "setup-local"],
                    () => new Promise((resolve) => finish.push(() => resolve(failing))),
                );
                return finish;
            }

            it("is keyed to the compute the run started on, so a switch during the run doesn't move it", async () => {
                new FakeMsPython().install();
                const s = await setup({ overrides: serverless });
                const finish = heldFailingSetupLocal(s);
                await s.start();
                await s.rowsWhenSettled();
                const done = startSetup(s, ENVIRONMENT_SETUP);
                for (let i = 0; i < 100 && realRuns(s).length === 0; i++) {
                    await settle(10);
                }
                await s.kernel.compute.select({ kind: "serverless", version: "5" });
                await settle(50);
                finish[0]!();
                await done;
                await settle(50);
                // The compute in use is version 5, which the failed run didn't use.
                expect(await isRed(s)).toBe(false);
                // Back on the version the run used: the failure is that compute's.
                await s.kernel.compute.select({ kind: "serverless", version: "4" });
                await settle(50);
                expect(await isRed(s)).toBe(true);
            });

            it("is keyed by what the checklist reads at run start, so a setting changed during the run doesn't move it", async () => {
                new FakeMsPython().install();
                const s = await setup({ overrides: serverless });
                const finish = heldFailingSetupLocal(s);
                await s.start();
                await s.rowsWhenSettled();
                const done = startSetup(s, ENVIRONMENT_SETUP);
                for (let i = 0; i < 100 && realRuns(s).length === 0; i++) {
                    await settle(10);
                }
                s.changeSetting("databricks.connect.serverlessDbconnectVersion", "18.0");
                await settle(50);
                finish[0]!();
                await done;
                await settle(50);
                // The run started with 17.3; the setting now reads 18.0, so the failure doesn't match.
                expect(await isRed(s)).toBe(false);
                s.changeSetting("databricks.connect.serverlessDbconnectVersion", "17.3");
                await settle(50);
                expect(await isRed(s)).toBe(true);
            });

            it("clears when the compute switches to another cluster with the same Runtime and access mode", async () => {
                new FakeMsPython().install();
                const s = await setup({ overrides: { clusterId: "c-1" } });
                s.clusters.clusters.set(
                    "c-2",
                    apiCluster("c-2", {
                        cluster_name: "other",
                        spark_version: "15.4.x-scala2.12",
                        data_security_mode: "SINGLE_USER",
                    }),
                );
                s.kernel.runner.on(["environments", "setup-local"], failing);
                await s.start();
                await s.rowsWhenSettled();
                await when(s.kernel.compute.attachedCluster, (c) => c?.details !== undefined);
                await startSetup(s, ENVIRONMENT_SETUP);
                await settle(50);
                expect(await isRed(s)).toBe(true);

                await s.kernel.compute.select({ kind: "cluster", clusterId: "c-2" });
                await when(
                    s.kernel.compute.attachedCluster,
                    (c) => c?.clusterId === "c-2" && c.details !== undefined,
                );
                await settle(50);
                expect(await isRed(s)).toBe(false);
            });

            it("clears on a Databricks Runtime upgrade of the same cluster", async () => {
                new FakeMsPython().install();
                const s = await setup({ overrides: { clusterId: "c-1" } });
                s.kernel.runner.on(["environments", "setup-local"], failing);
                await s.start();
                await s.rowsWhenSettled();
                await when(s.kernel.compute.attachedCluster, (c) => c?.details !== undefined);
                await startSetup(s, ENVIRONMENT_SETUP);
                await settle(50);
                expect(await isRed(s)).toBe(true);

                s.clusters.clusters.set(
                    "c-1",
                    apiCluster("c-1", {
                        cluster_name: "shared",
                        spark_version: "16.4.x-scala2.12",
                        data_security_mode: "SINGLE_USER",
                    }),
                );
                await when(
                    s.kernel.compute.attachedCluster,
                    (c) => c?.details?.sparkVersion?.startsWith("16") === true,
                );
                await settle(50);
                expect(await isRed(s)).toBe(false);
            });

            it("clears on a change of the Databricks Connect version of a serverless compute", async () => {
                new FakeMsPython().install();
                const s = await setup({ overrides: serverless });
                s.kernel.runner.on(["environments", "setup-local"], failing);
                await s.start();
                await s.rowsWhenSettled();
                await startSetup(s, ENVIRONMENT_SETUP);
                await settle(50);
                expect(await isRed(s)).toBe(true);
                s.changeSetting("databricks.connect.serverlessDbconnectVersion", "18.0");
                await settle(50);
                expect(await isRed(s)).toBe(false);
            });

            it("ignores the serverless Databricks Connect version on a cluster", async () => {
                new FakeMsPython().install();
                const s = await setup({ overrides: { clusterId: "c-1" } });
                s.kernel.runner.on(["environments", "setup-local"], failing);
                await s.start();
                await s.rowsWhenSettled();
                await when(s.kernel.compute.attachedCluster, (c) => c?.details !== undefined);
                await startSetup(s, ENVIRONMENT_SETUP);
                await settle(50);
                s.changeSetting("databricks.connect.serverlessDbconnectVersion", "18.0");
                await settle(50);
                expect(await isRed(s)).toBe(true);
            });
        });

        it("shows the CLI's stderr when stdout isn't JSON, and offers a report", async () => {
            new FakeMsPython().install();
            const s = await setup({ overrides: serverless });
            s.kernel.runner.on(["environments", "setup-local"], () => ({
                exitCode: 1,
                stdout: '{"schemaVersion": 1, "ok": fal',
                stderr: 'Error: unknown command "environments" for "databricks"\n',
            }));
            await s.start();
            await s.rowsWhenSettled();
            await startSetup(s, ENVIRONMENT_SETUP);
            await settle(50);
            expect(vscode.errors).toHaveLength(1);
            expect(vscode.errors[0]!.message).toContain(
                'Error: unknown command "environments" for "databricks"',
            );
            expect(vscode.errors[0]!.actions).toEqual(["Report this problem", "Show Logs"]);
            expect(vscode.progressRunning).toBe(0);
        });

        it("stops quietly when the user cancels a hung run, and can run again", async () => {
            new FakeMsPython().install();
            const s = await setup({ overrides: serverless });
            let aborted = 0;
            s.kernel.runner.on(
                ["environments", "setup-local"],
                (_args, options) =>
                    new Promise((resolve) =>
                        options.signal?.addEventListener("abort", () => {
                            aborted++;
                            resolve({ cancelled: true, exitCode: 143 });
                        }),
                    ),
            );
            await s.start();
            await s.rowsWhenSettled();
            const done = startSetup(s, ENVIRONMENT_SETUP);
            for (let i = 0; i < 100 && realRuns(s).length === 0; i++) {
                await settle(10);
            }
            expect(vscode.progressRunning).toBe(1);
            expect(vscode.progress.at(-1)).toMatchObject({
                title: "Setting up Python environment",
                cancellable: true,
            });
            vscode.cancelProgress();
            await done;
            expect(aborted).toBe(1);
            expect(vscode.progressRunning).toBe(0);
            expect(vscode.errors).toEqual([]);
            expect(s.events("python_env.setup.result")[0]!.properties).toMatchObject({
                "event.outcome": "cancelled",
            });
            // The guard is released: a second click starts a second run.
            s.kernel.runner.on(["environments", "setup-local"], {
                exitCode: 1,
                stdout: fixture("error.cluster.json"),
            });
            await startSetup(s, ENVIRONMENT_SETUP);
            expect(realRuns(s)).toHaveLength(2);
        });
    });

    describe("a setup in flight", () => {
        /** setup-local that runs until the test lets it finish: with success, writing the `.venv`. */
        function heldSetupLocal(s: Awaited<ReturnType<typeof setup>>) {
            const finish: (() => void)[] = [];
            s.kernel.runner.on(
                ["environments", "setup-local"],
                () =>
                    new Promise((resolve) =>
                        finish.push(() => {
                            s.t.write(`project/${VENV_PYTHON}`);
                            s.t.write("project/.venv/pyvenv.cfg", "uv = 0.9.0\n");
                            resolve({ stdout: fixture("success.serverless.json") });
                        }),
                    ),
            );
            return finish;
        }

        it("doesn't start a second setup-local in the project while one runs across a target change", async () => {
            new FakeMsPython().install();
            const s = await setup({ overrides: serverless });
            const finish = heldSetupLocal(s);
            await s.start();
            await s.rowsWhenSettled();
            const first = startSetup(s, ENVIRONMENT_SETUP);
            for (let i = 0; i < 100 && realRuns(s).length === 0; i++) {
                await settle(10);
            }
            await s.kernel.project.selectTarget("prod");
            await when(
                s.kernel.bundle.validated,
                (v) => v.status === "ready" && v.value.target === "prod",
            );
            await s.kernel.project.selectTarget("dev");
            await when(
                s.kernel.bundle.validated,
                (v) => v.status === "ready" && v.value.target === "dev",
            );
            await s.rowsWhenSettled();
            // The row still offers the setup; a second click joins the run in flight.
            const pickers = vscode.quickInputs.length;
            const second = s.run(ENVIRONMENT_SETUP);
            await settle(300);
            expect(vscode.quickInputs).toHaveLength(pickers);
            expect(realRuns(s)).toHaveLength(1);
            finish.forEach((f) => f());
            await Promise.all([first, second]);
            expect(realRuns(s)).toHaveLength(1);
            expect(vscode.progressRunning).toBe(0);
        });

        it("finishes a run the user signed out during, and closes its progress", async () => {
            const fakePython = new FakeMsPython().install();
            const s = await setup({ overrides: serverless });
            const finish = heldSetupLocal(s);
            await s.start();
            await s.rowsWhenSettled();
            const done = startSetup(s, ENVIRONMENT_SETUP);
            for (let i = 0; i < 100 && realRuns(s).length === 0; i++) {
                await settle(10);
            }
            await s.kernel.connection.signOut();
            await when(s.kernel.connection.state, (c) => c.status === "signedOut");
            finish.forEach((f) => f());
            await done;
            await settle(50);
            expect(vscode.progressRunning).toBe(0);
            expect(vscode.errors).toEqual([]);
            expect(fakePython.adopted).toEqual([
                { path: path.join(s.root, VENV_PYTHON), resource: s.root },
            ]);
            expect(s.kernel.state.get(SETUP_STATES)?.[s.root]).toMatchObject({
                envKey: "serverless/serverless-v4",
            });
            // Signed out, the rows are hidden; signed in again, the project reads ready.
            expect(await s.rows()).toEqual([]);
            await s.kernel.connection.useProfile("DEFAULT");
            await when(s.kernel.connection.state, (c) => c.status === "connected");
            expect((await s.rowsWhenSettled()).map((r) => r.label)).toEqual([
                "Python environment ready",
            ]);
        });
    });

    it("keeps the listener count flat over sign-outs and target switches with the checklist shown", async () => {
        const fakePython = new FakeMsPython().install();
        const s = await setup({ files: { "requirements.txt": "x\n" }, overrides: serverless });
        fakePython.select(
            resolvedEnvironment({
                executable: s.t.write("project/.venv/bin/python"),
                version: [3, 12, 4],
                sysPrefix: path.join(s.root, ".venv"),
            }),
        );
        await s.start();
        const shown = async () =>
            expect((await s.rowsWhenSettled()).map((r) => r.label)).toEqual(["Python Environment"]);
        await shown();
        const cycle = async () => {
            await s.kernel.connection.signOut();
            await when(s.kernel.connection.state, (c) => c.status === "signedOut");
            await s.kernel.connection.useProfile("DEFAULT");
            await when(s.kernel.connection.state, (c) => c.status === "connected");
            await shown();
            for (const target of ["prod", "dev", "prod", "dev", "prod", "dev"]) {
                await s.kernel.project.selectTarget(target);
                await when(
                    s.kernel.bundle.validated,
                    (v) => v.status === "ready" && v.value.target === target,
                );
            }
            await shown();
        };
        await cycle();
        const baseline = liveListenerCount();
        for (let i = 0; i < 3; i++) {
            await cycle();
        }
        expect(liveListenerCount()).toBe(baseline);
    }, 30_000);

    describe("from the Command Palette, without arguments", () => {
        const PALETTE = [
            ENVIRONMENT_REFRESH,
            ENVIRONMENT_SETUP,
            SELECT_PYTHON_INTERPRETER,
            REINSTALL_DBCONNECT,
            CONFIGURE_AUTOCOMPLETE,
            VERIFY_NOTEBOOK_INIT_SCRIPT,
            DBCONNECT_RUN_FILE,
            DBCONNECT_DEBUG_FILE,
            USE_MANUAL_PYTHON_SETUP,
            INSTALL_UV,
        ];

        /** Runs each command with no arguments, dismissing any picker it opens: the errors each showed, or how it didn't finish. */
        async function runAll(s: Awaited<ReturnType<typeof setup>>) {
            const shown: Record<string, string[]> = {};
            for (const command of PALETTE) {
                vscode.errors.length = 0;
                const before = vscode.quickInputs.length;
                const done = s.run(command).then(
                    () => "done",
                    (e: unknown) => `rejected: ${String(e)}`,
                );
                let outcome: string | undefined;
                for (let i = 0; i < 100 && outcome === undefined; i++) {
                    await settle(10);
                    vscode.quickInputs.slice(before).forEach((q) => q.hide());
                    outcome = await Promise.race([done, Promise.resolve(undefined)]);
                }
                shown[command] = [
                    ...(outcome === "done" ? [] : [outcome ?? "hung"]),
                    ...vscode.errors.map((e) => e.message),
                ];
            }
            return shown;
        }
        const nothing = Object.fromEntries(PALETTE.map((c) => [c, []]));

        it("shows only user-facing errors in a pip project without an interpreter", async () => {
            installExtensionPack();
            const s = await setup({ files: { "requirements.txt": "x\n" }, overrides: serverless });
            await s.start();
            await s.rowsWhenSettled();
            const notReady =
                "Failed to set up Python environment for Databricks Connect:\nDatabricks Connect requires Python 3.12. No active environments found.\n" +
                "Can't install databricks-connect without an active python environment";
            expect(await runAll(s)).toEqual({
                ...nothing,
                [ENVIRONMENT_SETUP]: [notReady],
                [REINSTALL_DBCONNECT]: ["Activate a python environment first."],
                [VERIFY_NOTEBOOK_INIT_SCRIPT]: [
                    "Cannot verify databricks notebook init script. Set up the Python environment for Databricks Connect first.",
                ],
                [DBCONNECT_RUN_FILE]: [notReady],
                [DBCONNECT_DEBUG_FILE]: [notReady],
            });
            expect(vscode.terminals.map((t) => t.name)).not.toContain("Databricks Connect");
            expect(vscode.debugSessions).toEqual([]);
        });

        it("says which extension of the pack a command needs, in a pip project without them", async () => {
            const s = await setup({ files: { "requirements.txt": "x\n" }, overrides: serverless });
            await s.start();
            await s.rowsWhenSettled();
            const needs = (what: string) => [
                `${what} needs the Python extension (ms-python.python). Install it, or enable it if it's disabled.`,
            ];
            expect(await runAll(s)).toEqual({
                ...nothing,
                [ENVIRONMENT_SETUP]: needs("Selecting a Python interpreter"),
                [SELECT_PYTHON_INTERPRETER]: needs("Selecting a Python interpreter"),
                [REINSTALL_DBCONNECT]: needs("Reinstalling Databricks Connect"),
                [VERIFY_NOTEBOOK_INIT_SCRIPT]: needs("Verifying the notebook init script"),
                [DBCONNECT_RUN_FILE]: needs("Running a file with Databricks Connect"),
                [DBCONNECT_DEBUG_FILE]: needs("Debugging a file with Databricks Connect"),
            });
            vscode.errors.length = 0;
            await s.run(DBCONNECT_RUN_FILE);
            await settle(10);
            expect(vscode.errors.map((e) => e.actions)).toEqual([["Install"]]);
            expect(vscode.debugSessions).toEqual([]);
            expect(
                vscode.executed.map((e) => e.command).filter((c) => c.startsWith("python.")),
            ).toEqual([]);
        });

        it("asks for a bundle project in a folder without one", async () => {
            new FakeMsPython().install();
            const s = await setup();
            fs.rmSync(path.join(s.root, "databricks.yml"));
            s.boot();
            await settle(300);
            const project = ["Open a Databricks project first."];
            expect(await runAll(s)).toEqual({
                ...Object.fromEntries(PALETTE.map((c) => [c, project])),
                [USE_MANUAL_PYTHON_SETUP]: [],
                [INSTALL_UV]: [],
            });
        });
    });
});
