/* eslint-disable @typescript-eslint/naming-convention */

// Code generated from OpenAPI specs by Databricks SDK Generator. DO NOT EDIT.

// all definitions in this file are in alphabetical order
export interface AccessControlRequest {
    group_name?: string;
    permission_level?: any /* MISSING TYPE */;
    service_principal_name?: string;
    user_name?: string;
}

export interface AutoScale {
    /**
     * The maximum number of workers to which the cluster can scale up when
     * overloaded. max_workers must be strictly greater than min_workers.
     */
    max_workers?: number;
    /**
     * The minimum number of workers to which the cluster can scale down when
     * underutilized. It is also the initial number of workers the cluster has
     * after creation.
     */
    min_workers?: number;
}

export interface AwsAttributes {
    /**
     * Availability type used for all subsequent nodes past the `first_on_demand`
     * ones. **Note:** If `first_on_demand` is zero, this availability type is
     * used for the entire cluster.
     *
     * `SPOT`: use spot instances. `ON_DEMAND`: use on-demand instances.
     * `SPOT_WITH_FALLBACK`: preferably use spot instances, but fall back to
     * on-demand instances if spot instances cannot be acquired (for example, if
     * AWS spot prices are too high).
     */
    availability?: AwsAttributesAvailability;
    /**
     * The number of volumes launched for each instance. You can choose up to 10
     * volumes. This feature is only enabled for supported node types. Legacy
     * node types cannot specify custom EBS volumes. For node types with no
     * instance store, at least one EBS volume needs to be specified; otherwise,
     * cluster creation fails.
     *
     * These EBS volumes are mounted at `/ebs0`, `/ebs1`, and etc. Instance store
     * volumes are mounted at `/local_disk0`, `/local_disk1`, and etc.
     *
     * If EBS volumes are attached, Databricks configures Spark to use only the
     * EBS volumes for scratch storage because heterogeneously sized scratch
     * devices can lead to inefficient disk utilization. If no EBS volumes are
     * attached, Databricks configures Spark to use instance store volumes.
     *
     * If EBS volumes are specified, then the Spark configuration
     * `spark.local.dir` is overridden.
     */
    ebs_volume_count?: number;
    /**
     * The number of IOPS per EBS gp3 volume.
     *
     * This value must be between 3000 and 16000.
     *
     * The value of IOPS and throughput is calculated based on AWS documentation
     * to match the maximum performance of a gp2 volume with the same volume
     * size.
     *
     * For more information, see the [EBS volume limit
     * calculator](https://github.com/awslabs/aws-support-tools/tree/master/EBS/VolumeLimitCalculator).
     */
    ebs_volume_iops?: number;
    /**
     * The size of each EBS volume (in GiB) launched for each instance. For
     * general purpose SSD, this value must be within the range 100 - 4096\. For
     * throughput optimized HDD, this value must be within the range 500 - 4096\.
     * Custom EBS volumes cannot be specified for the legacy node types
     * (_memory-optimized_ and _compute-optimized_).
     */
    ebs_volume_size?: number;
    /**
     * The throughput per EBS gp3 volume, in MiB per second.
     *
     * This value must be between 125 and 1000.
     */
    ebs_volume_throughput?: number;
    /**
     * The type of EBS volume that is launched with this cluster.
     *
     * `GENERAL_PURPOSE_SSD`: provision extra storage using AWS gp2 EBS volumes.
     * `THROUGHPUT_OPTIMIZED_HDD`: provision extra storage using AWS st1 volumes.
     */
    ebs_volume_type?: AwsAttributesEbsVolumeType;
    /**
     * The first first_on_demand nodes of the cluster are placed on on-demand
     * instances. If this value is greater than 0, the cluster driver node is
     * placed on an on-demand instance. If this value is greater than or equal to
     * the current cluster size, all nodes are placed on on-demand instances. If
     * this value is less than the current cluster size, first_on_demand nodes
     * are placed on on-demand instances and the remainder are placed on
     * `availability` instances. This value does not affect cluster size and
     * cannot be mutated over the lifetime of a cluster.
     */
    first_on_demand?: number;
    /**
     * Nodes for this cluster are only be placed on AWS instances with this
     * instance profile. If omitted, nodes are placed on instances without an
     * instance profile. The instance profile must have previously been added to
     * the Databricks environment by an account administrator.
     *
     * This feature may only be available to certain customer plans.
     */
    instance_profile_arn?: string;
    /**
     * The max price for AWS spot instances, as a percentage of the corresponding
     * instance type?s on-demand price. For example, if this field is set to 50,
     * and the cluster needs a new `i3.xlarge` spot instance, then the max price
     * is half of the price of on-demand `i3.xlarge` instances. Similarly, if
     * this field is set to 200, the max price is twice the price of on-demand
     * `i3.xlarge` instances. If not specified, the default value is 100\. When
     * spot instances are requested for this cluster, only spot instances whose
     * max price percentage matches this field is considered. For safety, we
     * enforce this field to be no more than 10000.
     */
    spot_bid_price_percent?: number;
    /**
     * Identifier for the availability zone/datacenter in which the cluster
     * resides. You have three options:
     *
     * **Specify an availability zone as a string**, for example: ?us-west-2a?.
     * The provided availability zone must be in the same region as the
     * Databricks deployment. For example, ?us-west-2a? is not a valid zone ID if
     * the Databricks deployment resides in the ?us-east-1? region.
     *
     * **Enable automatic availability zone selection (?Auto-AZ?)**, by setting
     * the value ?auto?. Databricks selects the AZ based on available IPs in the
     * workspace subnets and retries in other availability zones if AWS returns
     * insufficient capacity errors.
     *
     * **Do not specify a value**. If not specified, a default zone is used.
     *
     * The list of available zones as well as the default value can be found by
     * using the [List zones](..dev-tools/api/latest/clustershtml#list-zones)
     * API.
     */
    zone_id?: string;
}

/**
 * Availability type used for all subsequent nodes past the `first_on_demand`
 * ones. **Note:** If `first_on_demand` is zero, this availability type is used
 * for the entire cluster.
 *
 * `SPOT`: use spot instances. `ON_DEMAND`: use on-demand instances.
 * `SPOT_WITH_FALLBACK`: preferably use spot instances, but fall back to
 * on-demand instances if spot instances cannot be acquired (for example, if AWS
 * spot prices are too high).
 */
export type AwsAttributesAvailability =
    | "ON_DEMAND"
    | "SPOT"
    | "SPOT_WITH_FALLBACK";

/**
 * The type of EBS volume that is launched with this cluster.
 *
 * `GENERAL_PURPOSE_SSD`: provision extra storage using AWS gp2 EBS volumes.
 * `THROUGHPUT_OPTIMIZED_HDD`: provision extra storage using AWS st1 volumes.
 */
export type AwsAttributesEbsVolumeType =
    | "GENERAL_PURPOSE_SSD"
    | "THROUGHPUT_OPTIMIZED_HDD";

export interface AzureAttributes {
    /**
     * Availability type used for all subsequent nodes past the `first_on_demand`
     * ones.
     *
     * `SPOT_AZURE`: use spot instances. `ON_DEMAND_AZURE`: use on demand
     * instances. `SPOT_WITH_FALLBACK_AZURE`: preferably use spot instances, but
     * fall back to on-demand instances if spot instances cannot be acquired (for
     * example, if Azure spot prices are too high or out of quota). Does not
     * apply to pool availability.
     */
    availability?: AzureAttributesAvailability;
    /**
     * The first `first_on_demand` nodes of the cluster are placed on on-demand
     * instances. This value must be greater than 0, or else cluster creation
     * validation fails. If this value is greater than or equal to the current
     * cluster size, all nodes are placed on on-demand instances. If this value
     * is less than the current cluster size, `first_on_demand` nodes are placed
     * on on-demand instances and the remainder are placed on availability
     * instances. This value does not affect cluster size and cannot be mutated
     * over the lifetime of a cluster.
     */
    first_on_demand?: number;
    /**
     * The max bid price used for Azure spot instances. You can set this to
     * greater than or equal to the current spot price. You can also set this to
     * -1 (the default), which specifies that the instance cannot be evicted on
     * the basis of price. The price for the instance is the current price for
     * spot instances or the price for a standard instance. You can view
     * historical pricing and eviction rates in the Azure portal.
     */
    spot_bid_max_price?: number;
}

/**
 * Availability type used for all subsequent nodes past the `first_on_demand`
 * ones.
 *
 * `SPOT_AZURE`: use spot instances. `ON_DEMAND_AZURE`: use on demand instances.
 * `SPOT_WITH_FALLBACK_AZURE`: preferably use spot instances, but fall back to
 * on-demand instances if spot instances cannot be acquired (for example, if
 * Azure spot prices are too high or out of quota). Does not apply to pool
 * availability.
 */
export type AzureAttributesAvailability =
    | "ON_DEMAND_AZURE"
    | "SPOT_AZURE"
    | "SPOT_WITH_FALLBACK_AZURE";

