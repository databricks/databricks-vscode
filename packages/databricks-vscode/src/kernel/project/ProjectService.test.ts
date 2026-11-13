import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { FileSearch } from "../../platform/fileSearch";
import { MutableState, when } from "../../platform/reactive";
import { StateStore } from "../../platform/state";
import { FakeFileEvents } from "../../test-support/fakeFiles";
import { fakeLog, fakeMemento } from "../../test-support/fakes";
import { globFileSearch } from "../../test-support/fileSearch";
import { useTempDirs } from "../../test-support/tempDir";
import {
    ACTIVE_PROJECT_PATH,
    LEGACY_TARGET,
    PROJECT_TARGETS,
    ProjectService,
} from "./ProjectService";

const tempDir = useTempDirs();
const HOST = "https://a.cloud.databricks.com";
const bundle = (targets: string) => `bundle: {name: demo}\ntargets:\n${targets}`;

function setup(folders: string[], options: { state?: StateStore; search?: FileSearch } = {}) {
    const files = new FakeFileEvents();
    const state =
        options.state ?? new StateStore({ global: fakeMemento(), workspace: fakeMemento() });
    const folderState = new MutableState<readonly string[]>(folders);
    const search = options.search ?? globFileSearch;
    const service = new ProjectService({
        folders: folderState,
        files,
        search,
        state,
        log: fakeLog(),
        debounceMs: 5,
    });
    const initialized = () => when(service.initialized, (i) => i);
    /** Reports a file event and waits for the pass it starts. */
    const touch = async (file: string) => {
        files.touch(file);
        await new Promise((r) => setTimeout(r, 20));
        await service.settled();
    };
    /**
     * Reports a file event and waits until `check` passes. The reload is behind two
     * debounces, BundleFiles' and the service's, whose timers Windows can wake ~16 ms
     * late each, so a fixed wait sometimes reads the state before the pass.
     */
    const touchUntil = async (file: string, check: () => void) => {
        files.touch(file);
        await vi.waitFor(async () => {
            await service.settled();
            check();
        });
    };
    return { service, files, state, folders: folderState, initialized, touch, touchUntil };
}

