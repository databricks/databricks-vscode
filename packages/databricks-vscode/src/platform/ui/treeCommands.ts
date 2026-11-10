import {
    env,
    Selection,
    TextEditorRevealType,
    Uri,
    window,
    workspace,
    type Location,
    type TreeItem,
} from "vscode";
import { UserFacingError } from "../errors";

/*
 * The actions every tree's rows share: open a row's link, copy its text, and
 * go to where it is declared. Ported from the old `UtilsCommands.ts`; the
 * `databricks.call` trampoline isn't (nothing uses it). One feature
 * registers them, so the menus of every view can name them.
 */

export const OPEN_EXTERNAL = "databricks.utils.openExternal";
export const COPY = "databricks.utils.copy";
export const GO_TO_DEFINITION = "databricks.utils.goToDefinition";

/** What a row offers to the shared actions. Every field may be absent. */
export interface TreeCommandTarget {
    url?: string | Promise<string | undefined>;
    /** Recorded as `openResourceExternally`'s `type`. */
    type?: string;
    copyText?: string | Promise<string | undefined>;
    sourceLocation?: Location;
    getTreeItem?(): TreeItem | Thenable<TreeItem>;
    label?: TreeItem["label"];
    description?: TreeItem["description"];
}

function addHttpsIfNoProtocol(url: string) {
    return url.startsWith("http") ? url : `https://${url}`;
}

/** Opens the row's `url` in the browser. `onOpen` gets the row's `type`, for telemetry. */
export async function openExternal(
    value: TreeCommandTarget | undefined,
    onOpen: (type: string) => void,
): Promise<void> {
    const url = await value?.url;
    if (url === undefined) {
        throw new UserFacingError("NO_URL", "Databricks: Can't open external link. No URL found.");
    }
    if (value?.type !== undefined) {
        onOpen(value.type);
    }
    await env.openExternal(Uri.parse(addHttpsIfNoProtocol(url), true));
}

/** Copies the row's `copyText`, else its tree item's description, else its label. */
export async function copyToClipboard(value: TreeCommandTarget | undefined): Promise<void> {
    let text = await value?.copyText;
    if (text === undefined && value !== undefined) {
        const item = value.getTreeItem !== undefined ? await value.getTreeItem() : value;
        const label = typeof item.label === "string" ? item.label : item.label?.label;
        text =
            typeof item.description === "string" && item.description !== ""
                ? item.description
                : label;
    }
    if (text === undefined) {
        throw new UserFacingError("NO_TEXT", "Databricks: Can't copy to clipboard. No text found.");
    }
    void window.showInformationMessage("Copied to clipboard");
    await env.clipboard.writeText(text);
}

/** Opens the file where the row is declared, at its line. */
export async function goToDefinition(value: TreeCommandTarget | undefined): Promise<void> {
    const location = value?.sourceLocation;
    if (location === undefined) {
        throw new UserFacingError(
            "NO_SOURCE_LOCATION",
            "Databricks: Can't open source location. No URL found.",
        );
    }
    const doc = await workspace.openTextDocument(location.uri);
    const editor = await window.showTextDocument(doc);
    editor.selection = new Selection(location.range.start, location.range.end);
    editor.revealRange(location.range, TextEditorRevealType.InCenter);
}
