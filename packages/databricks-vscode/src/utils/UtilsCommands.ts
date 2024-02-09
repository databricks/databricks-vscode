import {Disposable, window} from "vscode";
import {openExternal} from "./urlUtils";

export class UtilsCommands implements Disposable {
    private disposables: Disposable[] = [];

    openExternalCommand() {
        return async (value: any | undefined) => {
            let url: string | undefined;

            if (value?.url instanceof Promise) {
                url = await value.url;
            } else if (value?.url !== undefined) {
                url = value.url;
            }

            if (url === undefined) {
                window.showErrorMessage(
                    "Databricks: Can't open external link. No URL found."
                );
                return;
            }
            await openExternal(url);
        };
    }

    dispose() {
        this.disposables.forEach((d) => d.dispose());
    }
}
