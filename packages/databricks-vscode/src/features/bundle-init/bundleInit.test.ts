import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CHOOSE_PROFILE, CONNECTED_PROFILE } from "../../kernel/connection/commands";
import { registerFeatures, startFeatures } from "../../kernel/feature";
import { CancelledError } from "../../platform/errors";
import { MutableState, when } from "../../platform/reactive";
import { escapeExecutableForTerminal, escapePathArgument } from "../../platform/shell";
import { environmentOf, PROBE_ENV, PROBE_SETTINGS } from "../../test-support/childEnvironment";
import { fakeFeatureHost, fakeKernel, fakeSettings } from "../../test-support/fakes";
import { FakeFileEvents } from "../../test-support/fakeFiles";
import { FakeHttpClient, type FakeResponse, SCIM_ME } from "../../test-support/fakeHttp";
import { useTempDirs } from "../../test-support/tempDir";
import { host as vscode, type FakeQuickInput, type FakeTerminal } from "../../test-support/vscode";
import { connection } from "../connection";
import { BundleInitWizard, pickParentFolder, TERMINAL_NAME } from "./BundleInitWizard";
import { bundleInit, INIT_NEW_PROJECT } from "./index";

const A = "https://a.cloud.databricks.com";
const tempDir = useTempDirs();
const lastInput = (): FakeQuickInput => vscode.quickInputs[vscode.quickInputs.length - 1]!;
const labels = (input: FakeQuickInput) => input.items.map((i) => i.label);
const NEW_BUNDLE =
    "bundle: {name: my_project}\ntargets:\n  dev: {default: true, mode: development}\n  prod: {mode: production}\n";
const DEFAULT_CONFIG = `[DEFAULT]\nhost = ${A}\ntoken = dapi-default\n\n[dev]\nhost = ${A}\nauth_type = databricks-cli\n`;

interface SetupOptions {
    readonly folder?: boolean;
    /** The config file's text. By default DEFAULT (a token) is the window's profile. */
    readonly config?: string;
    /** Extra variables for the extension host, such as `DATABRICKS_CONFIG_PROFILE`. */
    readonly env?: Record<string, string>;
    /** The current-user call answers 401, so the window's connection fails. */
    readonly rejected?: boolean;
    /** The current-user call never answers, so the window stays connecting. */
    readonly pending?: boolean;
    /** The child-environment probe variables and settings (`childEnvironment.ts`). */
    readonly probe?: boolean;
}

async function setup(options: SetupOptions = {}) {
    const t = tempDir();
    const config = t.write(".databrickscfg", options.config ?? DEFAULT_CONFIG);
    const workspaceDir = t.path("workspace");
    fs.mkdirSync(workspaceDir);
    const folders = options.folder === false ? [] : [workspaceDir];
    vscode.folders = folders;
    const http = new FakeHttpClient().on("GET", SCIM_ME, () => {
        if (options.pending) {
            return new Promise<FakeResponse>(() => {});
        }
        return options.rejected
            ? { status: 401, body: { message: "Invalid access token." } }
            : { body: { userName: "me" } };
    });
    const kernel = fakeKernel({
        env: {
            ...(options.probe ? PROBE_ENV : {}),
            DATABRICKS_CONFIG_FILE: config,
            ...options.env,
        },
        settings: fakeSettings(options.probe ? { ...PROBE_SETTINGS } : {}),
        httpClient: http,
        folders: new MutableState<readonly string[]>(folders),
        files: new FakeFileEvents(),
    });
    kernel.runner.on(["auth", "token"], {
        stdout: JSON.stringify({
            access_token: "u2m",
            expiry: new Date(Date.now() + 3600_000).toISOString(),
        }),
    });
    const fake = fakeFeatureHost(kernel);
    const registered = registerFeatures([connection, bundleInit], fake.host);
    kernel.start();
    startFeatures(registered);
    const status = options.pending
        ? "connecting"
        : options.rejected
          ? "error"
          : options.config === ""
            ? "signedOut"
            : "connected";
    await when(kernel.connection.state, (s) => s.status === status);
    await when(kernel.project.initialized, (i) => i);
    const wizard = (shell = "/bin/zsh") =>
        new BundleInitWizard({
            kernel,
            log: fake.log,
            chooseProfile: () => fake.host.registry.executeInternal(CHOOSE_PROFILE, undefined),
            connectedProfile: () =>
                fake.host.registry.executeInternal(CONNECTED_PROFILE, undefined),
            shell: () => shell,
        });
    return { t, kernel, workspaceDir, wizard, ...fake };
}

