import { open } from "node:fs/promises";

/** The old `FileUtils.NotebookType`: a Jupyter notebook, a Databricks Python notebook, or another Databricks notebook. */
export type NotebookType = "IPYNB" | "PY_DBNB" | "OTHER_DBNB";

const COMMENTS: Readonly<Record<string, string>> = { py: "#", scala: "//", sql: "--", r: "#" };

/**
 * Whether a local file is a notebook (the old `FileUtils.isNotebook`): any
 * `.ipynb`, and a `.py`, `.scala`, `.sql` or `.r` file whose first line is
 * `<comment> Databricks notebook source`. Only the first line is read.
 */
export async function notebookType(filePath: string): Promise<NotebookType | undefined> {
    const ext = filePath.split(".").pop()?.toLowerCase();
    if (ext === "ipynb") {
        return "IPYNB";
    }
    const comment = ext === undefined ? undefined : COMMENTS[ext];
    if (comment === undefined) {
        return undefined;
    }
    const marker = `${comment} Databricks notebook source`;
    const file = await open(filePath, "r");
    try {
        const buffer = Buffer.alloc(marker.length + 3);
        const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
        // A UTF-8 byte order mark doesn't count, as before.
        return buffer.subarray(0, bytesRead).toString("utf-8").startsWith(marker)
            ? ext === "py"
                ? "PY_DBNB"
                : "OTHER_DBNB"
            : undefined;
    } finally {
        await file.close();
    }
}
