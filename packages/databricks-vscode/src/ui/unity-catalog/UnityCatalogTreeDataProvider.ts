/* eslint-disable @typescript-eslint/naming-convention */
import {ApiError, logging, type iam} from "@databricks/sdk-experimental";
import {Disposable, EventEmitter, TreeDataProvider} from "vscode";
import {ConnectionManager} from "../../configuration/ConnectionManager";
import {Loggers} from "../../logger";
import {buildTreeItem} from "./nodeRenderer";
import {UnityCatalogTreeItem, UnityCatalogTreeNode} from "./types";
import {StateStorage} from "../../vscode-objs/StateStorage";

export type {
    ColumnData,
    UnityCatalogTreeItem,
    UnityCatalogTreeNode,
} from "./types";

const logger = logging.NamedLogger.getOrCreate(Loggers.Extension);

function isOwnedByUser(
    owner: string | undefined,
    user: iam.User | undefined
): boolean {
    if (!owner || !user) {
        return false;
    }
    if (owner === user.userName) {
        return true;
    }
    // TODO: Check if user is owner through group? like: return (user.groups ?? []).some((g) => g.display === owner);
    return false;
}

async function drainAsyncIterable<T>(iter: AsyncIterable<T>): Promise<T[]> {
    const out: T[] = [];
    for await (const item of iter) {
        out.push(item);
    }
    return out;
}

