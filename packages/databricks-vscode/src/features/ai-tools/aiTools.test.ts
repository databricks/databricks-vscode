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
    const kernel = fakeKernel({
        folders: new MutableState<readonly string[]>(folders),
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
    return { t, kernel, fake, registered };
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

    it("does nothing at activation in a session window", async () => {
        const s = await setup({ session: true });
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(vscode.infos).toEqual([]);
        expect(s.kernel.runner.calls).toEqual([]);
    });
});
