/* eslint-disable @typescript-eslint/naming-convention */

import {ApiClient} from "../api-client";

import * as cluster from "./cluster";
import * as libraries from "./libraries";

//
// Enums.
//

export type Source = "WORKSPACE" | "GIT";

export type ViewType = "NOTEBOOK" | "DASHBOARD";

export type Format = "SINGLE_TASK" | "MULTI_TASK";

export type TriggerType =
    | "PERIODIC"
    | "ONE_TIME"
    | "RETRY"
    | "RUN_JOB_TASK"
    | "FILE_ARRIVAL";

export type SchedulePauseStatus = "UNPAUSED" | "PAUSED";

export type RunLifeCycleState =
    | "PENDING"
    | "RUNNING"
    | "TERMINATING"
    | "TERMINATED"
    | "SKIPPED"
    | "INTERNAL_ERROR"
    | "BLOCKED"
    | "WAITING_FOR_RETRY";

export type RunResultState = "SUCCESS" | "FAILED" | "TIMEDOUT" | "CANCELED";

export type RunType =
    | "JOB_RUN"
    | "WORKFLOW_RUN"
    | "SUBMIT_RUN"
    | "PIPELINE_RUN"
    | "MAINTENANCE_PIPELINE_RUN"
    | "AIRFLOW_RUN";

export type ViewsToExport = "CODE" | "DASHBOARDS" | "ALL";

export type RepairType = "ORIGINAL" | "REPAIR";

export type JobType =
    | "NORMAL"
    | "WORKFLOW"
    | "EPHEMERAL"
    | "PIPELINE"
    | "MAINTENANCE_PIPELINE"
    | "AIRFLOW";

//
// Subtypes used in request/response types.
//

export interface TaskDependency {
    task_key: string;
}

export interface TaskSettings {
    task_key: string;
    depends_on?: Array<TaskDependency>;
    notebook_task?: NotebookTask;
    spark_jar_task?: SparkJarTask;
    spark_python_task?: SparkPythonTask;
    spark_submit_task?: SparkSubmitTask;
    existing_cluster_id?: string;
    new_cluster?: NewCluster;
    libraries?: Array<libraries.Library>;
    max_retries?: number;
    min_retry_interval_millis?: number;
    retry_on_timeout?: boolean;
    timeout_seconds?: number;
    email_notifications?: JobEmailNotifications;
    description?: string;
}

export interface JobTask {
    notebook_task?: NotebookTask;
    spark_jar_task?: SparkJarTask;
    spark_python_task?: SparkPythonTask;
    spark_submit_task?: SparkSubmitTask;
}

export interface NotebookTask {
    notebook_path: string;
    base_parameters?: Array<ParamPair>;
    source?: Source;
}

export interface NotebookOutput {
    result?: string;
    truncated?: boolean;
}

export interface ViewItem {
    content?: string;
    name?: string;
    type?: ViewType;
}

export interface SparkJarTask {
    jar_uri?: string;
    main_class_name?: string;
    parameters?: Array<string>;
}

export interface SparkPythonTask {
    python_file: string;
    parameters?: Array<string>;
}

export interface SparkSubmitTask {
    parameters?: Array<string>;
}

export interface ParamPair {
    key?: string;
    value?: string;
}

export interface ClusterSpec {
    existing_cluster_id?: string;
    new_cluster?: NewCluster;
    libraries?: Array<libraries.Library>;
}

export interface NewCluster {
    cluster_name?: string;
    spark_version?: string;
    spark_conf?: Array<cluster.SparkConfPair>;
    aws_attributes?: cluster.AwsAttributes;
    azure_attributes?: cluster.AzureAttributes;
    gcp_attributes?: cluster.GcpAttributes;
    node_type_id?: string;
    driver_node_type_id?: string;
    ssh_public_keys?: Array<string>;
    custom_tags?: Array<cluster.ClusterTag>;
    cluster_log_conf?: cluster.ClusterLogConf;
    spark_env_vars?: Array<cluster.SparkEnvPair>;
    autotermination_minutes?: number;
    enable_elastic_disk?: boolean;
    cluster_source?: cluster.ClusterSource;
    instance_pool_id?: string;
    policy_id?: string;
    enable_local_disk_encryption?: boolean;
    driver_instance_pool_id?: string;
    num_workers?: number;
    autoscale?: cluster.AutoScale;
    apply_policy_default_values?: boolean;
}

