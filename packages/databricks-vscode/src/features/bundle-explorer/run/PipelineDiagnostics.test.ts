import { beforeEach, describe, expect, it } from "vitest";
import { useTempDirs } from "../../../test-support/tempDir";
import { Uri } from "vscode";
import { host as vscode } from "../../../test-support/vscode";
import {
    expandPathAndType,
    locationToRange,
    notebookCellUri,
    PipelineDiagnostics,
} from "./PipelineDiagnostics";

const tempDir = useTempDirs();

const PY_NOTEBOOK = `# Databricks notebook source
print('cell 1')

# COMMAND ----------
print('cell 2')
print('still cell 2')


# COMMAND ----------
print('cell 3')`;

// Ported from the old `BundlePipelinesManager.test.ts`.
describe("locationToRange", () => {
    it("returns the line of a text file", async () => {
        const range = await locationToRange("/path/to/file.py", {
            path: "/path/to/file.py",
            lineNumber: 10,
        });
        expect([range.start.line, range.end.line]).toEqual([9, 9]);
    });

    it("returns the line within its cell for an .ipynb notebook", async () => {
        const range = await locationToRange(
            "/path/to/notebook.ipynb",
            { path: "/x", lineNumber: 5, notebookCellNumber: 2 },
            "IPYNB",
        );
        expect([range.start.line, range.end.line]).toEqual([4, 4]);
    });

    it("adds the previous cells' lines for a .py notebook", async () => {
        const file = tempDir().write("notebook.py", PY_NOTEBOOK);
        const range = await locationToRange(
            file,
            { path: file, lineNumber: 1, notebookCellNumber: 3 },
            "PY_DBNB",
        );
        expect([range.start.line, range.end.line]).toEqual([9, 9]);
    });
});

describe("remote paths", () => {
    it("finds the local notebook, which has an extension the remote one lacks, and its type", async () => {
        const t = tempDir();
        t.write("src/nb.py", PY_NOTEBOOK);
        t.write("src/other.ipynb", "{}");
        t.write("src/plain.py", "print(1)");
        expect(await expandPathAndType(t.path("src/nb"))).toEqual({
            path: t.path("src/nb.py"),
            type: "PY_DBNB",
        });
        expect(await expandPathAndType(t.path("src/other"))).toEqual({
            path: t.path("src/other.ipynb"),
            type: "IPYNB",
        });
        expect(await expandPathAndType(t.path("src/plain.py"))).toEqual({
            path: t.path("src/plain.py"),
            type: undefined,
        });
        expect(await expandPathAndType(t.path("src/missing"))).toBeUndefined();
        expect(await expandPathAndType(t.path("src"))).toBeUndefined();
    });

    it("builds VS Code's cell URI", () => {
        expect(notebookCellUri(Uri.file("/p/nb.ipynb"), 0).toString()).toBe(
            "vscode-notebook-cell:///p/nb.ipynb#W0sZmlsZQ==",
        );
        expect(notebookCellUri(Uri.file("/p/nb.ipynb"), 8).toString()).toBe(
            "vscode-notebook-cell:///p/nb.ipynb#X11sZmlsZQ==",
        );
    });
});

describe("PipelineDiagnostics", () => {
    beforeEach(() => vscode.reset());

    it("turns the latest runs' errors and warnings with a location into diagnostics", async () => {
        const t = tempDir();
        t.write("src/nb.py", PY_NOTEBOOK);
        t.write("src/book.ipynb", "{}");
        const mapping = {
            remoteRoot: "/Workspace/Users/me/.bundle/demo/dev/files",
            localRoot: t.dir,
        };
        const at = (file: string, lineNumber: number, notebookCellNumber?: number) => ({
            sourceCodeLocation: {
                path: `/Workspace/Users/me/.bundle/demo/dev/files/src/${file}`,
                lineNumber,
                notebookCellNumber,
            },
        });
        const diagnostics = new PipelineDiagnostics();
        await diagnostics.update(
            [
                {
                    events: [
                        {
                            level: "ERROR",
                            message: "Failed",
                            error: { exceptions: [{ message: "No table" }] },
                            origin: at("nb", 1, 3),
                        },
                        { level: "WARN", message: "Careful", origin: at("book", 2, 1) },
                        { level: "INFO", message: "Fine", origin: at("nb", 1) },
                        {
                            level: "ERROR",
                            message: "Elsewhere",
                            origin: {
                                sourceCodeLocation: { path: "/Users/other/nb", lineNumber: 1 },
                            },
                        },
                        { level: "ERROR", message: "Nowhere" },
                    ],
                },
            ],
            mapping,
        );
        const collection = vscode.diagnostics[0]!;
        expect(collection.name).toBe("Databricks Pipelines");
        const nb = collection.entries.get(Uri.file(t.path("src/nb.py")).toString())!;
        expect(nb.map((d) => [d.message, d.severity, d.range.start.line, d.source])).toEqual([
            ["Failed\nNo table", 0, 9, "Databricks Extension"],
        ]);
        const cell = collection.entries.get(
            notebookCellUri(Uri.file(t.path("src/book.ipynb")), 0).toString(),
        )!;
        expect(cell.map((d) => [d.message, d.severity, d.range.start.line])).toEqual([
            ["Careful", 1, 1],
        ]);
        expect(collection.entries.size).toBe(2);

        diagnostics.clear();
        expect(collection.entries.size).toBe(0);
    });

    it("shows nothing without a mapping", async () => {
        const diagnostics = new PipelineDiagnostics();
        await diagnostics.update(
            [
                {
                    events: [
                        {
                            level: "ERROR",
                            message: "Failed",
                            origin: { sourceCodeLocation: { path: "/x" } },
                        },
                    ],
                },
            ],
            undefined,
        );
        expect(vscode.diagnostics[0]!.entries.size).toBe(0);
    });
});
