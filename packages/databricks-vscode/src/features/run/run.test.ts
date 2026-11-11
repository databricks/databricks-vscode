import path from "node:path";
import type { DebugProtocol } from "@vscode/debugprotocol";
import { beforeEach, describe, expect, it } from "vitest";
import { registerFeatures, startFeatures } from "../../kernel/feature";
import { MutableState, when } from "../../platform/reactive";
import { apiCluster, FakeClusters } from "../../test-support/fakeClusters";
import { FakeCommandExecution } from "../../test-support/fakeCommandExecution";
import { fakeFeatureHost, fakeKernel } from "../../test-support/fakes";
import { FakeFileEvents } from "../../test-support/fakeFiles";
import { FakeHttpClient, SCIM_ME } from "../../test-support/fakeHttp";
import { useTempDirs } from "../../test-support/tempDir";
import {
    host as vscode,
    Uri,
    type DebugAdapterInlineImplementation,
} from "../../test-support/vscode";
import { connection } from "../connection";
import { IS_ACTIVE_FILE_IN_ACTIVE_WORKSPACE, run, SHOW_RUN_AS_WORKFLOW } from "./index";
import { RUN_EDITOR_CONTENTS, RUN_EDITOR_CONTENTS_AS_WORKFLOW } from "./RunCommands";

const A = "https://a.cloud.databricks.com";
const FILES = "/Workspace/Users/me/.bundle/demo/dev/files";
const EXTENSION = path.resolve(__dirname, "../../..");
const tempDir = useTempDirs();