export interface CancelAllRuns {
    /**
     * The canonical identifier of the job to cancel all runs of. This field is
     * required.
     */
    job_id: number;
}

export interface CancelRun {
    /**
     * This field is required.
     */
    run_id: number;
}

export interface ClusterInstance {
    /**
     * The canonical identifier for the cluster used by a run. This field is
     * always available for runs on existing clusters. For runs on new clusters,
     * it becomes available once the cluster is created. This value can be used
     * to view logs by browsing to `/#setting/sparkui/$cluster_id/driver-logs`.
     * The logs continue to be available after the run completes.
     *
     * The response won?t include this field if the identifier is not available
     * yet.
     */
    cluster_id?: string;
    /**
     * The canonical identifier for the Spark context used by a run. This field
     * is filled in once the run begins execution. This value can be used to view
     * the Spark UI by browsing to
     * `/#setting/sparkui/$cluster_id/$spark_context_id`. The Spark UI continues
     * to be available after the run has completed.
     *
     * The response won?t include this field if the identifier is not available
     * yet.
     */
    spark_context_id?: string;
}

export interface ClusterLogConf {
    /**
     * DBFS location of cluster log. Destination must be provided. For example,
     * `{ "dbfs" : { "destination" : "dbfs:/home/cluster_log" } }`
     */
    dbfs?: DbfsStorageInfo;
    /**
     * S3 location of cluster log. `destination` and either `region` or
     * `endpoint` must be provided. For example, `{ "s3": { "destination" :
     * "s3://cluster_log_bucket/prefix", "region" : "us-west-2" } }`
     */
    s3?: S3StorageInfo;
}

export interface ClusterSpec {
    /**
     * If existing_cluster_id, the ID of an existing cluster that is used for all
     * runs of this job. When running jobs on an existing cluster, you may need
     * to manually restart the cluster if it stops responding. We suggest running
     * jobs on new clusters for greater reliability.
     */
    existing_cluster_id?: string;
    /**
     * An optional list of libraries to be installed on the cluster that executes
     * the job. The default value is an empty list.
     */
    libraries?: Array<Library>;
    /**
     * If new_cluster, a description of a cluster that is created for each run.
     */
    new_cluster?: NewCluster;
}

/**
 * An object with key value pairs. The key length must be between 1 and 127 UTF-8
 * characters, inclusive. The value length must be less than or equal to 255
 * UTF-8 characters.
 */

export interface CreateJob {
    /**
     * List of permissions to set on the job.
     */
    access_control_list?: Array<AccessControlRequest>;
    /**
     * An optional set of email addresses that is notified when runs of this job
     * begin or complete as well as when this job is deleted. The default
     * behavior is to not send any emails.
     */
    email_notifications?: JobEmailNotifications;
    /**
     * Used to tell what is the format of the job. This field is ignored in
     * Create/Update/Reset calls. When using the Jobs API 2.1 this value is
     * always set to `"MULTI_TASK"`.
     */
    format?: CreateJobFormat;
    /**
     * An optional specification for a remote repository containing the notebooks
     * used by this job's notebook tasks.
     */
    git_source?: GitSource;
    /**
     * A list of job cluster specifications that can be shared and reused by
     * tasks of this job. Libraries cannot be declared in a shared job cluster.
     * You must declare dependent libraries in task settings.
     */
    job_clusters?: Array<JobCluster>;
    /**
     * An optional maximum allowed number of concurrent runs of the job.
     *
     * Set this value if you want to be able to execute multiple runs of the same
     * job concurrently. This is useful for example if you trigger your job on a
     * frequent schedule and want to allow consecutive runs to overlap with each
     * other, or if you want to trigger multiple runs which differ by their input
     * parameters.
     *
     * This setting affects only new runs. For example, suppose the job?s
     * concurrency is 4 and there are 4 concurrent active runs. Then setting the
     * concurrency to 3 won?t kill any of the active runs. However, from then on,
     * new runs are skipped unless there are fewer than 3 active runs.
     *
     * This value cannot exceed 1000\. Setting this value to 0 causes all new
     * runs to be skipped. The default behavior is to allow only 1 concurrent
     * run.
     */
    max_concurrent_runs?: number;
    /**
     * An optional name for the job.
     */
    name?: string;
    /**
     * An optional periodic schedule for this job. The default behavior is that
     * the job only runs when triggered by clicking ?Run Now? in the Jobs UI or
     * sending an API request to `runNow`.
     */
    schedule?: CronSchedule;
    /**
     * A map of tags associated with the job. These are forwarded to the cluster
     * as cluster tags for jobs clusters, and are subject to the same limitations
     * as cluster tags. A maximum of 25 tags can be added to the job.
     */
    tags?: Record<string, string>;
    /**
     * A list of task specifications to be executed by this job.
     */
    tasks?: Array<JobTaskSettings>;
    /**
     * An optional timeout applied to each run of this job. The default behavior
     * is to have no timeout.
     */
    timeout_seconds?: number;
}

/**
 * Used to tell what is the format of the job. This field is ignored in
 * Create/Update/Reset calls. When using the Jobs API 2.1 this value is always
 * set to `"MULTI_TASK"`.
 */
export type CreateJobFormat = "MULTI_TASK" | "SINGLE_TASK";

export interface CronSchedule {
    /**
     * Indicate whether this schedule is paused or not.
     */
    pause_status?: CronSchedulePauseStatus;
    /**
     * A Cron expression using Quartz syntax that describes the schedule for a
     * job. See [Cron
     * Trigger](http://www.quartz-scheduler.org/documentation/quartz-2.3.0/tutorials/crontrigger.html)
     * for details. This field is required.
     */
    quartz_cron_expression: string;
    /**
     * A Java timezone ID. The schedule for a job is resolved with respect to
     * this timezone. See [Java
     * TimeZone](https://docs.oracle.com/javase/7/docs/api/java/util/TimeZone.html)
     * for details. This field is required.
     */
    timezone_id: string;
}

/**
 * Indicate whether this schedule is paused or not.
 */
export type CronSchedulePauseStatus = "PAUSED" | "UNPAUSED";

export interface DbfsStorageInfo {
    /**
     * DBFS destination. Example: `dbfs:/my/path`
     */
    destination?: string;
}

export interface DeleteJob {
    /**
     * The canonical identifier of the job to delete. This field is required.
     */
    job_id: number;
}

export interface DeleteRun {
    /**
     * The canonical identifier of the run for which to retrieve the metadata.
     */
    run_id?: number;
}

export interface ExportRunOutput {
    /**
     * The exported content in HTML format (one for every view item).
     */
    views?: Array<ViewItem>;
}

export interface FileStorageInfo {
    /**
     * File destination. Example: `file:/my/file.sh`
     */
    destination?: string;
}

export interface GcpAttributes {
    /**
     * Google service account email address that the cluster uses to authenticate
     * with Google Identity. This field is used for authentication with the
     * [GCS](..data/data-sources/google/gcshtml) and
     * [BigQuery](..data/data-sources/google/bigqueryhtml) data sources.
     */
    google_service_account?: string;
    /**
     * Use preemptible executors.
     */
    use_preemptible_executors?: boolean;
}

/**
 * Read-only state of the remote repository at the time the job was run. This
 * field is only included on job runs.
 */
export interface GitSnapshot {
    /**
     * Commit that was used to execute the run. If git_branch was specified, this
     * points to the HEAD of the branch at the time of the run; if git_tag was
     * specified, this points to the commit the tag points to.
     */
    used_commit?: string;
}

/**
 * An optional specification for a remote repository containing the notebooks
 * used by this job's notebook tasks.
 */
export interface GitSource {
    /**
     * Name of the branch to be checked out and used by this job. This field
     * cannot be specified in conjunction with git_tag or git_commit. The maximum
     * length is 255 characters.
     */
    git_branch?: string;
    /**
     * Commit to be checked out and used by this job. This field cannot be
     * specified in conjunction with git_branch or git_tag. The maximum length is
     * 64 characters.
     */
    git_commit?: string;
    /**
     * Unique identifier of the service used to host the Git repository. The
     * value is case insensitive.
     */
    git_provider: GitSourceGitProvider;
    git_snapshot?: GitSnapshot;
    /**
     * Name of the tag to be checked out and used by this job. This field cannot
     * be specified in conjunction with git_branch or git_commit. The maximum
     * length is 255 characters.
     */
    git_tag?: string;
    /**
     * URL of the repository to be cloned by this job. The maximum length is 300
     * characters.
     */
    git_url: string;
}

/**
 * Unique identifier of the service used to host the Git repository. The value is
 * case insensitive.
 */
export type GitSourceGitProvider =
    | "awsCodeCommit"
    | "azureDevOpsServices"
    | "bitbucketCloud"
    | "bitbucketServer"
    | "gitHub"
    | "gitHubEnterprise"
    | "gitLab"
    | "gitLabEnterpriseEdition";

/**
 * Group name. There are two built-in groups: `users` for all users, and `admins`
 * for administrators.
 */