describe("ProjectService", () => {
    it("has no project and is initialized at once without folders", async () => {
        const { service, initialized } = setup([]);
        service.start();
        await initialized();
        expect(service.root.value).toBeUndefined();
        expect(service.active.value).toBeUndefined();
    });

    it("detects a bundle in the first folder, and picks its default target", async () => {
        const t = tempDir();
        t.write(
            "databricks.yml",
            bundle(`  dev: {default: true, workspace: {host: ${HOST}}}\n  prod: {}`),
        );
        const { service, initialized } = setup([t.dir]);
        expect(service.initialized.value).toBe(false);
        service.start();
        await initialized();
        expect(service.active.value?.rootFile).toBe(t.path("databricks.yml"));
        expect(service.active.value?.config.targets.map((tg) => tg.name)).toEqual(["dev", "prod"]);
        expect(service.target.value).toBe("dev");
        expect(service.overrides.value).toEqual({});
    });

    it("uses the saved project folder when it still exists inside a workspace folder", async () => {
        const t = tempDir();
        t.write("nested/databricks.yml", bundle("  dev: {}"));
        const { service, state, initialized } = setup([t.dir]);
        await state.set(ACTIVE_PROJECT_PATH, t.path("nested"));
        service.start();
        await initialized();
        expect(service.root.value).toBe(t.path("nested"));
        expect(service.active.value?.root).toBe(t.path("nested"));
    });

    it("falls back to the first folder when the saved one no longer exists", async () => {
        const t = tempDir();
        const { service, state, initialized } = setup([t.dir]);
        await state.set(ACTIVE_PROJECT_PATH, t.path("deleted"));
        service.start();
        await initialized();
        expect(service.root.value).toBe(t.dir);
    });

    it("falls back to the first folder when the saved one is outside the workspace", async () => {
        const inside = tempDir();
        const outside = tempDir();
        const { service, state, initialized } = setup([inside.dir]);
        await state.set(ACTIVE_PROJECT_PATH, outside.dir);
        service.start();
        await initialized();
        expect(service.root.value).toBe(inside.dir);
    });

    it("detects a root bundle written mid-session", async () => {
        const t = tempDir();
        const { service, initialized, touchUntil } = setup([t.dir]);
        service.start();
        await initialized();
        expect(service.active.value).toBeUndefined();
        const file = t.write("databricks.yml", bundle("  dev: {}"));
        await touchUntil(file, () => expect(service.active.value?.rootFile).toBe(file));
        expect(service.target.value).toBe("dev");
    });

    it("drops the project when the root file goes away", async () => {
        const t = tempDir();
        const file = t.write("databricks.yml", bundle("  dev: {}"));
        const { service, initialized, touchUntil } = setup([t.dir]);
        service.start();
        await initialized();
        fs.rmSync(file);
        await touchUntil(file, () => expect(service.active.value).toBeUndefined());
    });

    it("reloads when an included file changes", async () => {
        const t = tempDir();
        t.write("databricks.yml", "include: [targets/*.yml]");
        const included = t.write("targets/dev.yml", bundle("  dev: {}"));
        const { service, initialized, touchUntil } = setup([t.dir]);
        service.start();
        await initialized();
        expect(service.active.value?.config.targets.map((tg) => tg.name)).toEqual(["dev"]);
        fs.writeFileSync(included, bundle("  dev: {}\n  prod: {}"));
        await touchUntil(included, () =>
            expect(service.active.value?.config.targets.map((tg) => tg.name)).toEqual([
                "dev",
                "prod",
            ]),
        );
    });

    it("reports a change to an included file before the pass it starts", async () => {
        const t = tempDir();
        t.write("databricks.yml", "include: [targets/*.yml]");
        const included = t.write("targets/dev.yml", bundle("  dev: {}"));
        const { service, initialized, touchUntil } = setup([t.dir]);
        service.start();
        await initialized();
        const order: string[] = [];
        service.onBundleFileChanged(() => order.push("file"));
        service.onDetectionEnded(() => order.push("pass"));
        fs.writeFileSync(included, bundle("  dev: {}\n  prod: {}"));
        await touchUntil(included, () => expect(order).toEqual(["file", "pass"]));
    });

    it("ends a pass that finds no change without changing the project", async () => {
        const t = tempDir();
        const file = t.write("databricks.yml", bundle("  dev: {}"));
        const { service, initialized, touchUntil } = setup([t.dir]);
        service.start();
        await initialized();
        let changes = 0;
        let ended = 0;
        service.snapshot.onDidChange(() => changes++);
        service.onDetectionEnded(() => ended++);
        fs.writeFileSync(file, `# a comment\n${bundle("  dev: {}")}`);
        await touchUntil(file, () => expect(ended).toBe(1));
        expect(changes).toBe(0);
    });

    it("still runs the detection pass when a listener of a bundle file change throws", async () => {
        const t = tempDir();
        // Outside the root, so only the bundle's own watcher reports it, not the overrides' ones.
        const shared = tempDir();
        t.write("databricks.yml", `include: ["${shared.dir}/*.yml"]`);
        const included = shared.write("dev.yml", bundle("  dev: {}"));
        const { service, initialized, touchUntil } = setup([t.dir]);
        service.start();
        await initialized();
        let passes = 0;
        service.onBundleFileChanged(() => {
            throw new Error("listener failed");
        });
        service.onDetectionEnded(() => passes++);
        // The error leaves the timer that fired the event, so take it here as
        // the process would, and let the runner's handler back in afterwards.
        const runner = process.listeners("uncaughtException");
        const thrown: unknown[] = [];
        process.removeAllListeners("uncaughtException");
        process.on("uncaughtException", (e) => thrown.push(e));
        try {
            fs.writeFileSync(included, bundle("  dev: {}\n  prod: {}"));
            await touchUntil(included, () => expect(passes).toBe(1));
            expect(thrown).toEqual([new Error("listener failed")]);
        } finally {
            process.removeAllListeners("uncaughtException");
            for (const listener of runner) {
                process.on("uncaughtException", listener);
            }
        }
    });

    it("ends a pass that fails, so a listener of the target guard can decide again", async () => {
        const t = tempDir();
        const { service, initialized } = setup([t.dir], {
            search: {
                find: async () => {
                    throw new Error("search failed");
                },
            },
        });
        service.start();
        await initialized();
        let ended = 0;
        service.onDetectionEnded(() => ended++);
        await service.reloadTargetFiles();
        expect(ended).toBe(1);
    });

    it("keeps the last good config while a file doesn't parse", async () => {
        const t = tempDir();
        const file = t.write("databricks.yml", bundle(`  dev: {workspace: {host: ${HOST}}}`));
        const { service, initialized, touch } = setup([t.dir]);
        service.start();
        await initialized();
        const before = service.active.value;
        fs.writeFileSync(file, "targets: [unclosed");
        await touch(file);
        expect(service.active.value).toBe(before);
    });

    it("chooses the saved target, then the old per-window one, then the default, then the only one", async () => {
        const t = tempDir();
        t.write("databricks.yml", bundle("  a: {}\n  b: {default: true}\n  c: {}"));
        const { service, state, initialized } = setup([t.dir]);
        service.start();
        await initialized();
        expect(service.target.value).toBe("b");

        await state.set(LEGACY_TARGET, "c");
        await service.selectProject(t.dir);
        expect(service.target.value).toBe("c");

        await service.selectTarget("a");
        expect(service.target.value).toBe("a");
        expect(state.get(PROJECT_TARGETS)).toEqual({ [t.dir]: "a" });
        // The old key is copied from, never written.
        expect(state.get(LEGACY_TARGET)).toBe("c");
    });

    it("has no target when several exist and none is the default", async () => {
        const t = tempDir();
        t.write("databricks.yml", bundle("  a: {}\n  b: {}"));
        const { service, initialized } = setup([t.dir]);
        service.start();
        await initialized();
        expect(service.target.value).toBeUndefined();
        await expect(service.selectTarget("missing")).rejects.toThrow(/no target 'missing'/);
    });

    it.each([
        ["databricks.yml", "databricks.yaml"],
        ["databricks.yml", "bundle.yml"],
    ])(
        "detects no project, and no sub-project, while %s and %s are both in the folder",
        async (first, second) => {
            const t = tempDir();
            t.write(first, bundle("  dev: {}"));
            const extra = t.write(second, bundle("  other: {}"));
            const { service, initialized, touchUntil } = setup([t.dir]);
            service.start();
            await initialized();
            expect(service.root.value).toBe(t.dir);
            expect(service.active.value).toBeUndefined();
            // The root isn't its own sub-project, so the welcome says no project was detected.
            expect(service.subProjects.value).toEqual([]);

            fs.rmSync(extra);
            await touchUntil(extra, () =>
                expect(service.active.value?.rootFile).toBe(t.path(first)),
            );
            expect(service.target.value).toBe("dev");
        },
    );

    it("drops a saved target that the YAML renamed, at startup and mid-session", async () => {
        const t = tempDir();
        const file = t.write("databricks.yml", bundle("  development: {}\n  prod: {}"));
        const { service, state, initialized, touchUntil } = setup([t.dir]);
        await state.set(PROJECT_TARGETS, { [t.dir]: "dev" });
        service.start();
        await initialized();
        expect(service.active.value?.root).toBe(t.dir);
        expect(service.target.value).toBeUndefined();

        await service.selectTarget("development");
        expect(service.target.value).toBe("development");
        fs.writeFileSync(file, bundle("  develop: {}\n  prod: {}"));
        await touchUntil(file, () => expect(service.target.value).toBeUndefined());
        expect(service.overrides.value).toBeUndefined();

        fs.writeFileSync(file, bundle("  develop: {}\n  prod: {default: true}"));
        await touchUntil(file, () => expect(service.target.value).toBe("prod"));
    });

    it("saves an override and shows it as soon as the write resolves", async () => {
        const t = tempDir();
        t.write("databricks.yml", bundle("  dev: {}"));
        const { service, initialized } = setup([t.dir]);
        service.start();
        await initialized();
        const project = service.active.value;
        await service.saveOverride("authProfile", "COPY");
        expect(service.overrides.value).toEqual({ authProfile: "COPY" });
        // The project itself didn't change, so sessions bound to it don't restart.
        expect(service.active.value).toBe(project);
    });

    it("saves a new project's profile for its default target, else its only one, before it loads", async () => {
        const t = tempDir();
        t.write("a/databricks.yml", bundle("  dev: {default: true}\n  prod: {}"));
        t.write(
            "a/.databricks/bundle/dev/vscode.overrides.json",
            JSON.stringify({ clusterId: "c" }),
        );
        t.write("b/databricks.yml", bundle("  only: {}"));
        t.write("c/databricks.yml", bundle("  x: {}\n  y: {}"));
        const { service, initialized } = setup([t.dir]);
        service.start();
        await initialized();
        await expect(service.saveProfileForNewProject(t.path("a"), "DEFAULT")).resolves.toBe("dev");
        expect(
            JSON.parse(
                fs.readFileSync(t.path("a/.databricks/bundle/dev/vscode.overrides.json"), "utf-8"),
            ),
        ).toEqual({
            clusterId: "c",
            authProfile: "DEFAULT",
        });
        await expect(service.saveProfileForNewProject(t.path("b"), "DEFAULT")).resolves.toBe(
            "only",
        );
        expect(fs.existsSync(t.path("b/.databricks/bundle/only/vscode.overrides.json"))).toBe(true);
        await expect(
            service.saveProfileForNewProject(t.path("c"), "DEFAULT"),
        ).resolves.toBeUndefined();
        await expect(
            service.saveProfileForNewProject(t.path("none"), "DEFAULT"),
        ).resolves.toBeUndefined();
        expect(fs.existsSync(t.path("c/.databricks"))).toBe(false);

        await service.selectProject(t.path("a"));
        expect(service.overrides.value).toEqual({ clusterId: "c", authProfile: "DEFAULT" });
    });

    it("picks up an overrides file edited outside the extension", async () => {
        const t = tempDir();
        t.write("databricks.yml", bundle("  dev: {}"));
        const { service, initialized, touchUntil } = setup([t.dir]);
        service.start();
        await initialized();
        const file = t.write(
            ".databricks/bundle/dev/vscode.overrides.json",
            JSON.stringify({ authProfile: "X" }),
        );
        await touchUntil(file, () => expect(service.overrides.value).toEqual({ authProfile: "X" }));
    });

    it("reads the target's variable overrides, and picks up edits made outside the extension", async () => {
        const t = tempDir();
        t.write("databricks.yml", bundle("  dev: {}\n  prod: {}"));
        t.write(".databricks/bundle/prod/vscode.bundlevars.json", JSON.stringify({ v: "prod" }));
        const { service, state, initialized, touchUntil } = setup([t.dir]);
        await state.set(PROJECT_TARGETS, { [t.dir]: "dev" });
        service.start();
        await initialized();
        expect(service.variables.value).toEqual({});

        const file = t.write(
            ".databricks/bundle/dev/vscode.bundlevars.json",
            JSON.stringify({ v: "x", empty: "" }),
        );
        await touchUntil(file, () => expect(service.variables.value).toEqual({ v: "x" }));

        await service.selectTarget("prod");
        expect(service.variables.value).toEqual({ v: "prod" });
    });

    it("treats a variables file that doesn't parse as no overrides", async () => {
        const t = tempDir();
        t.write("databricks.yml", bundle("  dev: {}"));
        t.write(".databricks/bundle/dev/vscode.bundlevars.json", '{"v": ');
        const { service, initialized } = setup([t.dir]);
        service.start();
        await initialized();
        expect(service.variables.value).toEqual({});
    });

    it("creates the variables file without rewriting it, and resets it without waiting for the watcher", async () => {
        const t = tempDir();
        t.write("databricks.yml", bundle("  dev: {}"));
        const { service, initialized } = setup([t.dir]);
        service.start();
        await initialized();
        const file = await service.ensureVariablesFile();
        expect(file).toBe(t.path(".databricks/bundle/dev/vscode.bundlevars.json"));
        expect(fs.readFileSync(file, "utf-8")).toBe("{}");

        fs.writeFileSync(file, '{"v":   "x"}');
        await service.ensureVariablesFile();
        expect(fs.readFileSync(file, "utf-8")).toBe('{"v":   "x"}');
        // A save in an editor reloads directly.
        await service.reloadTargetFiles();
        expect(service.variables.value).toEqual({ v: "x" });

        await service.resetVariables();
        expect(fs.existsSync(file)).toBe(false);
        expect(service.variables.value).toEqual({});
        // Resetting again, with no file, is fine.
        await service.resetVariables();
    });

    it("lists the sub-projects when the folder has no bundle", async () => {
        const t = tempDir();
        t.write("nested1/databricks.yml");
        t.write("double/nested2/bundle.yaml");
        t.write("node_modules/pkg/databricks.yml");
        const { service, initialized } = setup([t.dir]);
        service.start();
        await initialized();
        expect(service.subProjects.value.map((p) => p.relative)).toEqual([
            path.join("double", "nested2"),
            "nested1",
        ]);
    });

    it("follows the workspace folders", async () => {
        const a = tempDir();
        const b = tempDir();
        b.write("databricks.yml", bundle("  dev: {}"));
        const { service, folders, initialized } = setup([a.dir]);
        service.start();
        await initialized();
        folders.set([b.dir]);
        await vi.waitFor(async () => {
            await service.settled();
            expect(service.active.value?.root).toBe(b.dir);
        });
    });

    it("moves its watchers with the active folder", async () => {
        const a = tempDir();
        a.write("nested/databricks.yml", bundle("  dev: {}"));
        const { service, files, initialized } = setup([a.dir]);
        service.start();
        await initialized();
        await service.selectProject(a.path("nested"));
        expect(files.watched().every((w) => w.startsWith(a.path("nested")))).toBe(true);
        service.dispose();
        expect(files.watched()).toEqual([]);
    });
});

