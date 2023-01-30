import {Cluster} from "@databricks/databricks-sdk";
import {Disposable} from "vscode";
import {ConfigurationTreeItem} from "../configuration/ConfigurationDataProvider";
import {openExternal} from "./urlUtils";

export class UtilsCommands implements Disposable {
    private disposables: Disposable[] = [];

    openExternalCommand() {
        return async (value: ConfigurationTreeItem | Cluster) => {
            let url: string | undefined;

            if (value instanceof Cluster) {
                url = await value.url;
            } else {
                url = value.url;
            }

            if (!url) {
                return;
            }
            await openExternal(url);
        };
    }

    dispose() {
        this.disposables.forEach((d) => d.dispose());
    }
}
