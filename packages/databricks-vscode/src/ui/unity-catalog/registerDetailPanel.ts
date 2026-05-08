import {Disposable, TreeView, Uri} from "vscode";
import {Telemetry} from "../../telemetry";
import {ConnectionManager} from "../../configuration/ConnectionManager";
import {
    UnityCatalogTreeDataProvider,
    UnityCatalogTreeNode,
} from "./UnityCatalogTreeDataProvider";
import {UnityCatalogDetailPanel} from "./UnityCatalogDetailPanel";
import {loadNodeEnrichments} from "./detailLoader";

type DetailableNode = Exclude<
    UnityCatalogTreeNode,
    {kind: "error" | "empty" | "column" | "favorites" | "group"}
>;

function isDetailable(
    node: UnityCatalogTreeNode | undefined
): node is DetailableNode {
    return (
        !!node &&
        node.kind !== "error" &&
        node.kind !== "empty" &&
        node.kind !== "column" &&
        node.kind !== "favorites" &&
        node.kind !== "group"
    );
}

export function registerDetailPanel(
    extensionUri: Uri,
    connectionManager: ConnectionManager,
    treeView: TreeView<UnityCatalogTreeNode>,
    treeDataProvider: UnityCatalogTreeDataProvider,
    telemetry: Telemetry
): Disposable[] {
    async function showDetail(node: UnityCatalogTreeNode) {
        if (!isDetailable(node)) {
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

    UnityCatalogDetailPanel.setNavigationHandler(showDetail);

    return [
        telemetry.registerCommand(
            "databricks.unityCatalog.showDetail",
            showDetail
        ),
        treeView.onDidChangeSelection(async (event) => {
            const node = event.selection[0] as UnityCatalogTreeNode;
            if (!isDetailable(node)) {
                return;
            }
            const panel =
                await UnityCatalogDetailPanel.getOrCreate(extensionUri);
            panel.showLoading(node.fullName);
            await showDetail(node);
        }),
    ];
}
