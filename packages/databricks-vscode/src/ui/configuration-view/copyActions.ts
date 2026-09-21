import {ConfigurationTreeItem} from "./types";

/**
 * Maps a value row's (stable) label to a copy "kind". The kind drives both the
 * `copy=<kind>` contextValue suffix stamped by {@link stampCopyKind} and the
 * matching titled command in package.json (e.g. "Copy Target", "Copy Path"), so
 * the context-menu entry says what it copies instead of a bare "Copy". Rows
 * whose label is absent here (section headers, action buttons, status prompts)
 * get no copy action.
 */
/* eslint-disable @typescript-eslint/naming-convention -- keys are exact TreeItem label text, not identifiers */
export const COPY_KINDS: Readonly<Record<string, string>> = {
    "Local Folder": "path",
    "Remote Folder": "path",
    "Path": "path",
    "Target": "target",
    "Host": "host",
    "Mode": "mode",
    "Auth Type": "authType",
    "Cluster": "clusterName",
    "Cluster ID": "clusterId",
    "Databricks Runtime": "runtime",
    "Creator": "creator",
    "State": "state",
    "Access Mode": "accessMode",
    "Sync State": "syncState",
    "Scope": "scope",
    "Version": "version",
};
/* eslint-enable @typescript-eslint/naming-convention */

/**
 * The command id for a copy kind, e.g. `clusterId` ->
 * `databricks.configuration.copyClusterId`. This is the single mapping from a
 * kind to its command id — package.json declares the same ids and
 * {@link COPY_COMMAND_IDS} registers them, so all three stay in lock-step.
 */
export function copyCommandId(kind: string): string {
    return `databricks.configuration.copy${
        kind.charAt(0).toUpperCase() + kind.slice(1)
    }`;
}

/**
 * All distinct copy command ids, derived from {@link COPY_KINDS} (the single
 * source of truth). extension.ts registers exactly these; a `copyActions` test
 * asserts package.json declares the same set, so adding or renaming a kind in
 * one place can't silently drift from the others.
 */
export const COPY_COMMAND_IDS: readonly string[] = [
    ...new Set(Object.values(COPY_KINDS)),
].map(copyCommandId);

/**
 * Give a value-bearing row an explicit, per-row copy action ("Copy Target",
 * "Copy Path", …) by stamping a `copy=<kind>` suffix onto its `contextValue`.
 * The row's label picks the kind (see {@link COPY_KINDS}); the matching titled
 * command copies the row's `description` (its value) via the shared copy
 * handler. Only rows with a mapped label and a non-empty textual `description`
 * are tagged — headers, buttons and status prompts get no copy action. The
 * `.copy=` guard keeps repeated calls (getTreeItem may run more than once per
 * row) idempotent.
 */
export function stampCopyKind(element: ConfigurationTreeItem): void {
    const label =
        typeof element.label === "string"
            ? element.label
            : element.label?.label;
    const kind = label ? COPY_KINDS[label] : undefined;
    if (
        kind !== undefined &&
        typeof element.description === "string" &&
        element.description.length > 0 &&
        !element.contextValue?.includes(".copy=")
    ) {
        element.contextValue = element.contextValue
            ? `${element.contextValue}.copy=${kind}`
            : `databricks.configuration.copy=${kind}`;
    }
}
