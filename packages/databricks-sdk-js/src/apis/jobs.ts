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

export type JobPermission =
    | "CAN_VIEW"
    | "CAN_MANAGE_RUN"
    | "IS_OWNER"
    | "CAN_MANAGE";

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

//
// Subtypes used in request/response types.
//

export interface TaskDependency {
    task_key: string;
}

export interface TaskSettings {
    notebook_task?: NotebookTask;
    spark_jar_task?: SparkJarTask;
    spark_python_task?: SparkPythonTask;
    spark_submit_task?: SparkSubmitTask;
    existing_cluster_id?: string;
    new_cluster?: NewCluster;
    task_key: string;
    depends_on?: Array<TaskDependency>;
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
    num_workers?: number;
    autoscale?: cluster.AutoScale;
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
    workload_type?: cluster.WorkloadType;
    runtime_engine?: cluster.RuntimeEngine;
    effective_spark_version?: string;
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
    git_branch?: string;
    git_tag?: string;
    git_commit?: string;
    git_url: string;
    git_provider: string;
}

export interface AccessControlRequest {
    user_name?: string;
    group_name?: string;
    service_principal_name?: string;
    permission_level?: JobPermission;
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

export interface TriggerSettings {
    file_arrival?: FileArrivalTriggerConfiguration;
    pause_status?: SchedulePauseStatus;
}

export interface FileArrivalTriggerConfiguration {
    url: string;
    min_time_between_triggers_seconds?: number;
    wait_after_last_change_seconds?: number;
}

export interface RunTaskSettings {
    notebook_task?: NotebookTask;
    spark_jar_task?: SparkJarTask;
    spark_python_task?: SparkPythonTask;
    spark_submit_task?: SparkSubmitTask;
    existing_cluster_id?: string;
    new_cluster?: NewCluster;
    task_key?: string;
    description?: string;
    depends_on?: Array<TaskDependency>;
    libraries?: Array<libraries.Library>;
    timeout_seconds?: number;
}

export interface RunTask {
    notebook_task?: NotebookTask;
    spark_jar_task?: SparkJarTask;
    spark_python_task?: SparkPythonTask;
    spark_submit_task?: SparkSubmitTask;
    existing_cluster_id?: string;
    new_cluster?: NewCluster;
    run_id?: number;
    task_key?: string;
    description?: string;
    depends_on?: Array<TaskDependency>;
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
    existing_cluster_id?: string;
    new_cluster?: NewCluster;
    notebook_task?: NotebookTask;
    spark_jar_task?: SparkJarTask;
    spark_python_task?: SparkPythonTask;
    spark_submit_task?: SparkSubmitTask;
    name?: string;
    libraries?: Array<libraries.Library>;
    email_notifications?: JobEmailNotifications;
    timeout_seconds?: number;
    max_retries?: number;
    min_retry_interval_millis?: number;
    retry_on_timeout?: boolean;
    schedule?: CronSchedule;
    trigger?: TriggerSettings;
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
    existing_cluster_id?: string;
    new_cluster?: NewCluster;
    notebook_task?: NotebookTask;
    spark_jar_task?: SparkJarTask;
    spark_python_task?: SparkPythonTask;
    spark_submit_task?: SparkSubmitTask;
    name?: string;
    libraries?: Array<libraries.Library>;
    email_notifications?: JobEmailNotifications;
    timeout_seconds?: number;
    max_retries?: number;
    min_retry_interval_millis?: number;
    retry_on_timeout?: boolean;
    schedule?: CronSchedule;
    trigger?: TriggerSettings;
    max_concurrent_runs?: number;
    tasks?: Array<TaskSettings>;
    job_clusters?: Array<JobCluster>;
    git_source?: GitSource;
    tags?: Array<JobTag>;
    format?: Format;
    access_control_list?: Array<AccessControlRequest>;
}

export interface CreateJobResponse {
    job_id?: number;
}

export interface SubmitRunRequest {
    existing_cluster_id?: string;
    new_cluster?: NewCluster;
    notebook_task?: NotebookTask;
    spark_jar_task?: SparkJarTask;
    spark_python_task?: SparkPythonTask;
    spark_submit_task?: SparkSubmitTask;
    run_name?: string;
    libraries?: Array<libraries.Library>;
    timeout_seconds?: number;
    idempotency_token?: string;
    tasks?: Array<RunTaskSettings>;
    job_clusters?: Array<JobCluster>;
    git_source?: GitSource;
    access_control_list?: Array<AccessControlRequest>;
}

export interface SubmitRunResponse {
    run_id?: number;
}

export interface ResetJobRequest {
    job_id: number;
    new_settings: JobSettings;
}

export interface ResetJobResponse {}

export interface UpdateJobRequest {
    job_id: number;
    new_settings?: JobSettings;
    fields_to_remove?: Array<string>;
}

export interface UpdateJobResponse {}

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
    active_only?: boolean;
    completed_only?: boolean;
    job_id?: number;
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

export interface CancelAllRunsRequest {
    job_id: number;
}

export interface CancelAllRunsResponse {}

export interface GetRunOutputRequest {
    run_id: number;
}

export interface GetRunOutputResponse {
    notebook_output?: NotebookOutput;
    metadata?: Run;
    error?: string;
    logs?: string;
    logs_truncated?: boolean;
    error_trace?: string;
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