export class UnityCatalogTreeDataProvider
    implements TreeDataProvider<UnityCatalogTreeNode>, Disposable
{
    private readonly _onDidChangeTreeData = new EventEmitter<
        UnityCatalogTreeNode | undefined | void
    >();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    private readonly disposables: Disposable[] = [];

    constructor(
        private readonly connectionManager: ConnectionManager,
        private readonly stateStorage: StateStorage
    ) {
        this.disposables.push(
            this.connectionManager.onDidChangeState(() => {
                this._onDidChangeTreeData.fire(undefined);
            })
        );
    }

    private getExploreUrl(path: string): string | undefined {
        const host = this.connectionManager.databricksWorkspace?.host;
        if (!host) {
            return undefined;
        }
        return `${host.toString()}explore/data/${path}`;
    }

    getNodeExploreUrl(node: UnityCatalogTreeNode): string | undefined {
        if (
            node.kind === "error" ||
            node.kind === "column" ||
            node.kind === "empty"
        ) {
            return undefined;
        }
        const fullNamePath = node.fullName.replaceAll(".", "/");
        let path = fullNamePath;
        switch (node.kind) {
            case "registeredModel":
                path = `models/${fullNamePath}`;
                break;
            case "modelVersion":
                path = `models/${fullNamePath}/version/${node.version}`;
                break;
            case "function":
                path = `functions/${fullNamePath}`;
                break;
        }
        return this.getExploreUrl(path);
    }

    getTreeItem(element: UnityCatalogTreeNode): UnityCatalogTreeItem {
        return buildTreeItem(element, this.getNodeExploreUrl(element));
    }

    getChildren(
        element?: UnityCatalogTreeNode
    ): Thenable<UnityCatalogTreeNode[] | undefined> {
        const client = this.connectionManager.workspaceClient;
        if (!client) {
            return Promise.resolve(undefined);
        }

        if (!element) {
            return this.listCatalogs(client);
        }

        if (element.kind === "error") {
            return Promise.resolve(undefined);
        }

        if (element.kind === "catalog") {
            return this.listSchemas(client, element.name);
        }

        if (element.kind === "schema") {
            return this.listSchemaChildren(
                client,
                element.catalogName,
                element.name
            );
        }

        if (element.kind === "registeredModel") {
            return this.listModelVersions(client, element);
        }

        if (element.kind === "table") {
            if (!element.columns?.length) {
                return Promise.resolve(undefined);
            }
            return Promise.resolve(
                [...element.columns]
                    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
                    .map((col) => ({
                        kind: "column" as const,
                        tableFullName: element.fullName,
                        name: col.name,
                        typeName: col.typeName,
                        typeText: col.typeText,
                        comment: col.comment,
                        nullable: col.nullable,
                        position: col.position,
                    }))
            );
        }

        return Promise.resolve(undefined);
    }

    private async listCatalogs(
        client: NonNullable<ConnectionManager["workspaceClient"]>
    ): Promise<UnityCatalogTreeNode[] | undefined> {
        try {
            const rows = await drainAsyncIterable(client.catalogs.list({}));
            const currentUser =
                this.connectionManager.databricksWorkspace?.user;
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
            return result.length > 0
                ? result
                : this.emptyNode("No catalogs found");
        } catch (e) {
            return this.errorChildren(e, "catalogs");
        }
    }

    private async listSchemas(
        client: NonNullable<ConnectionManager["workspaceClient"]>,
        catalogName: string
    ): Promise<UnityCatalogTreeNode[] | undefined> {
        try {
            const rows = await drainAsyncIterable(
                client.schemas.list({catalog_name: catalogName})
            );
            const currentUser =
                this.connectionManager.databricksWorkspace?.user;
            const pinned = new Set(
                this.stateStorage.get(
                    "databricks.unityCatalog.pinnedSchemas"
                ) ?? []
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
                        pinned: pinned.has(fullName),
                        owned: isOwnedByUser(s.owner, currentUser),
                    };
                })
                .sort((a, b) => {
                    const rank = (n: typeof a) =>
                        n.pinned ? 0 : n.owned ? 1 : 2;
                    const r = rank(a) - rank(b);
                    if (r !== 0) {
                        return r;
                    }
                    return a.name.localeCompare(b.name);
                });
            return result.length > 0 ? result : this.emptyNode("No schemas");
        } catch (e) {
            return this.errorChildren(e, "schemas");
        }
    }

    private async listSchemaChildren(
        client: NonNullable<ConnectionManager["workspaceClient"]>,
        catalogName: string,
        schemaName: string
    ): Promise<UnityCatalogTreeNode[] | undefined> {
        try {
            const [tableRows, volumeRows, functionRows, modelRows] =
                await Promise.all([
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

            const tableNodes: UnityCatalogTreeNode[] = tableRows
                .filter((t) => t.name)
                .map((t) => ({
                    kind: "table" as const,
                    catalogName,
                    schemaName,
                    name: t.name!,
                    fullName:
                        t.full_name ?? `${catalogName}.${schemaName}.${t.name}`,
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
                }));

            const volumeNodes: UnityCatalogTreeNode[] = volumeRows
                .filter((v) => v.name)
                .map((v) => ({
                    kind: "volume" as const,
                    catalogName,
                    schemaName,
                    name: v.name!,
                    fullName:
                        v.full_name ?? `${catalogName}.${schemaName}.${v.name}`,
                    volumeType: v.volume_type,
                    storageLocation: v.storage_location,
                    comment: v.comment,
                    owner: v.owner,
                }));

            const functionNodes: UnityCatalogTreeNode[] = functionRows
                .filter((f) => f.name)
                .map((f) => ({
                    kind: "function" as const,
                    catalogName,
                    schemaName,
                    name: f.name!,
                    fullName: `${catalogName}.${schemaName}.${f.name}`,
                }));

            const modelNodes: UnityCatalogTreeNode[] = modelRows
                .filter((m) => m.name)
                .map((m) => ({
                    kind: "registeredModel" as const,
                    catalogName,
                    schemaName,
                    name: m.name!,
                    fullName:
                        m.full_name ?? `${catalogName}.${schemaName}.${m.name}`,
                    comment: m.comment,
                    owner: m.owner,
                    storageLocation: m.storage_location,
                    aliases: m.aliases?.map((a) => ({
                        alias_name: a.alias_name,
                        version_num: a.version_num,
                    })),
                    createdAt: m.created_at,
                    updatedAt: m.updated_at,
                }));

            const kindOrder = {
                table: 0,
                volume: 1,
                function: 2,
                registeredModel: 3,
            } as Record<string, number>;
            const combined = [
                ...tableNodes,
                ...volumeNodes,
                ...functionNodes,
                ...modelNodes,
            ];
            if (combined.length === 0) {
                return this.emptyNode("No items");
            }
            return combined.sort((a, b) => {
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
            });
        } catch (e) {
            return this.errorChildren(
                e,
                "tables, volumes, functions, and registered models"
            );
        }
    }

    private async listModelVersions(
        client: NonNullable<ConnectionManager["workspaceClient"]>,
        model: Extract<UnityCatalogTreeNode, {kind: "registeredModel"}>
    ): Promise<UnityCatalogTreeNode[] | undefined> {
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
            return nodes.length > 0 ? nodes : this.emptyNode("No versions");
        } catch (e) {
            return this.errorChildren(e, "model versions");
        }
    }

    private emptyNode(message: string): UnityCatalogTreeNode[] {
        return [{kind: "empty", message}];
    }

    private errorChildren(
        e: unknown,
        resource: string
    ): UnityCatalogTreeNode[] | undefined {
        const message =
            e instanceof ApiError
                ? `Failed to load ${resource}: ${e.message}`
                : `Failed to load ${resource}`;
        logger.error(`Unity Catalog: ${message}`, e);
        return [{kind: "error", message}];
    }

    async pinSchema(
        node: Extract<UnityCatalogTreeNode, {kind: "schema"}>
    ): Promise<void> {
        const current =
            this.stateStorage.get("databricks.unityCatalog.pinnedSchemas") ??
            [];
        if (!current.includes(node.fullName)) {
            await this.stateStorage.set(
                "databricks.unityCatalog.pinnedSchemas",
                [...current, node.fullName]
            );
        }
        this._onDidChangeTreeData.fire(undefined);
    }

    async unpinSchema(
        node: Extract<UnityCatalogTreeNode, {kind: "schema"}>
    ): Promise<void> {
        const current =
            this.stateStorage.get("databricks.unityCatalog.pinnedSchemas") ??
            [];
        await this.stateStorage.set(
            "databricks.unityCatalog.pinnedSchemas",
            current.filter((n) => n !== node.fullName)
        );
        this._onDidChangeTreeData.fire(undefined);
    }

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    refreshNode(element: UnityCatalogTreeNode): void {
        this._onDidChangeTreeData.fire(element);
    }

    dispose(): void {
        this.disposables.forEach((d) => d.dispose());
    }
}
