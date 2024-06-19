import {
    Disposable,
    EventEmitter,
    QuickPickItem,
    QuickPickItemKind,
    StatusBarAlignment,
    WorkspaceFolder,
    window,
    workspace,
} from "vscode";
import {CustomWhenContext} from "./CustomWhenContext";

export class WorkspaceFolderManager implements Disposable {
    private disposables: Disposable[] = [];
    private _activeWorkspaceFolder: WorkspaceFolder | undefined =
        workspace.workspaceFolders?.[0];
    private readonly didChangeActiveWorkspaceFolder = new EventEmitter<
        WorkspaceFolder | undefined
    >();
    public readonly onDidChangeActiveWorkspaceFolder =
        this.didChangeActiveWorkspaceFolder.event;

    private readonly button = window.createStatusBarItem(
        StatusBarAlignment.Left,
        999
    );

    constructor(public readonly customWhenContext: CustomWhenContext) {
        if (this.enableUi) {
            this.button.text =
                this._activeWorkspaceFolder?.name ?? "No Databricks Project";
            this.button.tooltip = "Selected databricks project";
            this.button.command = "databricks.selectWorkspaceFolder";
            this.button.show();
        }

        this.disposables.push(
            this.button,
            workspace.onDidChangeWorkspaceFolders((e) => {
                if (
                    e.removed.find(
                        (v) =>
                            v.uri.fsPath ===
                            this._activeWorkspaceFolder?.uri.fsPath
                    ) ||
                    this._activeWorkspaceFolder === undefined
                ) {
                    this.setActiveWorkspaceFolder(
                        workspace.workspaceFolders?.[0]
                    );
                    return;
                }
            }),
            window.onDidChangeActiveTextEditor((e) => {
                const isActiveFileInActiveWorkspace =
                    this.activeWorkspaceFolder !== undefined &&
                    e !== undefined &&
                    e.document.uri.fsPath.startsWith(
                        this.activeWorkspaceFolder?.uri.fsPath
                    );
                customWhenContext.setIsActiveFileInActiveWorkspace(
                    isActiveFileInActiveWorkspace
                );
            })
        );
    }

    get activeWorkspaceFolder() {
        if (this._activeWorkspaceFolder === undefined) {
            throw new Error("No active workspace folder");
        }

        return this._activeWorkspaceFolder;
    }

    setActiveWorkspaceFolder(folder?: WorkspaceFolder) {
        if (this._activeWorkspaceFolder?.uri.fsPath === folder?.uri.fsPath) {
            return;
        }

        this._activeWorkspaceFolder = folder;
        this.didChangeActiveWorkspaceFolder.fire(folder);

        if (this.enableUi) {
            this.button.text = folder?.name ?? "No Databricks Project";
            this.button.show();
        }
    }

    get folders() {
        return workspace.workspaceFolders;
    }

    async selectDatabricksWorkspaceFolderCommand() {
        const items: (QuickPickItem & {
            workspaceFolder: WorkspaceFolder;
        })[] =
            this.folders
                ?.filter((i) => i.name !== this.activeWorkspaceFolder.name)
                .map((folder) => ({
                    label: folder.name,
                    description: folder.uri.fsPath,
                    workspaceFolder: folder,
                })) ?? [];

        const firstItem = this.activeWorkspaceFolder
            ? [
                  {
                      label: "Selected Databricks Workspace Folder",
                      kind: QuickPickItemKind.Separator,
                  },
                  {
                      label: this.activeWorkspaceFolder.name,
                      description: this.activeWorkspaceFolder.uri.fsPath,
                      workspaceFolder: this.activeWorkspaceFolder,
                  },
                  {
                      label: "",
                      kind: QuickPickItemKind.Separator,
                  },
              ]
            : [];

        const choice = await window.showQuickPick([...firstItem, ...items], {
            title: "Select Databricks Workspace Folder",
        });
        if (!choice) {
            return;
        }
        this.setActiveWorkspaceFolder(choice.workspaceFolder);
    }

    get enableUi() {
        return this.folders && this.folders?.length !== 1;
    }

    dispose() {
        this.disposables.forEach((i) => i.dispose());
    }
}
