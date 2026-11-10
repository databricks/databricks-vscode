import { JobsClient, type GetRunResponse } from "@databricks/sdk-jobs/v2";
import { parseJobRunId } from "../../../kernel/cli/commands/bundle";
import { calls, type ApiClients } from "../../../kernel/connection";
import { RunTracker, type TrackerOptions } from "./RunTracker";
import { isJobRunTerminal } from "./runState";

/**
 * Follows a job run that `bundle run` started (BNDL-08). The CLI starts the
 * run itself, so there is no SDK waiter to hold: `getRun` is polled every
 * 3 seconds, as the old `WorkflowRun.wait` did, and each task's state comes
 * with it. The run ends on the states the SDK's waiters end on, `SKIPPED`
 * included; the old tracker kept polling a skipped run.
 */
export class JobRunTracker extends RunTracker<GetRunResponse> {
    readonly type = "jobs";

    constructor(
        private readonly api: ApiClients,
        options: TrackerOptions,
    ) {
        super({ pollMs: 3000, ...options });
    }

    protected parseId(line: string): string | undefined {
        return parseJobRunId(line);
    }

    protected async poll(signal: AbortSignal): Promise<boolean> {
        this.data = await this.api
            .get(JobsClient)
            .getRun({ runId: BigInt(this.runId!) }, calls.read({ signal }));
        this.fireChanged();
        return isJobRunTerminal(this.data);
    }

    protected async stop(signal: AbortSignal): Promise<void> {
        const waiter = await this.api
            .get(JobsClient)
            .cancelRun({ runId: BigInt(this.runId!) }, calls.write({ signal }));
        this.data = await waiter.wait({ signal });
    }
}
