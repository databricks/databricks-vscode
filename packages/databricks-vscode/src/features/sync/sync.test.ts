import fs from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerFeatures, startFeatures } from "../../kernel/feature";
import { disposeAll } from "../../platform/event";
import { MutableState, when } from "../../platform/reactive";
import type { ConfigurationItem } from "../../platform/ui/sections";
import type { FakeProcess } from "../../test-support/fakeCli";
import { FAKE_CLI_PATH, fakeFeatureHost, fakeKernel } from "../../test-support/fakes";
import { FakeFileEvents } from "../../test-support/fakeFiles";
import { FakeHttpClient, SCIM_ME } from "../../test-support/fakeHttp";
import { useTempDirs } from "../../test-support/tempDir";
import { host as vscode, window, type Task } from "../../test-support/vscode";
import { connection } from "../connection";
import { IS_DEV_TARGET, sync, SYNC_START, SYNC_START_FULL, SYNC_STOP } from "./index";
import { SHOW_SYNC_ERROR } from "./RemoteFolderSection";

/* eslint-disable @typescript-eslint/naming-convention */

const A = "https://a.cloud.databricks.com";
const GET_STATUS = "/api/2.0/workspace/get-status";
const FILES = "/Workspace/Users/me/.bundle/demo/dev/files";
const tempDir = useTempDirs();

const validated = (target: string, mode: string) =>
    JSON.stringify({
        bundle: { name: "demo", target, mode },
        workspace: {
            file_path:
                target === "dev" ? FILES : `/Workspace/Users/me/.bundle/demo/${target}/files`,
        },
    });

/** The real kernel, connected to a project with a development and a production target, with sync registered. */
async function setup(options: { target?: string } = {}) {
    const t = tempDir();
    const config = t.write(".databrickscfg", `[DEFAULT]\nhost = ${A}\ntoken = dapi-default\n`);
    t.write(
        "project/databricks.yml",
        `bundle: {name: demo}\nvariables: {v: {default: x}}\ntargets:\n  dev: {default: true, mode: development, workspace: {host: ${A}}}\n  prod: {mode: production, workspace: {host: ${A}}}\n`,
    );
    t.write("project/.databricks/bundle/dev/vscode.bundlevars.json", `{"v": "from-file"}`);
    const root = t.path("project");
    vscode.folders = [root];
    const http = new FakeHttpClient().on("GET", SCIM_ME, () => ({ body: { userName: "me" } }));
    const files = new FakeFileEvents();
    const kernel = fakeKernel({
        env: { DATABRICKS_CONFIG_FILE: config },
        httpClient: http,
        folders: new MutableState<readonly string[]>([root]),
        files,
    });
    kernel.runner.on(["bundle", "validate"], (args) => ({
        stdout: validated(args[3]!, args[3] === "dev" ? "development" : "production"),
    }));
    kernel.runner.on(["bundle", "summary"], (args) => ({
        stdout: validated(args[3]!, "development"),
    }));
    const contextKeys = new Map<string, unknown>();
    const fake = fakeFeatureHost(kernel);
    const registered = registerFeatures([connection, sync], {
        ...fake.host,
        kernel: {
            ...kernel,
            contextKeys: {
                set: async (key: { name: string }, value: unknown) =>
                    void contextKeys.set(key.name, value),
            },
        } as never,
    });
    kernel.start();
    startFeatures(registered);
    await when(kernel.connection.state, (s) => s.status === "connected");
    await when(kernel.bundle.validated, (s) => s.status === "ready");
    const selectTarget = async (target: string) => {
        await kernel.project.selectTarget(target);
        await when(
            kernel.bundle.validated,
            (s) => s.status === "ready" && s.value.target === target,
        );
    };
    if (options.target !== undefined) {
        await selectTarget(options.target);
    }
    const section = () => fake.host.sections.list().find((s) => s.id === "sync.remoteFolder")!;
    const rows = async (parent?: ConfigurationItem) => await section().getChildren(parent);
    const remoteFolder = async () => (await rows())[0];
    const state = async () => {
        const folder = await remoteFolder();
        return folder && (await rows(folder)).find((r) => r.label === "Sync State");
    };
    const run = (command: string, ...args: unknown[]) => vscode.commands.get(command)?.(...args);
    const syncs = (): FakeProcess[] => kernel.runner.started.filter((p) => p.args[1] === "sync");
    /** As the extension's deactivation does. */
    const disposeFeatures = () => registered.forEach(({ ctx }) => disposeAll(ctx.subscriptions));
    return {
        t,
        kernel,
        log: fake.log,
        http,
        files,
        root,
        rows,
        remoteFolder,
        state,
        run,
        syncs,
        contextKeys,
        selectTarget,
        disposeFeatures,
    };
}

