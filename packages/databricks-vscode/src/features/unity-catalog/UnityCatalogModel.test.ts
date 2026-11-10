import { newPatCredentials } from "@databricks/sdk-auth/credentials";
import { describe, expect, it } from "vitest";
import { ApiClients, type Connection } from "../../kernel/connection";
import { FakeHttpClient } from "../../test-support/fakeHttp";
import { fakeLog } from "../../test-support/fakes";
import { FakeUnityCatalog } from "../../test-support/fakeUnityCatalog";
import { loadMonitor, loadNodeEnrichments } from "./details";
import { favoritesKey } from "./Favorites";
import { LruCache } from "./LruCache";
import { mapModelVersion, mapTable } from "./mappers";
import type { NodeOfKind, StoredFavoriteRef, UnityCatalogTreeNode } from "./types";
import { groupSchemaContents, listAll, UnityCatalogModel } from "./UnityCatalogModel";

const A = "https://a.cloud.databricks.com";

function model(capacity?: number) {
    const http = new FakeHttpClient();
    const uc = new FakeUnityCatalog(http);
    const api = new ApiClients({
        host: A,
        credentials: newPatCredentials("dapi-1"),
        httpClient: http,
    });
    const connection = { host: A, userName: "me@example.com", api } as unknown as Connection;
    return { uc, model: new UnityCatalogModel(connection, fakeLog(), capacity) };
}

const schema = { catalogName: "c", name: "s", fullName: "c.s" };
const table = (name: string): UnityCatalogTreeNode => ({
    kind: "table",
    catalogName: "c",
    schemaName: "s",
    name,
    fullName: `c.s.${name}`,
});
const volume = (name: string): UnityCatalogTreeNode => ({
    kind: "volume",
    catalogName: "c",
    schemaName: "s",
    name,
    fullName: `c.s.${name}`,
});

describe("LruCache", () => {
    it("drops the least recently used entry past its capacity", () => {
        const cache = new LruCache<string, number>(2);
        cache.set("a", 1);
        cache.set("b", 2);
        cache.get("a");
        cache.set("c", 3);
        expect([cache.peek("a"), cache.peek("b"), cache.peek("c"), cache.size]).toEqual([
            1,
            undefined,
            3,
            2,
        ]);
    });

    it("peek doesn't make an entry newer", () => {
        const cache = new LruCache<string, number>(2);
        cache.set("a", 1);
        cache.set("b", 2);
        cache.peek("a");
        cache.set("c", 3);
        expect(cache.peek("a")).toBeUndefined();
    });

    it("deletes by key and by predicate", () => {
        const cache = new LruCache<string, number>(5);
        ["x:1", "x:2", "y:1"].forEach((k, i) => cache.set(k, i));
        cache.deleteWhere((k) => k.startsWith("x:"));
        expect(cache.size).toBe(1);
        expect(cache.delete("y:1")).toBe(true);
    });
});

describe("groupSchemaContents", () => {
    it("groups when there are two kinds, and omits kinds with no members", () => {
        const groups = groupSchemaContents(schema, [table("t1"), volume("v"), table("t2")]);
        expect(groups.map((g) => (g.kind === "group" ? [g.groupType, g.count] : g.kind))).toEqual([
            ["tables", 2],
            ["volumes", 1],
        ]);
    });

    it("doesn't group a single kind", () => {
        expect(groupSchemaContents(schema, [table("t1"), table("t2")]).map((n) => n.kind)).toEqual([
            "table",
            "table",
        ]);
    });

    it("keeps error rows after the groups, and an empty row alone", () => {
        const error: UnityCatalogTreeNode = { kind: "error", message: "Failed to load functions" };
        expect(
            groupSchemaContents(schema, [table("t"), volume("v"), error]).map((n) => n.kind),
        ).toEqual(["group", "group", "error"]);
        expect(groupSchemaContents(schema, [{ kind: "empty", message: "No data" }])).toEqual([
            { kind: "empty", message: "No data" },
        ]);
    });
});

describe("listAll", () => {
    it("follows page tokens, and stops when one repeats", async () => {
        const pages: Record<string, { items: number[]; nextPageToken?: string }> = {
            "": { items: [1], nextPageToken: "a" },
            "a": { items: [2], nextPageToken: "b" },
            "b": { items: [3], nextPageToken: "a" },
        };
        expect(
            await listAll(
                async (t) => pages[t ?? ""]!,
                (r) => r.items,
            ),
        ).toEqual([1, 2, 3]);
    });
});

describe("mappers", () => {
    it("turns the SDK's bigints into numbers", () => {
        const t = mapTable(
            { name: "t", createdAt: 1700000000000n, columns: [{ name: "a" }, {}] },
            "c",
            "s",
        );
        expect([t.fullName, t.createdAt, t.columns?.map((c) => c.name)]).toEqual([
            "c.s.t",
            1700000000000,
            ["a"],
        ]);
        expect(mapModelVersion({ version: 3n }, "c", "s", "m", "c.s.m").version).toBe(3);
    });
});

