/* eslint-disable @typescript-eslint/naming-convention */
import {ApiError, logging, type iam} from "@databricks/sdk-experimental";
import {ConnectionManager} from "../../configuration/ConnectionManager";
import {Loggers} from "../../logger";
import {
    mapCatalog,
    mapSchema,
    mapTable,
    mapVolume,
    mapFunction,
    mapRegisteredModel,
    mapModelVersion,
} from "./mappers";
import {StoredFavoriteRef, UnityCatalogTreeNode} from "./types";
import {drainAsyncIterable} from "./utils";

const logger = logging.NamedLogger.getOrCreate(Loggers.Extension);

type Client = NonNullable<ConnectionManager["workspaceClient"]>;

function compareOwnedFirst(
    a: {owned?: boolean; name: string},
    b: {owned?: boolean; name: string}
): number {
    if (a.owned && !b.owned) {
        return -1;
    }
    if (!a.owned && b.owned) {
        return 1;
    }
    return a.name.localeCompare(b.name);
}

function nodeName(n: UnityCatalogTreeNode): string {
    return (n as {name?: string}).name ?? "";
}

function emptyNode(message: string): UnityCatalogTreeNode[] {
    return [{kind: "empty", message}];
}

function errorNode(e: unknown, resource: string): UnityCatalogTreeNode[] {
    const message =
        e instanceof ApiError
            ? `Failed to load ${resource}: ${e.message}`
            : `Failed to load ${resource}`;
    logger.error(`Unity Catalog: ${message}`, e);
    return [{kind: "error", message}];
}

export async function loadCatalogs(
    client: Client,
    currentUser: iam.User | undefined
): Promise<UnityCatalogTreeNode[]> {
    try {
        const rows = await drainAsyncIterable(client.catalogs.list({}));
        const result = rows
            .filter((c) => c.name)
            .map((c) => mapCatalog(c, currentUser))
            .sort(compareOwnedFirst);
        return result.length > 0 ? result : emptyNode("No catalogs found");
    } catch (e) {
        return errorNode(e, "catalogs");
    }
}

export async function loadSchemas(
    client: Client,
    catalogName: string,
    currentUser: iam.User | undefined
): Promise<UnityCatalogTreeNode[]> {
    try {
        const rows = await drainAsyncIterable(
            client.schemas.list({catalog_name: catalogName})
        );
        const result = rows
            .filter((s) => s.name)
            .map((s) => mapSchema(s, catalogName, currentUser))
            .sort(compareOwnedFirst);
        return result.length > 0 ? result : emptyNode("No schemas");
    } catch (e) {
        return errorNode(e, "schemas");
    }
}

export async function loadSchemaChildren(
    client: Client,
    catalogName: string,
    schemaName: string
): Promise<UnityCatalogTreeNode[]> {
    const [tablesResult, volumesResult, functionsResult, modelsResult] =
        await Promise.allSettled([
            drainAsyncIterable(
                client.tables.list({
                    catalog_name: catalogName,
                    schema_name: schemaName,
                })
            ),
            drainAsyncIterable(
                client.volumes.list({
                    catalog_name: catalogName,
                    schema_name: schemaName,
                })
            ),
            drainAsyncIterable(
                client.functions.list({
                    catalog_name: catalogName,
                    schema_name: schemaName,
                })
            ),
            drainAsyncIterable(
                client.registeredModels.list({
                    catalog_name: catalogName,
                    schema_name: schemaName,
                })
            ),
        ]);

    const tableNodes: UnityCatalogTreeNode[] =
        tablesResult.status === "fulfilled"
            ? tablesResult.value
                  .filter((t) => t.name)
                  .map((t) => mapTable(t, catalogName, schemaName))
            : [];

    const volumeNodes: UnityCatalogTreeNode[] =
        volumesResult.status === "fulfilled"
            ? volumesResult.value
                  .filter((v) => v.name)
                  .map((v) => mapVolume(v, catalogName, schemaName))
            : [];

    const functionNodes: UnityCatalogTreeNode[] =
        functionsResult.status === "fulfilled"
            ? functionsResult.value
                  .filter((f) => f.name)
                  .map((f) => mapFunction(f, catalogName, schemaName))
            : [];

    const modelNodes: UnityCatalogTreeNode[] =
        modelsResult.status === "fulfilled"
            ? modelsResult.value
                  .filter((m) => m.name)
                  .map((m) => mapRegisteredModel(m, catalogName, schemaName))
            : [];

    const errNodes: UnityCatalogTreeNode[] = (
        [
            [tablesResult, "tables"],
            [volumesResult, "volumes"],
            [functionsResult, "functions"],
            [modelsResult, "registered models"],
        ] as const
    ).flatMap(([result, label]) =>
        result.status === "rejected" ? errorNode(result.reason, label) : []
    );

    const kindOrder = {
        table: 0,
        volume: 1,
        function: 2,
        registeredModel: 3,
    } as Record<string, number>;
    const contentNodes = [
        ...tableNodes,
        ...volumeNodes,
        ...functionNodes,
        ...modelNodes,
    ];
    if (contentNodes.length === 0 && errNodes.length === 0) {
        return emptyNode("No data");
    }
    return [
        ...contentNodes.sort((a, b) => {
            const c = nodeName(a).localeCompare(nodeName(b));
            if (c !== 0) {
                return c;
            }
            return (kindOrder[a.kind] ?? 0) - (kindOrder[b.kind] ?? 0);
        }),
        ...errNodes,
    ];
}

