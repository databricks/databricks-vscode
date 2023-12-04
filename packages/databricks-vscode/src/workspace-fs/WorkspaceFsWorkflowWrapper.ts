import {logging} from "@databricks/databricks-sdk";
import {WorkspaceFsEntity, WorkspaceFsUtils} from "../sdk-extensions";
import {Context, context} from "@databricks/databricks-sdk/dist/context";
import {readFile} from "fs/promises";
import path from "path";
import posix from "path/posix";
import {ExtensionContext} from "vscode";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {Loggers} from "../logger";
import {LocalUri, RemoteUri} from "../sync/SyncDestination";
import {FileUtils} from "../utils";
import {workspaceConfigs} from "../vscode-objs/WorkspaceConfigs";

function getWrapperPath(
    remoteOriginalFilePath: RemoteUri,
    extraParts: string[]
) {
    return new RemoteUri(
        posix.format({
            dir: posix.dirname(remoteOriginalFilePath.path),
            name: posix
                .basename(remoteOriginalFilePath.path)
                .split(".")
                .slice(0, -1)
                .concat(extraParts)
                .join("."),
            ext: posix.extname(remoteOriginalFilePath.path),
        })
    );
}

async function readBootstrap(bootstrapPath: string) {
    return await readFile(bootstrapPath, "utf-8");
}

type Cell = {
    source: string[];
    type: "code" | "not_code";
    originalCell?: any;
};

function rearrangeCells(cells: Cell[]) {
    if (!workspaceConfigs.wsfsRearrangeCells) {
        return cells;
    }
    const begingingCells: Cell[] = [];
    const endingCells: Cell[] = [];

    for (const cell of cells) {
        if (cell.type === "not_code") {
            endingCells.push(cell);
            continue;
        }
        const newCell: Cell = {
            source: [],
            type: "code",
            originalCell: cell.originalCell,
        };
        for (const line of cell.source) {
            // Add each 0-indent line starting with %pip install or dbutils.library.restartPython(),
            // as a new cell to the beginging and remove it from the original cell
            if (
                line.startsWith("%pip install") ||
                line.startsWith("# MAGIC %pip install")
            ) {
                begingingCells.push({
                    source: [
                        "import os",
                        "os.chdir(os.path.dirname('{{DATABRICKS_SOURCE_FILE}}'))",
                        line,
                    ],
                    type: "code",
                });
                continue;
            } else if (line.startsWith("dbutils.library.restartPython()")) {
                begingingCells.push({source: [line], type: "code"});
                continue;
            }
            newCell.source.push(line);
        }
        endingCells.push(newCell);
    }

    return [...begingingCells, ...endingCells].filter(
        (cell) => cell.source.length !== 0
    );
}

export class WorkspaceFsWorkflowWrapper {
    constructor(
        private readonly connectionManager: ConnectionManager,
        private readonly extensionContext: ExtensionContext
    ) {}

    @logging.withLogContext(Loggers.Extension)
    private async createFile(
        wrapperPath: RemoteUri,
        remoteOriginalFilePath: RemoteUri,
        dbProjectRoot: RemoteUri,
        content: string,
        @context ctx?: Context
    ) {
        const dirpath = posix.dirname(wrapperPath.path);

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
        content = content
            .replace(
                /{{DATABRICKS_SOURCE_FILE}}/g,
                remoteOriginalFilePath.workspacePrefixPath
            )
            .replace(
                /{{DATABRICKS_PROJECT_ROOT}}/g,
                dbProjectRoot.workspacePrefixPath
            );
        const wrappedFile = await rootDir.createFile(
            wrapperPath.path,
            content,
            true,
            ctx
        );
        if (!WorkspaceFsUtils.isFile(wrappedFile)) {
            throw new Error(
                `Cannot create workflow wrapper for ${remoteOriginalFilePath.path}`
            );
        }
        return wrappedFile;
    }

