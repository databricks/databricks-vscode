import path from "node:path";
import { env, Uri, window, workspace } from "vscode";
import type { Feature } from "../../kernel/feature";
import { LOG_FILE_NAME } from "../../platform/log";

export const OPEN_LOG_FOLDER = "databricks.logs.openFolder";

/**
 * "Open full logs": the folder with the JSON log files. Window scope. In a
 * remote window, a session window included, the folder is on the remote
 * machine, where the system's file manager can't open it, so the JSON log
 * file opens in an editor instead.
 */
export const logs: Feature = {
    id: "logs",
    session: {
        [OPEN_LOG_FOLDER]: {
            adapted: "It opens the JSON log file in an editor: the log folder is on the compute.",
        },
    },

    register(ctx) {
        ctx.commands.register(OPEN_LOG_FOLDER, async () => {
            const folder = ctx.kernel.extension.logPath;
            if (env.remoteName === undefined) {
                await env.openExternal(Uri.file(folder));
                return;
            }
            const file = await workspace.openTextDocument(
                Uri.file(path.join(folder, LOG_FILE_NAME)),
            );
            await window.showTextDocument(file);
        });
    },
};
