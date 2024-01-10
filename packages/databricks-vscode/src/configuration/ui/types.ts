import {TreeItem} from "vscode";
import {ConfigSource} from "../models/ConfigModel";

export interface ConfigurationTreeItem extends TreeItem {
    source?: ConfigSource;
    url?: string;
}
