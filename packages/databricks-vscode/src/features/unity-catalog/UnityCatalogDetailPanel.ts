import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { Uri, env } from "vscode";
import { z } from "zod";
import type { Logger } from "../../platform/log";
import { WebviewHost } from "../../platform/ui/WebviewHost";
import type { NodeEnrichments } from "./details";
import type { DetailableNode, NodeOfKind } from "./types";

const VIEW_TYPE = "databricks.unityCatalogDetail";

/** What the page may send. Anything else is dropped (and logged) by `WebviewHost`. */
const PageMessage = z.discriminatedUnion("command", [
    z.object({ command: z.literal("copyText"), text: z.string().max(1_000_000) }),
    z.object({
        command: z.literal("navigate"),
        nodeData: z.object({
            kind: z.literal("modelVersion"),
            fullName: z.string(),
            version: z.number(),
        }),
    }),
]);
type PageMessage = z.infer<typeof PageMessage>;

/** What the page's `uc-detail.js` handles. */
type PanelMessage =
    | { fn: "showLoading"; args: [] }
    | { fn: "renderNode"; args: [DetailableNode & { exploreUrl?: string }] }
    | { fn: "renderEnrichments"; args: [NodeEnrichments] };

const ICONS: Array<{ key: string; file: string }> = [
    { key: "catalog", file: "catalog.svg" },
    { key: "catalog-main", file: "catalog-main.svg" },
    { key: "catalog-samples", file: "catalog-samples.svg" },
    { key: "catalog-system", file: "catalog-system.svg" },
    { key: "schema", file: "schema.svg" },
    { key: "table", file: "table.svg" },
    { key: "volume", file: "volume.svg" },
    { key: "function", file: "function.svg" },
    { key: "registeredModel", file: "registered-model.svg" },
    { key: "modelVersion", file: "model-version.svg" },
    { key: "column", file: "column.svg" },
];

const KIND_LABELS: Record<DetailableNode["kind"], string> = {
    catalog: "Catalog",
    schema: "Schema",
    table: "Table",
    volume: "Volume",
    function: "Function",
    registeredModel: "Model",
    modelVersion: "Model Version",
};

/** "Table: name", "Model Version: v3", … (the spec looks for "Table:"). */
function detailTitle(node: DetailableNode): string {
    const name = node.kind === "modelVersion" ? `v${node.version}` : node.name;
    return `${KIND_LABELS[node.kind]}: ${name}`;
}

export interface DetailPanelOptions {
    readonly extensionPath: string;
    readonly log: Logger;
    /** A model version row of the page was clicked. */
    readonly navigate: (node: NodeOfKind<"modelVersion">) => void;
}

/**
 * The detail panel (UC-02), beside the editor: one at a time, reused. It
 * ports `UnityCatalogDetailPanel.ts` and the `uc-detail` page, which now runs
 * under a content security policy. The page's libraries (markdown-it,
 * highlight.js) and its own script are inlined with the nonce.
 */
export class UnityCatalogDetailPanel {
    private host: WebviewHost<PageMessage, PanelMessage> | undefined;
    private opening: Promise<WebviewHost<PageMessage, PanelMessage>> | undefined;
    /** The model versions the page lists, so `navigate` only opens one it was given. */
    private versions: NodeOfKind<"modelVersion">[] = [];

    constructor(private readonly options: DetailPanelOptions) {}

    get isOpen(): boolean {
        return this.host !== undefined;
    }

    async showLoading(title: string): Promise<void> {
        const host = await this.open();
        host.title = title;
        host.post({ fn: "showLoading", args: [] });
    }

    async showNode(node: DetailableNode, exploreUrl: string | undefined): Promise<void> {
        const host = await this.open();
        this.versions = [];
        host.title = detailTitle(node);
        host.post({
            fn: "renderNode",
            args: [{ ...node, ...(exploreUrl !== undefined ? { exploreUrl } : {}) }],
        });
    }

    enrich(enrichments: NodeEnrichments): void {
        this.versions = (enrichments.children ?? []).flatMap((c) =>
            c.nodeData ? [c.nodeData] : [],
        );
        this.host?.post({ fn: "renderEnrichments", args: [enrichments] });
    }

    dispose(): void {
        this.host?.dispose();
        this.host = undefined;
    }

    private open(): Promise<WebviewHost<PageMessage, PanelMessage>> {
        if (this.host !== undefined) {
            this.host.reveal();
            return Promise.resolve(this.host);
        }
        this.opening ??= this.create().finally(() => {
            this.opening = undefined;
        });
        return this.opening;
    }

    private async create(): Promise<WebviewHost<PageMessage, PanelMessage>> {
        const { extensionPath, log } = this.options;
        const resources = Uri.file(path.join(extensionPath, "resources"));
        const page = await readPage(extensionPath);
        const host = new WebviewHost<PageMessage, PanelMessage>({
            viewType: VIEW_TYPE,
            title: "Unity Catalog",
            localResourceRoots: [resources],
            messages: PageMessage,
            log,
        });
        const iconUris: Record<string, Record<string, string>> = { dark: {}, light: {} };
        for (const theme of ["dark", "light"] as const) {
            for (const { key, file } of ICONS) {
                iconUris[theme]![key] = host.asWebviewUri(
                    Uri.file(path.join(extensionPath, "resources", theme, "unity-catalog", file)),
                );
            }
        }
        host.render({ ...page, globals: { UC_ICON_URIS: iconUris } });
        host.onMessage((message) => this.receive(message));
        host.onDidDispose(() => {
            if (this.host === host) {
                this.host = undefined;
            }
        });
        this.host = host;
        return host;
    }

    private receive(message: PageMessage) {
        if (message.command === "copyText") {
            void env.clipboard.writeText(message.text);
            return;
        }
        const { fullName, version } = message.nodeData;
        const node = this.versions.find((v) => v.fullName === fullName && v.version === version);
        if (node !== undefined) {
            this.options.navigate(node);
        }
    }
}

/** The page's template, styles and scripts: its own, and the libraries from `node_modules`. */
async function readPage(extensionPath: string) {
    const resolve = createRequire(path.join(extensionPath, "package.json")).resolve;
    const dir = path.join(extensionPath, "resources", "webview-ui");
    const [template, css, markdownIt, highlight, script] = await Promise.all([
        readFile(path.join(dir, "uc-detail.html"), "utf-8"),
        readFile(path.join(dir, "uc-detail.css"), "utf-8"),
        readFile(resolve("markdown-it/browser"), "utf-8"),
        readFile(resolve("@highlightjs/cdn-assets/highlight.min.js"), "utf-8"),
        readFile(path.join(dir, "uc-detail.js"), "utf-8"),
    ]);
    return { template, styles: [css], scripts: [markdownIt, highlight, script] };
}
