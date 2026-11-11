import { ApiError } from "@databricks/sdk-core/apierror";
import { CatalogsClient } from "@databricks/sdk-uc-catalogs/v1";
import { FunctionsClient } from "@databricks/sdk-uc-functions/v1";
import { RegisteredModelsClient } from "@databricks/sdk-uc-registeredmodels/v1";
import { SchemasClient } from "@databricks/sdk-uc-schemas/v1";
import { TablesClient } from "@databricks/sdk-uc-tables/v1";
import { VolumesClient } from "@databricks/sdk-uc-volumes/v1";
import { calls, isNotFound, pathValue, type Connection } from "../../kernel/connection";
import type { Logger } from "../../platform/log";
import { LruCache } from "./LruCache";
import {
    mapCatalog,
    mapColumn,
    mapFunction,
    mapModelVersion,
    mapRegisteredModel,
    mapSchema,
    mapTable,
    mapVolume,
} from "./mappers";
import type {
    ColumnData,
    GroupType,
    NodeOfKind,
    StoredFavoriteRef,
    UnityCatalogTreeNode,
} from "./types";

export type FavoriteNodeResult =
    | { status: "ok"; node: UnityCatalogTreeNode }
    | { status: "gone" }
    | { status: "error"; ref: StoredFavoriteRef };

/** How many lists the model keeps. Each expanded node is one; the least recently used goes first. */
const CACHE_CAPACITY = 500;

const GROUP_KINDS: Record<GroupType, UnityCatalogTreeNode["kind"]> = {
    tables: "table",
    volumes: "volume",
    functions: "function",
    models: "registeredModel",
};

/**
 * Unity Catalog for one connection (UC-01): the catalogs, and what each
 * expanded node holds, loaded through the `@databricks/sdk-uc-*` clients.
 * Every list is complete for its node (the group labels carry counts). Lists
 * are kept in a bounded LRU cache until a refresh; a list with an error row
 * isn't kept, so the next expansion tries again. Concurrent loads of a list
 * share one request.
 */
export class UnityCatalogModel {
    private readonly cache: LruCache<string, Promise<UnityCatalogTreeNode[]>>;

    constructor(
        readonly connection: Connection,
        private readonly log: Logger,
        capacity = CACHE_CAPACITY,
    ) {
        this.cache = new LruCache(capacity);
    }

    private get userName() {
        return this.connection.userName;
    }

    catalogs(): Promise<UnityCatalogTreeNode[]> {
        return this.cached("catalogs", async () => {
            try {
                const rows = await listAll(
                    (pageToken) =>
                        this.connection.api
                            .get(CatalogsClient)
                            .listCatalogs({ pageToken }, calls.read()),
                    (r) => r.catalogs,
                );
                const result = rows
                    .filter((c) => c.name)
                    .map((c) => mapCatalog(c, this.userName))
                    .sort(compareOwnedFirst);
                return result.length > 0 ? result : emptyNode("No catalogs found");
            } catch (e) {
                return this.errorNode(e, "catalogs");
            }
        });
    }

    schemas(catalog: NodeOfKind<"catalog">): Promise<UnityCatalogTreeNode[]> {
        return this.cached(`schemas:${catalog.fullName}`, async () => {
            try {
                const rows = await listAll(
                    (pageToken) =>
                        this.connection.api
                            .get(SchemasClient)
                            .listSchemas({ catalogName: catalog.name, pageToken }, calls.read()),
                    (r) => r.schemas,
                );
                const result = rows
                    .filter((s) => s.name)
                    .map((s) => mapSchema(s, catalog.name, this.userName))
                    .sort(compareOwnedFirst);
                return result.length > 0 ? result : emptyNode("No schemas");
            } catch (e) {
                return this.errorNode(e, "schemas");
            }
        });
    }