describe("ProjectService.findSubProjects", () => {
    /** The sub-projects of `root`, as the project picker labels them. */
    const subProjects = async (root: string) =>
        (await setup([]).service.findSubProjects(root)).map((p) => p.relative);
    /** Links a folder: a junction on Windows, which needs no extra privileges; other systems ignore the type. */
    const link = (target: string, at: string) => {
        fs.mkdirSync(path.dirname(at), { recursive: true });
        fs.symlinkSync(target, at, "junction");
    };

    it("lists each folder below the root that holds a bundle once, in order", async () => {
        const t = tempDir();
        t.write("databricks.yml");
        t.write("B/bundle.yml");
        t.write("a/databricks.yml");
        t.write("c/d/databricks.yaml");
        t.write("e/bundle.yaml");
        t.write("e/databricks.yml");
        t.write("f/notes.yml");
        expect(await subProjects(t.dir)).toEqual(["a", "B", path.join("c", "d"), "e"]);
    });

    it("skips dot-folders and node_modules", async () => {
        const t = tempDir();
        t.write(".git/x/databricks.yml");
        t.write(".venv/lib/pkg/databricks.yml");
        t.write("p/.databricks/bundle/databricks.yml");
        t.write("node_modules/pkg/databricks.yml");
        t.write("p/databricks.yml");
        expect(await subProjects(t.dir)).toEqual(["p"]);
    });

    it("doesn't count a folder named like a bundle file", async () => {
        const t = tempDir();
        t.write("p/databricks.yml/README.md");
        t.write("p/databricks.yml/notes.yml");
        expect(await subProjects(t.dir)).toEqual([]);
    });

    it.each(["darwin", "win32"])("matches bundle files in any case on %s", async (platform) => {
        const t = tempDir();
        t.write("p/DataBricks.YML");
        expect(await onPlatform(platform, () => subProjects(t.dir))).toEqual(["p"]);
    });

    it("matches bundle files by case on Linux", async () => {
        const t = tempDir();
        t.write("p/DataBricks.YML");
        expect(await onPlatform("linux", () => subProjects(t.dir))).toEqual([]);
    });

    it("lists a linked folder that is a bundle, but no bundle inside it", async () => {
        const t = tempDir();
        const outside = tempDir();
        outside.write("proj/databricks.yml");
        outside.write("proj/sub/databricks.yml");
        link(outside.path("proj"), t.path("linked"));
        expect(await subProjects(t.dir)).toEqual(["linked"]);
    });

    it("skips a linked folder whose bundle is also found without a link, as in Yarn workspaces", async () => {
        const t = tempDir();
        t.write("apps/app/databricks.yml");
        link(path.join("..", "apps", "app"), t.path("libs/app"));
        expect(await subProjects(t.dir)).toEqual([path.join("apps", "app")]);
    });

    it("skips copies of the root and its sources reached through a link to the root", async () => {
        const t = tempDir();
        t.write("databricks.yml");
        t.write("jobs/etl/databricks.yml");
        link(t.dir, t.path("bazel-ws"));
        expect(await subProjects(t.dir)).toEqual([path.join("jobs", "etl")]);
    });

    it("skips linked build output that links back to the sources", async () => {
        const t = tempDir();
        const output = tempDir();
        t.write("jobs/etl/databricks.yml");
        link(t.path("jobs"), output.path("bin/jobs/etl.runfiles/ws/jobs"));
        link(output.path("bin"), t.path("bazel-bin"));
        expect(await subProjects(t.dir)).toEqual([path.join("jobs", "etl")]);
    });

    it("skips real copies in build output reached through two links", async () => {
        const t = tempDir();
        const output = tempDir();
        t.write("jobs/etl/databricks.yml");
        output.write("out/bin/jobs/etl/databricks.yml");
        link(output.path("out"), t.path("bazel-out"));
        link(output.path("out/bin"), t.path("bazel-bin"));
        expect(await subProjects(t.dir)).toEqual([path.join("jobs", "etl")]);
    });

    it("searches nothing without a folder", async () => {
        const searched: string[] = [];
        const { service } = setup([], {
            search: { find: async (base) => (searched.push(base), []) },
        });
        expect(await service.findSubProjects()).toEqual([]);
        expect(searched).toEqual([]);
    });

    it("lists a bundle whose folder was deleted after the search found it", async () => {
        const t = tempDir();
        const gone = t.path("gone", "p", "databricks.yml");
        const { service } = setup([], { search: { find: async () => [gone] } });
        expect((await service.findSubProjects(t.dir)).map((p) => p.relative)).toEqual([
            path.join("gone", "p"),
        ]);
    });

    it("lists the sub-projects of a root reached through a link", async () => {
        const t = tempDir();
        const real = tempDir();
        real.write("p/databricks.yml");
        link(real.dir, t.path("root"));
        const found = await setup([]).service.findSubProjects(t.path("root"));
        expect(found).toEqual([{ absolute: t.path("root", "p"), relative: "p" }]);
    });
});

/** Runs `fn` with `process.platform` set to `platform`. */
async function onPlatform<T>(platform: string, fn: () => Promise<T>): Promise<T> {
    const original = Object.getOwnPropertyDescriptor(process, "platform")!;
    Object.defineProperty(process, "platform", { ...original, value: platform });
    try {
        return await fn();
    } finally {
        Object.defineProperty(process, "platform", original);
    }
}
