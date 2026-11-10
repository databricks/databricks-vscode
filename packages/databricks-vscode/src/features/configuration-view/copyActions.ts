import { env, window } from "vscode";
import { UserFacingError } from "../../platform/errors";
import type { ConfigurationItem } from "../../platform/ui/sections";

/**
 * Per-row copy actions in the configuration view (SHELL-07), ported from the
 * old `copyActions.ts`. A row's label picks its copy kind; the kind picks
 * both the `copy=<kind>` suffix of its `contextValue` and the titled command
 * ("Copy Target", "Copy Path", …) that the menus show for it. Rows with
 * other labels, such as headers and buttons, get no copy action.
 */
export const COPY_KINDS: Readonly<Record<string, string>> = {
    "Local Folder": "path",
    "Remote Folder": "path",
    "Path": "path",
    "Target": "target",
    "Host": "host",
    "Mode": "mode",
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

/** `clusterId` → `databricks.configuration.copyClusterId`. */
export function copyCommandId(kind: string): string {
    return `databricks.configuration.copy${kind.charAt(0).toUpperCase() + kind.slice(1)}`;
}

/** One command per distinct kind. `package.json` declares the same set; a test checks it. */
export const COPY_COMMAND_IDS: readonly string[] = [...new Set(Object.values(COPY_KINDS))].map(
    copyCommandId,
);

/**
 * Stamps `copy=<kind>` onto a row with a mapped label and a non-empty text
 * description. Idempotent, because `getTreeItem` may run more than once per row.
 */
export function stampCopyKind(item: ConfigurationItem): void {
    const label = typeof item.label === "string" ? item.label : item.label?.label;
    const kind = label !== undefined ? COPY_KINDS[label] : undefined;
    if (
        kind !== undefined &&
        typeof item.description === "string" &&
        item.description.length > 0 &&
        !item.contextValue?.includes(".copy=")
    ) {
        item.contextValue = item.contextValue
            ? `${item.contextValue}.copy=${kind}`
            : `databricks.configuration.copy=${kind}`;
    }
}

/** Copies a row's `copyText`, else its description, else its label. */
export async function copyRow(item: ConfigurationItem | undefined): Promise<void> {
    const label = typeof item?.label === "string" ? item.label : item?.label?.label;
    const text =
        item?.copyText ??
        (typeof item?.description === "string" ? item.description : undefined) ??
        label;
    if (text === undefined) {
        throw new UserFacingError(
            "NOTHING_TO_COPY",
            "Databricks: Can't copy to clipboard. No text found.",
        );
    }
    await env.clipboard.writeText(text);
    void window.showInformationMessage("Copied to clipboard");
}