export interface InitScriptInfo {
    /**
     * S3 location of init script. Destination and either region or endpoint must
     * be provided. For example, `{ "s3": { "destination" :
     * "s3://init_script_bucket/prefix", "region" : "us-west-2" } }`
     */
    s3?: S3StorageInfo;
    /**
     * DBFS location of init script. Destination must be provided. For example,
     * `{ "dbfs" : { "destination" : "dbfs:/home/init_script" } }`
     */
    dbfs?: DbfsStorageInfo;
    /**
     * File location of init script. Destination must be provided. For example,
     * `{ "file" : { "destination" : "file:/my/local/file.sh" } }`
     */
    file?: FileStorageInfo;
}

export interface Job {
    /**
     * The time at which this job was created in epoch milliseconds (milliseconds
     * since 1/1/1970 UTC).
     */
    created_time?: number;
    /**
     * The creator user name. This field won?t be included in the response if the
     * user has already been deleted.
     */
    creator_user_name?: string;
    /**
     * The canonical identifier for this job.
     */
    job_id?: number;
    /**
     * Settings for this job and all of its runs. These settings can be updated
     * using the `resetJob` method.
     */
    settings?: JobSettings;
}

export interface JobCluster {
    /**
     * A unique name for the job cluster. This field is required and must be
     * unique within the job. `JobTaskSettings` may refer to this field to
     * determine which cluster to launch for the task execution.
     */
    job_cluster_key: string;
    new_cluster?: NewCluster;
}

export interface JobEmailNotifications {
    /**
     * If true, do not send email to recipients specified in `on_failure` if the
     * run is skipped.
     */
    no_alert_for_skipped_runs?: boolean;
    /**
     * A list of email addresses to be notified when a run unsuccessfully
     * completes. A run is considered to have completed unsuccessfully if it ends
     * with an `INTERNAL_ERROR` `life_cycle_state` or a `SKIPPED`, `FAILED`, or
     * `TIMED_OUT` result_state. If this is not specified on job creation, reset,
     * or update the list is empty, and notifications are not sent.
     */
    on_failure?: Array<string>;
    /**
     * A list of email addresses to be notified when a run begins. If not
     * specified on job creation, reset, or update, the list is empty, and
     * notifications are not sent.
     */
    on_start?: Array<string>;
    /**
     * A list of email addresses to be notified when a run successfully
     * completes. A run is considered to have completed successfully if it ends
     * with a `TERMINATED` `life_cycle_state` and a `SUCCESSFUL` result_state. If
     * not specified on job creation, reset, or update, the list is empty, and
     * notifications are not sent.
     */
    on_success?: Array<string>;
}

export interface JobSettings {
    /**
     * An optional set of email addresses that is notified when runs of this job
     * begin or complete as well as when this job is deleted. The default
     * behavior is to not send any emails.
     */
    email_notifications?: JobEmailNotifications;
    /**
     * Used to tell what is the format of the job. This field is ignored in
     * Create/Update/Reset calls. When using the Jobs API 2.1 this value is
     * always set to `"MULTI_TASK"`.
     */
    format?: JobSettingsFormat;
    /**
     * An optional specification for a remote repository containing the notebooks
     * used by this job's notebook tasks.
     */
    git_source?: GitSource;
    /**
     * A list of job cluster specifications that can be shared and reused by
     * tasks of this job. Libraries cannot be declared in a shared job cluster.
     * You must declare dependent libraries in task settings.
     */
    job_clusters?: Array<JobCluster>;
    /**
     * An optional maximum allowed number of concurrent runs of the job.
     *
     * Set this value if you want to be able to execute multiple runs of the same
     * job concurrently. This is useful for example if you trigger your job on a
     * frequent schedule and want to allow consecutive runs to overlap with each
     * other, or if you want to trigger multiple runs which differ by their input
     * parameters.
     *
     * This setting affects only new runs. For example, suppose the job?s
     * concurrency is 4 and there are 4 concurrent active runs. Then setting the
     * concurrency to 3 won?t kill any of the active runs. However, from then on,
     * new runs are skipped unless there are fewer than 3 active runs.
     *
     * This value cannot exceed 1000\. Setting this value to 0 causes all new
     * runs to be skipped. The default behavior is to allow only 1 concurrent
     * run.
     */
    max_concurrent_runs?: number;
    /**
     * An optional name for the job.
     */
    name?: string;
    /**
     * An optional periodic schedule for this job. The default behavior is that
     * the job only runs when triggered by clicking ?Run Now? in the Jobs UI or
     * sending an API request to `runNow`.
     */
    schedule?: CronSchedule;
    /**
     * A map of tags associated with the job. These are forwarded to the cluster
     * as cluster tags for jobs clusters, and are subject to the same limitations
     * as cluster tags. A maximum of 25 tags can be added to the job.
     */
    tags?: Record<string, string>;
    /**
     * A list of task specifications to be executed by this job.
     */
    tasks?: Array<JobTaskSettings>;
    /**
     * An optional timeout applied to each run of this job. The default behavior
     * is to have no timeout.
     */
    timeout_seconds?: number;
}

/**
 * Used to tell what is the format of the job. This field is ignored in
 * Create/Update/Reset calls. When using the Jobs API 2.1 this value is always
 * set to `"MULTI_TASK"`.
 */
export type JobSettingsFormat = "MULTI_TASK" | "SINGLE_TASK";

export interface JobTaskSettings {
    depends_on?: Array<TaskDependenciesItem>;
    description?: string;
    /**
     * An optional set of email addresses that is notified when runs of this task
     * begin or complete as well as when this task is deleted. The default
     * behavior is to not send any emails.
     */
    email_notifications?: JobEmailNotifications;
    /**
     * If existing_cluster_id, the ID of an existing cluster that is used for all
     * runs of this task. When running tasks on an existing cluster, you may need
     * to manually restart the cluster if it stops responding. We suggest running
     * jobs on new clusters for greater reliability.
     */
    existing_cluster_id?: string;
    /**
     * If job_cluster_key, this task is executed reusing the cluster specified in
     * `job.settings.job_clusters`.
     */
    job_cluster_key?: string;
    /**
     * An optional list of libraries to be installed on the cluster that executes
     * the task. The default value is an empty list.
     */
    libraries?: Array<Library>;
    /**
     * An optional maximum number of times to retry an unsuccessful run. A run is
     * considered to be unsuccessful if it completes with the `FAILED`
     * result_state or `INTERNAL_ERROR` `life_cycle_state`. The value -1 means to
     * retry indefinitely and the value 0 means to never retry. The default
     * behavior is to never retry.
     */
    max_retries?: number;
    /**
     * An optional minimal interval in milliseconds between the start of the
     * failed run and the subsequent retry run. The default behavior is that
     * unsuccessful runs are immediately retried.
     */
    min_retry_interval_millis?: number;
    /**
     * If new_cluster, a description of a cluster that is created for each run.
     */
    new_cluster?: NewCluster;
    /**
     * If notebook_task, indicates that this task must run a notebook. This field
     * may not be specified in conjunction with spark_jar_task.
     */
    notebook_task?: NotebookTask;
    /**
     * If pipeline_task, indicates that this task must execute a Pipeline.
     */
    pipeline_task?: PipelineTask;
    /**
     * If python_wheel_task, indicates that this job must execute a PythonWheel.
     */
    python_wheel_task?: PythonWheelTask;
    /**
     * An optional policy to specify whether to retry a task when it times out.
     * The default behavior is to not retry on timeout.
     */
    retry_on_timeout?: boolean;
    /**
     * If spark_jar_task, indicates that this task must run a JAR.
     */
    spark_jar_task?: SparkJarTask;
    /**
     * If spark_python_task, indicates that this task must run a Python file.
     */
    spark_python_task?: SparkPythonTask;
    /**
     * If spark_submit_task, indicates that this task must be launched by the
     * spark submit script.
     */
    spark_submit_task?: SparkSubmitTask;
    task_key: string;
    /**
     * An optional timeout applied to each run of this job task. The default
     * behavior is to have no timeout.
     */
    timeout_seconds?: number;
}

export interface Library {
    /**
     * If cran, specification of a CRAN library to be installed.
     */
    cran?: RCranLibrary;
    egg?: string;
    jar?: string;
    /**
     * If maven, specification of a Maven library to be installed. For example:
     * `{ "coordinates": "org.jsoup:jsoup:1.7.2" }`
     */
    maven?: MavenLibrary;
    /**
     * If pypi, specification of a PyPI library to be installed. Specifying the
     * `repo` field is optional and if not specified, the default pip index is
     * used. For example: `{ "package": "simplejson", "repo":
     * "https://my-repo.com" }`
     */
    pypi?: PythonPyPiLibrary;
    whl?: string;
}

export interface ListRunsResponse {
    /**
     * If true, additional runs matching the provided filter are available for
     * listing.
     */
    has_more?: boolean;
    /**
     * A list of runs, from most recently started to least.
     */
    runs?: Array<Run>;
}

