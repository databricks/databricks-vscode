/* eslint-disable @typescript-eslint/naming-convention */
import {ApiError, logging, type iam} from "@databricks/sdk-experimental";
import {ConnectionManager} from "../../configuration/ConnectionManager";
import {Loggers} from "../../logger";
import {UnityCatalogTreeNode} from "./types";
import {drainAsyncIterable, isOwnedByUser} from "./utils";

const logger = logging.NamedLogger.getOrCreate(Loggers.Extension);

type Client = NonNullable<ConnectionManager["workspaceClient"]>;

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
            .map((c) => ({
                kind: "catalog" as const,
                name: c.name!,
                fullName: c.full_name ?? c.name!,
                comment: c.comment,
                owner: c.owner,
                owned: isOwnedByUser(c.owner, currentUser),
            }))
            .sort((a, b) => {
                if (a.owned && !b.owned) {
                    return -1;
                }
                if (!a.owned && b.owned) {
                    return 1;
                }
                return a.name.localeCompare(b.name);
            });
        return result.length > 0 ? result : emptyNode("No catalogs found");
    } catch (e) {
        return errorNode(e, "catalogs");
    }
}

export async function loadSchemas(
    client: Client,
    catalogName: string,
    currentUser: iam.User | undefined,
    pinnedSchemas: Set<string>
): Promise<UnityCatalogTreeNode[]> {
    try {
        const rows = await drainAsyncIterable(
            client.schemas.list({catalog_name: catalogName})
        );
        const result = rows
            .filter((s) => s.name)
            .map((s) => {
                const fullName = s.full_name ?? `${catalogName}.${s.name}`;
                return {
                    kind: "schema" as const,
                    catalogName,
                    name: s.name!,
                    fullName,
                    comment: s.comment,
                    owner: s.owner,
                    pinned: pinnedSchemas.has(fullName),
                    owned: isOwnedByUser(s.owner, currentUser),
                };
            })
            .sort((a, b) => {
                const rank = (n: typeof a) => (n.pinned ? 0 : n.owned ? 1 : 2);
                const r = rank(a) - rank(b);
                if (r !== 0) {
                    return r;
                }
                return a.name.localeCompare(b.name);
            });
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
                  .map((t) => ({
                      kind: "table" as const,
                      catalogName,
                      schemaName,
                      name: t.name!,
                      fullName:
                          t.full_name ??
                          `${catalogName}.${schemaName}.${t.name}`,
                      tableType: t.table_type,
                      comment: t.comment,
                      dataSourceFormat: t.data_source_format,
                      storageLocation: t.storage_location,
                      viewDefinition: t.view_definition,
                      owner: t.owner,
                      createdBy: t.created_by,
                      createdAt: t.created_at,
                      updatedAt: t.updated_at,
                      columns: (t.columns ?? []).map((col) => ({
                          name: col.name!,
                          typeName: col.type_name,
                          typeText: col.type_text,
                          comment: col.comment,
                          nullable: col.nullable,
                          position: col.position,
                      })),
                  }))
            : [];

    const volumeNodes: UnityCatalogTreeNode[] =
        volumesResult.status === "fulfilled"
            ? volumesResult.value
                  .filter((v) => v.name)
                  .map((v) => ({
                      kind: "volume" as const,
                      catalogName,
                      schemaName,
                      name: v.name!,
                      fullName:
                          v.full_name ??
                          `${catalogName}.${schemaName}.${v.name}`,
                      volumeType: v.volume_type,
                      storageLocation: v.storage_location,
                      comment: v.comment,
                      owner: v.owner,
                  }))
            : [];

    const functionNodes: UnityCatalogTreeNode[] =
        functionsResult.status === "fulfilled"
            ? functionsResult.value
                  .filter((f) => f.name)
                  .map((f) => ({
                      kind: "function" as const,
                      catalogName,
                      schemaName,
                      name: f.name!,
                      fullName: `${catalogName}.${schemaName}.${f.name}`,
                  }))
            : [];

    const modelNodes: UnityCatalogTreeNode[] =
        modelsResult.status === "fulfilled"
            ? modelsResult.value
                  .filter((m) => m.name)
                  .map((m) => ({
                      kind: "registeredModel" as const,
                      catalogName,
                      schemaName,
                      name: m.name!,
                      fullName:
                          m.full_name ??
                          `${catalogName}.${schemaName}.${m.name}`,
                      comment: m.comment,
                      owner: m.owner,
                      storageLocation: m.storage_location,
                      aliases: m.aliases?.map((a) => ({
                          alias_name: a.alias_name,
                          version_num: a.version_num,
                      })),
                      createdAt: m.created_at,
                      updatedAt: m.updated_at,
                  }))
            : [];

    const errNodes: UnityCatalogTreeNode[] = [
        ...(tablesResult.status === "rejected"
            ? errorNode(tablesResult.reason, "tables")
            : []),
        ...(volumesResult.status === "rejected"
            ? errorNode(volumesResult.reason, "volumes")
            : []),
        ...(functionsResult.status === "rejected"
            ? errorNode(functionsResult.reason, "functions")
            : []),
        ...(modelsResult.status === "rejected"
            ? errorNode(modelsResult.reason, "registered models")
            : []),
    ];

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
        return emptyNode("No items");
    }
    return [
        ...contentNodes.sort((a, b) => {
            const an =
                a.kind === "table" ||
                a.kind === "volume" ||
                a.kind === "function" ||
                a.kind === "registeredModel"
                    ? a.name
                    : "";
            const bn =
                b.kind === "table" ||
                b.kind === "volume" ||
                b.kind === "function" ||
                b.kind === "registeredModel"
                    ? b.name
                    : "";
            const c = an.localeCompare(bn);
            if (c !== 0) {
                return c;
            }
            return (kindOrder[a.kind] ?? 0) - (kindOrder[b.kind] ?? 0);
        }),
        ...errNodes,
    ];
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
            .map((v) => ({
                kind: "modelVersion" as const,
                catalogName: model.catalogName,
                schemaName: model.schemaName,
                modelName: model.name,
                fullName: model.fullName,
                version: v.version!,
                comment: v.comment,
                status: v.status,
                storageLocation: v.storage_location,
                createdAt: v.created_at,
                createdBy: v.created_by,
            }))
            .sort((a, b) => b.version - a.version);
        return nodes.length > 0 ? nodes : emptyNode("No versions");
    } catch (e) {
        return errorNode(e, "model versions");
    }
}
