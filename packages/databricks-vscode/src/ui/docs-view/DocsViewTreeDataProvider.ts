import {
    Disposable,
    ThemeIcon,
    TreeDataProvider,
    TreeItem,
    TreeItemCollapsibleState,
    Uri,
} from "vscode";
import {logging} from "@databricks/databricks-sdk";
import {Loggers} from "../../logger";

export interface DocsTreeItem extends TreeItem {
    id?: string;
}

export class DocsViewTreeDataProvider
    implements TreeDataProvider<DocsTreeItem>, Disposable
{
    constructor() {}

    dispose() {}

    getTreeItem(element: DocsTreeItem): TreeItem | Thenable<TreeItem> {
        return element;
    }

    async getChildren(
        parent?: DocsTreeItem | undefined
    ): Promise<Array<DocsTreeItem>> {
        try {
            return await this.getDocsChildren(parent);
        } catch (e) {
            logging.NamedLogger.getOrCreate(Loggers.Extension).error(
                `Error getting children for docs view`,
                e
            );
            return [];
        }
    }

    private async getDocsChildren(
        parent?: DocsTreeItem | undefined
    ): Promise<DocsTreeItem[]> {
        if (parent !== undefined) {
            return [];
        }

        const quickStartItem = new TreeItem(
            "Quick Start Guide",
            TreeItemCollapsibleState.None
        );
        quickStartItem.iconPath = new ThemeIcon("preview");
        quickStartItem.command = {
            command: "databricks.quickstart.open",
            title: "Show Quick Start Guide",
        };

        const items: DocsTreeItem[] = [quickStartItem];

        const baseUrl = "https://docs.databricks.com/";
        const docLinks = [
            {
                label: "Setup authentication",
                path: "dev-tools/vscode-ext/authentication",
            },
            {
                label: "Configure your project",
                path: "dev-tools/vscode-ext/configure",
            },
            {
                label: "Work with Databricks Asset Bundles",
                path: "dev-tools/vscode-ext/bundles",
            },
            {
                label: "Run files on a cluster",
                path: "dev-tools/vscode-ext/run",
            },
            {
                label: "Run files with Databricks Connect",
                path: "dev-tools/vscode-ext/databricks-connect",
            },
            {
                label: "Run notebooks cell by cell",
                path: "dev-tools/vscode-ext/notebooks",
            },
            {
                label: "Run tests on a cluster",
                path: "dev-tools/vscode-ext/pytest",
            },
            {
                label: "Explore extension settings",
                path: "dev-tools/vscode-ext/settings",
            },
            {
                label: "Troubleshoot problems",
                path: "dev-tools/vscode-ext/troubleshooting",
            },
        ];
        for (const doc of docLinks) {
            const item = new TreeItem(doc.label, TreeItemCollapsibleState.None);
            item.iconPath = new ThemeIcon("link");
            item.command = {
                command: "vscode.open",
                title: "Open URL",
                arguments: [Uri.parse(`${baseUrl}${doc.path}`)],
            };
            items.push(item);
        }
        return items;
    }
}