export interface MavenLibrary {
    /**
     * Gradle-style Maven coordinates. For example: `org.jsoup:jsoup:1.7.2`. This
     * field is required.
     */
    coordinates: string;
    /**
     * List of dependences to exclude. For example: `["slf4j:slf4j",
     * "*:hadoop-client"]`.
     *
     * Maven dependency exclusions:
     * <https://maven.apache.org/guides/introduction/introduction-to-optional-and-excludes-dependencies.html>.
     */
    exclusions?: Array<string>;
    /**
     * Maven repo to install the Maven package from. If omitted, both Maven
     * Central Repository and Spark Packages are searched.
     */
    repo?: string;
}

export interface NewCluster {
    /**
     * If autoscale, the required parameters to automatically scale clusters up
     * and down based on load.
     */
    autoscale?: AutoScale;
    /**
     * Attributes related to clusters running on Amazon Web Services. If not
     * specified at cluster creation, a set of default values is used.
     */
    aws_attributes?: AwsAttributes;
    /**
     * Defines attributes such as the instance availability type, node placement,
     * and max bid price. If not specified during cluster creation, a set of
     * default values is used.
     */
    azure_attributes?: AzureAttributes;
    /**
     * The configuration for delivering Spark logs to a long-term storage
     * destination. Only one destination can be specified for one cluster. If the
     * conf is given, the logs are delivered to the destination every `5 mins`.
     * The destination of driver logs is `<destination>/<cluster-id>/driver`,
     * while the destination of executor logs is
     * `<destination>/<cluster-id>/executor`.
     */
    cluster_log_conf?: ClusterLogConf;
    custom_tags?: Record<string, string>;
    /**
     * The optional ID of the instance pool to use for the driver node. You must
     * also specify `instance_pool_id`. Refer to [Instance Pools
     * API](..dev-tools/api/latest/instance-poolshtml) for details.
     */
    driver_instance_pool_id?: string;
    /**
     * The node type of the Spark driver. This field is optional; if unset, the
     * driver node type is set as the same value as `node_type_id` defined above.
     */
    driver_node_type_id?: string;
    enable_elastic_disk?: boolean;
    /**
     * Attributes related to clusters running on Google Cloud. If not specified
     * at cluster creation, a set of default values is used.
     */
    gcp_attributes?: GcpAttributes;
    /**
     * The configuration for storing init scripts. Any number of scripts can be
     * specified. The scripts are executed sequentially in the order provided. If
     * `cluster_log_conf` is specified, init script logs are sent to
     * `<destination>/<cluster-id>/init_scripts`.
     */
    init_scripts?: Array<InitScriptInfo>;
    /**
     * The optional ID of the instance pool to use for cluster nodes. If
     * `driver_instance_pool_id` is present, `instance_pool_id` is used for
     * worker nodes only. Otherwise, it is used for both the driver node and
     * worker nodes. Refer to [Instance Pools
     * API](..dev-tools/api/latest/instance-poolshtml) for details.
     */
    instance_pool_id?: string;
    /**
     * This field encodes, through a single value, the resources available to
     * each of the Spark nodes in this cluster. For example, the Spark nodes can
     * be provisioned and optimized for memory or compute intensive workloads A
     * list of available node types can be retrieved by using the [List node
     * types](..dev-tools/api/latest/clustershtml#list-node-types) API call. This
     * field is required.
     */
    node_type_id: string;
    /**
     * If num_workers, number of worker nodes that this cluster must have. A
     * cluster has one Spark driver and num_workers executors for a total of
     * num_workers + 1 Spark nodes. When reading the properties of a cluster,
     * this field reflects the desired number of workers rather than the actual
     * current number of workers. For example, if a cluster is resized from 5 to
     * 10 workers, this field immediately updates to reflect the target size of
     * 10 workers, whereas the workers listed in `spark_info` gradually increase
     * from 5 to 10 as the new nodes are provisioned.
     */
    num_workers?: number;
    /**
     * A [cluster policy](..dev-tools/api/latest/policieshtml) ID.
     */
    policy_id?: string;
    /**
     * An object containing a set of optional, user-specified Spark configuration
     * key-value pairs. You can also pass in a string of extra JVM options to the
     * driver and the executors via `spark.driver.extraJavaOptions` and
     * `spark.executor.extraJavaOptions` respectively.
     *
     * Example Spark confs: `{"spark.speculation": true,
     * "spark.streaming.ui.retainedBatches": 5}` or
     * `{"spark.driver.extraJavaOptions": "-verbose:gc -XX:+PrintGCDetails"}`
     */
    spark_conf?: Record<string, any /* MISSING TYPE */>;
    /**
     * An object containing a set of optional, user-specified environment
     * variable key-value pairs. Key-value pair of the form (X,Y) are exported as
     * is (for example, `export X='Y'`) while launching the driver and workers.
     *
     * To specify an additional set of `SPARK_DAEMON_JAVA_OPTS`, we recommend
     * appending them to `$SPARK_DAEMON_JAVA_OPTS` as shown in the following
     * example. This ensures that all default databricks managed environmental
     * variables are included as well.
     *
     * Example Spark environment variables: `{"SPARK_WORKER_MEMORY": "28000m",
     * "SPARK_LOCAL_DIRS": "/local_disk0"}` or `{"SPARK_DAEMON_JAVA_OPTS":
     * "$SPARK_DAEMON_JAVA_OPTS -Dspark.shuffle.service.enabled=true"}`
     */
    spark_env_vars?: Record<string, any /* MISSING TYPE */>;
    /**
     * The Spark version of the cluster. A list of available Spark versions can
     * be retrieved by using the [Runtime
     * versions](..dev-tools/api/latest/clustershtml#runtime-versions) API call.
     * This field is required.
     */
    spark_version: string;
    ssh_public_keys?: Array<string>;
}

export interface NotebookOutput {
    /**
     * The value passed to
     * [dbutils.notebook.exit()](..notebooks/notebook-workflowshtml#notebook-workflows-exit).
     * jobs restricts this API to return the first 5 MB of the value. For a
     * larger result, your job can store the results in a cloud storage service.
     * This field is absent if `dbutils.notebook.exit()` was never called.
     */
    result?: string;
    /**
     * Whether or not the result was truncated.
     */
    truncated?: boolean;
}

export interface NotebookTask {
    /**
     * Base parameters to be used for each run of this job. If the run is
     * initiated by a call to
     * [`run-now`](..dev-tools/api/latest/jobshtml#operation/JobsRunNow) with
     * parameters specified, the two parameters maps are merged. If the same key
     * is specified in `base_parameters` and in `run-now`, the value from
     * `run-now` is used.
     *
     * Use [Task parameter variables](..jobshtml#parameter-variables) to set
     * parameters containing information about job runs.
     *
     * If the notebook takes a parameter that is not specified in the job?s
     * `base_parameters` or the `run-now` override parameters, the default value
     * from the notebook is used.
     *
     * Retrieve these parameters in a notebook using
     * [dbutils.widgets.get](..dev-tools/databricks-utilshtml#dbutils-widgets).
     */
    base_parameters?: Record<string, any /* MISSING TYPE */>;
    /**
     * The path of the notebook to be run in the jobs workspace or remote
     * repository. For notebooks stored in the Databricks workspace, the path
     * must be absolute and begin with a slash. For notebooks stored in a remote
     * repository, the path must be relative. This field is required.
     */
    notebook_path: string;
}

export interface PipelineParams {
    /**
     * If true, triggers a full refresh on the delta live table.
     */
    full_refresh?: boolean;
}

export interface PipelineTask {
    /**
     * If true, a full refresh will be triggered on the delta live table.
     */
    full_refresh?: boolean;
    /**
     * The full name of the pipeline task to execute.
     */
    pipeline_id?: string;
}

export interface PythonPyPiLibrary {
    /**
     * The name of the PyPI package to install. An optional exact version
     * specification is also supported. Examples: `simplejson` and
     * `simplejson==3.8.0`. This field is required.
     */
    package: string;
    /**
     * The repository where the package can be found. If not specified, the
     * default pip index is used.
     */
    repo?: string;
}

export interface PythonWheelTask {
    /**
     * Named entry point to use, if it does not exist in the metadata of the
     * package it executes the function from the package directly using
     * `$packageName.$entryPoint()`
     */
    entry_point?: string;
    /**
     * Command-line parameters passed to Python wheel task in the form of
     * `["--name=task", "--data=dbfs:/path/to/data.json"]`. Leave it empty if
     * `parameters` is not null.
     */
    named_parameters?: any /* MISSING TYPE */;
    /**
     * Name of the package to execute
     */
    package_name?: string;
    /**
     * Command-line parameters passed to Python wheel task. Leave it empty if
     * `named_parameters` is not null.
     */
    parameters?: Array<string>;
}

export interface RCranLibrary {
    /**
     * The name of the CRAN package to install. This field is required.
     */
    package: string;
    /**
     * The repository where the package can be found. If not specified, the
     * default CRAN repo is used.
     */
    repo?: string;
}

