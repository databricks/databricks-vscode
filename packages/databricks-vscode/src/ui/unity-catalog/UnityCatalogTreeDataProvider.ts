/* eslint-disable @typescript-eslint/naming-convention */
import {ApiError, logging} from "@databricks/sdk-experimental";
import {
    Disposable,
    EventEmitter,
    MarkdownString,
    ThemeColor,
    ThemeIcon,
    TreeDataProvider,
    TreeItem,
    TreeItemCollapsibleState,
} from "vscode";
import {ConnectionManager} from "../../configuration/ConnectionManager";
import {Loggers} from "../../logger";

const logger = logging.NamedLogger.getOrCreate(Loggers.Extension);

export interface ColumnData {
    name: string;
    typeName?: string;
    typeText?: string;
    comment?: string;
    nullable?: boolean;
    position?: number;
}

export type UnityCatalogTreeNode =
    | {kind: "catalog"; name: string; fullName: string; comment?: string}
    | {
          kind: "schema";
          catalogName: string;
          name: string;
          fullName: string;
          comment?: string;
      }
    | {
          kind: "table";
          catalogName: string;
          schemaName: string;
          name: string;
          fullName: string;
          tableType?: string;
          comment?: string;
          dataSourceFormat?: string;
          storageLocation?: string;
          viewDefinition?: string;
          owner?: string;
          createdBy?: string;
          createdAt?: number;
          updatedAt?: number;
          columns?: ColumnData[];
      }
    | {
          kind: "volume";
          catalogName: string;
          schemaName: string;
          name: string;
          fullName: string;
          volumeType?: string;
          storageLocation?: string;
          comment?: string;
          owner?: string;
      }
    | {
          kind: "function";
          catalogName: string;
          schemaName: string;
          name: string;
          fullName: string;
      }
    | {
          kind: "column";
          tableFullName: string;
          name: string;
          typeName?: string;
          typeText?: string;
          comment?: string;
          nullable?: boolean;
          position?: number;
      }
    | {kind: "error"; message: string};

export interface UnityCatalogTreeItem extends TreeItem {
    url?: string;
    copyText?: string;
    storageLocation?: string;
    viewDefinition?: string;
}

async function drainAsyncIterable<T>(iter: AsyncIterable<T>): Promise<T[]> {
    const out: T[] = [];
    for await (const item of iter) {
        out.push(item);
    }
    return out;
}

