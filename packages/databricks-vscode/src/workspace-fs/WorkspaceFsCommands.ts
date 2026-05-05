import {ApiError, logging} from "@databricks/sdk-experimental";
import {
    WorkspaceFsDir,
    WorkspaceFsEntity,
    WorkspaceFsUtils,
} from "../sdk-extensions";
import {context, Context} from "@databricks/sdk-experimental/dist/context";
import {Disposable, Uri, env, window, workspace} from "vscode";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {Loggers} from "../logger";
import {createDirWizard} from "./createDirectoryWizard";
import {WorkspaceFsDataProvider} from "./WorkspaceFsDataProvider";
import {WorkspaceFolderManager} from "../vscode-objs/WorkspaceFolderManager";
import {WorkspaceFsFileSystemProvider} from "./WorkspaceFsFileSystemProvider";
import {WorkspaceFsFile} from "../sdk-extensions/wsfs/WorkspaceFsFile";

const withLogContext = logging.withLogContext;

export class WorkspaceFsCommands implements Disposable {
    private disposables: Disposable[] = [];

    constructor(
        private workspaceFolderManager: WorkspaceFolderManager,
        private connectionManager: ConnectionManager,
        private workspaceFsDataProvider: WorkspaceFsDataProvider,
        private fsp?: WorkspaceFsFileSystemProvider
    ) {}

    @withLogContext(Loggers.Extension)
    async getValidRoot(
        rootPath?: string,
        @context ctx?: Context
    ): Promise<WorkspaceFsDir | undefined> {
        if (!this.connectionManager.workspaceClient) {
            window.showErrorMessage(
                `Please login first to create a new directory`
            );
            return;
        }

        if (!rootPath) {
            ctx?.logger?.error(
                "No root path when trying to create a directory"
            );
            window.showErrorMessage("Error when creating a new directory");
            return;
        }

        const root = await WorkspaceFsEntity.fromPath(
            this.connectionManager.workspaceClient,
            rootPath
        );

        if (root === undefined) {
            ctx?.logger?.error(`Can't fetch details for ${rootPath}. `);
            window.showErrorMessage(`Can't fetch details for ${rootPath}. `);
            return;
        }

        if (!WorkspaceFsUtils.isDirectory(root)) {
            ctx?.logger?.error(
                `Cannot create a directory as a child of a ${root?.type}`
            );
            window.showErrorMessage(
                `Cannot create a directory as a child of a ${root?.type}`
            );
            return;
        }

        return root;
    }

    @withLogContext(Loggers.Extension)
    async createFolder(element?: WorkspaceFsEntity, @context ctx?: Context) {
        const rootPath =
            element?.path ??
            this.connectionManager.databricksWorkspace?.currentFsRoot.path;

        const root = await this.getValidRoot(rootPath, ctx);

        const inputPath = await createDirWizard(
            this.workspaceFolderManager.activeProjectUri,
            "Directory Name",
            root
        );
        let created: WorkspaceFsEntity | undefined;

        if (inputPath !== undefined) {
            try {
                if (root) {
                    created = await root.mkdir(inputPath);
                }
            } catch (e: unknown) {
                if (e instanceof ApiError) {
                    window.showErrorMessage(
                        `Can't create directory ${inputPath}: ${e.message}`
                    );
                    return;
                }
            }
        }

        if (created === undefined) {
            window.showErrorMessage(`Can't create directory ${inputPath}`);
            return;
        }

        this.workspaceFsDataProvider.refresh();
        return created;
    }

    private async createRepo(repoPath: string) {
        const wsClient = this.connectionManager.workspaceClient;
        if (!wsClient) {
            window.showErrorMessage(`Please login first to create a new repo`);
            return;
        }

        await wsClient.repos.create({
            path: repoPath,
            provider: "github",
            url: "https://github.com/databricks/databricks-empty-ide-project",
        });

        return await WorkspaceFsEntity.fromPath(wsClient, repoPath);
    }

    async openInBrowser(element: WorkspaceFsEntity) {
        const url = await element.url;
        await env.openExternal(Uri.parse(url));
    }

    async copyPath(element: WorkspaceFsEntity) {
        await env.clipboard.writeText(element.path);
    }

    async deleteItem(element: WorkspaceFsEntity) {
        const isDir =
            element.type === "DIRECTORY" || element.type === "REPO";
        const label = element.basename;

        const answer = await window.showWarningMessage(
            `Delete "${label}"?`,
            {
                modal: true,
                detail: isDir
                    ? `This will permanently delete the folder "${label}" and all its contents.`
                    : `This will permanently delete the file "${label}".`,
            },
            "Delete"
        );

        if (answer !== "Delete") {
            return;
        }

        try {
            await element.delete(isDir);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            window.showErrorMessage(`Failed to delete "${label}": ${msg}`);
            return;
        }

        this.workspaceFsDataProvider.refresh();
        const uri = Uri.from({scheme: "wsfs", path: element.path});
        this.fsp?.notifyDeleted(uri);
    }

    async uploadFile(element?: WorkspaceFsEntity) {
        const client = this.connectionManager.workspaceClient;
        if (!client) {
            window.showErrorMessage("Please login first to upload a file");
            return;
        }

        const rootPath =
            (element?.type === "DIRECTORY" || element?.type === "REPO"
                ? element?.path
                : undefined) ??
            this.connectionManager.databricksWorkspace?.currentFsRoot.path;

        const root = await this.getValidRoot(rootPath);
        if (!root) {
            return;
        }

        const picked = await window.showOpenDialog({
            canSelectMany: false,
            openLabel: "Upload",
        });
        if (!picked || picked.length === 0) {
            return;
        }

        const srcUri = picked[0];
        const fileName = srcUri.path.split("/").pop() ?? "file";
        const contentBytes = await workspace.fs.readFile(srcUri);
        const contentStr = Buffer.from(contentBytes).toString();

        try {
            await root.createFile(fileName, contentStr, true);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            window.showErrorMessage(`Failed to upload "${fileName}": ${msg}`);
            return;
        }

        this.workspaceFsDataProvider.refresh();
        const uri = Uri.from({
            scheme: "wsfs",
            path: `${root.path}/${fileName}`,
        });
        this.fsp?.notifyCreated(uri);
    }

    async downloadFile(element: WorkspaceFsEntity) {
        if (!(element instanceof WorkspaceFsFile)) {
            window.showErrorMessage("Can only download files and notebooks");
            return;
        }

        const destUri = await window.showSaveDialog({
            defaultUri: Uri.file(element.basename),
            saveLabel: "Download",
        });
        if (!destUri) {
            return;
        }

        let content: Uint8Array;
        try {
            content = await element.readContent();
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            window.showErrorMessage(
                `Failed to download "${element.basename}": ${msg}`
            );
            return;
        }

        await workspace.fs.writeFile(destUri, content);
    }

    async refresh() {
        this.workspaceFsDataProvider.refresh();
    }

    dispose() {
        this.disposables.forEach((i) => i.dispose());
    }
}
