/* eslint-disable @typescript-eslint/naming-convention */
import {
    JobsError,
    JobsRetriableError,
    Run,
} from "@databricks/databricks-sdk/dist/apis/jobs";
import {Event, EventEmitter} from "vscode";
import {AuthProvider} from "../../configuration/auth/AuthProvider";
import {onError} from "../../utils/onErrorDecorator";
import {BundleRunStatus} from "./BundleRunStatus";
import {Time, TimeUnits} from "@databricks/databricks-sdk";

export class JobRunStatus extends BundleRunStatus {
    readonly type = "jobs";
    data: Run | undefined;
    private readonly onDidCompleteEmitter = new EventEmitter<void>();
    onDidComplete: Event<void> = this.onDidCompleteEmitter.event;

    constructor(private readonly authProvider: AuthProvider) {
        super();
    }

    parseId(output: string) {
        if (this.runId !== undefined || this.runState !== "unknown") {
            return;
        }
        const match = output.match(/.*\/run\/(\d*).*/);
        if (match === null) {
            return;
        }
        this.runId = match[1];

        this.startPolling();
    }

    @onError({popup: {prefix: "Failed to check the run status for the job."}})
    private async startPolling() {
        if (this.runState !== "unknown") {
            return;
        }

        if (this.runId === undefined) {
            throw new Error("No run id found");
        }

        const client = await this.authProvider.getWorkspaceClient();
        try {
            this.runState = "running";
            await (
                await client.jobs.getRun({run_id: parseInt(this.runId)})
            ).wait({
                timeout: new Time(48, TimeUnits.hours),
                onProgress: async (progress) => {
                    this.data = progress;
                    this.onDidChangeEmitter.fire();
                },
            });
        } catch (e) {
            this.runState = "error";
            if (e instanceof JobsError || e instanceof JobsRetriableError) {
                // On progress is already fired for these status updates. We let the listeners handle it.
                return;
            }
            throw e;
        }
        this.runState = "completed";
    }

    async cancel(): Promise<void> {
        if (this.runId === undefined || this.runState !== "running") {
            this.runState = "cancelled";
            return;
        }

        this.runState = "cancelling";
        const client = await this.authProvider.getWorkspaceClient();
        await (
            await client.jobs.cancelRun({run_id: parseInt(this.runId)})
        ).wait();
        this.runState = "cancelled";
    }
}
