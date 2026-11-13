import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AI_TOOLS_INSTALLED } from "../../kernel/aitools/commands";
import { registerFeatures, startFeatures } from "../../kernel/feature";
import { ACTIVE_PROJECT_PATH } from "../../kernel/project/ProjectService";
import { MutableState, when } from "../../platform/reactive";
import { StateStore } from "../../platform/state";
import { fakeFeatureHost, fakeKernel, fakeMemento, fakeSettings } from "../../test-support/fakes";
import { FakeFileEvents } from "../../test-support/fakeFiles";
import { SERVERLESS_SESSION } from "../../test-support/sessionEnv";
import { useTempDirs } from "../../test-support/tempDir";
import { env, host as vscode } from "../../test-support/vscode";
import { copilotShimDir } from "./copilotShim";
import {
    AITOOLS_INSTALL_PROMPT_HIDDEN,
    AITOOLS_INSTALLED,
    AITOOLS_SHOW_CURSOR_PLUGIN,
    aiTools,
    SHOW_INSTALL_PROMPT,
} from "./index";

const tempDir = useTempDirs();
const STATE_FILE = ".databricks/aitools/skills/.state.json";

/** The real kernel with the AI tools feature, a temporary home folder and, with `project`, an open bundle. */
async function setup(
    options: {
        project?: boolean;
        installed?: "home" | "project";
        session?: boolean;
        /** Installs Copilot Chat, which puts VS Code's `copilot` shim on terminals' PATH. */
        copilotChat?: boolean;
        /** `chat.*` settings, such as `chat.copilotCliCommand.enabled`. */
        chat?: Record<string, unknown>;
    } = {},
) {
    const t = tempDir();
    vi.stubEnv("HOME", t.path("home"));
    vi.stubEnv("USERPROFILE", t.path("home"));
    t.write("home/.keep");
    const folders: string[] = [];
    if (options.project) {
        t.write(
            "project/databricks.yml",
            "bundle: {name: demo}\ntargets:\n  dev: {default: true}\n",
        );
        folders.push(t.path("project"));
    }
    if (options.installed !== undefined) {
        t.write(`${options.installed}/${STATE_FILE}`, "{}");
    }
    vscode.folders = folders;
    if (options.copilotChat) {
        vscode.extensions.set("GitHub.copilot-chat", {
            isActive: false,
            exports: {},
            activate: async () => ({}),
        });
    }
    const folderState = new MutableState<readonly string[]>(folders);
    const kernel = fakeKernel({
        folders: folderState,
        files: new FakeFileEvents(),
        ...(options.session ? { host: SERVERLESS_SESSION } : {}),
        ...(options.chat ? { settings: fakeSettings(options.chat) } : {}),
    });
    kernel.runner.on(["aitools", "list"], {
        stdout: JSON.stringify({ release: "0.2.10", skills: [], agents: [] }),
    });
    const fake = fakeFeatureHost(kernel);
    const registered = registerFeatures([aiTools], fake.host);
    kernel.start();
    startFeatures(registered);
    await when(kernel.project.initialized, (i) => i);
    return { t, kernel, fake, registered, folders: folderState };
}

/** The label of the Models & AI tools view's first row. */
async function firstModelsRow(fake: ReturnType<typeof fakeFeatureHost>) {
    const [section] = fake.host.sections.list("modelsAndAiTools");
    const [row] = await section.getChildren();
    return row.label;
}

beforeEach(() => vscode.reset());
afterEach(() => vi.unstubAllEnvs());

