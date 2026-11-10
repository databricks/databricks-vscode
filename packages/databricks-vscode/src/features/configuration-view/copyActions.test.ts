import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerFeatures } from "../../kernel/feature";
import type { ConfigurationItem } from "../../platform/ui/sections";
import { fakeFeatureHost } from "../../test-support/fakes";
import { env, host as vscode } from "../../test-support/vscode";
import { configurationView } from "./index";
import { COPY_COMMAND_IDS, COPY_KINDS, copyCommandId, copyRow, stampCopyKind } from "./copyActions";

const item = (props: Partial<ConfigurationItem>) => ({ ...props }) as ConfigurationItem;

describe("stampCopyKind", () => {
    it("stamps every mapped label with its copy=<kind> suffix", () => {
        for (const [label, kind] of Object.entries(COPY_KINDS)) {
            const element = item({ label, description: "some value" });
            stampCopyKind(element);
            expect(element.contextValue, `label "${label}"`).toBe(
                `databricks.configuration.copy=${kind}`,
            );
        }
    });

    it("appends the suffix to an existing contextValue", () => {
        const element = item({
            label: "Cluster",
            description: "my-cluster",
            contextValue: "databricks.configuration.cluster.running.has-url",
        });
        stampCopyKind(element);
        expect(element.contextValue).toBe(
            "databricks.configuration.cluster.running.has-url.copy=clusterName",
        );
    });

    it("reads the label from a TreeItemLabel", () => {
        const element = item({ label: { label: "Target" }, description: "dev" });
        stampCopyKind(element);
        expect(element.contextValue).toBe("databricks.configuration.copy=target");
    });

    it("keeps confusable kinds distinct", () => {
        for (const [label, kind] of [
            ["State", "state"],
            ["Sync State", "syncState"],
            ["Mode", "mode"],
            ["Access Mode", "accessMode"],
            ["Cluster", "clusterName"],
            ["Cluster ID", "clusterId"],
        ]) {
            const element = item({ label, description: "x" });
            stampCopyKind(element);
            expect(element.contextValue).toBe(`databricks.configuration.copy=${kind}`);
        }
    });

    it("doesn't stamp unmapped labels: headers, buttons, prompts", () => {
        for (const label of [
            "Python Environment",
            "Install AI tools",
            "Select compute",
            "Serverless",
            "Agents",
            "AI tools",
        ]) {
            const element = item({ label, description: "whatever" });
            stampCopyKind(element);
            expect(element.contextValue, `label "${label}"`).toBeUndefined();
        }
    });

    it("doesn't stamp a mapped label without a text description", () => {
        for (const description of [undefined, "", true]) {
            const element = item({ label: "Host", description: description as string | undefined });
            stampCopyKind(element);
            expect(element.contextValue).toBeUndefined();
        }
    });

    it("is idempotent", () => {
        const element = item({ label: "Cluster ID", description: "1234-5678" });
        stampCopyKind(element);
        stampCopyKind(element);
        expect(element.contextValue).toBe("databricks.configuration.copy=clusterId");
    });
});

describe("copyRow", () => {
    beforeEach(() => vscode.reset());

    it("copies the copy text, else the description, else the label", async () => {
        await copyRow(
            item({ label: "Local Folder", description: "nested", copyText: "/w/nested" }),
        );
        expect(vscode.clipboard).toBe("/w/nested");
        await copyRow(item({ label: "Cluster", description: "dev-cluster" }));
        expect(vscode.clipboard).toBe("dev-cluster");
        await copyRow(item({ label: "Target" }));
        expect(vscode.clipboard).toBe("Target");
        expect(vscode.infos.map((i) => i.message)).toEqual([
            "Copied to clipboard",
            "Copied to clipboard",
            "Copied to clipboard",
        ]);
    });

    it("says so when there is nothing to copy", async () => {
        await expect(copyRow(undefined)).rejects.toMatchObject({
            userMessage: "Databricks: Can't copy to clipboard. No text found.",
        });
        expect(vscode.clipboard).toBe("");
    });
});

describe("the copy commands", () => {
    beforeEach(() => vscode.reset());

    it("are registered, and each copies the row it is run on", async () => {
        registerFeatures([configurationView], fakeFeatureHost().host);
        for (const [label, kind] of Object.entries(COPY_KINDS)) {
            const row = item({ label, description: `${kind} value` });
            stampCopyKind(row);
            await vscode.commands.get(copyCommandId(kind))!(row);
            expect(vscode.clipboard).toBe(`${kind} value`);
        }
        expect(vscode.infos).toHaveLength(Object.keys(COPY_KINDS).length);
        expect(vscode.errors).toEqual([]);
    });

    it("doesn't say it copied when the clipboard can't be written", async () => {
        registerFeatures([configurationView], fakeFeatureHost().host);
        const writeText = vi
            .spyOn(env.clipboard, "writeText")
            .mockRejectedValue(new Error("clipboard unavailable"));
        await vscode.commands.get(copyCommandId("target"))!(
            item({ label: "Target", description: "dev" }),
        );
        writeText.mockRestore();
        expect(vscode.infos).toEqual([]);
        expect(vscode.errors.map((e) => e.message)).toEqual([
            "Error running command databricks.configuration.copyTarget: clipboard unavailable",
        ]);
    });
});

interface Contribution {
    command: string;
    title?: string;
    when?: string;
}

/** The kinds live in COPY_KINDS and, by hand, in package.json; these keep them in step. */
describe("copy command wiring (COPY_KINDS ↔ package.json)", () => {
    const pkg = JSON.parse(
        fs.readFileSync(path.resolve(__dirname, "../../../package.json"), "utf-8"),
    ) as {
        contributes: { commands: Contribution[]; menus: Record<string, Contribution[]> };
    };
    const isCopy = (c: Contribution) => c.command.startsWith("databricks.configuration.copy");
    const expected = new Set(COPY_COMMAND_IDS);

    it("derives one command per distinct kind", () => {
        expect(COPY_COMMAND_IDS).toHaveLength(new Set(Object.values(COPY_KINDS)).size);
    });

    it("declares exactly those commands, titled 'Copy …'", () => {
        const declared = pkg.contributes.commands.filter(isCopy);
        expect(declared).toHaveLength(expected.size);
        expect(new Set(declared.map((c) => c.command))).toEqual(expected);
        for (const c of declared) {
            expect(c.title, c.command).toMatch(/^Copy /);
        }
    });

    it("has a view/item/context menu for each kind, gated on copy=<kind>, in the view its rows are in", () => {
        // The AI tools rows are in the Models & AI tools view.
        const modelsKinds = new Set(["scope", "version"]);
        const menus = pkg.contributes.menus["view/item/context"]!.filter(isCopy);
        expect(menus).toHaveLength(expected.size);
        for (const kind of new Set(Object.values(COPY_KINDS))) {
            const view = modelsKinds.has(kind) ? "modelsAndAiToolsView" : "configurationView";
            expect(menus.find((m) => m.command === copyCommandId(kind))?.when).toBe(
                `view == ${view} && viewItem =~ /\\.copy=${kind}$/`,
            );
        }
    });

    it("hides every copy command from the command palette", () => {
        const palette = pkg.contributes.menus.commandPalette!.filter(isCopy);
        expect(new Set(palette.map((m) => m.command))).toEqual(expected);
        expect(palette.every((m) => m.when === "false")).toBe(true);
    });
});
