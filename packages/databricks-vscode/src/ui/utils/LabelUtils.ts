import {TreeItemLabel} from "vscode";

export function highlightedLabel(label: string): TreeItemLabel {
    return {
        label,
        highlights: [[0, label.length]],
    };
}
