import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerFeatures, startFeatures } from "../../kernel/feature";
import { when } from "../../platform/reactive";
import { StateStore } from "../../platform/state";
import { fakeFeatureHost, fakeKernel, fakeMemento } from "../../test-support/fakes";
import { FakeHttpClient, SCIM_ME } from "../../test-support/fakeHttp";
import { FakeUnityCatalog } from "../../test-support/fakeUnityCatalog";
import { useTempDirs } from "../../test-support/tempDir";
import { host as vscode, type TreeItem } from "../../test-support/vscode";
import { FAVORITES, LEGACY_FAVORITES } from "./Favorites";
import { unityCatalog } from "./index";
import type { UnityCatalogTreeDataProvider, UnityCatalogTreeItemNode } from "./UnityCatalogTree";

const A = "https://a.cloud.databricks.com";
const packageDir = path.resolve(__dirname, "../../..");
const tempDir = useTempDirs();

type Row = TreeItem & { id?: string; tooltip?: { value: string } | string };

/** The real kernel, connected as me@example.com to a metastore with `main`, `samples` and `system`. */
async function setup(options: { legacyFavorites?: unknown[]; state?: StateStore } = {}) {
    const t = tempDir();
    const config = t.write(".databrickscfg", `[DEFAULT]\nhost = ${A}\ntoken = dapi-default\n`);
    vscode.folders = [];
    const http = new FakeHttpClient().on("GET", SCIM_ME, () => ({
        body: { userName: "me@example.com" },
    }));
    const uc = new FakeUnityCatalog(http)
        .catalog("system", { owner: "System user", comment: "System catalog" })
        .catalog("samples")
        .catalog("main", { owner: "me@example.com" })
        .schema("system.access")
        .schema("system.billing")
        .schema("main.default", { owner: "me@example.com" })
        .table("system.access.audit", {
            table_type: "MANAGED",
            data_source_format: "DELTA",
            table_id: "t-audit",
            columns: [
                { name: "b", type_text: "string", position: 1 },
                { name: "a", type_text: "bigint", position: 0, nullable: false },
            ],
        })
        .table("system.access.events", {
            table_type: "VIEW",
            view_definition: "SELECT 1",
            storage_location: "s3://x",
        })
        .volume("system.access.files", { volume_type: "EXTERNAL", storage_location: "s3://v" })
        .table("system.billing.usage")
        .model("main.default.m")
        .version("main.default.m", 1)
        .version("main.default.m", 2, { status: "PENDING_REGISTRATION" });
    const state =
        options.state ?? new StateStore({ global: fakeMemento(), workspace: fakeMemento() });
    if (options.legacyFavorites !== undefined) {
        await state.set(LEGACY_FAVORITES, options.legacyFavorites as never);
    }
    const base = fakeKernel().extension;
    const kernel = fakeKernel({
        env: { DATABRICKS_CONFIG_FILE: config },
        httpClient: http,
        state,
        extension: { ...base, asAbsolutePath: (p) => path.join(packageDir, p) },
    });
    const fake = fakeFeatureHost(kernel);
    const registered = registerFeatures([unityCatalog], fake.host);
    kernel.start();
    startFeatures(registered);
    await when(kernel.connection.state, (s) => s.status === "connected");

    const tree = vscode.treeDataProviders.get("unityCatalogView") as UnityCatalogTreeDataProvider;
    const treeView = vscode.treeViews.get("unityCatalogView")!;
    const roots = () => tree.getChildren();
    const item = (n: UnityCatalogTreeItemNode) => n.getTreeItem() as unknown as Row;
    const labels = async (nodes?: UnityCatalogTreeItemNode[]) =>
        (nodes ?? (await roots())).map((n) => item(n).label);
    /** The row at a path of labels, from the root. */
    const row = async (...labelPath: string[]): Promise<UnityCatalogTreeItemNode> => {
        let nodes = await roots();
        let found: UnityCatalogTreeItemNode | undefined;
        for (const label of labelPath) {
            found = nodes.find((n) => item(n).label === label);
            if (found === undefined) {
                throw new Error(`No row "${label}" in ${JSON.stringify(await labels(nodes))}`);
            }
            nodes = await found.getChildren();
        }
        return found!;
    };
    const children = async (...labelPath: string[]) => (await row(...labelPath)).getChildren();
    const run = (command: string, ...args: unknown[]) => vscode.commands.get(command)?.(...args);
    return {
        kernel,
        http,
        uc,
        state,
        tree,
        treeView,
        roots,
        item,
        labels,
        row,
        children,
        run,
        fake,
    };
}

