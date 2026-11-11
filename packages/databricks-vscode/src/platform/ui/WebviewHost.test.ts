import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { fakeLog } from "../../test-support/fakes";
import { Uri } from "vscode";
import { host as vscode } from "../../test-support/vscode";
import { contentSecurityPolicy, scriptJson, WebviewHost } from "./WebviewHost";

const Message = z.object({ command: z.literal("copy"), text: z.string() });

function open() {
    const host = new WebviewHost<z.infer<typeof Message>, { fn: string }>({
        viewType: "test.view",
        title: "Test",
        localResourceRoots: [Uri.file("/ext/resources")],
        messages: Message,
        log: fakeLog(),
    });
    return { host, panel: vscode.webviewPanels.at(-1)! };
}

describe("WebviewHost", () => {
    beforeEach(() => vscode.reset());

    it("opens beside the editor with scripts on and only the given resource roots", () => {
        const { panel } = open();
        expect(panel.viewType).toBe("test.view");
        expect(panel.options.enableScripts).toBe(true);
        expect(panel.options.localResourceRoots?.map((u) => u.fsPath)).toEqual(["/ext/resources"]);
    });

    it("renders a CSP, the styles, the globals and the scripts, each script with the nonce", () => {
        const { host, panel } = open();
        host.render({
            template: "<head><!--CSP--><!--STYLES--></head><body><!--SCRIPTS--></body>",
            styles: ["a{}"],
            scripts: ["run()", "x = '</script>'"],
            globals: { DATA: { html: "</script><script>alert(1)</script>" } },
        });
        const nonce = /'nonce-([^']+)'/.exec(panel.html)![1];
        expect(panel.html).toContain(
            `content="${contentSecurityPolicy("vscode-webview://fake", nonce)}"`,
        );
        expect(panel.html).toContain("<style>\na{}\n</style>");
        expect(panel.html.match(/<script nonce="[^"]+">/g)).toEqual(
            Array(3).fill(`<script nonce="${nonce}">`),
        );
        expect(panel.html).not.toContain("<script>alert");
        expect(panel.html).toContain(`x = '<\\/script>'`);
        expect(panel.html.match(/<\/script>/g)).toHaveLength(3);
    });

    it("uses a fresh nonce for each render", () => {
        const { host, panel } = open();
        const page = { template: "<!--CSP-->" };
        host.render(page);
        const first = panel.html;
        host.render(page);
        expect(panel.html).not.toBe(first);
    });

    it("passes on valid messages and drops the rest", () => {
        const { host, panel } = open();
        const received: unknown[] = [];
        host.onMessage((m) => received.push(m));
        panel.receive({ command: "copy", text: "a" });
        panel.receive({ command: "copy", text: 1 });
        panel.receive({ command: "navigate" });
        panel.receive(null);
        expect(received).toEqual([{ command: "copy", text: "a" }]);
    });

    it("posts until the panel closes, then reports it", () => {
        const { host, panel } = open();
        let closed = 0;
        host.onDidDispose(() => closed++);
        host.post({ fn: "a" });
        panel.dispose();
        host.post({ fn: "b" });
        expect(panel.posted).toEqual([{ fn: "a" }]);
        expect([closed, host.visible]).toEqual([1, false]);
    });
});

describe("contentSecurityPolicy", () => {
    it("allows nothing by default, and scripts only with the nonce", () => {
        expect(contentSecurityPolicy("src", "n")).toBe(
            "default-src 'none'; img-src src data:; style-src src 'unsafe-inline'; font-src src; script-src 'nonce-n'",
        );
    });

    it("adds a page's sources to a directive, or adds the directive", () => {
        expect(
            contentSecurityPolicy("src", "n", {
                "script-src": ["'strict-dynamic'"],
                "connect-src": ["https:"],
            }),
        ).toBe(
            "default-src 'none'; img-src src data:; style-src src 'unsafe-inline'; font-src src; script-src 'nonce-n' 'strict-dynamic'; connect-src https:",
        );
    });
});

describe("scriptJson", () => {
    it("can't close the script element", () => {
        expect(scriptJson({ a: "</script><!--" })).toBe('{"a":"\\u003c/script>\\u003c!--"}');
        expect(JSON.parse(scriptJson({ a: "</script>\u2028" }))).toEqual({ a: "</script>\u2028" });
    });
});
