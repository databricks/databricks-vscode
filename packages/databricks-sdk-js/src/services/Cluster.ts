/* eslint-disable @typescript-eslint/naming-convention */

import {ApiClient} from "../api-client";
import {
    ClusterService,
    GetClusterResponse,
    ClusterState,
    ClusterSource,
} from "../apis/cluster";
import {
    GetRunOutputResponse,
    JobsService,
    RunLifeCycleState,
    SubmitRunRequest,
} from "../apis/jobs";
import {CancellationToken} from "../types";
import {ExecutionContext} from "./ExecutionContext";
import {WorkflowRun} from "./WorkflowRun";

export class Cluster {
    private clusterApi: ClusterService;

    constructor(
        private client: ApiClient,
        private clusterDetails: GetClusterResponse
    ) {
        this.clusterApi = new ClusterService(client);
    }

    get id(): string {
        return this.clusterDetails.cluster_id!;
    }

    get name(): string {
        return this.clusterDetails.cluster_name!;
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

    get state(): ClusterState {
        return this.clusterDetails.state!;
    }

    get stateMessage(): string {
        return this.clusterDetails.state_message || "";
    }

    get source(): ClusterSource {
        return this.clusterDetails.cluster_source!;
    }

    get details() {
        return this.clusterDetails;
    }

    async refresh() {
        this.clusterDetails = await this.clusterApi.get({
            cluster_id: this.clusterDetails.cluster_id!,
        });
    }

    async start() {
        await this.clusterApi.start({
            cluster_id: this.clusterDetails.cluster_id!,
        });
    }

    async stop() {
        await this.clusterApi.delete({
            cluster_id: this.clusterDetails.cluster_id!,
        });
    }

    async waitForState(state: ClusterState) {
        while (true) {
            await this.refresh();

            if (this.clusterDetails.state === state) {
                return;
            }

            await new Promise((resolve) => setTimeout(resolve, 3000));
        }
    }

    async createExecutionContext(): Promise<ExecutionContext> {
        return await ExecutionContext.create(this.client, this);
    }

    async canExecute(): Promise<boolean> {
        let context: ExecutionContext | undefined;
        try {
            context = await this.createExecutionContext();
            await context.execute("print('hello')");
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
        let clusterApi = new ClusterService(client);
        let clusterList = await clusterApi.listClusters({});
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
        let clusterApi = new ClusterService(client);
        let response = await clusterApi.get({cluster_id: clusterId});
        return new Cluster(client, response);
    }

    static async list(client: ApiClient): Promise<Array<Cluster>> {
        let clusterApi = new ClusterService(client);
        let response = await clusterApi.listClusters({});

        if (!response.clusters) {
            return [];
        }

        return response.clusters.map((c) => new Cluster(client, c));
    }

    async submitRun(submitRunRequest: SubmitRunRequest): Promise<WorkflowRun> {
        const jobsService = new JobsService(this.client);
        let res = await jobsService.submitRun(submitRunRequest);
        return await WorkflowRun.fromId(this.client, res.run_id!);
    }

    /**
     * Run a notebook as a workflow on a cluster and export result as HTML
     */
    async runNotebookAndWait({
        path,
        onProgress,
        token,
    }: {
        path: string;
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
                    },
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
        onProgress,
        token,
    }: {
        path: string;
        onProgress?: (state: RunLifeCycleState, run: WorkflowRun) => void;
        token?: CancellationToken;
    }): Promise<GetRunOutputResponse> {
        const run = await this.submitRun({
            tasks: [
                {
                    task_key: "js_sdk_job_run",
                    existing_cluster_id: this.id,
                    spark_python_task: {
                        python_file: path,
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
                throw new Error(run.state?.state_message || "");
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
