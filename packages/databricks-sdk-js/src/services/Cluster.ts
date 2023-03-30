/* eslint-disable @typescript-eslint/naming-convention */

import {ApiClient} from "../api-client";
import retry, {LinearRetryPolicy, RetriableError} from "../retries/retries";
import {
    JobsService,
    RunLifeCycleState,
    RunOutput,
    SubmitRun,
} from "../apis/jobs";
import {CancellationToken} from "../types";
import {ExecutionContext} from "./ExecutionContext";
import {WorkflowRun} from "./WorkflowRun";
import {commands, Time, TimeUnits} from "..";
import {
    ClusterInfo,
    ClusterSource,
    ClustersService,
    DataSecurityMode,
    State,
} from "../apis/clusters";
import {Context, context} from "../context";
import {User} from "../apis/scim";
import {ExposedLoggers, withLogContext} from "../logging";
import {PermissionsService} from "../apis/permissions";

export class ClusterRetriableError extends RetriableError {}
export class ClusterError extends Error {}
export class Cluster {
    private clusterApi: ClustersService;
    private _canExecute?: boolean;
    private _hasExecutePerms?: boolean;

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
            `https://${(await this.client.host).host}/#setting/clusters/${
                this.id
            }/configuration`)();
    }

    get driverLogsUrl(): Promise<string> {
        return (async () =>
            `https://${(await this.client.host).host}/#setting/clusters/${
                this.id
            }/driverLogs`)();
    }

    get metricsUrl(): Promise<string> {
        return (async () =>
            `https://${(await this.client.host).host}/#setting/clusters/${
                this.id
            }/metrics`)();
    }

    async getSparkUiUrl(sparkContextId?: string): Promise<string> {
        const host = (await this.client.host).host;

        if (sparkContextId) {
            return `https://${host}/#setting/sparkui/${this.id}/driver-${sparkContextId}`;
        } else {
            return `https://${host}/#setting/clusters/${this.id}/sparkUi`;
        }
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

    get dbrVersion(): Array<number | "x"> {
        const sparkVersion = this.clusterDetails.spark_version!;
        const match = sparkVersion.match(/^(custom:.*?__)?(.*?)-/);
        if (!match) {
            return ["x", "x", "x"];
        }
        const parts = match[2].split(".");
        return [
            parseInt(parts[0], 10) || "x",
            parseInt(parts[1], 10) || "x",
            parseInt(parts[2], 10) || "x",
        ];
    }

    get creator(): string {
        return this.clusterDetails.creator_user_name || "";
    }

    get state(): State {
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
    set details(details: ClusterInfo) {
        this.clusterDetails = details;
    }

    get accessMode():
        | DataSecurityMode
        | "SHARED"
        | "LEGACY_SINGLE_USER_PASSTHROUGH"
        | "LEGACY_SINGLE_USER_STANDARD" {
        //TODO: deprecate data_security_mode once access_mode is available everywhere
        return (
            (this.details as any).access_mode ?? this.details.data_security_mode
        );
    }

    isUc() {
        return ["SINGLE_USER", "SHARED", "USER_ISOLATION"].includes(
            this.accessMode
        );
    }

    isSingleUser() {
        const modeProperty = this.accessMode;

        return (
            modeProperty !== undefined &&
            [
                "SINGLE_USER",
                "LEGACY_SINGLE_USER_PASSTHROUGH",
                "LEGACY_SINGLE_USER_STANDARD",
                //enums unique to data_security_mode
                "LEGACY_SINGLE_USER",
            ].includes(modeProperty)
        );
    }

    isValidSingleUser(userName?: string) {
        return (
            this.isSingleUser() && this.details.single_user_name === userName
        );
    }

    get hasExecutePermsCached() {
        return this._hasExecutePerms;
    }

    async hasExecutePerms(userDetails?: User) {
        if (userDetails === undefined) {
            return (this._hasExecutePerms = false);
        }

        if (this.isSingleUser()) {
            return (this._hasExecutePerms = this.isValidSingleUser(
                userDetails.userName
            ));
        }

        const permissionApi = new PermissionsService(this.client);
        const perms = await permissionApi.get({
            request_object_id: this.id,
            request_object_type: "clusters",
        });

        return (this._hasExecutePerms =
            (perms.access_control_list ?? []).find((ac) => {
                return (
                    ac.user_name === userDetails.userName ||
                    userDetails.groups
                        ?.map((v) => v.display)
                        .includes(ac.group_name ?? "")
                );
            }) !== undefined);
    }

    async refresh() {
        this.details = await this.clusterApi.get({
            cluster_id: this.clusterDetails.cluster_id!,
        });
    }

    async start(
        token?: CancellationToken,
        onProgress: (state: State) => void = () => {}
    ) {
        await this.refresh();
        onProgress(this.state);

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

        // wait for cluster to be stopped before re-starting
        if (this.state === "TERMINATING") {
            await retry<void>({
                timeout: new Time(1, TimeUnits.minutes),
                retryPolicy: new LinearRetryPolicy(
                    new Time(1, TimeUnits.seconds)
                ),
                fn: async () => {
                    if (token?.isCancellationRequested) {
                        return;
                    }
                    await this.refresh();
                    onProgress(this.state);

                    if (this.state === "TERMINATING") {
                        throw new RetriableError();
                    }
                },
            });
            await this.clusterApi.start({
                cluster_id: this.id,
            });
        }

        this._canExecute = undefined;
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
                onProgress: async (clusterInfo) => {
                    this.details = clusterInfo;
                    if (onProgress) {
                        await onProgress(clusterInfo);
                    }
                },
            },
            new Context({cancellationToken: token})
        );
    }

    async createExecutionContext(
        language: commands.Language = "python"
    ): Promise<ExecutionContext> {
        return await ExecutionContext.create(this.client, this, language);
    }

    get canExecuteCached() {
        return this._canExecute;
    }

    @withLogContext(ExposedLoggers.SDK)
    async canExecute(@context ctx?: Context): Promise<boolean> {
        let executionContext: ExecutionContext | undefined;
        try {
            executionContext = await this.createExecutionContext();
            const result = await executionContext.execute("1==1");
            this._canExecute =
                result.result?.results?.resultType === "error" ? false : true;
        } catch (e) {
            ctx?.logger?.error(`Can't execute code on cluster ${this.id}`, e);
            this._canExecute = false;
        } finally {
            if (executionContext) {
                await executionContext.destroy();
            }
        }
        return this._canExecute ?? false;
    }

    static async fromClusterName(
        client: ApiClient,
        clusterName: string
    ): Promise<Cluster | undefined> {
        const clusterApi = new ClustersService(client);
        const clusterList = await clusterApi.list({can_use_client: ""});
        const cluster = clusterList.clusters?.find((cluster) => {
            return cluster.cluster_name === clusterName;
        });
        if (!cluster) {
            return;
        }

        const response = await clusterApi.get({
            cluster_id: cluster.cluster_id!,
        });
        return new Cluster(client, response);
    }

    static async fromClusterId(
        client: ApiClient,
        clusterId: string
    ): Promise<Cluster> {
        const clusterApi = new ClustersService(client);
        const response = await clusterApi.get({cluster_id: clusterId});
        return new Cluster(client, response);
    }

    static async list(client: ApiClient): Promise<Array<Cluster>> {
        const clusterApi = new ClustersService(client);
        const response = await clusterApi.list({can_use_client: ""});

        if (!response.clusters) {
            return [];
        }

        return response.clusters.map((c) => new Cluster(client, c));
    }

    async submitRun(submitRunRequest: SubmitRun): Promise<WorkflowRun> {
        const jobsService = new JobsService(this.client);
        const res = await jobsService.submit(submitRunRequest);
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
                        base_parameters: parameters,
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
