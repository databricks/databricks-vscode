import { Uri, window, workspace } from "vscode";
import type { ProjectService } from "../../kernel/project";
import { UserFacingError } from "../../platform/errors";

export const RESET_VARIABLES = "databricks.bundle.variable.reset";

/**
 * "Override bundle variables": opens the target's `vscode.bundlevars.json`
 * in an editor, creating it with `{}` when it doesn't exist. Unlike the old
 * command, an existing file isn't rewritten first.
 */
export async function openVariablesFile(project: ProjectService): Promise<void> {
    if (project.target.value === undefined) {
        throw new UserFacingError(
            "NO_TARGET",
            "Unable to open bundle variable file. No target selected.",
        );
    }
    const file = await project.ensureVariablesFile();
    await window.showTextDocument(await workspace.openTextDocument(Uri.file(file)));
}

/**
 * "Reset bundle variables to default values": deletes the file. The view
 * shows the bundle's values as soon as validate has run without the
 * overrides; it doesn't wait for the file watcher. A validate that then
 * fails, for example because a required variable lost its only value, goes to
 * the bundle log and isn't this command's error.
 */
export async function resetVariables(project: ProjectService): Promise<void> {
    if (project.target.value === undefined) {
        return;
    }
    try {
        await project.resetVariables();
    } catch (e) {
        throw new UserFacingError(
            "RESET_VARIABLES_FAILED",
            `Error deleting bundle variable file. ${e instanceof Error ? e.message : String(e)}`,
            { cause: e },
        );
    }
}
