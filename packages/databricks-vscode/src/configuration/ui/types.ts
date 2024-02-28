import {TreeItem} from "vscode";

export interface ConfigurationTreeItem extends TreeItem {
    url?: string;
    copyText?: string;
}
