import { commands, env, window } from "vscode";
import type { Feature } from "../../kernel/feature";
import { UserFacingError } from "../../platform/errors";
import { loadNodeEnrichments } from "./details";
import { Favorites } from "./Favorites";
import { iconPaths } from "./nodeRenderer";
import { isPinnable, type UnityCatalogTreeNode } from "./types";
import { UnityCatalogDetailPanel } from "./UnityCatalogDetailPanel";
import { UnityCatalogModel } from "./UnityCatalogModel";
import {
    UNITY_CATALOG_VIEW,
    UnityCatalogTreeDataProvider,
    UnityCatalogTreeItemNode,
    type UnityCatalogSession,
} from "./UnityCatalogTree";

export const UC_REFRESH = "databricks.unityCatalog.refresh";
const UC_REFRESH_NODE = "databricks.unityCatalog.refreshNode";
const UC_COPY_NAME = "databricks.unityCatalog.copyName";
const UC_COPY_STORAGE_LOCATION = "databricks.unityCatalog.copyStorageLocation";
const UC_COPY_VIEW_SQL = "databricks.unityCatalog.copyViewSql";
const UC_OPEN_EXTERNAL = "databricks.unityCatalog.openExternal";
const UC_FILTER = "databricks.unityCatalog.filter";
const UC_PIN = "databricks.unityCatalog.pin";
const UC_UNPIN = "databricks.unityCatalog.unpin";
const UC_SHOW_DETAIL = "databricks.unityCatalog.showDetail";

/**
 * Unity Catalog (UC-01 to UC-04): the UNITY CATALOG view over a
 * connection-scoped `UnityCatalogModel`, favorites kept per workspace host,
 * the node actions, and the detail panel. It works without a folder,
 * and follows the project's workspace while one is open.
 */
