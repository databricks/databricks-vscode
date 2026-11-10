import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Telemetry } from "../../kernel/telemetry/Telemetry";
import { StateStore } from "../../platform/state";
import { fakeCli } from "../../test-support/fakeCli";
import { fakeLog, fakeMemento, fakeReporter } from "../../test-support/fakes";
import { useTempDirs } from "../../test-support/tempDir";
import {
    AiToolsError,
    AiToolsService,
    HIDE_INSTALL_PROMPT,
    INSTALL_LOCATION,
} from "./AiToolsService";

const FIXTURES = path.join(__dirname, "../../kernel/cli/commands/fixtures/aitools");
const fixture = (name: string) => fs.readFileSync(path.join(FIXTURES, name), "utf-8");
const STATE_FILE = ".databricks/aitools/skills/.state.json";

/** `aitools list` with one skill and the given agents, as the CLI prints it. */
function list(
    scope: "project" | "global" | undefined,
    options: { behind?: boolean; agents?: unknown[] } = {},
) {
    const installed = scope === undefined ? {} : { [scope]: options.behind ? "0.1.0" : "0.2.0" };
    return JSON.stringify({
        release: "0.2.10",
        skills: [{ name: "databricks-core", latest_version: "0.2.0", installed }],
        agents: options.agents ?? [
            {
                name: "claude-code",
                display_name: "Claude Code",
                managed: true,
                detected: true,
                supports_project_scope: true,
                installed: scope === undefined ? {} : { [scope]: { version: "0.2.10" } },
            },
            {
                name: "cursor",
                display_name: "Cursor",
                managed: false,
                detected: true,
                supports_project_scope: false,
                installed: {},
            },
        ],
    });
}

function setup(
    options: {
        project?: boolean;
        isCursor?: boolean;
        readFile?: (p: string) => Promise<unknown>;
    } = {},
) {
    const tmp = newDir();
    const home = tmp.path("home");
    const project = tmp.path("project");
    fs.mkdirSync(home);
    fs.mkdirSync(project);
    const { cli, runner } = fakeCli();
    const state = new StateStore({ global: fakeMemento(), workspace: fakeMemento() });
    const reporter = fakeReporter();
    const log = fakeLog();
    const opened: unknown[] = [];
    let openFails = false;
    let folder: string | undefined = options.project === false ? undefined : project;
    const service = new AiToolsService({
        cli,
        env: () => ({ DATABRICKS_CLI_UPSTREAM: "databricks-vscode" }),
        state,
        projectFolder: () => folder,
        homeDir: home,
        readFile: options.readFile ?? ((p) => fs.promises.readFile(p)),
        isCursor: options.isCursor ?? false,
        openCursorPlugin: async () => {
            if (openFails) {
                throw new Error("no marketplace");
            }
            opened.push(true);
        },
        telemetry: new Telemetry(reporter),
        log,
    });
    const install = (root: string) =>
        tmp.write(path.join(path.relative(tmp.dir, root), STATE_FILE), "{}");
    return {
        service,
        runner,
        state,
        reporter,
        log,
        opened,
        home,
        project,
        install,
        uninstallAll: () => {
            fs.rmSync(path.join(home, ".databricks"), { recursive: true, force: true });
            fs.rmSync(path.join(project, ".databricks"), { recursive: true, force: true });
        },
        failOpen: () => (openFails = true),
        closeFolder: () => (folder = undefined),
        /** The event's own properties, without the `event.` prefix and the shared ones. */
        events: (name: string) =>
            reporter.events
                .filter((e) => e.name === name)
                .map((e) => ({
                    properties: Object.fromEntries(
                        Object.entries(e.properties ?? {})
                            .filter(([k]) => k.startsWith("event."))
                            .map(([k, v]) => [k.slice("event.".length), v]),
                    ),
                    measurements: e.measurements,
                })),
    };
}

const newDir = useTempDirs();

