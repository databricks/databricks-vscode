/**
 * A bundle project's lifecycle through every feature on the real kernel:
 * a bundle whose target the user must pick, a root file deleted while the
 * project is active, and a bundle in the second workspace folder.
 */
import fs from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FEATURES } from "../../features";
import { registerFeatures, startFeatures } from "../../kernel/feature";
import { ContextKeys } from "../../platform/contextKeys";
import { MutableState, when } from "../../platform/reactive";
import { FakeFileEvents } from "../../test-support/fakeFiles";
import { fakeFeatureHost, fakeKernel } from "../../test-support/fakes";
import { FakeHttpClient, SCIM_ME } from "../../test-support/fakeHttp";
import { useTempDirs } from "../../test-support/tempDir";
import { host as vscode } from "../../test-support/vscode";

// It loads `vscode` itself, which exists only in the host.
vi.mock("@vscode/extension-telemetry", () => ({
    TelemetryReporter: class {
        sendTelemetryEvent() {}
        sendTelemetryErrorEvent() {}
        dispose() {
            return Promise.resolve();
        }
    },
}));

const HOST = "https://a.cloud.databricks.com";
const FILE_PATH = "/Workspace/Users/me/.bundle/demo/dev/files";
const tempDir = useTempDirs();

interface TreeProvider {
    getChildren(element?: unknown): unknown[] | Promise<unknown[]>;
    getTreeItem(element: unknown): {
        label?: unknown;
        description?: unknown;
        contextValue?: unknown;
        command?: unknown;
    };
}

/** The real features and kernel over a temp folder, with `yaml` as `project/databricks.yml`. */
function world(yaml: string, options: { secondFolder?: boolean } = {}) {
    const t = tempDir();
    const config = t.write(".databrickscfg", `[DEFAULT]\nhost = ${HOST}\ntoken = dapi-default\n`);
    t.write("other/README.md", "");
    const file = t.write("project/databricks.yml", yaml);
    const root = t.path("project");
    const folders = options.secondFolder ? [t.path("other"), root] : [root];
    vscode.folders = folders;
    const files = new FakeFileEvents();
    const http = new FakeHttpClient().on("GET", SCIM_ME, () => ({ body: { userName: "me" } }));
    const keys = new Map<string, unknown>();
    const kernel = fakeKernel({
        env: { DATABRICKS_CONFIG_FILE: config },
        httpClient: http,
        folders: new MutableState<readonly string[]>(folders),
        files,
        contextKeys: new ContextKeys(async (name, value) => void keys.set(name, value)),
    });
    kernel.runner.on(["bundle", "validate"], (args) => ({
        stdout: JSON.stringify({
            bundle: { name: "demo", target: args[3], mode: "development" },
            workspace: { host: HOST, file_path: FILE_PATH },
        }),
    }));
    kernel.runner.on(["bundle", "summary"], (args) => ({
        stdout: JSON.stringify({
            bundle: { name: "demo", target: args[3] },
            resources: { jobs: { etl: { name: "ETL", id: "1" } } },
        }),
    }));
    const fake = fakeFeatureHost(kernel);
    const registered = registerFeatures(FEATURES, fake.host);
    kernel.start();
    startFeatures(registered);
    /** The top-level rows of a view. */
    const rows = async (view: string) => {
        const provider = vscode.treeDataProviders.get(view) as TreeProvider;
        return Promise.all(
            (await provider.getChildren()).map((c) => Promise.resolve(provider.getTreeItem(c))),
        );
    };
    const labels = async (view: string) =>
        (await rows(view)).map((r) =>
            typeof r.label === "string" ? r.label : (r.label as { label: string }).label,
        );
    const run = (id: string, ...args: unknown[]) => vscode.commands.get(id)!(...args);
    /** Waits for the project's file watcher (500 ms) and whatever its pass starts. */
    const afterFileEvent = async () => {
        await new Promise((r) => setTimeout(r, 700));
        await kernel.project.settled();
        await kernel.bundle.validated.settled();
        await kernel.bundle.deployed.settled();
    };
    const bundleCalls = () => kernel.runner.argv.filter((a) => a[0] === "bundle");
    const dispose = () => {
        for (const { ctx } of registered.toReversed()) {
            ctx.subscriptions.toReversed().forEach((s) => s.dispose());
        }
        kernel.dispose();
    };
    return {
        t,
        root,
        file,
        kernel,
        files,
        keys,
        rows,
        labels,
        run,
        afterFileEvent,
        bundleCalls,
        dispose,
    };
}