function formatTs(ms: number | undefined): string | undefined {
    if (ms === undefined) {
        return undefined;
    }
    return (
        new Date(ms).toISOString().replace("T", " ").substring(0, 19) + " UTC"
    );
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
        if (element.kind === "error") {
            return {
                label: element.message,
                iconPath: new ThemeIcon(
                    "error",
                    new ThemeColor("notificationsErrorIcon.foreground")
                ),
                collapsibleState: TreeItemCollapsibleState.None,
            };
        }

        if (element.kind === "catalog") {
            const url = this.getNodeExploreUrl(element);
            const tt = new MarkdownString(`**${element.fullName}**`);
            if (element.comment) {
                tt.appendMarkdown(`\n\n${element.comment}`);
            }
            return {
                label: element.name,
                tooltip: tt,
                iconPath: new ThemeIcon(
                    "library",
                    new ThemeColor("databricks.unityCatalog.catalog")
                ),
                contextValue: url
                    ? "unityCatalog.catalog.has-url"
                    : "unityCatalog.catalog",
                collapsibleState: TreeItemCollapsibleState.Collapsed,
                url,
                copyText: element.fullName,
            };
        }

        if (element.kind === "schema") {
            const url = this.getNodeExploreUrl(element);
            const tt = new MarkdownString(`**${element.fullName}**`);
            if (element.comment) {
                tt.appendMarkdown(`\n\n${element.comment}`);
            }
            return {
                label: element.name,
                tooltip: tt,
                iconPath: new ThemeIcon(
                    "folder-library",
                    new ThemeColor("databricks.unityCatalog.schema")
                ),
                contextValue: url
                    ? "unityCatalog.schema.has-url"
                    : "unityCatalog.schema",
                collapsibleState: TreeItemCollapsibleState.Collapsed,
                url,
                copyText: element.fullName,
            };
        }

        if (element.kind === "volume") {
            const url = this.getNodeExploreUrl(element);
            const isExternal =
                element.volumeType !== undefined &&
                element.volumeType !== "MANAGED";
            const label = isExternal
                ? `${element.name} (${element.volumeType})`
                : element.name;
            const flags = ["unityCatalog.volume"];
            if (url) {
                flags.push("has-url");
            }
            if (element.storageLocation) {
                flags.push("has-storage");
            }
            const tt = new MarkdownString(`**${element.fullName}**`);
            if (element.volumeType) {
                tt.appendMarkdown(`\n\n*Type:* ${element.volumeType}`);
            }
            if (element.owner) {
                tt.appendMarkdown(`\n\n*Owner:* ${element.owner}`);
            }
            if (element.comment) {
                tt.appendMarkdown(`\n\n${element.comment}`);
            }
            return {
                label,
                tooltip: tt,
                iconPath: new ThemeIcon(
                    "package",
                    new ThemeColor("databricks.unityCatalog.volume")
                ),
                contextValue: flags.join("."),
                collapsibleState: TreeItemCollapsibleState.None,
                url,
                copyText: element.fullName,
                storageLocation: element.storageLocation,
            };
        }

        if (element.kind === "function") {
            const url = this.getNodeExploreUrl(element);
            return {
                label: element.name,
                tooltip: element.fullName,
                iconPath: new ThemeIcon(
                    "symbol-function",
                    new ThemeColor("databricks.unityCatalog.function")
                ),
                contextValue: url
                    ? "unityCatalog.function.has-url"
                    : "unityCatalog.function",
                collapsibleState: TreeItemCollapsibleState.None,
                url,
                copyText: element.fullName,
            };
        }

        if (element.kind === "column") {
            const icon =
                element.nullable === false
                    ? new ThemeIcon(
                          "symbol-key",
                          new ThemeColor("databricks.unityCatalog.columnKey")
                      )
                    : new ThemeIcon(
                          "symbol-field",
                          new ThemeColor("databricks.unityCatalog.column")
                      );
            const typeLabel = element.typeText ?? element.typeName ?? "";
            const tt = new MarkdownString(
                `**${element.name}** \`${typeLabel}\``
            );
            if (element.nullable === false) {
                tt.appendMarkdown(" *(not null)*");
            }
            if (element.comment) {
                tt.appendMarkdown(`\n\n${element.comment}`);
            }
            return {
                label: element.name,
                description: typeLabel,
                tooltip: tt,
                iconPath: icon,
                contextValue: "unityCatalog.column",
                collapsibleState: TreeItemCollapsibleState.None,
                copyText: element.name,
            };
        }

        // table
        const typeSuffix =
            element.tableType && element.tableType !== "MANAGED"
                ? ` (${element.tableType})`
                : "";
        const url = this.getNodeExploreUrl(element);
        const flags = ["unityCatalog.table"];
        if (url) {
            flags.push("has-url");
        }
        if (element.storageLocation) {
            flags.push("has-storage");
        }
        const isView =
            element.tableType === "VIEW" ||
            element.tableType === "MATERIALIZED_VIEW";
        if (isView && element.viewDefinition) {
            flags.push("is-view");
        }

        const tt = new MarkdownString(`**${element.fullName}**`);
        if (element.tableType) {
            tt.appendMarkdown(`\n\n*Type:* ${element.tableType}`);
        }
        if (element.dataSourceFormat) {
            tt.appendMarkdown(` · *Format:* ${element.dataSourceFormat}`);
        }
        if (element.owner) {
            tt.appendMarkdown(`\n\n*Owner:* ${element.owner}`);
        }
        if (element.createdBy) {
            tt.appendMarkdown(` · *Created by:* ${element.createdBy}`);
        }
        const cAt = formatTs(element.createdAt);
        const uAt = formatTs(element.updatedAt);
        if (cAt) {
            tt.appendMarkdown(`\n\n*Created:* ${cAt}`);
        }
        if (uAt) {
            tt.appendMarkdown(`  *Updated:* ${uAt}`);
        }
        if (element.comment) {
            tt.appendMarkdown(`\n\n${element.comment}`);
        }

        const hasColumns = (element.columns?.length ?? 0) > 0;
        return {
            label: `${element.name}${typeSuffix}`,
            description: element.dataSourceFormat,
            tooltip: tt,
            iconPath: new ThemeIcon(
                "table",
                new ThemeColor("databricks.unityCatalog.table")
            ),
            contextValue: flags.join("."),
            collapsibleState: hasColumns
                ? TreeItemCollapsibleState.Collapsed
                : TreeItemCollapsibleState.None,
            url,
            copyText: element.fullName,
            storageLocation: element.storageLocation,
            viewDefinition: element.viewDefinition,
        };
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