    /**
     * Creates a new job with the provided settings.
     *
     * An example request for a job that runs at 10:15pm each night:
     *
     * .. aws::
     *   .. code::
     *
     *     {
     *       "name": "Nightly model training",
     *       "new_cluster": {
     *         "spark_version": "2.0.x-scala2.10",
     *         "node_type_id": "r3.xlarge",
     *         "aws_attributes": {
     *           "availability": "ON_DEMAND"
     *         },
     *         "num_workers": 10
     *       },
     *       "libraries": [
     *         {
     *           "jar": "dbfs:/my-jar.jar"
     *         },
     *         {
     *           "maven": {
     *             "coordinates": "org.jsoup:jsoup:1.7.2"
     *           }
     *         }
     *       ],
     *       "email_notifications": {
     *         "on_start": [],
     *         "on_success": [],
     *         "on_failure": []
     *       },
     *       "timeout_seconds": 3600,
     *       "max_retries": 1,
     *       "schedule": {
     *         "quartz_cron_expression": "0 15 22 ? * *",
     *         "timezone_id": "America/Los_Angeles"
     *       },
     *       "spark_jar_task": {
     *         "main_class_name": "com.databricks.ComputeModels"
     *       }
     *     }
     *
     *
     * .. azure::
     *   .. code::
     *
     *     {
     *       "name": "Nightly model training",
     *       "new_cluster": {
     *         "spark_version": "3.1.x-scala2.11",
     *         "node_type_id": "Standard_D3_v2",
     *         "num_workers": 10
     *       },
     *       "libraries": [
     *         {
     *           "jar": "dbfs:/my-jar.jar"
     *         },
     *         {
     *           "maven": {
     *             "coordinates": "org.jsoup:jsoup:1.7.2"
     *           }
     *         }
     *       ],
     *       "timeout_seconds": 3600,
     *       "max_retries": 1,
     *       "schedule": {
     *         "quartz_cron_expression": "0 15 22 ? * *",
     *         "timezone_id": "America/Los_Angeles"
     *       },
     *       "spark_jar_task": {
     *         "main_class_name": "com.databricks.ComputeModels"
     *       }
     *     }
     *
     *
     * And response:
     *
     * .. code::
     *
     *     {
     *       "job_id": 1
     *     }
     */
    async createJob(request: CreateJobRequest): Promise<CreateJobResponse> {
        return (await this.client.request(
            "/api/2.1/jobs/create",
            "POST",
            request
        )) as CreateJobResponse;
    }

