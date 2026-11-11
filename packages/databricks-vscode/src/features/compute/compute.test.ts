import fs from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ThemeIcon } from "vscode";
import {
    ATTACH_CLUSTER_QUICK_PICK,
    SELECT_SERVERLESS_VERSION,
} from "../../kernel/compute/commands";
import { registerFeatures, startFeatures } from "../../kernel/feature";
import { detectHost } from "../../kernel/host";
import { MutableState, when } from "../../platform/reactive";
import type { ConfigurationItem } from "../../platform/ui/sections";
import { apiCluster, FakeClusters } from "../../test-support/fakeClusters";
import { fakeFeatureHost, fakeKernel, fakeSettings } from "../../test-support/fakes";
import { FakeFileEvents } from "../../test-support/fakeFiles";
import { FakeHttpClient, SCIM_ME } from "../../test-support/fakeHttp";
import {
    DEDICATED_CLUSTER_ID,
    DEDICATED_SESSION_ENV,
    SERVERLESS_CLUSTER_ID,
    SERVERLESS_SESSION_ENV,
    SESSION_HOST,
    SESSION_REMOTE_NAME,
} from "../../test-support/sessionEnv";
import { useTempDirs } from "../../test-support/tempDir";
import {
    host as vscode,
    TreeItemCheckboxState,
    type FakeQuickInput,
} from "../../test-support/vscode";
import { configurationView } from "../configuration-view";
import { connection } from "../connection";
import { CLUSTER_OVERRIDE_CHECKBOX_ID } from "./ClusterSection";
import { CREATE_CLUSTER_LABEL, SERVERLESS_LABEL } from "./ComputePicker";
import { ClusterNode, COMPUTE_VIEW } from "./ComputeView";
import {
    ATTACH_CLUSTER,
    CLUSTER_START,
    CLUSTER_STOP,
    compute,
    DETACH_CLUSTER,
    SERVERLESS,
    SHOW_COMPUTE_VIEW,
    STOP_SESSION_CLUSTER,
} from "./index";

/* eslint-disable @typescript-eslint/naming-convention */

const A = "https://a.cloud.databricks.com";
const tempDir = useTempDirs();

function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((r) => (resolve = r));
    return { promise, resolve };
}