describe("AiToolsService: detection", () => {
    it("detects no install when no state file exists", async () => {
        const s = setup();
        await s.service.refresh();
        expect(s.service.state.value).toEqual({
            updateStatus: "unknown",
            detectError: false,
            agents: [],
        });
        expect(s.runner.calls).toEqual([]);
    });

    it("detects a project install, and reads the release, the update status and the agents", async () => {
        const s = setup();
        s.install(s.project);
        s.runner.on(["aitools", "list"], { stdout: list("project") });
        await s.service.refresh();
        expect(s.service.state.value).toMatchObject({
            installLocation: "project",
            updateStatus: "upToDate",
            version: "0.2.10",
            detectError: false,
        });
        expect(s.service.state.value.agents.map((a) => [a.id, a.version])).toEqual([
            ["claude-code", "0.2.10"],
            ["cursor", undefined],
        ]);
        expect(s.runner.calls[0]!.options.cwd).toBe(s.project);
        expect(s.state.get(INSTALL_LOCATION)).toBe("project");
    });

    it("detects a global install when only the home state file exists, and prefers the project", async () => {
        const s = setup();
        s.install(s.home);
        s.runner.on(["aitools", "list"], { stdout: list("global") });
        await s.service.refresh();
        expect(s.service.state.value.installLocation).toBe("global");
        expect(s.runner.calls[0]!.options.cwd).toBe(s.home);
        s.install(s.project);
        await s.service.refresh();
        expect(s.service.state.value.installLocation).toBe("project");
    });

    it("detects a global install with no folder open", async () => {
        const s = setup({ project: false });
        s.install(s.home);
        await s.service.refresh();
        expect(s.service.hasProjectFolder).toBe(false);
        expect(s.service.state.value.installLocation).toBe("global");
    });

    it("starts from the saved location, and keeps it after an unexpected read error", async () => {
        const failing = Object.assign(new Error("EACCES"), { code: "EACCES" });
        const s = setup({ readFile: () => Promise.reject(failing) });
        await s.state.set(INSTALL_LOCATION, "global");
        const service = new AiToolsService({
            ...(s.service as unknown as { deps: ConstructorParameters<typeof AiToolsService>[0] })
                .deps,
        });
        expect(service.state.value.installLocation).toBe("global");
        await service.refresh();
        expect(service.state.value).toMatchObject({ installLocation: "global", detectError: true });
        expect(
            s.log.entries.some(
                (e) => e.message === "Failed to detect Databricks AI tools install state",
            ),
        ).toBe(true);
    });

    it("clears the error on the next successful detection", async () => {
        let fail = true;
        const s = setup({
            readFile: (p) =>
                fail
                    ? Promise.reject(Object.assign(new Error("EIO"), { code: "EIO" }))
                    : fs.promises.readFile(p),
        });
        await s.service.refresh();
        expect(s.service.state.value.detectError).toBe(true);
        fail = false;
        await s.service.refresh();
        expect(s.service.state.value.detectError).toBe(false);
    });

    it("reports an available update, and an error when the list fails", async () => {
        const s = setup();
        s.install(s.project);
        s.runner.on(["aitools", "list"], { stdout: list("project", { behind: true }) });
        await s.service.refresh();
        expect(s.service.state.value.updateStatus).toBe("updateAvailable");
        s.runner.on(["aitools", "list"], { exitCode: 1, stderr: "offline" });
        await s.service.checkForUpdates();
        expect(s.service.state.value.updateStatus).toBe("error");
    });

    it("clears the version and the agents when the tools are gone", async () => {
        const s = setup();
        s.install(s.project);
        s.runner.on(["aitools", "list"], { stdout: list("project") });
        await s.service.refresh();
        s.uninstallAll();
        await s.service.refresh();
        expect(s.service.state.value).toEqual({
            updateStatus: "unknown",
            detectError: false,
            agents: [],
        });
        expect(s.state.get(INSTALL_LOCATION)).toBeUndefined();
    });
});

describe("AiToolsService: initialize", () => {
    it("asks to prompt when nothing is installed, unless opted out", async () => {
        const s = setup();
        expect(await s.service.initialize()).toBe("promptInstall");
        await s.service.setInstallPromptHidden(true);
        expect(s.state.get(HIDE_INSTALL_PROMPT)).toBe(true);
        expect(await s.service.initialize()).toBe("none");
        await s.service.setInstallPromptHidden(false);
        expect(await s.service.initialize()).toBe("promptInstall");
    });

    it("asks to update when installed and behind, and does nothing when up to date", async () => {
        const s = setup();
        s.install(s.home);
        s.runner.on(["aitools", "list"], { stdout: list("global", { behind: true }) });
        expect(await s.service.initialize()).toBe("update");
        s.runner.on(["aitools", "list"], { stdout: list("global") });
        expect(await s.service.initialize()).toBe("none");
    });

    it("doesn't prompt after a failed detection: the tools may be installed", async () => {
        const s = setup({
            readFile: () => Promise.reject(Object.assign(new Error("EIO"), { code: "EIO" })),
        });
        expect(await s.service.initialize()).toBe("none");
    });
});

