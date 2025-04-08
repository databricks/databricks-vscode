/* eslint-disable @typescript-eslint/naming-convention */
import {ApiClient, CancellationToken, jobs} from "@databricks/databricks-sdk";
import {SubmitRun, SubmitTask} from "@databricks/databricks-sdk/dist/apis/jobs";
import {Waiter} from "@databricks/databricks-sdk/dist/wait";
import {asWaiter} from "@databricks/databricks-sdk/dist/wait";
import {Context} from "@databricks/databricks-sdk/dist/context";
import {
    ApiError,
    ApiRetriableError,
} from "@databricks/databricks-sdk/dist/apis/apiError";
import retry from "@databricks/databricks-sdk/dist/retries/retries";

export class JobsError extends ApiError {
    constructor(method: string, message?: string) {
        super("Jobs", method, message);
    }
}

export class JobsRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("Jobs", method, message);
    }
}

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

    static async getRun2(
        client: ApiClient,
        getRunRequest: jobs.GetRunRequest,
        context?: Context
    ): Promise<Waiter<jobs.Run, jobs.Run>> {
        const cancellationToken = context?.cancellationToken;
        const jobsService = new jobs.JobsService(client);

        const run = await jobsService.getRun(getRunRequest, context);

        return asWaiter(run, async (options) => {
            options = options || {};
            options.onProgress = options.onProgress || (async () => {});
            const {timeout, onProgress} = options;

            return await retry<jobs.Run>({
                timeout,
                fn: async () => {
                    const pollResponse = await this.getRun2(
                        client,
                        {
                            run_id: run.run_id!,
                        },
                        context
                    );
                    if (cancellationToken?.isCancellationRequested) {
                        context?.logger?.error("Jobs.getRunAndWait: cancelled");
                        throw new JobsError("getRunAndWait", "cancelled");
                    }
                    await onProgress(pollResponse);
                    const status = pollResponse.state!.life_cycle_state;
                    const statusMessage = pollResponse.state!.state_message;
                    switch (status) {
                        case "TERMINATED":
                        case "SKIPPED": {
                            return pollResponse;
                        }
                        case "INTERNAL_ERROR": {
                            const errorMessage = `failed to reach TERMINATED or SKIPPED state, got ${status}: ${statusMessage}`;
                            context?.logger?.error(
                                `Jobs.getRunAndWait: ${errorMessage}`
                            );
                            throw new JobsError("getRunAndWait", errorMessage);
                        }
                        default: {
                            const errorMessage = `failed to reach TERMINATED or SKIPPED state, got ${status}: ${statusMessage}`;
                            context?.logger?.error(
                                `Jobs.getRunAndWait: retrying: ${errorMessage}`
                            );
                            throw new JobsRetriableError(
                                "getRunAndWait",
                                errorMessage
                            );
                        }
                    }
                },
            });
        });
    }

    static async submitRun(
        client: ApiClient,
        submitRunRequest: jobs.SubmitRun
    ): Promise<WorkflowRun> {
        const jobsService = new jobs.JobsService(client);
        const res = await jobsService.submit(submitRunRequest);
        return await WorkflowRun.fromId(client, res.run_id!);
    }

    static async runNotebookAndWait({
        client,
        clusterId,
        path,
        parameters = {},
        onProgress,
        token,
    }: {
        client: ApiClient;
        clusterId?: string;
        path: string;
        parameters?: Record<string, string>;
        onProgress?: (state: jobs.RunLifeCycleState, run: WorkflowRun) => void;
        token?: CancellationToken;
    }) {
        const task: SubmitTask = {
            task_key: "js_sdk_job_run",
            notebook_task: {
                notebook_path: path,
                base_parameters: parameters,
            },
            depends_on: [],
            libraries: [],
        };
        if (clusterId) {
            task["existing_cluster_id"] = clusterId;
        }
        const run = await WorkflowRun.submitRun(client, {tasks: [task]});
        await run.wait(onProgress, token);
        return await run.export();
    }

    static async runPythonAndWait({
        client,
        clusterId,
        path,
        args = [],
        onProgress,
        token,
    }: {
        client: ApiClient;
        clusterId?: string;
        path: string;
        args?: string[];
        onProgress?: (state: jobs.RunLifeCycleState, run: WorkflowRun) => void;
        token?: CancellationToken;
    }): Promise<jobs.RunOutput> {
        const task: SubmitTask = {
            task_key: "js_sdk_job_run",
            spark_python_task: {
                python_file: path,
                parameters: args,
            },
        };
        if (clusterId) {
            task["existing_cluster_id"] = clusterId;
        } else {
            task["environment_key"] = "js_sdk_job_run_environment";
        }
        const submitRunOptions: SubmitRun = {tasks: [task]};
        if (task["environment_key"]) {
            submitRunOptions.environments = [
                {environment_key: task["environment_key"], spec: {client: "1"}},
            ];
        }
        const run = await this.submitRun(client, submitRunOptions);
        await run.wait(onProgress, token);
        const output = await run.getOutput();
        onProgress && onProgress(run.lifeCycleState!, run);
        return output;
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

    async wait(
        onProgress?: (state: jobs.RunLifeCycleState, run: WorkflowRun) => void,
        token?: CancellationToken
    ): Promise<void> {
        while (true) {
            if (this.lifeCycleState === "INTERNAL_ERROR") {
                return;
            }
            if (this.lifeCycleState === "TERMINATED") {
                return;
            }
            await new Promise((resolve) => setTimeout(resolve, 3000));
            if (token && token.isCancellationRequested) {
                await this.cancel();
                return;
            }
            await this.update();
            onProgress && onProgress(this.lifeCycleState!, this);
        }
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
