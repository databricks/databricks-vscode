import {commands, ExtensionContext} from "vscode";

/**
 * Shows the Quickstart view the first time the extension is used.
 */
export async function showQuickStartOnFirstUse(context: ExtensionContext) {
    const hasShown = context.globalState.get<boolean>(
        "databricks.quickstart-shown",
        false
    );

    if (hasShown) {
        return;
    }

    await commands.executeCommand("databricks.quickstart.open");
    await context.globalState.update("databricks.quickstart-shown", true);
}
