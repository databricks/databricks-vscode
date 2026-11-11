import { ThemeColor, ThemeIcon, TreeItemCollapsibleState, Uri, type Event } from "vscode";
import type { SyncDestination } from "../../kernel/bundle/SyncDestination";
import {
    SECTION_ORDER,
    type ConfigurationItem,
    type ConfigurationSection,
} from "../../platform/ui/sections";
import { isRunning, type SyncStatus } from "./syncState";

/** The menus match `databricks.*sync.*is-stopped` and `…is-running` for the inline start and stop actions. */
const SYNC_CONTEXT = "databricks.configuration.sync";

/** Shows the error of a failed sync; the "Sync State" row runs it. */
export const SHOW_SYNC_ERROR = "databricks.sync.showError";

const ROW_ID = "WORKSPACE";

/** What the section shows: read when it renders, never fetched then. */
export interface RemoteFolderInputs {
    /** Undefined while signed out, or before validate has run for the target. */
    destination(): SyncDestination | undefined;
    /** The target's mode is `development`: only then can it sync. */
    isDevTarget(): boolean;
    status(): SyncStatus;
    /** The folder's link, once the folder exists in the workspace. */
    url(): string | undefined;
}

/** The "C" badge of a folder that doesn't exist yet. The bundle explorer's decoration provider renders the scheme. */
const CREATED_DECORATION = Uri.from({
    scheme: "databricks-view-item",
    path: ROW_ID,
    query: JSON.stringify({
        badge: "C",
        color: new ThemeColor("gitDecoration.addedResourceForeground"),
        tooltip: "Created after deploy",
    }),
});

function icon(status: SyncStatus): ThemeIcon {
    switch (status.state) {
        case "IN_PROGRESS":
            return new ThemeIcon("sync~spin", new ThemeColor("debugIcon.startForeground"));
        case "STOPPED":
            return new ThemeIcon("folder-active", new ThemeColor("charts.green"));
        case "WATCHING_FOR_CHANGES":
            return new ThemeIcon("eye", new ThemeColor("debugIcon.startForeground"));
        default:
            return new ThemeIcon(
                "testing-error-icon",
                new ThemeColor("notificationsErrorIcon.foreground"),
            );
    }
}

/**
 * The "Remote Folder" row (SYNC-01): where the bundle's files are in the
 * workspace, with Path and Sync State below it for a development target.
 * Ported from the old `SyncDestinationComponent`, which fetched the
 * folder's link on every render; the link is now loaded by the feature
 * when the folder may have changed, and only read here.
 */
export class RemoteFolderSection implements ConfigurationSection {
    readonly id = "sync.remoteFolder";
    readonly order = SECTION_ORDER.remoteFolder;

    constructor(
        private readonly inputs: RemoteFolderInputs,
        readonly onDidChange?: Event<void>,
    ) {}

    getChildren(parent?: ConfigurationItem): ConfigurationItem[] {
        const destination = this.inputs.destination();
        if (destination === undefined) {
            return [];
        }
        const dev = this.inputs.isDevTarget();
        if (parent === undefined) {
            return [this.root(destination, dev)];
        }
        if (parent.id !== ROW_ID || !dev) {
            return [];
        }
        return [
            {
                label: "Path",
                id: `${ROW_ID}.path`,
                description: destination.remoteRoot,
                collapsibleState: TreeItemCollapsibleState.None,
            },
            this.stateRow(),
        ];
    }

    private root(destination: SyncDestination, dev: boolean): ConfigurationItem {
        const url = this.inputs.url();
        const status = this.inputs.status();
        const contextValue = `${SYNC_CONTEXT}${url ? ".has-url" : ""}${isRunning(status.state) ? ".is-running" : ".is-stopped"}`;
        return {
            label: "Remote Folder",
            id: ROW_ID,
            tooltip: url ? undefined : "Created after deploy",
            description: dev ? undefined : destination.remoteRoot,
            collapsibleState: dev
                ? TreeItemCollapsibleState.Collapsed
                : TreeItemCollapsibleState.None,
            contextValue,
            iconPath: icon(status),
            resourceUri: url ? undefined : CREATED_DECORATION,
            url,
        };
    }

    private stateRow(): ConfigurationItem {
        const status = this.inputs.status();
        if (status.state === "ERROR" && status.reason !== undefined) {
            return {
                label: "Sync State",
                id: `${ROW_ID}.state`,
                description: "Error - Click for more details",
                iconPath: new ThemeIcon("alert", new ThemeColor("errorForeground")),
                tooltip: "Click for more details",
                collapsibleState: TreeItemCollapsibleState.None,
                command: {
                    title: "Show sync error",
                    command: SHOW_SYNC_ERROR,
                    arguments: [status.reason],
                },
            };
        }
        return {
            label: "Sync State",
            id: `${ROW_ID}.state`,
            description: status.state,
            collapsibleState: TreeItemCollapsibleState.None,
        };
    }
}