export interface RepairHistoryItem {
    /**
     * The end time of the (repaired) run.
     */
    end_time?: number;
    /**
     * The ID of the repair. Only returned for the items that represent a repair
     * in `repair_history`.
     */
    id?: number;
    /**
     * The start time of the (repaired) run.
     */
    start_time?: number;
    state?: RunState;
    /**
     * The run IDs of the task runs that ran as part of this repair history item.
     */
    task_run_ids?: Array<number>;
    /**
     * The repair history item type. Indicates whether a run is the original run
     * or a repair run.
     */
    type?: RepairHistoryItemType;
}

/**
 * The repair history item type. Indicates whether a run is the original run or a
 * repair run.
 */
export type RepairHistoryItemType = "ORIGINAL" | "REPAIR";

export interface RepairRun {
    /**
     * A list of parameters for jobs with Spark JAR tasks, for example
     * `"jar_params": ["john doe", "35"]`. The parameters are used to invoke the
     * main function of the main class specified in the Spark JAR task. If not
     * specified upon `run-now`, it defaults to an empty list. jar_params cannot
     * be specified in conjunction with notebook_params. The JSON representation
     * of this field (for example `{"jar_params":["john doe","35"]}`) cannot
     * exceed 10,000 bytes.
     *
     * Use [Task parameter variables](..jobshtml#parameter-variables) to set
     * parameters containing information about job runs.
     */
    jar_params?: Array<string>;
    /**
     * The ID of the latest repair. This parameter is not required when repairing
     * a run for the first time, but must be provided on subsequent requests to
     * repair the same run.
     */
    latest_repair_id?: number;
    /**
     * A map from keys to values for jobs with notebook task, for example
     * `"notebook_params": {"name": "john doe", "age": "35"}`. The map is passed
     * to the notebook and is accessible through the
     * [dbutils.widgets.get](..dev-tools/databricks-utilshtml#dbutils-widgets)
     * function.
     *
     * If not specified upon `run-now`, the triggered run uses the job?s base
     * parameters.
     *
     * notebook_params cannot be specified in conjunction with jar_params.
     *
     * Use [Task parameter variables](..jobshtml#parameter-variables) to set
     * parameters containing information about job runs.
     *
     * The JSON representation of this field (for example
     * `{"notebook_params":{"name":"john doe","age":"35"}}`) cannot exceed 10,000
     * bytes.
     */
    notebook_params?: Record<string, string>;
    pipeline_params?: PipelineParams;
    /**
     * A map from keys to values for jobs with Python wheel task, for example
     * `"python_named_params": {"name": "task", "data":
     * "dbfs:/path/to/data.json"}`.
     */
    python_named_params?: Record<string, string>;
    /**
     * A list of parameters for jobs with Python tasks, for example
     * `"python_params": ["john doe", "35"]`. The parameters are passed to Python
     * file as command-line parameters. If specified upon `run-now`, it would
     * overwrite the parameters specified in job setting. The JSON representation
     * of this field (for example `{"python_params":["john doe","35"]}`) cannot
     * exceed 10,000 bytes.
     *
     * Use [Task parameter variables](..jobshtml#parameter-variables) to set
     * parameters containing information about job runs.
     *
     * Important
     *
     * These parameters accept only Latin characters (ASCII character set). Using
     * non-ASCII characters returns an error. Examples of invalid, non-ASCII
     * characters are Chinese, Japanese kanjis, and emojis.
     */
    python_params?: Array<string>;
    /**
     * The task keys of the task runs to repair.
     */
    rerun_tasks?: Array<string>;
    /**
     * The job run ID of the run to repair. The run must not be in progress.
     */
    run_id?: number;
    /**
     * A list of parameters for jobs with spark submit task, for example
     * `"spark_submit_params": ["--class", "org.apache.spark.examples.SparkPi"]`.
     * The parameters are passed to spark-submit script as command-line
     * parameters. If specified upon `run-now`, it would overwrite the parameters
     * specified in job setting. The JSON representation of this field (for
     * example `{"python_params":["john doe","35"]}`) cannot exceed 10,000 bytes.
     *
     * Use [Task parameter variables](..jobshtml#parameter-variables) to set
     * parameters containing information about job runs.
     *
     * Important
     *
     * These parameters accept only Latin characters (ASCII character set). Using
     * non-ASCII characters returns an error. Examples of invalid, non-ASCII
     * characters are Chinese, Japanese kanjis, and emojis.
     */
    spark_submit_params?: Array<string>;
}

export interface ResetJob {
    /**
     * The canonical identifier of the job to reset. This field is required.
     */
    job_id: number;
    /**
     * The new settings of the job. These settings completely replace the old
     * settings.
     *
     * Changes to the field `JobSettings.timeout_seconds` are applied to active
     * runs. Changes to other fields are applied to future runs only.
     */
    new_settings?: JobSettings;
}

export interface Run {
    /**
     * The sequence number of this run attempt for a triggered job run. The
     * initial attempt of a run has an attempt_number of 0\. If the initial run
     * attempt fails, and the job has a retry policy (`max_retries` \> 0),
     * subsequent runs are created with an `original_attempt_run_id` of the
     * original attempt?s ID and an incrementing `attempt_number`. Runs are
     * retried only until they succeed, and the maximum `attempt_number` is the
     * same as the `max_retries` value for the job.
     */
    attempt_number?: number;
    /**
     * The time in milliseconds it took to terminate the cluster and clean up any
     * associated artifacts. The total duration of the run is the sum of the
     * setup_duration, the execution_duration, and the cleanup_duration.
     */
    cleanup_duration?: number;
    /**
     * The cluster used for this run. If the run is specified to use a new
     * cluster, this field is set once the Jobs service has requested a cluster
     * for the run.
     */
    cluster_instance?: ClusterInstance;
    /**
     * A snapshot of the job?s cluster specification when this run was created.
     */
    cluster_spec?: ClusterSpec;
    /**
     * The creator user name. This field won?t be included in the response if the
     * user has already been deleted.
     */
    creator_user_name?: string;
    /**
     * The time at which this run ended in epoch milliseconds (milliseconds since
     * 1/1/1970 UTC). This field is set to 0 if the job is still running.
     */
    end_time?: number;
    /**
     * The time in milliseconds it took to execute the commands in the JAR or
     * notebook until they completed, failed, timed out, were cancelled, or
     * encountered an unexpected error.
     */
    execution_duration?: number;
    /**
     * An optional specification for a remote repository containing the notebooks
     * used by this job's notebook tasks.
     */
    git_source?: GitSource;
    /**
     * A list of job cluster specifications that can be shared and reused by
     * tasks of this job. Libraries cannot be declared in a shared job cluster.
     * You must declare dependent libraries in task settings.
     */
    job_clusters?: Array<JobCluster>;
    /**
     * The canonical identifier of the job that contains this run.
     */
    job_id?: number;
    /**
     * A unique identifier for this job run. This is set to the same value as
     * `run_id`.
     */
    number_in_job?: number;
    /**
     * If this run is a retry of a prior run attempt, this field contains the
     * run_id of the original attempt; otherwise, it is the same as the run_id.
     */
    original_attempt_run_id?: number;
    /**
     * The parameters used for this run.
     */
    overriding_parameters?: RunParameters;
    /**
     * The repair history of the run.
     */
    repair_history?: Array<RepairHistoryItem>;
    /**
     * The canonical identifier of the run. This ID is unique across all runs of
     * all jobs.
     */
    run_id?: number;
    /**
     * An optional name for the run. The maximum allowed length is 4096 bytes in
     * UTF-8 encoding.
     */
    run_name?: string;
    /**
     * The URL to the detail page of the run.
     */
    run_page_url?: string;
    run_type?: RunType;
    /**
     * The cron schedule that triggered this run if it was triggered by the
     * periodic scheduler.
     */
    schedule?: CronSchedule;
    /**
     * The time it took to set up the cluster in milliseconds. For runs that run
     * on new clusters this is the cluster creation time, for runs that run on
     * existing clusters this time should be very short.
     */
    setup_duration?: number;
    /**
     * The time at which this run was started in epoch milliseconds (milliseconds
     * since 1/1/1970 UTC). This may not be the time when the job task starts
     * executing, for example, if the job is scheduled to run on a new cluster,
     * this is the time the cluster creation call is issued.
     */
    start_time?: number;
    /**
     * The result and lifecycle states of the run.
     */
    state?: RunState;
    /**
     * The list of tasks performed by the run. Each task has its own `run_id`
     * which you can use to call `JobsGetOutput` to retrieve the run resutls.
     */
    tasks?: Array<RunTask>;
    /**
     * The type of trigger that fired this run.
     */
    trigger?: TriggerType;
}

/**
 * This describes an enum
 */
