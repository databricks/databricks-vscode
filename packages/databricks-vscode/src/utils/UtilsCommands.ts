import {
    Disposable,
    window,
    env,
    Location,
    workspace,
    Selection,
    TextEditorRevealType,
} from "vscode";
import {openExternal} from "./urlUtils";
import {Events, Telemetry} from "../telemetry";

export class UtilsCommands implements Disposable {
    private disposables: Disposable[] = [];

    constructor(private telemetry: Telemetry) {}

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
            if (value.type !== undefined) {
                this.telemetry.recordEvent(Events.OPEN_RESOURCE_EXTERNALLY, {
                    type: value.type,
                });
            }
            await openExternal(url);
        };
    }

    goToDefinition() {
        return async (value: any | undefined) => {
            const location: Location | undefined = value?.sourceLocation;
            if (location === undefined) {
                window.showErrorMessage(
                    "Databricks: Can't open source location. No URL found."
                );
                return;
            }

            const doc = await workspace.openTextDocument(location.uri);
            const editor = await window.showTextDocument(doc);
            editor.selection = new Selection(
                location.range.start,
                location.range.end
            );
            editor.revealRange(location.range, TextEditorRevealType.InCenter);
        };
    }

    copyToClipboardCommand() {
        return async (value: any | undefined) => {
            let text: string | undefined;

            if (value?.copyText instanceof Promise) {
                text = await value.copyText;
            } else if (value.copyText !== undefined) {
                text = value.copyText;
            }

            if (text === undefined && value?.getTreeItem !== undefined) {
                const treeItem = value.getTreeItem();
                if (treeItem instanceof Promise) {
                    value = await treeItem;
                } else {
                    value = treeItem;
                }
            }

            if (text === undefined) {
                text = value?.copyText ?? value?.description ?? value?.label;
            }

            if (text === undefined) {
                window.showErrorMessage(
                    "Databricks: Can't copy to clipboard. No text found."
                );
                return;
            }
            window.showInformationMessage("Copied to clipboard");
            await env.clipboard.writeText(text);
        };
    }

    dispose() {
        this.disposables.forEach((d) => d.dispose());
    }
}
