import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerFeatures, startFeatures } from "../../kernel/feature";
import type { RunOptions, RunResult } from "../../platform/process";
import { MutableState, when } from "../../platform/reactive";
import { fakeFeatureHost, fakeKernel } from "../../test-support/fakes";
import { FakeFileEvents } from "../../test-support/fakeFiles";
import { FakeHttpClient, SCIM_ME } from "../../test-support/fakeHttp";
import { useTempDirs } from "../../test-support/tempDir";
import { host as vscode } from "../../test-support/vscode";
import { connection } from "../connection";
import { DEPLOY, DESTROY, FORCE_DEPLOY, FORCE_DESTROY } from "./BundleCommands";
import { bundleExplorer } from "./index";

const A = "https://a.cloud.databricks.com";
const UNIFIED = "https://unified.databricks.com";
const tempDir = useTempDirs();
const SUMMARY = JSON.stringify({ bundle: { name: "demo", target: "dev" } });
const DESTROY_WARNING =
    "Are you sure you want to destroy this bundle and all resources associated with it?";

const run = (command: string, ...args: unknown[]) => vscode.commands.get(command)?.(...args);

/** The real kernel, connected to a project whose target `dev` has the given mode. */
async function setup(options: { mode?: string; signedIn?: boolean; unified?: boolean } = {}) {
    const t = tempDir();
    // A unified host serves many workspaces: the profile names one with `workspace_id`.
    const host = options.unified ? UNIFIED : A;
    const config = t.write(
        ".databrickscfg",
        options.signedIn === false
            ? ""
            : `[DEFAULT]\nhost = ${host}\ntoken = dapi-default\n${options.unified ? "workspace_id = 1234\n" : ""}`,
    );
    const mode = options.mode === undefined ? "" : `, mode: ${options.mode}`;
    t.write(
        "project/databricks.yml",
        `bundle: {name: demo}\ntargets:\n  dev: {default: true${mode}, workspace: {host: ${host}}}\n`,
    );
    const root = t.path("project");
    vscode.folders = [root];
    const kernel = fakeKernel({
        env: { DATABRICKS_CONFIG_FILE: config },
        httpClient: new FakeHttpClient().on("GET", SCIM_ME, () => ({ body: { userName: "me" } })),
        folders: new MutableState<readonly string[]>([root]),
        files: new FakeFileEvents(),
    });
    kernel.runner.on(["bundle", "validate"], { stdout: SUMMARY });
    kernel.runner.on(["bundle", "summary"], { stdout: SUMMARY });
    const fake = fakeFeatureHost(kernel);
    const registered = registerFeatures([connection, bundleExplorer], fake.host);
    kernel.start();
    startFeatures(registered);
    await when(kernel.project.initialized, (i) => i);
    if (options.signedIn !== false) {
        await when(kernel.connection.state, (s) => s.status === "connected");
        await when(kernel.bundle.deployed, (s) => s.status === "ready");
    }
    kernel.runner.calls.length = 0;
    const operations = () =>
        kernel.runner.argv.filter((a) => a[1] === "deploy" || a[1] === "destroy");
    return { kernel, operations, run, root };
}