    /**
     * Submit a one-time run with the provided settings. This endpoint doesn't require a Databricks job
     * to be created.  You can directly submit your workload. Runs submitted via this endpoint don't
     * show up in the UI. Once the run is submitted, you can use the ``jobs/runs/get`` API to check the run state.
     *
     * An example request:
     *
     * .. aws::
     *   .. code::
     *
     *     {
     *       "run_name": "my spark task",
     *       "new_cluster": {
     *         "spark_version": "2.0.x-scala2.10",
     *         "node_type_id": "r3.xlarge",
     *         "aws_attributes": {
     *           "availability": "ON_DEMAND"
     *         },
     *         "num_workers": 10
     *       },
     *       "libraries": [
     *         {
     *           "jar": "dbfs:/my-jar.jar"
     *         },
     *         {
     *           "maven": {
     *             "coordinates": "org.jsoup:jsoup:1.7.2"
     *           }
     *         }
     *       ],
     *       "timeout_seconds": 3600,
     *       "spark_jar_task": {
     *         "main_class_name": "com.databricks.ComputeModels"
     *       }
     *     }
     *
     * .. azure::
     *   .. code::
     *
     *     {
     *       "run_name": "my spark task",
     *       "new_cluster": {
     *         "spark_version": "3.1.x-scala2.11",
     *         "node_type_id": "Standard_D3_v2",
     *         "num_workers": 10
     *       },
     *       "libraries": [
     *         {
     *           "jar": "dbfs:/my-jar.jar"
     *         },
     *         {
     *           "maven": {
     *             "coordinates": "org.jsoup:jsoup:1.7.2"
     *           }
     *         }
     *       ],
     *       "timeout_seconds": 3600,
     *       "spark_jar_task": {
     *         "main_class_name": "com.databricks.ComputeModels"
     *       }
     *     }
     *
     * And response:
     *
     * .. code::
     *
     *     {
     *       "run_id": 123
     *     }
     */
    async submitRun(request: SubmitRunRequest): Promise<SubmitRunResponse> {
        return (await this.client.request(
            "/api/2.1/jobs/runs/submit",
            "POST",
            request
        )) as SubmitRunResponse;
    }

    /**
     * Overwrites the settings of a job with the provided settings.
     *
     * An example request that makes job 2 look like job 1 (from the ``create_job`` example):
     *
     * .. aws::
     *   .. code::
     *
     *     {
     *       "job_id": 2,
     *       "new_settings": {
     *         "name": "Nightly model training",
     *         "new_cluster": {
     *           "spark_version": "2.0.x-scala2.10",
     *           "node_type_id": "r3.xlarge",
     *           "aws_attributes": {
     *             "availability": "ON_DEMAND"
     *           },
     *           "num_workers": 10
     *         },
     *         "libraries": [
     *           {
     *             "jar": "dbfs:/my-jar.jar"
     *           },
     *           {
     *             "maven": {
     *               "coordinates": "org.jsoup:jsoup:1.7.2"
     *             }
     *           }
     *         ],
     *         "email_notifications": {
     *           "on_start": [],
     *           "on_success": [],
     *           "on_failure": []
     *         },
     *         "timeout_seconds": 100000000,
     *         "max_retries": 1,
     *         "schedule": {
     *           "quartz_cron_expression": "0 15 22 ? * *",
     *           "timezone_id": "America/Los_Angeles",
     *           "pause_status": "UNPAUSED"
     *         },
     *         "spark_jar_task": {
     *           "main_class_name": "com.databricks.ComputeModels"
     *         }
     *       }
     *     }
     *
     * .. azure::
     *   .. code::
     *
     *     {
     *       "job_id": 2,
     *       "new_settings": {
     *         "name": "Nightly model training",
     *         "new_cluster": {
     *           "spark_version": "3.1.x-scala2.11",
     *           "node_type_id": "Standard_D3_v2",
     *           "num_workers": 10
     *         },
     *         "libraries": [
     *           {
     *             "jar": "dbfs:/my-jar.jar"
     *           },
     *           {
     *             "maven": {
     *               "coordinates": "org.jsoup:jsoup:1.7.2"
     *             }
     *           }
     *         ],
     *         "timeout_seconds": 100000000,
     *         "max_retries": 1,
     *         "schedule": {
     *           "quartz_cron_expression": "0 15 22 ? * *",
     *           "timezone_id": "America/Los_Angeles",
     *           "pause_status": "UNPAUSED"
     *         },
     *         "spark_jar_task": {
     *           "main_class_name": "com.databricks.ComputeModels"
     *         }
     *       }
     *     }
     */
    async resetJob(request: ResetJobRequest): Promise<ResetJobResponse> {
        return (await this.client.request(
            "/api/2.1/jobs/reset",
            "POST",
            request
        )) as ResetJobResponse;
    }

