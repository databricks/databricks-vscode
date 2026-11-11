import type { TreeItem } from "vscode";
import type { Logger } from "../../platform/log";
import { NodeTreeDataProvider, type TreeNode } from "../../platform/ui/tree";
import type { Favorites } from "./Favorites";
import { buildTreeItem, type IconPaths } from "./nodeRenderer";
import { isPinnable, type StoredFavoriteRef, type UnityCatalogTreeNode } from "./types";
import type { UnityCatalogModel } from "./UnityCatalogModel";

/** "Unity Catalog" (old ID). */
export const UNITY_CATALOG_VIEW = "unityCatalogView";

/** What the rows of one connection share. */
export interface UnityCatalogSession {
    readonly model: UnityCatalogModel;
    readonly favorites: Favorites;
    readonly icon: IconPaths;
}

/** The part of a node's ID that tells it from its siblings. */
function segment(node: UnityCatalogTreeNode): string {
    switch (node.kind) {
        case "favorites":
            return "favorites";
        case "group":
            return `group:${node.groupType}`;
        case "column":
            return `column:${node.name}`;
        case "modelVersion":
            return `modelVersion:${node.fullName}@v${node.version}`;
        case "error":
        case "empty":
            return `${node.kind}:${node.message}`;
        default:
            return `${node.kind}:${node.fullName}`;
    }
}

/**
 * One row. Its ID is its parent's plus its own segment, so a securable shown
 * under Favorites and in the tree gets two IDs, and every row keeps its ID,
 * and its expansion, across refreshes. Commands receive the row.
 */
export class UnityCatalogTreeItemNode implements TreeNode {
    readonly id: string;

    constructor(
        readonly node: UnityCatalogTreeNode,
        private readonly session: UnityCatalogSession,
        parentId: string | undefined,
    ) {
        this.id = parentId === undefined ? segment(node) : `${parentId}/${segment(node)}`;
    }

    getTreeItem(): TreeItem {
        const { node, session } = this;
        const item = buildTreeItem(
            node,
            session.model.exploreUrl(node),
            isPinnable(node) && session.favorites.has(node),
            session.icon,
        );
        item.id = this.id;
        return item;
    }

    async getChildren(): Promise<UnityCatalogTreeItemNode[]> {
        const { node, session } = this;
        const { model } = session;
        let children: UnityCatalogTreeNode[];
        switch (node.kind) {
            case "favorites":
                children = await loadFavorites(session);
                break;
            case "catalog":
                children = await model.schemas(node);
                break;
            case "schema":
                children = await model.schemaChildren(node);
                break;
            case "group":
                children = await model.groupChildren(node);
                break;
            case "registeredModel":
                children = await model.modelVersions(node);
                break;
            case "table":
                children = await model.columns(node);
                break;
            default:
                children = [];
        }
        return children.map((child) => new UnityCatalogTreeItemNode(child, session, this.id));
    }
}

/**
 * The pinned securables, fetched again on each expansion, as before. Those
 * that no longer exist are dropped from the list; one that fails to load
 * stays, with an error row.
 */
async function loadFavorites(session: UnityCatalogSession): Promise<UnityCatalogTreeNode[]> {
    const refs = session.favorites.list();
    if (refs.length === 0) {
        return [{ kind: "empty", message: "No favorites yet" }];
    }
    const results = await Promise.all(refs.map((ref) => session.model.favorite(ref)));
    const nodes: UnityCatalogTreeNode[] = [];
    const gone: StoredFavoriteRef[] = [];
    results.forEach((result, i) => {
        const ref = refs[i]!;
        if (result.status === "ok") {
            nodes.push(result.node);
        } else if (result.status === "gone") {
            gone.push(ref);
        } else {
            nodes.push({ kind: "error", message: `Could not load ${ref.fullName}` });
        }
    });
    if (gone.length > 0) {
        await session.favorites.forget(gone);
    }
    // Two refs can't share a row ID.
    const seen = new Set<string>();
    const unique = nodes.filter((n) => {
        const key = segment(n);
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
    return unique.length > 0 ? unique : [{ kind: "empty", message: "No favorites yet" }];
}

/**
 * UNITY CATALOG (UC-01): Favorites, when there are any, then the catalogs.
 * Signed out it has no rows; the view is hidden then anyway.
 */
export class UnityCatalogTreeDataProvider extends NodeTreeDataProvider<UnityCatalogTreeItemNode> {
    constructor(session: () => UnityCatalogSession | undefined, log: Logger) {
        super(async () => {
            const s = session();
            if (s === undefined) {
                return [];
            }
            const catalogs = await s.model.catalogs();
            const roots: UnityCatalogTreeNode[] =
                s.favorites.list().length > 0 ? [{ kind: "favorites" }, ...catalogs] : catalogs;
            return roots.map((n) => new UnityCatalogTreeItemNode(n, s, undefined));
        }, log);
    }
}
