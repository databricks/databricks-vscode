import {TextDecoder} from "util";
import {Uri, workspace} from "vscode";

export async function isNotebook(uri: Uri): Promise<boolean> {
    let bytes = await workspace.fs.readFile(uri);
    const lines = new TextDecoder().decode(bytes).split(/\r?\n/);
    return (
        lines.length > 0 && lines[0].startsWith("# Databricks notebook source")
    );
}
