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
    ListPipelineEventsRequest,
    PipelineEvent,
    UpdateInfo,
} from "@databricks/databricks-sdk/dist/apis/pipelines";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {Barrier} from "../locking/Barrier";
import {WorkspaceClient} from "@databricks/databricks-sdk";

type RunState = {
    data: UpdateInfo | undefined;
    events: PipelineEvent[] | undefined;
};

type PipelineState = {
    key: string;
    datasets: Set<string>;
    runs: Set<RunState>;
};

type PreloadedPipelineState = Promise<Set<string> | undefined>;

type Pick = QuickPickItem & {isDataset?: boolean};

export class BundlePipelinesManager {
    private disposables: Disposable[] = [];
    private readonly triggeredState: Map<string, PipelineState> = new Map();
    private readonly preloadedState: Map<string, PreloadedPipelineState> =
        new Map();

    constructor(
        private readonly connectionManager: ConnectionManager,
        private readonly runStatusManager: BundleRunStatusManager,
        private readonly configModel: ConfigModel
    ) {
        this.disposables.push(
            this.configModel.onDidChangeTarget(() => {
                this.updateTriggeredPipelinesState();
            }),
            this.configModel.onDidChangeKey("remoteStateConfig")(async () => {
                this.updateTriggeredPipelinesState();
            }),
            this.runStatusManager.onDidChange(() => {
                this.updateTriggeredPipelinesState();
            })
        );
        this.updateTriggeredPipelinesState();
    }

    private async updateTriggeredPipelinesState() {
        const remoteState = await this.configModel.get("remoteStateConfig");
        if (!remoteState) {
            this.triggeredState.clear();
            return;
        }
        const pipelines = remoteState.resources?.pipelines ?? {};
        Object.keys(pipelines).map((pipelineKey) => {
            if (!this.triggeredState.has(pipelineKey)) {
                this.triggeredState.set(pipelineKey, {
                    key: pipelineKey,
                    datasets: new Set(),
                    runs: new Set(),
                });
            }
            const state = this.triggeredState.get(pipelineKey)!;
            const runStatus = this.runStatusManager.runStatuses.get(
                `pipelines.${pipelineKey}`
            );
            if (runStatus) {
                state.runs.add(runStatus as PipelineRunStatus);
                state.datasets = extractPipelineDatasets(state.runs);
            }
        });
    }

    public getDatasets(pipelineKey: string) {
        return this.triggeredState.get(pipelineKey)?.datasets ?? new Set();
    }

    async preloadDatasets(pipelineKey: string): PreloadedPipelineState {
        const remoteState = await this.configModel.get("remoteStateConfig");
        if (!remoteState) {
            return undefined;
        }

        const pipelines = remoteState.resources?.pipelines ?? {};
        const pipelineId = pipelines[pipelineKey]?.id;
        if (!pipelineId) {
            return undefined;
        }

        const client = this.connectionManager.workspaceClient;
        if (!client) {
            return undefined;
        }

        const preloaded = this.preloadedState.get(pipelineKey);
        if (preloaded) {
            return preloaded;
        }

        const barrier = new Barrier<Set<string>>();
        this.preloadedState.set(pipelineKey, barrier.promise);

        try {
            const runs = await this.preloadUpdates(client, pipelineId);
            if (!runs) {
                barrier.resolve(new Set());
                return barrier.promise;
            }
            const listing = this.createPreloadEventsRequest(
                client,
                pipelineId,
                runs
            );
            for await (const event of listing) {
                const runState = runs.get(event.origin?.update_id ?? "");
                if (runState?.events) {
                    runState.events.push(event);
                }
            }
            const datasets = extractPipelineDatasets(new Set(runs.values()));
            barrier.resolve(datasets);
        } catch (e) {
            barrier.reject(e);
        }

        return barrier.promise;
    }

    private async preloadUpdates(client: WorkspaceClient, pipelineId: string) {
        const latestUpdates = await client.pipelines.listUpdates({
            // eslint-disable-next-line @typescript-eslint/naming-convention
            pipeline_id: pipelineId,
            // eslint-disable-next-line @typescript-eslint/naming-convention
            max_results: 3,
        });
        if (!latestUpdates.updates) {
            return undefined;
        }
        const runs: Map<string, RunState> = latestUpdates.updates.reduce(
            (map, update) => {
                map.set(update.update_id, {data: update, events: []});
                return map;
            },
            new Map()
        );
        return runs;
    }

    private createPreloadEventsRequest(
        client: WorkspaceClient,
        pipelineId: string,
        runs: Map<string, RunState>
    ) {
        const listEventsOptions: ListPipelineEventsRequest = {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            pipeline_id: pipelineId,
            // eslint-disable-next-line @typescript-eslint/naming-convention
            order_by: ["timestamp asc"],
        };
        const oldestUpdateTime = Array.from(runs.values()).sort(
            (a, b) => a.data?.creation_time ?? 0 - (b.data?.creation_time ?? 0)
        )[0].data?.creation_time;
        if (oldestUpdateTime) {
            const timestamp = new Date(oldestUpdateTime).toISOString();
            listEventsOptions.filter = `timestamp >= '${timestamp}'`;
        } else {
            listEventsOptions.max_results = 100;
        }
        return client.pipelines.listPipelineEvents(listEventsOptions);
    }

