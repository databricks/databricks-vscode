/* eslint-disable @typescript-eslint/naming-convention */
import {ApiError, logging} from "@databricks/sdk-experimental";
import {
    Disposable,
    EventEmitter,
    ThemeColor,
    ThemeIcon,
    TreeDataProvider,
    TreeItem,
    TreeItemCollapsibleState,
} from "vscode";
import {ConnectionManager} from "../../configuration/ConnectionManager";
import {Loggers} from "../../logger";

const logger = logging.NamedLogger.getOrCreate(Loggers.Extension);

export type UnityCatalogTreeNode =
    | {kind: "catalog"; name: string; fullName: string}
    | {
          kind: "schema";
          catalogName: string;
          name: string;
          fullName: string;
      }
    | {
          kind: "table";
          catalogName: string;
          schemaName: string;
          name: string;
          fullName: string;
          tableType?: string;
      }
    | {
          kind: "volume";
          catalogName: string;
          schemaName: string;
          name: string;
          fullName: string;
      }
    | {kind: "error"; message: string};

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

    getTreeItem(element: UnityCatalogTreeNode): TreeItem {
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
            return {
                label: element.name,
                tooltip: element.fullName,
                iconPath: new ThemeIcon(
                    "library",
                    new ThemeColor("charts.purple")
                ),
                contextValue: "unityCatalog.catalog",
                collapsibleState: TreeItemCollapsibleState.Collapsed,
            };
        }

        if (element.kind === "schema") {
            return {
                label: element.name,
                tooltip: element.fullName,
                iconPath: new ThemeIcon(
                    "folder-library",
                    new ThemeColor("charts.green")
                ),
                contextValue: "unityCatalog.schema",
                collapsibleState: TreeItemCollapsibleState.Collapsed,
            };
        }

        if (element.kind === "volume") {
            return {
                label: element.name,
                tooltip: element.fullName,
                iconPath: new ThemeIcon(
                    "package",
                    new ThemeColor("charts.blue")
                ),
                contextValue: "unityCatalog.volume",
                collapsibleState: TreeItemCollapsibleState.None,
            };
        }

        const typeSuffix =
            element.tableType && element.tableType !== "MANAGED"
                ? ` (${element.tableType})`
                : "";
        return {
            label: `${element.name}${typeSuffix}`,
            tooltip: [element.fullName, element.tableType]
                .filter(Boolean)
                .join(" · "),
            iconPath: new ThemeIcon("table", new ThemeColor("charts.orange")),
            contextValue: "unityCatalog.table",
            collapsibleState: TreeItemCollapsibleState.None,
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
            return this.listTablesAndVolumes(
                client,
                element.catalogName,
                element.name
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
                }))
                .sort((a, b) => a.name.localeCompare(b.name));
        } catch (e) {
            return this.errorChildren(e, "schemas");
        }
    }

    private async listTablesAndVolumes(
        client: NonNullable<ConnectionManager["workspaceClient"]>,
        catalogName: string,
        schemaName: string
    ): Promise<UnityCatalogTreeNode[] | undefined> {
        try {
            const [tableRows, volumeRows] = await Promise.all([
                drainAsyncIterable(
                    client.tables.list({catalog_name: catalogName, schema_name: schemaName})
                ),
                drainAsyncIterable(
                    client.volumes.list({catalog_name: catalogName, schema_name: schemaName})
                ),
            ]);

            const tableNodes: UnityCatalogTreeNode[] = tableRows
                .filter((t) => t.name)
                .map((t) => ({
                    kind: "table" as const,
                    catalogName,
                    schemaName,
                    name: t.name!,
                    fullName: t.full_name ?? `${catalogName}.${schemaName}.${t.name}`,
                    tableType: t.table_type,
                }));

            const volumeNodes: UnityCatalogTreeNode[] = volumeRows
                .filter((v) => v.name)
                .map((v) => ({
                    kind: "volume" as const,
                    catalogName,
                    schemaName,
                    name: v.name!,
                    fullName: v.full_name ?? `${catalogName}.${schemaName}.${v.name}`,
                }));

            return [...tableNodes, ...volumeNodes].sort((a, b) => {
                const an = a.kind === "table" || a.kind === "volume" ? a.name : "";
                const bn = b.kind === "table" || b.kind === "volume" ? b.name : "";
                const c = an.localeCompare(bn);
                if (c !== 0) {
                    return c;
                }
                if (a.kind === b.kind) {
                    return 0;
                }
                return a.kind === "table" ? -1 : 1;
            });
        } catch (e) {
            return this.errorChildren(e, "tables and volumes");
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

    dispose(): void {
        this.disposables.forEach((d) => d.dispose());
    }
}