export interface ClusterInstance {
    cluster_id?: string;
    spark_context_id?: string;
}

export interface JobCluster {
    job_cluster_key: string;
    new_cluster: NewCluster;
}

export interface GitSource {
    git_url: string;
    git_provider: string;
    git_branch?: string;
    git_tag?: string;
    git_commit?: string;
}

export interface JobEmailNotifications {
    on_start?: Array<string>;
    on_success?: Array<string>;
    on_failure?: Array<string>;
    no_alert_for_skipped_runs?: boolean;
}

export interface CronSchedule {
    quartz_cron_expression: string;
    timezone_id: string;
    pause_status?: SchedulePauseStatus;
}

export interface RunTaskSettings {
    task_key?: string;
    description?: string;
    depends_on?: Array<TaskDependency>;
    notebook_task?: NotebookTask;
    spark_jar_task?: SparkJarTask;
    spark_python_task?: SparkPythonTask;
    spark_submit_task?: SparkSubmitTask;
    existing_cluster_id?: string;
    new_cluster?: NewCluster;
    libraries?: Array<libraries.Library>;
    timeout_seconds?: number;
}

export interface RunTask {
    run_id?: number;
    task_key?: string;
    description?: string;
    depends_on?: Array<TaskDependency>;
    notebook_task?: NotebookTask;
    spark_jar_task?: SparkJarTask;
    spark_python_task?: SparkPythonTask;
    spark_submit_task?: SparkSubmitTask;
    existing_cluster_id?: string;
    new_cluster?: NewCluster;
    libraries?: Array<libraries.Library>;
    timeout_seconds?: number;
    state?: RunState;
    run_page_url?: string;
    start_time?: number;
    setup_duration?: number;
    execution_duration?: number;
    cleanup_duration?: number;
    end_time?: number;
    cluster_instance?: ClusterInstance;
    attempt_number?: number;
    git_source?: GitSource;
}

export interface RunState {
    life_cycle_state?: RunLifeCycleState;
    result_state?: RunResultState;
    state_message?: string;
}

export interface Run {
    job_id?: number;
    run_id?: number;
    creator_user_name?: string;
    number_in_job?: number;
    original_attempt_run_id?: number;
    state?: RunState;
    schedule?: CronSchedule;
    task?: JobTask;
    cluster_spec?: ClusterSpec;
    cluster_instance?: ClusterInstance;
    overriding_parameters?: RunParameters;
    start_time?: number;
    setup_duration?: number;
    execution_duration?: number;
    cleanup_duration?: number;
    end_time?: number;
    trigger?: TriggerType;
    run_name?: string;
    run_page_url?: string;
    run_type?: RunType;
    tasks?: Array<RunTask>;
    task_key?: string;
    description?: string;
    attempt_number?: number;
    job_clusters?: Array<JobCluster>;
    format?: Format;
    git_source?: GitSource;
    repair_history?: Array<Repair>;
    task_value_count?: number;
}

export interface RunParameters {
    jar_params?: Array<string>;
    notebook_params?: Array<ParamPair>;
    python_params?: Array<string>;
    spark_submit_params?: Array<string>;
    python_named_params?: Array<ParamPair>;
}

export interface Repair {
    type?: RepairType;
    start_time?: number;
    end_time?: number;
    tasks?: Array<number>;
    state?: RunState;
    id?: number;
    task_run_ids?: Array<number>;
}

export interface JobTag {
    key: string;
    value?: string;
}

export interface JobSettings {
    name?: string;
    existing_cluster_id?: string;
    new_cluster?: NewCluster;
    libraries?: Array<libraries.Library>;
    email_notifications?: JobEmailNotifications;
    timeout_seconds?: number;
    max_retries?: number;
    min_retry_interval_millis?: number;
    retry_on_timeout?: boolean;
    schedule?: CronSchedule;
    notebook_task?: NotebookTask;
    spark_jar_task?: SparkJarTask;
    spark_python_task?: SparkPythonTask;
    spark_submit_task?: SparkSubmitTask;
    max_concurrent_runs?: number;
    tasks?: Array<TaskSettings>;
    job_clusters?: Array<JobCluster>;
    git_source?: GitSource;
    tags?: Array<JobTag>;
    format?: Format;
}

