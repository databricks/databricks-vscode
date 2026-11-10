import os from "node:os";
import path from "node:path";
import { ApiError } from "@databricks/sdk-core/apierror";
import { env, Uri, window, workspace, type TreeView } from "vscode";
import type { Logger } from "../../platform/log";
import { errorMessage, UserFacingError } from "../../platform/errors";
import {
    basename,
    childPath,
    isDirectory,
    isFile,
    isNotebook,
    type WorkspaceEntry,
} from "./entries";
import type { WorkspaceFilesModel } from "./WorkspaceFilesModel";
import { wsfsUri } from "./WorkspaceFsProvider";
import { entryOf, type WorkspaceFsNode } from "./WorkspaceFsTree";

export const WSFS_REFRESH = "databricks.wsfs.refresh";
export const WSFS_CREATE_FOLDER = "databricks.wsfs.createFolder";
export const WSFS_CREATE_FOLDER_TOOLBAR = "databricks.wsfs.createFolder.toolbar";
export const WSFS_CREATE_FILE = "databricks.wsfs.createNewFile";
export const WSFS_CREATE_FILE_TOOLBAR = "databricks.wsfs.createNewFile.toolbar";
export const WSFS_DELETE = "databricks.wsfs.delete";
export const WSFS_UPLOAD = "databricks.wsfs.uploadFile";
export const WSFS_UPLOAD_TOOLBAR = "databricks.wsfs.uploadFile.toolbar";
export const WSFS_DOWNLOAD = "databricks.wsfs.downloadFile";
export const WSFS_COPY_PATH = "databricks.wsfs.copyPath";

/**
 * A minimal valid empty Python notebook (nbformat 4.5), the content of a new
 * `.ipynb`, so that it opens as a notebook right away.
 */
export const EMPTY_IPYNB_CONTENT = JSON.stringify(
    {
        cells: [],
        metadata: {
            kernelspec: {
                display_name: "Python 3",
                language: "python",
                name: "python3",
            },
            language_info: { name: "python" },
        },
        nbformat: 4,
        nbformat_minor: 5,
    },
    null,
    1,
);

type ItemType = "file" | "directory";

/** The comment that starts a source notebook's header line, by extension. */
const NOTEBOOK_COMMENTS: Readonly<Record<string, string>> = {
    py: "#",
    r: "#",
    sql: "--",
    scala: "//",
};

/**
 * The name an import (format AUTO) stores `name` under, which is where a clash
 * would be: a `.ipynb`, or a source file whose first line is its language's
 * notebook header (`# Databricks notebook source` for Python), becomes a
 * notebook without its extension. Anything else keeps its name.
 */
function storedName(name: string, content?: Uint8Array): string {
    if (/\.ipynb$/i.test(name)) {
        return name.replace(/\.ipynb$/i, "");
    }
    const extension = /\.(\w+)$/.exec(name)?.[1]?.toLowerCase();
    const comment = extension === undefined ? undefined : NOTEBOOK_COMMENTS[extension];
    const firstLine =
        content === undefined
            ? ""
            : (new TextDecoder().decode(content.subarray(0, 80)).split(/\r?\n/)[0] ?? "");
    if (
        extension !== undefined &&
        comment !== undefined &&
        firstLine.trimEnd() === `${comment} Databricks notebook source`
    ) {
        return name.slice(0, -(extension.length + 1));
    }
    return name;
}

/**
 * The explorer's commands (WSFS-03, WSFS-04), with the old strings. A
 * context-menu command acts on the row it was run on; its toolbar variant
 * on the selected row, or the root when nothing is selected.
 */
export class WorkspaceFsCommands {
    constructor(
        private readonly deps: {
            readonly model: WorkspaceFilesModel;
            readonly treeView: Pick<TreeView<WorkspaceFsNode>, "selection">;
            /** The active project's folder: the old default name of a new item. */
            readonly projectRoot?: string;
            readonly log: Logger;
        },
    ) {}

    refresh(): void {
        this.deps.model.refresh();
    }

    async createFolder(node?: unknown): Promise<WorkspaceEntry | undefined> {
        return this.doCreateFolder(entryOf(node)?.path ?? this.deps.model.root);
    }