describe("deploy and destroy commands", () => {
    beforeEach(() => vscode.reset());

    it("registers the four commands", async () => {
        const s = await setup({ mode: "development" });
        for (const id of [DEPLOY, FORCE_DEPLOY, DESTROY, FORCE_DESTROY]) {
            expect(vscode.commands.has(id)).toBe(true);
        }
        s.kernel.dispose();
    });

    it("deploys a development target without asking, with progress on the explorer and a notification", async () => {
        const s = await setup({ mode: "development" });
        await s.run(DEPLOY);
        expect(vscode.infos).toEqual([
            {
                message: 'Deployed the bundle to target "dev".',
                actions: ["Open the workspace in a browser"],
            },
        ]);
        expect(s.operations()).toEqual([["bundle", "deploy", "--target", "dev", "--verbose"]]);
        expect(vscode.progress).toContainEqual({
            title: 'Deploying the bundle to Development target "dev".',
            cancellable: true,
        });
        expect(vscode.errors).toEqual([]);
        s.kernel.dispose();
    });

    it("links the success notification to the workspace, and says nothing when the deploy fails", async () => {
        const s = await setup({ mode: "development" });
        vscode.nextMessageChoice = "Open the workspace in a browser";
        await s.run(FORCE_DEPLOY);
        await vi.waitFor(() => expect(vscode.opened).toEqual([A]));
        expect(vscode.infos.map((i) => i.message)).toEqual([
            'Deployed the bundle to target "dev".',
        ]);

        vscode.infos.length = 0;
        s.kernel.runner.on(["bundle", "deploy"], { exitCode: 1, stderr: "Error: boom" });
        await s.run(DEPLOY);
        expect(vscode.infos).toEqual([]);
        expect(vscode.errors).toHaveLength(1);
        s.kernel.dispose();
    });

    it("opens a unified host's link on the workspace the profile names", async () => {
        const s = await setup({ mode: "development", unified: true });
        vscode.nextMessageChoice = "Open the workspace in a browser";
        await s.run(DEPLOY);
        await vi.waitFor(() => expect(vscode.opened).toEqual([`${UNIFIED}/?o=1234`]));
        s.kernel.dispose();
    });
    it("asks before deploying to any other target; declining is not an error", async () => {
        const s = await setup({ mode: "production" });
        vscode.nextMessageChoice = undefined;
        await s.run(DEPLOY);
        expect(vscode.infos).toEqual([
            { message: 'Deploying the bundle to Production target "dev".', actions: ["Continue"] },
        ]);
        expect(s.operations()).toEqual([]);
        expect(vscode.errors).toEqual([]);

        vscode.nextMessageChoice = "Continue";
        await s.run(FORCE_DEPLOY);
        expect(s.operations()).toEqual([
            ["bundle", "deploy", "--target", "dev", "--verbose", "--force-lock", "--force"],
        ]);
        s.kernel.dispose();
    });

    it("asks for a target without a mode too", async () => {
        const s = await setup();
        await s.run(DEPLOY);
        expect(vscode.infos.map((i) => i.message)).toEqual([
            'Deploying the bundle to  target "dev".',
        ]);
        expect(s.operations()).toEqual([]);
        s.kernel.dispose();
    });

    it("destroy warns first; destroy(false, false) skips the warning, as the e2e spec needs", async () => {
        const s = await setup({ mode: "development" });
        vscode.nextMessageChoice = "No";
        await s.run(DESTROY);
        expect(vscode.warnings).toEqual([
            { message: DESTROY_WARNING, actions: ["Yes, continue", "No"] },
        ]);
        expect(s.operations()).toEqual([]);

        vscode.warnings.length = 0;
        await s.run(DESTROY, false, false);
        expect(vscode.warnings).toEqual([]);
        expect(s.operations()).toEqual([
            ["bundle", "destroy", "--target", "dev", "--auto-approve"],
        ]);
        expect(vscode.progress).toContainEqual({
            title: "Destroying the bundle",
            cancellable: true,
        });

        vscode.nextMessageChoice = "Yes, continue";
        await s.run(FORCE_DESTROY);
        expect(s.operations().at(-1)).toEqual([
            "bundle",
            "destroy",
            "--target",
            "dev",
            "--auto-approve",
            "--force-lock",
        ]);
        s.kernel.dispose();
    });

    it("renders a CLI failure once, with the old wording and Show Logs", async () => {
        const s = await setup({ mode: "development" });
        s.kernel.runner.on(["bundle", "deploy"], { exitCode: 1, stderr: "Error: boom" });
        await s.run(DEPLOY);
        expect(vscode.errors).toEqual([
            {
                message: "Error deploying bundle. Error executing Databricks CLI command.",
                actions: ["Show Logs"],
            },
        ]);

        s.kernel.runner.on(["bundle", "destroy"], {
            exitCode: 1,
            stderr: 'Error: no value assigned to required variable "x"',
        });
        await s.run(DESTROY, false, false);
        expect(vscode.errors.at(-1)).toEqual({
            message: "Error destroying bundle. No value assigned to required variables.",
            actions: ["Assign Values"],
        });
        s.kernel.dispose();
    });

    it("cancelling the notification kills the CLI silently", async () => {
        const s = await setup({ mode: "development" });
        let signal: AbortSignal | undefined;
        s.kernel.runner.on(["bundle", "deploy"], (_args, options: RunOptions) => {
            signal = options.signal;
            return new Promise<Partial<RunResult>>((resolve) =>
                options.signal?.addEventListener("abort", () =>
                    resolve({ cancelled: true, exitCode: null }),
                ),
            );
        });
        const deploying = s.run(DEPLOY);
        await when(s.kernel.bundle.operations.busy, (b) => b);
        // Cancel once the CLI is running.
        await vi.waitFor(() => expect(signal).toBeDefined());
        vscode.cancelProgress();
        await deploying;
        expect(signal?.aborted).toBe(true);
        expect(vscode.errors).toEqual([]);
        expect(s.kernel.bundle.operations.busy.value).toBe(false);
        s.kernel.dispose();
    });

    it("says nothing when a destroy on another target is declined in the warning", async () => {
        const s = await setup({ mode: "production" });
        vscode.nextMessageChoice = "No";
        await s.run(DESTROY);
        expect(vscode.warnings.map((w) => w.message)).toEqual([DESTROY_WARNING]);
        expect(s.operations()).toEqual([]);
        expect(vscode.infos).toEqual([]);
        s.kernel.dispose();
    });

    it("says when a destroy succeeds, and says nothing when it fails or is cancelled", async () => {
        const s = await setup({ mode: "development" });
        await s.run(DESTROY, false, false);
        await vi.waitFor(() =>
            expect(vscode.infos).toEqual([
                { message: 'Destroyed the bundle in target "dev".', actions: [] },
            ]),
        );

        vscode.infos.length = 0;
        s.kernel.runner.on(["bundle", "destroy"], { exitCode: 1, stderr: "Error: boom" });
        await s.run(DESTROY, false, false);
        expect(vscode.infos).toEqual([]);
        expect(vscode.errors).toHaveLength(1);

        vscode.errors.length = 0;
        let running = false;
        s.kernel.runner.on(["bundle", "destroy"], (_args, options: RunOptions) => {
            running = true;
            return new Promise<Partial<RunResult>>((resolve) =>
                options.signal?.addEventListener("abort", () =>
                    resolve({ cancelled: true, exitCode: null }),
                ),
            );
        });
        const destroying = s.run(DESTROY, false, false);
        await when(s.kernel.bundle.operations.busy, (b) => b);
        // Cancel once the CLI is running.
        await vi.waitFor(() => expect(running).toBe(true));
        vscode.cancelProgress();
        await destroying;
        expect(vscode.infos).toEqual([]);
        expect(vscode.errors).toEqual([]);
        s.kernel.dispose();
    });

    it("needs a sign-in", async () => {
        const s = await setup({ mode: "development", signedIn: false });
        await s.run(DESTROY, false, false);
        expect(vscode.errors.map((e) => e.message)).toEqual(["Sign in to Databricks first."]);
        expect(s.operations()).toEqual([]);
        s.kernel.dispose();
    });
});
