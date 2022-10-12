/* eslint-disable @typescript-eslint/naming-convention */

import {ApiClient} from "../api-client";
import retry, {RetriableError} from "../retries/retries";
import {
    JobsService,
    RunLifeCycleState,
    RunOutput,
    SubmitRun,
} from "../apis/jobs";
import {CancellationToken} from "../types";
import {ExecutionContext} from "./ExecutionContext";
import {WorkflowRun} from "./WorkflowRun";
import {commands} from "..";
import {
    ClusterInfo,
    ClustersService,
    ClusterInfoState,
    ClusterInfoClusterSource,
} from "../apis/clusters";

export class ClusterRetriableError extends RetriableError {}
export class ClusterError extends Error {}
export class Cluster {
    private clusterApi: ClustersService;

    constructor(
        private client: ApiClient,
        private clusterDetails: ClusterInfo
    ) {
        this.clusterApi = new ClustersService(client);
    }

    get id(): string {
        return this.clusterDetails.cluster_id!;
    }

    get name(): string {
        return this.clusterDetails.cluster_name!;
    }

    get url(): Promise<string> {
        return (async () =>
            `${(await this.client.host).host}/#setting/clusters/${
                this.id
            }/configuration`)();
    }

    get memoryMb(): number | undefined {
        return this.clusterDetails.cluster_memory_mb;
    }

    get cores(): number | undefined {
        return this.clusterDetails.cluster_cores;
    }

    get sparkVersion(): string {
        return this.clusterDetails.spark_version!;
    }

    get creator(): string {
        return this.clusterDetails.creator_user_name || "";
    }

    get state(): ClusterInfoState {
        return this.clusterDetails.state!;
    }

    get stateMessage(): string {
        return this.clusterDetails.state_message || "";
    }

    get source(): ClusterInfoClusterSource {
        return this.clusterDetails.cluster_source!;
    }

    get details() {
        return this.clusterDetails;
    }
    set details(details: ClusterInfo) {
        this.clusterDetails = details;
    }

    async refresh() {
        this.details = await this.clusterApi.get({
            cluster_id: this.clusterDetails.cluster_id!,
        });
    }

    async start(
        token?: CancellationToken,
        onProgress: (state: ClusterInfoState) => void = (state) => {}
    ) {
        await this.refresh();
        if (this.state === "RUNNING") {
            return;
        }

        if (
            this.state === "TERMINATED" ||
            this.state === "ERROR" ||
            this.state === "UNKNOWN"
        ) {
            await this.clusterApi.start({
                cluster_id: this.id,
            });
        }

        await retry({
            fn: async () => {
                if (token?.isCancellationRequested) {
                    return;
                }

                await this.refresh();
                onProgress(this.state);

                switch (this.state) {
                    case "RUNNING":
                        return;
                    case "TERMINATED":
                        throw new ClusterError(
                            `Cluster[${
                                this.name
                            }]: CurrentState - Terminated; Reason - ${JSON.stringify(
                                this.clusterDetails.termination_reason
                            )}`
                        );
                    case "ERROR":
                        throw new ClusterError(
                            `Cluster[${this.name}]: Error in starting the cluster (${this.clusterDetails.state_message})`
                        );
                    default:
                        throw new ClusterRetriableError(
                            `Cluster[${this.name}]: CurrentState - ${this.state}; Reason - ${this.clusterDetails.state_message}`
                        );
                }
            },
        });
    }

    async stop(
        token?: CancellationToken,
        onProgress?: (newPollResponse: ClusterInfo) => Promise<void>
    ) {
        this.details = await this.clusterApi.deleteAndWait(
            {
                cluster_id: this.id,
            },
            {
                cancellationToken: token,
                onProgress: async (clusterInfo) => {
                    this.details = clusterInfo;
                    if (onProgress) {
                        await onProgress(clusterInfo);
                    }
                },
            }
        );
    }

    async createExecutionContext(
        language: commands.Language = "python"
    ): Promise<ExecutionContext> {
        return await ExecutionContext.create(this.client, this, language);
    }

