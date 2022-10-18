import {Disposable, env, TreeItem, window} from "vscode";

export class UtilsCommands implements Disposable {
    private disposables: Disposable[] = [];
    constructor() {}

    copyValueCommand() {
        return async (value: TreeItem) => {
            const text = await env.clipboard.readText();
            await env.clipboard.writeText(`${value.description}`);

            window.showInformationMessage("Value copied to clipboard", {
                modal: true,
                detail: `${value.description}`,
            });
        };
    }
    dispose() {
        this.disposables.forEach((d) => d.dispose());
    }
}