    async createFolderFromToolbar(node?: unknown): Promise<WorkspaceEntry | undefined> {
        return this.doCreateFolder(this.toolbarTarget(node)?.path ?? this.deps.model.root);
    }

    async createFile(node?: unknown): Promise<void> {
        await this.doCreateFile(entryOf(node)?.path ?? this.deps.model.root);
    }

    async createFileFromToolbar(node?: unknown): Promise<void> {
        await this.doCreateFile(this.toolbarTarget(node)?.path ?? this.deps.model.root);
    }

    async uploadFile(node?: unknown): Promise<void> {
        const entry = entryOf(node);
        await this.doUploadFile(isDirectory(entry) ? entry.path : this.deps.model.root);
    }

    async uploadFileFromToolbar(node?: unknown): Promise<void> {
        const entry = this.toolbarTarget(node);
        await this.doUploadFile(isDirectory(entry) ? entry.path : this.deps.model.root);
    }

    async openInBrowser(node?: unknown): Promise<void> {
        const entry = this.requireEntry(node);
        await env.openExternal(Uri.parse(this.deps.model.url(entry)));
    }

    async copyPath(node?: unknown): Promise<void> {
        await env.clipboard.writeText(this.requireEntry(node).path);
    }

    async deleteItem(node?: unknown): Promise<void> {
        const entry = this.requireEntry(node);
        const dir = isDirectory(entry);
        const label = basename(entry.path);
        const answer = await window.showWarningMessage(
            `Delete "${label}"?`,
            {
                modal: true,
                detail: dir
                    ? `This will permanently delete the folder "${label}" and all its contents.`
                    : `This will permanently delete the file "${label}".`,
            },
            "Delete",
        );
        if (answer !== "Delete") {
            return;
        }
        try {
            await this.deps.model.delete(entry.path, dir);
        } catch (e) {
            throw new UserFacingError(
                "WSFS_DELETE_FAILED",
                `Failed to delete "${label}": ${errorMessage(e)}`,
                { cause: e },
            );
        }
    }

    async downloadFile(node?: unknown): Promise<void> {
        const entry = entryOf(node);
        if (!isFile(entry)) {
            throw new UserFacingError("WSFS_NOT_A_FILE", "Can only download files and notebooks");
        }
        const name = basename(entry.path);
        const destination = await window.showSaveDialog({
            defaultUri: Uri.file(path.join(this.deps.projectRoot ?? os.homedir(), name)),
            saveLabel: "Download",
        });
        if (destination === undefined) {
            return;
        }
        let content: Uint8Array;
        try {
            content = await this.deps.model.read(entry.path);
        } catch (e) {
            throw new UserFacingError(
                "WSFS_DOWNLOAD_FAILED",
                `Failed to download "${name}": ${errorMessage(e)}`,
                { cause: e },
            );
        }
        await workspace.fs.writeFile(destination, content);
    }

    /** The selected row, if the toolbar was clicked with one selected. */
    private toolbarTarget(node: unknown): WorkspaceEntry | undefined {
        return this.deps.treeView.selection[0] === undefined ? undefined : entryOf(node);
    }

    private requireEntry(node: unknown): WorkspaceEntry {
        const entry = entryOf(node);
        if (entry === undefined) {
            throw new UserFacingError(
                "WSFS_NO_ITEM",
                "Select an item in the Workspace file system view first.",
            );
        }
        return entry;
    }

    /** The directory to create in, checked as before. */
    private async validRoot(rootPath: string, itemType: ItemType): Promise<WorkspaceEntry> {
        const root = await this.deps.model.stat(rootPath);
        if (root === undefined) {
            this.deps.log.error(`Can't fetch details for ${rootPath}. `);
            throw new UserFacingError("WSFS_NO_ROOT", `Can't fetch details for ${rootPath}. `);
        }
        if (!isDirectory(root)) {
            throw new UserFacingError(
                "WSFS_NOT_A_DIRECTORY",
                `Cannot create a ${itemType} as a child of a ${root.type}`,
            );
        }
        return root;
    }

