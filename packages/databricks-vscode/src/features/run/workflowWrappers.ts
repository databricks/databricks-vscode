import posix from "node:path/posix";
import type { NotebookType } from "./notebooks";

/*
 * The files that "Run File as Workflow" runs in place of the user's file
 * (RUN-02): a wrapper next to it in the workspace, which changes into the
 * file's folder and puts the project's root on `sys.path` before the
 * user's code runs. Ported from the old `WorkspaceFsWorkflowWrapper`; the
 * upload is `WorkflowRunner`'s.
 */

/** Where the wrapped file and the project's files are, as the cluster sees them (`/Workspace/…`). */
export interface WrapperTarget {
    readonly sourceFile: string;
    readonly projectRoot: string;
}

/** A wrapper to import: its workspace path, and its content. */
export interface Wrapper {
    readonly path: string;
    readonly content: string;
    /** What the job runs: the notebook (imported without its extension), or the file. */
    readonly runPath: string;
}

/** `dir/name.py` → `dir/name.databricks.<parts>.py`, as before. */
export function wrapperPath(remoteFile: string, parts: readonly string[]): string {
    return posix.format({
        dir: posix.dirname(remoteFile),
        name: posix.basename(remoteFile).split(".").slice(0, -1).concat(parts).join("."),
        ext: posix.extname(remoteFile),
    });
}

/**
 * Quotes and backslashes in a path, escaped for a Python string in single or
 * double quotes. The old wrappers inserted the path as it was, so a quote in
 * it broke the wrapper.
 */
function pythonString(value: string): string {
    return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/"/g, '\\"');
}

function substitute(content: string, target: WrapperTarget): string {
    return content
        .replace(/{{DATABRICKS_SOURCE_FILE}}/g, () => pythonString(target.sourceFile))
        .replace(/{{DATABRICKS_PROJECT_ROOT}}/g, () => pythonString(target.projectRoot));
}

interface Cell {
    source: string[];
    type: "code" | "not_code";
    originalCell?: unknown;
}

/**
 * Moves `%pip install` lines and `dbutils.library.restartPython()` into
 * cells of their own at the start, so the installs happen before the
 * wrapper's preamble, unless `databricks.wsfs.rearrangeCells` is off.
 * Unchanged from the old wrapper.
 */
function rearrangeCells(cells: Cell[], enabled: boolean): Cell[] {
    if (!enabled) {
        return cells;
    }
    const beginningCells: Cell[] = [];
    const endingCells: Cell[] = [];

    for (const cell of cells) {
        if (cell.type === "not_code") {
            endingCells.push(cell);
            continue;
        }
        const newCell: Cell = { source: [], type: "code", originalCell: cell.originalCell };
        for (const line of cell.source) {
            // Add each 0-indent line starting with %pip install or dbutils.library.restartPython(),
            // as a new cell to the beginning and remove it from the original cell
            if (line.startsWith("%pip install") || line.startsWith("# MAGIC %pip install")) {
                beginningCells.push({
                    source: [
                        "import os",
                        "os.chdir(os.path.dirname('{{DATABRICKS_SOURCE_FILE}}'))",
                        line,
                    ],
                    type: "code",
                });
                continue;
            } else if (line.startsWith("dbutils.library.restartPython()")) {
                beginningCells.push({ source: [line], type: "code" });
                continue;
            }
            newCell.source.push(line);
        }
        endingCells.push(newCell);
    }

    return [...beginningCells, ...endingCells].filter((cell) => cell.source.length !== 0);
}

/** A notebook imported with `AUTO` loses its extension. */
function notebookPath(remotePath: string): string {
    return remotePath.replace(/^(\/.*)\.(py|ipynb|scala|r|sql)$/, "$1");
}

/** The wrapper of a Python file: `file.workflow-wrapper.py`, which runs it with `runpy`. */
export function pythonFileWrapper(
    template: string,
    remoteFile: string,
    target: WrapperTarget,
): Wrapper {
    const path = wrapperPath(remoteFile, ["databricks", "file", "workflow-wrapper"]);
    return { path, content: substitute(template, target), runPath: path };
}

