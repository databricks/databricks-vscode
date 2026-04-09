import {Disposable, TreeView, Uri} from "vscode";
import {Telemetry} from "../../telemetry";
import {ConnectionManager} from "../../configuration/ConnectionManager";
import {
    UnityCatalogTreeDataProvider,
    UnityCatalogTreeNode,
} from "./UnityCatalogTreeDataProvider";
import {UnityCatalogDetailPanel} from "./UnityCatalogDetailPanel";
import {loadNodeEnrichments} from "./detailLoader";

export function registerDetailPanel(
    extensionUri: Uri,
    connectionManager: ConnectionManager,
    treeView: TreeView<UnityCatalogTreeNode>,
    treeDataProvider: UnityCatalogTreeDataProvider,
    telemetry: Telemetry
): Disposable[] {
    async function showDetail(node: UnityCatalogTreeNode) {
        if (
            !node ||
            node.kind === "error" ||
            node.kind === "empty" ||
            node.kind === "column"
        ) {
            return;
        }
        const panel = await UnityCatalogDetailPanel.getOrCreate(extensionUri);
        panel.showNode(node, treeDataProvider.getNodeExploreUrl(node));
        if (node.kind !== "modelVersion") {
            const client = connectionManager.workspaceClient;
            if (client) {
                const cachedChildren =
                    node.kind === "catalog" ||
                    node.kind === "schema" ||
                    node.kind === "registeredModel"
                        ? treeDataProvider.getLoadedChildren(node.fullName)
                        : undefined;
                loadNodeEnrichments(client, node, cachedChildren)
                    .then((enrichments) => panel.enrichNode(enrichments))
                    .catch(() => {
                        /* silently ignore enrichment errors */
                    });
            }
        }
    }

    return [
        telemetry.registerCommand(
            "databricks.unityCatalog.showDetail",
            showDetail
        ),
        treeView.onDidChangeSelection(async (event) => {
            const node = event.selection[0] as UnityCatalogTreeNode;
            if (
                !node ||
                node.kind === "error" ||
                node.kind === "empty" ||
                node.kind === "column"
            ) {
                return;
            }
            const panel =
                await UnityCatalogDetailPanel.getOrCreate(extensionUri);
            panel.showLoading(
                node.kind === "modelVersion"
                    ? node.fullName
                    : node.fullName ?? node.name ?? ""
            );
            await showDetail(node);
        }),
    ];
}