export type RunLifeCycleState =
    /**
     * An exceptional state that indicates a failure in the Jobs service, such as
     * network failure over a long period. If a run on a new cluster ends in the
     * `INTERNAL_ERROR` state, the Jobs service terminates the cluster as soon as
     * possible. This state is terminal.
     */
    | "INTERNAL_ERROR"
    /**
     * The run has been triggered. If there is not already an active run of the same
     * job, the cluster and execution context are being prepared. If there is already
     * an active run of the same job, the run immediately transitions into the
     * `SKIPPED` state without preparing any resources.
     */
    | "PENDING"
    /**
     * The task of this run is being executed.
     */
    | "RUNNING"
    /**
     * This run was aborted because a previous run of the same job was already
     * active. This state is terminal.
     */
    | "SKIPPED"
    /**
     * The task of this run has completed, and the cluster and execution context have
     * been cleaned up. This state is terminal.
     */
    | "TERMINATED"
    /**
     * The task of this run has completed, and the cluster and execution context are
     * being cleaned up.
     */
    | "TERMINATING";

export interface RunNow {
    /**
     * An optional token to guarantee the idempotency of job run requests. If a
     * run with the provided token already exists, the request does not create a
     * new run but returns the ID of the existing run instead. If a run with the
     * provided token is deleted, an error is returned.
     *
     * If you specify the idempotency token, upon failure you can retry until the
     * request succeeds. Databricks guarantees that exactly one run is launched
     * with that idempotency token.
     *
     * This token must have at most 64 characters.
     *
     * For more information, see [How to ensure idempotency for
     * jobs](https://kb.databricks.com/jobs/jobs-idempotency.html).
     */
    idempotency_token?: string;
    /**
     * A list of parameters for jobs with Spark JAR tasks, for example
     * `"jar_params": ["john doe", "35"]`. The parameters are used to invoke the
     * main function of the main class specified in the Spark JAR task. If not
     * specified upon `run-now`, it defaults to an empty list. jar_params cannot
     * be specified in conjunction with notebook_params. The JSON representation
     * of this field (for example `{"jar_params":["john doe","35"]}`) cannot
     * exceed 10,000 bytes.
     *
     * Use [Task parameter variables](..jobshtml#parameter-variables) to set
     * parameters containing information about job runs.
     */
    jar_params?: Array<string>;
    /**
     * The ID of the job to be executed
     */
    job_id?: number;
    /**
     * A map from keys to values for jobs with notebook task, for example
     * `"notebook_params": {"name": "john doe", "age": "35"}`. The map is passed
     * to the notebook and is accessible through the
     * [dbutils.widgets.get](..dev-tools/databricks-utilshtml#dbutils-widgets)
     * function.
     *
     * If not specified upon `run-now`, the triggered run uses the job?s base
     * parameters.
     *
     * notebook_params cannot be specified in conjunction with jar_params.
     *
     * Use [Task parameter variables](..jobshtml#parameter-variables) to set
     * parameters containing information about job runs.
     *
     * The JSON representation of this field (for example
     * `{"notebook_params":{"name":"john doe","age":"35"}}`) cannot exceed 10,000
     * bytes.
     */
    notebook_params?: Record<string, string>;
    pipeline_params?: PipelineParams;
    /**
     * A map from keys to values for jobs with Python wheel task, for example
     * `"python_named_params": {"name": "task", "data":
     * "dbfs:/path/to/data.json"}`.
     */
    python_named_params?: Record<string, string>;
    /**
     * A list of parameters for jobs with Python tasks, for example
     * `"python_params": ["john doe", "35"]`. The parameters are passed to Python
     * file as command-line parameters. If specified upon `run-now`, it would
     * overwrite the parameters specified in job setting. The JSON representation
     * of this field (for example `{"python_params":["john doe","35"]}`) cannot
     * exceed 10,000 bytes.
     *
     * Use [Task parameter variables](..jobshtml#parameter-variables) to set
     * parameters containing information about job runs.
     *
     * Important
     *
     * These parameters accept only Latin characters (ASCII character set). Using
     * non-ASCII characters returns an error. Examples of invalid, non-ASCII
     * characters are Chinese, Japanese kanjis, and emojis.
     */
    python_params?: Array<string>;
    /**
     * A list of parameters for jobs with spark submit task, for example
     * `"spark_submit_params": ["--class", "org.apache.spark.examples.SparkPi"]`.
     * The parameters are passed to spark-submit script as command-line
     * parameters. If specified upon `run-now`, it would overwrite the parameters
     * specified in job setting. The JSON representation of this field (for
     * example `{"python_params":["john doe","35"]}`) cannot exceed 10,000 bytes.
     *
     * Use [Task parameter variables](..jobshtml#parameter-variables) to set
     * parameters containing information about job runs.
     *
     * Important
     *
     * These parameters accept only Latin characters (ASCII character set). Using
     * non-ASCII characters returns an error. Examples of invalid, non-ASCII
     * characters are Chinese, Japanese kanjis, and emojis.
     */
    spark_submit_params?: Array<string>;
}

export interface RunNowResponse {
    /**
     * A unique identifier for this job run. This is set to the same value as
     * `run_id`.
     */
    number_in_job?: number;
    /**
     * The globally unique ID of the newly triggered run.
     */
    run_id?: number;
}

export interface RunOutput {
    /**
     * An error message indicating why a task failed or why output is not
     * available. The message is unstructured, and its exact format is subject to
     * change.
     */
    error?: string;
    /**
     * If there was an error executing the run, this field contains any available
     * stack traces.
     */
    error_trace?: string;
    /**
     * The output from tasks that write to standard streams (stdout/stderr) such
     * as
     * [SparkJarTask](..dev-tools/api/latest/jobshtml#/components/schemas/SparkJarTask),
     * [SparkPythonTask](..dev-tools/api/latest/jobshtml#/components/schemas/SparkPythonTask,
     * [PythonWheelTask](..dev-tools/api/latest/jobshtml#/components/schemas/PythonWheelTask.
     * It's not supported for the
     * [NotebookTask](..dev-tools/api/latest/jobshtml#/components/schemas/NotebookTask,
     * [PipelineTask](..dev-tools/api/latest/jobshtml#/components/schemas/PipelineTask,
     * or
     * [SparkSubmitTask](..dev-tools/api/latest/jobshtml#/components/schemas/SparkSubmitTask.
     * jobs restricts this API to return the last 5 MB of these logs.
     */
    logs?: string;
    /**
     * Whether the logs are truncated.
     */
    logs_truncated?: boolean;
    /**
     * All details of the run except for its output.
     */
    metadata?: Run;
    /**
     * The output of a notebook task, if available. A notebook task that
     * terminates (either successfully or with a failure) without calling
     * `dbutils.notebook.exit()` is considered to have an empty output. This
     * field is set but its result value is empty. jobs restricts this API to
     * return the first 5 MB of the output. To return a larger result, use the
     * [ClusterLogConf](..dev-tools/api/latest/clustershtml#clusterlogconf) field
     * to configure log storage for the job cluster.
     */
    notebook_output?: NotebookOutput;
}

export interface RunParameters {
    /**
     * A list of parameters for jobs with Spark JAR tasks, for example
     * `"jar_params": ["john doe", "35"]`. The parameters are used to invoke the
     * main function of the main class specified in the Spark JAR task. If not
     * specified upon `run-now`, it defaults to an empty list. jar_params cannot
     * be specified in conjunction with notebook_params. The JSON representation
     * of this field (for example `{"jar_params":["john doe","35"]}`) cannot
     * exceed 10,000 bytes.
     *
     * Use [Task parameter variables](..jobshtml#parameter-variables) to set
     * parameters containing information about job runs.
     */
    jar_params?: Array<string>;
    /**
     * A map from keys to values for jobs with notebook task, for example
     * `"notebook_params": {"name": "john doe", "age": "35"}`. The map is passed
     * to the notebook and is accessible through the
     * [dbutils.widgets.get](..dev-tools/databricks-utilshtml#dbutils-widgets)
     * function.
     *
     * If not specified upon `run-now`, the triggered run uses the job?s base
     * parameters.
     *
     * notebook_params cannot be specified in conjunction with jar_params.
     *
     * Use [Task parameter variables](..jobshtml#parameter-variables) to set
     * parameters containing information about job runs.
     *
     * The JSON representation of this field (for example
     * `{"notebook_params":{"name":"john doe","age":"35"}}`) cannot exceed 10,000
     * bytes.
     */
    notebook_params?: Record<string, string>;
    pipeline_params?: PipelineParams;
    /**
     * A map from keys to values for jobs with Python wheel task, for example
     * `"python_named_params": {"name": "task", "data":
     * "dbfs:/path/to/data.json"}`.
     */
    python_named_params?: Record<string, string>;
    /**
     * A list of parameters for jobs with Python tasks, for example
     * `"python_params": ["john doe", "35"]`. The parameters are passed to Python
     * file as command-line parameters. If specified upon `run-now`, it would
     * overwrite the parameters specified in job setting. The JSON representation
     * of this field (for example `{"python_params":["john doe","35"]}`) cannot
     * exceed 10,000 bytes.
     *
     * Use [Task parameter variables](..jobshtml#parameter-variables) to set
     * parameters containing information about job runs.
     *
     * Important
     *
     * These parameters accept only Latin characters (ASCII character set). Using
     * non-ASCII characters returns an error. Examples of invalid, non-ASCII
     * characters are Chinese, Japanese kanjis, and emojis.
     */
    python_params?: Array<string>;
    /**
     * A list of parameters for jobs with spark submit task, for example
     * `"spark_submit_params": ["--class", "org.apache.spark.examples.SparkPi"]`.
     * The parameters are passed to spark-submit script as command-line
     * parameters. If specified upon `run-now`, it would overwrite the parameters
     * specified in job setting. The JSON representation of this field (for
     * example `{"python_params":["john doe","35"]}`) cannot exceed 10,000 bytes.
     *
     * Use [Task parameter variables](..jobshtml#parameter-variables) to set
     * parameters containing information about job runs.
     *
     * Important
     *
     * These parameters accept only Latin characters (ASCII character set). Using
     * non-ASCII characters returns an error. Examples of invalid, non-ASCII
     * characters are Chinese, Japanese kanjis, and emojis.
     */
    spark_submit_params?: Array<string>;
}

