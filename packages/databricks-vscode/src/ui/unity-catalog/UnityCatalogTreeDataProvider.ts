/* eslint-disable @typescript-eslint/naming-convention */
import {Disposable, EventEmitter, TreeDataProvider} from "vscode";
import {ConnectionManager} from "../../configuration/ConnectionManager";
import {buildTreeItem} from "./nodeRenderer";
import {UnityCatalogTreeItem, UnityCatalogTreeNode} from "./types";
import {StateStorage} from "../../vscode-objs/StateStorage";
import {
    loadCatalogs,
    loadSchemas,
    loadSchemaChildren,
    loadModelVersions,
} from "./loaders";

export type {
    ColumnData,
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

    async getChildren(
        element?: UnityCatalogTreeNode
    ): Promise<UnityCatalogTreeNode[] | undefined> {
        const client = this.connectionManager.workspaceClient;
        if (!client) {
            return undefined;
        }

        const currentUser =
            this.connectionManager.databricksWorkspace?.user;

        if (!element) {
            return loadCatalogs(client, currentUser);
        }

        if (element.kind === "error") {
            return undefined;
        }

        if (element.kind === "catalog") {
            const pinned = new Set(
                this.stateStorage.get(
                    "databricks.unityCatalog.pinnedSchemas"
                ) ?? []
            );
            const result = await loadSchemas(
                client,
                element.name,
                currentUser,
                pinned
            );
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
            if (!element.columns?.length) {
                return undefined;
            }
            return [...element.columns]
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

    getLoadedChildren(key: string): UnityCatalogTreeNode[] | undefined {
        return this.childrenCache.get(key);
    }

    refresh(): void {
        this.childrenCache.clear();
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