    /**
     * A schema's tables, volumes, functions and models, by name, then the
     * error rows of the kinds that failed. "No data" when there is nothing.
     */
    schemaContents(
        schema: Pick<NodeOfKind<"schema">, "catalogName" | "name" | "fullName">,
    ): Promise<UnityCatalogTreeNode[]> {
        return this.cached(`contents:${schema.fullName}`, async () => {
            const catalogName = schema.catalogName;
            const schemaName = schema.name;
            const scope = { catalogName, schemaName };
            const api = this.connection.api;
            const loads: Promise<UnityCatalogTreeNode[]>[] = [
                listAll(
                    (pageToken) =>
                        api.get(TablesClient).listTables({ ...scope, pageToken }, calls.read()),
                    (r) => r.tables,
                ).then((rows) =>
                    rows.filter((t) => t.name).map((t) => mapTable(t, catalogName, schemaName)),
                ),
                listAll(
                    (pageToken) =>
                        api.get(VolumesClient).listVolumes({ ...scope, pageToken }, calls.read()),
                    (r) => r.volumes,
                ).then((rows) =>
                    rows.filter((v) => v.name).map((v) => mapVolume(v, catalogName, schemaName)),
                ),
                listAll(
                    (pageToken) =>
                        api
                            .get(FunctionsClient)
                            .listFunctions({ ...scope, pageToken }, calls.read()),
                    (r) => r.functions,
                ).then((rows) =>
                    rows.filter((f) => f.name).map((f) => mapFunction(f, catalogName, schemaName)),
                ),
                listAll(
                    (pageToken) =>
                        api
                            .get(RegisteredModelsClient)
                            .listRegisteredModels({ ...scope, pageToken }, calls.read()),
                    (r) => r.registeredModels,
                ).then((rows) =>
                    rows
                        .filter((m) => m.name)
                        .map((m) => mapRegisteredModel(m, catalogName, schemaName)),
                ),
            ];
            const results = await Promise.allSettled(loads);
            const labels = ["tables", "volumes", "functions", "registered models"];
            const content: UnityCatalogTreeNode[] = results.flatMap((r) =>
                r.status === "fulfilled" ? r.value : [],
            );
            const errors = results.flatMap((r, i) =>
                r.status === "rejected" ? this.errorNode(r.reason, labels[i]!) : [],
            );
            if (content.length === 0 && errors.length === 0) {
                return emptyNode("No data");
            }
            const kindOrder: Record<string, number> = {
                table: 0,
                volume: 1,
                function: 2,
                registeredModel: 3,
            };
            content.sort(
                (a, b) =>
                    nameOf(a).localeCompare(nameOf(b)) ||
                    (kindOrder[a.kind] ?? 0) - (kindOrder[b.kind] ?? 0),
            );
            return [...content, ...errors];
        });
    }

    /**
     * A schema's rows: one group per kind, labelled with its count, when
     * there are at least two kinds; otherwise the flat list.
     */
    async schemaChildren(schema: NodeOfKind<"schema">): Promise<UnityCatalogTreeNode[]> {
        return groupSchemaContents(schema, await this.schemaContents(schema));
    }

    async groupChildren(group: NodeOfKind<"group">): Promise<UnityCatalogTreeNode[]> {
        const contents = await this.schemaContents({
            catalogName: group.catalogName,
            name: group.schemaName,
            fullName: group.schemaFullName,
        });
        return contents.filter((n) => n.kind === GROUP_KINDS[group.groupType]);
    }

    modelVersions(model: NodeOfKind<"registeredModel">): Promise<UnityCatalogTreeNode[]> {
        return this.cached(`versions:${model.fullName}`, async () => {
            try {
                const rows = await listAll(
                    (pageToken) =>
                        this.connection.api
                            .get(RegisteredModelsClient)
                            .listModelVersions(
                                { fullNameArg: pathValue(model.fullName), pageToken },
                                calls.read(),
                            ),
                    (r) => r.modelVersions,
                );
                const nodes = rows
                    .filter((v) => v.version !== undefined)
                    .map((v) =>
                        mapModelVersion(
                            v,
                            model.catalogName,
                            model.schemaName,
                            model.name,
                            model.fullName,
                        ),
                    )
                    .sort((a, b) => b.version - a.version);
                return nodes.length > 0 ? nodes : emptyNode("No versions");
            } catch (e) {
                return this.errorNode(e, "model versions");
            }
        });
    }

