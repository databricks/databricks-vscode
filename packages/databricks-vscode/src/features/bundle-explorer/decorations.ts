import {
    ThemeColor,
    TreeItemCollapsibleState,
    Uri,
    type Event,
    type FileDecoration,
    type FileDecorationProvider,
} from "vscode";
import type { BundleResourceModifiedStatus } from "../../kernel/cli/commands/bundle";
import { Emitter } from "../../platform/event";

/**
 * Badges on tree rows (C, U, D for created, updated, deleted after the last
 * deploy). A row's `resourceUri` carries its decoration in the query, and
 * this provider hands it back. Ported from the old `DecorationProvider.ts`
 * and `DecorationUtils.ts`.
 */
const DECORATION_SCHEME = "databricks-view-item";

function asDecorationResourceUri(id: string, data: FileDecoration): Uri {
    return Uri.from({ scheme: DECORATION_SCHEME, path: id, query: JSON.stringify(data) });
}

export class TreeItemDecorationProvider implements FileDecorationProvider {
    private readonly changed = new Emitter<Uri | Uri[] | undefined>();
    readonly onDidChangeFileDecorations: Event<Uri | Uri[] | undefined> = this.changed.event;

    /** Call when the rows change, so stale badges go away. */
    refresh(): void {
        this.changed.fire(undefined);
    }

    provideFileDecoration(uri: Uri): FileDecoration | undefined {
        if (uri.scheme !== DECORATION_SCHEME || !uri.query) {
            return undefined;
        }
        return JSON.parse(uri.query) as FileDecoration;
    }

    dispose(): void {
        this.changed.dispose();
    }
}

export function getModifiedStatusDecoration(
    id: string,
    modifiedStatus?: BundleResourceModifiedStatus,
): Uri | undefined {
    switch (modifiedStatus) {
        case "created":
            return asDecorationResourceUri(id, {
                badge: "C",
                color: new ThemeColor("gitDecoration.addedResourceForeground"),
                tooltip: "Created after deploy",
            });
        case "deleted":
            return asDecorationResourceUri(id, {
                badge: "D",
                color: new ThemeColor("gitDecoration.deletedResourceForeground"),
                tooltip: "Deleted after deploy",
            });
        case "updated":
            return asDecorationResourceUri(id, {
                badge: "U",
                color: new ThemeColor("gitDecoration.modifiedResourceForeground"),
                tooltip: "Updated after deploy",
            });
        default:
            return undefined;
    }
}

export function getCollapsibleState(
    isRunning: boolean,
    modifiedStatus?: BundleResourceModifiedStatus,
): TreeItemCollapsibleState {
    if (modifiedStatus === "deleted") {
        return TreeItemCollapsibleState.None;
    }
    return isRunning ? TreeItemCollapsibleState.Collapsed : TreeItemCollapsibleState.Expanded;
}