describe("favoritesKey", () => {
    it("is the normalised host, and adds the workspace on a unified host", () => {
        expect(favoritesKey({ host: "https://A.cloud.databricks.com/", workspaceId: "1" })).toBe(A);
        expect(favoritesKey({ host: "https://acme.databricks.com", workspaceId: "42" })).toBe(
            "https://acme.databricks.com?o=42",
        );
        expect(favoritesKey({ host: "https://acme.databricks.com" })).toBe(
            "https://acme.databricks.com",
        );
    });
});

describe("UnityCatalogModel", () => {
    it("keeps at most its capacity of lists", async () => {
        const { uc, model: m } = model(2);
        uc.catalog("a").catalog("b").catalog("c");
        const catalogs = (await m.catalogs()) as NodeOfKind<"catalog">[];
        await m.schemas(catalogs[0]!);
        await m.schemas(catalogs[1]!);
        await m.catalogs();
        expect(uc.requests("catalogs")).toHaveLength(2);
    });

    it("shares one request between concurrent loads", async () => {
        const { uc, model: m } = model();
        uc.catalog("a");
        await Promise.all([m.catalogs(), m.catalogs()]);
        expect(uc.requests("catalogs")).toHaveLength(1);
    });

    it('says "No catalogs found" for an empty metastore', async () => {
        const { model: m } = model();
        expect(await m.catalogs()).toEqual([{ kind: "empty", message: "No catalogs found" }]);
    });

    it("fetches a favorite table's columns when the list didn't carry them", async () => {
        const { uc, model: m } = model();
        uc.table("c.s.t", { columns: [{ name: "x", type_text: "int" }] });
        const columns = await m.columns({
            kind: "table",
            catalogName: "c",
            schemaName: "s",
            name: "t",
            fullName: "c.s.t",
        });
        expect(columns).toEqual([
            {
                kind: "column",
                tableFullName: "c.s.t",
                name: "x",
                typeText: "int",
                typeName: undefined,
                comment: undefined,
                nullable: undefined,
                position: undefined,
            },
        ]);
    });
});

describe("details", () => {
    const tableNode: NodeOfKind<"table"> = {
        kind: "table",
        catalogName: "c",
        schemaName: "s",
        name: "t",
        fullName: "c.s.t",
        customProperties: { owner_team: "x" },
    };

    it("reads constraints, the row filter, the pipeline and the custom properties of a table", async () => {
        const { uc, model: m } = model();
        uc.table("c.s.t", {
            table_constraints: [
                { primary_key_constraint: { name: "pk", child_columns: ["id"] } },
                {
                    foreign_key_constraint: {
                        name: "fk",
                        child_columns: ["o"],
                        parent_table: "c.s.o",
                        parent_columns: ["id"],
                    },
                },
            ],
            row_filter: { function_name: "c.s.f", input_column_names: ["region"] },
            pipeline_id: "p-1",
        });
        const e = await loadNodeEnrichments(m, tableNode);
        expect(e.constraints).toEqual([
            { type: "pk", name: "pk", columns: ["id"] },
            { type: "fk", name: "fk", columns: ["o"], parentTable: "c.s.o", parentColumns: ["id"] },
        ]);
        expect([e.rowFilter, e.pipelineId, e.customProperties]).toEqual([
            { functionName: "c.s.f", usingColumns: ["region"] },
            "p-1",
            { owner_team: "x" },
        ]);
        expect(e.monitor).toBeNull();
    });

    it("leaves out a section that fails", async () => {
        const { uc, model: m } = model();
        uc.table("c.s.t");
        uc.failures.set("effective-permissions/TABLE/c.s.t", {
            status: 403,
            body: { error_code: "PERMISSION_DENIED", message: "no" },
        });
        const e = await loadNodeEnrichments(m, tableNode);
        expect(e.permissions).toBeUndefined();
        expect(e.tags).toEqual([]);
    });

    it("reads a data-profiling monitor as the legacy one; none is null", async () => {
        const { uc, model: m } = model();
        uc.monitors.set("id-1", {
            data_profiling_config: {
                status: "DATA_PROFILING_STATUS_ERROR",
                schedule: { quartz_cron_expression: "0 0 * * * ?" },
                latest_monitor_failure_message: "bad",
                dashboard_id: "d",
            },
        });
        uc.monitors.set("id-2", { anomaly_detection_config: {} });
        expect(await loadMonitor(m, { tableId: "id-1" })).toEqual({
            status: "MONITOR_STATUS_ERROR",
            schedule: "0 0 * * * ?",
            failureMsg: "bad",
            dashboardId: "d",
            driftMetricsTable: undefined,
            profileMetricsTable: undefined,
        });
        expect(await loadMonitor(m, { tableId: "id-2" })).toBeNull();
        expect(await loadMonitor(m, { tableId: "id-3" })).toBeNull();
        expect(await loadMonitor(m, {})).toBeNull();
    });
});