/** The steps a window that isn't connected asks: host, then profile. */
async function answerHostAndProfile(profile: string) {
    await vi.waitFor(() => expect(vscode.quickInputs).toHaveLength(1));
    // The current host is preselected.
    expect(lastInput().placeholder).toBe(
        'Databricks Host (should begin with https://), or choose "Sign in via login.databricks.com"',
    );
    expect(lastInput().activeItems[0]?.label).toBe(A);
    lastInput().accept();
    await vi.waitFor(() => expect(vscode.quickInputs).toHaveLength(2));
    expect(labels(lastInput())).toEqual([
        "DEFAULT",
        "dev",
        "",
        "OAuth",
        "Personal Access Token",
        "",
        "Edit Databricks profiles",
    ]);
    lastInput().accept(profile);
}

/** The parent folder step: the only one a connected window asks. */
async function answerParent(parent: string) {
    await vi.waitFor(() =>
        expect(lastInput().title).toBe(
            "Provide a path to a folder where you would want your new project to be",
        ),
    );
    lastInput().type(parent);
    expect(labels(lastInput())[0]).toBe(parent);
    lastInput().accept(parent);
}

/** Host, then profile, then parent folder, as the window's not connected. */
async function answerSteps(profile: string, parent: string) {
    await answerHostAndProfile(profile);
    await vi.waitFor(() => expect(vscode.quickInputs).toHaveLength(3));
    await answerParent(parent);
}

/** Waits for the init terminal to be shown, runs `cli`, then closes the terminal. */
async function runTerminal(cli: () => void = () => {}): Promise<FakeTerminal> {
    await vi.waitFor(() => expect(vscode.terminals[0]?.shown).toBe(1));
    const terminal = vscode.terminals[0]!;
    cli();
    terminal.close();
    return terminal;
}

