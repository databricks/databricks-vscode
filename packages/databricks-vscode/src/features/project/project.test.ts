import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerFeatures, startFeatures } from "../../kernel/feature";
import { ACTIVE_PROJECT_PATH, PROJECT_TARGETS } from "../../kernel/project/ProjectService";
import type { Host } from "../../kernel/host/Host";
import type { FileSearch } from "../../platform/fileSearch";
import { MutableState, when } from "../../platform/reactive";
import type { Settings } from "../../platform/settings";
import { StateStore } from "../../platform/state";
import { FakeFileEvents } from "../../test-support/fakeFiles";
import { fakeFeatureHost, fakeKernel, fakeMemento, fakeSettings } from "../../test-support/fakes";
import { heldFileSearch } from "../../test-support/fileSearch";
import { evaluateWhen } from "../../test-support/whenClause";
import { SERVERLESS_SESSION } from "../../test-support/sessionEnv";
import { useTempDirs } from "../../test-support/tempDir";
import { host as vscode } from "../../test-support/vscode";
import { project } from "./index";
import { SELECT_PROJECT } from "./LocalFolderSection";
import { SELECT_TARGET, TargetSection } from "./TargetSection";

const tempDir = useTempDirs();

/** The Project view's welcome entries while a folder is open, by their first words. */
const PROJECT_WELCOMES = {
    looking: "Looking for bundles (databricks.yml)",
    choose: "Choose a Databricks project from a subfolder",
    none: "No bundle (databricks.yml) was found",
    loading: "Loading configuration",
} as const;
const welcomes = (
    JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../../package.json"), "utf-8")) as {
        contributes: { viewsWelcome: { view: string; contents: string; when: string }[] };
    }
).contributes.viewsWelcome.filter((w) => w.view === "configurationView");

/** Which of those entries VS Code shows with these context keys, a folder being open. */
function shownWelcomes(keys: ReadonlyMap<string, unknown>): string {
    const atom = (key: string, op?: string, value?: string) => {
        if (key === "workspaceFolderCount") {
            return op === ">" && value === "0";
        }
        const actual = keys.get(key);
        return op === "==" ? actual === value?.replace(/^'(.*)'$/, "$1") : Boolean(actual);
    };
    return Object.entries(PROJECT_WELCOMES)
        .filter(([, start]) => {
            const entry = welcomes.find((w) => w.contents.startsWith(start));
            return entry !== undefined && evaluateWhen(entry.when, atom) === true;
        })
        .map(([name]) => name)
        .join("+");
}

/**
 * What the view showed with `keys`, then after each of `changes` in turn,
 * each repeat of the previous state left out (a state coming back stays in).
 */
function shownAlong(keys: Map<string, unknown>, changes: readonly [string, unknown][]) {
    const shown = [shownWelcomes(keys)];
    for (const [key, value] of changes) {
        keys.set(key, value);
        const now = shownWelcomes(keys);
        if (now !== shown.at(-1)) {
            shown.push(now);
        }
    }
    return shown;
}

/** The bootstrap sets the project key from another listener: in these tests, before the feature's keys. */
const PROJECT_KEY = "databricks.context.project";