    /**
     * Updates the settings of a job with the provided settings.
     */
    async updateJob(request: UpdateJobRequest): Promise<UpdateJobResponse> {
        return (await this.client.request(
            "/api/2.1/jobs/update",
            "POST",
            request
        )) as UpdateJobResponse;
    }

    /**
     * Deletes the job and sends an email to the addresses specified in
     * ``JobSettings.email_notifications``.
     * No action will occur if the job has already been removed. After the job is removed, neither its
     * details or its run history will be visible via the Jobs UI or API. The job is guaranteed to
     * be removed upon completion of this request. However, runs that were active before the receipt
     * of this request may still be active. They will be terminated asynchronously.
     *
     * An example request:
     *
     * .. code::
     *
     *     {
     *       "job_id": 1
     *     }
     */
    async deleteJob(request: DeleteJobRequest): Promise<DeleteJobResponse> {
        return (await this.client.request(
            "/api/2.1/jobs/delete",
            "POST",
            request
        )) as DeleteJobResponse;
    }

    /**
     * Retrieves information about a single job.
     * An example request:
     *
     * .. code::
     *
     *     /jobs/get?job_id=1
     *
     *
     *
     * An example response:
     *
     * .. aws::
     *   .. code::
     *
     *     {
     *       "job_id": 1,
     *       "settings": {
     *         "name": "Nightly model training",
     *         "new_cluster": {
     *           "spark_version": "2.0.x-scala2.10",
     *           "node_type_id": "r3.xlarge",
     *           "aws_attributes": {
     *             "availability": "ON_DEMAND"
     *           },
     *           "num_workers": 10
     *         },
     *         "libraries": [
     *           {
     *             "jar": "dbfs:/my-jar.jar"
     *           },
     *           {
     *             "maven": {
     *               "coordinates": "org.jsoup:jsoup:1.7.2"
     *             }
     *           }
     *         ],
     *         "email_notifications": {
     *           "on_start": [],
     *           "on_success": [],
     *           "on_failure": []
     *         },
     *         "timeout_seconds": 100000000,
     *         "max_retries": 1,
     *         "schedule": {
     *           "quartz_cron_expression": "0 15 22 ? * *",
     *           "timezone_id": "America/Los_Angeles",
     *           "pause_status": "UNPAUSED"
     *         },
     *         "spark_jar_task": {
     *           "main_class_name": "com.databricks.ComputeModels"
     *         }
     *       },
     *       "created_time": 1457570074236
     *     }
     *
     * .. azure::
     *   .. code::
     *
     *     {
     *       "job_id": 1,
     *       "settings": {
     *         "name": "Nightly model training",
     *         "new_cluster": {
     *           "spark_version": "3.1.x-scala2.11",
     *           "node_type_id": "Standard_D3_v2",
     *           "num_workers": 10
     *         },
     *         "libraries": [
     *           {
     *             "jar": "dbfs:/my-jar.jar"
     *           },
     *           {
     *             "maven": {
     *               "coordinates": "org.jsoup:jsoup:1.7.2"
     *             }
     *           }
     *         ],
     *         "timeout_seconds": 100000000,
     *         "max_retries": 1,
     *         "schedule": {
     *           "quartz_cron_expression": "0 15 22 ? * *",
     *           "timezone_id": "America/Los_Angeles",
     *           "pause_status": "UNPAUSED"
     *         },
     *         "spark_jar_task": {
     *           "main_class_name": "com.databricks.ComputeModels"
     *         }
     *       },
     *       "created_time": 1457570074236
     *     }
     */
    async getJob(request: GetJobRequest): Promise<GetJobResponse> {
        return (await this.client.request(
            "/api/2.1/jobs/get",
            "GET",
            request
        )) as GetJobResponse;
    }