describe("sync", () => {
    beforeEach(() => vscode.reset());

    it("starts bundle sync --watch in the task databricks: sync, with the target's environment (SYNC-01)", async () => {
        const s = await setup();
        await s.run(SYNC_START);

        const [execution] = vscode.tasks;
        const task: Task = execution!.task;
        expect(task.definition).toEqual({ type: "databricks", task: "sync" });
        expect([task.name, task.source, task.isBackground, task.problemMatchers]).toEqual([
            "sync",
            "databricks",
            true,
            [],
        ]);
        expect(task.presentationOptions).toMatchObject({ echo: true });
        const [process] = s.syncs();
        expect(process!.args).toEqual([
            "bundle",
            "sync",
            "--target",
            "dev",
            "--watch",
            "--output",
            "json",
        ]);
        expect(process!.options.cwd).toBe(s.root);
        expect(process!.options.env).toMatchObject({
            DATABRICKS_HOST: A,
            DATABRICKS_CONFIG_PROFILE: "DEFAULT",
            DATABRICKS_CLI_UPSTREAM: "databricks-vscode",
            BUNDLE_VAR_v: "from-file",
        });
        expect(process!.options.env?.DATABRICKS_TOKEN).toBeUndefined();
        expect(execution!.output).toContain(`[VSCODE] databricks cli path: ${FAKE_CLI_PATH}\r\n`);
        expect(execution!.output).toContain(
            "[VSCODE] sync command args: bundle,sync,--target,dev,--watch,--output,json\r\n",
        );
        expect((await s.state())?.description).toBe("IN_PROGRESS");
        s.kernel.dispose();
    });

    it("shows the CLI's progress, and WATCHING_FOR_CHANGES once a synchronization completes", async () => {
        const s = await setup();
        s.http.on("GET", GET_STATUS, () => ({
            body: { path: FILES, object_type: "DIRECTORY", object_id: 77 },
        }));
        await s.run(SYNC_START);
        s.syncs()[0]!
            .stdout(
                '{"type":"start","put":["src/nb.py"]}',
                '{"type":"progress","action":"put","path":"src/nb.py","progress":1}',
            )
            .stderr("Action: PUT: src/nb.py")
            .stdout('{"type":"complete","put":["src/nb.py"]}');

        expect((await s.state())?.description).toBe("WATCHING_FOR_CHANGES");
        const output = vscode.tasks[0]!.output;
        expect(output).toContain(
            "Starting synchronization (1 files)\r\nUploaded src/nb.py\r\nAction: PUT: src/nb.py\r\nCompleted synchronization\r\n",
        );
        await expect.poll(async () => (await s.remoteFolder())?.url).toBe(`${A}/browse/folders/77`);
        const folder = (await s.remoteFolder())!;
        expect(folder).toMatchObject({
            label: "Remote Folder",
            contextValue: "databricks.configuration.sync.has-url.is-running",
            resourceUri: undefined,
        });
        expect((await s.rows(folder)).map((r) => [r.label, r.description])).toEqual([
            ["Path", FILES],
            ["Sync State", "WATCHING_FOR_CHANGES"],
        ]);
        s.kernel.dispose();
    });

    it("links the remote folder only once it exists, and logs a failure to read it", async () => {
        const s = await setup();
        const warnings = () =>
            s.log.entries.filter((e) => e.message === "Can't read the remote folder");
        // Not deployed yet: the fake's 404 means no folder, not a failure.
        await when(s.kernel.bundle.deployed, (d) => d.status === "ready");
        await expect.poll(() => s.http.to(GET_STATUS).length).toBeGreaterThan(0);
        // The rest of that load is microtasks; let it end before the next load supersedes it.
        await new Promise((resolve) => setImmediate(resolve));
        expect(new URL(s.http.to(GET_STATUS)[0]!.url).searchParams.get("path")).toBe(FILES);
        expect(warnings()).toEqual([]);

        s.http.on("GET", GET_STATUS, {
            status: 403,
            body: { error_code: "PERMISSION_DENIED", message: "no" },
        });
        s.kernel.bundle.deployed.invalidate("deployed elsewhere");

        await expect.poll(() => warnings().length).toBeGreaterThan(0);
        for (const w of warnings()) {
            expect(w.data).toEqual([expect.objectContaining({ code: "PERMISSION_DENIED" })]);
        }
        expect((await s.remoteFolder())?.tooltip).toBe("Created after deploy");
        s.kernel.dispose();
    });

    it("stops: kills the CLI, ends its task, and shows STOPPED without an error (SYNC-02)", async () => {
        const s = await setup();
        await s.run(SYNC_START);
        s.syncs()[0]!.stdout('{"type":"start"}', '{"type":"complete"}');

        await s.run(SYNC_STOP);

        expect(s.syncs()[0]!.killed).toBe(true);
        expect(vscode.tasks[0]!.ended).toBe(true);
        expect((await s.state())?.description).toBe("STOPPED");
        expect((await s.remoteFolder())?.contextValue).toBe(
            "databricks.configuration.sync.is-stopped",
        );
        expect(vscode.errors).toEqual([]);
        s.kernel.dispose();
    });

    it("stops when the user closes the terminal, and disposes no other terminal", async () => {
        const s = await setup();
        const other = window.createTerminal({ name: "sync" });
        await s.run(SYNC_START);
        vscode.tasks[0]!.terminate();

        expect(s.syncs()[0]!.killed).toBe(true);
        expect((await s.state())?.description).toBe("STOPPED");
        expect(other.closed).toBe(false);
        s.kernel.dispose();
    });

    it("runs one sync at a time, and starts again after a stop", async () => {
        const s = await setup();
        await s.run(SYNC_START);
        await s.run(SYNC_START);
        expect(s.syncs()).toHaveLength(1);

        await s.run(SYNC_STOP);
        await s.run(SYNC_START_FULL);
        expect(s.syncs()).toHaveLength(2);
        expect(s.syncs()[1]!.args).toContain("--full");
        expect(vscode.tasks[1]!.task.definition).toEqual({ type: "databricks", task: "sync-full" });
        s.kernel.dispose();
    });

    it("fails on an Error: line, keeps the reason, and shows it on click", async () => {
        const s = await setup();
        await s.run(SYNC_START);
        s.syncs()[0]!.stderr("Error: Path (/Users/me/x) doesn't exist.");

        expect(s.syncs()[0]!.killed).toBe(true);
        expect(vscode.tasks[0]!.ended).toBe(true);
        const row = (await s.state())!;
        expect(row).toMatchObject({
            description: "Error - Click for more details",
            tooltip: "Click for more details",
        });
        expect(row.command).toMatchObject({ command: SHOW_SYNC_ERROR });
        await s.run(SHOW_SYNC_ERROR, ...(row.command!.arguments ?? []));
        expect(vscode.errors.map((e) => e.message)).toEqual([
            "Sync Error: Path (/Users/me/x) doesn't exist.",
        ]);
        s.kernel.dispose();
    });

    it("reports Files in Workspace disabled, and an exit without a reason as ERROR", async () => {
        const s = await setup();
        await s.run(SYNC_START);
        s.syncs()[0]!.stderr("Error: Files in Workspace is disabled for this workspace.");
        s.syncs()[0]!.exit(1);
        expect((await s.state())?.description).toBe("FILES_IN_WORKSPACE_DISABLED");

        await s.run(SYNC_START);
        s.syncs()[1]!.exit(1);
        await expect.poll(async () => (await s.state())?.description).toBe("ERROR");
        expect(vscode.tasks[1]!.exitCode).toBe(1);
        s.kernel.dispose();
    });

    it("stops when the target changes", async () => {
        const s = await setup();
        await s.run(SYNC_START);
        await s.selectTarget("prod");
        expect(s.syncs()[0]!.killed).toBe(true);
        expect(vscode.tasks[0]!.ended).toBe(true);
        expect((await s.remoteFolder())?.description).toBe(
            "/Workspace/Users/me/.bundle/demo/prod/files",
        );
        s.kernel.dispose();
    });

    it("stops when the window signs out", async () => {
        const s = await setup();
        await s.run(SYNC_START);
        await s.kernel.connection.signOut();
        expect(s.syncs()[0]!.killed).toBe(true);
        expect(await s.remoteFolder()).toBeUndefined();
        s.kernel.dispose();
    });

    it("shows the remote folder of a production target, and refuses to sync it", async () => {
        const s = await setup({ target: "prod" });
        expect(s.contextKeys.get(IS_DEV_TARGET.name)).toBe(false);
        const folder = (await s.remoteFolder())!;
        expect(folder).toMatchObject({
            label: "Remote Folder",
            description: "/Workspace/Users/me/.bundle/demo/prod/files",
            tooltip: "Created after deploy",
            contextValue: "databricks.configuration.sync.is-stopped",
        });
        expect(folder.resourceUri).toBeDefined();
        expect(await s.rows(folder)).toEqual([]);

        await s.run(SYNC_START);
        expect(s.syncs()).toEqual([]);
        expect(vscode.errors.map((e) => e.message)).toEqual([
            'Sync is only available for targets in development mode. Target "prod" isn\'t.',
        ]);
        s.kernel.dispose();
    });

    it("keeps syncing when databricks.yml changes but the target and its folder don't", async () => {
        const s = await setup();
        await s.run(SYNC_START);
        s.syncs()[0]!.stdout('{"type":"start"}', '{"type":"complete"}');
        const file = s.t.write(
            "project/databricks.yml",
            `bundle: {name: demo}\nvariables: {v: {default: y}}\ntargets:\n  dev: {default: true, mode: development, workspace: {host: ${A}}}\n  prod: {mode: production, workspace: {host: ${A}}}\n`,
        );
        s.files.touch(file);
        await when(s.kernel.project.active, (p) => p?.config.variables.v?.default === "y");
        await s.kernel.bundle.validated.settled();

        expect(s.syncs()).toHaveLength(1);
        expect(s.syncs()[0]!.killed).toBe(false);
        expect(vscode.tasks[0]!.ended).toBe(false);
        expect((await s.state())?.description).toBe("WATCHING_FOR_CHANGES");

        // It still stops with the extension.
        s.disposeFeatures();
        expect(s.syncs()[0]!.killed).toBe(true);
        expect(vscode.tasks[0]!.ended).toBe(true);
        s.kernel.dispose();
    });

    it("stops when an edit to databricks.yml moves the remote folder", async () => {
        const s = await setup();
        await s.run(SYNC_START);
        s.syncs()[0]!.stdout('{"type":"start"}', '{"type":"complete"}');
        const path = async () =>
            (await s.rows((await s.remoteFolder())!)).find((r) => r.label === "Path")?.description;
        expect(await path()).toBe(FILES);
        s.kernel.runner.on(["bundle", "validate"], (args) => ({
            stdout: JSON.stringify({
                bundle: { name: "demo", target: args[3], mode: "development" },
                workspace: { file_path: "/Workspace/Users/me/moved/files" },
            }),
        }));
        const file = s.t.write(
            "project/databricks.yml",
            `bundle: {name: demo}\nvariables: {v: {default: x}}\nworkspace: {root_path: /Workspace/Users/me/moved}\ntargets:\n  dev: {default: true, mode: development, workspace: {host: ${A}}}\n  prod: {mode: production, workspace: {host: ${A}}}\n`,
        );
        s.files.touch(file);
        await when(
            s.kernel.bundle.validated,
            (v) => v.status === "ready" && JSON.stringify(v.value).includes("/moved/files"),
        );
        // Sync restarts after the validate, on a timer the Windows runner can wake late.
        await vi.waitFor(async () => expect(await path()).toBe("/Workspace/Users/me/moved/files"));
        expect(s.syncs()[0]!.killed).toBe(true);
        s.kernel.dispose();
    });

    it("stops when databricks.yml goes away", async () => {
        const s = await setup();
        await s.run(SYNC_START);
        s.syncs()[0]!.stdout('{"type":"start"}', '{"type":"complete"}');
        fs.rmSync(s.t.path("project/databricks.yml"));
        s.files.touch(s.t.path("project/databricks.yml"));
        await when(s.kernel.project.active, (p) => p === undefined);

        expect(s.syncs()[0]!.killed).toBe(true);
        expect(vscode.tasks[0]!.ended).toBe(true);
        s.kernel.dispose();
    });

    it("sets isDevTarget for a development target", async () => {
        const s = await setup();
        expect(s.contextKeys.get(IS_DEV_TARGET.name)).toBe(true);
        s.kernel.dispose();
    });
});