describe("AiToolsService: install", () => {
    it("installs the agents into the scope, records success, and reconciles", async () => {
        const s = setup();
        s.runner.on(["aitools", "install"], () => {
            s.install(s.home);
            return { stdout: fixture("install.success.json") };
        });
        s.runner.on(["aitools", "list"], { stdout: list("global") });
        await s.service.install("global", "sidePane", ["claude-code"]);
        const install = s.runner.calls.find((c) => c.args[1] === "install")!;
        expect(install.args).toEqual([
            "aitools",
            "install",
            "--scope",
            "global",
            "--agents",
            "claude-code",
            "--output",
            "json",
        ]);
        expect(install.options.cwd).toBe(s.home);
        expect(install.options.env).toEqual({ DATABRICKS_CLI_UPSTREAM: "databricks-vscode" });
        expect(s.service.state.value.installLocation).toBe("global");
        expect(s.events("aitoolsInstall")[0]!.properties).toMatchObject({
            result: "success",
            scope: "global",
            source: "sidePane",
            agents: '["claude-code"]',
        });
    });

    it("does nothing without agents", async () => {
        const s = setup();
        await s.service.install("global", "sidePane", []);
        expect(s.runner.calls).toEqual([]);
    });

    it("records the error categories and throws the CLI's reasons, then reconciles what did land", async () => {
        const s = setup();
        s.runner.on(["aitools", "install"], () => {
            s.install(s.project);
            return { exitCode: 1, stdout: fixture("install.skipped.json") };
        });
        s.runner.on(["aitools", "list"], { stdout: list("project") });
        const error = await s.service
            .install("project", "initModal", ["copilot"])
            .catch((e: unknown) => e);
        expect(error).toBeInstanceOf(AiToolsError);
        expect((error as AiToolsError).userMessage).toBe(
            "Failed to install Databricks AI tools. copilot: GitHub Copilot is user-only; project scope is not supported",
        );
        expect(s.events("aitoolsInstall")[0]!.properties).toMatchObject({
            result: "error",
            source: "initModal",
            agentErrors: '{"copilot":"UNSUPPORTED_SCOPE"}',
        });
        expect(s.service.state.value.installLocation).toBe("project");
    });

    it("records a top-level category from the CLI's JSON", async () => {
        const s = setup();
        s.runner.on(["aitools", "install"], {
            exitCode: 1,
            stdout: JSON.stringify({
                scope: "global",
                error: "ref lookup failed",
                error_category: "REF_LOOKUP_FAILED",
            }),
        });
        await expect(s.service.install("global", "sidePane", ["goose"])).rejects.toThrow(
            "ref lookup failed",
        );
        expect(s.events("aitoolsInstall")[0]!.properties).toMatchObject({
            globalErrorCategory: "REF_LOOKUP_FAILED",
        });
    });

    it("uses the CLI's message when the failure has no JSON", async () => {
        const s = setup();
        s.runner.on(["aitools", "install"], { exitCode: 1, stderr: "Error: unknown agent" });
        await expect(s.service.install("global", "sidePane", ["bogus"])).rejects.toThrow(
            "Failed to install Databricks AI tools. Error: unknown agent",
        );
    });

    it("treats a success without JSON (an older CLI) as a success", async () => {
        const s = setup();
        s.runner.on(["aitools", "install"], { stdout: "Installed 29 skills." });
        await s.service.install("global", "sidePane", ["goose"]);
        expect(s.events("aitoolsInstall")[0]!.properties).toMatchObject({ result: "success" });
    });

    it("needs a folder for project scope", async () => {
        const s = setup({ project: false });
        await expect(s.service.install("project", "sidePane", ["goose"])).rejects.toThrow(
            "Open a folder to install AI tools into a project.",
        );
    });

    describe("in Cursor", () => {
        it("opens the plugin dialog and leaves cursor out of --agents", async () => {
            const s = setup({ isCursor: true });
            await s.service.install("global", "sidePane", ["cursor", "claude-code"]);
            expect(s.opened).toHaveLength(1);
            expect(s.runner.calls.find((c) => c.args[1] === "install")!.args).toContain(
                "claude-code",
            );
            expect(
                s.runner.calls.find((c) => c.args[1] === "install")!.args.join(" "),
            ).not.toContain("cursor");
            expect(s.events("aitoolsInstall")[0]!.properties).toMatchObject({
                cursorPlugin: "true",
            });
            expect(s.events("aitoolsCursorPluginPrompt")[0]!.properties).toMatchObject({
                success: "true",
                source: "sidePane",
            });
        });

        it("skips the CLI when only the plugin is chosen", async () => {
            const s = setup({ isCursor: true });
            await s.service.install("global", "initModal", ["cursor"]);
            expect(s.runner.calls).toEqual([]);
            expect(s.events("aitoolsInstall")[0]!.properties).toMatchObject({
                result: "possible-success",
                cursorPlugin: "true",
                agents: "[]",
            });
        });

        it("doesn't open the dialog when cursor isn't chosen", async () => {
            const s = setup({ isCursor: true });
            await s.service.install("global", "sidePane", ["claude-code"]);
            expect(s.opened).toEqual([]);
            expect(s.events("aitoolsInstall")[0]!.properties).toMatchObject({
                cursorPlugin: "false",
            });
        });

        it("records a failed dialog without throwing", async () => {
            const s = setup({ isCursor: true });
            s.failOpen();
            await s.service.addCursorPlugin("pluginButton");
            expect(s.events("aitoolsCursorPluginPrompt")[0]!.properties).toEqual({
                success: "false",
                source: "pluginButton",
            });
        });
    });

    it("installs one agent into the current location, and refreshes the rows even when it fails", async () => {
        const s = setup();
        s.install(s.project);
        s.runner.on(["aitools", "list"], { stdout: list("project") });
        await s.service.refresh();
        await s.service.installAgent("goose");
        expect(s.runner.calls.find((c) => c.args[1] === "install")!.args).toEqual([
            "aitools",
            "install",
            "--scope",
            "project",
            "--agents",
            "goose",
            "--output",
            "json",
        ]);
        const lists = s.runner.calls.filter((c) => c.args[1] === "list").length;
        s.runner.on(["aitools", "install"], { exitCode: 1, stderr: "boom" });
        await expect(s.service.installAgent("goose")).rejects.toThrow("boom");
        expect(s.runner.calls.filter((c) => c.args[1] === "list").length).toBe(lists + 1);
    });

    it("doesn't install an agent when nothing is installed", async () => {
        const s = setup();
        await s.service.installAgent("goose");
        expect(s.runner.calls).toEqual([]);
    });
});