function setup(
    folders: string[],
    options: { search?: FileSearch; settings?: Settings; host?: Host } = {},
) {
    vscode.folders = folders;
    const files = new FakeFileEvents();
    const state = new StateStore({ global: fakeMemento(), workspace: fakeMemento() });
    const folderState = new MutableState<readonly string[]>(folders);
    const kernel = fakeKernel({
        folders: folderState,
        files,
        state,
        ...options,
    });
    const contextKeys = new Map<string, unknown>();
    /** Every key in the order it was set, so a test can see what a view saw first. */
    const setOrder: string[] = [];
    /** Every key and value in the order they were set, to replay what a view saw in between. */
    const sets: [string, unknown][] = [];
    const contextKernel = {
        ...kernel,
        contextKeys: {
            set: async (key: { name: string }, value: unknown) => {
                setOrder.push(key.name);
                sets.push([key.name, value]);
                contextKeys.set(key.name, value);
            },
            get: () => undefined,
        },
    } as unknown as typeof kernel;
    const fake = fakeFeatureHost(contextKernel);
    const registered = registerFeatures([project], fake.host);
    kernel.project.start();
    startFeatures(registered);
    const rows = async () => {
        const items = await Promise.all(
            fake.host.sections.list().map(async (s) => s.getChildren()),
        );
        return items.flat();
    };
    const run = (id: string, ...args: unknown[]) =>
        vscode.commands.get(id)!(...args) as Promise<unknown>;
    const events = () =>
        fake.reporter.events.map(
            (e) => `${e.name} ${JSON.stringify({ ...e.properties, ...e.measurements })}`,
        );
    const sections = () => fake.host.sections.list();
    return {
        kernel,
        folders: folderState,
        state,
        files,
        rows,
        sections,
        run,
        contextKeys,
        setOrder,
        sets,
        events,
        initialized: () => when(kernel.project.initialized, (i) => i),
        /** After the first pass, until its sub-project search ends. */
        searched: async () => {
            await when(kernel.project.initialized, (i) => i);
            await when(kernel.project.subProjectSearch, (s) => s !== "searching");
            await new Promise((r) => setImmediate(r));
        },
    };
}