    /**
     * A table's columns, by position. They come with the table's list; a
     * table without them (a favorite) is fetched. Nothing when that fails.
     */
    columns(table: NodeOfKind<"table">): Promise<UnityCatalogTreeNode[]> {
        return this.cached(`columns:${table.fullName}`, async () => {
            let columns: ColumnData[] | undefined = table.columns;
            if (!columns?.length) {
                try {
                    const t = await this.connection.api
                        .get(TablesClient)
                        .getTable({ fullNameArg: pathValue(table.fullName) }, calls.read());
                    columns = (t.columns ?? []).filter((c) => c.name).map(mapColumn);
                } catch (e) {
                    this.log.error(`Unity Catalog: Failed to load columns of ${table.fullName}`, e);
                    return [{ kind: "error", message: "Failed to load columns" }];
                }
            }
            return [...columns]
                .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
                .map((col) => ({ kind: "column" as const, tableFullName: table.fullName, ...col }));
        });
    }

    /** A pinned securable, fetched by name. "gone" when it no longer exists. */
    async favorite(ref: StoredFavoriteRef): Promise<FavoriteNodeResult> {
        const api = this.connection.api;
        const [catalog = "", schema = "", model = ""] = ref.fullName.split(".");
        try {
            switch (ref.kind) {
                case "catalog": {
                    const c = await api
                        .get(CatalogsClient)
                        .getCatalog({ nameArg: pathValue(ref.fullName) }, calls.read());
                    return c.name
                        ? { status: "ok", node: mapCatalog(c, this.userName) }
                        : { status: "gone" };
                }
                case "schema": {
                    const s = await api
                        .get(SchemasClient)
                        .getSchema({ fullNameArg: pathValue(ref.fullName) }, calls.read());
                    return s.name
                        ? { status: "ok", node: mapSchema(s, catalog, this.userName) }
                        : { status: "gone" };
                }
                case "table": {
                    const t = await api
                        .get(TablesClient)
                        .getTable({ fullNameArg: pathValue(ref.fullName) }, calls.read());
                    return t.name
                        ? { status: "ok", node: mapTable(t, catalog, schema) }
                        : { status: "gone" };
                }
                case "volume": {
                    const v = await api
                        .get(VolumesClient)
                        .getVolume({ fullNameArg: pathValue(ref.fullName) }, calls.read());
                    return v.name
                        ? { status: "ok", node: mapVolume(v, catalog, schema) }
                        : { status: "gone" };
                }
                case "function": {
                    const f = await api
                        .get(FunctionsClient)
                        .getFunction({ fullNameArg: pathValue(ref.fullName) }, calls.read());
                    return f.name
                        ? { status: "ok", node: mapFunction(f, catalog, schema) }
                        : { status: "gone" };
                }
                case "registeredModel": {
                    const m = await api
                        .get(RegisteredModelsClient)
                        .getRegisteredModel({ fullNameArg: pathValue(ref.fullName) }, calls.read());
                    return m.name
                        ? { status: "ok", node: mapRegisteredModel(m, catalog, schema) }
                        : { status: "gone" };
                }
                case "modelVersion": {
                    const mv = await api.get(RegisteredModelsClient).getModelVersion(
                        {
                            fullNameArg: pathValue(ref.fullName),
                            versionArg: BigInt(ref.version),
                        },
                        calls.read(),
                    );
                    return mv.version === undefined
                        ? { status: "gone" }
                        : {
                              status: "ok",
                              node: mapModelVersion(mv, catalog, schema, model, ref.fullName),
                          };
                }
            }
        } catch (e) {
            if (isNotFound(e)) {
                return { status: "gone" };
            }
            this.log.error(`Unity Catalog: Failed to load favorite ${ref.fullName}`, e);
            return { status: "error", ref };
        }
    }

    /** What the tree already loaded below a catalog, schema or model, for the detail panel. */
    async loadedChildren(node: UnityCatalogTreeNode): Promise<UnityCatalogTreeNode[] | undefined> {
        const key =
            node.kind === "catalog"
                ? `schemas:${node.fullName}`
                : node.kind === "schema"
                  ? `contents:${node.fullName}`
                  : node.kind === "registeredModel"
                    ? `versions:${node.fullName}`
                    : undefined;
        return key === undefined ? undefined : this.cache.peek(key);
    }

    /** The node's page in Catalog Explorer, as before. */
    exploreUrl(node: UnityCatalogTreeNode): string | undefined {
        if (!("fullName" in node)) {
            return undefined;
        }
        // A name may hold `#` or `?`, which would end the page's path.
        const fullNamePath = node.fullName.split(".").map(encodeURIComponent).join("/");
        const path =
            node.kind === "registeredModel"
                ? `models/${fullNamePath}`
                : node.kind === "modelVersion"
                  ? `models/${fullNamePath}/version/${node.version}`
                  : node.kind === "function"
                    ? `functions/${fullNamePath}`
                    : node.kind === "volume"
                      ? `volumes/${fullNamePath}`
                      : fullNamePath;
        return `${this.connection.host.replace(/\/+$/, "")}/explore/data/${path}`;
    }

