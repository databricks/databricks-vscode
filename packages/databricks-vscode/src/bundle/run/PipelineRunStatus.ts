/* eslint-disable @typescript-eslint/naming-convention */
import {BundleRunStatus} from "./BundleRunStatus";
import {AuthProvider} from "../../configuration/auth/AuthProvider";
import {onError} from "../../utils/onErrorDecorator";
import {
    logging,
    pipelines,
    retry,
    Time,
    TimeUnits,
    WorkspaceClient,
} from "@databricks/databricks-sdk";
import {
    LinearRetryPolicy,
    RetriableError,
} from "@databricks/databricks-sdk/dist/retries/retries";
import {Loggers} from "../../logger";

function isRunning(status?: pipelines.UpdateInfoState) {
    if (status === undefined) {
        return false;
    }
    return !["COMPLETED", "FAILED", "CANCELED"].includes(status);
}

export class PipelineRunStatus extends BundleRunStatus {
    public readonly type = "pipelines";
    public data: pipelines.UpdateInfo | undefined;
    public events: pipelines.PipelineEvent[] | undefined;

    private logger = logging.NamedLogger.getOrCreate(Loggers.Extension);
    private latestEventTimestamp: string | undefined;

    constructor(
        private readonly authProvider: AuthProvider,
        private readonly pipelineId: string
    ) {
        super();
    }

    parseId(output: string): void {
        if (this.runId !== undefined || this.runState !== "unknown") {
            return;
        }
        output = output.trim();
        const match = output.match(/.*https:\/\/.*\/updates\/(.*)$/);
        if (match === null) {
            return;
        }
        this.runId = match[1];

        this.startPolling();
    }

    @onError({
        popup: {prefix: "Failed to check the run status for the pipeline."},
    })
    private async startPolling() {
        if (this.runState !== "unknown") {
            return;
        }

        const runId = this.runId;
        if (runId === undefined) {
            throw new Error("No update id");
        }

        this.runState = "running";

        try {
            await retry({
                timeout: new Time(48, TimeUnits.hours),
                retryPolicy: new LinearRetryPolicy(
                    new Time(5, TimeUnits.seconds)
                ),
                fn: async () => {
                    if (this.runState !== "running") {
                        return;
                    }
                    try {
                        await this.updateRunData(runId);
                    } catch (e) {
                        this.logger.error("Failed to fetch run state:", e);
                        throw new RetriableError();
                    }
                    if (isRunning(this.data?.state)) {
                        throw new RetriableError();
                    } else {
                        this.runState = "completed";
                    }
                },
            });
        } catch (e) {
            this.runState = "error";
            throw e;
        }
    }

    private async updateRunData(runId: string) {
        const client = await this.authProvider.getWorkspaceClient();
        const getUpdateResponse = await client.pipelines.getUpdate({
            pipeline_id: this.pipelineId,
            update_id: runId,
        });
        this.data = getUpdateResponse.update;
        this.onDidChangeEmitter.fire();
        if (this.data?.update_id !== undefined) {
            const events = await this.fetchUpdateEvents(
                client,
                this.data?.update_id,
                this.latestEventTimestamp
            );
            const latestEvent = events[events.length - 1];
            if (latestEvent?.timestamp !== undefined) {
                this.latestEventTimestamp = latestEvent.timestamp;
            }
            this.events = this.events?.concat(events) ?? events;
            this.onDidChangeEmitter.fire();
        }
    }

    private async fetchUpdateEvents(
        client: WorkspaceClient,
        updateId: string | undefined,
        latestEventTimestamp: string | undefined
    ) {
        const events = [];
        let filter = `update_id = '${updateId}'`;
        if (latestEventTimestamp !== undefined) {
            filter += ` AND timestamp > '${latestEventTimestamp}'`;
        }
        const listEvents = client.pipelines.listPipelineEvents({
            pipeline_id: this.pipelineId,
            order_by: ["timestamp asc"],
            filter,
        });
        for await (const event of listEvents) {
            events.push(event);
        }
        return events;
    }

    async cancel() {
        if (this.runState !== "running" || this.runId === undefined) {
            this.runState = "cancelled";
            return;
        }

        this.runState = "cancelling";
        try {
            const client = await this.authProvider.getWorkspaceClient();
            const update = await client.pipelines.getUpdate({
                pipeline_id: this.pipelineId,
                update_id: this.runId,
            });
            // Only stop the pipeline if the tracked update is still running. The stop API stops the
            // latest update, which might not be the tracked update.
            if (isRunning(update.update?.state)) {
                const stopRequest = await client.pipelines.stop({
                    pipeline_id: this.pipelineId,
                });
                await stopRequest.wait();
            }
            await this.updateRunData(this.runId);
            this.runState = "cancelled";
        } catch (e) {
            this.logger.error("Failed to cancel pipeline run", e);
            this.runState = "error";
            throw e;
        }
    }
}