describe("the project feature", () => {
    beforeEach(() => vscode.reset());

    it("sets the initialized key after the target key in update(), so the SSH views never see a target that is not set yet", async () => {
        const t = tempDir();
        t.write(
            "databricks.yml",
            "bundle: {name: demo}\ntargets: {dev_test: {default: true, mode: development, workspace: {host: https://h}}}\n",
        );
        const { initialized, setOrder, contextKeys } = setup([t.dir]);
        await initialized();
        await new Promise((r) => setImmediate(r));
        expect(contextKeys.get("databricks.context.bundle.isTargetSet")).toBe(true);
        // The last update after detection: its target key comes before the one that opens the SSH views.
        const last = (key: string) => setOrder.lastIndexOf(key);
        expect(last("databricks.context.initialized")).toBeGreaterThan(
            last("databricks.context.bundle.isTargetSet"),
        );
    });

    it("shows the legacy-project notice for a project.json folder without a bundle, and nothing else changes (SHELL-07)", async () => {
        const t = tempDir();
        t.write(
            ".databricks/project.json",
            JSON.stringify({ profile: "DEFAULT", clusterId: "c-1" }),
        );
        const { kernel, initialized, contextKeys, files } = setup([t.dir]);
        await initialized();
        await vi.waitFor(() =>
            expect(contextKeys.get("databricks.context.legacyProject")).toBe(true),
        );
        expect(kernel.project.active.value).toBeUndefined();
        expect(fs.readdirSync(t.path(".databricks"))).toEqual(["project.json"]);

        t.write("databricks.yml", "targets: {dev: {}}");
        files.touch(t.path("databricks.yml"));
        await vi.waitFor(() => expect(kernel.project.active.value?.root).toBe(t.dir));
        await vi.waitFor(() =>
            expect(contextKeys.get("databricks.context.legacyProject")).toBe(false),
        );
    });

    it("doesn't show the legacy-project notice for a folder without project.json", async () => {
        const t = tempDir();
        t.write("README.md", "");
        const { initialized, contextKeys } = setup([t.dir]);
        await initialized();
        await new Promise((r) => setTimeout(r, 20));
        expect(contextKeys.get("databricks.context.legacyProject")).toBe(false);
    });

    it("shows the Local Folder row for a bundle project, which opens the picker", async () => {
        const t = tempDir();
        t.write("databricks.yml", "targets: {dev: {}}");
        const { rows, initialized } = setup([t.dir]);
        await initialized();
        expect(await rows()).toMatchObject([
            {
                label: "Local Folder",
                description: t.dir,
                contextValue: "databricks.configuration.activeProjectFolder",
                command: { command: SELECT_PROJECT },
            },
            {
                label: "Target",
                description: "dev",
                contextValue: "databricks.configuration.target.default",
            },
        ]);
    });

    it("shows the target's host and mode below the Target row", async () => {
        const t = tempDir();
        t.write(
            "databricks.yml",
            "targets: {dev: {mode: development, workspace: {host: https://a.cloud.databricks.com}}}",
        );
        const { rows, sections, initialized } = setup([t.dir]);
        await initialized();
        const target = (await rows()).find((r) => r.label === "Target")!;
        expect(target).toMatchObject({
            description: "dev",
            contextValue: "databricks.configuration.target.development",
        });
        const section = sections().find((s) => s.id === "project.target")!;
        expect(await section.getChildren(target)).toMatchObject([
            {
                label: "Host",
                description: "https://a.cloud.databricks.com",
                url: "https://a.cloud.databricks.com",
            },
            { label: "Mode", description: "Development" },
        ]);
    });

    it("asks for a target when the bundle has several and no default", async () => {
        const t = tempDir();
        t.write("databricks.yml", "targets: {a: {}, b: {}}");
        const { rows, initialized, contextKeys } = setup([t.dir]);
        await initialized();
        expect((await rows())[1]).toMatchObject({
            label: { label: "Select a bundle target" },
            contextValue: "databricks.configuration.target.none",
            command: { command: SELECT_TARGET },
        });
        await new Promise((r) => setImmediate(r));
        expect(contextKeys.get("databricks.context.bundle.isTargetSet")).toBe(false);
    });

    it("picks a target, current first, and keeps the choice for the project", async () => {
        const t = tempDir();
        t.write(
            "databricks.yml",
            "targets: {dev_test: {default: true, mode: development, workspace: {host: https://h}}, dev_test2: {mode: production}}",
        );
        const { kernel, state, rows, run, initialized, contextKeys } = setup([t.dir]);
        await initialized();
        let offered: { label: string; description?: string; detail?: string }[] = [];
        vscode.pickFrom = (items) => {
            offered = items;
            return items.find((i) => i.label === "dev_test2");
        };
        await run(SELECT_TARGET);
        expect(offered).toEqual([
            { label: "dev_test", description: "development", detail: "https://h" },
            { label: "dev_test2", description: "production", detail: undefined },
        ]);
        expect(kernel.project.target.value).toBe("dev_test2");
        expect(state.get(PROJECT_TARGETS)).toEqual({ [t.dir]: "dev_test2" });
        expect((await rows())[1]).toMatchObject({ label: "Target", description: "dev_test2" });
        await new Promise((r) => setImmediate(r));
        expect(contextKeys.get("databricks.context.bundle.isTargetSet")).toBe(true);

        vscode.pickFrom = (items) => {
            offered = items;
            return undefined;
        };
        await run(SELECT_TARGET);
        expect(offered.map((i) => i.label)).toEqual(["dev_test2", "dev_test"]);
        expect(vscode.errors).toEqual([]);
    });

    it("shows a sub-project's folder relative to the workspace folder", async () => {
        const t = tempDir();
        t.write("nested1/databricks.yml", "targets: {dev: {}}");
        const { kernel, rows, initialized } = setup([t.dir]);
        await initialized();
        await kernel.project.selectProject(t.path("nested1"));
        expect((await rows())[0]).toMatchObject({ label: "Local Folder", description: "nested1" });
    });

    it("has no rows without a bundle, so the welcome content shows", async () => {
        const t = tempDir();
        const { rows, initialized, contextKeys } = setup([t.dir]);
        await initialized();
        expect(await rows()).toEqual([]);
        await new Promise((r) => setImmediate(r));
        expect(contextKeys.get("databricks.context.initialized")).toBe(true);
        expect(contextKeys.get("databricks.context.subProjectsAvailable")).toBe(false);
    });

    it("tells the welcome content when sub-projects exist", async () => {
        const t = tempDir();
        t.write("nested1/databricks.yml");
        const { searched, contextKeys } = setup([t.dir]);
        await searched();
        expect(contextKeys.get("databricks.context.subProjectsAvailable")).toBe(true);
    });

    it.each([
        ["a local window", undefined],
        ["a session window", SERVERLESS_SESSION],
    ])(
        "says it is looking for projects until the sub-project search ends, without holding up detection, in %s",
        async (_, host) => {
            const t = tempDir();
            t.write("nested1/databricks.yml");
            const search = heldFileSearch();
            const { initialized, searched, contextKeys, sets } = setup([t.dir], {
                search: search.search,
                ...(host !== undefined ? { host } : {}),
            });
            await initialized();
            await new Promise((r) => setImmediate(r));
            expect(contextKeys.get("databricks.context.initialized")).toBe(true);
            expect(shownWelcomes(contextKeys)).toBe("looking");
            const before = sets.length;
            search.release();
            await searched();
            expect(contextKeys.get("databricks.context.subProjectsAvailable")).toBe(true);
            // After every single key change, one text, never "No bundle".
            expect(shownAlong(new Map(sets.slice(0, before)), sets.slice(before))).toEqual([
                "looking",
                "choose",
            ]);
        },
    );

    it("goes from one folder's projects to looking in another folder without showing anything else", async () => {
        const a = tempDir();
        a.write("in-a/databricks.yml");
        const b = tempDir();
        b.write("README.md", "");
        const search = heldFileSearch();
        const { kernel, folders, initialized, searched, contextKeys, sets } = setup([a.dir], {
            search: search.search,
        });
        await initialized();
        search.release();
        await searched();
        expect(shownWelcomes(contextKeys)).toBe("choose");
        const before = sets.length;
        folders.set([b.dir]);
        await vi.waitFor(() => expect(kernel.project.root.value).toBe(b.dir));
        await new Promise((r) => setImmediate(r));
        expect(shownAlong(new Map(sets.slice(0, before)), sets.slice(before))).toEqual([
            "choose",
            "looking",
        ]);
        search.release();
        await searched();
        expect(shownWelcomes(contextKeys)).toBe("none");
    });

    it("says it is looking, not that there is no bundle, when the root bundle goes", async () => {
        const t = tempDir();
        t.write("databricks.yml", "targets: {dev: {}}");
        t.write("nested/databricks.yml");
        const search = heldFileSearch();
        const { kernel, initialized, contextKeys, sets, files } = setup([t.dir], {
            search: search.search,
        });
        await initialized();
        expect(kernel.project.active.value?.root).toBe(t.dir);
        const before = sets.length;
        fs.rmSync(t.path("databricks.yml"));
        files.touch(t.path("databricks.yml"));
        await vi.waitFor(() => expect(kernel.project.active.value).toBeUndefined());
        await new Promise((r) => setImmediate(r));
        const keys = new Map([...sets.slice(0, before), [PROJECT_KEY, true]]);
        expect(shownAlong(keys, [[PROJECT_KEY, false], ...sets.slice(before)])).toEqual([
            "loading",
            "",
            "looking",
        ]);
        search.release();
        await vi.waitFor(() => expect(shownWelcomes(contextKeys)).toBe("choose"));
    });

    it("empties the sub-project search key when a project without targets opens", async () => {
        const t = tempDir();
        t.write("databricks.yml", "bundle: {name: demo}");
        const { kernel, folders, initialized, contextKeys } = setup([]);
        await initialized();
        await new Promise((r) => setImmediate(r));
        expect(contextKeys.get("databricks.context.subProjectSearch")).toBe("none");
        folders.set([t.dir]);
        await vi.waitFor(() => expect(kernel.project.active.value?.root).toBe(t.dir));
        await new Promise((r) => setImmediate(r));
        expect(contextKeys.get("databricks.context.subProjectSearch")).toBe("");
    });

    it("goes from choosing a project to loading the bundle written at the root, without both", async () => {
        const t = tempDir();
        t.write("nested/databricks.yml");
        const { kernel, initialized, searched, contextKeys, sets, files } = setup([t.dir]);
        await initialized();
        await searched();
        expect(shownWelcomes(contextKeys)).toBe("choose");
        const before = sets.length;
        t.write("databricks.yml", "targets: {dev: {}}");
        files.touch(t.path("databricks.yml"));
        await vi.waitFor(() => expect(kernel.project.active.value?.root).toBe(t.dir));
        await new Promise((r) => setImmediate(r));
        const keys = new Map([...sets.slice(0, before), [PROJECT_KEY, false]]);
        expect(shownAlong(keys, [[PROJECT_KEY, true], ...sets.slice(before)])).toEqual([
            "choose",
            "loading",
        ]);
        expect(contextKeys.get("databricks.context.subProjectSearch")).toBe("");
    });

    it("lists the sub-projects in the picker and activates the chosen one", async () => {
        const t = tempDir();
        t.write("nested1/databricks.yml", "targets: {dev: {}}");
        t.write("double/nested2/databricks.yml", "targets: {dev: {}}");
        const { kernel, state, run, initialized } = setup([t.dir]);
        await initialized();
        let offered: string[] = [];
        vscode.pickFrom = (items) => {
            offered = items.map((i) => i.label);
            return items.find((i) => i.label === path.join("double", "nested2"));
        };
        await run(SELECT_PROJECT);
        expect(offered).toEqual([
            path.join("double", "nested2"),
            "nested1",
            "",
            "Choose another folder",
        ]);
        expect(kernel.project.active.value?.root).toBe(t.path("double/nested2"));
        expect(state.get(ACTIVE_PROJECT_PATH)).toBe(t.path("double/nested2"));
    });

    it("opens a folder outside the workspace in the window", async () => {
        const t = tempDir();
        const outside = tempDir();
        const { run, initialized } = setup([t.dir]);
        await initialized();
        vscode.nextOpenDialog = outside.dir;
        await run(SELECT_PROJECT);
        expect(vscode.executed.map((e) => e.command)).toContain("vscode.openFolder");
    });

    it("records the old initialization and sub-project events", async () => {
        const bundle = tempDir();
        bundle.write("databricks.yml", "targets: {dev: {}}");
        const a = setup([bundle.dir]);
        await a.initialized();
        await new Promise((r) => setImmediate(r));
        expect(a.events().filter((e) => e.startsWith("extensionInitialization"))).toEqual([
            expect.stringContaining(`"event.success":"true","event.type":"dabs"`),
        ]);
        expect(a.events().filter((e) => e.startsWith("bundleSubProject"))).toEqual([]);

        vscode.reset();
        const plain = tempDir();
        plain.write("one/databricks.yml");
        plain.write("two/databricks.yml");
        const b = setup([plain.dir]);
        await b.searched();
        expect(b.events().filter((e) => e.startsWith("bundleSubProjects "))).toEqual([
            expect.stringContaining(`"event.count":2`),
        ]);
        expect(b.events().find((e) => e.startsWith("extensionInitialization"))).toContain(
            `"event.type":"unknown"`,
        );
    });

    it("records initialization before the sub-project search ends, then the search, with VS Code's followSymlinks", async () => {
        const t = tempDir();
        t.write("nested1/databricks.yml");
        const search = heldFileSearch();
        const { initialized, searched, events } = setup([t.dir], {
            search: search.search,
            settings: fakeSettings({ "search.followSymlinks": false }),
        });
        const names = () => events().map((e) => e.split(" ")[0]);
        await initialized();
        await new Promise((r) => setImmediate(r));
        expect(names()).toEqual(["extensionInitialization"]);
        search.release();
        await searched();
        expect(names()).toEqual([
            "extensionInitialization",
            "bundleSubProjectSearch",
            "bundleSubProjects",
        ]);
        const recorded = events().find((e) => e.startsWith("bundleSubProjectSearch "));
        expect(recorded).toContain(`"event.success":"true"`);
        expect(recorded).toContain(`"event.followSymlinks":"false"`);
        expect(recorded).toContain(`"event.count":1`);
        expect(recorded).toMatch(/"event.duration":\d/);
    });

    it("records a failed sub-project search as failed", async () => {
        const t = tempDir();
        const failing: FileSearch = {
            find: async () => {
                throw new Error("search failed");
            },
        };
        const { searched, events } = setup([t.dir], { search: failing });
        await searched();
        expect(events().find((e) => e.startsWith("bundleSubProjectSearch "))).toContain(
            `"event.success":"false"`,
        );
        // The old event has no success field, so a failure isn't recorded as no sub-projects.
        expect(events().filter((e) => e.startsWith("bundleSubProjects "))).toEqual([]);
    });

    it("doesn't record the first sub-project search when another folder turned up before it ended", async () => {
        const a = tempDir();
        a.write("in-a/databricks.yml");
        const b = tempDir();
        b.write("in-b/databricks.yml");
        const search = heldFileSearch();
        const { kernel, folders, initialized, searched, events } = setup([a.dir], {
            search: search.search,
        });
        await initialized();
        folders.set([b.dir]);
        await new Promise((r) => setTimeout(r, 5));
        await kernel.project.settled();
        search.release();
        await searched();
        await new Promise((r) => setTimeout(r, 20));
        expect(kernel.project.subProjects.value.map((p) => p.relative)).toEqual(["in-b"]);
        expect(events().filter((e) => e.startsWith("bundleSubProject"))).toEqual([]);
    });

    it("is silent when the picker is dismissed", async () => {
        const t = tempDir();
        t.write("nested1/databricks.yml");
        const { run, initialized } = setup([t.dir]);
        await initialized();
        await run(SELECT_PROJECT);
        expect(vscode.errors).toEqual([]);
    });
});