export const unityCatalog: Feature = {
    id: "unity-catalog",
    session: {
        [UNITY_CATALOG_VIEW]: {
            adapted:
                "It shows without a connection too, since a session window can't sign in; Refresh connects again.",
        },
        [UC_REFRESH]: {
            adapted: "Without a connection, it connects again with the session's credentials.",
        },
        ...Object.fromEntries(
            [
                UC_REFRESH_NODE,
                UC_COPY_NAME,
                UC_COPY_STORAGE_LOCATION,
                UC_COPY_VIEW_SQL,
                UC_OPEN_EXTERNAL,
                UC_FILTER,
                UC_PIN,
                UC_UNPIN,
                UC_SHOW_DETAIL,
            ].map((id) => [id, "same"]),
        ),
    },

    register(ctx) {
        let session: UnityCatalogSession | undefined;
        const icon = iconPaths((p) => ctx.kernel.extension.asAbsolutePath(p));
        const tree = new UnityCatalogTreeDataProvider(() => session, ctx.log);
        const treeView = window.createTreeView(UNITY_CATALOG_VIEW, { treeDataProvider: tree });
        let generation = 0;
        const panel = new UnityCatalogDetailPanel({
            extensionPath: ctx.kernel.extension.asAbsolutePath(""),
            log: ctx.log,
            navigate: (node) => void showDetail(node),
        });
        ctx.subscriptions.push(tree, treeView, { dispose: () => panel.dispose() });

        ctx.whileConnected((connection) => {
            const s: UnityCatalogSession = {
                model: new UnityCatalogModel(connection, ctx.log),
                favorites: new Favorites(ctx.kernel.state, connection),
                icon,
            };
            session = s;
            const subscription = s.favorites.onDidChange(() => tree.refresh());
            s.favorites
                .copyLegacy()
                .catch((e: unknown) =>
                    ctx.log.error("Failed to copy the Unity Catalog favorites", e),
                );
            tree.refresh();
            return {
                dispose: () => {
                    subscription.dispose();
                    if (session === s) {
                        session = undefined;
                    }
                    tree.refresh();
                },
            };
        });

        /** The row a command was run on, with the connection it belongs to. */
        const rowOf = (
            arg: unknown,
        ): { node: UnityCatalogTreeNode; session: UnityCatalogSession } | undefined => {
            if (arg instanceof UnityCatalogTreeItemNode && session !== undefined) {
                return { node: arg.node, session };
            }
            return undefined;
        };

        const showDetail = async (node: UnityCatalogTreeNode | undefined) => {
            const s = session;
            if (!isPinnable(node) || s === undefined) {
                return;
            }
            const current = ++generation;
            await panel.showNode(node, s.model.exploreUrl(node));
            if (node.kind === "modelVersion") {
                return;
            }
            loadNodeEnrichments(s.model, node)
                .then((enrichments) => {
                    if (current === generation) {
                        panel.enrich(enrichments);
                    }
                })
                .catch((e: unknown) => ctx.log.debug("Unity Catalog: details failed to load", e));
        };

        ctx.subscriptions.push(
            treeView.onDidChangeSelection((event) => {
                const node = rowOf(event.selection[0])?.node;
                if (!isPinnable(node)) {
                    return;
                }
                void panel
                    .showLoading(node.fullName)
                    .then(() => showDetail(node))
                    .catch((e: unknown) =>
                        ctx.log.error("Unity Catalog: the detail panel failed to open", e),
                    );
            }),
        );

        ctx.commands.register(UC_REFRESH, async () => {
            // Where the identity is the session's, the view shows without a connection,
            // since no sign-in can bring one; Refresh connects again (SSH-03).
            if (session === undefined && ctx.kernel.capabilities.identity === "session") {
                await ctx.kernel.connection.reconnect();
            }
            session?.model.refresh();
            tree.refresh();
        });
        ctx.commands.register(UC_REFRESH_NODE, (arg?: unknown) => {
            const row = rowOf(arg);
            if (row !== undefined && arg instanceof UnityCatalogTreeItemNode) {
                row.session.model.refreshNode(row.node);
                tree.refresh(arg);
            }
        });
        ctx.commands.register(UC_COPY_STORAGE_LOCATION, async (arg?: unknown) => {
            const node = rowOf(arg)?.node;
            if ((node?.kind === "table" || node?.kind === "volume") && node.storageLocation) {
                await copy(node.storageLocation);
            }
        });
        ctx.commands.register(UC_COPY_VIEW_SQL, async (arg?: unknown) => {
            const node = rowOf(arg)?.node;
            if (node?.kind === "table" && node.viewDefinition) {
                await copy(node.viewDefinition);
            }
        });
        ctx.commands.register(UC_COPY_NAME, async (arg?: unknown) => {
            const node = rowOf(arg)?.node;
            if (node?.kind === "column") {
                await copy(node.name);
            } else if (isPinnable(node)) {
                await copy(node.fullName);
            }
        });
        ctx.commands.register(UC_OPEN_EXTERNAL, async (arg?: unknown) => {
            const row = rowOf(arg);
            if (row === undefined || row.node.kind === "error" || row.node.kind === "column") {
                return;
            }
            const url = row.session.model.exploreUrl(row.node);
            if (url === undefined) {
                throw new UserFacingError(
                    "NO_URL",
                    "Databricks: Can't open external link. No URL found.",
                );
            }
            // As a string: VS Code encodes a Uri again on the way out, so a name's `%23` would arrive as `%2523`.
            await commands.executeCommand("vscode.open", url);
        });
        ctx.commands.register(UC_FILTER, async () => {
            await commands.executeCommand(`${UNITY_CATALOG_VIEW}.focus`);
            await commands.executeCommand("list.find");
        });
        ctx.commands.register(UC_PIN, async (arg?: unknown) => {
            const row = rowOf(arg);
            if (row !== undefined && isPinnable(row.node)) {
                await row.session.favorites.pin(row.node);
            }
        });
        ctx.commands.register(UC_UNPIN, async (arg?: unknown) => {
            const row = rowOf(arg);
            if (row !== undefined && isPinnable(row.node)) {
                await row.session.favorites.unpin(row.node);
            }
        });
        // A row, or a node as plain data (as `databricks.unityCatalog.showDetail` was called before).
        ctx.commands.register(UC_SHOW_DETAIL, (arg?: unknown) =>
            showDetail(
                arg instanceof UnityCatalogTreeItemNode
                    ? arg.node
                    : (arg as UnityCatalogTreeNode | undefined),
            ),
        );
    },
};

async function copy(text: string) {
    await env.clipboard.writeText(text);
    void window.showInformationMessage("Copied to clipboard");
}
