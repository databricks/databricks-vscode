import {TextDecoder} from "util";
import {Uri, workspace, FileSystemError, window} from "vscode";
import {LocalUri} from "../sync/SyncDestination";
import type {ConnectionManager} from "../configuration/ConnectionManager";
import {workspaceConfigs} from "../vscode-objs/WorkspaceConfigs";
import {exists} from "fs-extra";
import path from "path";
import {homedir} from "os";

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

export function getHomedir() {
    return process.env.HOME ?? homedir();
}

export async function openDatabricksConfigFile() {
    const homeDir = getHomedir();
    let filePath =
        workspaceConfigs.databrickscfgLocation ??
        process.env.DATABRICKS_CONFIG_FILE ??
        path.join(homeDir, ".databrickscfg");

    if (filePath.startsWith("~/")) {
        filePath = path.join(homeDir, filePath.slice(2));
    }
    const uri = Uri.file(path.normalize(filePath));
    try {
        await workspace.fs.stat(uri);
    } catch (e) {
        if (e instanceof FileSystemError && e.code === "FileNotFound") {
            await workspace.fs.writeFile(uri, Buffer.from(""));
        } else {
            throw e;
        }
    }

    const doc = await workspace.openTextDocument(uri);
    await window.showTextDocument(doc);
}
