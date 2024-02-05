import {BundleResourceModifiedStatus} from "../../../bundle/models/BundleRemoteStateModel";
import {TreeItemLabel} from "vscode";

export function addModifiedTag(
    label: string,
    modifiedStatus?: BundleResourceModifiedStatus
): TreeItemLabel | string {
    if (modifiedStatus === undefined) {
        return label;
    }

    return {
        label: `${modifiedStatus.charAt(0).toUpperCase()}${modifiedStatus
            .slice(1)
            .toLowerCase()} ${label}`,
        highlights: [[0, modifiedStatus.length]],
    };
}
