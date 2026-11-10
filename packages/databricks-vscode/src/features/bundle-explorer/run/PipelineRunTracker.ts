import { PipelinesClient, type UpdateInfo } from "@databricks/sdk-pipelines/v2";
import { parsePipelineUpdateId } from "../../../kernel/cli/commands/bundle";
import {
    calls,
    listPipelineEvents,
    type ApiClients,
    type PipelineEvent,
} from "../../../kernel/connection";
import { RunTracker, type TrackerOptions } from "./RunTracker";
import { isPipelineUpdateRunning } from "./runState";

/**
 * Follows a pipeline update that `bundle run` started (BNDL-09): `getUpdate`
 * every 5 seconds, and the update's new events each time. Events come from
 * the SDK, with dataset definitions and source locations patched from the raw
 * response, which the Datasets row and the diagnostics need.
 */
export class PipelineRunTracker extends RunTracker<UpdateInfo> {
    readonly type = "pipelines";
    events?: PipelineEvent[];
    private latestEventTimestamp?: string;

    constructor(
        private readonly api: ApiClients,
        readonly pipelineId: string,
        options: TrackerOptions,
    ) {
        super({ pollMs: 5000, ...options });
    }

    protected parseId(line: string): string | undefined {
        return parsePipelineUpdateId(line);
    }

    protected async poll(signal: AbortSignal): Promise<boolean> {
        const response = await this.api
            .get(PipelinesClient)
            .getUpdate(
                { pipelineId: this.pipelineId, updateId: this.runId! },
                calls.read({ signal }),
            );
        this.data = response.update;
        this.fireChanged();
        const updateId = this.data?.updateId;
        if (updateId !== undefined) {
            const events = await this.newEvents(updateId, signal);
            const latest = events.at(-1)?.timestamp;
            if (latest !== undefined) {
                this.latestEventTimestamp = latest;
            }
            this.events = [...(this.events ?? []), ...events];
            this.fireChanged();
        }
        return !isPipelineUpdateRunning(this.data);
    }

    private async newEvents(updateId: string, signal: AbortSignal): Promise<PipelineEvent[]> {
        let filter = `update_id = '${updateId}'`;
        if (this.latestEventTimestamp !== undefined) {
            filter += ` AND timestamp > '${this.latestEventTimestamp}'`;
        }
        const events: PipelineEvent[] = [];
        for await (const event of listPipelineEvents(
            this.api,
            { pipelineId: this.pipelineId, orderBy: ["timestamp asc"], filter },
            calls.read({ signal }),
        )) {
            events.push(event);
        }
        return events;
    }

    /**
     * `stop` stops the pipeline's latest update, which may not be this one,
     * so it is called only while this update still runs.
     */
    protected async stop(signal: AbortSignal): Promise<void> {
        const client = this.api.get(PipelinesClient);
        const { update } = await client.getUpdate(
            { pipelineId: this.pipelineId, updateId: this.runId! },
            calls.read({ signal }),
        );
        if (isPipelineUpdateRunning(update)) {
            const waiter = await client.stop(
                { pipelineId: this.pipelineId },
                calls.write({ signal }),
            );
            await waiter.wait({ signal });
        }
    }
}
