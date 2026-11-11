import { commands, window } from "vscode";
import { CliError } from "../../kernel/cli/Cli";
import { MissingVariableError } from "../../kernel/cli/commands/bundle";
import type { Kernel } from "../../kernel/feature";
import { OPEN_VARIABLES_FILE, PROJECT_VIEW } from "../../kernel/project/commands";
import { UserFacingError } from "../../platform/errors";
import type { PipelineDatasets } from "./run/pipelineDatasets";

export const REFRESH_REMOTE_STATE = "databricks.bundle.refreshRemoteState";
export const SHOW_LOGS = "databricks.bundle.showLogs";

/**
 * Validates again and pulls the remote state, with the old error wording.
 * Pipeline datasets are loaded once per session, so a refresh loads them again.
 */
export async function refreshRemoteState(
    kernel: Kernel,
    datasets: Pick<PipelineDatasets, "clear">,
): Promise<void> {
    datasets.clear();
    try {
        await window.withProgress({ location: { viewId: PROJECT_VIEW } }, () =>
            kernel.bundle.refreshRemoteState({ forcePull: true }),
        );
    } catch (e) {
        throw bundleCommandError("Error refreshing remote state.", e);
    } finally {
        // Datasets loaded while the pull ran may predate its result.
        datasets.clear();
    }
}

/**
 * The old `ProcessError.showErrorMessage`: the CLI's output is in the bundle
 * log, so the notification points there. A missing variable says so, and
 * its "Assign Values" action shows the log and the Variables group, and opens
 * the variables file, as before.
 */
export function bundleCommandError(prefix: string, error: unknown): unknown {
    const showLogs = { title: "Show Logs", run: () => commands.executeCommand(SHOW_LOGS) };
    if (error instanceof MissingVariableError) {
        const assignValues = {
            title: "Assign Values",
            run: async () => {
                await commands.executeCommand(SHOW_LOGS);
                await commands.executeCommand(`${PROJECT_VIEW}.focus`);
                await commands.executeCommand(OPEN_VARIABLES_FILE);
            },
        };
        return new UserFacingError(
            "MISSING_VARIABLE",
            `${prefix} No value assigned to required variables.`,
            {
                actions: [assignValues],
                cause: error,
            },
        );
    }
    if (error instanceof CliError) {
        return new UserFacingError(
            "CLI_FAILED",
            `${prefix} Error executing Databricks CLI command.`,
            {
                actions: [showLogs],
                cause: error,
            },
        );
    }
    return error;
}
