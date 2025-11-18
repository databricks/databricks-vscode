// The pipeline managers keeps track of the latest piepline updates (runs),
// and the events associated with them. Based on the events it knows about the table definitions
// for each pipeline, and provides functionality for selecting tables for a partial update.

import {
    Disposable,
    QuickPick,
    QuickPickItem,
    QuickPickItemKind,
    window,
    languages,
    DiagnosticCollection,
    Diagnostic,
    Range,
    DiagnosticSeverity,
    Uri,
    workspace,
    NotebookRange,
    commands,
    Selection,
    TextEditor,
} from "vscode";
import {PipelineRunStatus} from "./run/PipelineRunStatus";
import {BundleRunStatusManager} from "./run/BundleRunStatusManager";
import {ConfigModel} from "../configuration/models/ConfigModel";
import {
    ListPipelineEventsRequest,
    PipelineEvent,
    UpdateInfo,
} from "@databricks/sdk-experimental/dist/apis/pipelines";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {Barrier} from "../locking/Barrier";
import {WorkspaceClient} from "@databricks/sdk-experimental";
import {LocalUri, RemoteUri} from "../sync/SyncDestination";
import {expandUriAndType, NotebookType} from "../utils/fileUtils";
import {onError} from "../utils/onErrorDecorator";

type RunState = {
    data: UpdateInfo | undefined;
    events: PipelineEvent[] | undefined;
};

export type DatasetWithSchema = {
    name: string;
    type: string;
    schema: Array<{name: string; type: string}>;
};

type ResolvedPipelineState = {
    datasets: Set<string>;
    schemas: Map<string, DatasetWithSchema>;
};
type PreloadedPipelineState = Promise<ResolvedPipelineState | undefined>;

type PipelineState = {
    key: string;
    runs: Set<RunState>;
} & ResolvedPipelineState;

type Pick = QuickPickItem & {isDataset?: boolean};

type SourceLocation = {
    path: string;
    // eslint-disable-next-line @typescript-eslint/naming-convention
    line_number: number;
    // eslint-disable-next-line @typescript-eslint/naming-convention
    notebook_cell_number?: number;
};

const MAX_EVENTS_TO_LOAD = 1000;

export class BundlePipelinesManager {
    private disposables: Disposable[] = [];
    private readonly triggeredState: Map<string, PipelineState> = new Map();
    private readonly preloadedState: Map<string, PreloadedPipelineState> =
        new Map();
    private readonly diagnostics: DiagnosticCollection;

