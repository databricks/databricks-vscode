import {BaseComponent} from "./BaseComponent";
import {ConfigurationTreeItem} from "./types";
import {ThemeIcon} from "vscode";
import {WorkspaceFolderManager} from "../../vscode-objs/WorkspaceFolderManager";

export class WorkspaceFolderComponent extends BaseComponent {
    constructor(
        private readonly workspaceFolderManager: WorkspaceFolderManager
    ) {
        super();
        this.disposables.push(
            this.workspaceFolderManager.onDidChangeActiveWorkspaceFolder(() => {
                this.onDidChangeEmitter.fire();
            })
        );
    }

    private async getRoot(): Promise<ConfigurationTreeItem[]> {
        const activeWorkspaceFolder =
            this.workspaceFolderManager.activeWorkspaceFolder;
        if (activeWorkspaceFolder === undefined) {
            return [];
        }

        return [
            {
                label: "Active Workspace Folder",
                iconPath: new ThemeIcon("folder"),
                description: activeWorkspaceFolder.name,
                contextValue: "databricks.configuration.activeWorkspaceFolder",
                command: {
                    title: "Select Workspace Folder",
                    command: "databricks.selectWorkspaceFolder",
                },
            },
        ];
    }
    public async getChildren(
        parent?: ConfigurationTreeItem
    ): Promise<ConfigurationTreeItem[]> {
        if (parent === undefined) {
            return this.getRoot();
        }

        return [];
    }
}