// The SDK puts names in the URL path unencoded: without pathValue, "c.s.v#1" asks for "c.s.v".
describe("names holding # or ?", () => {
    const tableHash: NodeOfKind<"table"> = {
        kind: "table",
        catalogName: "c",
        schemaName: "s",
        name: "t#1",
        fullName: "c.s.t#1",
    };
    const modelHash: NodeOfKind<"registeredModel"> = {
        kind: "registeredModel",
        catalogName: "c",
        schemaName: "s",
        name: "m#1",
        fullName: "c.s.m#1",
    };

    it("resolves each kind of favorite by its own name", async () => {
        const { uc, model: m } = model();
        uc.catalog("k").catalog("k#1").schema("c.s").schema("c.s?x");
        uc.table("c.s.t").table("c.s.t#1").table("c.s.t%1").volume("c.s.v").volume("c.s.v#1");
        uc.function("c.s.f").function("c.s.f?x").model("c.s.m").model("c.s.m#1");
        uc.version("c.s.m#1", 3);
        const refs: StoredFavoriteRef[] = [
            { kind: "catalog", fullName: "k#1" },
            { kind: "schema", fullName: "c.s?x" },
            { kind: "table", fullName: "c.s.t#1" },
            { kind: "table", fullName: "c.s.t%1" },
            { kind: "volume", fullName: "c.s.v#1" },
            { kind: "function", fullName: "c.s.f?x" },
            { kind: "registeredModel", fullName: "c.s.m#1" },
            { kind: "modelVersion", fullName: "c.s.m#1", version: 3 },
        ];
        const resolved = [];
        for (const ref of refs) {
            const r = await m.favorite(ref);
            resolved.push(
                r.status !== "ok"
                    ? r.status
                    : r.node.kind === "modelVersion"
                      ? `modelVersion v${r.node.version}`
                      : `${r.node.kind} ${"name" in r.node ? r.node.name : ""}`,
            );
        }
        expect(resolved).toEqual([
            "catalog k#1",
            "schema s?x",
            "table t#1",
            "table t%1",
            "volume v#1",
            "function f?x",
            "registeredModel m#1",
            "modelVersion v3",
        ]);
    });

    it("lists a model's versions and a table's columns", async () => {
        const { uc, model: m } = model();
        uc.model("c.s.m").model("c.s.m#1").version("c.s.m", 1).version("c.s.m#1", 2);
        uc.table("c.s.t", { columns: [{ name: "plain", type_text: "int" }] });
        uc.table("c.s.t#1", { columns: [{ name: "own", type_text: "int" }] });
        const versions = await m.modelVersions(modelHash);
        const columns = await m.columns(tableHash);
        expect(versions.map((v) => (v.kind === "modelVersion" ? v.version : v.kind))).toEqual([2]);
        expect(columns.map((c) => (c.kind === "column" ? c.name : c.kind))).toEqual(["own"]);
    });

    it("loads the detail panel's tags, permissions and table details", async () => {
        const { uc, model: m } = model();
        uc.volume("c.s.v").volume("c.s.v#1");
        uc.table("c.s.t", { pipeline_id: "plain" }).table("c.s.t#1", { pipeline_id: "own" });
        for (const [name, of] of [
            ["c.s.v", "plain"],
            ["c.s.v#1", "own"],
        ] as const) {
            uc.tags.set(`volumes/${name}`, [{ tag_key: "of", tag_value: of }]);
            uc.permissions.set(`VOLUME/${name}`, [
                { principal: of, privileges: [{ privilege: "READ_VOLUME" }] },
            ]);
        }
        const v = await loadNodeEnrichments(m, volume("v#1") as NodeOfKind<"volume">);
        const t = await loadNodeEnrichments(m, tableHash);
        expect(v.tags).toEqual([{ key: "of", value: "own" }]);
        expect(v.permissions).toEqual([{ principal: "own", privileges: ["READ_VOLUME"] }]);
        expect(t.pipelineId).toBe("own");
    });

    it("links to the object's own Catalog Explorer page", () => {
        const { model: m } = model();
        expect([
            m.exploreUrl(volume("v#1")),
            m.exploreUrl(table("t?x")),
            m.exploreUrl(table("t%1")),
            m.exploreUrl(modelHash),
        ]).toEqual([
            `${A}/explore/data/volumes/c/s/v%231`,
            `${A}/explore/data/c/s/t%3Fx`,
            `${A}/explore/data/c/s/t%251`,
            `${A}/explore/data/models/c/s/m%231`,
        ]);
    });
});