    /**
     * Lists all jobs.
     * An example response:
     *
     * .. aws::
     *   .. code::
     *
     *     {
     *       "jobs": [
     *         {
     *           "job_id": 1,
     *           "settings": {
     *             "name": "Nightly model training",
     *             "new_cluster": {
     *               "spark_version": "2.0.x-scala2.10",
     *               "node_type_id": "r3.xlarge",
     *               "aws_attributes": {
     *                 "availability": "ON_DEMAND"
     *               },
     *               "num_workers": 10
     *             },
     *             "libraries": [
     *               {
     *                 "jar": "dbfs:/my-jar.jar"
     *               },
     *               {
     *                 "maven": {
     *                   "coordinates": "org.jsoup:jsoup:1.7.2"
     *                 }
     *               }
     *             ],
     *             "email_notifications": {
     *               "on_start": [],
     *               "on_success": [],
     *               "on_failure": []
     *             },
     *             "timeout_seconds": 100000000,
     *             "max_retries": 1,
     *             "schedule": {
     *               "quartz_cron_expression": "0 15 22 ? * *",
     *               "timezone_id": "America/Los_Angeles",
     *               "pause_status": "UNPAUSED"
     *             },
     *             "spark_jar_task": {
     *               "main_class_name": "com.databricks.ComputeModels"
     *             }
     *           },
     *           "created_time": 1457570074236
     *         }
     *       ]
     *     }
     *
     * .. azure::
     *   .. code::
     *
     *     {
     *       "jobs": [
     *         {
     *           "job_id": 1,
     *           "settings": {
     *             "name": "Nightly model training",
     *             "new_cluster": {
     *               "spark_version": "3.1.x-scala2.11",
     *               "node_type_id": "Standard_D3_v2",
     *               "num_workers": 10
     *             },
     *             "libraries": [
     *               {
     *                 "jar": "dbfs:/my-jar.jar"
     *               },
     *               {
     *                 "maven": {
     *                   "coordinates": "org.jsoup:jsoup:1.7.2"
     *                 }
     *               }
     *             ],
     *             "timeout_seconds": 100000000,
     *             "max_retries": 1,
     *             "schedule": {
     *               "quartz_cron_expression": "0 15 22 ? * *",
     *               "timezone_id": "America/Los_Angeles",
     *               "pause_status": "UNPAUSED"
     *             },
     *             "spark_jar_task": {
     *               "main_class_name": "com.databricks.ComputeModels"
     *             }
     *           },
     *           "created_time": 1457570074236
     *         }
     *       ]
     *     }
     */
    async list(request: ListJobsRequest): Promise<ListJobsResponse> {
        return (await this.client.request(
            "/api/2.1/jobs/list",
            "GET",
            request
        )) as ListJobsResponse;
    }

    /**
     * Runs the job now, and returns the ``run_id`` of the triggered run.
     *
     * .. note:: If you find yourself using :ref:`jobsJobsServicecreateJob` together with
     *           :ref:`jobsJobsServicerunNow` a lot, you may actually be interested in the
     *           :ref:`jobsJobsServicesubmitRun` API. This API endpoint allows you to submit your
     *           workloads directly without having to create a job in Databricks.
     *
     * An example request for a notebook job:
     *
     * .. code::
     *
     *     {
     *       "job_id": 1,
     *       "notebook_params": {
     *         "dry-run": "true",
     *         "oldest-time-to-consider": "1457570074236"
     *       }
     *     }
     *
     *
     *
     * An example request for a jar job:
     *
     * .. code::
     *
     *     {
     *       "job_id": 2,
     *       "jar_params": ["param1", "param2"]
     *     }
     */
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

