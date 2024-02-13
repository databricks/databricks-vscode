import {BundleResourceModifiedStatus} from "../../../bundle/models/BundleRemoteStateModel";
import {asDecorationResourceUri} from "../DecorationProvider";
import {ThemeColor, TreeItemCollapsibleState} from "vscode";

export function getModifiedStatusDecoration(
    id: string,
    modifiedStatus?: BundleResourceModifiedStatus
) {
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
                color: new ThemeColor(
                    "gitDecoration.deletedResourceForeground"
                ),
                tooltip: "Deleted after deploy",
            });
        case "updated":
            return asDecorationResourceUri(id, {
                badge: "U",
                color: new ThemeColor(
                    "gitDecoration.modifiedResourceForeground"
                ),
                tooltip: "Updated after deploy",
            });
    }
}

export function getCollapsibleState(
    isRunning: boolean,
    modifiedStatus?: BundleResourceModifiedStatus
): TreeItemCollapsibleState {
    if (modifiedStatus === "deleted") {
        return TreeItemCollapsibleState.None;
    }

    if (isRunning) {
        return TreeItemCollapsibleState.Collapsed;
    }

    return TreeItemCollapsibleState.Expanded;
}