export async function loadFavoriteNode(
    client: Client,
    ref: StoredFavoriteRef,
    currentUser: iam.User | undefined
): Promise<UnityCatalogTreeNode | null> {
    try {
        switch (ref.kind) {
            case "catalog": {
                const c = await client.catalogs.get({name: ref.fullName});
                if (!c.name) {
                    return null;
                }
                return mapCatalog(c, currentUser);
            }
            case "schema": {
                const s = await client.schemas.get({full_name: ref.fullName});
                if (!s.name) {
                    return null;
                }
                const catalogName = ref.fullName.split(".")[0];
                return mapSchema(s, catalogName, currentUser);
            }
            case "table": {
                const t = await client.tables.get({full_name: ref.fullName});
                if (!t.name) {
                    return null;
                }
                const [tCatalog, tSchema] = ref.fullName.split(".");
                return mapTable(t, tCatalog, tSchema);
            }
            case "volume": {
                const v = await client.volumes.read({name: ref.fullName});
                if (!v.name) {
                    return null;
                }
                const [vCatalog, vSchema] = ref.fullName.split(".");
                return mapVolume(v, vCatalog, vSchema);
            }
            case "function": {
                const f = await client.functions.get({name: ref.fullName});
                if (!f.name) {
                    return null;
                }
                const [fCatalog, fSchema] = ref.fullName.split(".");
                return mapFunction(f, fCatalog, fSchema);
            }
            case "registeredModel": {
                const m = await client.registeredModels.get({
                    full_name: ref.fullName,
                });
                if (!m.name) {
                    return null;
                }
                const [mCatalog, mSchema] = ref.fullName.split(".");
                return mapRegisteredModel(m, mCatalog, mSchema);
            }
            case "modelVersion": {
                const mv = await client.modelVersions.get({
                    full_name: ref.fullName,
                    version: ref.version,
                });
                if (mv.version === undefined) {
                    return null;
                }
                const [mvCatalog, mvSchema, mvModel] = ref.fullName.split(".");
                return mapModelVersion(
                    mv,
                    mvCatalog,
                    mvSchema,
                    mvModel,
                    ref.fullName
                );
            }
        }
    } catch {
        return null;
    }
}

export async function loadModelVersions(
    client: Client,
    model: Extract<UnityCatalogTreeNode, {kind: "registeredModel"}>
): Promise<UnityCatalogTreeNode[]> {
    try {
        const rows = await drainAsyncIterable(
            client.modelVersions.list({full_name: model.fullName})
        );
        const nodes = rows
            .filter((v) => v.version !== undefined)
            .map((v) =>
                mapModelVersion(
                    v,
                    model.catalogName,
                    model.schemaName,
                    model.name,
                    model.fullName
                )
            )
            .sort((a, b) => b.version - a.version);
        return nodes.length > 0 ? nodes : emptyNode("No versions");
    } catch (e) {
        return errorNode(e, "model versions");
    }
}
