import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Telemetry } from "../../kernel/telemetry/Telemetry";
import { UserFacingError } from "../../platform/errors";
import { StateStore } from "../../platform/state";
import { fakeCli } from "../../test-support/fakeCli";
import { fakeLog, fakeMemento, fakeReporter, fakeShowError } from "../../test-support/fakes";
import { useTempDirs } from "../../test-support/tempDir";
import { host as vscode } from "../../test-support/vscode";
import { AiToolsCommands, describeAgent, INSTALL_PROMPT } from "./AiToolsCommands";
import { AiToolsService, HIDE_INSTALL_PROMPT } from "./AiToolsService";
import type { AiToolsAgentStatus } from "./model";

const STATE_FILE = ".databricks/aitools/skills/.state.json";
const newDir = useTempDirs();

const AGENTS = [
    {
        name: "claude-code",
        display_name: "Claude Code",
        managed: true,
        detected: true,
        supports_project_scope: true,
        installed: {},
    },
    {
        name: "cursor",
        display_name: "Cursor",
        managed: false,
        detected: true,
        supports_project_scope: false,
        installed: {},
    },
    {
        name: "pi",
        display_name: "Pi",
        managed: false,
        detected: false,
        supports_project_scope: true,
        installed: {},
    },
];
const listOutput = (agents: unknown[] = AGENTS) => ({
    stdout: JSON.stringify({ release: "0.2.10", skills: [], agents }),
});

function setup(options: { isCursor?: boolean; folder?: boolean } = {}) {
    const tmp = newDir();
    fs.mkdirSync(tmp.path("home"));
    fs.mkdirSync(tmp.path("project"));
    const { cli, runner } = fakeCli();
    runner.on(["aitools", "list"], listOutput());
    const state = new StateStore({ global: fakeMemento(), workspace: fakeMemento() });
    const service = new AiToolsService({
        cli,
        env: () => ({}),
        state,
        projectFolder: () => (options.folder === false ? undefined : tmp.path("project")),
        homeDir: tmp.path("home"),
        readFile: (p) => fs.promises.readFile(p),
        isCursor: options.isCursor ?? false,
        openCursorPlugin: async () => {},
        telemetry: new Telemetry(fakeReporter()),
        log: fakeLog(),
    });
    const showLog = vi.fn();
    const ui = new AiToolsCommands(
        service,
        options.isCursor ?? false,
        showLog,
        fakeLog(),
        fakeShowError(),
    );
    const installed = (scope: "home" | "project") => tmp.write(path.join(scope, STATE_FILE), "{}");
    return {
        ui,
        service,
        runner,
        state,
        showLog,
        installed,
        installCalls: () => runner.argv.filter((a) => a[1] === "install"),
    };
}

const picker = (i: number) => vscode.quickInputs[i]!;
async function nextPicker(i: number) {
    await vi.waitFor(() => expect(vscode.quickInputs.length).toBeGreaterThan(i));
    return picker(i);
}

beforeEach(() => vscode.reset());

describe("describeAgent", () => {
    const agent = (o: Partial<AiToolsAgentStatus> = {}): AiToolsAgentStatus => ({
        displayName: "A",
        id: "a",
        type: "plugin",
        detected: true,
        supportsProjectScope: true,
        ...o,
    });

    it("describes detected agents, and gives no row to the ones that can't install", () => {
        expect(describeAgent(agent(), "project", false)).toBe("Detected");
        expect(describeAgent(agent({ detected: false }), "global", false)).toBeUndefined();
        expect(
            describeAgent(agent({ supportsProjectScope: false }), "project", false),
        ).toBeUndefined();
        expect(describeAgent(agent({ supportsProjectScope: false }), "global", false)).toBe(
            "Detected",
        );
    });

    it("always allows Cursor's plugin in Cursor", () => {
        expect(describeAgent(agent({ supportsProjectScope: false }), "project", true)).toBe(
            "Databricks plugin",
        );
    });
});