describe("a bundle project through every feature", () => {
    beforeEach(() => vscode.reset());

    it("offers the target picker for several targets and no default, and connects to the one picked", async () => {
        const w = world(
            `bundle: {name: demo}\ntargets:\n  dev: {mode: development, workspace: {host: ${HOST}}}\n  prod: {mode: production, workspace: {host: ${HOST}}}\n`,
        );
        await when(w.kernel.project.initialized, (i) => i);
        await when(w.kernel.connection.state, (s) => s.status === "signedOut");
        await vi.waitFor(() => {
            expect(w.kernel.connection.state.value).toMatchObject({
                status: "signedOut",
                reason: "No target is selected.",
            });
            expect(w.keys.get("databricks.context.initialized")).toBe(true);
        });
        expect(w.keys.get("databricks.context.bundle.isTargetSet")).toBe(false);
        // Nothing asks to sign in yet: the target comes first, as in the old view.
        expect(await w.rows("configurationView")).toMatchObject([
            {
                label: "Local Folder",
                command: { command: "databricks.bundle.selectActiveProjectFolder" },
            },
            {
                label: { label: "Select a bundle target" },
                contextValue: "databricks.configuration.target.none",
                command: { command: "databricks.connection.bundle.selectTarget" },
            },
        ]);
        expect(await w.labels("configurationView")).not.toContain("Resources");
        expect(w.bundleCalls()).toEqual([]);

        let offered: string[] = [];
        vscode.pickFrom = (items) => {
            offered = items.map((i) => i.label);
            return items.find((i) => i.label === "prod");
        };
        await w.run("databricks.connection.bundle.selectTarget");
        expect(offered).toEqual(["dev", "prod"]);
        await when(w.kernel.connection.state, (s) => s.status === "connected");
        await when(w.kernel.bundle.deployed, (s) => s.status === "ready");
        expect(w.bundleCalls().map((a) => a.slice(0, 4))).toEqual([
            ["bundle", "validate", "--target", "prod"],
            ["bundle", "summary", "--target", "prod"],
        ]);
        expect(w.keys.get("databricks.context.bundle.isTargetSet")).toBe(true);
        expect(await w.labels("configurationView")).toEqual(
            expect.arrayContaining(["Local Folder", "Target"]),
        );
        expect(await w.labels("configurationView")).not.toContain("Auth Type");
        expect(await w.labels("signInView")).toContain("Workspace connection");
        expect(await w.labels("configurationView")).toContain("Resources");
        expect(vscode.errors).toEqual([]);
        w.dispose();
    });

    it("picks a target first, then carries on with the sign-in, when signing in before one is chosen", async () => {
        const w = world(
            `bundle: {name: demo}\ntargets:\n  dev: {mode: development, workspace: {host: ${HOST}}}\n  prod: {mode: production, workspace: {host: ${HOST}}}\n`,
        );
        await when(w.kernel.connection.state, (s) => s.status === "signedOut");
        // The Workspace file system view's welcome offers "Sign in to Databricks" while signed out.
        const offered: string[][] = [];
        vscode.pickFrom = (items) => {
            offered.push(items.map((i) => i.label));
            // The target picker is the first pick; the wizard that follows is left open.
            return offered.length === 1 ? items.find((i) => i.label === "dev") : undefined;
        };
        const signIn = w.run("databricks.connection.configureLogin");
        // The sign-in goes on to the wizard for the target's host, with no error first.
        await vi.waitFor(() => expect(vscode.quickInputs.length).toBeGreaterThan(0));
        expect(vscode.errors).toEqual([]);
        expect(offered).toEqual([["dev", "prod"]]);
        expect(w.kernel.project.target.value).toBe("dev");
        vscode.quickInputs[vscode.quickInputs.length - 1]!.hide();
        await signIn;
        w.dispose();
    });

    it("does nothing when the target picker is dismissed before a target is chosen", async () => {
        const w = world(
            `bundle: {name: demo}\ntargets:\n  dev: {mode: development, workspace: {host: ${HOST}}}\n  prod: {mode: production, workspace: {host: ${HOST}}}\n`,
        );
        await when(w.kernel.connection.state, (s) => s.status === "signedOut");
        vscode.pickFrom = () => undefined;
        await w.run("databricks.connection.configureLogin");
        expect(vscode.errors).toEqual([]);
        expect(vscode.quickInputs).toEqual([]);
        expect(w.kernel.project.target.value).toBeUndefined();
        w.dispose();
    });

    it("drops the project when databricks.yml is deleted: the views empty, sync stops, and the bundle commands refuse", async () => {
        const w = world(
            `bundle: {name: demo}\ntargets:\n  dev: {default: true, mode: development, workspace: {host: ${HOST}}}\n`,
        );
        await when(w.kernel.connection.state, (s) => s.status === "connected");
        await when(w.kernel.bundle.deployed, (s) => s.status === "ready");
        await w.run("databricks.sync.start");
        await vi.waitFor(() =>
            expect(w.kernel.runner.started.map((p) => p.args.slice(0, 2))).toEqual([
                ["bundle", "sync"],
            ]),
        );
        const [syncProcess] = w.kernel.runner.started;
        expect(await w.labels("configurationView")).toContain("Resources");
        expect(await w.labels("configurationView")).toContain("Remote Folder");

        fs.rmSync(w.file);
        w.files.touch(w.file);
        await w.afterFileEvent();
        expect(w.kernel.project.active.value).toBeUndefined();
        expect(w.kernel.project.root.value).toBe(w.root);
        expect(w.keys.get("databricks.context.bundle.isTargetSet")).toBe(false);
        // No rows, so the "not detected" welcome content shows.
        expect(await w.rows("configurationView")).toEqual([]);
        expect(w.kernel.bundle.validated.value).toEqual({ status: "idle" });
        expect(w.kernel.bundle.deployed.value).toEqual({ status: "idle" });
        expect(syncProcess!.killed).toBe(true);
        expect(vscode.tasks.map((t) => t.ended)).toEqual([true]);

        const before = w.bundleCalls().length;
        for (const id of [
            "databricks.bundle.deploy",
            "databricks.bundle.destroy",
            "databricks.sync.start",
            "databricks.bundle.deployAndRunJob",
        ]) {
            await w.run(id);
        }
        expect(vscode.errors.map((e) => e.message)).toEqual(
            Array(4).fill("Open a Databricks project first."),
        );
        expect(w.bundleCalls().length).toBe(before);
        w.dispose();
    });

    it("finds no project in the first workspace folder, and activates the bundle in the second one when it's picked", async () => {
        const w = world(
            `bundle: {name: demo}\ntargets:\n  dev: {default: true, mode: development, workspace: {host: ${HOST}}}\n`,
            {
                secondFolder: true,
            },
        );
        await when(w.kernel.project.initialized, (i) => i);
        await vi.waitFor(() => expect(w.kernel.project.root.value).toBe(w.t.path("other")));
        expect(w.kernel.project.active.value).toBeUndefined();
        // "No bundle (databricks.yml) was found", not "Choose a project": the second folder isn't searched.
        expect(w.keys.get("databricks.context.subProjectsAvailable")).toBe(false);
        expect(await w.rows("configurationView")).toEqual([]);

        vscode.nextOpenDialog = w.root;
        await w.run("databricks.bundle.selectActiveProjectFolder");
        expect(w.kernel.project.active.value?.root).toBe(w.root);
        await when(w.kernel.bundle.validated, (s) => s.status === "ready");
        expect(w.kernel.runner.calls.find((c) => c.args[1] === "validate")?.options.cwd).toBe(
            w.root,
        );
        expect(await w.labels("configurationView")).toEqual(
            expect.arrayContaining(["Local Folder", "Target"]),
        );
        // A folder of this window is activated in place, not opened.
        expect(vscode.executed.map((e) => e.command)).not.toContain("vscode.openFolder");
        w.dispose();
    });
});

