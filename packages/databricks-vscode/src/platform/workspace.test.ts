import { beforeEach, describe, expect, it } from "vitest";
import { host as vscode } from "../test-support/vscode";
import { liveListenerCount } from "./event";
import { vscodeExtensions, vscodeFileSearch, workspaceFolders } from "./workspace";

describe("workspaceFolders", () => {
    beforeEach(() => vscode.reset());

    it("follows the window's folders", () => {
        vscode.folders = ["/a"];
        const folders = workspaceFolders();
        const seen: (readonly string[])[] = [];
        folders.onDidChange((f) => seen.push(f));
        vscode.folders = ["/a", "/b"];
        vscode.foldersChanged.fire();
        expect(folders.value).toEqual(["/a", "/b"]);
        expect(seen).toEqual([["/a", "/b"]]);
        folders.dispose();
    });

    it("disposes its subscription and its listeners, once", () => {
        const before = liveListenerCount();
        const folders = workspaceFolders();
        folders.onDidChange(() => {});
        expect(liveListenerCount()).toBe(before + 2);
        // It used to call itself until the stack overflowed.
        folders.dispose();
        expect(liveListenerCount()).toBe(before);
        vscode.folders = ["/a"];
        vscode.foldersChanged.fire();
        expect(folders.value).toEqual([]);
    });
});

describe("vscodeFileSearch", () => {
    beforeEach(() => vscode.reset());

    it("searches below the base with VS Code, and returns the paths found", async () => {
        vscode.found = ["/a/p/databricks.yml"];
        expect(await vscodeFileSearch.find("/a", "**/databricks.yml", "**/.*/**")).toEqual([
            "/a/p/databricks.yml",
        ]);
        expect(vscode.searches).toEqual([
            { base: "/a", pattern: "**/databricks.yml", exclude: "**/.*/**" },
        ]);
    });
});

describe("vscodeExtensions", () => {
    beforeEach(() => vscode.reset());
    const yaml = { isActive: false, exports: undefined, activate: async () => undefined };

    it("reads VS Code's extensions and its change event", () => {
        expect(vscodeExtensions.get("redhat.vscode-yaml")).toBe(undefined);
        vscode.extensions.set("redhat.vscode-yaml", {
            ...yaml,
            packageJSON: { version: "1.24.0" },
        });
        expect(vscodeExtensions.get("redhat.vscode-yaml")).toMatchObject({
            isActive: false,
            exports: undefined,
            version: "1.24.0",
        });
        let changes = 0;
        const subscription = vscodeExtensions.onDidChange(() => changes++);
        vscode.extensionsChanged.fire();
        subscription.dispose();
        expect(changes).toBe(1);
    });

    it("installs a missing or disabled extension enabled, under the progress title", async () => {
        await vscodeExtensions.install(
            "redhat.vscode-yaml",
            "Installing the YAML extension (redhat.vscode-yaml)",
        );
        expect(vscode.executed).toEqual([
            {
                command: "workbench.extensions.installExtension",
                args: ["redhat.vscode-yaml", { enable: true }],
            },
        ]);
        expect(vscode.progress.map((p) => p.title)).toEqual([
            "Installing the YAML extension (redhat.vscode-yaml)",
        ]);
    });

    it("installs over a present one without `enable`, with which VS Code would install nothing", async () => {
        vscode.extensions.set("redhat.vscode-yaml", yaml);
        await vscodeExtensions.install(
            "redhat.vscode-yaml",
            "Installing the YAML extension (redhat.vscode-yaml)",
        );
        expect(vscode.executed).toEqual([
            { command: "workbench.extensions.installExtension", args: ["redhat.vscode-yaml"] },
        ]);
    });

    it("shows an extension's page", async () => {
        await vscodeExtensions.show("redhat.vscode-yaml");
        expect(vscode.executed).toEqual([
            { command: "workbench.extensions.search", args: ["@id:redhat.vscode-yaml"] },
        ]);
    });
});