describe("the Target row of a target the guard pauses", () => {
    const projectOf = (root: string) => ({
        root,
        rootFile: `${root}/databricks.yml`,
        files: [`${root}/databricks.yml`],
        config: {
            variables: {},
            targets: [{ name: "dev", host: "https://other.cloud.databricks.com", default: true }],
        },
    });
    const paused = {
        usable: false as const,
        reason: 'Bundle commands for target "dev" are paused in this session window: it deploys to https://other.cloud.databricks.com, another workspace than this session\'s.',
        remedy: "Point the target at this session's workspace, or work on the project from a local window.",
    };

    it("says the target is paused, why, and what to do, and keeps the target picker", () => {
        const project = projectOf("/w");
        const section = new TargetSection({ project, target: "dev" }, undefined, () => ({
            status: "decided",
            root: "/w",
            target: "dev",
            access: paused,
        }));
        const [row] = section.getChildren();
        expect(row).toMatchObject({
            description: "dev (paused)",
            tooltip: `${paused.reason}\n${paused.remedy}`,
            contextValue: "databricks.configuration.target.default",
        });
        expect(section.getChildren(row)[0]).toMatchObject({
            label: "Bundle commands",
            description: "Paused",
        });
    });

    it("shows nothing paused for an open target, or another target's decision", () => {
        const project = projectOf("/w");
        for (const access of [
            () => ({ status: "open" as const }),
            () => ({ status: "decided" as const, root: "/w", target: "prod", access: paused }),
        ]) {
            const section = new TargetSection({ project, target: "dev" }, undefined, access);
            const [row] = section.getChildren();
            expect(row?.description).toBe("dev");
            expect(section.getChildren(row).map((r) => r.label)).toEqual(["Host", "Mode"]);
        }
    });
});