/**
 * This describes an enum
 */
export type RunResultState =
    /**
     * The run was canceled at user request.
     */
    | "CANCELED"
    /**
     * The task completed with an error.
     */
    | "FAILED"
    /**
     * The task completed successfully.
     */
    | "SUCCESS"
    /**
     * The run was stopped after reaching the timeout.
     */
    | "TIMEDOUT";

/**
 * The result and lifecycle state of the run.
 */
export interface RunState {
    /**
     * A description of a run?s current location in the run lifecycle. This field
     * is always available in the response.
     */
    life_cycle_state?: RunLifeCycleState;
    result_state?: RunResultState;
    /**
     * A descriptive message for the current state. This field is unstructured,
     * and its exact format is subject to change.
     */
    state_message?: string;
    /**
     * Whether a run was canceled manually by a user or by the scheduler because
     * the run timed out.
     */
    user_cancelled_or_timedout?: boolean;
}

export interface RunSubmitTaskSettings {
    depends_on?: Array<TaskDependenciesItem>;
    /**
     * If existing_cluster_id, the ID of an existing cluster that is used for all
     * runs of this task. When running tasks on an existing cluster, you may need
     * to manually restart the cluster if it stops responding. We suggest running
     * jobs on new clusters for greater reliability.
     */
    existing_cluster_id?: string;
    /**
     * An optional list of libraries to be installed on the cluster that executes
     * the task. The default value is an empty list.
     */
    libraries?: Array<Library>;
    /**
     * If new_cluster, a description of a cluster that is created for each run.
     */
    new_cluster?: NewCluster;
    /**
     * If notebook_task, indicates that this task must run a notebook. This field
     * may not be specified in conjunction with spark_jar_task.
     */
    notebook_task?: NotebookTask;
    /**
     * If pipeline_task, indicates that this task must execute a Pipeline.
     */
    pipeline_task?: PipelineTask;
    /**
     * If python_wheel_task, indicates that this job must execute a PythonWheel.
     */
    python_wheel_task?: PythonWheelTask;
    /**
     * If spark_jar_task, indicates that this task must run a JAR.
     */
    spark_jar_task?: SparkJarTask;
    /**
     * If spark_python_task, indicates that this task must run a Python file.
     */
    spark_python_task?: SparkPythonTask;
    /**
     * If spark_submit_task, indicates that this task must be launched by the
     * spark submit script.
     */
    spark_submit_task?: SparkSubmitTask;
    task_key: string;
    /**
     * An optional timeout applied to each run of this job task. The default
     * behavior is to have no timeout.
     */
    timeout_seconds?: number;
}

export interface RunTask {
    /**
     * The sequence number of this run attempt for a triggered job run. The
     * initial attempt of a run has an attempt_number of 0\. If the initial run
     * attempt fails, and the job has a retry policy (`max_retries` \> 0),
     * subsequent runs are created with an `original_attempt_run_id` of the
     * original attempt?s ID and an incrementing `attempt_number`. Runs are
     * retried only until they succeed, and the maximum `attempt_number` is the
     * same as the `max_retries` value for the job.
     */
    attempt_number?: number;
    /**
     * The time in milliseconds it took to terminate the cluster and clean up any
     * associated artifacts. The total duration of the run is the sum of the
     * setup_duration, the execution_duration, and the cleanup_duration.
     */
    cleanup_duration?: number;
    /**
     * The cluster used for this run. If the run is specified to use a new
     * cluster, this field is set once the Jobs service has requested a cluster
     * for the run.
     */
    cluster_instance?: ClusterInstance;
    depends_on?: Array<TaskDependenciesItem>;
    description?: string;
    /**
     * The time at which this run ended in epoch milliseconds (milliseconds since
     * 1/1/1970 UTC). This field is set to 0 if the job is still running.
     */
    end_time?: number;
    /**
     * The time in milliseconds it took to execute the commands in the JAR or
     * notebook until they completed, failed, timed out, were cancelled, or
     * encountered an unexpected error.
     */
    execution_duration?: number;
    /**
     * If existing_cluster_id, the ID of an existing cluster that is used for all
     * runs of this job. When running jobs on an existing cluster, you may need
     * to manually restart the cluster if it stops responding. We suggest running
     * jobs on new clusters for greater reliability.
     */
    existing_cluster_id?: string;
    /**
     * An optional specification for a remote repository containing the notebooks
     * used by this job's notebook tasks.
     */
    git_source?: GitSource;
    /**
     * An optional list of libraries to be installed on the cluster that executes
     * the job. The default value is an empty list.
     */
    libraries?: Array<Library>;
    /**
     * If new_cluster, a description of a cluster that is created for each run.
     */
    new_cluster?: NewCluster;
    /**
     * If notebook_task, indicates that this job must run a notebook. This field
     * may not be specified in conjunction with spark_jar_task.
     */
    notebook_task?: NotebookTask;
    /**
     * If pipeline_task, indicates that this job must execute a Pipeline.
     */
    pipeline_task?: PipelineTask;
    /**
     * If python_wheel_task, indicates that this job must execute a PythonWheel.
     */
    python_wheel_task?: PythonWheelTask;
    /**
     * The ID of the task run.
     */
    run_id?: number;
    /**
     * The time it took to set up the cluster in milliseconds. For runs that run
     * on new clusters this is the cluster creation time, for runs that run on
     * existing clusters this time should be very short.
     */
    setup_duration?: number;
    /**
     * If spark_jar_task, indicates that this job must run a JAR.
     */
    spark_jar_task?: SparkJarTask;
    /**
     * If spark_python_task, indicates that this job must run a Python file.
     */
    spark_python_task?: SparkPythonTask;
    /**
     * If spark_submit_task, indicates that this job must be launched by the
     * spark submit script.
     */
    spark_submit_task?: SparkSubmitTask;
    /**
     * The time at which this run was started in epoch milliseconds (milliseconds
     * since 1/1/1970 UTC). This may not be the time when the job task starts
     * executing, for example, if the job is scheduled to run on a new cluster,
     * this is the time the cluster creation call is issued.
     */
    start_time?: number;
    /**
     * The result and lifecycle states of the run.
     */
    state?: RunState;
    task_key?: string;
}

/**
 * The type of the run. * `JOB_RUN` \- Normal job run. A run created with [Run
 * now](..dev-tools/api/latest/jobshtml#operation/JobsRunNow). * `WORKFLOW_RUN`
 * \- Workflow run. A run created with
 * [dbutils.notebook.run](..dev-tools/databricks-utilshtml#dbutils-workflow). *
 * `SUBMIT_RUN` \- Submit run. A run created with [Run
 * now](..dev-tools/api/latest/jobshtml#operation/JobsRunNow).
 */
export type RunType = "JOB_RUN" | "SUBMIT_RUN" | "WORKFLOW_RUN";

export interface S3StorageInfo {
    /**
     * (Optional) Set canned access control list. For example:
     * `bucket-owner-full-control`. If canned_acl is set, the cluster instance
     * profile must have `s3:PutObjectAcl` permission on the destination bucket
     * and prefix. The full list of possible canned ACLs can be found at
     * <https://docs.aws.amazon.com/AmazonS3/latest/dev/acl-overviewhtml#canned-acl>.
     * By default only the object owner gets full control. If you are using cross
     * account role for writing data, you may want to set
     * `bucket-owner-full-control` to make bucket owner able to read the logs.
     */
    canned_acl?: string;
    /**
     * S3 destination. For example: `s3://my-bucket/some-prefix` You must
     * configure the cluster with an instance profile and the instance profile
     * must have write access to the destination. You _cannot_ use AWS keys.
     */
    destination?: string;
    /**
     * (Optional)Enable server side encryption, `false` by default.
     */
    enable_encryption?: boolean;
    /**
     * (Optional) The encryption type, it could be `sse-s3` or `sse-kms`. It is
     * used only when encryption is enabled and the default type is `sse-s3`.
     */
    encryption_type?: string;
    /**
     * S3 endpoint. For example: `https://s3-us-west-2.amazonaws.com`. Either
     * region or endpoint must be set. If both are set, endpoint is used.
     */
    endpoint?: string;
    /**
     * (Optional) KMS key used if encryption is enabled and encryption type is
     * set to `sse-kms`.
     */
    kms_key?: string;
    /**
     * S3 region. For example: `us-west-2`. Either region or endpoint must be
     * set. If both are set, endpoint is used.
     */
    region?: string;
}

