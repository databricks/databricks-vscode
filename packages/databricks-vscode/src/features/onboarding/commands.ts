import { commands, Uri } from "vscode";

export const OPEN_QUICKSTART = "databricks.quickstart.open";

/** The walkthrough's category id: the extension id, then the walkthrough's id in package.json. */
export const QUICKSTART_WALKTHROUGH = "databricks.databricks#quickstart";

export async function openQuickstart() {
    await commands.executeCommand(
        "workbench.action.openWalkthrough",
        QUICKSTART_WALKTHROUGH,
        false,
    );
}

export async function showMarkdownPreview(absolutePath: string) {
    await commands.executeCommand("markdown.showPreview", Uri.file(absolutePath));
}