    /**
     * Lists runs from most recently started to least.
     *
     * .. note::
     *
     *   Runs are automatically removed after 60 days. We
     *   recommend you to save old run results through the UI before they expire to
     *   reference them in future. See :ref:`export-job-runs` for details.
     *
     * An example request:
     *
     * .. code::
     *
     *     /jobs/runs/list?job_id=1&active_only=false&offset=1&limit=1
     *
     *
     *
     * And response:
     *
     * .. code::
     *
     *     {
     *       "runs": [
     *         {
     *           "job_id": 1,
     *           "run_id": 452,
     *           "number_in_job": 5,
     *           "state": {
     *             "life_cycle_state": "RUNNING",
     *             "state_message": "Performing action"
     *           },
     *           "task": {
     *             "notebook_task": {
     *               "notebook_path": "/Users/donald@duck.com/my-notebook"
     *             }
     *           },
     *           "cluster_spec": {
     *             "existing_cluster_id": "1201-my-cluster"
     *           },
     *           "cluster_instance": {
     *             "cluster_id": "1201-my-cluster",
     *             "spark_context_id": "1102398-spark-context-id"
     *           },
     *           "overriding_parameters": {
     *             "jar_params": ["param1", "param2"]
     *           },
     *           "start_time": 1457570074236,
     *           "setup_duration": 259754,
     *           "execution_duration": 3589020,
     *           "cleanup_duration": 31038,
     *           "trigger": "PERIODIC"
     *         }
     *       ],
     *       "has_more": true
     *     }
     */
    async listRuns(request: ListRunsRequest): Promise<ListRunsResponse> {
        return (await this.client.request(
            "/api/2.1/jobs/runs/list",
            "GET",
            request
        )) as ListRunsResponse;
    }

    /**
     * Retrieves the metadata of a run.
     *
     * .. note::
     *
     *   Runs are automatically removed after 60 days. We
     *   recommend you to save old run results through the UI before they expire to
     *   reference them in future. See :ref:`export-job-runs` for details.
     *
     * An example request:
     *
     * .. code::
     *
     *     /jobs/runs/get?run_id=452
     *
     *
     *
     * An example response:
     *
     * .. code::
     *
     *     {
     *       "job_id": 1,
     *       "run_id": 452,
     *       "number_in_job": 5,
     *       "state": {
     *         "life_cycle_state": "RUNNING",
     *         "state_message": "Performing action"
     *       },
     *       "task": {
     *         "notebook_task": {
     *           "notebook_path": "/Users/donald@duck.com/my-notebook"
     *         }
     *       },
     *       "cluster_spec": {
     *         "existing_cluster_id": "1201-my-cluster"
     *       },
     *       "cluster_instance": {
     *         "cluster_id": "1201-my-cluster",
     *         "spark_context_id": "1102398-spark-context-id"
     *       },
     *       "overriding_parameters": {
     *         "jar_params": ["param1", "param2"]
     *       },
     *       "start_time": 1457570074236,
     *       "setup_duration": 259754,
     *       "execution_duration": 3589020,
     *       "cleanup_duration": 31038,
     *       "trigger": "PERIODIC"
     *     }
     */
    async getRun(request: GetRunRequest): Promise<GetRunResponse> {
        return (await this.client.request(
            "/api/2.1/jobs/runs/get",
            "GET",
            request
        )) as GetRunResponse;
    }

    /**
     * Deletes a non-active run. Returns an error if the run is active.
     *
     * An example request:
     *
     * .. code::
     *
     *     {
     *       "run_id": 42
     *     }
     */
    async deleteRun(request: DeleteRunRequest): Promise<DeleteRunResponse> {
        return (await this.client.request(
            "/api/2.1/jobs/runs/delete",
            "POST",
            request
        )) as DeleteRunResponse;
    }

