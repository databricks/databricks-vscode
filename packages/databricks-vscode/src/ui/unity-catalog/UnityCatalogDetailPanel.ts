import {Disposable, Uri, ViewColumn, WebviewPanel, window, env} from "vscode";
import * as fs from "node:fs/promises";
import {UnityCatalogTreeNode} from "./types";
import {NodeEnrichments} from "./detailLoader";

export class UnityCatalogDetailPanel implements Disposable {
    private static readonly VIEW_TYPE = "databricks.unityCatalogDetail";
    private static instance: UnityCatalogDetailPanel | undefined;

    private constructor(
        private panel: WebviewPanel,
        private readonly webviewContent: string
    ) {
        panel.webview.html = webviewContent;
        panel.webview.onDidReceiveMessage((msg) => {
            if (msg.command === "copyText") {
                env.clipboard.writeText(msg.text);
            }
        });
        panel.onDidDispose(() => {
            UnityCatalogDetailPanel.instance = undefined;
        });
    }

    static async getOrCreate(
        extensionUri: Uri
    ): Promise<UnityCatalogDetailPanel> {
        if (UnityCatalogDetailPanel.instance) {
            UnityCatalogDetailPanel.instance.panel.reveal(undefined, true);
            return UnityCatalogDetailPanel.instance;
        }
        const panel = window.createWebviewPanel(
            UnityCatalogDetailPanel.VIEW_TYPE,
            "Unity Catalog",
            {viewColumn: ViewColumn.Beside, preserveFocus: true},
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    Uri.joinPath(extensionUri, "resources"),
                    Uri.joinPath(extensionUri, "out"),
                ],
            }
        );
        const content = await UnityCatalogDetailPanel.getWebviewContent(
            panel,
            extensionUri
        );
        const instance = new UnityCatalogDetailPanel(panel, content);
        UnityCatalogDetailPanel.instance = instance;
        return instance;
    }

    showNode(
        node: Exclude<
            UnityCatalogTreeNode,
            {kind: "error" | "empty" | "column"}
        >,
        exploreUrl: string | undefined
    ): void {
        this.panel.title = UnityCatalogDetailPanel.titleFor(node);
        this.panel.webview.postMessage({
            fn: "renderNode",
            args: [{...node, exploreUrl}],
        });
    }

    enrichNode(enrichments: NodeEnrichments): void {
        this.panel.webview.postMessage({fn: "renderEnrichments", args: [enrichments]});
    }

    showLoading(title: string): void {
        this.panel.title = title;
        this.panel.webview.postMessage({fn: "showLoading", args: []});
    }

    dispose(): void {
        this.panel.dispose();
    }

    private static titleFor(node: {
        kind: string;
        name?: string;
        fullName?: string;
        version?: number;
    }): string {
        const labels: Record<string, string> = {
            catalog: "Catalog",
            schema: "Schema",
            table: "Table",
            volume: "Volume",
            function: "Function",
            registeredModel: "Model",
            modelVersion: "Model Version",
        };
        const label = labels[node.kind] ?? node.kind;
        const name =
            node.kind === "modelVersion"
                ? `v${node.version}`
                : (node.name ?? node.fullName ?? "");
        return `${label}: ${name}`;
    }

    private static getAssetUri(
        panel: WebviewPanel,
        extensionUri: Uri,
        filename: string
    ): Uri {
        return panel.webview.asWebviewUri(
            Uri.joinPath(extensionUri, "out", filename)
        );
    }

    private static buildIconUriMap(
        panel: WebviewPanel,
        extensionUri: Uri
    ): Record<string, Record<string, string>> {
        const iconFiles: Array<{key: string; file: string}> = [
            {key: "catalog", file: "catalog.svg"},
            {key: "catalog-main", file: "catalog-main.svg"},
            {key: "catalog-samples", file: "catalog-samples.svg"},
            {key: "catalog-system", file: "catalog-system.svg"},
            {key: "schema", file: "schema.svg"},
            {key: "table", file: "table.svg"},
            {key: "volume", file: "volume.svg"},
            {key: "function", file: "function.svg"},
            {key: "registeredModel", file: "registered-model.svg"},
            {key: "modelVersion", file: "model-version.svg"},
            {key: "column", file: "column.svg"},
        ];
        const result: Record<string, Record<string, string>> = {dark: {}, light: {}};
        for (const theme of ["dark", "light"] as const) {
            for (const {key, file} of iconFiles) {
                result[theme][key] = panel.webview
                    .asWebviewUri(
                        Uri.joinPath(extensionUri, "resources", theme, "unity-catalog", file)
                    )
                    .toString();
            }
        }
        return result;
    }

    private static async getWebviewContent(
        panel: WebviewPanel,
        extensionUri: Uri
    ): Promise<string> {
        const webviewDir = Uri.joinPath(extensionUri, "resources", "webview-ui");
        const [html, css, js] = await Promise.all([
            fs.readFile(Uri.joinPath(webviewDir, "uc-detail.html").fsPath, "utf8"),
            fs.readFile(Uri.joinPath(webviewDir, "uc-detail.css").fsPath, "utf8"),
            fs.readFile(Uri.joinPath(webviewDir, "uc-detail.js").fsPath, "utf8"),
        ]);
        const iconUris = UnityCatalogDetailPanel.buildIconUriMap(panel, extensionUri);
        return html
            .replace("<!--STYLES-->", `<style>\n${css}\n</style>`)
            .replace(
                "<!--ICON-URIS-->",
                `<script>window.UC_ICON_URIS = ${JSON.stringify(iconUris)};</script>`
            )
            .replace("<!--SCRIPTS-->", `<script>\n${js}\n</script>`)
            .replace(
                /src="[^"]*\/toolkit\.js"/g,
                `src="${UnityCatalogDetailPanel.getAssetUri(panel, extensionUri, "toolkit.js")}"`
            )
            .replace(
                /src="[^"]*\/markdown-it\.min\.js"/g,
                `src="${UnityCatalogDetailPanel.getAssetUri(panel, extensionUri, "markdown-it.min.js")}"`
            );
    }
}
