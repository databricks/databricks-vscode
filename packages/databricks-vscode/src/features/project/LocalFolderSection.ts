import { ThemeIcon, Uri, workspace } from "vscode";
import type { Project } from "../../kernel/project/ProjectService";
import {
    SECTION_ORDER,
    type ConfigurationItem,
    type ConfigurationSection,
} from "../../platform/ui/sections";

export const SELECT_PROJECT = "databricks.bundle.selectActiveProjectFolder";

/**
 * The "Local Folder" row: the active project's folder. Clicking it opens the
 * project picker. Ported from the old `WorkspaceFolderComponent`.
 */
export class LocalFolderSection implements ConfigurationSection {
    readonly id = "project.localFolder";
    readonly order = SECTION_ORDER.localFolder;

    constructor(private readonly project: Project) {}

    getChildren(parent?: ConfigurationItem): ConfigurationItem[] {
        if (parent !== undefined) {
            return [];
        }
        return [
            {
                label: "Local Folder",
                iconPath: new ThemeIcon("folder"),
                description: workspace.asRelativePath(Uri.file(this.project.root)),
                contextValue: "databricks.configuration.activeProjectFolder",
                command: { title: "Select Active Project Folder", command: SELECT_PROJECT },
            },
        ];
    }
}