/** The real kernel, connected to a project with a development and a production target, with compute registered. */
async function setup(
    options: {
        overrides?: Record<string, unknown>;
        settings?: Record<string, unknown>;
        serverlessAuto?: boolean;
    } = {},
) {
    const t = tempDir();
    const config = t.write(
        ".databrickscfg",
        `[DEFAULT]\nhost = ${A}\ntoken = dapi-default\n${options.serverlessAuto ? "serverless_compute_id = auto\n" : ""}`,
    );
    t.write(
        "project/databricks.yml",
        `bundle: {name: demo}\ntargets:\n  dev: {default: true, mode: development, workspace: {host: ${A}}}\n  prod: {mode: production, workspace: {host: ${A}}}\n`,
    );
    if (options.overrides !== undefined) {
        t.write(
            "project/.databricks/bundle/dev/vscode.overrides.json",
            JSON.stringify(options.overrides),
        );
    }
    const root = t.path("project");
    vscode.folders = [root];
    const http = new FakeHttpClient().on("GET", SCIM_ME, () => ({ body: { userName: "me" } }));
    const clusters = new FakeClusters([
        apiCluster("c-2", {
            cluster_name: "b-stopped",
            state: "TERMINATED",
            creator_user_name: "someone",
        }),
        apiCluster("c-1", {
            cluster_name: "shared",
            cluster_memory_mb: 2048,
            cluster_cores: 4,
            data_security_mode: "USER_ISOLATION",
        }),
    ]);
    clusters.install(http);
    const settings = { ...options.settings };
    const kernel = fakeKernel({
        env: { DATABRICKS_CONFIG_FILE: config },
        httpClient: http,
        folders: new MutableState<readonly string[]>([root]),
        files: new FakeFileEvents(),
        settings: fakeSettings(settings),
    });
    const mode = (target: string) => (target === "dev" ? "development" : "production");
    kernel.runner.on(["bundle", "validate"], (args) => ({
        stdout: JSON.stringify({ bundle: { name: "demo", target: args[3], mode: mode(args[3]!) } }),
    }));
    kernel.runner.on(["bundle", "summary"], (args) => ({
        stdout: JSON.stringify({ bundle: { name: "demo", target: args[3] } }),
    }));
    const contextKeys = new Map<string, unknown>();
    const fake = fakeFeatureHost(kernel);
    const registered = registerFeatures([configurationView, connection, compute], {
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
    const section = () => fake.host.sections.list().find((s) => s.id === "compute.cluster");
    const rows = async (parent?: ConfigurationItem) => (await section()?.getChildren(parent)) ?? [];
    const run = (command: string, ...args: unknown[]) =>
        vscode.commands.get(command)?.(...args) as Promise<unknown>;
    const picker = () => vscode.quickInputs.at(-1) as FakeQuickInput;
    const overridesFile = () => {
        const file = t.path("project/.databricks/bundle/dev/vscode.overrides.json");
        // Without `authProfile`, which the connection saves for the target's only matching profile.
        const { authProfile: _, ...rest } = fs.existsSync(file)
            ? (JSON.parse(fs.readFileSync(file, "utf-8")) as Record<string, unknown>)
            : {};
        return rest;
    };
    /** The configuration view's rows, as VS Code asks for them, so checkbox events reach their section. */
    const viewRows = async (parent?: ConfigurationItem) => {
        const provider = vscode.treeDataProviders.get("configurationView") as {
            getChildren(p?: ConfigurationItem): Promise<ConfigurationItem[]>;
        };
        return (await provider.getChildren(parent)).filter(
            (r) => r.id === "CLUSTER" || r.id === CLUSTER_OVERRIDE_CHECKBOX_ID,
        );
    };
    const settle = () => new Promise((r) => setTimeout(r, 20));
    /** `settle`, then `check`, until it passes: the picker and clusters load on timers the Windows runner can wake late. */
    const settleUntil = (check: () => void) =>
        vi.waitFor(async () => {
            await settle();
            check();
        });
    return {
        kernel,
        http,
        clusters,
        rows,
        viewRows,
        run,
        picker,
        overridesFile,
        contextKeys,
        settle,
        settleUntil,
        fake,
        settings,
    };
}

describe("compute picker (COMP-01)", () => {
    beforeEach(() => vscode.reset());

    it("lists Serverless and Create New Cluster at once, then the clusters, running first, and stops being busy", async () => {
        const s = await setup();
        const slow = deferred();
        s.clusters.listDelay = slow.promise;
        const result = s.run(ATTACH_CLUSTER_QUICK_PICK.id);
        await s.settleUntil(() => expect(s.picker().title).toBe("Select Compute"));
        const picker = s.picker();
        expect(picker.title).toBe("Select Compute");
        // The list the Compute view loaded shows below them until the new one arrives.
        expect(picker.items.slice(0, 3).map((i) => i.label)).toEqual([
            SERVERLESS_LABEL,
            CREATE_CLUSTER_LABEL,
            "",
        ]);
        expect(picker.busy).toBe(true);

        slow.resolve();
        await when(s.kernel.compute.clusters, (l) => l.status === "ready");
        await s.settleUntil(() =>
            expect(picker.items.map((i) => i.label)).toEqual([
                SERVERLESS_LABEL,
                CREATE_CLUSTER_LABEL,
                "",
                "$(debug-start) shared (c-1)",
                "$(debug-stop) b-stopped (c-2)",
            ]),
        );
        expect(picker.items[3]!.detail).toBe("2 GB | 4 Cores | 15.4.x-scala2.12 | me");
        expect(picker.busy).toBe(false);
        picker.hide();
        expect(await result).toBeUndefined();
    });

    it("can pick Serverless while the clusters still load, and saves it", async () => {
        const s = await setup();
        const slow = deferred();
        s.clusters.listDelay = slow.promise;
        const result = s.run(ATTACH_CLUSTER_QUICK_PICK.id);
        await s.settleUntil(() => expect(s.picker().title).toBe("Select Compute"));
        s.picker().accept(SERVERLESS_LABEL);
        expect(await result).toEqual({ kind: "serverless" });
        expect(s.overridesFile()).toMatchObject({ serverless: true, useClusterOverride: false });
        expect(s.kernel.compute.effective.value).toEqual({
            kind: "serverless",
            source: "override",
        });
        expect(s.picker().disposed).toBe(true);
        slow.resolve();
    });

    it("attaches a picked cluster, once, and resolves to it", async () => {
        const s = await setup();
        const result = s.run(ATTACH_CLUSTER_QUICK_PICK.id);
        await when(s.kernel.compute.clusters, (l) => l.status === "ready");
        await s.settleUntil(() =>
            expect(s.picker().items.map((i) => i.label)).toContain("$(debug-start) shared (c-1)"),
        );
        const picker = s.picker();
        picker.accept("$(debug-start) shared (c-1)");
        // A repeated Enter neither attaches again nor changes the result.
        picker.accept("$(debug-stop) b-stopped (c-2)");
        expect(await result).toEqual({ kind: "cluster", clusterId: "c-1" });
        expect(s.overridesFile()).toEqual({ clusterId: "c-1", serverless: false });
    });

    it("resolves to undefined when dismissed, and changes nothing", async () => {
        const s = await setup();
        const result = s.run(ATTACH_CLUSTER_QUICK_PICK.id);
        await s.settleUntil(() => expect(s.picker().title).toBe("Select Compute"));
        s.picker().hide();
        expect(await result).toBeUndefined();
        expect(s.overridesFile()).toEqual({});
    });

    it("opens the browser for Create New Cluster", async () => {
        const s = await setup();
        const result = s.run(ATTACH_CLUSTER_QUICK_PICK.id);
        await s.settleUntil(() => expect(s.picker().title).toBe("Select Compute"));
        s.picker().accept(CREATE_CLUSTER_LABEL);
        expect(await result).toBeUndefined();
        expect(vscode.opened).toEqual([`${A}/#create/cluster`]);
    });

    it("takes a title from a caller, and ignores the row the Cluster row's action passes", async () => {
        const s = await setup();
        const titled =
            s.kernel.compute &&
            s.fake.host.registry.executeInternal(
                ATTACH_CLUSTER_QUICK_PICK,
                "Select compute for setup",
            );
        await s.settleUntil(() => expect(s.picker().title).toBe("Select compute for setup"));
        s.picker().hide();
        await titled;
        const fromRow = s.run(ATTACH_CLUSTER_QUICK_PICK.id, { id: "CLUSTER" });
        await s.settleUntil(() => expect(s.picker().title).toBe("Select Compute"));
        s.picker().hide();
        await fromRow;
    });

    it("asks for a serverless version when required (COMP-02), starred recommendation first", async () => {
        const s = await setup();
        s.kernel.compute.serverlessVersionRequired.set(true);
        let offered: { label: string }[] = [];
        vscode.pickFrom = (items) => {
            offered = items;
            return items[0];
        };
        const result = s.run(ATTACH_CLUSTER_QUICK_PICK.id);
        await s.settleUntil(() => expect(s.picker().title).toBe("Select Compute"));
        s.picker().accept(SERVERLESS_LABEL);
        expect(await result).toEqual({ kind: "serverless", version: "6" });
        expect(offered[0]!.label).toBe("$(star-full) v6");
        expect(s.overridesFile()).toMatchObject({ serverless: true, serverlessVersion: "6" });
    });

    it("stores a version picked in setup alone: the default stays, nothing is recorded, and a detach holds", async () => {
        const s = await setup();
        vscode.pickFrom = (items) => items[0];
        expect(
            await s.fake.host.registry.executeInternal(SELECT_SERVERLESS_VERSION, undefined),
        ).toBe("6");
        expect(s.overridesFile()).toEqual({ serverlessVersion: "6" });
        expect(s.kernel.compute.effective.value).toEqual({
            kind: "serverless",
            version: "6",
            source: "default",
        });
        expect(s.fake.reporter.events.filter((e) => e.name === "computeSelected")).toEqual([]);
        await s.kernel.compute.select({ kind: "none" });
        expect(s.kernel.compute.effective.value).toBeUndefined();
        expect(s.overridesFile()).toMatchObject({ serverless: false, serverlessVersion: "6" });
    });

    it("changes nothing when the version picker is dismissed", async () => {
        const s = await setup({ overrides: { clusterId: "c-1" } });
        s.kernel.compute.serverlessVersionRequired.set(true);
        vscode.pickFrom = () => undefined;
        const result = s.run(ATTACH_CLUSTER_QUICK_PICK.id);
        await s.settleUntil(() => expect(s.picker().title).toBe("Select Compute"));
        s.picker().accept(SERVERLESS_LABEL);
        expect(await result).toBeUndefined();
        expect(s.overridesFile()).toEqual({ clusterId: "c-1" });
    });

    it("needs a connection: signed out, it says so", async () => {
        const s = await setup();
        await s.kernel.connection.signOut();
        await s.run(ATTACH_CLUSTER_QUICK_PICK.id);
        expect(vscode.errors.map((e) => e.message)).toEqual(["Sign in to Databricks first."]);
    });
});

describe("Cluster row (COMP-06)", () => {
    beforeEach(() => vscode.reset());

    it("shows Serverless when nothing is chosen, and Select compute once the target was detached", async () => {
        const s = await setup();
        expect((await s.rows())[0]).toMatchObject({
            contextValue: "databricks.configuration.cluster.serverless",
        });
        await s.kernel.compute.select({ kind: "none" });
        expect(s.overridesFile()).toEqual({ serverless: false });
        expect((await s.rows())[0]).toMatchObject({
            contextValue: "databricks.configuration.cluster.none",
        });
    });

    it("shows a highlighted Select compute that opens the picker when nothing is chosen", async () => {
        const s = await setup({ overrides: { serverless: false } });
        const [row] = await s.rows();
        expect(row).toMatchObject({
            contextValue: "databricks.configuration.cluster.none",
            command: { command: ATTACH_CLUSTER_QUICK_PICK.id },
        });
        expect(row!.label).toEqual({ label: "Select compute", highlights: [[0, 14]] });
        expect((row!.iconPath as ThemeIcon).color).toBeUndefined();
    });

    it("shows the attached cluster by name with its details, and the override checkbox", async () => {
        const s = await setup({ overrides: { clusterId: "c-1" } });
        await when(s.kernel.compute.attachedCluster, (c) => c?.details !== undefined);
        const [row, checkbox] = await s.rows();
        expect(row).toMatchObject({
            label: "Cluster",
            description: "shared",
            contextValue: "databricks.configuration.cluster.running.has-url",
            url: `${A}/#setting/clusters/c-1/configuration`,
        });
        expect(checkbox).toMatchObject({
            label: "Override Jobs cluster in bundle",
            id: CLUSTER_OVERRIDE_CHECKBOX_ID,
            checkboxState: {
                state: TreeItemCheckboxState.Unchecked,
                tooltip: "Use the selected cluster for all jobs in the bundle",
            },
        });
        expect((await s.rows(row)).map((r) => [r.label, r.description])).toEqual([
            ["Cluster ID", "c-1"],
            ["Databricks Runtime", "15.4.x"],
            ["Creator", "me"],
            ["Access Mode", "USER_ISOLATION"],
        ]);
    });

    it("shows the newly attached cluster, not a late read of the one it replaced", async () => {
        const s = await setup({ overrides: { clusterId: "c-2" } });
        await when(s.kernel.compute.attachedCluster, (c) => c?.details?.id === "c-2");
        // From now on, c-1 answers only when the test says so.
        const late = deferred();
        const reads: string[] = [];
        s.http.on("GET", "/api/2.1/clusters/get", async (request) => {
            const id = new URL(request.url).searchParams.get("cluster_id")!;
            reads.push(id);
            if (id === "c-1") {
                await late.promise;
                return { body: apiCluster("c-1", { cluster_name: "shared" }) };
            }
            return { body: apiCluster("c-2", { cluster_name: "b-stopped", state: "TERMINATED" }) };
        });
        await s.kernel.compute.select({ kind: "cluster", clusterId: "c-1" });
        await expect.poll(() => reads).toEqual(["c-1"]);

        await s.kernel.compute.select({ kind: "cluster", clusterId: "c-2" });
        await when(s.kernel.compute.attachedCluster, (c) => c?.details?.id === "c-2");
        late.resolve();
        await s.settle();

        const [row] = await s.rows();
        expect(row).toMatchObject({
            description: "b-stopped",
            contextValue: "databricks.configuration.cluster.terminated.has-url",
        });
        expect(s.kernel.compute.attachedCluster.value).toMatchObject({
            clusterId: "c-2",
            details: { id: "c-2", state: "TERMINATED" },
        });
    });

    it("saves the override checkbox, and bundle calls then get DATABRICKS_CLUSTER_ID", async () => {
        const s = await setup({ overrides: { clusterId: "c-1" } });
        const [, checkbox] = await s.viewRows();
        vscode.treeViews.get("configurationView")!.check(checkbox, true);
        await when(s.kernel.project.overrides, (o) => o?.useClusterOverride === true);
        expect(s.overridesFile()).toEqual({ clusterId: "c-1", useClusterOverride: true });
        await vi.waitFor(() => {
            const validate = s.kernel.runner.calls.filter((c) => c.args[1] === "validate").at(-1)!;
            expect(validate.options.env).toMatchObject({ DATABRICKS_CLUSTER_ID: "c-1" });
        });
        const [, checked] = await s.rows();
        expect(checked!.checkboxState).toMatchObject({ state: TreeItemCheckboxState.Checked });
    });

    it("shows Serverless when serverless is effective, and sets the serverless context key", async () => {
        const s = await setup({ serverlessAuto: true });
        expect((await s.rows()).map((r) => [r.label, r.contextValue])).toEqual([
            ["Serverless", "databricks.configuration.cluster.serverless"],
        ]);
        expect(s.contextKeys.get(SERVERLESS.name)).toBe(true);
    });

    it("shows nothing for a target that isn't in development mode, or signed out", async () => {
        const s = await setup({ overrides: { clusterId: "c-1" } });
        await s.kernel.project.selectTarget("prod");
        await when(
            s.kernel.bundle.validated,
            (v) => v.status === "ready" && v.value.target === "prod",
        );
        expect(await s.rows()).toEqual([]);
        await s.kernel.project.selectTarget("dev");
        await when(
            s.kernel.bundle.validated,
            (v) => v.status === "ready" && v.value.target === "dev",
        );
        expect(await s.rows()).not.toEqual([]);
        await s.kernel.connection.signOut();
        expect(await s.rows()).toEqual([]);
    });

    it("records computeSelected when the effective compute changes", async () => {
        const s = await setup();
        await s.kernel.compute.select({ kind: "cluster", clusterId: "c-1" });
        await s.kernel.compute.select({ kind: "serverless" });
        expect(
            s.fake.reporter.events
                .filter((e) => e.name === "computeSelected")
                .map((e) => e.properties?.["event.type"]),
        ).toEqual(["cluster", "serverless"]);
    });
});

describe("compute commands (COMP-04, COMP-05)", () => {
    beforeEach(() => vscode.reset());

    it("attaches a cluster from the Compute view, and detaches it", async () => {
        const s = await setup();
        await s.kernel.compute.refreshClusters();
        const node = new ClusterNode(
            s.kernel.compute.clusters.value.clusters.find((c) => c.id === "c-2")!,
        );
        await s.run(ATTACH_CLUSTER, node);
        expect(s.overridesFile()).toEqual({ clusterId: "c-2", serverless: false });
        await s.run(DETACH_CLUSTER);
        expect(s.overridesFile()).toEqual({ serverless: false });
        expect(vscode.errors).toEqual([]);
    });

    it("starts and stops the attached cluster, or a Compute view row's", async () => {
        const s = await setup({ overrides: { clusterId: "c-2" } });
        (
            s.kernel.compute as unknown as { deps: { progressIntervalMs: number } }
        ).deps.progressIntervalMs = 1;
        await s.run(CLUSTER_START);
        expect(s.clusters.starts).toEqual(["c-2"]);
        await s.kernel.compute.refreshClusters();
        const node = new ClusterNode(
            s.kernel.compute.clusters.value.clusters.find((c) => c.id === "c-1")!,
        );
        await s.run(CLUSTER_STOP, node);
        expect(s.clusters.stops).toEqual(["c-1"]);
        expect(vscode.errors).toEqual([]);
    });

    it("shows the workspace's reason when it refuses to start the cluster (403)", async () => {
        const s = await setup({ overrides: { clusterId: "c-2" } });
        s.http.on("POST", "/api/2.1/clusters/start", {
            status: 403,
            body: {
                error_code: "PERMISSION_DENIED",
                message: "User me does not have Manage permission on cluster c-2.",
            },
        });
        await s.run(CLUSTER_START);
        expect(vscode.errors.map((e) => e.message)).toEqual([
            "Error running command databricks.cluster.start: User me does not have Manage permission on cluster c-2.",
        ]);
        expect(s.clusters.clusters.get("c-2")?.state).toBe("TERMINATED");
    });

    it("says so when there is no cluster to start", async () => {
        const s = await setup();
        await s.run(CLUSTER_START);
        expect(vscode.errors.map((e) => e.message)).toEqual(["No cluster is attached."]);
    });
});

describe("Compute view (COMP-07)", () => {
    beforeEach(() => vscode.reset());

    it("shows behind the views.cluster experiment", async () => {
        const s = await setup({
            settings: { "databricks.experiments.optInto": ["views.cluster"] },
        });
        expect(s.contextKeys.get(SHOW_COMPUTE_VIEW.name)).toBe(true);
    });

    it("is hidden without the experiment", async () => {
        const s = await setup();
        expect(s.contextKeys.get(SHOW_COMPUTE_VIEW.name)).toBe(false);
    });

    it("lists the clusters while it shows, running first, and filters them", async () => {
        const s = await setup();
        await when(s.kernel.compute.clusters, (l) => l.status === "ready");
        const provider = vscode.treeDataProviders.get(COMPUTE_VIEW) as {
            getChildren(n?: unknown): Promise<ClusterNode[]>;
        };
        const labels = async () => (await provider.getChildren()).map((n) => n.getTreeItem().label);
        expect(await labels()).toEqual(["shared", "b-stopped"]);
        const [first] = await provider.getChildren();
        expect(first!.getTreeItem()).toMatchObject({ contextValue: "cluster.running", id: "c-1" });
        expect(
            (await provider.getChildren(first)).map(
                (n) => (n as unknown as ClusterNode).getTreeItem().label,
            ),
        ).toEqual(["Cluster ID", "Driver", "Worker", "Databricks Runtime", "State", "Creator"]);

        await s.run("databricks.cluster.filterByRunning");
        expect(await labels()).toEqual(["shared"]);
        await s.run("databricks.cluster.filterByMe");
        expect(await labels()).toEqual(["shared"]);
        await s.run("databricks.cluster.filterByAll");
        expect(await labels()).toEqual(["shared", "b-stopped"]);
    });

    it("lists again when it is shown, and not in the background", async () => {
        const s = await setup();
        const view = vscode.treeViews.get(COMPUTE_VIEW)!;
        await when(s.kernel.compute.clusters, (l) => l.status === "ready");
        const lists = () => s.http.to("/api/2.1/clusters/list").length;
        const before = lists();
        view.setVisible(false);
        await s.settle();
        expect(lists()).toBe(before);
        view.setVisible(true);
        // `when` can pass on the list it already has, before the shown view's refresh lands.
        await vi.waitFor(() => expect(lists()).toBe(before + 1));
    });
});

describe("the compute of a session window", () => {
    beforeEach(() => vscode.reset());

    /** A session window on `env`'s compute, with the session's cluster and another in the workspace. */
    async function session(env: Readonly<Record<string, string>>) {
        const http = new FakeHttpClient().on("GET", SCIM_ME, () => ({ body: { userName: "me" } }));
        const clusters = new FakeClusters([
            apiCluster(DEDICATED_CLUSTER_ID, { cluster_name: "my-session-cluster" }),
            apiCluster("c-1", { cluster_name: "shared" }),
        ]);
        clusters.install(http);
        const fullEnv = { ...env, DATABRICKS_CONFIG_FILE: tempDir().path("none") };
        const kernel = fakeKernel({
            env: fullEnv,
            host: detectHost(fullEnv, { remoteName: SESSION_REMOTE_NAME }),
            httpClient: http,
            settings: fakeSettings({ "databricks.experiments.optInto": ["views.cluster"] }),
        });
        (
            kernel.compute as unknown as { deps: { progressIntervalMs: number } }
        ).deps.progressIntervalMs = 1;
        const fake = fakeFeatureHost(kernel);
        const registered = registerFeatures([configurationView, connection, compute], fake.host);
        kernel.start();
        startFeatures(registered);
        await when(kernel.connection.state, (s) => s.status === "connected");
        const rows = () =>
            fake.host.sections
                .list("signIn")
                .find((s) => s.id === "compute.session")
                ?.getChildren() as ConfigurationItem[] | undefined;
        return { kernel, clusters, rows };
    }

    it("shows a serverless session's compute in the Sign-in view", async () => {
        const s = await session(SERVERLESS_SESSION_ENV);
        expect(s.kernel.compute.session).toEqual({
            kind: "serverless",
            clusterId: SERVERLESS_CLUSTER_ID,
            runtimeVersion: "client.4.10",
        });
        expect(s.rows()).toMatchObject([
            {
                label: "Session compute",
                description: "Serverless",
                tooltip: "This window runs on serverless compute (client.4.10).",
            },
        ]);
        // Nor is it the effective compute: a session's is the bundle's own cluster, or none.
        expect(s.kernel.compute.effective.value).toBeUndefined();
    });

    it("shows a dedicated session's cluster by name, with a link to it", async () => {
        const s = await session(DEDICATED_SESSION_ENV);
        await vi.waitFor(() =>
            expect(s.rows()).toMatchObject([
                {
                    description: "my-session-cluster",
                    url: `${SESSION_HOST}/compute/clusters/${DEDICATED_CLUSTER_ID}`,
                },
            ]),
        );
    });

    it("marks the session's cluster in the Compute view, and asks before stopping it", async () => {
        const s = await session(DEDICATED_SESSION_ENV);
        await vi.waitFor(() => expect(s.kernel.compute.clusters.value.status).toBe("ready"));
        const provider = vscode.treeDataProviders.get(COMPUTE_VIEW) as {
            getChildren(): Promise<ClusterNode[]>;
        };
        const nodes = await provider.getChildren();
        const [own, other] = [DEDICATED_CLUSTER_ID, "c-1"].map((id) =>
            nodes.find((n) => n.cluster.id === id)!,
        );
        expect(own!.getTreeItem().description).toBe("This session");
        expect(other!.getTreeItem().description).toBeUndefined();

        await vscode.commands.get(CLUSTER_STOP)!(own);
        expect(vscode.warnings.map((w) => w.message)).toEqual([
            "This window runs on this cluster. Stopping it ends the session.",
        ]);
        expect(s.clusters.stops).toEqual([]);

        vscode.nextMessageChoice = STOP_SESSION_CLUSTER;
        await vscode.commands.get(CLUSTER_STOP)!(own);
        await vscode.commands.get(CLUSTER_STOP)!(other);
        expect(s.clusters.stops).toEqual([DEDICATED_CLUSTER_ID, "c-1"]);
        expect(vscode.warnings).toHaveLength(2);
        expect(vscode.errors).toEqual([]);
    });
});
