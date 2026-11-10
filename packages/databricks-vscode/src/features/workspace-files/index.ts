import { window, workspace } from "vscode";
import type { Connection } from "../../kernel/connection";
import type { Feature } from "../../kernel/feature";
import { UserFacingError } from "../../platform/errors";
import {
    WSFS_COPY_PATH,
    WSFS_CREATE_FILE,
    WSFS_CREATE_FILE_TOOLBAR,
    WSFS_CREATE_FOLDER,
    WSFS_CREATE_FOLDER_TOOLBAR,
    WSFS_DELETE,
    WSFS_DOWNLOAD,
    WSFS_REFRESH,
    WSFS_UPLOAD,
    WSFS_UPLOAD_TOOLBAR,
    WorkspaceFsCommands,
} from "./WorkspaceFsCommands";
import { WorkspaceFilesModel } from "./WorkspaceFilesModel";
import { WorkspaceFsProvider, WSFS_SCHEME } from "./WorkspaceFsProvider";
import { OPEN_IN_BROWSER, WORKSPACE_FS_VIEW, WorkspaceFsTreeDataProvider } from "./WorkspaceFsTree";

/**
 * Workspace files (WSFS-01 to WSFS-04): the WORKSPACE FILE SYSTEM view,
 * rooted at `/Users/<me>`, the `databricks-wsfs:` file system, and the
 * commands to create, upload, download, delete, open and copy. Connection
 * scope: it works without a folder, and follows the project's workspace
 * while one is open. The tree refreshes only when asked, or after
 * its own changes, as before.
 */
export const workspaceFiles: Feature = {
    id: "workspace-files",
    // The `databricks-wsfs:` file system stays registered: links to it still open.
    session: Object.fromEntries(
        [
            WORKSPACE_FS_VIEW,
            WSFS_REFRESH,
            WSFS_CREATE_FOLDER,
            WSFS_CREATE_FOLDER_TOOLBAR,
            WSFS_CREATE_FILE,
            WSFS_CREATE_FILE_TOOLBAR,
            WSFS_UPLOAD,
            WSFS_UPLOAD_TOOLBAR,
            WSFS_DOWNLOAD,
            WSFS_DELETE,
            OPEN_IN_BROWSER,
            WSFS_COPY_PATH,
        ].map((id) => [
            id,
            {
                unavailable:
                    "This session mounts the workspace at /Workspace, and the Explorer shows its files.",
                instead: "Work with the files under /Workspace in the Explorer.",
            },
        ]),
    ),

    register(ctx) {
        let model: WorkspaceFilesModel | undefined;
        const provider = new WorkspaceFsProvider(() => model);
        const tree = new WorkspaceFsTreeDataProvider(() => model, ctx.log);
        const treeView = window.createTreeView(WORKSPACE_FS_VIEW, { treeDataProvider: tree });
        ctx.subscriptions.push(
            workspace.registerFileSystemProvider(WSFS_SCHEME, provider, { isCaseSensitive: true }),
            provider,
            tree,
            treeView,
        );

        ctx.whileConnected((connection) => {
            const m = new WorkspaceFilesModel(connection);
            model = m;
            const subscription = m.onDidChange((change) => {
                provider.modelChanged(change);
                tree.refresh();
            });
            tree.refresh();
            return {
                dispose: () => {
                    subscription.dispose();
                    m.dispose();
                    if (model === m) {
                        model = undefined;
                    }
                    tree.refresh();
                },
            };
        });

        const commands = (connection: Connection) => {
            const m = model;
            if (m === undefined || m.connection.api !== connection.api) {
                throw new UserFacingError("NOT_CONNECTED", "Sign in to Databricks first.");
            }
            return new WorkspaceFsCommands({
                model: m,
                treeView,
                projectRoot: ctx.kernel.project.active.value?.root,
                log: ctx.log,
            });
        };
        const on = (id: string, run: (c: WorkspaceFsCommands, node: unknown) => unknown) =>
            ctx.commands.register(
                id,
                (connection, node?: unknown) => run(commands(connection), node),
                { scope: "connection" },
            );

        // Signed out there is nothing to refresh, and no error to show.
        ctx.commands.register(WSFS_REFRESH, () => model?.refresh());
        on(WSFS_CREATE_FOLDER, (c, node) => c.createFolder(node));
        on(WSFS_CREATE_FOLDER_TOOLBAR, (c, node) => c.createFolderFromToolbar(node));
        on(WSFS_CREATE_FILE, (c, node) => c.createFile(node));
        on(WSFS_CREATE_FILE_TOOLBAR, (c, node) => c.createFileFromToolbar(node));
        on(WSFS_UPLOAD, (c, node) => c.uploadFile(node));
        on(WSFS_UPLOAD_TOOLBAR, (c, node) => c.uploadFileFromToolbar(node));
        on(WSFS_DOWNLOAD, (c, node) => c.downloadFile(node));
        on(WSFS_DELETE, (c, node) => c.deleteItem(node));
        on(OPEN_IN_BROWSER, (c, node) => c.openInBrowser(node));
        on(WSFS_COPY_PATH, (c, node) => c.copyPath(node));
    },
};
