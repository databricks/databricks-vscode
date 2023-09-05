/* eslint-disable @typescript-eslint/naming-convention */
import {ApiClient, jobs} from "@databricks/databricks-sdk";

export class WorkflowRun {
    constructor(
        readonly client: ApiClient,
        private details: jobs.Run
    ) {}

    static async fromId(
        client: ApiClient,
        runId: number
    ): Promise<WorkflowRun> {
        const jobsService = new jobs.JobsService(client);
        return new WorkflowRun(
            client,
            await jobsService.getRun({run_id: runId})
        );
    }

    get lifeCycleState(): jobs.RunLifeCycleState {
        return this.details.state?.life_cycle_state || "INTERNAL_ERROR";
    }

    get state(): jobs.RunState | undefined {
        return this.details.state;
    }

    get tasks(): Array<jobs.RunTask> | undefined {
        return this.details.tasks;
    }

    get runPageUrl(): string {
        return this.details.run_page_url || "";
    }

    async cancel(): Promise<void> {
        const jobsService = new jobs.JobsService(this.client);
        await jobsService.cancelRun({run_id: this.details.run_id!});
    }

    async update(): Promise<void> {
        const jobsService = new jobs.JobsService(this.client);
        this.details = await jobsService.getRun({run_id: this.details.run_id!});
    }

    async getOutput(task?: jobs.RunTask): Promise<jobs.RunOutput> {
        task = task || this.tasks![0];
        if (!task) {
            throw new Error("Run has no tasks");
        }

        const jobsService = new jobs.JobsService(this.client);
        return jobsService.getRunOutput({run_id: task.run_id!});
    }

    async export(task?: jobs.RunTask): Promise<jobs.ExportRunOutput> {
        task = task || this.tasks![0];
        if (
            this.lifeCycleState !== "TERMINATED" &&
            this.lifeCycleState !== "INTERNAL_ERROR"
        ) {
            throw new Error("Run is not terminated");
        }
        if (!this.tasks || !this.tasks.length) {
            throw new Error("Run has no tasks");
        }

        const jobsService = new jobs.JobsService(this.client);
        return await jobsService.exportRun({
            run_id: task.run_id!,
        });
    }
}
