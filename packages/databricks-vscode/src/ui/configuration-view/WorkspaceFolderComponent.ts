import {BaseComponent} from "./BaseComponent";
import {ConfigurationTreeItem} from "./types";
import {ThemeIcon, workspace} from "vscode";
import {WorkspaceFolderManager} from "../../vscode-objs/WorkspaceFolderManager";

export class WorkspaceFolderComponent extends BaseComponent {
    constructor(
        private readonly workspaceFolderManager: WorkspaceFolderManager
    ) {
        super();
        this.disposables.push(
            this.workspaceFolderManager.onDidChangeActiveProjectFolder(() => {
                this.onDidChangeEmitter.fire();
            })
        );
    }

    private async getRoot(): Promise<ConfigurationTreeItem[]> {
        const activeWorkspaceFolder =
            this.workspaceFolderManager.activeProjectUri;

        if (activeWorkspaceFolder === undefined) {
            return [];
        }

        return [
            {
                label: "Local Folder",
                iconPath: new ThemeIcon("folder"),
                description: workspace.asRelativePath(activeWorkspaceFolder),
                contextValue: "databricks.configuration.activeProjectFolder",
                command: {
                    title: "Select Active Project Folder",
                    command: "databricks.bundle.selectActiveProjectFolder",
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
