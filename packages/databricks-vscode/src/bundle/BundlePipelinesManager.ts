// The pipeline managers keeps track of the latest piepline updates (runs),
// and the events associated with them. Based on the events it knows about the table definitions
// for each pipeline, and provides functionality for selecting tables for a partial update.

import {
    Disposable,
    QuickPick,
    QuickPickItem,
    QuickPickItemKind,
    window,
} from "vscode";
import {PipelineRunStatus} from "./run/PipelineRunStatus";
import {BundleRunStatusManager} from "./run/BundleRunStatusManager";
import {ConfigModel} from "../configuration/models/ConfigModel";
import {
    PipelineEvent,
    UpdateInfo,
} from "@databricks/databricks-sdk/dist/apis/pipelines";

type PipelineState = {
    key: string;
    datasets: Set<string>;
    runs: Set<PipelineRunStatus>;
};

type Pick = QuickPickItem & {isDataset?: boolean; isDefault?: boolean};

export class BundlePipelinesManager {
    private disposables: Disposable[] = [];
    private readonly pipelines: Map<string, PipelineState> = new Map();

    constructor(
        private readonly runStatusManager: BundleRunStatusManager,
        private readonly configModel: ConfigModel
    ) {
        this.disposables.push(
            this.configModel.onDidChangeTarget(() => {
                this.updatePipelines();
            }),
            this.configModel.onDidChangeKey("remoteStateConfig")(async () => {
                this.updatePipelines();
            }),
            this.runStatusManager.onDidChange(() => {
                this.updatePipelines();
            })
        );
        this.updatePipelines();
    }

    private async updatePipelines() {
        const remoteState = await this.configModel.get("remoteStateConfig");
        if (!remoteState) {
            this.pipelines.clear();
            return;
        }
        const pipelines = remoteState.resources?.pipelines ?? {};
        Object.keys(pipelines).map((pipelineKey) => {
            if (!this.pipelines.has(pipelineKey)) {
                this.pipelines.set(pipelineKey, {
                    key: pipelineKey,
                    datasets: new Set(),
                    runs: new Set(),
                });
            }
            const state = this.pipelines.get(pipelineKey)!;
            const runStatus = this.runStatusManager.runStatuses.get(
                `pipelines.${pipelineKey}`
            );
            if (runStatus) {
                state.runs.add(runStatus as PipelineRunStatus);
                state.datasets = this.updatePipelineDatasets(state.runs);
            }
        });
    }

    public getDatasets(pipelineKey: string) {
        return this.pipelines.get(pipelineKey)?.datasets ?? new Set();
    }

    private updatePipelineDatasets(runs: Set<PipelineRunStatus>) {
        const datasets = new Set<string>();
        const runsByStartTimeDesc = Array.from(runs).sort(
            (a, b) =>
                (b.data?.update?.creation_time ?? 0) -
                (a.data?.update?.creation_time ?? 0)
        );
        for (const run of runsByStartTimeDesc) {
            for (const event of run.events ?? []) {
                const datasetName = extractDatasetName(event);
                if (datasetName) {
                    datasets.add(datasetName);
                }
            }
            if (isFullGraphUpdate(run.data?.update)) {
                break;
            }
        }
        return datasets;
    }

    async showTableSelectionQuickPick(pipelineKey: string) {
        const key = pipelineKey.split(".")[1];
        const datasets = this.getDatasets(key);
        const defaultsSeparatorPick: Pick = {
            label: "Defaults",
            kind: QuickPickItemKind.Separator,
            alwaysShow: true,
        };
        const datasetPicks: Pick[] = Array.from(datasets).map((dataset) => ({
            label: dataset,
            isDataset: true,
            alwaysShow: true,
            isDefault: true,
        }));
        const optionsSeparatorPick: Pick = {
            label: "Options",
            kind: QuickPickItemKind.Separator,
            alwaysShow: true,
        };
        const fullRefreshPick: Pick = {
            label: "Full Refresh",
            description: "Reset tables before the update",
            alwaysShow: true,
            isDefault: true,
        };
        const ui = window.createQuickPick<Pick>();
        ui.canSelectMany = true;
        const defaultItems = [
            defaultsSeparatorPick,
            ...datasetPicks,
            optionsSeparatorPick,
            fullRefreshPick,
        ];
        ui.items = defaultItems;
        if (datasets.size > 0) {
            ui.title = "Select or type in tables to update";
        } else {
            ui.title = "Provide table names to update";
        }
        ui.placeholder = "Comma separated list of table names";
        ui.show();
        const disposables: Disposable[] = [];
        ui.onDidChangeValue(
            () => {
                const manualItems = stringToPicks(ui.value);
                ui.items = manualItems.concat(defaultItems);
                ui.selectedItems = manualItems.concat(
                    ui.selectedItems.filter((item) => item.isDefault)
                );
            },
            null,
            disposables
        );
        const picks = await waitForPicks(ui, disposables);
        const selectedTables = picksToString(picks);
        disposables.forEach((d) => d.dispose());
        ui.hide();
        return {
            tables: selectedTables,
            fullRefresh: ui.selectedItems.includes(fullRefreshPick),
        };
    }

    dispose() {
        this.disposables.forEach((d) => d.dispose());
    }
}

function isFullGraphUpdate(update?: UpdateInfo) {
    if (!update) {
        return false;
    }
    return (
        (!update.full_refresh_selection ||
            update.full_refresh_selection.length === 0) &&
        (!update.refresh_selection || update.refresh_selection.length === 0)
    );
}

// "details" is not a publicly documented field
function extractDatasetName(
    event: PipelineEvent & {details?: any}
): string | undefined {
    if (!event.origin?.dataset_name) {
        return;
    }
    // VIEWs can't be used for a partial refresh (they are always refreshed)
    if (event.details?.dataset_definition?.dataset_type === "VIEW") {
        return;
    }
    return event.origin.dataset_name;
}

function picksToString(picks?: readonly Pick[]): string | undefined {
    return picks
        ?.filter((p) => p.isDataset)
        .map((p) => p.label)
        .join(",");
}

function stringToPicks(str: string): Pick[] {
    return str
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => {
            return {
                label: item,
                alwaysShow: true,
                isDataset: true,
            };
        });
}

async function waitForPicks(ui: QuickPick<Pick>, disposables: Disposable[]) {
    return new Promise<readonly Pick[] | undefined>((resolve) => {
        ui.onDidAccept(() => resolve(ui.selectedItems), null, disposables);
        ui.onDidHide(() => resolve(undefined), null, disposables);
    });
}