describe("AiToolsCommands: install", () => {
    it("asks for the scope, then the agents, and installs the selection with progress", async () => {
        const s = setup();
        const done = s.ui.install();
        const scope = await nextPicker(0);
        expect(scope.title).toBe("Install Databricks AI tools");
        expect(scope.items.map((i) => i.label)).toEqual(["$(globe) Global", "$(folder) Project"]);
        scope.accept("$(globe) Global");
        const agents = await nextPicker(1);
        expect(agents.canSelectMany).toBe(true);
        expect(agents.placeholder).toBe("Choose agents to install for");
        // Agents that aren't detected aren't listed, so none can be checked.
        expect(agents.items.map((i) => [i.label, i.description])).toEqual([
            ["Claude Code", "Detected"],
            ["Cursor", "Detected"],
        ]);
        // Only detected agents start checked.
        expect(agents.selectedItems.map((i) => i.label)).toEqual(["Claude Code", "Cursor"]);
        agents.acceptSelection(["Claude Code"]);
        await done;
        expect(s.installCalls()).toEqual([
            [
                "aitools",
                "install",
                "--scope",
                "global",
                "--agents",
                "claude-code",
                "--output",
                "json",
            ],
        ]);
        expect(vscode.progress.map((p) => p.title)).toEqual(["Installing Databricks AI tools"]);
    });

    it("doesn't list global-only agents at project scope", async () => {
        const s = setup();
        const done = s.ui.install();
        (await nextPicker(0)).accept("$(folder) Project");
        const agents = await nextPicker(1);
        expect(agents.items.map((i) => i.label)).toEqual(["Claude Code"]);
        expect(agents.selectedItems.map((i) => i.label)).toEqual(["Claude Code"]);
        agents.hide();
        await done;
        expect(s.installCalls()).toEqual([]);
    });

    it("says so, and installs nothing, when no agent can take the install", async () => {
        const s = setup();
        s.runner.on(["aitools", "list"], listOutput([{ ...AGENTS[2], detected: false }]));
        const done = s.ui.install();
        (await nextPicker(0)).accept("$(globe) Global");
        await done;
        expect(vscode.quickInputs.length).toBe(1);
        expect(vscode.infos.map((i) => i.message)).toEqual([
            'None of the coding agents that support this scope are detected on this machine. Install one of Pi, then try again. You can also run "databricks aitools install --agents pi --scope global" in a terminal.',
        ]);
        expect(s.installCalls()).toEqual([]);
    });

    it("names the agents that support the scope, when another agent is detected", async () => {
        const s = setup();
        // Claude Code supports project scope but isn't detected. Cursor is detected without
        // project scope, and Gemini is undetected without it: only Claude Code is named.
        s.runner.on(
            ["aitools", "list"],
            listOutput([
                { ...AGENTS[0], detected: false },
                { ...AGENTS[1], detected: true },
                {
                    name: "gemini-cli",
                    display_name: "Gemini CLI",
                    managed: false,
                    detected: false,
                    supports_project_scope: false,
                    installed: {},
                },
            ]),
        );
        const done = s.ui.install();
        (await nextPicker(0)).accept("$(folder) Project");
        await done;
        expect(vscode.infos.map((i) => i.message)).toEqual([
            'None of the coding agents that support this scope are detected on this machine. Install one of Claude Code, then try again. You can also run "databricks aitools install --agents claude-code --scope project" in a terminal.',
        ]);
        expect(s.installCalls()).toEqual([]);
    });

    it("says the project scope has no agents, when none supports it", async () => {
        const s = setup();
        s.runner.on(["aitools", "list"], listOutput([{ ...AGENTS[1], detected: true }]));
        const done = s.ui.install();
        (await nextPicker(0)).accept("$(folder) Project");
        await done;
        expect(vscode.infos.map((i) => i.message)).toEqual([
            "No coding agents support Databricks AI tools at project scope. Install the AI tools for global scope instead.",
        ]);
        expect(s.installCalls()).toEqual([]);
    });

    it("starts Cursor's plugin checked in Cursor", async () => {
        const s = setup({ isCursor: true });
        const done = s.ui.install();
        (await nextPicker(0)).accept("$(folder) Project");
        const agents = await nextPicker(1);
        expect(agents.items.find((i) => i.label === "Cursor")!.description).toBe(
            "Databricks plugin",
        );
        expect(agents.selectedItems.map((i) => i.label)).toEqual(["Claude Code", "Cursor"]);
        agents.hide();
        await done;
    });

    it("can't pick project scope without a folder", async () => {
        const s = setup({ folder: false });
        const done = s.ui.install();
        const scope = await nextPicker(0);
        expect(scope.items[1]).toMatchObject({
            description: "Requires an open folder",
            detail: "Open a folder to install AI tools into a project",
        });
        scope.accept("$(folder) Project");
        expect(scope.visible).toBe(true);
        scope.hide();
        await done;
        expect(vscode.quickInputs).toHaveLength(1);
    });

    it("stops when the scope picker is dismissed", async () => {
        const s = setup();
        const done = s.ui.install();
        (await nextPicker(0)).hide();
        await done;
        expect(s.runner.calls).toEqual([]);
    });

    it("stops with an error when the CLI lists no agents", async () => {
        const s = setup();
        s.runner.on(["aitools", "list"], { exitCode: 1, stderr: "offline" });
        const done = s.ui.install();
        (await nextPicker(0)).accept("$(globe) Global");
        await expect(done).rejects.toMatchObject({
            userMessage: "Failed to load Databricks AI tools installer.",
        });
        expect(vscode.quickInputs).toHaveLength(1);
    });

    it("throws a failed install with Show Logs, which reveals the channel", async () => {
        const s = setup();
        s.runner.on(["aitools", "install"], { exitCode: 1, stderr: "Error: boom" });
        const done = s.ui.install().catch((e: unknown) => e);
        (await nextPicker(0)).accept("$(globe) Global");
        (await nextPicker(1)).acceptSelection(["Claude Code"]);
        const error = (await done) as UserFacingError;
        expect(error).toBeInstanceOf(UserFacingError);
        expect(error.userMessage).toBe("Failed to install Databricks AI tools. Error: boom");
        expect(error.actions.map((a) => a.title)).toEqual(["Show Logs"]);
        error.actions[0]!.run();
        expect(s.showLog).toHaveBeenCalled();
    });

    it("installs the agent a row names", async () => {
        const s = setup();
        s.installed("project");
        await s.service.refresh();
        await s.ui.installAgent({ id: "AITOOLS.agent.goose" });
        await s.ui.installAgent({ id: "something-else" });
        await s.ui.installAgent();
        expect(s.installCalls()).toEqual([
            ["aitools", "install", "--scope", "project", "--agents", "goose", "--output", "json"],
        ]);
        expect(vscode.progress.map((p) => p.title)).toEqual([
            "Installing Databricks AI tools agent",
        ]);
    });
});

