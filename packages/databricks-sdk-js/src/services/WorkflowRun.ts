/* eslint-disable @typescript-eslint/naming-convention */
import {ApiClient} from "../api-client";
import {
    ExportRunOutput,
    JobsService,
    Run,
    RunLifeCycleState,
    RunOutput,
    RunState,
    RunTask,
} from "../apis/jobs";

export class WorkflowRun {
    constructor(readonly client: ApiClient, private details: Run) {}

    static async fromId(
        client: ApiClient,
        runId: number
    ): Promise<WorkflowRun> {
        const jobsService = new JobsService(client);
        return new WorkflowRun(
            client,
            await jobsService.getRun({run_id: runId})
        );
    }

    get lifeCycleState(): RunLifeCycleState {
        return this.details.state?.life_cycle_state || "INTERNAL_ERROR";
    }

    get state(): RunState | undefined {
        return this.details.state;
    }

    get tasks(): Array<RunTask> | undefined {
        return this.details.tasks;
    }

    get runPageUrl(): string {
        return this.details.run_page_url || "";
    }

    async cancel(): Promise<void> {
        const jobsService = new JobsService(this.client);
        await jobsService.cancelRun({run_id: this.details.run_id!});
    }

    async update(): Promise<void> {
        const jobsService = new JobsService(this.client);
        this.details = await jobsService.getRun({run_id: this.details.run_id!});
    }

    async getOutput(task?: RunTask): Promise<RunOutput> {
        task = task || this.tasks![0];
        if (!task) {
            throw new Error("Run has no tasks");
        }

        const jobsService = new JobsService(this.client);
        return jobsService.getRunOutput({run_id: task.run_id!});
    }

    async export(task?: RunTask): Promise<ExportRunOutput> {
        task = task || this.tasks![0];
        if (this.lifeCycleState !== "TERMINATED") {
            throw new Error("Run is not terminated");
        }
        if (!this.tasks || !this.tasks.length) {
            throw new Error("Run has no tasks");
        }

        const jobsService = new JobsService(this.client);
        return await jobsService.exportRun({
            run_id: this.tasks![0].run_id!,
        });
    }
}
