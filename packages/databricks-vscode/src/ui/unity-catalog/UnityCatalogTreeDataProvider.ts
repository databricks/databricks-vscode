/* eslint-disable @typescript-eslint/naming-convention */
import {Disposable, EventEmitter, TreeDataProvider} from "vscode";
import {ConnectionManager} from "../../configuration/ConnectionManager";
import {buildTreeItem} from "./nodeRenderer";
import {
    PinnableNodeKind,
    StoredFavoriteNode,
    UnityCatalogTreeItem,
    UnityCatalogTreeNode,
} from "./types";
import {StateStorage} from "../../vscode-objs/StateStorage";
import {
    loadCatalogs,
    loadSchemas,
    loadSchemaChildren,
    loadModelVersions,
} from "./loaders";

export type {
    ColumnData,
    PinnableNodeKind,
    StoredFavoriteNode,
    UnityCatalogTreeItem,
    UnityCatalogTreeNode,
} from "./types";

export class UnityCatalogTreeDataProvider
    implements TreeDataProvider<UnityCatalogTreeNode>, Disposable
{
    private readonly _onDidChangeTreeData = new EventEmitter<
        UnityCatalogTreeNode | undefined | void
    >();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    private readonly disposables: Disposable[] = [];
    private readonly childrenCache = new Map<string, UnityCatalogTreeNode[]>();
    private readonly favoritesRootNode: UnityCatalogTreeNode = {
        kind: "favorites",
    };
    private catalogsCache: UnityCatalogTreeNode[] | undefined = undefined;

    constructor(
        private readonly connectionManager: ConnectionManager,
        private readonly stateStorage: StateStorage
    ) {
        this.disposables.push(
            this.connectionManager.onDidChangeState(() => {
                this.catalogsCache = undefined;
                this._onDidChangeTreeData.fire(undefined);
            })
        );
        this.migratePinnedSchemas();
    }

    private async migratePinnedSchemas(): Promise<void> {
        const legacy =
            this.stateStorage.get("databricks.unityCatalog.pinnedSchemas") ??
            [];
        if (!legacy.length) {
            return;
        }
        const existing =
            this.stateStorage.get("databricks.unityCatalog.favorites") ?? [];
        const existingKeys = new Set(existing.map((f) => f.fullName));
        const toAdd: StoredFavoriteNode[] = legacy
            .filter((fn) => !existingKeys.has(fn))
            .map((fn) => {
                const [catalogName = "", name = fn] = fn.split(".");
                return {
                    kind: "schema" as const,
                    catalogName,
                    name,
                    fullName: fn,
                };
            });
        if (toAdd.length) {
            await this.stateStorage.set("databricks.unityCatalog.favorites", [
                ...existing,
                ...toAdd,
            ]);
        }
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
            node.kind === "empty" ||
            node.kind === "favorites"
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
        if (element.kind === "favorites") {
            return buildTreeItem(element, undefined, false);
        }
        const favorites =
            this.stateStorage.get("databricks.unityCatalog.favorites") ?? [];
        const isPinned =
            "fullName" in element &&
            favorites.some(
                (f) =>
                    favoriteKey(f) ===
                    favoriteKey(element as StoredFavoriteNode)
            );
        return buildTreeItem(
            element,
            this.getNodeExploreUrl(element),
            isPinned
        );
    }

    async getChildren(
        element?: UnityCatalogTreeNode
    ): Promise<UnityCatalogTreeNode[] | undefined> {
        const client = this.connectionManager.workspaceClient;
        if (!client) {
            return undefined;
        }

        const currentUser = this.connectionManager.databricksWorkspace?.user;

        if (!element) {
            if (!this.catalogsCache) {
                this.catalogsCache = await loadCatalogs(client, currentUser);
            }
            const favorites =
                this.stateStorage.get("databricks.unityCatalog.favorites") ??
                [];
            return favorites.length > 0
                ? [this.favoritesRootNode, ...this.catalogsCache]
                : [...this.catalogsCache];
        }

        if (element.kind === "favorites") {
            const favorites =
                this.stateStorage.get("databricks.unityCatalog.favorites") ??
                [];
            return favorites.length > 0
                ? (favorites as UnityCatalogTreeNode[])
                : [{kind: "empty", message: "No favorites yet"}];
        }

        if (element.kind === "error") {
            return undefined;
        }

        if (element.kind === "catalog") {
            const result = await loadSchemas(client, element.name, currentUser);
            this.childrenCache.set(element.fullName, result);
            return result;
        }

        if (element.kind === "schema") {
            const result = await loadSchemaChildren(
                client,
                element.catalogName,
                element.name
            );
            this.childrenCache.set(element.fullName, result);
            return result;
        }

        if (element.kind === "registeredModel") {
            const result = await loadModelVersions(client, element);
            this.childrenCache.set(element.fullName, result);
            return result;
        }

        if (element.kind === "table") {
            let columns = element.columns;
            if (!columns?.length) {
                try {
                    const t = await client.tables.get({
                        full_name: element.fullName,
                    });
                    columns = (t.columns ?? []).map((col) => ({
                        name: col.name!,
                        typeName: col.type_name,
                        typeText: col.type_text,
                        comment: col.comment,
                        nullable: col.nullable,
                        position: col.position,
                    }));
                } catch {
                    return undefined;
                }
            }
            if (!columns.length) {
                return undefined;
            }
            return [...columns]
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
                }));
        }

        return undefined;
    }

    async pin(
        node: Extract<UnityCatalogTreeNode, {kind: PinnableNodeKind}>
    ): Promise<void> {
        const favorites =
            this.stateStorage.get("databricks.unityCatalog.favorites") ?? [];
        const nodeAsStored = node as StoredFavoriteNode;
        if (
            favorites.some((f) => favoriteKey(f) === favoriteKey(nodeAsStored))
        ) {
            return;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const stored: StoredFavoriteNode = {...node} as StoredFavoriteNode;
        if ("columns" in stored) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            delete (stored as any).columns;
        }

        const wasEmpty = favorites.length === 0;
        await this.stateStorage.set("databricks.unityCatalog.favorites", [
            ...favorites,
            stored,
        ]);

        if (wasEmpty) {
            this._onDidChangeTreeData.fire(undefined);
        } else {
            this._onDidChangeTreeData.fire(this.favoritesRootNode);
            this._onDidChangeTreeData.fire(node);
        }
    }

    async unpin(
        node: Extract<UnityCatalogTreeNode, {kind: PinnableNodeKind}>
    ): Promise<void> {
        const favorites =
            this.stateStorage.get("databricks.unityCatalog.favorites") ?? [];
        const nodeAsStored = node as StoredFavoriteNode;
        const updated = favorites.filter(
            (f) => favoriteKey(f) !== favoriteKey(nodeAsStored)
        );
        if (updated.length === favorites.length) {
            return;
        }

        await this.stateStorage.set(
            "databricks.unityCatalog.favorites",
            updated
        );

        if (updated.length === 0) {
            this._onDidChangeTreeData.fire(undefined);
        } else {
            this._onDidChangeTreeData.fire(this.favoritesRootNode);
            this._onDidChangeTreeData.fire(node);
        }
    }

    getLoadedChildren(key: string): UnityCatalogTreeNode[] | undefined {
        return this.childrenCache.get(key);
    }

    refresh(): void {
        this.childrenCache.clear();
        this.catalogsCache = undefined;
        this._onDidChangeTreeData.fire(undefined);
    }

    refreshNode(element: UnityCatalogTreeNode): void {
        if ("fullName" in element) {
            this.childrenCache.delete(element.fullName);
        }
        this._onDidChangeTreeData.fire(element);
    }

    dispose(): void {
        this.disposables.forEach((d) => d.dispose());
    }
}

function favoriteKey(node: StoredFavoriteNode): string {
    return node.kind === "modelVersion"
        ? `${node.fullName}@v${node.version}`
        : node.fullName;
}
