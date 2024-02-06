import {BundleResourceModifiedStatus} from "../../../bundle/models/BundleRemoteStateModel";
import {asDecorationResourceUri} from "../DecorationProvider";
import {ThemeColor} from "vscode";

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
