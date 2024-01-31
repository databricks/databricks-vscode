/* eslint-disable @typescript-eslint/naming-convention */
import {BundleRunStatus} from "./BundleRunStatus";
import {AuthProvider} from "../../configuration/auth/AuthProvider";
import {onError} from "../../utils/onErrorDecorator";
import {UpdateInfoState} from "@databricks/databricks-sdk/dist/apis/pipelines";

function isRunning(status?: UpdateInfoState) {
    if (status === undefined) {
        return false;
    }
    return !["COMPLETED", "FAILED", "CANCELED"].includes(status);
}

export class PipelineRunStatus extends BundleRunStatus {
    readonly type = "pipelines";
    private interval?: NodeJS.Timeout;

    constructor(
        private readonly authProvider: AuthProvider,
        private readonly pipelineId: string
    ) {
        super();
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

        const client = this.authProvider.getWorkspaceClient();
        this.runState = "running";

        this.interval = setInterval(async () => {
            try {
                if (this.runId === undefined) {
                    throw new Error("No update id");
                }
                const update = await client.pipelines.getUpdate({
                    pipeline_id: this.pipelineId,
                    update_id: this.runId,
                });
                this.data = update;

                // If update is completed, we stop polling.
                if (!isRunning(update.update?.state)) {
                    this.markCompleted();
                    return;
                }

                this.onDidChangeEmitter.fire();
            } catch (e) {
                this.runState = "error";
                throw e;
            }
        }, 5_000);
    }

    private markCompleted() {
        if (this.interval !== undefined) {
            clearInterval(this.interval);
            this.interval = undefined;
        }
        this.runState = "completed";
    }

    async cancel() {
        if (this.runState !== "running" || this.runId === undefined) {
            this.markCompleted();
            return;
        }

        const client = this.authProvider.getWorkspaceClient();
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
        this.markCompleted();
    }
}