    @logging.withLogContext(Loggers.Extension)
    private async createIpynbWrapper(
        localFilePath: LocalUri,
        remoteOriginalFilePath: RemoteUri,
        dbProjectRoot: RemoteUri,
        @context ctx?: Context
    ) {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        type JupyterCell = {source: string[]; cell_type: string};
        const data = await readFile(localFilePath.path, "utf-8");
        const originalJson: {cells: JupyterCell[] | undefined} =
            JSON.parse(data);

        const bootstrapPath = this.extensionContext.asAbsolutePath(
            path.join(
                "resources",
                "python",
                "generated",
                "notebook.workflow-wrapper.json"
            )
        );
        const bootstrapJson: JupyterCell = JSON.parse(
            await readBootstrap(bootstrapPath)
        );
        const cells = [bootstrapJson].concat(originalJson["cells"] ?? []).map(
            // Since each cell.source is a string array where each string can be
            // multiple lines, we need to split each string by \n and then flatten
            (cell) =>
                ({
                    source: cell.source?.flatMap((line) =>
                        line.trimEnd().split(/\r?\n/)
                    ),
                    type: cell.cell_type === "code" ? "code" : "not_code",
                    originalCell: cell,
                }) as Cell
        );
        originalJson["cells"] = rearrangeCells(cells).map((cell) => {
            if (cell.type === "not_code") {
                return cell.originalCell;
            }
            return {
                ...(cell.originalCell ?? bootstrapJson),
                source: [cell.source.join("\n")],
            };
        });
        return this.createFile(
            getWrapperPath(remoteOriginalFilePath, [
                "databricks",
                "notebook",
                "workflow-wrapper",
            ]),
            remoteOriginalFilePath,
            dbProjectRoot,
            JSON.stringify(originalJson),
            ctx
        );
    }

    @logging.withLogContext(Loggers.Extension)
    private async createDbnbWrapper(
        localFilePath: LocalUri,
        remoteOriginalFilePath: RemoteUri,
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
        const bootstrapCode = (await readBootstrap(bootstrapPath)).split(
            /\r?\n/
        );

        // Split original code into cells by # COMMAND ----------\n
        // and add the bootstrap code to the beginning as a new cell
        const cells = [bootstrapCode]
            .concat(
                originalCode
                    .join("\n")
                    .split(/# COMMAND ----------\r?\n/)
                    .map((cell) => cell.trimEnd().split(/\r?\n/))
            )
            .map((cell) => ({source: cell, type: "code"}) as Cell);
        const rearrangedCells = rearrangeCells(cells);
        // Add # Databricks notebook source to the beginning of the first cell
        rearrangedCells.at(0)?.source.unshift("# Databricks notebook source");

        const wrappedCode = rearrangedCells
            .map((cell) => cell.source.join("\n"))
            .join("\n# COMMAND ----------\n");

        return this.createFile(
            getWrapperPath(remoteOriginalFilePath, [
                "databricks",
                "notebook",
                "workflow-wrapper",
            ]),
            remoteOriginalFilePath,
            dbProjectRoot,
            wrappedCode,
            ctx
        );
    }

    @logging.withLogContext(Loggers.Extension)
    async createNotebookWrapper(
        localFilePath: LocalUri,
        remoteOriginalFilePath: RemoteUri,
        dbProjectRoot: RemoteUri,
        notebookType: FileUtils.NotebookType,
        @context ctx?: Context
    ) {
        switch (notebookType) {
            case "PY_DBNB":
                return this.createDbnbWrapper(
                    localFilePath,
                    remoteOriginalFilePath,
                    dbProjectRoot,
                    ctx
                );
            case "IPYNB":
                return this.createIpynbWrapper(
                    localFilePath,
                    remoteOriginalFilePath,
                    dbProjectRoot,
                    ctx
                );
        }
    }

    @logging.withLogContext(Loggers.Extension)
    async createPythonFileWrapper(
        remoteOriginalFilePath: RemoteUri,
        dbProjectRoot: RemoteUri,
        @context ctx?: Context
    ) {
        const bootstrapPath = this.extensionContext.asAbsolutePath(
            posix.join("resources", "python", "file.workflow-wrapper.py")
        );
        const bootstrap = await readFile(bootstrapPath, "utf-8");
        return this.createFile(
            getWrapperPath(remoteOriginalFilePath, [
                "databricks",
                "file",
                "workflow-wrapper",
            ]),
            remoteOriginalFilePath,
            dbProjectRoot,
            bootstrap,
            ctx
        );
    }
}
