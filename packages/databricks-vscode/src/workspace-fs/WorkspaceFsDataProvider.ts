import {WorkspaceFsEntity} from "../sdk-extensions";
import {posix} from "path";
import {
    Disposable,
    EventEmitter,
    TreeDataProvider,
    TreeItem,
    ThemeIcon,
    TreeItemCollapsibleState,
    ThemeColor,
    Uri,
} from "vscode";
import {ConnectionManager} from "../configuration/ConnectionManager";

export interface IFsTreeItem extends TreeItem {
    path: Uri;
    url: Promise<string>;
}

export class WorkspaceFsDataProvider
    implements TreeDataProvider<WorkspaceFsEntity>, Disposable
{
    private _onDidChangeTreeData = new EventEmitter<
        WorkspaceFsEntity | undefined | void
    >();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    private disposables: Disposable[] = [];

    constructor(private readonly _connectionManager: ConnectionManager) {
        this.disposables.push(
            this._connectionManager.onDidChangeState(() => {
                this._onDidChangeTreeData.fire(undefined);
            })
        );
    }

    getTreeItem(
        element: WorkspaceFsEntity
    ): IFsTreeItem | Thenable<IFsTreeItem> {
        let treeItem: IFsTreeItem = {
            label: posix.basename(element.path),
            path: Uri.from({scheme: "wsfs", path: element.path}),
            url: element.url,
        };
        switch (element.type) {
            case "DIRECTORY":
                treeItem = {
                    ...treeItem,
                    iconPath: new ThemeIcon(
                        "file-directory",
                        new ThemeColor("charts.green")
                    ),
                    contextValue: "wsfs.directory",
                    collapsibleState: TreeItemCollapsibleState.Collapsed,
                };
                break;
            case "REPO":
                treeItem = {
                    ...treeItem,
                    iconPath: new ThemeIcon(
                        "repo",
                        new ThemeColor("charts.green")
                    ),
                    contextValue: "wsfs.repo",
                    collapsibleState: TreeItemCollapsibleState.Collapsed,
                };
                break;
            case "FILE":
                treeItem = {
                    ...treeItem,
                    iconPath: new ThemeIcon(
                        "file",
                        new ThemeColor("charts.blue")
                    ),
                };
                break;
            case "NOTEBOOK":
                treeItem = {
                    ...treeItem,
                    iconPath: new ThemeIcon(
                        "notebook",
                        new ThemeColor("charts.orange")
                    ),
                };
                break;
        }
        return treeItem;
    }

    getChildren(
        element?: WorkspaceFsEntity | undefined
    ): Thenable<WorkspaceFsEntity[] | undefined> {
        const apiClient = this._connectionManager.workspaceClient;
        const rootDirPath =
            this._connectionManager.databricksWorkspace?.currentFsRoot;
        if (!apiClient || !rootDirPath) {
            return Promise.resolve(undefined);
        }

        if (element === undefined) {
            return (async () => {
                return this.sort(
                    (await (
                        await WorkspaceFsEntity.fromPath(
                            apiClient,
                            rootDirPath.path
                        )
                    )?.children) ?? []
                );
            })();
        }
        return (async () => {
            return this.sort(await element.children);
        })();
    }

    getParent(
        element: WorkspaceFsEntity
    ): Thenable<WorkspaceFsEntity | undefined> {
        if (element.path === "/") {
            return Promise.resolve(undefined);
        }
        return element.parent;
    }

    sort(elements: WorkspaceFsEntity[]) {
        const priorityPaths = [
            "/Users",
            "/Shared",
            "/Repos",
            `/Users/${this._connectionManager.databricksWorkspace?.userName}`,
            `/Repos/${this._connectionManager.databricksWorkspace?.userName}`,
        ];
        priorityPaths.reverse();

        return elements.sort((a, b) => {
            if (
                priorityPaths.includes(a.path) ||
                priorityPaths.includes(b.path)
            ) {
                return (
                    priorityPaths.indexOf(b.path) -
                    priorityPaths.indexOf(a.path)
                );
            }

            if (a.type === "DIRECTORY") {
                return -1;
            }
            if (b.type === "DIRECTORY") {
                return +1;
            }

            return a.path.localeCompare(b.path);
        });
    }

    refresh() {
        this._onDidChangeTreeData.fire();
    }

    dispose() {
        this.disposables.forEach((i) => i.dispose());
    }
}