    /** The old name input: the project folder's name preselected, one path segment below `root`. */
    private async askForName(title: string, root: WorkspaceEntry): Promise<string | undefined> {
        const name =
            this.deps.projectRoot === undefined ? "" : path.basename(this.deps.projectRoot);
        return window.showInputBox({
            title,
            placeHolder: name,
            value: name,
            validateInput: (input) => {
                const child = childPath(root.path, input);
                if (child === undefined || child === root.path) {
                    return `The path must be a child of ${root.path}`;
                }
                if (input === "") {
                    return "Please enter a name";
                }
                if (input.includes("/")) {
                    return "Invalid name: Folders cannot contain '/'";
                }
                return undefined;
            },
        });
    }

    private async doCreateFolder(rootPath: string): Promise<WorkspaceEntry | undefined> {
        const root = await this.validRoot(rootPath, "directory");
        const input = await this.askForName("Directory Name", root);
        if (input === undefined) {
            return undefined;
        }
        const target = childPath(root.path, input)!;
        let created: WorkspaceEntry | undefined;
        try {
            created = await this.deps.model.mkdir(target);
        } catch (e) {
            if (e instanceof ApiError && e.code === "RESOURCE_ALREADY_EXISTS") {
                throw new UserFacingError(
                    "WSFS_EXISTS",
                    `Can't create ${input} as child of ${root.path}: A file with same path exists`,
                    { cause: e },
                );
            }
            throw new UserFacingError(
                "WSFS_MKDIR_FAILED",
                `Can't create directory ${input}: ${errorMessage(e)}`,
                { cause: e },
            );
        }
        if (!isDirectory(created)) {
            throw new UserFacingError("WSFS_MKDIR_FAILED", `Can't create directory ${input}`);
        }
        return created;
    }

    private async doCreateFile(rootPath: string): Promise<void> {
        const root = await this.validRoot(rootPath, "file");
        const input = await this.askForName("File Name", root);
        if (input === undefined) {
            return;
        }
        const ipynb = input.toLowerCase().endsWith(".ipynb");
        const existingName = storedName(input);
        if (!(await this.confirmOverwrite(`${root.path}/${existingName}`, existingName))) {
            return;
        }
        const content = new TextEncoder().encode(ipynb ? EMPTY_IPYNB_CONTENT : "");
        let created: WorkspaceEntry | undefined;
        try {
            created = await this.deps.model.write(`${root.path}/${input}`, content, true);
        } catch (e) {
            throw new UserFacingError(
                "WSFS_CREATE_FAILED",
                `Failed to create "${input}": ${errorMessage(e)}`,
                { cause: e },
            );
        }
        if (isNotebook(created)) {
            try {
                await env.openExternal(Uri.parse(this.deps.model.url(created)));
            } catch (e) {
                this.deps.log.error(`Can't open ${input} in browser after creation`, e);
            }
            return;
        }
        try {
            await window.showTextDocument(
                await workspace.openTextDocument(wsfsUri(created?.path ?? `${root.path}/${input}`)),
            );
        } catch (e) {
            this.deps.log.error(`Can't open ${input} after creation`, e);
        }
    }

    private async doUploadFile(rootPath: string): Promise<void> {
        const root = await this.validRoot(rootPath, "file");
        const picked = await window.showOpenDialog({ canSelectMany: false, openLabel: "Upload" });
        const source = picked?.[0];
        if (source === undefined) {
            return;
        }
        const fileName = source.path.split("/").pop() || "file";
        const content = await workspace.fs.readFile(source);
        const existingName = storedName(fileName, content);
        if (!(await this.confirmOverwrite(`${root.path}/${existingName}`, existingName))) {
            return;
        }
        try {
            await this.deps.model.write(`${root.path}/${fileName}`, content, true);
        } catch (e) {
            throw new UserFacingError(
                "WSFS_UPLOAD_FAILED",
                `Failed to upload "${fileName}": ${errorMessage(e)}`,
                { cause: e },
            );
        }
    }

    /** True when nothing is at `target`, or the user chose "Overwrite" (the old modal). */
    private async confirmOverwrite(target: string, name: string): Promise<boolean> {
        if ((await this.deps.model.stat(target)) === undefined) {
            return true;
        }
        const answer = await window.showWarningMessage(
            `"${name}" already exists in the workspace. Overwrite it?`,
            { modal: true },
            "Overwrite",
        );
        return answer === "Overwrite";
    }
}