export interface Job {
    job_id?: number;
    creator_user_name?: string;
    run_as_user_name?: string;
    settings?: JobSettings;
    created_time?: number;
}

//
// Request/response types.
//

export interface CreateJobRequest {
    name?: string;
    existing_cluster_id?: string;
    new_cluster?: NewCluster;
    libraries?: Array<libraries.Library>;
    email_notifications?: JobEmailNotifications;
    timeout_seconds?: number;
    max_retries?: number;
    min_retry_interval_millis?: number;
    retry_on_timeout?: boolean;
    schedule?: CronSchedule;
    notebook_task?: NotebookTask;
    spark_jar_task?: SparkJarTask;
    spark_python_task?: SparkPythonTask;
    spark_submit_task?: SparkSubmitTask;
    max_concurrent_runs?: number;
    tasks?: Array<TaskSettings>;
    job_clusters?: Array<JobCluster>;
    git_source?: GitSource;
    tags?: Array<JobTag>;
    format?: Format;
}

export interface CreateJobResponse {
    job_id?: number;
}

export interface SubmitRunRequest {
    run_name?: string;
    existing_cluster_id?: string;
    new_cluster?: NewCluster;
    libraries?: Array<libraries.Library>;
    notebook_task?: NotebookTask;
    spark_jar_task?: SparkJarTask;
    spark_python_task?: SparkPythonTask;
    spark_submit_task?: SparkSubmitTask;
    timeout_seconds?: number;
    idempotency_token?: string;
    tasks?: Array<RunTaskSettings>;
    job_clusters?: Array<JobCluster>;
    git_source?: GitSource;
}

export interface SubmitRunResponse {
    run_id?: number;
}

export interface ResetJobRequest {
    job_id: number;
    new_settings: JobSettings;
}

export interface ResetJobResponse {}

export interface DeleteJobRequest {
    job_id: number;
}

export interface DeleteJobResponse {}

export interface GetJobRequest {
    job_id: number;
}

export interface GetJobResponse {
    job_id?: number;
    creator_user_name?: string;
    run_as_user_name?: string;
    settings?: JobSettings;
    created_time?: number;
}

export interface ListJobsRequest {
    job_type?: JobType;
    offset?: number;
    limit?: number;
    expand_tasks?: boolean;
}

export interface ListJobsResponse {
    jobs?: Array<Job>;
    has_more?: boolean;
}

export interface RunNowRequest {
    job_id?: number;
    jar_params?: Array<string>;
    notebook_params?: Array<ParamPair>;
    python_params?: Array<string>;
    spark_submit_params?: Array<string>;
    python_named_params?: Array<ParamPair>;
    idempotency_token?: string;
}

export interface RunNowResponse {
    run_id?: number;
    number_in_job?: number;
}

export interface RepairRunRequest {
    run_id: number;
    latest_repair_id?: number;
    rerun_tasks?: Array<string>;
    jar_params?: Array<string>;
    notebook_params?: Array<ParamPair>;
    python_params?: Array<string>;
    spark_submit_params?: Array<string>;
    python_named_params?: Array<ParamPair>;
}

export interface RepairRunResponse {
    repair_id?: number;
}

export interface ListRunsRequest {
    job_id?: number;
    active_only?: boolean;
    completed_only?: boolean;
    offset?: number;
    limit?: number;
    run_type?: RunType;
    expand_tasks?: boolean;
    start_time_from?: number;
    start_time_to?: number;
}

export interface ListRunsResponse {
    runs?: Array<Run>;
    has_more?: boolean;
}

export interface GetRunRequest {
    run_id?: number;
    include_history?: boolean;
}

export interface GetRunResponse {
    job_id?: number;
    run_id?: number;
    creator_user_name?: string;
    number_in_job?: number;
    original_attempt_run_id?: number;
    state?: RunState;
    schedule?: CronSchedule;
    task?: JobTask;
    cluster_spec?: ClusterSpec;
    cluster_instance?: ClusterInstance;
    overriding_parameters?: RunParameters;
    start_time?: number;
    setup_duration?: number;
    execution_duration?: number;
    cleanup_duration?: number;
    end_time?: number;
    trigger?: TriggerType;
    run_name?: string;
    run_page_url?: string;
    run_type?: RunType;
    tasks?: Array<RunTask>;
    task_key?: string;
    description?: string;
    attempt_number?: number;
    job_clusters?: Array<JobCluster>;
    format?: Format;
    git_source?: GitSource;
    repair_history?: Array<Repair>;
    task_value_count?: number;
}

