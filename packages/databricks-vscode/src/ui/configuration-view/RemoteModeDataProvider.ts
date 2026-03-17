import {TreeDataProvider, TreeItem, TreeItemCollapsibleState} from "vscode";

export class RemoteModeDataProvider implements TreeDataProvider<TreeItem> {
    private readonly items: TreeItem[];

    constructor(venvPath: string | undefined) {
        const venvItem = new TreeItem(
            "$(check) Python environment activated",
            TreeItemCollapsibleState.None
        );
        venvItem.description = venvPath ?? "not found";

        this.items = [
            new TreeItem(
                "$(remote-explorer) Databricks Remote SSH Mode",
                TreeItemCollapsibleState.None
            ),
            venvItem,
            new TreeItem(
                "$(info) More features coming soon...",
                TreeItemCollapsibleState.None
            ),
        ];
    }

    getTreeItem(element: TreeItem): TreeItem {
        return element;
    }

    getChildren(element?: TreeItem): TreeItem[] {
        if (element !== undefined) {
            return [];
        }
        return this.items;
    }
}
