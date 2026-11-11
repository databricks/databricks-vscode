import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import yaml from "yaml";
import { getBasicBundleConfig } from "./utils/bundle-fixtures.ts";
import { waitForLogin } from "./utils/configuration.ts";
import { dismissNotifications } from "./utils/dismiss-notifications.ts";

/**
 * Bundle files get the CLI's `bundle schema` through
 * `redhat.vscode-yaml` (BNDL-04), which no frozen spec covers.
 * Opening `databricks.yml` loads the schema; completion then offers the
 * bundle's keys, at the top level and inside a target, and flags a key a
 * target can't have. The edits go through the editor and aren't saved.
 */

interface Completion {
    labels: string[];
}

/** Completion labels at the end of `line` (zero-based) of `file`, as the YAML extension computes them. */
async function completionsAt(file: string, line: number): Promise<Completion> {
    return browser.executeWorkbench(
        async (vscode, fsPath: string, lineNumber: number) => {
            const uri = vscode.Uri.file(fsPath);
            const document = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(document);
            const position = new vscode.Position(
                lineNumber,
                document.lineAt(lineNumber).text.length,
            );
            const list = (await vscode.commands.executeCommand(
                "vscode.executeCompletionItemProvider",
                uri,
                position,
            )) as {
                items: { label: string | { label: string } }[];
            };
            return {
                labels: list.items.map((i) =>
                    typeof i.label === "string" ? i.label : i.label.label,
                ),
            };
        },
        file,
        line,
    );
}

/** Replaces the open document's text, as typing would, without saving. */
async function setText(file: string, text: string) {
    await browser.executeWorkbench(
        async (vscode, fsPath: string, content: string) => {
            const document = await vscode.workspace.openTextDocument(vscode.Uri.file(fsPath));
            const edit = new vscode.WorkspaceEdit();
            edit.replace(document.uri, new vscode.Range(0, 0, document.lineCount, 0), content);
            await vscode.workspace.applyEdit(edit);
        },
        file,
        text,
    );
}

async function waitForCompletions(file: string, line: number, expected: string[]) {
    let last: string[] = [];
    await browser.waitUntil(
        async () => {
            last = (await completionsAt(file, line)).labels;
            return expected.every((e) => last.includes(e));
        },
        {
            timeout: 60_000,
            interval: 2_000,
            timeoutMsg: `No completions ${expected.join(", ")} at line ${line + 1}; got ${last.join(", ")}`,
        },
    );
}

describe("Bundle YAML schema", async function () {
    let file: string;

    this.timeout(3 * 60 * 1000);

    before(async () => {
        assert(process.env.WORKSPACE_PATH, "WORKSPACE_PATH doesn't exist");
        file = path.join(process.env.WORKSPACE_PATH, "databricks.yml");
        // A blank top-level line at the end, and one inside the target.
        const config = yaml.stringify(getBasicBundleConfig({}, false));
        await fs.writeFile(file, `${config}\n`);
        await waitForLogin("DEFAULT");
        await dismissNotifications();
    });

    it("should offer the bundle's top-level keys", async () => {
        const lines = (await fs.readFile(file, "utf-8")).split("\n");
        await waitForCompletions(file, lines.length - 1, ["resources", "variables", "include"]);
    });

    it("should offer a target's keys inside a target", async () => {
        const content = await fs.readFile(file, "utf-8");
        const lines = content.split("\n");
        const target = lines.findIndex((l) => l.trim() === "dev_test:");
        assert(target >= 0, "The fixture has no dev_test target");
        lines.splice(target + 1, 0, "    ");
        await setText(file, lines.join("\n"));
        // The YAML extension leaves out the keys the target already has (mode, workspace).
        await waitForCompletions(file, target + 1, ["resources", "cluster_id", "run_as"]);
    });

    it("should flag a key the schema doesn't allow in a target", async () => {
        const text = (await fs.readFile(file, "utf-8")).replace(
            "    default: true",
            "    default: true\n    no_such_key: 1",
        );
        await setText(file, text);
        let last: string[] = [];
        await browser.waitUntil(
            async () => {
                last = await browser.executeWorkbench(
                    (vscode, fsPath: string) =>
                        vscode.languages
                            .getDiagnostics(vscode.Uri.file(fsPath))
                            .map((d: { message: string }) => d.message),
                    file,
                );
                return last.includes("Property no_such_key is not allowed.");
            },
            {
                timeout: 30_000,
                interval: 2_000,
                timeoutMsg: `The YAML extension didn't flag no_such_key; diagnostics: ${last.join(", ")}`,
            },
        );
    });
});
