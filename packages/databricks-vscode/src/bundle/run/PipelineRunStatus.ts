/* eslint-disable @typescript-eslint/naming-convention */
import {BundleRunStatus} from "./BundleRunStatus";
import {AuthProvider} from "../../configuration/auth/AuthProvider";
import {onError} from "../../utils/onErrorDecorator";
import {pipelines, WorkspaceClient} from "@databricks/databricks-sdk";

function isRunning(status?: pipelines.UpdateInfoState) {
    if (status === undefined) {
        return false;
    }
    return !["COMPLETED", "FAILED", "CANCELED"].includes(status);
}

export class PipelineRunStatus extends BundleRunStatus {
    public readonly type = "pipelines";
    public data: pipelines.GetUpdateResponse | undefined;
    public events: pipelines.PipelineEvent[] | undefined;

    private interval?: NodeJS.Timeout;

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

        if (this.runId === undefined) {
            throw new Error("No update id");
        }

        const client = await this.authProvider.getWorkspaceClient();
        this.runState = "running";

        this.interval = setInterval(async () => {
            try {
                if (this.runId === undefined) {
                    throw new Error("No update id");
                }
                this.data = await client.pipelines.getUpdate({
                    pipeline_id: this.pipelineId,
                    update_id: this.runId,
                });

                if (this.data.update?.creation_time !== undefined) {
                    this.events = await this.fetchUpdateEvents(
                        client,
                        this.data.update.creation_time,
                        this.data.update.update_id
                    );
                }

                // If update is completed, we stop polling.
                if (!isRunning(this.data.update?.state)) {
                    this.markCompleted();
                } else {
                    this.onDidChangeEmitter.fire();
                }
            } catch (e) {
                this.runState = "error";
                throw e;
            }
        }, 5_000);
    }

    private async fetchUpdateEvents(
        client: WorkspaceClient,
        creationTime: number,
        updateId?: string
    ) {
        const events = [];
        const timestamp = new Date(creationTime).toISOString();
        const listEvents = client.pipelines.listPipelineEvents({
            pipeline_id: this.pipelineId,
            order_by: ["timestamp asc"],
            filter: `timestamp >= '${timestamp}'`,
        });
        for await (const event of listEvents) {
            if (!updateId || event.origin?.update_id === updateId) {
                events.push(event);
            }
        }
        return events;
    }

    private markCompleted() {
        if (this.interval !== undefined) {
            clearInterval(this.interval);
            this.interval = undefined;
        }
        this.runState = "completed";
    }

    private markCancelled() {
        if (this.interval !== undefined) {
            clearInterval(this.interval);
            this.interval = undefined;
        }
        this.runState = "cancelled";
    }

    async cancel() {
        if (this.runState !== "running" || this.runId === undefined) {
            this.markCancelled();
            return;
        }

        const client = await this.authProvider.getWorkspaceClient();
        const update = await client.pipelines.getUpdate({
            pipeline_id: this.pipelineId,
            update_id: this.runId,
        });
        // Only stop the pipeline if the tracked update is still running. The stop API stops the
        // latest update, which might not be the tracked update.
        if (isRunning(update.update?.state)) {
            await (
                await client.pipelines.stop({
                    pipeline_id: this.pipelineId,
                })
            ).wait();
        }
        this.data = await client.pipelines.getUpdate({
            pipeline_id: this.pipelineId,
            update_id: this.runId,
        });
        this.markCancelled();
    }
}
