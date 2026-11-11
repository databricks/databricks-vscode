import { PipelinesClient, type UpdateInfo } from "@databricks/sdk-pipelines/v2";
import {
    calls,
    listPipelineEvents,
    type ApiClients,
    type PipelineEvent,
} from "../../../kernel/connection";

/*
 * Pipeline datasets, mined from update events (BNDL-09, BNDL-10). Ported
 * from the old `BundlePipelinesManager`. The definitions are undocumented
 * (`details.dataset_definition`); the SDK reads them from the raw response.
 */

export interface DatasetWithSchema {
    readonly name: string;
    /** `dataset_type` of the event that carried the schema: "VIEW", or "" when that event has none. */
    readonly type: string;
    readonly schema: readonly { name: string; type: string }[];
}

export interface PipelineDatasetsState {
    /** Tables and materialized views, but not views: what a partial update can select. */
    readonly datasets: Set<string>;
    readonly schemas: Map<string, DatasetWithSchema>;
}

/** One update and its events. */
export interface PipelineRun {
    readonly data?: Pick<
        UpdateInfo,
        "creationTime" | "state" | "refreshSelection" | "fullRefreshSelection"
    >;
    readonly events?: readonly PipelineEvent[];
}

/** A completed update of the whole graph: earlier updates add nothing it doesn't know. */
export function isFullGraphUpdate(update?: PipelineRun["data"]): boolean {
    if (update === undefined || update.state !== "COMPLETED") {
        return false;
    }
    return (
        (update.fullRefreshSelection ?? []).length === 0 &&
        (update.refreshSelection ?? []).length === 0
    );
}

/**
 * The datasets the runs defined, newest run first, back to the latest full
 * graph update. A dataset's description is the `dataset_type` of the event
 * that carried its schema, which is absent for materialized views; the
 * frozen spec expects "" for them, so the rule is kept.
 */
export function extractPipelineDatasets(runs: Iterable<PipelineRun>): PipelineDatasetsState {
    const datasets = new Set<string>();
    const schemas = new Map<string, DatasetWithSchema>();
    const newestFirst = [...runs].sort((a, b) =>
        Number((b.data?.creationTime ?? 0n) - (a.data?.creationTime ?? 0n)),
    );
    for (const run of newestFirst) {
        for (const event of run.events ?? []) {
            const name = event.origin?.datasetName;
            const definition = event.datasetDefinition;
            if (!name || !definition) {
                continue;
            }
            const type = definition.datasetType ?? "";
            if (type && type !== "VIEW") {
                datasets.add(name);
            }
            if (definition.schema !== undefined && definition.schema.length > 0) {
                schemas.set(name, {
                    name,
                    type,
                    schema: definition.schema.map((f) => ({
                        name: f.name ?? "",
                        type: f.dataType ?? "",
                    })),
                });
            }
        }
        if (isFullGraphUpdate(run.data)) {
            break;
        }
    }
    return { datasets, schemas };
}

/** The event's message, followed by its exceptions' messages. */
export function getEventMessage(event: PipelineEvent): string {
    const exceptions =
        event.error?.exceptions?.map((e) => e.message).filter((m): m is string => Boolean(m)) ?? [];
    return [event.message, ...exceptions].filter((m) => m !== undefined).join("\n");
}

const MAX_EVENTS_TO_LOAD = 1000;

/**
 * The datasets of the pipeline's last three updates, for a pipeline that
 * hasn't run in this session, or whose run updated only some tables. At
 * most 1000 events are read. The caller caches the promise until the cache
 * is cleared.
 */
async function preloadDatasets(
    api: ApiClients,
    pipelineId: string,
    signal?: AbortSignal,
): Promise<PipelineDatasetsState> {
    const { updates } = await api
        .get(PipelinesClient)
        .listUpdates({ pipelineId, maxResults: 3 }, calls.read({ signal }));
    if (updates === undefined || updates.length === 0) {
        return { datasets: new Set(), schemas: new Map() };
    }
    const runs = new Map(
        updates.map((u) => [u.updateId ?? "", { data: u, events: [] as PipelineEvent[] }]),
    );
    const oldest = updates
        .map((u) => u.creationTime)
        .filter((t) => t !== undefined)
        .sort((a, b) => Number(a - b))[0];
    let loaded = 0;
    for await (const event of listPipelineEvents(
        api,
        {
            pipelineId,
            orderBy: ["timestamp asc"],
            ...(oldest !== undefined
                ? { filter: `timestamp >= '${new Date(Number(oldest)).toISOString()}'` }
                : {}),
        },
        calls.read({ signal }),
    )) {
        runs.get(event.origin?.updateId ?? "")?.events.push(event);
        if (++loaded >= MAX_EVENTS_TO_LOAD) {
            break;
        }
    }
    return extractPipelineDatasets(runs.values());
}

/**
 * The datasets the explorer shows for each pipeline in this session: those
 * of the session's runs, and those preloaded from earlier updates. The
 * preloaded ones are cleared when the session ends and on each refresh.
 */
export class PipelineDatasets {
    private readonly preloaded = new Map<string, Promise<PipelineDatasetsState>>();

    constructor(
        private readonly runs: (resourceKey: string) => readonly PipelineRun[],
        private readonly api: () => ApiClients | undefined,
    ) {}

    /** From the session's runs of `pipelines.<key>`. */
    fromRuns(resourceKey: string): PipelineDatasetsState {
        return extractPipelineDatasets(this.runs(resourceKey));
    }

    /** Loaded until the cache is cleared; a failed load is tried again next time. */
    preload(resourceKey: string, pipelineId: string): Promise<PipelineDatasetsState | undefined> {
        const api = this.api();
        if (api === undefined) {
            return Promise.resolve(undefined);
        }
        let loading = this.preloaded.get(resourceKey);
        if (loading === undefined) {
            const started = preloadDatasets(api, pipelineId);
            loading = started;
            this.preloaded.set(resourceKey, started);
            // A failure removes only its own entry: a clear may have let a newer load in.
            started.catch(() => {
                if (this.preloaded.get(resourceKey) === started) {
                    this.preloaded.delete(resourceKey);
                }
            });
        }
        return loading;
    }

    clear(): void {
        this.preloaded.clear();
    }
}
