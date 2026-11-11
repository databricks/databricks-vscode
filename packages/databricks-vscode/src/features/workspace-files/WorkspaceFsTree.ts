import { MarkdownString, ThemeColor, ThemeIcon, TreeItem, TreeItemCollapsibleState } from "vscode";
import type { Logger } from "../../platform/log";
import { NodeTreeDataProvider, type TreeNode } from "../../platform/ui/tree";
import { basename, isDirectory, type EntryType, type WorkspaceEntry } from "./entries";
import type { WorkspaceFilesModel } from "./WorkspaceFilesModel";
import { wsfsUri } from "./WorkspaceFsProvider";

/** "Workspace file system" (old ID). */
export const WORKSPACE_FS_VIEW = "workspaceFsView";
export const OPEN_IN_BROWSER = "databricks.wsfs.openInBrowser";

const LOOKS: Record<EntryType, { icon: string; color: string; contextValue: string }> = {
    DIRECTORY: { icon: "file-directory", color: "charts.green", contextValue: "wsfs.directory" },
    REPO: { icon: "repo", color: "charts.green", contextValue: "wsfs.repo" },
    FILE: { icon: "file", color: "charts.blue", contextValue: "wsfs.file" },
    NOTEBOOK: { icon: "notebook", color: "charts.orange", contextValue: "wsfs.notebook" },
};

/**
 * One workspace object. Files open in an editor through `databricks-wsfs:`;
 * notebooks open in the browser; directories and repos expand. The row's
 * actions receive the node.
 */
export class WorkspaceFsNode implements TreeNode {
    constructor(
        readonly entry: WorkspaceEntry,
        private readonly model: WorkspaceFilesModel,
    ) {}

    getTreeItem(): TreeItem {
        const { entry } = this;
        const name = basename(entry.path);
        const look = LOOKS[entry.type];
        const item = new TreeItem(
            name,
            isDirectory(entry) ? TreeItemCollapsibleState.Collapsed : TreeItemCollapsibleState.None,
        );
        // A stable ID keeps the row, and its expansion, across refreshes.
        item.id = entry.path;
        item.tooltip = new MarkdownString(
            `**${name}**\n\nPath: \`${entry.path}\`\n\nType: ${entry.type}`,
        );
        item.iconPath = new ThemeIcon(look.icon, new ThemeColor(look.color));
        item.contextValue = look.contextValue;
        if (entry.type === "FILE") {
            item.command = {
                command: "vscode.open",
                title: "Open File",
                arguments: [wsfsUri(entry.path)],
            };
        } else if (entry.type === "NOTEBOOK") {
            item.command = {
                command: OPEN_IN_BROWSER,
                title: "Open in Browser",
                arguments: [this],
            };
        }
        return item;
    }

    async getChildren(): Promise<WorkspaceFsNode[]> {
        if (!isDirectory(this.entry)) {
            return [];
        }
        return ((await this.model.list(this.entry.path)) ?? []).map(
            (e) => new WorkspaceFsNode(e, this.model),
        );
    }
}

/**
 * WORKSPACE FILE SYSTEM (WSFS-01): the children of `/Users/<me>`, while
 * connected. Signed out it has no rows, and the view's welcome content says
 * so. It refreshes when the model changes and when the connection does.
 */
export class WorkspaceFsTreeDataProvider extends NodeTreeDataProvider<WorkspaceFsNode> {
    constructor(model: () => WorkspaceFilesModel | undefined, log: Logger) {
        super(async () => {
            const m = model();
            if (m === undefined) {
                return [];
            }
            return ((await m.list(m.root)) ?? []).map((e) => new WorkspaceFsNode(e, m));
        }, log);
    }
}

/** The entry of a row a command was run on, if any. */
export function entryOf(arg: unknown): WorkspaceEntry | undefined {
    return arg instanceof WorkspaceFsNode ? arg.entry : undefined;
}