    /** `databricks.unityCatalog.refresh`: everything loads again. */
    refresh(): void {
        this.cache.clear();
    }

    /** `databricks.unityCatalog.refreshNode`: the node's own list loads again. */
    refreshNode(node: UnityCatalogTreeNode): void {
        if (node.kind === "group") {
            this.cache.delete(`contents:${node.schemaFullName}`);
        } else if (node.kind === "catalog") {
            this.cache.delete(`schemas:${node.fullName}`);
        } else if (node.kind === "schema") {
            this.cache.delete(`contents:${node.fullName}`);
        } else if (node.kind === "registeredModel") {
            this.cache.delete(`versions:${node.fullName}`);
        } else if (node.kind === "table") {
            this.cache.delete(`columns:${node.fullName}`);
        }
    }

    private cached(
        key: string,
        load: () => Promise<UnityCatalogTreeNode[]>,
    ): Promise<UnityCatalogTreeNode[]> {
        const hit = this.cache.get(key);
        if (hit !== undefined) {
            return hit;
        }
        const value = load();
        this.cache.set(key, value);
        // A list with an error row isn't kept: expanding again retries.
        void value.then((nodes) => {
            if (nodes.some((n) => n.kind === "error") && this.cache.peek(key) === value) {
                this.cache.delete(key);
            }
        });
        return value;
    }

    private errorNode(e: unknown, resource: string): UnityCatalogTreeNode[] {
        const message =
            e instanceof ApiError
                ? `Failed to load ${resource}: ${e.message}`
                : `Failed to load ${resource}`;
        this.log.error(`Unity Catalog: ${message}`, e);
        return [{ kind: "error", message }];
    }
}

/** The old grouping rule: groups only when a schema holds at least two kinds. */
export function groupSchemaContents(
    schema: Pick<NodeOfKind<"schema">, "catalogName" | "name" | "fullName">,
    contents: UnityCatalogTreeNode[],
): UnityCatalogTreeNode[] {
    if (contents.length === 1 && contents[0]!.kind === "empty") {
        return contents;
    }
    const errors = contents.filter((n) => n.kind === "error");
    const groups = (Object.keys(GROUP_KINDS) as GroupType[])
        .map((groupType) => ({
            groupType,
            count: contents.filter((n) => n.kind === GROUP_KINDS[groupType]).length,
        }))
        .filter((g) => g.count > 0);
    if (groups.length <= 1) {
        const kinds = Object.values(GROUP_KINDS);
        return [...kinds.flatMap((kind) => contents.filter((n) => n.kind === kind)), ...errors];
    }
    return [
        ...groups.map(({ groupType, count }): UnityCatalogTreeNode => ({
            kind: "group",
            groupType,
            count,
            catalogName: schema.catalogName,
            schemaName: schema.name,
            schemaFullName: schema.fullName,
        })),
        ...errors,
    ];
}

/** Every page of a list call. Stops if the API repeats a page token. */
export async function listAll<R extends { nextPageToken?: string | undefined }, T>(
    page: (pageToken: string | undefined) => Promise<R>,
    items: (response: R) => T[] | undefined,
): Promise<T[]> {
    const out: T[] = [];
    const seen = new Set<string>();
    let token: string | undefined;
    for (;;) {
        const response = await page(token);
        out.push(...(items(response) ?? []));
        token = response.nextPageToken || undefined;
        if (token === undefined || seen.has(token)) {
            return out;
        }
        seen.add(token);
    }
}

function compareOwnedFirst(
    a: { owned?: boolean; name: string },
    b: { owned?: boolean; name: string },
): number {
    if (a.owned && !b.owned) {
        return -1;
    }
    if (!a.owned && b.owned) {
        return 1;
    }
    return a.name.localeCompare(b.name);
}

function nameOf(n: UnityCatalogTreeNode): string {
    return "name" in n ? n.name : "";
}

function emptyNode(message: string): UnityCatalogTreeNode[] {
    return [{ kind: "empty", message }];
}