    constructor(
        private readonly connectionManager: ConnectionManager,
        private readonly runStatusManager: BundleRunStatusManager,
        private readonly configModel: ConfigModel
    ) {
        this.diagnostics = languages.createDiagnosticCollection(
            "Databricks Pipelines"
        );
        this.disposables.push(
            this.diagnostics,
            this.configModel.onDidChangeTarget(() => {
                this.updateTriggeredPipelinesState();
                this.updateDiagnostics();
                this.preloadedState.clear();
            }),
            this.configModel.onDidChangeKey("remoteStateConfig")(async () => {
                this.updateTriggeredPipelinesState();
                this.updateDiagnostics();
            }),
            this.runStatusManager.onDidChange(() => {
                this.updateTriggeredPipelinesState();
                this.updateDiagnostics();
            })
        );
        this.updateTriggeredPipelinesState();
        this.updateDiagnostics();
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
                    schemas: new Map(),
                    runs: new Set(),
                });
            }
            const state = this.triggeredState.get(pipelineKey)!;
            const runStatus = this.runStatusManager.runStatuses.get(
                `pipelines.${pipelineKey}`
            );
            if (runStatus) {
                state.runs.add(runStatus as PipelineRunStatus);
                const extractedData = extractPipelineDatasets(state.runs);
                state.datasets = extractedData.datasets;
                state.schemas = extractedData.schemas;
            }
        });
    }

    public clearDiagnostics() {
        this.diagnostics.clear();
    }

    public async showPipelineEventDetails(event?: PipelineEvent) {
        if (!event || !event.message) {
            return;
        }
        const message = getEventMessage(event);
        window.showInformationMessage(message);
        // Source location is undocumented, but it's safe to rely on
        // @ts-expect-error Property 'source_code_location' does not exist
        const location: SourceLocation = event.origin?.source_code_location;
        if (!location?.path) {
            return;
        }

        const localUri = this.remoteToLocal(location.path);
        const fileCheck = await expandUriAndType(localUri);
        const uri = fileCheck.uri;
        if (!uri) {
            return;
        }
        const range = await locationToRange(uri, location, fileCheck.type);
        let editor: TextEditor | undefined;
        if (fileCheck.type === "IPYNB") {
            const notebook = await workspace.openNotebookDocument(uri);
            const notebookEditor = await window.showNotebookDocument(notebook);
            const cellIndex = (location.notebook_cell_number ?? 1) - 1;
            notebookEditor.revealRange(new NotebookRange(cellIndex, cellIndex));
            if (location.notebook_cell_number) {
                const cell = notebook.cellAt(cellIndex);
                editor = await window.showTextDocument(cell.document);
            }
        } else {
            const doc = await workspace.openTextDocument(uri);
            editor = await window.showTextDocument(doc);
        }
        if (editor) {
            editor.selection = new Selection(
                range.start.line,
                range.start.character,
                range.end.line,
                range.end.character
            );
        }
        commands.executeCommand("revealLine", {
            lineNumber: range.start.line,
            at: "center",
        });
    }

    @onError({popup: {prefix: "Failed to update pipeline diagnostics."}})
    private async updateDiagnostics() {
        this.clearDiagnostics();
        const diagnosticsMap = new Map<string, Diagnostic[]>();
        for (const pipelineState of this.triggeredState.values()) {
            const latestRun = Array.from(pipelineState.runs).sort(
                (a, b) =>
                    (b.data?.creation_time ?? 0) - (a.data?.creation_time ?? 0)
            )[0];
            if (!latestRun) {
                continue;
            }
            for (const event of latestRun.events ?? []) {
                // Source location is undocumented, but it's safe to rely on
                const location: SourceLocation =
                    // @ts-expect-error Property 'source_code_location' does not exist
                    event.origin?.source_code_location;
                if (
                    !event.message ||
                    !location?.path ||
                    !["ERROR", "WARN"].includes(event.level || "")
                ) {
                    continue;
                }
                const fileCheck = await expandUriAndType(
                    this.remoteToLocal(location.path)
                );
                let uri = fileCheck.uri;
                if (!uri) {
                    continue;
                }
                if (fileCheck.type === "IPYNB") {
                    const cellIndex = (location.notebook_cell_number ?? 1) - 1;
                    uri = generateNotebookCellURI(uri, cellIndex);
                }
                const path = uri.toString();
                const range = await locationToRange(
                    uri,
                    location,
                    fileCheck.type
                );
                const diagnostic = new Diagnostic(
                    range,
                    getEventMessage(event),
                    event.level === "ERROR"
                        ? DiagnosticSeverity.Error
                        : DiagnosticSeverity.Warning
                );
                diagnostic.source = "Databricks Extension";
                if (!diagnosticsMap.has(path)) {
                    diagnosticsMap.set(path, []);
                }
                diagnosticsMap.get(path)?.push(diagnostic);
            }
        }

        for (const [path, diagnostics] of diagnosticsMap) {
            this.diagnostics.set(Uri.parse(path), diagnostics);
        }
    }

    private remoteToLocal(remotePath: string): LocalUri | undefined {
        try {
            return this.connectionManager.syncDestinationMapper?.remoteToLocal(
                new RemoteUri(remotePath)
            );
        } catch (e) {
            return undefined;
        }
    }

    public getDatasets(pipelineKey: string) {
        const key = pipelineKey.split(".")[1] ?? pipelineKey;
        return this.triggeredState.get(key)?.datasets ?? new Set();
    }

    public getSchemas(pipelineKey: string) {
        const key = pipelineKey.split(".")[1] ?? pipelineKey;
        return (
            this.triggeredState.get(key ?? pipelineKey)?.schemas ??
            new Map<string, DatasetWithSchema>()
        );
    }

    public async preloadDatasets(pipelineKey: string): PreloadedPipelineState {
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

        const barrier = new Barrier<ResolvedPipelineState>();
        this.preloadedState.set(pipelineKey, barrier.promise);

        try {
            const runs = await this.preloadUpdates(client, pipelineId);
            if (!runs) {
                barrier.resolve({datasets: new Set(), schemas: new Map()});
                return barrier.promise;
            }
            const listing = this.createPreloadEventsRequest(
                client,
                pipelineId,
                runs
            );
            let loadedEventsCount = 0;
            for await (const event of listing) {
                const runState = runs.get(event.origin?.update_id ?? "");
                if (runState?.events) {
                    runState.events.push(event);
                }
                loadedEventsCount++;
                if (loadedEventsCount >= MAX_EVENTS_TO_LOAD) {
                    break;
                }
            }
            const extractedData = extractPipelineDatasets(
                new Set(runs.values())
            );
            barrier.resolve(extractedData);
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
            (a, b) =>
                (a.data?.creation_time ?? 0) - (b.data?.creation_time ?? 0)
        )[0].data?.creation_time;
        if (oldestUpdateTime) {
            const timestamp = new Date(oldestUpdateTime).toISOString();
            listEventsOptions.filter = `timestamp >= '${timestamp}'`;
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
            .then((preloadedData) => {
                if (preloadedData && isUIVisible) {
                    for (const dataset of preloadedData.datasets) {
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

export function isFullGraphUpdate(update?: UpdateInfo) {
    if (!update || update.state !== "COMPLETED") {
        return false;
    }
    return (
        (!update.full_refresh_selection ||
            update.full_refresh_selection.length === 0) &&
        (!update.refresh_selection || update.refresh_selection.length === 0)
    );
}

function extractPipelineDatasets(runs: Set<RunState>): ResolvedPipelineState {
    const datasets = new Set<string>();
    const schemas = new Map<string, DatasetWithSchema>();
    const runsByStartTimeDesc = Array.from(runs).sort(
        (a, b) => (b.data?.creation_time ?? 0) - (a.data?.creation_time ?? 0)
    );
    for (const run of runsByStartTimeDesc) {
        for (const event of run.events ?? []) {
            const datasetName = event.origin?.dataset_name;
            // 'details' is not documented, but it's safe to rely on if it exists
            // @ts-expect-error Property 'details' does not exist
            const definition = event.details?.dataset_definition;
            if (!datasetName || !definition) {
                continue;
            }
            const datasetType = definition.dataset_type ?? "";
            if (datasetType && datasetType !== "VIEW") {
                datasets.add(datasetName);
            }
            if (
                Array.isArray(definition.schema) &&
                definition.schema.length > 0
            ) {
                const schema = definition.schema.map(
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    (field: {name?: string; data_type?: string}) => ({
                        name: field.name ?? "",
                        type: field.data_type ?? "",
                    })
                );
                schemas.set(datasetName, {
                    name: datasetName,
                    type: datasetType,
                    schema,
                });
            }
        }
        if (isFullGraphUpdate(run.data)) {
            break;
        }
    }
    return {datasets, schemas};
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
        description: "Truncate and recompute selected tables",
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

function getEventMessage(event: PipelineEvent) {
    let message = event.message;
    if (event.error?.exceptions) {
        message = [
            message,
            ...event.error.exceptions.map((e) => e.message).filter(Boolean),
        ].join("\n");
    }
    return message ?? "";
}

export async function locationToRange(
    uri: Uri,
    location: SourceLocation,
    fileType?: NotebookType
) {
    const cellIndex = (location.notebook_cell_number ?? 1) - 1;
    let line = (location.line_number ?? 1) - 1;
    if (fileType === "PY_DBNB") {
        const bytes = await workspace.fs.readFile(uri);
        const prevCells = new TextDecoder()
            .decode(bytes)
            .split(/\r?\n# COMMAND ----------.*\r?\n/)
            .slice(0, cellIndex);
        const prevCellLines = prevCells
            .map((cell) => cell.split(/\r?\n/).length)
            .reduce((a, b) => a + b, prevCells.length);
        line += prevCellLines;
    }
    return new Range(line, 0, line, Number.MAX_SAFE_INTEGER);
}

// Cell URIs are private and there is no public API to generate them.
// Here we generate a URI for a cell in the same way as VS Code does it internally.
// https://github.com/microsoft/vscode/blob/9508be851891834c4036da28461824c664dfa2c0/src/vs/workbench/services/notebook/common/notebookDocumentService.ts#L45C41-L45C47
// As an alternative we can access these URIs by relying on open notebook editors,
// which means you won't get diagnostics in the problems panel unless you open a notebook.
// (Which is how it actually is for disgnostics that python extension provides)
function generateNotebookCellURI(notebook: Uri, handle: number): Uri {
    const lengths = ["W", "X", "Y", "Z", "a", "b", "c", "d", "e", "f"];
    const radix = 7;
    const cellScheme = "vscode-notebook-cell";
    const s = handle.toString(radix);
    const p = s.length < lengths.length ? lengths[s.length - 1] : "z";
    // base64 encoded notebook cell scheme
    const schemeFragment = "ZmlsZQ==";
    const fragment = `${p}${s}s${schemeFragment}`;
    return notebook.with({scheme: cellScheme, fragment});
}