/**
 * Name of an Azure service principal.
 */

/**
 * An arbitrary object where the object key is a configuration propery name and
 * the value is a configuration property value.
 */

/**
 * An arbitrary object where the object key is an environment variable name and
 * the value is an environment variable value.
 */

export interface SparkJarTask {
    /**
     * Deprecated since 04/2016\. Provide a `jar` through the `libraries` field
     * instead. For an example, see
     * [Create](..dev-tools/api/latest/jobshtml#operation/JobsCreate).
     */
    jar_uri?: string;
    /**
     * The full name of the class containing the main method to be executed. This
     * class must be contained in a JAR provided as a library.
     *
     * The code must use `SparkContext.getOrCreate` to obtain a Spark context;
     * otherwise, runs of the job fail.
     */
    main_class_name?: string;
    /**
     * Parameters passed to the main method.
     *
     * Use [Task parameter variables](..jobshtml#parameter-variables) to set
     * parameters containing information about job runs.
     */
    parameters?: Array<string>;
}

export interface SparkPythonTask {
    /**
     * Command line parameters passed to the Python file.
     *
     * Use [Task parameter variables](..jobshtml#parameter-variables) to set
     * parameters containing information about job runs.
     */
    parameters?: Array<string>;
    python_file: string;
}

export interface SparkSubmitTask {
    /**
     * Command-line parameters passed to spark submit.
     *
     * Use [Task parameter variables](..jobshtml#parameter-variables) to set
     * parameters containing information about job runs.
     */
    parameters?: Array<string>;
}

export interface SubmitRun {
    /**
     * List of permissions to set on the job.
     */
    access_control_list?: Array<AccessControlRequest>;
    /**
     * An optional specification for a remote repository containing the notebooks
     * used by this job's notebook tasks.
     */
    git_source?: GitSource;
    /**
     * An optional token that can be used to guarantee the idempotency of job run
     * requests. If a run with the provided token already exists, the request
     * does not create a new run but returns the ID of the existing run instead.
     * If a run with the provided token is deleted, an error is returned.
     *
     * If you specify the idempotency token, upon failure you can retry until the
     * request succeeds. Databricks guarantees that exactly one run is launched
     * with that idempotency token.
     *
     * This token must have at most 64 characters.
     *
     * For more information, see [How to ensure idempotency for
     * jobs](https://kb.databricks.com/jobs/jobs-idempotency.html).
     */
    idempotency_token?: string;
    /**
     * An optional name for the run. The default value is `Untitled`.
     */
    run_name?: string;
    tasks?: Array<RunSubmitTaskSettings>;
    /**
     * An optional timeout applied to each run of this job. The default behavior
     * is to have no timeout.
     */
    timeout_seconds?: number;
}

export interface SubmitRunResponse {
    /**
     * The canonical identifier for the newly submitted run.
     */
    run_id?: number;
}

export interface TaskDependenciesItem {
    task_key?: string;
}

/**
 * An optional description for this task. The maximum length is 4096 bytes.
 */

/**
 * A unique name for the task. This field is used to refer to this task from
 * other tasks. This field is required and must be unique within its parent job.
 * On Update or Reset, this field is used to reference the tasks to be updated or
 * reset. The maximum length is 100 characters.
 */

/**
 * This describes an enum
 */
export type TriggerType =
    /**
     * One time triggers that fire a single run. This occurs you triggered a single
     * run on demand through the UI or the API.
     */
    | "ONE_TIME"
    /**
     * Schedules that periodically trigger runs, such as a cron scheduler.
     */
    | "PERIODIC"
    /**
     * Indicates a run that is triggered as a retry of a previously failed run. This
     * occurs when you request to re-run the job in case of failures.
     */
    | "RETRY";

export interface UpdateJob {
    /**
     * Remove top-level fields in the job settings. Removing nested fields is not
     * supported. This field is optional.
     */
    fields_to_remove?: Array<string>;
    /**
     * The canonical identifier of the job to update. This field is required.
     */
    job_id: number;
    /**
     * The new settings for the job. Any top-level fields specified in
     * `new_settings` are completely replaced. Partially updating nested fields
     * is not supported.
     *
     * Changes to the field `JobSettings.timeout_seconds` are applied to active
     * runs. Changes to other fields are applied to future runs only.
     */
    new_settings?: JobSettings;
}

/**
 * Email address for the user.
 */

export interface ViewItem {
    /**
     * Content of the view.
     */
    content?: string;
    /**
     * Name of the view item. In the case of code view, it would be the
     * notebook?s name. In the case of dashboard view, it would be the
     * dashboard?s name.
     */
    name?: string;
    /**
     * Type of the view item.
     */
    type?: ViewType;
}

/**
 * This describes an enum
 */
export type ViewType =
    /**
     * Dashboard view item.
     */
    | "DASHBOARD"
    /**
     * Notebook view item.
     */
    | "NOTEBOOK";

/**
 * This describes an enum
 */
export type ViewsToExport =
    /**
     * All views of the notebook.
     */
    | "ALL"
    /**
     * Code view of the notebook.
     */
    | "CODE"
    /**
     * All dashboard views of the notebook.
     */
    | "DASHBOARDS";

export interface CreateResponse {
    /**
     * The canonical identifier for the newly created job.
     */
    job_id?: number;
}

export interface ExportRunRequest {
    /**
     * The canonical identifier for the run. This field is required.
     */
    run_id: number;
    /**
     * Which views to export (CODE, DASHBOARDS, or ALL). Defaults to CODE.
     */
    views_to_export?: ViewsToExport;
}

export interface GetRequest {
    /**
     * The canonical identifier of the job to retrieve information about. This
     * field is required.
     */
    job_id: number;
}

export interface GetRunOutputRequest {
    /**
     * The canonical identifier for the run. This field is required.
     */
    run_id: number;
}

export interface GetRunRequest {
    /**
     * Whether to include the repair history in the response.
     */
    include_history?: boolean;
    /**
     * The canonical identifier of the run for which to retrieve the metadata.
     * This field is required.
     */
    run_id: number;
}

export interface ListRequest {
    /**
     * Whether to include task and cluster details in the response.
     */
    expand_tasks?: boolean;
    /**
     * The number of jobs to return. This value must be greater than 0 and less
     * or equal to 25. The default value is 20.
     */
    limit?: number;
    /**
     * The offset of the first job to return, relative to the most recently
     * created job.
     */
    offset?: number;
}

export interface ListResponse {
    has_more?: boolean;
    /**
     * The list of jobs.
     */
    jobs?: Array<Job>;
}

export interface ListRunsRequest {
    /**
     * If active_only is `true`, only active runs are included in the results;
     * otherwise, lists both active and completed runs. An active run is a run in
     * the `PENDING`, `RUNNING`, or `TERMINATING`. This field cannot be `true`
     * when completed_only is `true`.
     */
    active_only?: boolean;
    /**
     * If completed_only is `true`, only completed runs are included in the
     * results; otherwise, lists both active and completed runs. This field
     * cannot be `true` when active_only is `true`.
     */
    completed_only?: boolean;
    /**
     * Whether to include task and cluster details in the response.
     */
    expand_tasks?: boolean;
    /**
     * The job for which to list runs. If omitted, the Jobs service lists runs
     * from all jobs.
     */
    job_id?: number;
    /**
     * The number of runs to return. This value must be greater than 0 and less
     * than 25\. The default value is 25\. If a request specifies a limit of 0,
     * the service instead uses the maximum limit.
     */
    limit?: number;
    /**
     * The offset of the first run to return, relative to the most recent run.
     */
    offset?: number;
    /**
     * The type of runs to return. For a description of run types, see
     * [Run](..dev-tools/api/latest/jobshtml#operation/JobsRunsGet).
     */
    run_type?: ListRunsRunType;
    /**
     * Show runs that started _at or after_ this value. The value must be a UTC
     * timestamp in milliseconds. Can be combined with _start_time_to_ to filter
     * by a time range.
     */
    start_time_from?: number;
    /**
     * Show runs that started _at or before_ this value. The value must be a UTC
     * timestamp in milliseconds. Can be combined with _start_time_from_ to
     * filter by a time range.
     */
    start_time_to?: number;
}

export type ListRunsRunType = "JOB_RUN" | "SUBMIT_RUN" | "WORKFLOW_RUN";

export interface RepairRunResponse {
    /**
     * The ID of the repair.
     */
    repair_id?: number;
}

export interface PermissionLevel {}
export interface PermissionLevel {}
export interface CancelAllRunsResponse {}
export interface CancelRunResponse {}
export interface DeleteResponse {}
export interface DeleteRunResponse {}
export interface ResetResponse {}
export interface UpdateResponse {}