describe("the AI tools feature", () => {
    it("offers to install at activation, and sets the context keys", async () => {
        const s = await setup();
        await vi.waitFor(() => expect(vscode.infos).toHaveLength(1));
        expect(vscode.infos[0]!.message).toMatch(/^Install Databricks AI tools\?/);
        expect(s.kernel.contextKeys.get(AITOOLS_INSTALLED)).toBe(false);
        expect(s.kernel.contextKeys.get(AITOOLS_SHOW_CURSOR_PLUGIN)).toBe(false);
        expect(s.kernel.contextKeys.get(AITOOLS_INSTALL_PROMPT_HIDDEN)).toBe(false);
    });

    it("hides the prompt on Don't show again, and the palette command shows it again", async () => {
        vscode.nextMessageChoice = "Don't show again";
        const s = await setup();
        await vi.waitFor(() =>
            expect(s.kernel.contextKeys.get(AITOOLS_INSTALL_PROMPT_HIDDEN)).toBe(true),
        );
        vscode.nextMessageChoice = undefined;
        await vscode.commands.get(SHOW_INSTALL_PROMPT)!();
        expect(s.kernel.contextKeys.get(AITOOLS_INSTALL_PROMPT_HIDDEN)).toBe(false);
        expect(vscode.infos).toHaveLength(2);
    });

    it("detects a global install, and answers the new-project wizard's question", async () => {
        const s = await setup({ installed: "home" });
        await vi.waitFor(() => expect(s.kernel.contextKeys.get(AITOOLS_INSTALLED)).toBe(true));
        expect(vscode.infos).toEqual([]);
        expect(await s.fake.host.registry.executeInternal(AI_TOOLS_INSTALLED, undefined)).toBe(
            true,
        );
    });

    it("adds its rows to the Models & AI tools view, with or without a project", async () => {
        const without = await setup({ installed: "home" });
        expect(without.fake.host.sections.list("modelsAndAiTools").map((x) => x.id)).toEqual([
            "aiTools",
        ]);
        await vi.waitFor(async () => expect(await firstModelsRow(without.fake)).toBe("AI tools"));
        vscode.reset();
        const s = await setup({ project: true, installed: "project" });
        expect(s.fake.host.sections.list("modelsAndAiTools").map((x) => x.id)).toEqual(["aiTools"]);
        expect(s.fake.host.sections.list().map((x) => x.id)).toEqual([]);
        await vi.waitFor(async () => expect(await firstModelsRow(s.fake)).toBe("AI tools"));
        expect(s.kernel.runner.calls.find((c) => c.args[1] === "list")!.options.cwd).toBe(
            s.t.path("project"),
        );
    });

    it("runs the aitools CLI without the connection's credentials", async () => {
        const s = await setup({ installed: "home" });
        await vi.waitFor(() =>
            expect(s.kernel.runner.calls.some((c) => c.args[1] === "list")).toBe(true),
        );
        const env = s.kernel.runner.calls.find((c) => c.args[1] === "list")!.options.env!;
        expect(env.DATABRICKS_CONFIG_PROFILE).toBeUndefined();
        expect(env.DATABRICKS_CLI_UPSTREAM).toBe("databricks-vscode");
    });

    it("finds tools installed in a project in a sub-folder at activation, so it doesn't offer to install them", async () => {
        const t = tempDir();
        vi.stubEnv("HOME", t.path("home"));
        vi.stubEnv("USERPROFILE", t.path("home"));
        t.write("home/.keep");
        t.write(
            "repo/sub/databricks.yml",
            "bundle: {name: demo}\ntargets:\n  dev: {default: true}\n",
        );
        t.write(`repo/sub/${STATE_FILE}`, "{}");
        vscode.folders = [t.path("repo")];
        // The sub-folder the user chose as the project last time.
        const workspaceState = fakeMemento();
        workspaceState.store.set(ACTIVE_PROJECT_PATH.name, t.path("repo/sub"));
        const kernel = fakeKernel({
            folders: new MutableState<readonly string[]>([t.path("repo")]),
            files: new FakeFileEvents(),
            state: new StateStore({ global: fakeMemento(), workspace: workspaceState }),
        });
        kernel.runner.on(["aitools", "list"], {
            stdout: JSON.stringify({ release: "0.2.10", skills: [], agents: [] }),
        });
        const [registered] = registerFeatures([aiTools], fakeFeatureHost(kernel).host);
        kernel.start();
        // As `startFeatures` runs it, awaited so the activation flow is over.
        await aiTools.start!(registered!.ctx);

        expect(vscode.infos).toEqual([]);
        expect(kernel.contextKeys.get(AITOOLS_INSTALLED)).toBe(true);
        expect(kernel.runner.calls.find((c) => c.args[1] === "list")?.options.cwd).toBe(
            t.path("repo/sub"),
        );
    });

    describe("the copilot shim on the CLI's PATH", () => {
        const shimDir = () => copilotShimDir(env.appRoot, process.execPath);
        const listPath = (s: Awaited<ReturnType<typeof setup>>) =>
            s.kernel.runner.calls.find((c) => c.args[1] === "list")!.options.env!.PATH;

        it("comes last, as in a terminal, when Copilot Chat is installed", async () => {
            const s = await setup({ installed: "home", copilotChat: true });
            await vi.waitFor(() => expect(listPath(s)).toBeDefined());
            expect((listPath(s) ?? "").split(path.delimiter).at(-1)).toBe(shimDir());
        });

        it("isn't added when Copilot Chat isn't installed", async () => {
            const s = await setup({ installed: "home" });
            await vi.waitFor(() =>
                expect(s.kernel.runner.calls.some((c) => c.args[1] === "list")).toBe(true),
            );
            expect((listPath(s) ?? "").split(path.delimiter)).not.toContain(shimDir());
        });

        it("isn't added when chat.copilotCliCommand.enabled is off", async () => {
            const s = await setup({
                installed: "home",
                copilotChat: true,
                chat: { "chat.copilotCliCommand.enabled": false },
            });
            await vi.waitFor(() =>
                expect(s.kernel.runner.calls.some((c) => c.args[1] === "list")).toBe(true),
            );
            expect((listPath(s) ?? "").split(path.delimiter)).not.toContain(shimDir());
        });
    });

    describe("when it re-runs aitools list", () => {
        const listCalls = (s: Awaited<ReturnType<typeof setup>>) =>
            s.kernel.runner.calls.filter((c) => c.args[1] === "list");
        const BUNDLE = "bundle: {name: demo}\ntargets:\n  dev: {default: true}\n";
        const touch = (s: Awaited<ReturnType<typeof setup>>, file: string) =>
            (s.kernel.files as FakeFileEvents).touch(file);

        it("doesn't re-run it when a save changes the parsed config", async () => {
            const s = await setup({ project: true, installed: "project" });
            s.t.write("project/sub/databricks.yml", BUNDLE);
            s.t.write(`project/sub/${STATE_FILE}`, "{}");
            await vi.waitFor(() => expect(listCalls(s).length).toBeGreaterThan(0));
            const before = listCalls(s).length;

            const file = s.t.path("project/databricks.yml");
            s.t.write("project/databricks.yml", `${BUNDLE}  prod: {}\n`);
            touch(s, file);
            await vi.waitFor(
                () =>
                    expect(
                        s.kernel.project.active.value?.config.targets.map((t) => t.name),
                    ).toEqual(["dev", "prod"]),
                { timeout: 3000 },
            );
            // The save's refresh, if any, is queued before the switch below, and the
            // queue runs in order. So once the switch's call is recorded, a call from
            // the save would already be counted: the exact count is the check.
            await s.kernel.project.selectProject(s.t.path("project/sub"));
            await vi.waitFor(() => expect(listCalls(s).length).toBe(before + 1), {
                timeout: 3000,
            });
            expect(listCalls(s).at(-1)!.options.cwd).toBe(s.t.path("project/sub"));
        });

        it("re-runs it when the project folder is switched", async () => {
            const s = await setup({ project: true, installed: "project" });
            s.t.write("project/sub/databricks.yml", BUNDLE);
            s.t.write(`project/sub/${STATE_FILE}`, "{}");
            await vi.waitFor(() => expect(listCalls(s).length).toBeGreaterThan(0));
            const before = listCalls(s).length;

            await s.kernel.project.selectProject(s.t.path("project/sub"));
            await vi.waitFor(() => expect(listCalls(s).length).toBe(before + 1), {
                timeout: 3000,
            });
            expect(listCalls(s).at(-1)!.options.cwd).toBe(s.t.path("project/sub"));
        });

        it("re-runs it when the first workspace folder is added", async () => {
            const s = await setup({ installed: "home" });
            const added = s.t.path("added");
            s.t.write("added/.keep", "");
            s.t.write(`added/${STATE_FILE}`, "{}");
            await vi.waitFor(() => expect(listCalls(s).length).toBeGreaterThan(0));
            const before = listCalls(s).length;

            // The folder the install is read from changes from none to `added`.
            vscode.folders = [added];
            s.folders.set([added]);
            await vi.waitFor(() => expect(listCalls(s).length).toBe(before + 1), {
                timeout: 3000,
            });
            expect(listCalls(s).at(-1)!.options.cwd).toBe(added);
        });

        it("re-runs it when a folder is added in front of the saved bundle-less folder", async () => {
            const t = tempDir();
            vi.stubEnv("HOME", t.path("home"));
            vi.stubEnv("USERPROFILE", t.path("home"));
            t.write("home/.keep");
            t.write(`saved/.keep`, "");
            t.write(`saved/${STATE_FILE}`, "{}");
            t.write(`added/.keep`, "");
            t.write(`added/${STATE_FILE}`, "{}");
            vscode.folders = [t.path("saved")];
            const folders = new MutableState<readonly string[]>([t.path("saved")]);
            // The saved folder stays the project folder, so `root` doesn't change.
            const workspaceState = fakeMemento();
            workspaceState.store.set(ACTIVE_PROJECT_PATH.name, t.path("saved"));
            const kernel = fakeKernel({
                folders,
                files: new FakeFileEvents(),
                state: new StateStore({ global: fakeMemento(), workspace: workspaceState }),
            });
            kernel.runner.on(["aitools", "list"], {
                stdout: JSON.stringify({ release: "0.2.10", skills: [], agents: [] }),
            });
            const [registered] = registerFeatures([aiTools], fakeFeatureHost(kernel).host);
            kernel.start();
            await aiTools.start!(registered!.ctx);
            const lists = () => kernel.runner.calls.filter((c) => c.args[1] === "list");
            expect(lists().at(-1)?.options.cwd).toBe(t.path("saved"));
            const before = lists().length;

            vscode.folders = [t.path("added"), t.path("saved")];
            folders.set(vscode.folders);
            vscode.foldersChanged.fire();
            await vi.waitFor(() => expect(lists().length).toBe(before + 1), {
                timeout: 3000,
            });
            expect(lists().at(-1)!.options.cwd).toBe(t.path("added"));
        });

        it("re-runs it when a bundle appears in the saved sub-folder, which is where it reads the install from", async () => {
            const s = await setup({ project: true, installed: "project" });
            s.t.write("project/sub/.keep", "");
            s.t.write(`project/sub/${STATE_FILE}`, "{}");
            await s.kernel.project.selectProject(s.t.path("project/sub"));
            await vi.waitFor(() =>
                expect(s.kernel.project.root.value).toBe(s.t.path("project/sub")),
            );
            await vi.waitFor(() => expect(listCalls(s).length).toBeGreaterThan(0));
            const before = listCalls(s).length;

            s.t.write("project/sub/databricks.yml", BUNDLE);
            touch(s, s.t.path("project/sub/databricks.yml"));
            await vi.waitFor(() => expect(listCalls(s).length).toBe(before + 1), {
                timeout: 3000,
            });
            expect(listCalls(s).at(-1)!.options.cwd).toBe(s.t.path("project/sub"));
        });
    });

    it("does nothing at activation in a session window", async () => {
        const s = await setup({ session: true });
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(vscode.infos).toEqual([]);
        expect(s.kernel.runner.calls).toEqual([]);
    });
});