    /**
     * Cancels a run. The run is canceled asynchronously, so when this request completes, the run may
     * still be running. The run will be terminated shortly. If the run is already in a
     * terminal ``life_cycle_state``, this method is a no-op.
     *
     * An example request:
     *
     * .. code::
     *
     *     {
     *       "run_id": 453
     *     }
     */
    async cancelRun(request: CancelRunRequest): Promise<CancelRunResponse> {
        return (await this.client.request(
            "/api/2.1/jobs/runs/cancel",
            "POST",
            request
        )) as CancelRunResponse;
    }

    /**
     * Cancels all the runs for provided job. The runs are canceled asynchronously,
     * so when this request completes, the runs may still be running.
     * The run will be terminated shortly. If the run is already in a terminal ``life_cycle_state``,
     * this method is a no-op.
     *
     * An example request:
     *
     * .. code::
     *
     *     {
     *       "job_id": 2
     *     }
     */
    async cancelAllRuns(
        request: CancelAllRunsRequest
    ): Promise<CancelAllRunsResponse> {
        return (await this.client.request(
            "/api/2.1/jobs/runs/cancel-all",
            "POST",
            request
        )) as CancelAllRunsResponse;
    }

    /**
     * Retrieve the output of a run.
     * When a notebook task returns a value through the
     * :ref:`Notebook Workflow Exit <notebook-workflows-exit>`
     * call, you can use this endpoint to retrieve that value. Note that
     * Databricks will restrict this API to return the first 5 MB of the output.
     * For returning larger results, your job can store the results in a cloud storage
     * service.
     *
     * .. note::
     *
     *   Runs are automatically removed after 60 days. We
     *   recommend you to save old run results through the UI before they expire to
     *   reference them in future. See :ref:`export-job-runs` for details.
     *
     * An example request:
     *
     * .. code::
     *
     *     /jobs/runs/get-output?run_id=453
     *
     * And response:
     *
     * .. code::
     *
     *     {
     *       "metadata": {
     *         "job_id": 1,
     *         "run_id": 452,
     *         "number_in_job": 5,
     *         "state": {
     *           "life_cycle_state": "TERMINATED",
     *           "result_state": "SUCCESS",
     *           "state_message": ""
     *         },
     *         "task": {
     *           "notebook_task": {
     *             "notebook_path": "/Users/donald@duck.com/my-notebook"
     *           }
     *         },
     *         "cluster_spec": {
     *           "existing_cluster_id": "1201-my-cluster"
     *         },
     *         "cluster_instance": {
     *           "cluster_id": "1201-my-cluster",
     *           "spark_context_id": "1102398-spark-context-id"
     *         },
     *         "overriding_parameters": {
     *           "jar_params": ["param1", "param2"]
     *         },
     *         "start_time": 1457570074236,
     *         "setup_duration": 259754,
     *         "execution_duration": 3589020,
     *         "cleanup_duration": 31038,
     *         "trigger": "PERIODIC"
     *       },
     *       "notebook_output": {
     *         "result": "the maybe truncated string passed to dbutils.notebook.exit()"
     *       }
     *     }
     */
    async getRunOutput(
        request: GetRunOutputRequest
    ): Promise<GetRunOutputResponse> {
        return (await this.client.request(
            "/api/2.1/jobs/runs/get-output",
            "GET",
            request
        )) as GetRunOutputResponse;
    }

    /**
     * Exports and retrieves the job run task.
     *
     * .. note::
     *
     *   Only notebook runs can be exported in HTML format at the moment.
     *   Other runs will fail and return an exception.
     *
     * An example request:
     *
     * .. code::
     *
     *     /jobs/runs/export?run_id=452
     *
     *
     * An example response:
     *
     * .. code::
     *
     *     {
     *       "views": [
     *         "content": "<!DOCTYPE html><html><head>Head</head><body>Body</body></html>",
     *         "name": "my-notebook",
     *         "type": "NOTEBOOK"
     *       ]
     *     }
     */
    async exportRun(request: ExportRunRequest): Promise<ExportRunResponse> {
        return (await this.client.request(
            "/api/2.1/jobs/runs/export",
            "GET",
            request
        )) as ExportRunResponse;
    }
}
