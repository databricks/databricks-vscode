import {TextDecoder} from "util";
import {Uri, workspace} from "vscode";
import {LocalUri} from "../sync/SyncDestination";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {exists} from "fs-extra";
import path from "path";
import {readFile, stat, writeFile} from "fs/promises";

export type NotebookType = "IPYNB" | "PY_DBNB" | "OTHER_DBNB";
export async function isNotebook(
    uri: LocalUri
): Promise<NotebookType | undefined> {
    const ext = uri.path.split(".").pop()?.toLowerCase();
    if (!ext) {
        return;
    }

    if (ext === "ipynb") {
        return "IPYNB";
    }

    const comment = {
        py: "#",
        scala: "//",
        sql: "--",
        r: "#",
    }[ext];

    const bytes = await workspace.fs.readFile(uri.uri);
    const lines = new TextDecoder().decode(bytes).split(/\r?\n/);
    if (
        lines.length > 0 &&
        lines[0].startsWith(`${comment} Databricks notebook source`)
    ) {
        return ext === "py" ? "PY_DBNB" : "OTHER_DBNB";
    }
}

export async function waitForDatabricksProject(
    workspacePath: Uri,
    connectionManager: ConnectionManager
) {
    if (!(await exists(path.join(workspacePath.fsPath, ".databricks")))) {
        await connectionManager.waitForConnect();
    }
}

export async function writeFileIfDiff(
    uri: Uri,
    content: string,
    encoding: BufferEncoding = "utf-8"
) {
    let currentContent: string | undefined = "";
    try {
        if ((await stat(uri.fsPath)).isFile()) {
            currentContent = await readFile(uri.fsPath, {encoding});
        }
        if (currentContent === content) {
            return;
        }
    } catch (e) {}
    await writeFile(uri.fsPath, content, {encoding});
}
