import {
    WorkspaceFsEntity,
    logging,
    WorkspaceFsUtils,
} from "@databricks/databricks-sdk";
import {Context, context} from "@databricks/databricks-sdk/dist/context";
import {readFile} from "fs/promises";
import path from "path";
import posix from "path/posix";
import {ExtensionContext} from "vscode";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {Loggers} from "../logger";
import {LocalUri, RemoteUri} from "../sync/SyncDestination";
import {FileUtils} from "../utils";

function getWrapperPath(remoteFilePath: RemoteUri, extraParts: string[]) {
    return new RemoteUri(
        posix.format({
            dir: posix.dirname(remoteFilePath.path),
            name: posix
                .basename(remoteFilePath.path)
                .split(".")
                .slice(0, -1)
                .concat(extraParts)
                .join("."),
            ext: posix.extname(remoteFilePath.path),
        })
    );
}

async function readBootstrap(
    bootstrapPath: string,
    remoteFilePath: RemoteUri,
    dbProjectRoot: RemoteUri
) {
    return (await readFile(bootstrapPath, "utf-8"))
        .replace(
            "{{DATABRICKS_SOURCE_FILE}}",
            remoteFilePath.workspacePrefixPath
        )
        .replace(
            "{{DATABRICKS_PROJECT_ROOT}}",
            dbProjectRoot.workspacePrefixPath
        );
}

export class WorkspaceFsWorkflowWrapper {
    constructor(
        private readonly connectionManager: ConnectionManager,
        private readonly extensionContext: ExtensionContext
    ) {}

    @logging.withLogContext(Loggers.Extension)
    private async createFile(
        remoteFilePath: RemoteUri,
        content: string,
        @context ctx?: Context
    ) {
        const dirpath = posix.dirname(remoteFilePath.path);

        if (!this.connectionManager.workspaceClient) {
            throw new Error(`Not logged in`);
        }
        const rootDir = await WorkspaceFsEntity.fromPath(
            this.connectionManager.workspaceClient,
            dirpath,
            ctx
        );
        if (!WorkspaceFsUtils.isDirectory(rootDir)) {
            throw new Error(`${dirpath} is not a directory`);
        }
        const wrappedFile = await rootDir.createFile(
            remoteFilePath.path,
            content,
            true,
            ctx
        );
        if (!WorkspaceFsUtils.isFile(wrappedFile)) {
            throw new Error(
                `Cannot create workflow wrapper for ${remoteFilePath.path}`
            );
        }
        return wrappedFile;
    }

    @logging.withLogContext(Loggers.Extension)
    private async createIpynbWrapper(
        localFilePath: LocalUri,
        remoteFilePath: RemoteUri,
        dbProjectRoot: RemoteUri,
        @context ctx?: Context
    ) {
        const data = await readFile(localFilePath.path, "utf-8");
        const originalJson: {cells: any[] | undefined} = JSON.parse(data);

        const bootstrapPath = this.extensionContext.asAbsolutePath(
            path.join(
                "resources",
                "python",
                "generated",
                "notebook.workflow-wrapper.json"
            )
        );
        const bootstrapJson = JSON.parse(
            await readBootstrap(bootstrapPath, remoteFilePath, dbProjectRoot)
        );
        originalJson["cells"] = [bootstrapJson].concat(
            originalJson["cells"] ?? []
        );
        return this.createFile(
            getWrapperPath(remoteFilePath, [
                "databricks",
                "notebook",
                "workflow-wrapper",
            ]),
            JSON.stringify(originalJson),
            ctx
        );
    }

    @logging.withLogContext(Loggers.Extension)
    private async createDbnbWrapper(
        localFilePath: LocalUri,
        remoteFilePath: RemoteUri,
        dbProjectRoot: RemoteUri,
        @context ctx?: Context
    ) {
        const data = await readFile(localFilePath.path, "utf-8");
        //Since this function is called only when notebook is a databricks notebook
        //we can assume that first line will be #Databricks notebook source.
        const originalCode = data.split(/\r?\n/).slice(1);

        const bootstrapPath = this.extensionContext.asAbsolutePath(
            path.join("resources", "python", "notebook.workflow-wrapper.py")
        );
        const bootstrapCode = (
            await readBootstrap(bootstrapPath, remoteFilePath, dbProjectRoot)
        ).split(/\r?\n/);
        const wrappedCode = ["# Databricks notebook source"]
            .concat(bootstrapCode)
            .concat(["# COMMAND ----------"])
            .concat(originalCode);

        return this.createFile(
            getWrapperPath(remoteFilePath, [
                "databricks",
                "notebook",
                "workflow-wrapper",
            ]),
            wrappedCode.join("\n"),
            ctx
        );
    }

    @logging.withLogContext(Loggers.Extension)
    async createNotebookWrapper(
        localFilePath: LocalUri,
        remoteFilePath: RemoteUri,
        dbProjectRoot: RemoteUri,
        notebookType: FileUtils.NotebookType,
        @context ctx?: Context
    ) {
        switch (notebookType) {
            case "PY_DBNB":
                return this.createDbnbWrapper(
                    localFilePath,
                    remoteFilePath,
                    dbProjectRoot,
                    ctx
                );
            case "IPYNB":
                return this.createIpynbWrapper(
                    localFilePath,
                    remoteFilePath,
                    dbProjectRoot,
                    ctx
                );
        }
    }

    @logging.withLogContext(Loggers.Extension)
    async createPythonFileWrapper(
        remoteFilePath: RemoteUri,
        @context ctx?: Context
    ) {
        const bootstrapPath = this.extensionContext.asAbsolutePath(
            posix.join("resources", "python", "file.workflow-wrapper.py")
        );
        const bootstrap = await readFile(bootstrapPath, "utf-8");
        return this.createFile(
            getWrapperPath(remoteFilePath, [
                "databricks",
                "file",
                "workflow-wrapper",
            ]),
            bootstrap,
            ctx
        );
    }
}