describe("AiToolsService: update and uninstall", () => {
    async function installed(s: ReturnType<typeof setup>) {
        s.install(s.home);
        s.runner.on(["aitools", "list"], { stdout: list("global", { behind: true }) });
        await s.service.refresh();
    }

    it("updates, then reads the status again", async () => {
        const s = setup();
        await installed(s);
        s.runner.on(["aitools", "list"], { stdout: list("global") });
        await s.service.update();
        expect(s.runner.calls.find((c) => c.args[1] === "update")!.args).toEqual([
            "aitools",
            "update",
            "--scope",
            "global",
        ]);
        expect(s.service.state.value.updateStatus).toBe("upToDate");
        expect(s.events("aitoolsUpdate")[0]!.properties).toEqual({
            success: "true",
            scope: "global",
        });
    });

    it("still reads the status when the update fails", async () => {
        const s = setup();
        await installed(s);
        s.runner.on(["aitools", "update"], { exitCode: 1, stderr: "offline" });
        await expect(s.service.update()).rejects.toThrow(
            "Failed to update Databricks AI tools. offline",
        );
        expect(s.service.state.value.updateStatus).toBe("updateAvailable");
        expect(s.events("aitoolsUpdate")[0]!.properties).toEqual({
            success: "false",
            scope: "global",
        });
    });

    it("runs one operation at a time: a check waits for an update in flight", async () => {
        const s = setup();
        await installed(s);
        const order: string[] = [];
        let finish!: () => void;
        s.runner.on(["aitools", "update"], async () => {
            order.push("update started");
            await new Promise<void>((resolve) => (finish = resolve));
            order.push("update done");
            return {};
        });
        s.runner.on(["aitools", "list"], () => {
            order.push("list");
            return { stdout: list("global") };
        });
        const update = s.service.update();
        const check = s.service.checkForUpdates();
        await new Promise((resolve) => setImmediate(resolve));
        expect(s.service.state.value.updateStatus).toBe("updating");
        finish();
        await Promise.all([update, check]);
        expect(order).toEqual(["update started", "update done", "list", "list"]);
    });

    it("uninstalls the detected scope and detects again", async () => {
        const s = setup();
        await installed(s);
        s.runner.on(["aitools", "uninstall"], () => {
            s.uninstallAll();
            return {};
        });
        await s.service.uninstall();
        expect(s.runner.calls.find((c) => c.args[1] === "uninstall")!.args).toEqual([
            "aitools",
            "uninstall",
            "--scope",
            "global",
        ]);
        expect(s.service.isInstalled).toBe(false);
        expect(s.events("aitoolsUninstall")[0]!.properties).toEqual({
            success: "true",
            scope: "global",
        });
    });

    it("doesn't run the CLI when nothing is installed", async () => {
        const s = setup();
        await s.service.uninstall();
        await s.service.update();
        expect(s.runner.calls).toEqual([]);
    });
});
