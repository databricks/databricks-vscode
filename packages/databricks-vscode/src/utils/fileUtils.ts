import {TextDecoder} from "util";
import {Uri, workspace} from "vscode";

export async function isNotebook(uri: Uri): Promise<boolean> {
    const ext = uri.path.split(".").pop()?.toLowerCase();
    if (!ext) {
        return false;
    }

    if (ext === "ipynb") {
        return true;
    }

    const comment = {
        py: "#",
        scala: "//",
        sql: "--",
        r: "#",
    }[ext];

    const bytes = await workspace.fs.readFile(uri);
    const lines = new TextDecoder().decode(bytes).split(/\r?\n/);
    return (
        lines.length > 0 &&
        lines[0].startsWith(`${comment} Databricks notebook source`)
    );
}
