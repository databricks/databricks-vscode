import {TextDecoder} from "util";
import {Uri, workspace, FileSystemError, window} from "vscode";
import {LocalUri} from "../sync/SyncDestination";
import type {ConnectionManager} from "../configuration/ConnectionManager";
import {workspaceConfigs} from "../vscode-objs/WorkspaceConfigs";
import {exists} from "fs-extra";
import path from "path";
import {homedir} from "os";
import {stat} from "fs/promises";

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

export async function expandUriAndType(localUri?: LocalUri): Promise<{
    uri?: Uri;
    ext?: string;
    type?: NotebookType;
}> {
    if (!localUri) {
        return {};
    }
    const extensions = ["", "py", "ipynb"];
    const checks = extensions.map((ext) => ({
        ext,
        type: undefined as NotebookType | undefined,
        uri: ext
            ? localUri.uri.with({path: localUri.path + "." + ext})
            : localUri.uri,
    }));
    for (const check of checks) {
        try {
            await stat(check.uri.fsPath);
            check.type = await isNotebook(new LocalUri(check.uri));
            return check;
        } catch (e) {}
    }
    return {};
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

export function getDatabricksConfigFilePath() {
    const homeDir = getHomedir();
    let filePath =
        workspaceConfigs.databrickscfgLocation ??
        path.join(homeDir, ".databrickscfg");

    if (filePath.startsWith("~/")) {
        filePath = path.join(homeDir, filePath.slice(2));
    }
    return Uri.file(path.normalize(filePath));
}

export async function openDatabricksConfigFile() {
    const uri = getDatabricksConfigFilePath();
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
