import {
    QuickPickItemKind,
    window,
    type Disposable,
    type QuickPick,
    type QuickPickItem,
} from "vscode";
import { UserFacingError } from "../../../platform/errors";

/*
 * "Deploy the bundle and select pipeline tables for partial update"
 * (BNDL-10), ported from the old `BundlePipelinesManager`. The strings and
 * the full-refresh modal are the old ones; the path is untested by the
 * frozen suite.
 */

type Pick = QuickPickItem & { isDataset?: boolean };

export interface TableSelection {
    /** Comma-separated, or undefined when nothing was chosen. */
    readonly tables?: string;
    readonly fullRefresh: boolean;
}

const FULL_REFRESH: Pick = {
    label: "Full Refresh",
    description: "Truncate and recompute selected tables",
    alwaysShow: true,
};

/** The known datasets, plus those typed as a comma-separated list, then the options. */
export function createPicks(known: ReadonlySet<string>, typed?: string): Pick[] {
    const datasets = new Set([...stringToDatasets(typed ?? ""), ...known]);
    return [
        { label: "Defaults", kind: QuickPickItemKind.Separator, alwaysShow: true },
        ...[...datasets].map((label) => ({ label, isDataset: true, alwaysShow: true })),
        { label: "Options", kind: QuickPickItemKind.Separator, alwaysShow: true },
        FULL_REFRESH,
    ];
}

function stringToDatasets(value: string): string[] {
    return value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
}

/**
 * Asks for the tables to update. `known` shows at once; `preload` adds the
 * datasets of earlier updates when it resolves, and `showError` reports it
 * failing while the picker stays open.
 */
export async function showTableSelectionQuickPick(
    known: ReadonlySet<string>,
    preload: Promise<ReadonlySet<string> | undefined>,
    showError: (error: UserFacingError) => Promise<void>,
): Promise<TableSelection> {
    const datasets = new Set(known);
    const ui: QuickPick<Pick> = window.createQuickPick<Pick>();
    ui.title = "Select tables to update";
    ui.placeholder = "Comma-separated list of tables to extend the selection";
    ui.canSelectMany = true;
    ui.busy = true;
    ui.items = createPicks(datasets);
    ui.show();
    let visible = true;
    const disposables: Disposable[] = [];
    const updateItems = () => {
        ui.items = createPicks(datasets, ui.value);
        ui.selectedItems = ui.items.filter((i) =>
            ui.selectedItems.some((s) => s.label === i.label),
        );
    };
    ui.onDidChangeValue(updateItems, null, disposables);
    preload
        .then((loaded) => {
            if (loaded !== undefined && visible) {
                loaded.forEach((d) => datasets.add(d));
                updateItems();
            }
        })
        .catch((e: unknown) => {
            void showError(
                new UserFacingError(
                    "DATASETS_NOT_LOADED",
                    "Failed to load datasets from previous pipeline runs",
                    { cause: e },
                ),
            );
        })
        .finally(() => {
            if (visible) {
                ui.busy = false;
            }
        });
    const picks = await new Promise<readonly Pick[] | undefined>((resolve) => {
        ui.onDidAccept(() => resolve(ui.selectedItems), null, disposables);
        ui.onDidHide(() => resolve(undefined), null, disposables);
    });
    const fullRefreshSelected = ui.selectedItems.some(
        (i) => i.label === FULL_REFRESH.label && i.description === FULL_REFRESH.description,
    );
    disposables.forEach((d) => d.dispose());
    ui.dispose();
    visible = false;
    const tables = picks
        ?.filter((p) => p.isDataset)
        .map((p) => p.label)
        .join(",");
    if (tables && fullRefreshSelected) {
        const choice = await window.showWarningMessage(
            "Are you sure you want to full refresh?",
            {
                modal: true,
                // The warning the workspace shows.
                detail: "Full refresh will truncate and recompute ALL tables in this pipeline from scratch. This can lead to data loss for non-idempotent sources.",
            },
            "Yes",
            "No",
        );
        return choice === "Yes"
            ? { tables, fullRefresh: true }
            : { tables: undefined, fullRefresh: false };
    }
    return { tables, fullRefresh: false };
}
