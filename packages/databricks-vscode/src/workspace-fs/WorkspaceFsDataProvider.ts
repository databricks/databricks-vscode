import {
    IWorkspaceFsEntity,
    WorkspaceFsEntity,
} from "@databricks/databricks-sdk";
import {posix} from "path";
import {
    Disposable,
    EventEmitter,
    TreeDataProvider,
    TreeItem,
    ThemeIcon,
    TreeItemCollapsibleState,
    ThemeColor,
    ProviderResult,
} from "vscode";
import {ConnectionManager} from "../configuration/ConnectionManager";

export interface IFsTreeItem extends TreeItem {
    path: string;
    url: Promise<string>;
}

export class WorkspaceFsDataProvider
    implements TreeDataProvider<IWorkspaceFsEntity>, Disposable
{
    private _onDidChangeTreeData = new EventEmitter<
        IWorkspaceFsEntity | undefined | void
    >();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    private disposables: Disposable[] = [];

    constructor(private readonly _connectionManager: ConnectionManager) {
        this.disposables.push(
            this._connectionManager.onDidChangeState((state) => {
                this._onDidChangeTreeData.fire();
            })
        );
    }

    getTreeItem(
        element: IWorkspaceFsEntity
    ): IFsTreeItem | Thenable<IFsTreeItem> {
        let treeItem: IFsTreeItem = {
            label: posix.basename(element.path),
            path: element.path,
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
                    contextValue: "workspacefs.directory",
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
                    contextValue: "workspacefs.directory",
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
        element?: IWorkspaceFsEntity | undefined
    ): Thenable<IWorkspaceFsEntity[] | undefined> {
        if (!this._connectionManager.apiClient) {
            return Promise.resolve(undefined);
        }
        const apiClient = this._connectionManager.apiClient;

        if (element === undefined) {
            return (async () => {
                return this.sort(
                    (await (
                        await WorkspaceFsEntity.fromPath(apiClient, "/")
                    )?.children) ?? []
                );
            })();
        }
        return (async () => {
            return this.sort(await element.children);
        })();
    }

    getParent(
        element: IWorkspaceFsEntity
    ): Thenable<IWorkspaceFsEntity | undefined> {
        if (element.path === "/") {
            return Promise.resolve(undefined);
        }
        return element.parent;
    }

    sort(elements: IWorkspaceFsEntity[]) {
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