describe("AiToolsCommands: the first-run prompt", () => {
    it("is a notification, not a modal, and installs on accept", async () => {
        const s = setup();
        vscode.nextMessageChoice = "Install AI tools";
        const done = s.ui.initialize();
        (await nextPicker(0)).hide();
        await done;
        expect(vscode.infos).toEqual([
            {
                message: `${INSTALL_PROMPT} Get skills and plugins so your coding agents work effectively with Databricks. You can also install them later from the Models & AI tools view.`,
                actions: ["Install AI tools", "Don't show again"],
            },
        ]);
    });

    it("hides itself on Don't show again, until shown again", async () => {
        const s = setup();
        vscode.nextMessageChoice = "Don't show again";
        await s.ui.initialize();
        expect(s.state.get(HIDE_INSTALL_PROMPT)).toBe(true);
        vscode.infos.length = 0;
        await s.ui.initialize();
        expect(vscode.infos).toEqual([]);
        vscode.nextMessageChoice = undefined;
        await s.ui.showPromptAgain();
        expect(s.state.get(HIDE_INSTALL_PROMPT)).toBe(false);
        expect(vscode.infos).toHaveLength(1);
        expect(await s.service.initialize()).toBe("promptInstall");
    });

    it("comes back after a plain dismissal", async () => {
        const s = setup();
        await s.ui.initialize();
        expect(s.state.get(HIDE_INSTALL_PROMPT)).toBe(false);
        expect(vscode.quickInputs).toEqual([]);
    });

    it("isn't shown when installed: an available update is applied", async () => {
        const s = setup();
        s.installed("home");
        s.runner.on(["aitools", "list"], {
            stdout: JSON.stringify({
                release: "0.2.10",
                skills: [{ name: "x", latest_version: "2", installed: { global: "1" } }],
                agents: [],
            }),
        });
        await s.ui.initialize();
        expect(vscode.infos).toEqual([]);
        expect(s.runner.argv).toContainEqual(["aitools", "update", "--scope", "global"]);
        expect(vscode.progress.map((p) => p.title)).toEqual(["Updating Databricks AI tools"]);
    });

    it("shows a failed update itself, with Show Logs", async () => {
        const s = setup();
        s.installed("home");
        s.runner.on(["aitools", "list"], {
            stdout: JSON.stringify({
                release: "0.2.10",
                skills: [{ name: "x", latest_version: "2", installed: { global: "1" } }],
                agents: [],
            }),
        });
        s.runner.on(["aitools", "update"], { exitCode: 1, stderr: "offline" });
        vscode.nextErrorChoice = "Show Logs";
        await s.ui.initialize();
        expect(vscode.errors).toEqual([
            { message: "Failed to update Databricks AI tools. offline", actions: ["Show Logs"] },
        ]);
        expect(s.showLog).toHaveBeenCalled();
    });
});

describe("AiToolsCommands: uninstall", () => {
    it("asks first, then uninstalls", async () => {
        const s = setup();
        s.installed("home");
        await s.service.refresh();
        await s.ui.uninstall();
        expect(vscode.warnings).toEqual([
            { message: "Uninstall Databricks AI tools (global)?", actions: ["Uninstall"] },
        ]);
        expect(s.runner.argv.filter((a) => a[1] === "uninstall")).toEqual([]);
        vscode.nextMessageChoice = "Uninstall";
        await s.ui.uninstall();
        expect(s.runner.argv.filter((a) => a[1] === "uninstall")).toEqual([
            ["aitools", "uninstall", "--scope", "global"],
        ]);
    });

    it("does nothing when nothing is installed", async () => {
        const s = setup();
        await s.ui.uninstall();
        expect(vscode.warnings).toEqual([]);
    });
});
