import {TreeItem} from "vscode";
import {DatabricksConfigSource} from "../types";

export interface ConfigurationTreeItem extends TreeItem {
    source?: DatabricksConfigSource;
    url?: string;
}
