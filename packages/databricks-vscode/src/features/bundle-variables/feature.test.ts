import fs from "node:fs";
import { TreeItemCollapsibleState } from "vscode";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerFeatures, startFeatures } from "../../kernel/feature";
import type { RunOptions } from "../../platform/process";
import { MutableState, when } from "../../platform/reactive";
import { fakeFeatureHost, fakeKernel } from "../../test-support/fakes";
import { FakeFileEvents } from "../../test-support/fakeFiles";
import { FakeHttpClient, SCIM_ME } from "../../test-support/fakeHttp";
import { useTempDirs } from "../../test-support/tempDir";
import { host as vscode, Uri } from "../../test-support/vscode";
import { PROJECT_VIEW } from "../../kernel/project/commands";
import { nodeOfRow } from "../../platform/ui/nodeGroup";
import { configurationView } from "../configuration-view";
import type { ConfigurationTreeDataProvider } from "../configuration-view/ConfigurationTreeDataProvider";
import { SERVERLESS_SESSION } from "../../test-support/sessionEnv";
import { connection } from "../connection";
import { bundleVariables } from "./index";
import type { VariableNode } from "./nodes";

/*
 * Ported from the old `BundleVariableModel.test.ts`, against the real kernel
 * and a scripted CLI whose `bundle validate` resolves `BUNDLE_VAR_*` the way
 * the real one does.
 */

const A = "https://a.cloud.databricks.com";
const OPEN_FILE = "databricks.bundle.variable.openFile";
const RESET = "databricks.bundle.variable.reset";
const tempDir = useTempDirs();
const BUNDLE = `bundle: {name: demo}
variables:
  foo: {default: default}
  req: {description: required, no default}
targets:
  dev: {default: true, workspace: {host: ${A}}, variables: {foo: dev}}
`;

async function setup(options: { session?: boolean; signedOut?: boolean } = {}) {
    const t = tempDir();
    const config = t.write(".databrickscfg", `[DEFAULT]\nhost = ${A}\ntoken = dapi-default\n`);
    // Without a profile there's no connection, so nothing validates.
    const configFile = options.signedOut ? t.path("missing.databrickscfg") : config;
    t.write("project/databricks.yml", BUNDLE);
    const root = t.path("project");
    const varsFile = t.path("project/.databricks/bundle/dev/vscode.bundlevars.json");
    vscode.folders = [root];
    const files = new FakeFileEvents();
    const kernel = fakeKernel({
        env: { DATABRICKS_CONFIG_FILE: configFile },
        httpClient: new FakeHttpClient().on("GET", SCIM_ME, () => ({ body: { userName: "me" } })),
        folders: new MutableState<readonly string[]>([root]),
        files,
        ...(options.session ? { host: SERVERLESS_SESSION } : {}),
    });
    const validateEnvs: Record<string, string | undefined>[] = [];
    let requiredValue: string | undefined = "x";
    kernel.runner.on(["bundle", "validate"], (_args, options: RunOptions) => {
        const env = options.env ?? {};
        validateEnvs.push(env);
        const req = env.BUNDLE_VAR_req ?? requiredValue;
        if (req === undefined) {
            return { exitCode: 1, stderr: 'Error: no value assigned to required variable "req"' };
        }
        const foo = env.BUNDLE_VAR_foo ?? "dev";
        return {
            stdout: JSON.stringify({
                bundle: { name: "demo", target: "dev" },
                variables: {
                    foo: { default: foo, value: foo },
                    req: { description: "required, no default", value: req },
                },
            }),
        };
    });
    const fake = fakeFeatureHost(kernel);
    const registered = registerFeatures(
        [connection, configurationView, bundleVariables],
        fake.host,
    );
    kernel.start();
    startFeatures(registered);
    await when(kernel.project.initialized, (i) => i);
    if (!options.signedOut) {
        await when(kernel.connection.state, (s) => s.status === "connected");
        await when(kernel.bundle.validated, (s) => s.status === "ready");
    }
    // The variables are the Variables group of the Project view.
    const project = vscode.treeDataProviders.get(PROJECT_VIEW) as ConfigurationTreeDataProvider;
    let changes = 0;
    project.onDidChangeTreeData(() => changes++);
    /** "label: description", with the children's in brackets. */
    const rows = async () => {
        const [group] = await project.getChildren();
        if (group === undefined) {
            return [];
        }
        const out: string[] = [];
        for (const row of await project.getChildren(group)) {
            const node = nodeOfRow(row) as VariableNode;
            const children = (await project.getChildren(row)).map((c) => {
                const label = typeof c.label === "string" ? c.label : c.label?.label;
                return `${label}: ${String(c.description)}`;
            });
            const description = String(row.description ?? "");
            out.push(
                `${node.name}: ${description}${children.length ? ` [${children.join(", ")}]` : ""}`,
            );
        }
        return out;
    };
    const settle = async () => {
        await kernel.project.settled();
        await new Promise((r) => setTimeout(r, 80));
        await kernel.bundle.validated.settled();
    };
    /** `settle`, then `check`, until it passes: the file watcher, the project and validate each run on timers the Windows runner can wake late. */
    const settleUntil = (check: () => unknown) =>
        vi.waitFor(async () => {
            await settle();
            await check();
        });
    return {
        t,
        kernel,
        files,
        varsFile,
        validateEnvs,
        rows,
        settle,
        settleUntil,
        changes: () => changes,
        /** The Variables group's own change event, which only its refresh fires. */
        groupChanges: (listener: () => void) => {
            const group = registered
                .map((r) => r.ctx.sections.list().find((x) => x.id === "bundleVariables"))
                .find((x) => x !== undefined);
            return group?.onDidChange?.(listener);
        },
        setRequired: (v?: string) => (requiredValue = v),
        ...fake,
    };
}