/** The real kernel, connected to a project whose bundle has a cluster, with run registered. */
async function setup(options: { mode?: string; clusterState?: string } = {}) {
    const t = tempDir();
    const config = t.write(".databrickscfg", `[DEFAULT]\nhost = ${A}\ntoken = dapi-default\n`);
    t.write(
        "project/databricks.yml",
        `bundle: {name: demo}\ntargets:\n  dev: {default: true, mode: development, workspace: {host: ${A}}}\n`,
    );
    const program = t.write("project/nested/hello.py", "print('hello world')\n");
    const notebook = t.write("project/nb.py", "# Databricks notebook source\nprint(1)\n");
    const root = t.path("project");
    vscode.folders = [root];
    const http = new FakeHttpClient().on("GET", SCIM_ME, () => ({ body: { userName: "me" } }));
    new FakeClusters([apiCluster("c-1", { state: options.clusterState ?? "RUNNING" })]).install(
        http,
    );
    const commands = new FakeCommandExecution();
    commands.install(http);
    const kernel = fakeKernel({
        env: { DATABRICKS_CONFIG_FILE: config },
        httpClient: http,
        folders: new MutableState<readonly string[]>([root]),
        files: new FakeFileEvents(),
        extension: {
            id: "databricks.databricks",
            version: "2.20.0",
            logPath: "/tmp/databricks-vscode-test-logs",
            asAbsolutePath: (p) => path.join(EXTENSION, p),
            cliVersion: "1.19.0",
            isDevelopment: false,
            globalStoragePath: "/tmp/databricks-vscode-test-storage",
        },
    });
    kernel.runner.on(["bundle", "validate"], (args) => ({
        stdout: JSON.stringify({
            bundle: {
                name: "demo",
                target: args[3],
                mode: options.mode ?? "development",
                cluster_id: "c-1",
            },
            workspace: { file_path: FILES },
        }),
    }));
    kernel.runner.on(["bundle", "summary"], (args) => ({
        stdout: JSON.stringify({ bundle: { name: "demo", target: args[3] } }),
    }));
    const contextKeys = new Map<string, unknown>();
    const fake = fakeFeatureHost(kernel);
    const registered = registerFeatures([connection, run], {
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
    const exec = (command: string, ...args: unknown[]) =>
        vscode.commands.get(command)?.(...args) as Promise<unknown>;

    /** Starts a `databricks` session through its adapter, as VS Code does, and collects what it sends. */
    const session = (type: string, launch: Record<string, unknown>) => {
        const adapter = (
            vscode.debugAdapters
                .get(type)!
                .createDebugAdapterDescriptor({}) as DebugAdapterInlineImplementation
        ).implementation as {
            handleMessage(m: DebugProtocol.ProtocolMessage): void;
            onDidSendMessage(listener: (m: DebugProtocol.ProtocolMessage) => void): void;
        };
        const sent: DebugProtocol.ProtocolMessage[] = [];
        adapter.onDidSendMessage((m) => sent.push(m));
        let seq = 1;
        const request = (command: string, args: unknown) =>
            adapter.handleMessage({
                seq: seq++,
                type: "request",
                command,
                arguments: args,
            } as DebugProtocol.Request);
        request("initialize", { adapterID: type });
        request("configurationDone", {});
        request("launch", launch);
        const output = () =>
            sent
                .filter(
                    (m): m is DebugProtocol.OutputEvent =>
                        m.type === "event" && (m as DebugProtocol.Event).event === "output",
                )
                .map((e) => e.body.output);
        const terminated = () =>
            sent.some(
                (m) => m.type === "event" && (m as DebugProtocol.Event).event === "terminated",
            );
        const launchResponse = () =>
            sent.find(
                (m): m is DebugProtocol.Response =>
                    m.type === "response" && (m as DebugProtocol.Response).command === "launch",
            );
        return { request, sent, output, terminated, launchResponse };
    };
    return { kernel, http, commands, root, program, notebook, exec, contextKeys, session };
}

describe("run", () => {
    beforeEach(() => vscode.reset());

    it("registers the databricks and databricks-workflow debug adapters", async () => {
        const s = await setup();
        expect([...vscode.debugAdapters.keys()]).toEqual(["databricks", "databricks-workflow"]);
        s.kernel.dispose();
    });

    it("Upload and Run File starts a databricks session without debugging, for the active editor's file (RUN-01)", async () => {
        const s = await setup();
        vscode.activeEditor = Uri.file(s.program);
        await s.exec(RUN_EDITOR_CONTENTS);
        expect(vscode.debugSessions).toEqual([
            {
                configuration: {
                    type: "databricks",
                    name: "Upload and Run File on Databricks",
                    request: "launch",
                    program: s.program,
                },
                options: { noDebug: true },
            },
        ]);
        s.kernel.dispose();
    });

    it("sends notebooks to Run File as Workflow, and needs a file", async () => {
        const s = await setup();
        await s.exec(RUN_EDITOR_CONTENTS, Uri.file(s.notebook));
        expect(vscode.errors.map((e) => e.message)).toEqual([
            'Use "Run File as Workflow on Databricks" for running notebooks',
        ]);
        await s.exec(RUN_EDITOR_CONTENTS);
        expect(vscode.errors.at(-1)?.message).toBe("Open a file to run on Databricks");
        expect(vscode.debugSessions).toEqual([]);
        s.kernel.dispose();
    });

    it("Run File as Workflow starts a databricks-workflow session, for the explorer's file or the notebook (RUN-02)", async () => {
        const s = await setup();
        await s.exec(RUN_EDITOR_CONTENTS_AS_WORKFLOW, Uri.file(s.notebook));
        vscode.activeNotebook = Uri.file(path.join(s.root, "a.ipynb"));
        await s.exec(RUN_EDITOR_CONTENTS_AS_WORKFLOW);
        expect(
            vscode.debugSessions.map((d) => [d.configuration.type, d.configuration.program]),
        ).toEqual([
            ["databricks-workflow", s.notebook],
            ["databricks-workflow", path.join(s.root, "a.ipynb")],
        ]);
        s.kernel.dispose();
    });

    it("sets showRunAsWorkflow and isActiveFileInActiveWorkspace for the active editor", async () => {
        const s = await setup();
        const keys = () => [
            s.contextKeys.get(SHOW_RUN_AS_WORKFLOW.name),
            s.contextKeys.get(IS_ACTIVE_FILE_IN_ACTIVE_WORKSPACE.name),
        ];
        expect(keys()).toEqual([false, false]);
        vscode.activeEditor = Uri.file(s.program);
        vscode.activeEditorChanged.fire(undefined);
        await expect.poll(keys).toEqual([true, true]);
        vscode.activeEditor = Uri.file(path.join(s.root, "README.md"));
        vscode.activeEditorChanged.fire(undefined);
        await expect.poll(keys).toEqual([false, true]);
        vscode.activeEditor = Uri.file(path.join(path.sep, "elsewhere", "x.py"));
        vscode.activeEditorChanged.fire(undefined);
        await expect.poll(keys).toEqual([true, false]);
        s.kernel.dispose();
    });

    it("runs a file through the adapter: the upload toast, bundle sync, then the cluster's output in the debug console", async () => {
        const s = await setup();
        s.commands.result = {
            status: "Finished",
            results: { resultType: "text", data: "hello world" },
        };
        // The runner polls every second; these answer at once.
        s.commands.contextPolls = 0;
        s.commands.pollsUntilDone = 0;
        const session = s.session("databricks", { program: s.program });

        await expect.poll(session.terminated).toBe(true);

        expect(vscode.progress).toEqual([{ title: "Uploading bundle assets", cancellable: true }]);
        const sync = s.kernel.runner.calls.find((c) => c.args[1] === "sync")!;
        expect(sync.args).toEqual(["bundle", "sync", "--target", "dev", "--output", "text"]);
        expect(sync.options.cwd).toBe(s.root);
        expect(session.output()).toContain("hello world\n");
        expect(
            JSON.parse(
                JSON.parse(
                    s.commands.commands[0]!.command.split("\n")[0]!.split(" = ")[1]!,
                ) as string,
            ),
        ).toMatchObject({
            python_file: `${FILES}/nested/hello.py`,
            repo_path: FILES,
        });
        expect(vscode.executed.map((e) => e.command)).toContain("workbench.panel.repl.view.focus");
        s.kernel.dispose();
    });

    it("prints Cancelled when the upload toast's Cancel is clicked (the run_files spec)", async () => {
        const s = await setup();
        s.kernel.runner.on(
            ["bundle", "sync"],
            (_args, options) =>
                new Promise((resolve) =>
                    options.signal?.addEventListener("abort", () =>
                        resolve({ cancelled: true, exitCode: null }),
                    ),
                ),
        );
        const session = s.session("databricks", { program: s.program });
        await expect.poll(() => vscode.progress.length).toBe(1);

        vscode.cancelProgress();

        await expect.poll(session.terminated).toBe(true);
        expect(session.output()).toContain("Cancelled\n");
        expect(vscode.errors).toEqual([]);
        expect(s.commands.contexts).toEqual([]);
        s.kernel.dispose();
    });

    it("prompts to start a stopped cluster, and its action starts it", async () => {
        const s = await setup({ clusterState: "TERMINATED" });
        vscode.nextErrorChoice = "Start Cluster";
        const session = s.session("databricks", { program: s.program });
        await expect.poll(session.terminated).toBe(true);
        expect(vscode.errors).toEqual([
            {
                message: "The attached cluster is not running.",
                actions: ["Start Cluster", "Cancel"],
            },
        ]);
        await expect
            .poll(() => vscode.executed.map((e) => e.command))
            .toContain("databricks.cluster.start");
        s.kernel.dispose();
    });

    it.each(["databricks", "databricks-workflow"])(
        "fails a %s launch configuration without a program, and ends the session",
        async (type) => {
            const s = await setup();
            const session = s.session(type, { name: "Run on Databricks" });

            await expect.poll(session.terminated).toBe(true);

            expect(session.launchResponse()).toMatchObject({
                success: false,
                message:
                    'The launch configuration has no "program": set it to the file to run, for example "${file}".',
            });
            expect(s.kernel.runner.calls.filter((c) => c.args[1] === "sync")).toEqual([]);
            s.kernel.dispose();
        },
    );

    it("ends the session with an error when the cluster can't create an execution context", async () => {
        const s = await setup();
        s.http.on("GET", "/api/1.2/contexts/status", { body: { id: "ctx-1", status: "Error" } });
        const session = s.session("databricks", { program: s.program });

        await expect.poll(session.terminated).toBe(true);

        const message = "Error: Can't create an execution context on cluster c-1";
        expect(vscode.errors.map((e) => e.message)).toEqual([message]);
        expect(session.output().at(-1)).toBe(`${message}\n`);
        expect(
            session.sent.some(
                (m) =>
                    m.type === "event" &&
                    (m as DebugProtocol.ExitedEvent).event === "exited" &&
                    (m as DebugProtocol.ExitedEvent).body.exitCode === 1,
            ),
        ).toBe(true);
        expect(s.commands.commands).toEqual([]);
        s.kernel.dispose();
    });

    it("ends the session with the workspace's reason when the cluster stops mid-run, and destroys the context", async () => {
        const s = await setup();
        s.commands.contextPolls = 0;
        s.http.on("GET", "/api/1.2/commands/status", {
            status: 400,
            body: {
                error_code: "INVALID_STATE",
                message: "Cluster c-1 is terminated. Reason: User request",
            },
        });
        const session = s.session("databricks", { program: s.program });

        await expect.poll(session.terminated).toBe(true);

        expect(vscode.errors.map((e) => e.message)).toEqual([
            "ApiError: Cluster c-1 is terminated. Reason: User request",
        ]);
        expect(s.commands.destroyed).toEqual(["ctx-1"]);
        s.kernel.dispose();
    });

    it("refuses targets that aren't in development mode, with the old prompt", async () => {
        const s = await setup({ mode: "production" });
        const session = s.session("databricks-workflow", { program: s.program });
        await expect.poll(session.terminated).toBe(true);
        expect(vscode.errors.map((e) => [e.message, e.actions])).toEqual([
            [
                "Running is disabled for non development targets. Current target mode is production.",
                ["Change Target Mode", "Cancel"],
            ],
        ]);
        expect(s.kernel.runner.calls.filter((c) => c.args[1] === "sync")).toEqual([]);
        s.kernel.dispose();
    });
});
