import {ThemeColor, ThemeIcon, TreeItemCollapsibleState} from "vscode";
import {ProfileAuthProvider} from "../../configuration/auth/AuthProvider";
import type {AuthProvider} from "../../configuration/auth/AuthProvider";
import type {ConfigurationTreeItem} from "./types";

/**
 * A connected workspace row, shared by Bundle Connection and Gateway
 * Connection so the two look the same: the workspace URL, expanding to the
 * profile (see {@link profileRows}).
 */
export function connectedRow(
    label: string,
    id: string,
    authProvider: AuthProvider,
    contextValue: string
): ConfigurationTreeItem {
    return {
        label,
        iconPath: new ThemeIcon(
            "account",
            new ThemeColor("debugIcon.startForeground")
        ),
        // The full URL, as on the bundle's Host row, so Copy Host copies the
        // same form from each.
        description: authProvider.host.toString(),
        contextValue,
        id,
        collapsibleState: TreeItemCollapsibleState.Collapsed,
    };
}

/** The profile under a {@link connectedRow}. */
export function profileRows(
    parentId: string,
    authProvider: AuthProvider | undefined
): ConfigurationTreeItem[] {
    if (!(authProvider instanceof ProfileAuthProvider)) {
        return [];
    }
    return [
        {
            label: "Profile",
            id: `${parentId}.profile`,
            description: authProvider.profile,
        },
    ];
}
