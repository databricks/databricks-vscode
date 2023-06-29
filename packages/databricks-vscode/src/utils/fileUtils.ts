import {TextDecoder} from "util";
import {Uri, workspace} from "vscode";
import {LocalUri} from "../sync/SyncDestination";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {exists} from "fs-extra";
import path from "path";

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
