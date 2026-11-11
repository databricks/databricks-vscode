import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { Emitter } from "../../../platform/event";
import { when } from "../../../platform/reactive";
import { fakeLog } from "../../../test-support/fakes";
import { FakeFileEvents } from "../../../test-support/fakeFiles";
import { resolvedEnvironment } from "../../../test-support/fakeMsPython";
import { useTempDirs } from "../../../test-support/tempDir";
import type { ResolvedEnvironment } from "../msPythonApi";
import type {
    BuiltinsProbe,
    CatalogProbe,
    ChecklistCompute,
    PackageProbe,
} from "./external/checks";
import { MARKER_FILES, PythonEnvironment } from "./PythonEnvironment";
import type { PythonEnvironmentSetupMode } from "./pythonSetupGate";

const tempDir = useTempDirs();

function setup(files: Record<string, string> = {}) {
    const t = tempDir();
    for (const [name, content] of Object.entries(files)) {
        t.write(`project/${name}`, content);
    }
    const root = t.path("project");
    fs.mkdirSync(root, { recursive: true });
    const events = new FakeFileEvents();
    const interpreterChanged = new Emitter<void>();
    const setupModeChanged = new Emitter<void>();
    const computeChanged = new Emitter<void>();
    const builtinsChanged = new Emitter<void>();
    const state = {
        env: undefined as ResolvedEnvironment | undefined,
        /** This session's uv setup for the project failed. */
        uvFailed: false,
        /** The Python extension is installed and enabled. */
        python: true,
        mode: "auto" as PythonEnvironmentSetupMode,
        compute: { kind: "none" } as ChecklistCompute,
        catalogs: { kind: "found" } as CatalogProbe,
        dbConnect: { kind: "installed", version: "15.4.1" } as PackageProbe,
        builtins: { kind: "configured" } as BuiltinsProbe,
        builtinsReads: 0,
        /** The interpreters whose packages were read. */
        packageReads: [] as string[],
        lookups: 0,
        /** Holds the Databricks Connect check until it settles. */
        gate: undefined as Promise<void> | undefined,
        /** Holds the interpreter lookup until it settles. */
        lookupGate: undefined as Promise<void> | undefined,
    };
    const environment = new PythonEnvironment({
        root,
        python: {
            activeEnvironment: async () => {
                state.lookups++;
                const env = state.env;
                await state.lookupGate;
                return env;
            },
            onDidChangeInterpreter: interpreterChanged.event,
            get installed() {
                return state.python;
            },
        },
        files: events,
        setupMode: () => state.mode,
        uvSetupFailed: () => state.uvFailed,
        onDidChangeSetupMode: setupModeChanged.event,
        compute: () => state.compute,
        onDidChangeCompute: computeChanged.event,
        catalogs: async () => state.catalogs,
        dbConnect: async (executable) => {
            state.packageReads.push(executable);
            const result = state.dbConnect;
            await state.gate;
            return result;
        },
        builtins: async () => {
            state.builtinsReads++;
            return state.builtins;
        },
        onDidChangeBuiltins: builtinsChanged.event,
        log: fakeLog(),
        condaPrefix: undefined,
    });
    /** Makes `change`, then waits for the evaluation it schedules (after the debounce) to be ready. */
    const settledAfter = async (change: () => void) => {
        // The next ready state rather than a fixed debounce + 50 ms, which the Windows runner can overrun.
        const ready = new Promise<void>((resolve) => {
            const subscription = environment.state.onDidChange((s) => {
                if (s.status === "ready") {
                    subscription.dispose();
                    resolve();
                }
            });
        });
        change();
        await ready;
        return environment.state.value;
    };
    return {
        t,
        root,
        events,
        environment,
        state,
        interpreterChanged,
        setupModeChanged,
        computeChanged,
        builtinsChanged,
        settledAfter,
    };
}

