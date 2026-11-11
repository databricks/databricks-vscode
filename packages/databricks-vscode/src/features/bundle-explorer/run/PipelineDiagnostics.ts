import fs from "node:fs/promises";
import path from "node:path";
import {
    commands,
    Diagnostic,
    DiagnosticSeverity,
    languages,
    NotebookRange,
    Range,
    Selection,
    Uri,
    window,
    workspace,
    type DiagnosticCollection,
    type Disposable,
    type TextEditor,
} from "vscode";
import { remoteToLocal, type SyncDestination } from "../../../kernel/bundle/SyncDestination";
import type { PipelineEvent } from "../../../kernel/connection";
import { getEventMessage } from "./pipelineDatasets";

/*
 * Pipeline diagnostics (BNDL-12), ported from the old
 * `BundlePipelinesManager`: errors and warnings of each pipeline's latest
 * run that name a source location become diagnostics in the
 * "Databricks Pipelines" collection, and "Show more information" on an
 * event opens its location.
 */

type NotebookType = "IPYNB" | "PY_DBNB" | "OTHER_DBNB";

export interface SourceLocation {
    readonly path?: string;
    readonly lineNumber?: number;
    readonly notebookCellNumber?: number;
}

/** Notebooks lose their extension in the workspace: the local file may have `.py` or `.ipynb`. */
export async function expandPathAndType(
    localPath: string,
): Promise<{ path: string; type?: NotebookType } | undefined> {
    for (const candidate of [localPath, `${localPath}.py`, `${localPath}.ipynb`]) {
        try {
            if (!(await fs.stat(candidate)).isFile()) {
                continue;
            }
        } catch {
            continue;
        }
        return { path: candidate, type: await notebookType(candidate) };
    }
    return undefined;
}

async function notebookType(file: string): Promise<NotebookType | undefined> {
    const ext = path.extname(file).slice(1).toLowerCase();
    if (ext === "ipynb") {
        return "IPYNB";
    }
    const comment = ({ py: "#", scala: "//", sql: "--", r: "#" } as Record<string, string>)[ext];
    if (comment === undefined) {
        return undefined;
    }
    const firstLine = (await fs.readFile(file, "utf-8")).split(/\r?\n/, 1)[0] ?? "";
    if (firstLine.startsWith(`${comment} Databricks notebook source`)) {
        return ext === "py" ? "PY_DBNB" : "OTHER_DBNB";
    }
    return undefined;
}

/**
 * The event's line. In a `.py` notebook the line is within its cell, so the
 * lines of the cells before it are added; separators count as a line each.
 */
export async function locationToRange(
    file: string,
    location: SourceLocation,
    type?: NotebookType,
): Promise<Range> {
    const cellIndex = (location.notebookCellNumber ?? 1) - 1;
    let line = (location.lineNumber ?? 1) - 1;
    if (type === "PY_DBNB") {
        const previousCells = (await fs.readFile(file, "utf-8"))
            .split(/\r?\n# COMMAND ----------.*\r?\n/)
            .slice(0, cellIndex);
        line += previousCells
            .map((cell) => cell.split(/\r?\n/).length)
            .reduce((a, b) => a + b, previousCells.length);
    }
    return new Range(line, 0, line, Number.MAX_SAFE_INTEGER);
}

/**
 * VS Code's private URI of a notebook cell, built the way VS Code builds it,
 * so the diagnostic shows in the Problems panel without the notebook open.
 * https://github.com/microsoft/vscode/blob/9508be8/src/vs/workbench/services/notebook/common/notebookDocumentService.ts#L45
 */
export function notebookCellUri(notebook: Uri, handle: number): Uri {
    const lengths = ["W", "X", "Y", "Z", "a", "b", "c", "d", "e", "f"];
    const s = handle.toString(7);
    const p = s.length < lengths.length ? lengths[s.length - 1] : "z";
    // "file", base64-encoded.
    return notebook.with({ scheme: "vscode-notebook-cell", fragment: `${p}${s}sZmlsZQ==` });
}

/** One pipeline's latest run: its creation time and its events. */
export interface PipelineRunEvents {
    readonly creationTime?: bigint;
    readonly events?: readonly PipelineEvent[];
}

export class PipelineDiagnostics implements Disposable {
    private readonly collection: DiagnosticCollection =
        languages.createDiagnosticCollection("Databricks Pipelines");
    private generation = 0;

    clear(): void {
        this.generation++;
        this.collection.clear();
    }

    /** Replaces the diagnostics with those of each pipeline's latest run. */
    async update(
        latestRuns: readonly PipelineRunEvents[],
        mapping: SyncDestination | undefined,
    ): Promise<void> {
        const generation = ++this.generation;
        const byFile = new Map<string, { uri: Uri; diagnostics: Diagnostic[] }>();
        for (const run of mapping === undefined ? [] : latestRuns) {
            for (const event of run.events ?? []) {
                const location = event.origin?.sourceCodeLocation;
                if (
                    !event.message ||
                    !location?.path ||
                    (event.level !== "ERROR" && event.level !== "WARN")
                ) {
                    continue;
                }
                const local = remoteToLocal(location.path, mapping!);
                const file = local === undefined ? undefined : await expandPathAndType(local);
                if (file === undefined) {
                    continue;
                }
                let uri = Uri.file(file.path);
                if (file.type === "IPYNB") {
                    uri = notebookCellUri(uri, (location.notebookCellNumber ?? 1) - 1);
                }
                const diagnostic = new Diagnostic(
                    await locationToRange(file.path, location, file.type),
                    getEventMessage(event),
                    event.level === "ERROR" ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning,
                );
                diagnostic.source = "Databricks Extension";
                const key = uri.toString();
                const entry = byFile.get(key) ?? { uri, diagnostics: [] };
                entry.diagnostics.push(diagnostic);
                byFile.set(key, entry);
            }
        }
        if (generation !== this.generation) {
            return;
        }
        this.collection.clear();
        for (const { uri, diagnostics } of byFile.values()) {
            this.collection.set(uri, diagnostics);
        }
    }

    /** "Show more information": the whole message, then the event's location in its file. */
    async showEventDetails(
        event: PipelineEvent | undefined,
        mapping: SyncDestination | undefined,
    ): Promise<void> {
        if (!event?.message) {
            return;
        }
        void window.showInformationMessage(getEventMessage(event));
        const location = event.origin?.sourceCodeLocation;
        const local = location?.path && mapping ? remoteToLocal(location.path, mapping) : undefined;
        const file = local === undefined ? undefined : await expandPathAndType(local);
        if (file === undefined || location === undefined) {
            return;
        }
        const uri = Uri.file(file.path);
        const range = await locationToRange(file.path, location, file.type);
        let editor: TextEditor | undefined;
        if (file.type === "IPYNB") {
            const notebook = await workspace.openNotebookDocument(uri);
            const notebookEditor = await window.showNotebookDocument(notebook);
            const cellIndex = (location.notebookCellNumber ?? 1) - 1;
            notebookEditor.revealRange(new NotebookRange(cellIndex, cellIndex));
            if (location.notebookCellNumber) {
                editor = await window.showTextDocument(notebook.cellAt(cellIndex).document);
            }
        } else {
            editor = await window.showTextDocument(await workspace.openTextDocument(uri));
        }
        if (editor !== undefined) {
            editor.selection = new Selection(
                range.start.line,
                range.start.character,
                range.end.line,
                range.end.character,
            );
        }
        await commands.executeCommand("revealLine", { lineNumber: range.start.line, at: "center" });
    }

    dispose(): void {
        this.collection.dispose();
    }
}