export interface DeleteRunRequest {
    run_id?: number;
}

export interface DeleteRunResponse {}

export interface CancelRunRequest {
    run_id: number;
}

export interface CancelRunResponse {}

export interface GetRunOutputRequest {
    run_id: number;
}

export interface GetRunOutputResponse {
    metadata?: Run;
    error?: string;
    logs?: string;
    logs_truncated?: boolean;
    error_trace?: string;
    notebook_output?: NotebookOutput;
}

export interface ExportRunRequest {
    run_id: number;
    views_to_export?: ViewsToExport;
}

export interface ExportRunResponse {
    views?: Array<ViewItem>;
}

export class JobsService {
    readonly client: ApiClient;

    constructor(client: ApiClient) {
        this.client = client;
    }

    async createJob(request: CreateJobRequest): Promise<CreateJobResponse> {
        return (await this.client.request(
            "/api/2.1/jobs/create",
            "POST",
            request
        )) as CreateJobResponse;
    }

    async submitRun(request: SubmitRunRequest): Promise<SubmitRunResponse> {
        return (await this.client.request(
            "/api/2.1/jobs/runs/submit",
            "POST",
            request
        )) as SubmitRunResponse;
    }

    async resetJob(request: ResetJobRequest): Promise<ResetJobResponse> {
        return (await this.client.request(
            "/api/2.1/jobs/reset",
            "POST",
            request
        )) as ResetJobResponse;
    }

    async deleteJob(request: DeleteJobRequest): Promise<DeleteJobResponse> {
        return (await this.client.request(
            "/api/2.1/jobs/delete",
            "POST",
            request
        )) as DeleteJobResponse;
    }

    async getJob(request: GetJobRequest): Promise<GetJobResponse> {
        return (await this.client.request(
            "/api/2.1/jobs/get",
            "GET",
            request
        )) as GetJobResponse;
    }

    async list(request: ListJobsRequest): Promise<ListJobsResponse> {
        return (await this.client.request(
            "/api/2.1/jobs/list",
            "GET",
            request
        )) as ListJobsResponse;
    }

    async runNow(request: RunNowRequest): Promise<RunNowResponse> {
        return (await this.client.request(
            "/api/2.1/jobs/run-now",
            "POST",
            request
        )) as RunNowResponse;
    }

    async repair(request: RepairRunRequest): Promise<RepairRunResponse> {
        return (await this.client.request(
            "/api/2.1/jobs/runs/repair",
            "POST",
            request
        )) as RepairRunResponse;
    }

    async listRuns(request: ListRunsRequest): Promise<ListRunsResponse> {
        return (await this.client.request(
            "/api/2.1/jobs/runs/list",
            "GET",
            request
        )) as ListRunsResponse;
    }

    async getRun(request: GetRunRequest): Promise<GetRunResponse> {
        return (await this.client.request(
            "/api/2.1/jobs/runs/get",
            "GET",
            request
        )) as GetRunResponse;
    }

    async deleteRun(request: DeleteRunRequest): Promise<DeleteRunResponse> {
        return (await this.client.request(
            "/api/2.1/jobs/runs/delete",
            "POST",
            request
        )) as DeleteRunResponse;
    }

    async cancelRun(request: CancelRunRequest): Promise<CancelRunResponse> {
        return (await this.client.request(
            "/api/2.1/jobs/runs/cancel",
            "POST",
            request
        )) as CancelRunResponse;
    }

    async getRunOutput(
        request: GetRunOutputRequest
    ): Promise<GetRunOutputResponse> {
        return (await this.client.request(
            "/api/2.1/jobs/runs/get-output",
            "GET",
            request
        )) as GetRunOutputResponse;
    }

    async exportRun(request: ExportRunRequest): Promise<ExportRunResponse> {
        return (await this.client.request(
            "/api/2.1/jobs/runs/export",
            "GET",
            request
        )) as ExportRunResponse;
    }
}