describe("PythonEnvironment", () => {
    it("reads nothing until it starts", async () => {
        const { environment, state, events } = setup();
        expect(environment.state.value.status).toBe("idle");
        expect(environment.readiness).toBe(undefined);
        expect(events.watched()).toEqual([]);
        await new Promise((r) => setTimeout(r, 250));
        expect(state.lookups).toBe(0);
        environment.dispose();
    });

    it("chooses uv for a greenfield project, with nothing set up yet", async () => {
        const { environment } = setup();
        await environment.refresh("test");
        expect(environment.readiness).toEqual({
            strategy: "uv",
            status: "notReady",
            interpreter: undefined,
            checks: [],
        });
        environment.dispose();
    });

    it("marks a uv project whose last setup failed, and not one that never ran", async () => {
        const { environment, state } = setup();
        await environment.refresh("test");
        expect(environment.readiness).not.toHaveProperty("setupFailed");
        state.uvFailed = true;
        await environment.refresh("test");
        expect(environment.readiness).toMatchObject({ strategy: "uv", setupFailed: true });
        environment.dispose();
    });

    it("asks for the Python extension in the interpreter row when it's missing or disabled", async () => {
        const { environment, state } = setup({ "requirements.txt": "requests\n" });
        state.python = false;
        await environment.refresh("test");
        expect(
            environment.readiness?.checks.find((c) => c.id === "checkPythonEnvironment"),
        ).toMatchObject({
            available: false,
            title: "Install the Python extension",
            action: "selectInterpreter",
        });
        environment.dispose();
    });

    it("chooses uv for a packaging-shaped pyproject.toml, as bundle init writes it", async () => {
        const { environment } = setup({
            "pyproject.toml": '[project]\nname = "x"\n[build-system]\nrequires = ["hatchling"]\n',
        });
        await environment.refresh("test");
        expect(environment.readiness?.strategy).toBe("uv");
        environment.dispose();
    });

    it("chooses external for a pip project, with the old checklist's rows in order", async () => {
        const { environment, state } = setup({ "requirements.txt": "requests\n" });
        await environment.refresh("test");
        expect(environment.readiness).toMatchObject({
            strategy: "external",
            status: "notReady",
            checks: [
                {
                    id: "checkCluster",
                    available: false,
                    title: "Attach a cluster",
                    action: "attachCluster",
                },
                { id: "checkWorkspaceHasUc", available: true },
                {
                    id: "checkPythonEnvironment",
                    available: false,
                    title: "Activate an environment with Python 3.10",
                    action: "selectInterpreter",
                },
                {
                    id: "checkEnvironmentDependencies",
                    available: false,
                    title: "Can't install databricks-connect without an active python environment",
                },
                { id: "checkBuiltins", available: true },
            ],
        });
        // Without an interpreter there is nothing to read packages from, and the builtins wait for Databricks Connect.
        expect(state.packageReads).toEqual([]);
        expect(state.builtinsReads).toBe(0);
        environment.dispose();
    });

    it("chooses external when databricks.python.environmentSetup is manual", async () => {
        const { environment, state } = setup();
        state.mode = "manual";
        await environment.refresh("test");
        expect(environment.readiness?.strategy).toBe("external");
        environment.dispose();
    });

    // The e2e hazard: a plain venv is a pip signal, so the CI machine's interpreter can flip the strategy.
    it("counts a plain venv interpreter as pip, and a uv-created one as uv", async () => {
        const { t, environment, state } = setup();
        const sysPrefix = t.path("venv");
        t.write("venv/pyvenv.cfg", "home = /usr/bin\n");
        state.env = resolvedEnvironment({
            executable: t.write("venv/bin/python"),
            sysPrefix,
            tools: ["Venv"],
        });
        await environment.refresh("test");
        expect(environment.readiness?.strategy).toBe("external");

        t.write("venv/pyvenv.cfg", "home = /usr/bin\nuv = 0.5.0\n");
        await environment.refresh("test");
        expect(environment.readiness?.strategy).toBe("uv");
        expect(environment.readiness?.interpreter).toEqual({
            path: t.path("venv/bin/python"),
            name: ".venv",
            version: "3.11.4",
        });
        environment.dispose();
    });

    it("is ready on the external strategy when every row passes, with the installed Databricks Connect", async () => {
        const { t, environment, state } = setup({ "requirements.txt": "requests\n" });
        state.env = resolvedEnvironment({
            executable: t.write("venv/bin/python"),
            version: [3, 11, 2],
        });
        state.compute = { kind: "cluster", dbrVersion: [15, 4, "x"], accessMode: "SINGLE_USER" };
        await environment.refresh("test");
        expect(environment.readiness).toMatchObject({
            strategy: "external",
            status: "ready",
            dbConnectVersion: "15.4.1",
            checks: [
                { id: "checkCluster", available: true },
                { id: "checkWorkspaceHasUc", available: true },
                {
                    id: "checkPythonEnvironment",
                    available: true,
                    title: "Active Environment: .venv",
                },
                {
                    id: "checkEnvironmentDependencies",
                    available: true,
                    title: "Databricks Connect: 15.4.1",
                },
                { id: "checkBuiltins", available: true },
            ],
        });
        expect(state.packageReads).toEqual([t.path("venv/bin/python")]);
        environment.dispose();
    });

    it("offers the optional builtins row once Databricks Connect passes, still ready, and reads it again when the builtins change", async () => {
        const { t, environment, state, builtinsChanged, settledAfter } = setup({
            "requirements.txt": "requests\n",
        });
        state.env = resolvedEnvironment({
            executable: t.write("venv/bin/python"),
            version: [3, 11, 2],
        });
        state.compute = { kind: "cluster", dbrVersion: [15, 4, "x"], accessMode: "SINGLE_USER" };
        state.builtins = { kind: "needed" };
        await environment.refresh("test");
        expect(environment.readiness?.status).toBe("ready");
        expect(environment.readiness?.checks.at(-1)).toEqual({
            id: "checkBuiltins",
            available: false,
            optional: true,
            title: "Setup Databricks builtins for autocompletion",
            message:
                "Optional: create a __builtins__.pyi file to enable autocompletion for Databricks builtins.",
            action: "configureAutocomplete",
        });

        state.builtins = { kind: "configured" };
        const after = await settledAfter(() => builtinsChanged.fire());
        expect(after.status === "ready" && after.value.readiness.checks.at(-1)).toEqual({
            id: "checkBuiltins",
            available: true,
        });
        expect(state.builtinsReads).toBe(2);
        environment.dispose();
    });

    it("isn't ready while Databricks Connect is missing or the workspace has no catalogs", async () => {
        const { t, environment, state } = setup({ "requirements.txt": "requests\n" });
        state.env = resolvedEnvironment({
            executable: t.write("venv/bin/python"),
            version: [3, 12, 2],
        });
        state.compute = { kind: "serverless", dbConnectVersion: "17.3" };
        state.dbConnect = { kind: "missing" };
        await environment.refresh("test");
        expect(environment.readiness?.status).toBe("notReady");
        expect(environment.readiness?.dbConnectVersion).toBe(undefined);
        expect(environment.readiness?.checks[3]).toMatchObject({
            title: "Install databricks-connect",
            action: "installDbConnect",
        });

        state.dbConnect = { kind: "installed", version: "17.3.1" };
        state.catalogs = { kind: "none" };
        await environment.refresh("test");
        expect(environment.readiness?.status).toBe("notReady");
        expect(environment.readiness?.checks[1]).toMatchObject({
            title: "The workspace should have Unity Catalog enabled",
        });
        environment.dispose();
    });

    it("watches the marker files in the project root once started", async () => {
        const { root, environment, events } = setup();
        environment.start();
        expect(events.watched()).toEqual([`${root} ${MARKER_FILES}`]);
        environment.dispose();
        expect(events.watched()).toEqual([]);
    });

    // The old gate was evaluated once, so a fixture change in the window didn't move the row.
    it("re-evaluates when a marker file appears or goes", async () => {
        const { t, root, environment, events, settledAfter } = setup();
        await environment.refresh("test");
        expect(environment.readiness?.strategy).toBe("uv");

        await settledAfter(() => events.touch(t.write("project/requirements.txt", "requests\n")));
        expect(environment.readiness?.strategy).toBe("external");

        await settledAfter(() => {
            fs.rmSync(t.path("project/requirements.txt"));
            events.touch(`${root}/requirements.txt`);
        });
        expect(environment.readiness?.strategy).toBe("uv");
        environment.dispose();
    });

    it("re-evaluates when the interpreter, the setting or the compute changes", async () => {
        const {
            t,
            environment,
            state,
            interpreterChanged,
            setupModeChanged,
            computeChanged,
            settledAfter,
        } = setup({ "requirements.txt": "x\n" });
        state.compute = { kind: "serverless", dbConnectVersion: "17.3" };
        await environment.refresh("test");
        expect(environment.readiness?.status).toBe("notReady");

        state.env = resolvedEnvironment({
            executable: t.write("venv/bin/python"),
            version: [3, 12, 0],
        });
        await settledAfter(() => interpreterChanged.fire());
        expect(environment.readiness?.status).toBe("ready");

        expect(environment.readiness?.checks[2]?.warning).toBe(undefined);
        state.compute = { kind: "cluster", dbrVersion: [15, 4, "x"], accessMode: "SHARED" };
        await settledAfter(() => computeChanged.fire());
        expect(environment.readiness?.checks[2]?.warning).toBe(
            "Use python 3.11 to match DBR 15 requirements. Current Python version is 3.12.0.",
        );

        // Without the pip markers: no requirements.txt, and no plain venv.
        fs.rmSync(t.path("project/requirements.txt"));
        state.env = undefined;
        state.mode = "manual";
        await settledAfter(() => setupModeChanged.fire());
        expect(environment.readiness?.strategy).toBe("external");
        state.mode = "auto";
        await settledAfter(() => setupModeChanged.fire());
        expect(environment.readiness?.strategy).toBe("uv");
        environment.dispose();
    });

    it("evaluates at once when it starts and when it is refreshed, without waiting for the debounce", async () => {
        const { environment, state } = setup();
        environment.start();
        expect(state.lookups).toBe(1);
        await when(environment.state, (s) => s.status === "ready");
        const refreshed = environment.refresh("databricks.environment.refresh");
        expect(state.lookups).toBe(2);
        expect((await refreshed).status).toBe("ready");
        environment.dispose();
    });

    it("coalesces a burst of file events into one evaluation", async () => {
        const { t, environment, events, state, settledAfter } = setup();
        await environment.refresh("test");
        const before = state.lookups;
        await settledAfter(() => {
            for (let i = 0; i < 5; i++) {
                events.touch(t.write("project/uv.lock", `version = ${i}\n`));
            }
        });
        expect(state.lookups - before).toBe(1);
        environment.dispose();
    });

    it("publishes the new compute's readiness, never a late one for the compute it replaced", async () => {
        const { t, environment, state, computeChanged } = setup({ "requirements.txt": "x\n" });
        state.env = resolvedEnvironment({
            executable: t.write("venv/bin/python"),
            version: [3, 12, 0],
        });
        state.compute = { kind: "serverless", dbConnectVersion: "17.3" };
        let release!: () => void;
        state.gate = new Promise((r) => (release = r));
        const published: (string | undefined)[] = [];
        environment.state.onDidChange((s) => {
            if (s.status === "ready") {
                published.push(s.value.readiness.checks[2]?.warning ?? "no warning");
            }
        });
        environment.start();
        for (let i = 0; i < 100 && state.packageReads.length === 0; i++) {
            await new Promise((r) => setTimeout(r, 10));
        }
        // The serverless check is in flight when a DBR 15 cluster is attached.
        state.compute = { kind: "cluster", dbrVersion: [15, 4, "x"], accessMode: "SINGLE_USER" };
        computeChanged.fire();
        state.gate = undefined;
        release();
        // The debounce, the evaluation, and time for a late result to land.
        await new Promise((r) => setTimeout(r, 500));
        expect(published).toEqual([
            "Use python 3.11 to match DBR 15 requirements. Current Python version is 3.12.0.",
        ]);
        expect(environment.readiness?.checks[2]?.warning).toBe(
            "Use python 3.11 to match DBR 15 requirements. Current Python version is 3.12.0.",
        );
        environment.dispose();
    });

    it("re-evaluates for a marker file that appears while an evaluation runs", async () => {
        const { t, root, environment, state, events } = setup();
        let release!: () => void;
        state.lookupGate = new Promise((r) => (release = r));
        const strategies: string[] = [];
        environment.state.onDidChange((s) => {
            if (s.status === "ready") {
                strategies.push(s.value.readiness.strategy);
            }
        });
        environment.start();
        for (let i = 0; i < 100 && state.lookups === 0; i++) {
            await new Promise((r) => setTimeout(r, 10));
        }
        // The first evaluation is reading the interpreter when requirements.txt lands.
        t.write("project/requirements.txt", "x\n");
        events.touch(`${root}/requirements.txt`);
        state.lookupGate = undefined;
        release();
        await new Promise((r) => setTimeout(r, 400));
        expect(state.lookups).toBe(2);
        expect(strategies).toEqual(["external"]);
        expect(environment.readiness?.strategy).toBe("external");
        environment.dispose();
    });

    it("evaluates once for a burst of interpreter changes", async () => {
        const { t, environment, state, interpreterChanged, settledAfter } = setup({
            "requirements.txt": "x\n",
        });
        await environment.refresh("test");
        const before = state.lookups;
        state.env = resolvedEnvironment({
            executable: t.write("venv/bin/python"),
            version: [3, 12, 0],
        });
        const after = await settledAfter(() => {
            for (let i = 0; i < 10; i++) {
                interpreterChanged.fire();
            }
        });
        expect(state.lookups - before).toBe(1);
        expect(after.status === "ready" && after.value.readiness.interpreter?.version).toBe(
            "3.12.0",
        );
        environment.dispose();
    });

    it("degrades to no interpreter when ms-python throws", async () => {
        const { root } = setup();
        const environment = new PythonEnvironment({
            root,
            python: {
                activeEnvironment: () => Promise.reject(new Error("boom")),
                onDidChangeInterpreter: () => ({ dispose: () => {} }),
                installed: true,
            },
            files: new FakeFileEvents(),
            setupMode: () => "auto",
            onDidChangeSetupMode: () => ({ dispose: () => {} }),
            compute: () => ({ kind: "none" }),
            onDidChangeCompute: () => ({ dispose: () => {} }),
            catalogs: async () => ({ kind: "found" }),
            dbConnect: async () => ({ kind: "missing" }),
            log: fakeLog(),
        });
        await environment.refresh("test");
        expect(environment.readiness?.strategy).toBe("uv");
        environment.dispose();
    });
});
