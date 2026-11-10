import type { Workspace } from "@databricks/sdk-workspaces/v1";

/** A workspace of the account, as the list names it. */
export interface AccountWorkspace {
    readonly id: string;
    readonly name: string;
}

/**
 * The running workspaces of an account's list, by name. The SDK reads IDs as
 * `bigint`, so an ID too large for a JS number stays exact.
 */
export function runningWorkspaces(workspaces: readonly Workspace[]): AccountWorkspace[] {
    const running: AccountWorkspace[] = [];
    for (const w of workspaces) {
        if (
            w.workspaceId === undefined ||
            (w.workspaceStatus !== undefined && w.workspaceStatus !== "RUNNING")
        ) {
            continue;
        }
        const id = String(w.workspaceId);
        running.push({ id, name: w.workspaceName || id });
    }
    return running.sort((a, b) => a.name.localeCompare(b.name));
}