describe("the new-project wizard", () => {
    beforeEach(() => vscode.reset());

    it("uses the window's connected profile: no host or profile step, bundle init in the editor terminal, the new project opened in place", async () => {
        const { t, kernel, workspaceDir, wizard } = await setup();
        let offered: { label: string }[] = [];
        vscode.pickFrom = (items) => {
            offered = items;
            return items[0];
        };
        const run = wizard().run();
        await answerParent(workspaceDir);
        const terminal = await runTerminal(() =>
            t.write("workspace/my_project/databricks.yml", NEW_BUNDLE),
        );
        await expect(run).resolves.toBe(true);

        expect(vscode.quickInputs).toHaveLength(1);
        expect(terminal.creationOptions).toMatchObject({
            name: TERMINAL_NAME,
            shellPath: "/bin/zsh",
            hideFromUser: true,
            isTransient: true,
            location: 2,
            strictEnv: true,
            cwd: os.tmpdir(),
        });
        expect(terminal.creationOptions.env).toMatchObject({
            DATABRICKS_HOST: A,
            DATABRICKS_CONFIG_PROFILE: "DEFAULT",
            DATABRICKS_OUTPUT_FORMAT: "text",
            DATABRICKS_CONFIG_FILE: t.path(".databrickscfg"),
        });
        expect(terminal.creationOptions.env?.DATABRICKS_TOKEN).toBeUndefined();
        // Run by the shell, not typed at its prompt, which would echo it.
        expect(terminal.sent).toEqual([]);
        expect(terminal.creationOptions.shellArgs).toEqual([
            "-c",
            // POSIX quoting, which writes a Windows path's backslashes outside the quotes (for fish).
            expect.stringContaining(
                `${escapeExecutableForTerminal(kernel.cli.cliPath, "posix")} bundle init --output-dir ${escapePathArgument(workspaceDir, "posix")}; `,
            ),
        ]);

        expect(offered.map((i) => i.label)).toEqual(["my_project", "", "Choose another folder"]);
        expect(kernel.project.active.value?.root).toBe(t.path("workspace/my_project"));
        expect(kernel.project.target.value).toBe("dev");
        // Saved for the default target before the project loaded, so its connection uses it at once.
        expect(kernel.project.overrides.value).toEqual({ authProfile: "DEFAULT" });
        expect(vscode.executed.map((e) => e.command)).not.toContain("vscode.openFolder");
    });

    it("uses a connected OAuth profile whose session works, and checks the session first", async () => {
        const { t, kernel, workspaceDir, wizard } = await setup({
            env: { DATABRICKS_CONFIG_PROFILE: "dev" },
        });
        vscode.pickFrom = (items) => items[0];
        // The window's own connect ran `auth token` already: only calls from here on count.
        const before = kernel.runner.argv.length;
        const run = wizard().run();
        await vi.waitFor(() => expect(vscode.quickInputs).toHaveLength(1));
        expect(kernel.runner.argv.slice(before)).toEqual([["auth", "token", "--profile", "dev"]]);
        await answerParent(workspaceDir);
        const terminal = await runTerminal(() =>
            t.write("workspace/my_project/databricks.yml", NEW_BUNDLE),
        );
        await expect(run).resolves.toBe(true);

        expect(vscode.quickInputs).toHaveLength(1);
        expect(terminal.creationOptions.env).toMatchObject({
            DATABRICKS_HOST: A,
            DATABRICKS_CONFIG_PROFILE: "dev",
        });
        expect(kernel.project.overrides.value).toEqual({ authProfile: "dev" });
    });

    it("signs an expired OAuth session in again with the same profile, then uses it with no host or profile step", async () => {
        const { t, workspaceDir, wizard, kernel } = await setup({
            env: { DATABRICKS_CONFIG_PROFILE: "dev" },
        });
        // The session expired after the window connected.
        kernel.runner.on(["auth", "token"], { exitCode: 1, stderr: "refresh token expired" });
        const connected = kernel.connection.state.value;
        vscode.pickFrom = (items) => items[0];
        const run = wizard().run();
        await answerParent(workspaceDir);
        // The renewal showed on no row: the window is as it was, connected.
        expect(kernel.connection.state.value).toEqual(connected);
        const terminal = await runTerminal(() =>
            t.write("workspace/my_project/databricks.yml", NEW_BUNDLE),
        );
        await expect(run).resolves.toBe(true);

        expect(vscode.quickInputs).toHaveLength(1);
        expect(kernel.runner.argv.filter((a) => a[0] === "auth" && a[1] === "login")).toEqual([
            ["auth", "login", "--host", A, "--profile", "dev", "--timeout", "300s"],
        ]);
        expect(terminal.creationOptions.env).toMatchObject({
            DATABRICKS_CONFIG_PROFILE: "dev",
            DATABRICKS_HOST: A,
        });
        expect(kernel.project.overrides.value).toEqual({ authProfile: "dev" });
    });

    it("stops when the sign-in that renews an expired OAuth session fails, before any step, and leaves the window as it was", async () => {
        const { kernel, wizard } = await setup({ env: { DATABRICKS_CONFIG_PROFILE: "dev" } });
        kernel.runner.on(["auth", "token"], { exitCode: 1, stderr: "refresh token expired" });
        kernel.runner.on(["auth", "login"], { exitCode: 1, stderr: "browser closed" });
        const connected = kernel.connection.state.value;
        await expect(wizard().run()).rejects.toThrow(CancelledError);
        expect(vscode.quickInputs).toHaveLength(0);
        expect(vscode.terminals).toEqual([]);
        expect(vscode.errors.map((e) => e.message)).toEqual([
            expect.stringMatching(/^Login failed with Databricks CLI/),
        ]);
        expect(kernel.connection.state.value).toEqual(connected);
    });

    it("stops quietly when the sign-in that renews an expired OAuth session is cancelled, and leaves the window as it was", async () => {
        const { kernel, wizard } = await setup({ env: { DATABRICKS_CONFIG_PROFILE: "dev" } });
        kernel.runner.on(["auth", "token"], { exitCode: 1, stderr: "refresh token expired" });
        kernel.runner.on(
            ["auth", "login"],
            (_args, options) =>
                new Promise((resolve) =>
                    options.signal?.addEventListener("abort", () =>
                        resolve({ exitCode: 1, cancelled: true }),
                    ),
                ),
        );
        const connected = kernel.connection.state.value;
        const run = wizard().run();
        await vi.waitFor(() => expect(kernel.runner.argv.some((a) => a[1] === "login")).toBe(true));
        vscode.cancelProgress();
        await expect(run).rejects.toThrow(CancelledError);
        expect(vscode.quickInputs).toHaveLength(0);
        expect(vscode.errors).toEqual([]);
        expect(kernel.connection.state.value).toEqual(connected);
    });

    it("refuses another sign-in while it renews an expired OAuth session", async () => {
        const { kernel, wizard } = await setup({ env: { DATABRICKS_CONFIG_PROFILE: "dev" } });
        kernel.runner.on(["auth", "token"], { exitCode: 1, stderr: "refresh token expired" });
        let release = () => {};
        kernel.runner.on(
            ["auth", "login"],
            () => new Promise((resolve) => (release = () => resolve({}))),
        );
        const run = wizard().run();
        await vi.waitFor(() => expect(kernel.runner.argv.some((a) => a[1] === "login")).toBe(true));
        await vscode.commands.get("databricks.connection.configureLogin")!();
        expect(vscode.errors.map((e) => e.message)).toEqual([
            "Databricks: sign in is already in progress",
        ]);
        release();
        await vi.waitFor(() => expect(vscode.quickInputs).toHaveLength(1));
        lastInput().hide();
        await expect(run).rejects.toThrow(CancelledError);
    });

    it("asks host and profile when the window switched profile while the expired session was signed in again", async () => {
        const { kernel, wizard } = await setup({ env: { DATABRICKS_CONFIG_PROFILE: "dev" } });
        kernel.runner.on(["auth", "token"], { exitCode: 1, stderr: "refresh token expired" });
        let release = () => {};
        kernel.runner.on(
            ["auth", "login"],
            () => new Promise((resolve) => (release = () => resolve({}))),
        );
        const run = wizard().run();
        await vi.waitFor(() => expect(kernel.runner.argv.some((a) => a[1] === "login")).toBe(true));
        await kernel.connection.useProfile("DEFAULT");
        release();
        await vi.waitFor(() => expect(vscode.quickInputs).toHaveLength(1));
        expect(lastInput().placeholder).toMatch(/^Databricks Host/);
        lastInput().hide();
        await expect(run).rejects.toThrow(CancelledError);
    });

    it("asks host and profile when the connection's workspace comes from a bundle target", async () => {
        const { t, kernel, workspaceDir, wizard } = await setup();
        const connected = kernel.connection.connection!;
        // A profile signed in to the account only, connected through the target's workspace.
        vi.spyOn(kernel.connection, "connection", "get").mockReturnValue({
            ...connected,
            targetWorkspace: { workspaceId: "123", target: "dev" },
        } as typeof connected);
        vscode.pickFrom = (items) => items[0];
        const run = wizard().run();
        await answerSteps("DEFAULT", workspaceDir);
        await runTerminal(() => t.write("workspace/my_project/databricks.yml", NEW_BUNDLE));
        await expect(run).resolves.toBe(true);
        expect(kernel.runner.argv.filter((a) => a[0] === "auth" && a[1] === "login")).toEqual([]);
    });

    it("asks host first when the window is signed out", async () => {
        const { wizard } = await setup({ config: "" });
        const run = wizard().run();
        await vi.waitFor(() => expect(vscode.quickInputs).toHaveLength(1));
        expect(lastInput().placeholder).toMatch(/^Databricks Host/);
        lastInput().hide();
        await expect(run).rejects.toThrow(CancelledError);
        expect(vscode.terminals).toEqual([]);
    });

    it("asks host first while the window is still connecting", async () => {
        const { wizard } = await setup({ pending: true });
        const run = wizard().run();
        await vi.waitFor(() => expect(vscode.quickInputs).toHaveLength(1));
        expect(lastInput().placeholder).toMatch(/^Databricks Host/);
        lastInput().hide();
        await expect(run).rejects.toThrow(CancelledError);
        expect(vscode.terminals).toEqual([]);
    });

    it("gives the terminal the host env with http.proxy over it, as 2.22.0 did", async () => {
        const { workspaceDir, wizard } = await setup({ probe: true });
        const run = wizard().run();
        await answerParent(workspaceDir);
        const terminal = await runTerminal();
        await run;
        expect(environmentOf(terminal.creationOptions.env)).toBe("hostAndProxy");
    });

    it("asks host, then profile, when the window failed to connect, and checks a chosen OAuth profile's session", async () => {
        const { kernel, workspaceDir, wizard } = await setup({ rejected: true });
        const failed = kernel.connection.state.value;
        const run = wizard().run();
        await answerSteps("dev", workspaceDir);
        const terminal = await runTerminal();
        await expect(run).resolves.toBe(false);
        expect(terminal.creationOptions.env).toMatchObject({
            DATABRICKS_CONFIG_PROFILE: "dev",
            DATABRICKS_CLI_PATH: kernel.cli.cliPath,
        });
        // The window's DEFAULT is a token profile, so only the chosen profile's check runs `auth token`.
        expect(kernel.runner.argv).toContainEqual(["auth", "token", "--profile", "dev"]);
        expect(kernel.connection.state.value).toEqual(failed);
    });

    it("opens a new project outside the workspace in the window, with its profile saved", async () => {
        const { t, wizard } = await setup();
        const outside = t.path("elsewhere");
        fs.mkdirSync(outside);
        vscode.pickFrom = (items) => items[0];
        const run = wizard().run();
        await answerParent(outside);
        await runTerminal(() => t.write("elsewhere/my_project/databricks.yml", NEW_BUNDLE));
        await run;
        const open = vscode.executed.find((e) => e.command === "vscode.openFolder");
        expect(open?.args[0]).toMatchObject({ fsPath: t.path("elsewhere/my_project") });
        const overrides = t.path(
            "elsewhere/my_project/.databricks/bundle/dev/vscode.overrides.json",
        );
        expect(JSON.parse(fs.readFileSync(overrides, "utf-8"))).toEqual({ authProfile: "DEFAULT" });
    });

    it("says so when the CLI created no project", async () => {
        const { workspaceDir, wizard } = await setup();
        const run = wizard().run();
        await answerParent(workspaceDir);
        await runTerminal();
        await expect(run).resolves.toBe(false);
        expect(vscode.infos).toEqual([
            {
                message: `We haven't detected any Databricks projects in "${workspaceDir}". If you initialized your project somewhere else, please open the folder manually.`,
                actions: ["Open Folder"],
            },
        ]);
    });

    it("refuses % and ! in the parent folder when the shell is cmd, before opening a terminal", async () => {
        const { t, wizard } = await setup();
        const run = wizard("C:\\Windows\\System32\\cmd.exe").run();
        await answerParent(t.path("100%"));
        await expect(run).rejects.toThrow(/the Command Prompt shell expands "%" and "!" in paths/);
        expect(vscode.terminals).toEqual([]);
    });

    it("stops quietly when the parent folder step is dismissed, and records the attempt", async () => {
        const { reporter } = await setup();
        const command = vscode.commands.get(INIT_NEW_PROJECT)!() as Promise<unknown>;
        await vi.waitFor(() => expect(vscode.quickInputs).toHaveLength(1));
        expect(lastInput().title).toBe(
            "Provide a path to a folder where you would want your new project to be",
        );
        lastInput().hide();
        await command;
        expect(vscode.quickInputs).toHaveLength(1);
        expect(vscode.terminals).toEqual([]);
        expect(vscode.errors).toEqual([]);
        expect(
            reporter.events.find((e) => e.name.endsWith("bundleInit"))?.properties,
        ).toMatchObject({ "event.success": "false" });
    });

    it("works without a folder: the parent defaults to the home folder", async () => {
        await setup({ folder: false });
        const command = vscode.commands.get(INIT_NEW_PROJECT)!() as Promise<unknown>;
        await vi.waitFor(() => expect(vscode.quickInputs).toHaveLength(1));
        expect(lastInput().value).toBe(os.homedir());
        lastInput().hide();
        await command;
        expect(vscode.terminals).toEqual([]);
    });
});

describe("the parent-folder picker", () => {
    beforeEach(() => vscode.reset());

    it("always lists the typed path first, then the folder dialog", async () => {
        const picked = pickParentFolder("/home/me");
        const input = lastInput();
        expect(input.value).toBe("/home/me");
        expect(labels(input)).toEqual(["/home/me", "", "Open folder selection dialog"]);
        input.type("/home/me/projects");
        expect(labels(input)).toEqual(["/home/me/projects", "", "Open folder selection dialog"]);
        input.type("");
        expect(labels(input)).toEqual(["", "Open folder selection dialog"]);
        input.type("/srv");
        input.accept();
        await expect(picked).resolves.toBe(path.normalize("/srv"));
        expect(input.disposed).toBe(true);
    });

    it("opens the folder dialog from its last item", async () => {
        vscode.nextOpenDialog = "/chosen";
        const picked = pickParentFolder("/home/me");
        lastInput().accept("Open folder selection dialog");
        await expect(picked).resolves.toBe("/chosen");
    });

    it("resolves undefined when dismissed", async () => {
        const picked = pickParentFolder("/home/me");
        lastInput().hide();
        await expect(picked).resolves.toBeUndefined();
    });
});