describe("unity catalog", () => {
    beforeEach(() => vscode.reset());

    describe("the tree (UC-01)", () => {
        it("lists the user's catalogs first, then the rest by name", async () => {
            const s = await setup();
            expect(await s.labels()).toEqual(["main", "samples", "system"]);
            expect(s.item((await s.roots())[0]!).description).toBe("yours");
            s.kernel.dispose();
        });

        it("renders catalogs as before, with their own icons", async () => {
            const s = await setup();
            const system = s.item(await s.row("system"));
            expect(system.contextValue).toBe("unityCatalog.catalog.has-url");
            expect(system.collapsibleState).toBe(1);
            expect(String((system.iconPath as unknown as { dark: unknown }).dark)).toContain(
                path.join("resources", "dark", "unity-catalog", "catalog-system.svg"),
            );
            expect(system.tooltip).toEqual(
                expect.objectContaining({ value: "**system**\n\nSystem catalog" }),
            );
            s.kernel.dispose();
        });

        it("expands a catalog to its schemas", async () => {
            const s = await setup();
            expect(await s.labels(await s.children("system"))).toEqual(["access", "billing"]);
            s.kernel.dispose();
        });

        it("groups a schema's children with counts when it has two kinds or more", async () => {
            const s = await setup();
            expect(await s.labels(await s.children("system", "access"))).toEqual([
                "Tables (2)",
                "Volumes (1)",
            ]);
            expect(await s.labels(await s.children("system", "access", "Tables (2)"))).toEqual([
                "audit",
                "events (VIEW)",
            ]);
            expect(await s.labels(await s.children("system", "access", "Volumes (1)"))).toEqual([
                "files (EXTERNAL)",
            ]);
            expect(s.item(await s.row("system", "access", "Tables (2)")).contextValue).toBe(
                "unityCatalog.group.tables",
            );
            s.kernel.dispose();
        });

        it("lists a schema's children flat when it has one kind", async () => {
            const s = await setup();
            expect(await s.labels(await s.children("system", "billing"))).toEqual(["usage"]);
            s.kernel.dispose();
        });

        it("expands a table to its columns, by position, with their types", async () => {
            const s = await setup();
            const columns = await s.children("system", "access", "Tables (2)", "audit");
            expect(columns.map((c) => [s.item(c).label, s.item(c).description])).toEqual([
                ["a", "bigint"],
                ["b", "string"],
            ]);
            expect(s.item(columns[0]!).contextValue).toBe("unityCatalog.column");
            s.kernel.dispose();
        });

        it("sets the menus' flags: storage, view and URL", async () => {
            const s = await setup();
            expect(
                s.item(await s.row("system", "access", "Tables (2)", "events (VIEW)")).contextValue,
            ).toBe("unityCatalog.table.has-url.has-storage.is-view");
            expect(
                s.item(await s.row("system", "access", "Volumes (1)", "files (EXTERNAL)"))
                    .contextValue,
            ).toBe("unityCatalog.volume.has-url.has-storage");
            s.kernel.dispose();
        });

        it("lists a model's versions, newest first, with a non-ready status", async () => {
            const s = await setup();
            const versions = await s.children("main", "default", "m");
            expect(versions.map((v) => [s.item(v).label, s.item(v).description])).toEqual([
                ["v2", "PENDING_REGISTRATION"],
                ["v1", undefined],
            ]);
            s.kernel.dispose();
        });

        it("gives every row an ID from its path, kept across refreshes", async () => {
            const s = await setup();
            const audit = await s.row("system", "access", "Tables (2)", "audit");
            expect(audit.id).toBe(
                "catalog:system/schema:system.access/group:tables/table:system.access.audit",
            );
            await s.run("databricks.unityCatalog.refresh");
            expect((await s.row("system", "access", "Tables (2)", "audit")).id).toBe(audit.id);
            s.kernel.dispose();
        });

        it("shows an error row for a kind that fails, and keeps the others", async () => {
            const s = await setup();
            s.uc.failures.set("volumes", {
                status: 403,
                body: { error_code: "PERMISSION_DENIED", message: "No access" },
            });
            expect(await s.labels(await s.children("system", "access"))).toEqual([
                "audit",
                "events (VIEW)",
                "Failed to load volumes: No access",
            ]);
            s.kernel.dispose();
        });

        it("shows a workspace without a metastore as empty, and logs no error", async () => {
            const s = await setup();
            s.uc.failures.set("catalogs", {
                status: 404,
                body: {
                    error_code: "METASTORE_DOES_NOT_EXIST",
                    message: "No metastore assigned for the current workspace.",
                },
            });
            await s.run("databricks.unityCatalog.refresh");
            expect(await s.labels()).toEqual([
                "No Unity Catalog metastore is assigned to this workspace",
            ]);
            expect(s.fake.log.entries.filter((e) => e.level === "error")).toEqual([]);
            s.kernel.dispose();
        });

        it("doesn't keep a list with an error, so expanding again retries", async () => {
            const s = await setup();
            s.uc.failures.set("schemas", {
                status: 500,
                body: { error_code: "INTERNAL_ERROR", message: "boom" },
            });
            expect(await s.labels(await s.children("system"))).toEqual([
                "Failed to load schemas: boom",
            ]);
            s.uc.failures.clear();
            expect(await s.labels(await s.children("system"))).toEqual(["access", "billing"]);
            s.kernel.dispose();
        });

        it("shows empty rows", async () => {
            const s = await setup();
            expect(await s.labels(await s.children("samples"))).toEqual(["No schemas"]);
            s.uc.schema("samples.empty");
            await s.run("databricks.unityCatalog.refresh");
            expect(await s.labels(await s.children("samples", "empty"))).toEqual(["No data"]);
            s.kernel.dispose();
        });

        it("loads each list once until a refresh", async () => {
            const s = await setup();
            await s.children("system", "access");
            await s.children("system", "access");
            expect(s.uc.requests("tables")).toHaveLength(1);
            await s.run("databricks.unityCatalog.refresh");
            await s.children("system", "access");
            expect(s.uc.requests("tables")).toHaveLength(2);
            s.kernel.dispose();
        });

        it("refreshNode loads only that node's list again", async () => {
            const s = await setup();
            await s.children("system", "access");
            const catalogs = s.uc.requests("catalogs").length;
            const access = await s.row("system", "access");
            let fired: unknown;
            s.tree.onDidChangeTreeData((n) => (fired = n));
            await s.run("databricks.unityCatalog.refreshNode", access);
            expect(fired).toBe(access);
            await access.getChildren();
            expect(s.uc.requests("tables")).toHaveLength(2);
            expect(s.uc.requests("catalogs")).toHaveLength(catalogs);
            s.kernel.dispose();
        });

        it("has no rows while signed out, and refreshes when the connection changes", async () => {
            const s = await setup();
            let refreshed = 0;
            s.tree.onDidChangeTreeData(() => refreshed++);
            await s.kernel.connection.signOut();
            expect(refreshed).toBe(1);
            expect(await s.roots()).toEqual([]);
            s.kernel.dispose();
        });

        it("renders functions and registered models as before", async () => {
            const s = await setup();
            s.uc.function("main.default.f").model("main.default.m2", {
                aliases: [{ alias_name: "champion", version_num: 2 }],
            });
            await s.run("databricks.unityCatalog.refresh");
            expect(await s.labels(await s.children("main", "default"))).toEqual([
                "Functions (1)",
                "Models (2)",
            ]);
            const f = s.item(await s.row("main", "default", "Functions (1)", "f"));
            expect([f.tooltip, f.contextValue, f.collapsibleState]).toEqual([
                "main.default.f",
                "unityCatalog.function.has-url",
                0,
            ]);
            const m = s.item(await s.row("main", "default", "Models (2)", "m2"));
            expect([m.contextValue, (m.tooltip as { value: string }).value]).toEqual([
                "unityCatalog.registeredModel.has-url",
                "**main.default.m2**\n\n*Aliases:* champion → v2",
            ]);
            s.kernel.dispose();
        });

        it("reads every page of a list", async () => {
            const s = await setup();
            s.uc.pageSize = 2;
            await s.run("databricks.unityCatalog.refresh");
            expect(await s.labels()).toEqual(["main", "samples", "system"]);
            expect(
                s.uc.requests("catalogs").map((r) => new URL(r.url).searchParams.get("page_token")),
            ).toEqual([null, "2"]);
            s.kernel.dispose();
        });
    });

    describe("favorites (UC-03)", () => {
        it("pins a catalog: Favorites appears at the top, and the row shows the star", async () => {
            const s = await setup();
            await s.run("databricks.unityCatalog.pin", await s.row("system"));
            expect(await s.labels()).toEqual(["Favorites", "main", "samples", "system"]);
            const favorites = s.item((await s.roots())[0]!);
            expect([favorites.contextValue, favorites.collapsibleState]).toEqual([
                "unityCatalog.favorites",
                2,
            ]);
            expect(await s.labels(await s.children("Favorites"))).toEqual(["system"]);
            const system = s.item(await s.row("system"));
            expect([system.description, system.contextValue]).toEqual([
                "★",
                "unityCatalog.catalog.has-url.is-pinned",
            ]);
            expect((await s.children("Favorites"))[0]!.id).toBe("favorites/catalog:system");
            s.kernel.dispose();
        });

        it("unpins: Favorites goes away with the last one", async () => {
            const s = await setup();
            await s.run("databricks.unityCatalog.pin", await s.row("system"));
            await s.run("databricks.unityCatalog.unpin", await s.row("system"));
            expect(await s.labels()).toEqual(["main", "samples", "system"]);
            s.kernel.dispose();
        });

        it("stores only the ref, in global state keyed by host", async () => {
            const s = await setup();
            await s.run("databricks.unityCatalog.pin", await s.row("system", "access"));
            await s.run("databricks.unityCatalog.pin", await s.row("main", "default", "m", "v2"));
            expect(s.state.get(FAVORITES)).toEqual({
                [A]: [
                    { kind: "schema", fullName: "system.access" },
                    { kind: "modelVersion", fullName: "main.default.m", version: 2 },
                ],
            });
            s.kernel.dispose();
        });

        it("pins once", async () => {
            const s = await setup();
            await s.run("databricks.unityCatalog.pin", await s.row("system"));
            await s.run("databricks.unityCatalog.pin", await s.row("system"));
            expect(s.state.get(FAVORITES)[A]).toHaveLength(1);
            s.kernel.dispose();
        });

        it("loads favorites fresh, drops the ones that are gone, and keeps one that fails", async () => {
            const s = await setup();
            await s.run(
                "databricks.unityCatalog.pin",
                await s.row("system", "access", "Tables (2)", "audit"),
            );
            await s.run("databricks.unityCatalog.pin", await s.row("system", "billing"));
            await s.run("databricks.unityCatalog.pin", await s.row("main"));
            s.uc.schemas.splice(
                s.uc.schemas.findIndex((x) => x["full_name"] === "system.billing"),
                1,
            );
            s.uc.failures.set("catalogs/main", {
                status: 500,
                body: { error_code: "INTERNAL_ERROR", message: "boom" },
            });
            expect(await s.labels(await s.children("Favorites"))).toEqual([
                "audit",
                "Could not load main",
            ]);
            expect(s.state.get(FAVORITES)[A]!.map((f) => f.fullName)).toEqual([
                "system.access.audit",
                "main",
            ]);
            s.kernel.dispose();
        });

        it('shows "No favorites yet" when every pinned securable is gone', async () => {
            const s = await setup();
            await s.run("databricks.unityCatalog.pin", await s.row("system", "billing"));
            s.uc.schemas.length = 0;
            expect(await s.labels(await s.children("Favorites"))).toEqual(["No favorites yet"]);
            expect(s.state.get(FAVORITES)).toEqual({});
            s.kernel.dispose();
        });

        it("copies the old per-workspace favorites to the host once, and leaves the old key alone", async () => {
            const legacy = [
                { kind: "catalog", fullName: "system" },
                { kind: "bogus" },
                { kind: "modelVersion", fullName: "main.default.m", version: 1 },
            ];
            const s = await setup({ legacyFavorites: legacy });
            await vi.waitFor(() => expect(s.state.get(FAVORITES)[A]).toBeDefined());
            expect(s.state.get(FAVORITES)[A]).toEqual([
                { kind: "catalog", fullName: "system" },
                { kind: "modelVersion", fullName: "main.default.m", version: 1 },
            ]);
            expect(s.state.get(LEGACY_FAVORITES)).toEqual(legacy);
            expect(await s.labels()).toEqual(["Favorites", "main", "samples", "system"]);
            expect(await s.labels(await s.children("Favorites"))).toEqual(["system", "v1"]);

            // Unpinning everything doesn't bring them back on the next connection.
            await s.run("databricks.unityCatalog.unpin", (await s.children("Favorites"))[0]);
            await s.run("databricks.unityCatalog.unpin", (await s.children("Favorites"))[0]);
            s.kernel.dispose();
            vscode.reset();
            const again = await setup({ state: s.state });
            expect(again.state.get(FAVORITES)).toEqual({});
            again.kernel.dispose();
        });
    });

    describe("node actions (UC-04)", () => {
        it("copies a full name, a column's name, a storage location and a view's SQL", async () => {
            const s = await setup();
            await s.run("databricks.unityCatalog.copyName", await s.row("system", "access"));
            expect(vscode.clipboard).toBe("system.access");
            await s.run(
                "databricks.unityCatalog.copyName",
                (await s.children("system", "access", "Tables (2)", "audit"))[0],
            );
            expect(vscode.clipboard).toBe("a");
            const events = await s.row("system", "access", "Tables (2)", "events (VIEW)");
            await s.run("databricks.unityCatalog.copyStorageLocation", events);
            expect(vscode.clipboard).toBe("s3://x");
            await s.run("databricks.unityCatalog.copyViewSql", events);
            expect(vscode.clipboard).toBe("SELECT 1");
            expect(vscode.infos.map((i) => i.message)).toEqual(
                Array(4).fill("Copied to clipboard"),
            );
            s.kernel.dispose();
        });

        it("opens Catalog Explorer at the node's page", async () => {
            const s = await setup();
            await s.run(
                "databricks.unityCatalog.openExternal",
                await s.row("system", "access", "Tables (2)", "audit"),
            );
            await s.run(
                "databricks.unityCatalog.openExternal",
                await s.row("system", "access", "Volumes (1)", "files (EXTERNAL)"),
            );
            await s.run(
                "databricks.unityCatalog.openExternal",
                await s.row("main", "default", "m", "v2"),
            );
            // Strings, not Uris: VS Code encodes a Uri again when it opens it, which would turn %23 into %2523.
            expect(
                vscode.executed.filter((e) => e.command === "vscode.open").map((e) => e.args),
            ).toEqual([
                [`${A}/explore/data/system/access/audit`],
                [`${A}/explore/data/volumes/system/access/files`],
                [`${A}/explore/data/models/main/default/m/version/2`],
            ]);
            expect(vscode.opened).toEqual([]);
            s.kernel.dispose();
        });

        it("filter focuses the view and opens its find widget", async () => {
            const s = await setup();
            await s.run("databricks.unityCatalog.filter");
            expect(vscode.executed.map((e) => e.command)).toEqual([
                "unityCatalogView.focus",
                "list.find",
            ]);
            s.kernel.dispose();
        });
    });

    describe("the detail panel (UC-02)", () => {
        it('opens beside the editor titled "Table: …" when a table is selected, with a CSP', async () => {
            const s = await setup();
            s.uc.permissions.set("TABLE/system.access.audit", [
                { principal: "admins", privileges: [{ privilege: "SELECT" }] },
            ]);
            s.uc.tags.set("tables/system.access.audit", [{ tag_key: "pii", tag_value: "no" }]);
            s.uc.monitors.set("t-audit", {
                data_profiling_config: {
                    status: "DATA_PROFILING_STATUS_ACTIVE",
                    drift_metrics_table_name: "d",
                },
            });
            const audit = await s.row("system", "access", "Tables (2)", "audit");

            s.treeView.select(audit);

            await vi.waitFor(() =>
                expect(vscode.webviewPanels[0]?.posted.length ?? 0).toBeGreaterThanOrEqual(3),
            );
            const panel = vscode.webviewPanels[0]!;
            expect(panel.title).toBe("Table: audit");
            expect(panel.html).toMatch(
                /<meta http-equiv="Content-Security-Policy" content="default-src 'none'; [^"]*script-src 'nonce-[^']+'"/,
            );
            const nonce = /nonce-([^']+)'/.exec(panel.html)![1];
            expect([...panel.html.matchAll(/^\s*<script([^>]*)>$/gm)].map((m) => m[1])).toEqual(
                Array(4).fill(` nonce="${nonce}"`),
            );
            expect(panel.html).toContain("window.markdownit");
            const [loading, render, enrich] = panel.posted as { fn: string; args: unknown[] }[];
            expect(loading!.fn).toBe("showLoading");
            expect(render!.fn).toBe("renderNode");
            expect(render!.args[0]).toEqual(
                expect.objectContaining({
                    kind: "table",
                    fullName: "system.access.audit",
                    exploreUrl: `${A}/explore/data/system/access/audit`,
                }),
            );
            expect(enrich).toEqual({
                fn: "renderEnrichments",
                args: [
                    expect.objectContaining({
                        tags: [{ key: "pii", value: "no" }],
                        permissions: [{ principal: "admins", privileges: ["SELECT"] }],
                        monitor: expect.objectContaining({
                            status: "MONITOR_STATUS_ACTIVE",
                            driftMetricsTable: "d",
                        }),
                    }),
                ],
            });
            s.kernel.dispose();
        });

        it("reuses the one panel, and lists a schema's contents from the tree", async () => {
            const s = await setup();
            await s.run("databricks.unityCatalog.showDetail", await s.row("system", "access"));
            await vi.waitFor(() =>
                expect(vscode.webviewPanels[0]?.posted.length ?? 0).toBeGreaterThanOrEqual(2),
            );
            await s.run("databricks.unityCatalog.showDetail", await s.row("system"));
            await vi.waitFor(() =>
                expect(vscode.webviewPanels[0]?.posted.length ?? 0).toBeGreaterThanOrEqual(4),
            );
            expect(vscode.webviewPanels).toHaveLength(1);
            expect(vscode.webviewPanels[0]!.title).toBe("Catalog: system");
            const enrichments = (
                vscode.webviewPanels[0]!.posted as {
                    fn: string;
                    args: [
                        {
                            childrenTitle?: string;
                            children?: { label: string; subLabel?: string }[];
                        },
                    ];
                }[]
            ).filter((m) => m.fn === "renderEnrichments");
            expect(
                enrichments.map((e) => [
                    e.args[0].childrenTitle,
                    e.args[0].children!.map((c) => [c.label, c.subLabel]),
                ]),
            ).toEqual([
                [
                    "Contents",
                    [
                        ["audit", "MANAGED"],
                        ["events", "VIEW"],
                        ["files", "VOLUME"],
                    ],
                ],
                [
                    "Schemas",
                    [
                        ["access", undefined],
                        ["billing", undefined],
                    ],
                ],
            ]);
            expect(s.uc.requests("tables")).toHaveLength(1);
            s.kernel.dispose();
        });

        it("copies what the page asks for, opens the model versions it lists, and drops other messages", async () => {
            const s = await setup();
            await s.run("databricks.unityCatalog.showDetail", await s.row("main", "default", "m"));
            await vi.waitFor(() =>
                expect(vscode.webviewPanels[0]?.posted.length ?? 0).toBeGreaterThanOrEqual(2),
            );
            const panel = vscode.webviewPanels[0]!;

            panel.receive({ command: "copyText", text: "main.default.m" });
            expect(vscode.clipboard).toBe("main.default.m");

            panel.receive({
                command: "navigate",
                nodeData: { kind: "modelVersion", fullName: "main.default.m", version: 1 },
            });
            await vi.waitFor(() => expect(panel.title).toBe("Model Version: v1"));

            const posted = panel.posted.length;
            panel.receive({
                command: "navigate",
                nodeData: { kind: "modelVersion", fullName: "other.x.y", version: 9 },
            });
            panel.receive({ command: "eval", code: "1" });
            panel.receive("copyText");
            await new Promise((r) => setTimeout(r, 10));
            expect(panel.posted).toHaveLength(posted);
            expect(panel.title).toBe("Model Version: v1");
            s.kernel.dispose();
        });

        it("opens a new panel after the user closes it", async () => {
            const s = await setup();
            await s.run("databricks.unityCatalog.showDetail", await s.row("system"));
            vscode.webviewPanels[0]!.dispose();
            await s.run("databricks.unityCatalog.showDetail", await s.row("main"));
            expect(vscode.webviewPanels).toHaveLength(2);
            expect(vscode.webviewPanels[1]!.title).toBe("Catalog: main");
            s.kernel.dispose();
        });
    });
});
