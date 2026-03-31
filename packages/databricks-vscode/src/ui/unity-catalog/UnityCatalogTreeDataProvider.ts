/* eslint-disable @typescript-eslint/naming-convention */
import {ApiError, logging} from "@databricks/sdk-experimental";
import {Disposable, EventEmitter, TreeDataProvider} from "vscode";
import {ConnectionManager} from "../../configuration/ConnectionManager";
import {Loggers} from "../../logger";
import {buildTreeItem} from "./nodeRenderer";
import {UnityCatalogTreeItem, UnityCatalogTreeNode} from "./types";

export type {
    ColumnData,
    UnityCatalogTreeItem,
    UnityCatalogTreeNode,
} from "./types";

const logger = logging.NamedLogger.getOrCreate(Loggers.Extension);

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

    constructor(private readonly connectionManager: ConnectionManager) {
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
        if (node.kind === "error" || node.kind === "column") {
            return undefined;
        }
        const fullNamePath = node.fullName.replaceAll(".", "/");
        const path =
            node.kind === "function"
                ? `functions/${fullNamePath}`
                : fullNamePath;
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
            return rows
                .filter((c) => c.name)
                .map((c) => ({
                    kind: "catalog" as const,
                    name: c.name!,
                    fullName: c.full_name ?? c.name!,
                    comment: c.comment,
                }))
                .sort((a, b) => a.name.localeCompare(b.name));
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
            return rows
                .filter((s) => s.name)
                .map((s) => ({
                    kind: "schema" as const,
                    catalogName,
                    name: s.name!,
                    fullName: s.full_name ?? `${catalogName}.${s.name}`,
                    comment: s.comment,
                }))
                .sort((a, b) => a.name.localeCompare(b.name));
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
            const [tableRows, volumeRows, functionRows] = await Promise.all([
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

            const kindOrder = {table: 0, volume: 1, function: 2} as Record<
                string,
                number
            >;
            return [...tableNodes, ...volumeNodes, ...functionNodes].sort(
                (a, b) => {
                    const an =
                        a.kind === "table" ||
                        a.kind === "volume" ||
                        a.kind === "function"
                            ? a.name
                            : "";
                    const bn =
                        b.kind === "table" ||
                        b.kind === "volume" ||
                        b.kind === "function"
                            ? b.name
                            : "";
                    const c = an.localeCompare(bn);
                    if (c !== 0) {
                        return c;
                    }
                    return (kindOrder[a.kind] ?? 0) - (kindOrder[b.kind] ?? 0);
                }
            );
        } catch (e) {
            return this.errorChildren(e, "tables, volumes, and functions");
        }
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