describe("the bundle variables feature", () => {
    beforeEach(() => vscode.reset());

    it("shows the Variables group collapsed, with the row the inline buttons match", async () => {
        const s = await setup();
        const project = vscode.treeDataProviders.get(PROJECT_VIEW) as ConfigurationTreeDataProvider;
        const [group] = await project.getChildren();
        expect(project.getTreeItem(group!)).toMatchObject({
            label: "Variables",
            contextValue: "databricks.configuration.group.variables",
            collapsibleState: TreeItemCollapsibleState.Collapsed,
        });
        s.kernel.dispose();
    });

    it("registers the Variables group and both commands", async () => {
        const s = await setup();
        expect(vscode.treeDataProviders.has("dabsVariableView")).toBe(false);
        expect(vscode.commands.has(OPEN_FILE)).toBe(true);
        expect(vscode.commands.has(RESET)).toBe(true);
        expect(await s.rows()).toEqual(["foo: dev [Default: default]", "req: x [Default: x]"]);
        s.kernel.dispose();
    });

    it("creates the file with {} and opens it, without rewriting an existing one", async () => {
        const s = await setup();
        await vscode.commands.get(OPEN_FILE)?.();
        expect(vscode.shownDocuments).toEqual([s.varsFile]);
        expect(fs.readFileSync(s.varsFile, "utf-8")).toBe("{}");

        fs.writeFileSync(s.varsFile, '{"foo":  "kept"}');
        await vscode.commands.get(OPEN_FILE)?.();
        expect(fs.readFileSync(s.varsFile, "utf-8")).toBe('{"foo":  "kept"}');
        expect(vscode.errors).toEqual([]);
        s.kernel.dispose();
    });

    it("picks up overrides saved from an editor, without the watcher, and validates with them", async () => {
        const s = await setup();
        const validates = s.validateEnvs.length;
        fs.mkdirSync(s.t.path("project/.databricks/bundle/dev"), { recursive: true });
        fs.writeFileSync(s.varsFile, JSON.stringify({ foo: "override" }));
        vscode.documentSaved.fire({ uri: Uri.file(s.varsFile) });
        await vi.waitFor(() =>
            expect(s.kernel.project.variables.value).toEqual({ foo: "override" }),
        );
        // Shown at once, before validate has resolved it.
        expect((await s.rows())[0]).toBe("foo: override [Default: default]");
        await s.settleUntil(() =>
            expect(s.validateEnvs.slice(validates).map((e) => e.BUNDLE_VAR_foo)).toEqual([
                "override",
            ]),
        );
        expect(await s.rows()).toEqual(["foo: override [Default: default]", "req: x [Default: x]"]);
        // Validate never rewrites the file.
        expect(fs.readFileSync(s.varsFile, "utf-8")).toBe(JSON.stringify({ foo: "override" }));
        s.kernel.dispose();
    });

    it("ignores saves of other files", async () => {
        const s = await setup();
        const validates = s.validateEnvs.length;
        const other = s.t.write("project/other.json", JSON.stringify({ foo: "other" }));
        vscode.documentSaved.fire({ uri: Uri.file(other) });
        await s.settle();
        expect(s.validateEnvs.length).toBe(validates);
        expect(s.kernel.project.variables.value).toEqual({});
        s.kernel.dispose();
    });

    it("picks up overrides edited outside VS Code through the watcher", async () => {
        const s = await setup();
        s.t.write(
            "project/.databricks/bundle/dev/vscode.bundlevars.json",
            JSON.stringify({ foo: "outside" }),
        );
        s.files.touch(s.varsFile);
        await vi.waitFor(() =>
            expect(s.kernel.project.variables.value).toEqual({ foo: "outside" }),
        );
        s.kernel.dispose();
    });

    it("drops the overrides on reset, refreshing the view directly", async () => {
        const s = await setup();
        s.t.write(
            "project/.databricks/bundle/dev/vscode.bundlevars.json",
            JSON.stringify({ foo: "override" }),
        );
        await s.kernel.project.reloadTargetFiles();
        await s.settleUntil(async () =>
            expect((await s.rows())[0]).toBe("foo: override [Default: default]"),
        );
        const changes = s.changes();

        await vscode.commands.get(RESET)?.();
        expect(fs.existsSync(s.varsFile)).toBe(false);
        expect(s.kernel.project.variables.value).toEqual({});
        expect(s.changes()).toBeGreaterThan(changes);
        await s.settleUntil(async () =>
            expect(await s.rows()).toEqual(["foo: dev [Default: default]", "req: x [Default: x]"]),
        );
        expect(vscode.errors).toEqual([]);
        s.kernel.dispose();
    });

    // A required variable set only in the override file has no value once the
    // file is deleted, so `bundle validate` fails.
    it("still drops a required override on reset without an error popup", async () => {
        const s = await setup();
        s.setRequired(undefined);
        s.t.write(
            "project/.databricks/bundle/dev/vscode.bundlevars.json",
            JSON.stringify({ req: "from file" }),
        );
        await s.kernel.project.reloadTargetFiles();
        await s.settleUntil(async () =>
            expect((await s.rows())[1]).toBe("req: from file [Default: from file]"),
        );

        await vscode.commands.get(RESET)?.();
        await s.settleUntil(() => expect(s.kernel.bundle.validated.value.status).toBe("error"));
        expect(fs.existsSync(s.varsFile)).toBe(false);
        expect(vscode.errors).toEqual([]);
        s.kernel.dispose();
    });

    it("lists an override of a name the bundle doesn't declare, with no default row", async () => {
        const s = await setup();
        s.t.write(
            "project/.databricks/bundle/dev/vscode.bundlevars.json",
            JSON.stringify({ ghost: "boo" }),
        );
        await s.kernel.project.reloadTargetFiles();
        await s.settleUntil(async () =>
            expect(await s.rows()).toEqual([
                "foo: dev [Default: default]",
                "req: x [Default: x]",
                "ghost: boo (not in the bundle)",
            ]),
        );
        s.kernel.dispose();
    });

    it("shows the bundle's variables, with the overrides, before validate has run", async () => {
        const s = await setup();
        s.kernel.bundle.validated.reset();
        s.t.write(
            "project/.databricks/bundle/dev/vscode.bundlevars.json",
            JSON.stringify({ foo: "early" }),
        );
        await s.kernel.project.reloadTargetFiles();
        // The YAML's variables, without values until validate resolves them.
        expect(await s.rows()).toEqual(["foo: early [Default: default]", "req: "]);
        s.kernel.dispose();
    });

    it("lists a variable added to the YAML while signed out, with no validate", async () => {
        const s = await setup({ signedOut: true });
        expect(await s.rows()).toEqual(["foo: ", "req: "]);
        const before = s.changes();
        s.t.write(
            "project/databricks.yml",
            BUNDLE.replace("variables:\n", "variables:\n  extra: {default: e}\n"),
        );
        s.files.touch(s.t.path("project/databricks.yml"));
        // The view must be told to refresh: the rows alone would be read fresh.
        await vi.waitFor(() => expect(s.changes()).toBeGreaterThan(before));
        expect(await s.rows()).toEqual(["extra: ", "foo: ", "req: "]);
        expect(s.validateEnvs).toEqual([]);
        s.kernel.dispose();
    });

    it("refreshes the Variables group itself when the YAML changes, not only the Project view", async () => {
        const s = await setup({ signedOut: true });
        let refreshes = 0;
        s.groupChanges(() => refreshes++);
        s.t.write(
            "project/databricks.yml",
            BUNDLE.replace("variables:\n", "variables:\n  extra: {default: e}\n"),
        );
        s.files.touch(s.t.path("project/databricks.yml"));
        await vi.waitFor(() => expect(refreshes).toBeGreaterThan(0));
        s.kernel.dispose();
    });

    it("shows the overrides in a session window", async () => {
        const s = await setup({ session: true, signedOut: true });
        s.t.write(
            "project/.databricks/bundle/dev/vscode.bundlevars.json",
            JSON.stringify({ ghost: "boo" }),
        );
        await s.kernel.project.reloadTargetFiles();
        expect(await s.rows()).toEqual(["foo: ", "req: ", "ghost: boo (not in the bundle)"]);
        s.kernel.dispose();
    });

    it("says why when there's no target", async () => {
        const s = await setup();
        s.t.write(
            "project/databricks.yml",
            BUNDLE.replace("dev: {default: true,", "dev: {") + "  prod: {}\n",
        );
        s.files.touch(s.t.path("project/databricks.yml"));
        await vi.waitFor(() => expect(s.kernel.project.target.value).toBeUndefined());
        await vscode.commands.get(OPEN_FILE)?.();
        expect(vscode.errors.map((e) => e.message)).toEqual([
            "Unable to open bundle variable file. No target selected.",
        ]);
        s.kernel.dispose();
    });
});