    public async showTableSelectionQuickPick(pipelineKey: string) {
        const key = pipelineKey.split(".")[1];
        const knownDatasets = this.getDatasets(key);
        const {allPicks, fullRefreshPick} = createPicks(knownDatasets);
        const ui = window.createQuickPick<Pick>();
        ui.title = "Select tables to update";
        ui.placeholder =
            "Comma-separated list of tables to extend the selection";
        ui.canSelectMany = true;
        ui.busy = true;
        ui.items = allPicks;
        ui.show();
        let isUIVisible = true;
        const disposables: Disposable[] = [];
        ui.onDidChangeValue(
            () => updateItems(ui, knownDatasets),
            null,
            disposables
        );
        this.preloadDatasets(key)
            .then((preloadedDatasets) => {
                if (preloadedDatasets && isUIVisible) {
                    for (const dataset of preloadedDatasets) {
                        knownDatasets.add(dataset);
                    }
                    updateItems(ui, knownDatasets);
                }
            })
            .catch((e) => {
                window.showErrorMessage(
                    "Failed to load datasets from previous pipeline runs",
                    {detail: e.message}
                );
            })
            .finally(() => {
                if (isUIVisible) {
                    ui.busy = false;
                }
            });
        const picks = await waitForPicks(ui, disposables);
        const selectedTables = picksToString(picks);
        disposables.forEach((d) => d.dispose());
        ui.dispose();
        isUIVisible = false;
        if (
            selectedTables &&
            selectedTables.length > 0 &&
            isPickSelected(ui, fullRefreshPick)
        ) {
            switch (await confirmFullRefresh()) {
                case "Yes":
                    return {tables: selectedTables, fullRefresh: true};
                default:
                    return {tables: undefined, fullRefresh: false};
            }
        } else {
            return {tables: selectedTables, fullRefresh: false};
        }
    }

    public dispose() {
        this.disposables.forEach((d) => d.dispose());
    }
}

async function confirmFullRefresh() {
    return await window.showWarningMessage(
        "Are you sure you want to full refresh?",
        {
            modal: true,
            // The same warning we show in the workspace
            detail: "Full refresh will truncate and recompute ALL tables in this pipeline from scratch. This can lead to data loss for non-idempotent sources.",
        },
        "Yes",
        "No"
    );
}

function isFullGraphUpdate(update?: UpdateInfo) {
    if (!update || update.state !== "COMPLETED") {
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

function extractPipelineDatasets(runs: Set<RunState>) {
    const datasets = new Set<string>();
    const runsByStartTimeDesc = Array.from(runs).sort(
        (a, b) => (b.data?.creation_time ?? 0) - (a.data?.creation_time ?? 0)
    );
    for (const run of runsByStartTimeDesc) {
        for (const event of run.events ?? []) {
            const datasetName = extractDatasetName(event);
            if (datasetName) {
                datasets.add(datasetName);
            }
        }
        if (isFullGraphUpdate(run.data)) {
            break;
        }
    }
    return datasets;
}

function createPicks(datasets: Set<string>, manualValue?: string) {
    const defaultsSeparatorPick: Pick = {
        label: "Defaults",
        kind: QuickPickItemKind.Separator,
        alwaysShow: true,
    };
    if (manualValue) {
        const manualDatasets = stringToDatasets(manualValue);
        datasets = new Set([...manualDatasets, ...datasets]);
    }
    const datasetPicks: Pick[] = setToDatasetPicks(datasets);
    const optionsSeparatorPick: Pick = {
        label: "Options",
        kind: QuickPickItemKind.Separator,
        alwaysShow: true,
    };
    const fullRefreshPick: Pick = {
        label: "Full Refresh",
        description: "Truncate and recopmute selected tables",
        alwaysShow: true,
    };
    const ui = window.createQuickPick<Pick>();
    ui.canSelectMany = true;
    const allPicks = [
        defaultsSeparatorPick,
        ...datasetPicks,
        optionsSeparatorPick,
        fullRefreshPick,
    ];
    return {allPicks, fullRefreshPick};
}

function picksToString(picks?: readonly Pick[]): string | undefined {
    return picks
        ?.filter((p) => p.isDataset)
        .map((p) => p.label)
        .join(",");
}

function stringToDatasets(str: string): Set<string> {
    const list = str
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    return new Set(list);
}

function setToDatasetPicks(datasets: Set<string>): Pick[] {
    return Array.from(datasets).map((dataset) => ({
        label: dataset,
        isDataset: true,
        alwaysShow: true,
    }));
}

async function waitForPicks(ui: QuickPick<Pick>, disposables: Disposable[]) {
    return new Promise<readonly Pick[] | undefined>((resolve) => {
        ui.onDidAccept(() => resolve(ui.selectedItems), null, disposables);
        ui.onDidHide(() => resolve(undefined), null, disposables);
    });
}

function updateItems(ui: QuickPick<Pick>, knownDatasets: Set<string>) {
    ui.items = createPicks(knownDatasets, ui.value).allPicks;
    ui.selectedItems = ui.items.filter((i) =>
        ui.selectedItems.some((s) => s.label === i.label)
    );
}

function isPickSelected(ui: QuickPick<Pick>, pick: Pick) {
    return ui.selectedItems.some(
        (i) => i.label === pick.label && i.description === pick.description
    );
}
