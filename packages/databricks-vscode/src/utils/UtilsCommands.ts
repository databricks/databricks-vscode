import {Disposable, env, TreeItem, Uri, window} from "vscode";
import {openExternal} from "./urlUtils";

export class UtilsCommands implements Disposable {
    private disposables: Disposable[] = [];
    constructor() {}

    openExternalCommand() {
        return async (value: TreeItem) => {
            await openExternal(`${value.description}`);
        };
    }

    dispose() {
        this.disposables.forEach((d) => d.dispose());
    }
}