/**
 * The wrapper of a Databricks Python notebook: the preamble
 * (`notebook.workflow-wrapper.py`) as the first cell, then the notebook's
 * cells.
 */
export function sourceNotebookWrapper(
    source: string,
    preamble: string,
    remoteFile: string,
    target: WrapperTarget,
    rearrange: boolean,
): Wrapper {
    // The first line is "# Databricks notebook source": the caller checked.
    const originalCode = source.split(/\r?\n/).slice(1);
    const cells = [preamble.split(/\r?\n/)]
        .concat(
            originalCode
                .join("\n")
                .split(/# COMMAND ----------\r?\n/)
                .map((cell) => cell.trimEnd().split(/\r?\n/)),
        )
        .map((cell): Cell => ({ source: cell, type: "code" }));
    const rearranged = rearrangeCells(cells, rearrange);
    rearranged.at(0)?.source.unshift("# Databricks notebook source");
    const content = rearranged
        .map((cell) => cell.source.join("\n"))
        .join("\n# COMMAND ----------\n");
    const path = wrapperPath(remoteFile, ["databricks", "notebook", "workflow-wrapper"]);
    return { path, content: substitute(content, target), runPath: notebookPath(path) };
}

/* eslint-disable @typescript-eslint/naming-convention */
type JupyterCell = { source?: string[] | string; cell_type?: string; [key: string]: unknown };

/** The preamble as a hidden code cell; the old build generated it as `notebook.workflow-wrapper.json`. */
function preambleCell(preamble: string): JupyterCell {
    return {
        cell_type: "code",
        source: [preamble],
        metadata: { jupyter: { source_hidden: true } },
        outputs: [],
        execution_count: null,
    };
}

/** The wrapper of a Jupyter notebook: the preamble cell first, then the notebook's cells. */
export function jupyterNotebookWrapper(
    source: string,
    preamble: string,
    remoteFile: string,
    target: WrapperTarget,
    rearrange: boolean,
): Wrapper {
    const original = JSON.parse(source) as { cells?: JupyterCell[] };
    const bootstrap = preambleCell(preamble);
    // Each `source` is a string or an array of strings that may hold several lines; split them into lines.
    const cells = [bootstrap].concat(original.cells ?? []).map((cell): Cell => {
        const lines = Array.isArray(cell.source)
            ? cell.source
            : typeof cell.source === "string"
              ? [cell.source]
              : [];
        return {
            source: lines.flatMap((line) => line.trimEnd().split(/\r?\n/)),
            type: cell.cell_type === "code" ? "code" : "not_code",
            originalCell: cell,
        };
    });
    original.cells = rearrangeCells(cells, rearrange).map((cell) =>
        cell.type === "not_code"
            ? (cell.originalCell as JupyterCell)
            : {
                  ...((cell.originalCell as JupyterCell | undefined) ?? bootstrap),
                  source: [substitute(cell.source.join("\n"), target)],
              },
    );
    const path = wrapperPath(remoteFile, ["databricks", "notebook", "workflow-wrapper"]);
    return { path, content: JSON.stringify(original), runPath: notebookPath(path) };
}
/* eslint-enable @typescript-eslint/naming-convention */

/** The wrapper for a notebook, or none for a Scala, SQL or R notebook, which runs as it is. */
export function notebookWrapper(
    type: NotebookType,
    source: string,
    preamble: string,
    remoteFile: string,
    target: WrapperTarget,
    rearrange: boolean,
): Wrapper | undefined {
    switch (type) {
        case "PY_DBNB":
            return sourceNotebookWrapper(source, preamble, remoteFile, target, rearrange);
        case "IPYNB":
            return jupyterNotebookWrapper(source, preamble, remoteFile, target, rearrange);
        case "OTHER_DBNB":
            return undefined;
    }
}