describe("the target's files, as the CLI receives them", () => {
    beforeEach(() => vscode.reset());

    const YAML = `bundle: {name: demo}\ntargets:\n  dev: {default: true, mode: development, workspace: {host: ${HOST}}}\n`;

    /** The project with `files` written below `.databricks/bundle/`, once validate has run. */
    async function validatedWith(files: Record<string, string>) {
        const w = world(YAML);
        for (const [name, content] of Object.entries(files)) {
            w.t.write(`project/.databricks/bundle/${name}`, content);
        }
        await when(w.kernel.connection.state, (s) => s.status === "connected");
        await when(w.kernel.bundle.validated, (s) => s.status === "ready");
        const env = w.kernel.runner.calls.find((c) => c.args[1] === "validate")!.options.env!;
        const bundleVars = Object.fromEntries(
            Object.entries(env).filter(([k]) => k.startsWith("BUNDLE_VAR_")),
        );
        return { w, env, bundleVars };
    }

    it("passes each string, number and boolean override as BUNDLE_VAR_<name>, as written, and skips the rest", async () => {
        const { w, bundleVars } = await validatedWith({
            "dev/vscode.bundlevars.json": JSON.stringify({
                "catalog": "main",
                "count": 3,
                "flag": false,
                "my-var": "hyphen",
                "multi": "line 1\nline 2",
                "quoted": `it's "x" $HOME`,
                "empty": "",
                "nothing": null,
                "object": { a: 1 },
                "list": ["x"],
            }),
            "prod/vscode.bundlevars.json": JSON.stringify({ catalog: "prod_catalog" }),
        });
        expect(bundleVars).toEqual({
            "BUNDLE_VAR_catalog": "main",
            "BUNDLE_VAR_count": "3",
            "BUNDLE_VAR_flag": "false",
            "BUNDLE_VAR_my-var": "hyphen",
            "BUNDLE_VAR_multi": "line 1\nline 2",
            "BUNDLE_VAR_quoted": `it's "x" $HOME`,
        });
        w.dispose();
    });

    it("passes no overrides for a target without a variables file, or with one that isn't JSON", async () => {
        const other = await validatedWith({
            "prod/vscode.bundlevars.json": JSON.stringify({ catalog: "prod_catalog" }),
        });
        expect(other.bundleVars).toEqual({});
        other.w.dispose();

        vscode.reset();
        const broken = await validatedWith({ "dev/vscode.bundlevars.json": '{"catalog": "main",' });
        expect(broken.bundleVars).toEqual({});
        expect(vscode.errors).toEqual([]);
        broken.w.dispose();
    });

    it("connects and validates without a cluster when vscode.overrides.json isn't JSON or holds the wrong types", async () => {
        const broken = await validatedWith({
            "dev/vscode.overrides.json": '{"authProfile": "DEFAULT", "clusterId": ',
        });
        expect(broken.env.DATABRICKS_CONFIG_PROFILE).toBe("DEFAULT");
        expect(broken.env).not.toHaveProperty("DATABRICKS_CLUSTER_ID");
        broken.w.dispose();

        vscode.reset();
        const wrong = await validatedWith({
            "dev/vscode.overrides.json": JSON.stringify({
                authProfile: 5,
                clusterId: { id: "c-1" },
                useClusterOverride: "yes",
                serverless: "true",
            }),
        });
        expect(wrong.env.DATABRICKS_CONFIG_PROFILE).toBe("DEFAULT");
        expect(wrong.env).not.toHaveProperty("DATABRICKS_CLUSTER_ID");
        expect(vscode.errors).toEqual([]);
        wrong.w.dispose();
    });
});