    async canExecute(): Promise<boolean> {
        let context: ExecutionContext | undefined;
        try {
            context = await this.createExecutionContext();
            let result = await context.execute("print('hello')");
            if (result.result?.results?.resultType === "error") {
                return false;
            }
            return true;
        } catch (e) {
            return false;
        } finally {
            if (context) {
                await context.destroy();
            }
        }
    }

    static async fromClusterName(
        client: ApiClient,
        clusterName: string
    ): Promise<Cluster | undefined> {
        let clusterApi = new ClustersService(client);
        let clusterList = await clusterApi.list({can_use_client: ""});
        let cluster = clusterList.clusters?.find((cluster) => {
            return cluster.cluster_name === clusterName;
        });
        if (!cluster) {
            return;
        }

        let response = await clusterApi.get({cluster_id: cluster.cluster_id!});
        return new Cluster(client, response);
    }

    static async fromClusterId(
        client: ApiClient,
        clusterId: string
    ): Promise<Cluster> {
        let clusterApi = new ClustersService(client);
        let response = await clusterApi.get({cluster_id: clusterId});
        return new Cluster(client, response);
    }

    static async list(client: ApiClient): Promise<Array<Cluster>> {
        let clusterApi = new ClustersService(client);
        let response = await clusterApi.list({can_use_client: ""});

        if (!response.clusters) {
            return [];
        }

        return response.clusters.map((c) => new Cluster(client, c));
    }

    async submitRun(submitRunRequest: SubmitRun): Promise<WorkflowRun> {
        const jobsService = new JobsService(this.client);
        let res = await jobsService.submit(submitRunRequest);
        return await WorkflowRun.fromId(this.client, res.run_id!);
    }

    /**
     * Run a notebook as a workflow on a cluster and export result as HTML
     */
    async runNotebookAndWait({
        path,
        parameters = {},
        onProgress,
        token,
    }: {
        path: string;
        parameters?: Record<string, string>;
        onProgress?: (state: RunLifeCycleState, run: WorkflowRun) => void;
        token?: CancellationToken;
    }) {
        const run = await this.submitRun({
            tasks: [
                {
                    task_key: "js_sdk_job_run",
                    existing_cluster_id: this.id,
                    notebook_task: {
                        notebook_path: path,
                        base_parameters: Object.keys(parameters).map((key) => {
                            return {
                                key,
                                value: parameters[key],
                            };
                        }),
                    },
                    depends_on: [],
                    libraries: [],
                },
            ],
        });

        await this.waitForWorkflowCompletion(run, onProgress, token);
        return await run.export();
    }

    /**
     * Run a python file as a workflow on a cluster
     */
    async runPythonAndWait({
        path,
        args = [],
        onProgress,
        token,
    }: {
        path: string;
        args?: string[];
        onProgress?: (state: RunLifeCycleState, run: WorkflowRun) => void;
        token?: CancellationToken;
    }): Promise<RunOutput> {
        const run = await this.submitRun({
            tasks: [
                {
                    task_key: "js_sdk_job_run",
                    existing_cluster_id: this.id,
                    spark_python_task: {
                        python_file: path,
                        parameters: args,
                    },
                },
            ],
        });

        await this.waitForWorkflowCompletion(run, onProgress, token);
        return await run.getOutput();
    }

    private async waitForWorkflowCompletion(
        run: WorkflowRun,
        onProgress?: (state: RunLifeCycleState, run: WorkflowRun) => void,
        token?: CancellationToken
    ): Promise<void> {
        while (true) {
            if (run.lifeCycleState === "INTERNAL_ERROR") {
                return;
            }
            if (run.lifeCycleState === "TERMINATED") {
                return;
            }

            await new Promise((resolve) => setTimeout(resolve, 3000));

            if (token && token.isCancellationRequested) {
                await run.cancel();
                return;
            }

            await run.update();
            onProgress && onProgress(run.lifeCycleState!, run);
        }
    }
}
