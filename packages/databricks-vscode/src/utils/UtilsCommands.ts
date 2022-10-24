import {Disposable, env, TreeItem, Uri, window} from "vscode";

export class UtilsCommands implements Disposable {
    private disposables: Disposable[] = [];
    constructor() {}

    openExternalCommand() {
        return async (value: TreeItem) => {
            const url = `${value.description}`.startsWith("http")
                ? `${value.description}`
                : `https://${value.description}`;
            await env.openExternal(Uri.parse(url, true));
        };
    }

    dispose() {
        this.disposables.forEach((d) => d.dispose());
    }
}
