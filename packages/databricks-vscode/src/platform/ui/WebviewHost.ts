import { randomBytes } from "node:crypto";
import { Uri, ViewColumn, window, type Disposable, type Event, type WebviewPanel } from "vscode";
import type { ZodType } from "zod";
import { Emitter } from "../event";
import type { Logger } from "../log";

export interface WebviewHostOptions<In> {
    readonly viewType: string;
    readonly title: string;
    /** Folders the page may load files from: images, through `asWebviewUri`. */
    readonly localResourceRoots: readonly Uri[];
    /** Every message from the page is parsed with it; a message that doesn't parse is logged and dropped. */
    readonly messages: ZodType<In>;
    readonly log: Logger;
}

/** What `render` puts into the page's template. */
export interface WebviewPage {
    /**
     * The HTML, with `<!--CSP-->` in its head, and `<!--STYLES-->` and
     * `<!--SCRIPTS-->` where the styles and scripts go.
     */
    readonly template: string;
    readonly styles?: readonly string[];
    /** Inline scripts, run in order. Each gets the page's nonce. */
    readonly scripts?: readonly string[];
    /** Globals set before the scripts run, as `window[name] = value`. */
    readonly globals?: Readonly<Record<string, unknown>>;
    /**
     * Sources added to the policy, by directive, for a page that embeds
     * content it doesn't control (the job page's exported notebook).
     */
    readonly csp?: Readonly<Record<string, readonly string[]>>;
}

/**
 * A webview panel with a content security policy:
 * scripts run only with the page's nonce, nothing loads from outside the
 * local resource roots, and the page can't reach the network. Messages from
 * the page are untrusted, so each one is validated before `onMessage` sees it.
 */
export class WebviewHost<In, Out> implements Disposable {
    private readonly panel: WebviewPanel;
    private readonly received = new Emitter<In>();
    private readonly disposed = new Emitter<void>();
    private readonly subscriptions: Disposable[] = [];
    private isDisposed = false;
    readonly onMessage: Event<In> = this.received.event;
    readonly onDidDispose: Event<void> = this.disposed.event;

    constructor(private readonly options: WebviewHostOptions<In>) {
        this.panel = window.createWebviewPanel(
            options.viewType,
            options.title,
            { viewColumn: ViewColumn.Beside, preserveFocus: true },
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [...options.localResourceRoots],
            },
        );
        this.subscriptions.push(
            this.panel.webview.onDidReceiveMessage((message: unknown) => this.receive(message)),
            this.panel.onDidDispose(() => {
                this.isDisposed = true;
                this.disposed.fire();
                this.release();
            }),
        );
    }

    get title(): string {
        return this.panel.title;
    }

    set title(value: string) {
        this.panel.title = value;
    }

    get visible(): boolean {
        return !this.isDisposed;
    }

    /** The page's URI for a file under one of the local resource roots. */
    asWebviewUri(uri: Uri): string {
        return this.panel.webview.asWebviewUri(uri).toString();
    }

    /** Sets the page's HTML, with a fresh nonce. */
    render(page: WebviewPage): void {
        const nonce = randomBytes(16).toString("base64");
        const scripts = [
            ...Object.entries(page.globals ?? {}).map(
                ([name, value]) => `window[${JSON.stringify(name)}] = ${scriptJson(value)};`,
            ),
            ...(page.scripts ?? []),
        ];
        this.panel.webview.html = page.template
            .replace(
                "<!--CSP-->",
                () =>
                    `<meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy(this.panel.webview.cspSource, nonce, page.csp)}" />`,
            )
            .replace("<!--STYLES-->", () =>
                (page.styles ?? []).map((css) => `<style>\n${css}\n</style>`).join("\n"),
            )
            .replace("<!--SCRIPTS-->", () =>
                scripts
                    .map((js) => `<script nonce="${nonce}">\n${inlineScript(js)}\n</script>`)
                    .join("\n"),
            );
    }

    post(message: Out): void {
        if (!this.isDisposed) {
            void this.panel.webview.postMessage(message);
        }
    }

    reveal(): void {
        this.panel.reveal(undefined, true);
    }

    dispose(): void {
        if (!this.isDisposed) {
            this.panel.dispose();
        }
        this.release();
    }

    private receive(message: unknown) {
        const parsed = this.options.messages.safeParse(message);
        if (!parsed.success) {
            this.options.log.warn(
                `Dropped an invalid message from the ${this.options.viewType} webview`,
                parsed.error.message,
            );
            return;
        }
        this.received.fire(parsed.data);
    }

    private release() {
        this.subscriptions.splice(0).forEach((s) => s.dispose());
        this.received.dispose();
        this.disposed.dispose();
    }
}

/**
 * Scripts need the nonce; styles may be inline, because the pages set
 * `style` attributes. Images come from the extension, or as data URIs.
 * `extra` adds sources to a directive, or adds a directive.
 */
export function contentSecurityPolicy(
    cspSource: string,
    nonce: string,
    extra: Readonly<Record<string, readonly string[]>> = {},
): string {
    const directives = new Map<string, string[]>([
        ["default-src", ["'none'"]],
        ["img-src", [cspSource, "data:"]],
        ["style-src", [cspSource, "'unsafe-inline'"]],
        ["font-src", [cspSource]],
        ["script-src", [`'nonce-${nonce}'`]],
    ]);
    for (const [directive, sources] of Object.entries(extra)) {
        directives.set(directive, [...(directives.get(directive) ?? []), ...sources]);
    }
    return [...directives]
        .map(([directive, sources]) => `${directive} ${sources.join(" ")}`)
        .join("; ");
}

/** A script that can't end its `<script>` element early. `<\/` means `</` in strings and regexes. */
function inlineScript(js: string): string {
    return js.replace(/<\/(script)/gi, "<\\/$1");
}

/** JSON that is safe inside a `<script>` element: no `</script>`, no `<!--`. */
export function scriptJson(value: unknown): string {
    return JSON.stringify(value ?? null)
        .replace(/</g, "\\u003c")
        .replaceAll(String.fromCharCode(0x2028), "\\u2028")
        .replaceAll(String.fromCharCode(0x2029), "\\u2029");
}
