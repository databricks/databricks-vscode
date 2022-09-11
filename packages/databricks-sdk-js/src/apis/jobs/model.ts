/* eslint-disable @typescript-eslint/naming-convention */

// Code generated from OpenAPI specs by Databricks SDK Generator. DO NOT EDIT.

// all definitions in this file are in alphabetical order

export interface AutoScale {
    // The maximum number of workers to which the cluster can scale up when
    // overloaded. max_workers must be strictly greater than min_workers.
    max_workers: number;
    // The minimum number of workers to which the cluster can scale down when
    // underutilized. It is also the initial number of workers the cluster has
    // after creation.
    min_workers: number;
}
export const DefaultAutoScale = {};

export interface CancelAllRuns {
    // The canonical identifier of the job to cancel all runs of. This field is
    // required.
    job_id: number;
}
export const DefaultCancelAllRuns = {};

export interface CancelRun {
    // This field is required.
    run_id: number;
}
export const DefaultCancelRun = {};

export interface ClusterInstance {
    // The canonical identifier for the cluster used by a run. This field is
    // always available for runs on existing clusters. For runs on new clusters,
    // it becomes available once the cluster is created. This value can be used
    // to view logs by browsing to `/#setting/sparkui/$cluster_id/driver-logs`.
    // The logs continue to be available after the run completes. The response
    // won?t include this field if the identifier is not available yet.
    cluster_id: string;
    // The canonical identifier for the Spark context used by a run. This field
    // is filled in once the run begins execution. This value can be used to
    // view the Spark UI by browsing to
    // `/#setting/sparkui/$cluster_id/$spark_context_id`. The Spark UI continues
    // to be available after the run has completed. The response won?t include
    // this field if the identifier is not available yet.
    spark_context_id: string;
}
export const DefaultClusterInstance = {};

export interface ClusterLogConf {
    // DBFS location of cluster log. Destination must be provided. For example,
    // `{ "dbfs" : { "destination" : "dbfs:/home/cluster_log" } }`
    dbfs?: DbfsStorageInfo;
    // S3 location of cluster log. `destination` and either `region` or
    // `endpoint` must be provided. For example, `{ "s3": { "destination" :
    // "s3://cluster_log_bucket/prefix", "region" : "us-west-2" } }`
    s3: any /* ERROR */;
}
export const DefaultClusterLogConf = {};

export interface ClusterSpec {
    // If existing_cluster_id, the ID of an existing cluster that is used for
    // all runs of this job. When running jobs on an existing cluster, you may
    // need to manually restart the cluster if it stops responding. We suggest
    // running jobs on new clusters for greater reliability.
    existing_cluster_id: string;
    // An optional list of libraries to be installed on the cluster that
    // executes the job. The default value is an empty list.
    libraries: Library[];
    // If new_cluster, a description of a cluster that is created for each run.
    new_cluster?: NewCluster;
}
export const DefaultClusterSpec = {};
// An object with key value pairs. The key length must be between 1 and 127
// UTF-8 characters, inclusive. The value length must be less than or equal to
// 255 UTF-8 characters.

export interface CreateJob {
    // List of permissions to set on the job.
    access_control_list: any /* MISSING TYPE */[];
    // An optional set of email addresses that is notified when runs of this job
    // begin or complete as well as when this job is deleted. The default
    // behavior is to not send any emails.
    email_notifications?: JobEmailNotifications;
    // Used to tell what is the format of the job. This field is ignored in
    // Create/Update/Reset calls. When using the Jobs API 2.1 this value is
    // always set to `"MULTI_TASK"`.
    format: CreateJobFormat;
    // An optional specification for a remote repository containing the
    // notebooks used by this job's notebook tasks.
    git_source?: GitSource;
    // A list of job cluster specifications that can be shared and reused by
    // tasks of this job. Libraries cannot be declared in a shared job cluster.
    // You must declare dependent libraries in task settings.
    job_clusters: JobCluster[];
    // An optional maximum allowed number of concurrent runs of the job. Set
    // this value if you want to be able to execute multiple runs of the same
    // job concurrently. This is useful for example if you trigger your job on a
    // frequent schedule and want to allow consecutive runs to overlap with each
    // other, or if you want to trigger multiple runs which differ by their
    // input parameters. This setting affects only new runs. For example,
    // suppose the job?s concurrency is 4 and there are 4 concurrent active
    // runs. Then setting the concurrency to 3 won?t kill any of the active
    // runs. However, from then on, new runs are skipped unless there are fewer
    // than 3 active runs. This value cannot exceed 1000\. Setting this value to
    // 0 causes all new runs to be skipped. The default behavior is to allow
    // only 1 concurrent run.
    max_concurrent_runs: number;
    // An optional name for the job.
    name: string;
    // An optional periodic schedule for this job. The default behavior is that
    // the job only runs when triggered by clicking ?Run Now? in the Jobs UI or
    // sending an API request to `runNow`.
    schedule?: CronSchedule;
    // A map of tags associated with the job. These are forwarded to the cluster
    // as cluster tags for jobs clusters, and are subject to the same
    // limitations as cluster tags. A maximum of 25 tags can be added to the
    // job.
    tags: any /* MISSING TYPE */;
    // A list of task specifications to be executed by this job.
    tasks: JobTaskSettings[];
    // An optional timeout applied to each run of this job. The default behavior
    // is to have no timeout.
    timeout_seconds: number;
}
export const DefaultCreateJob = {};
// Used to tell what is the format of the job. This field is ignored in
// Create/Update/Reset calls. When using the Jobs API 2.1 this value is always
// set to `"MULTI_TASK"`.
export type CreateJobFormat = "MULTITASK" | "SINGLETASK";
export interface CronSchedule {
    // Indicate whether this schedule is paused or not.
    pause_status: CronSchedulePauseStatus;
    // A Cron expression using Quartz syntax that describes the schedule for a
    // job. See [Cron
    // Trigger](http://www.quartz-scheduler.org/documentation/quartz-2.3.0/tutorials/crontrigger.html)
    // for details. This field is required.
    quartz_cron_expression: string;
    // A Java timezone ID. The schedule for a job is resolved with respect to
    // this timezone. See [Java
    // TimeZone](https://docs.oracle.com/javase/7/docs/api/java/util/TimeZone.html)
    // for details. This field is required.
    timezone_id: string;
}
export const DefaultCronSchedule = {};
// Indicate whether this schedule is paused or not.
export type CronSchedulePauseStatus = "PAUSED" | "UNPAUSED";
export interface DbfsStorageInfo {
    // DBFS destination. Example: `dbfs:/my/path`
    destination: string;
}
export const DefaultDbfsStorageInfo = {};

export interface DeleteJob {
    // The canonical identifier of the job to delete. This field is required.
    job_id: number;
}
export const DefaultDeleteJob = {};

export interface DeleteRun {
    // The canonical identifier of the run for which to retrieve the metadata.
    run_id: number;
}
export const DefaultDeleteRun = {};

export interface ExportRunOutput {
    // The exported content in HTML format (one for every view item).
    views: ViewItem[];
}
export const DefaultExportRunOutput = {};

export interface FileStorageInfo {
    // File destination. Example: `file:/my/file.sh`
    destination: string;
}
export const DefaultFileStorageInfo = {};
// Read-only state of the remote repository at the time the job was run. This
// field is only included on job runs.
export interface GitSnapshot {
    // Commit that was used to execute the run. If git_branch was specified,
    // this points to the HEAD of the branch at the time of the run; if git_tag
    // was specified, this points to the commit the tag points to.
    used_commit: string;
}
export const DefaultGitSnapshot = {};
// An optional specification for a remote repository containing the notebooks
// used by this job's notebook tasks.
export interface GitSource {
    // Name of the branch to be checked out and used by this job. This field
    // cannot be specified in conjunction with git_tag or git_commit. The
    // maximum length is 255 characters.
    git_branch: string;
    // Commit to be checked out and used by this job. This field cannot be
    // specified in conjunction with git_branch or git_tag. The maximum length
    // is 64 characters.
    git_commit: string;
    // Unique identifier of the service used to host the Git repository. The
    // value is case insensitive.
    git_provider: GitSourceGitProvider;

    git_snapshot?: GitSnapshot;
    // Name of the tag to be checked out and used by this job. This field cannot
    // be specified in conjunction with git_branch or git_commit. The maximum
    // length is 255 characters.
    git_tag: string;
    // URL of the repository to be cloned by this job. The maximum length is 300
    // characters.
    git_url: string;
}
export const DefaultGitSource = {};
// Unique identifier of the service used to host the Git repository. The value
// is case insensitive.
export type GitSourceGitProvider =
    | "AWSCODECOMMIT"
    | "AZUREDEVOPSSERVICES"
    | "BITBUCKETCLOUD"
    | "BITBUCKETSERVER"
    | "GITHUB"
    | "GITHUBENTERPRISE"
    | "GITLAB"
    | "GITLABENTERPRISEEDITION";
export interface InitScriptInfo {
    // S3 location of init script. Destination and either region or endpoint
    // must be provided. For example, `{ "s3": { "destination" :
    // "s3://init_script_bucket/prefix", "region" : "us-west-2" } }`
    s3: any /* ERROR */;
    // DBFS location of init script. Destination must be provided. For example,
    // `{ "dbfs" : { "destination" : "dbfs:/home/init_script" } }`
    dbfs?: DbfsStorageInfo;
    // File location of init script. Destination must be provided. For example,
    // `{ "file" : { "destination" : "file:/my/local/file.sh" } }`
    file?: FileStorageInfo;
}
export const DefaultInitScriptInfo = {};

export interface Job {
    // The time at which this job was created in epoch milliseconds
    // (milliseconds since 1/1/1970 UTC).
    created_time: number;
    // The creator user name. This field won?t be included in the response if
    // the user has already been deleted.
    creator_user_name: string;
    // The canonical identifier for this job.
    job_id: number;
    // Settings for this job and all of its runs. These settings can be updated
    // using the `resetJob` method.
    settings?: JobSettings;
}
export const DefaultJob = {};

export interface JobCluster {
    // A unique name for the job cluster. This field is required and must be
    // unique within the job. `JobTaskSettings` may refer to this field to
    // determine which cluster to launch for the task execution.
    job_cluster_key: string;

    new_cluster?: NewCluster;
}
export const DefaultJobCluster = {};

export interface JobEmailNotifications {
    // If true, do not send email to recipients specified in `on_failure` if the
    // run is skipped.
    no_alert_for_skipped_runs: boolean;
    // A list of email addresses to be notified when a run unsuccessfully
    // completes. A run is considered to have completed unsuccessfully if it
    // ends with an `INTERNAL_ERROR` `life_cycle_state` or a `SKIPPED`,
    // `FAILED`, or `TIMED_OUT` result_state. If this is not specified on job
    // creation, reset, or update the list is empty, and notifications are not
    // sent.
    on_failure: string[];
    // A list of email addresses to be notified when a run begins. If not
    // specified on job creation, reset, or update, the list is empty, and
    // notifications are not sent.
    on_start: string[];
    // A list of email addresses to be notified when a run successfully
    // completes. A run is considered to have completed successfully if it ends
    // with a `TERMINATED` `life_cycle_state` and a `SUCCESSFUL` result_state.
    // If not specified on job creation, reset, or update, the list is empty,
    // and notifications are not sent.
    on_success: string[];
}
export const DefaultJobEmailNotifications: Pick<
    JobEmailNotifications,
    "no_alert_for_skipped_runs"
> = {no_alert_for_skipped_runs: false};

export interface JobSettings {
    // An optional set of email addresses that is notified when runs of this job
    // begin or complete as well as when this job is deleted. The default
    // behavior is to not send any emails.
    email_notifications?: JobEmailNotifications;
    // Used to tell what is the format of the job. This field is ignored in
    // Create/Update/Reset calls. When using the Jobs API 2.1 this value is
    // always set to `"MULTI_TASK"`.
    format: JobSettingsFormat;
    // An optional specification for a remote repository containing the
    // notebooks used by this job's notebook tasks.
    git_source?: GitSource;
    // A list of job cluster specifications that can be shared and reused by
    // tasks of this job. Libraries cannot be declared in a shared job cluster.
    // You must declare dependent libraries in task settings.
    job_clusters: JobCluster[];
    // An optional maximum allowed number of concurrent runs of the job. Set
    // this value if you want to be able to execute multiple runs of the same
    // job concurrently. This is useful for example if you trigger your job on a
    // frequent schedule and want to allow consecutive runs to overlap with each
    // other, or if you want to trigger multiple runs which differ by their
    // input parameters. This setting affects only new runs. For example,
    // suppose the job?s concurrency is 4 and there are 4 concurrent active
    // runs. Then setting the concurrency to 3 won?t kill any of the active
    // runs. However, from then on, new runs are skipped unless there are fewer
    // than 3 active runs. This value cannot exceed 1000\. Setting this value to
    // 0 causes all new runs to be skipped. The default behavior is to allow
    // only 1 concurrent run.
    max_concurrent_runs: number;
    // An optional name for the job.
    name: string;
    // An optional periodic schedule for this job. The default behavior is that
    // the job only runs when triggered by clicking ?Run Now? in the Jobs UI or
    // sending an API request to `runNow`.
    schedule?: CronSchedule;
    // A map of tags associated with the job. These are forwarded to the cluster
    // as cluster tags for jobs clusters, and are subject to the same
    // limitations as cluster tags. A maximum of 25 tags can be added to the
    // job.
    tags: any /* MISSING TYPE */;
    // A list of task specifications to be executed by this job.
    tasks: JobTaskSettings[];
    // An optional timeout applied to each run of this job. The default behavior
    // is to have no timeout.
    timeout_seconds: number;
}
export const DefaultJobSettings = {};
// Used to tell what is the format of the job. This field is ignored in
// Create/Update/Reset calls. When using the Jobs API 2.1 this value is always
// set to `"MULTI_TASK"`.
export type JobSettingsFormat = "MULTITASK" | "SINGLETASK";
export interface JobTaskSettings {
    depends_on: TaskDependenciesItem[];

    description: string;
    // An optional set of email addresses that is notified when runs of this
    // task begin or complete as well as when this task is deleted. The default
    // behavior is to not send any emails.
    email_notifications?: JobEmailNotifications;
    // If existing_cluster_id, the ID of an existing cluster that is used for
    // all runs of this task. When running tasks on an existing cluster, you may
    // need to manually restart the cluster if it stops responding. We suggest
    // running jobs on new clusters for greater reliability.
    existing_cluster_id: string;
    // If job_cluster_key, this task is executed reusing the cluster specified
    // in `job.settings.job_clusters`.
    job_cluster_key: string;
    // An optional list of libraries to be installed on the cluster that
    // executes the task. The default value is an empty list.
    libraries: Library[];
    // An optional maximum number of times to retry an unsuccessful run. A run
    // is considered to be unsuccessful if it completes with the `FAILED`
    // result_state or `INTERNAL_ERROR` `life_cycle_state`. The value -1 means
    // to retry indefinitely and the value 0 means to never retry. The default
    // behavior is to never retry.
    max_retries: number;
    // An optional minimal interval in milliseconds between the start of the
    // failed run and the subsequent retry run. The default behavior is that
    // unsuccessful runs are immediately retried.
    min_retry_interval_millis: number;
    // If new_cluster, a description of a cluster that is created for each run.
    new_cluster?: NewCluster;
    // If notebook_task, indicates that this task must run a notebook. This
    // field may not be specified in conjunction with spark_jar_task.
    notebook_task?: NotebookTask;
    // If pipeline_task, indicates that this task must execute a Pipeline.
    pipeline_task?: PipelineTask;
    // If python_wheel_task, indicates that this job must execute a PythonWheel.
    python_wheel_task?: PythonWheelTask;
    // An optional policy to specify whether to retry a task when it times out.
    // The default behavior is to not retry on timeout.
    retry_on_timeout: boolean;
    // If spark_jar_task, indicates that this task must run a JAR.
    spark_jar_task?: SparkJarTask;
    // If spark_python_task, indicates that this task must run a Python file.
    spark_python_task?: SparkPythonTask;
    // If spark_submit_task, indicates that this task must be launched by the
    // spark submit script.
    spark_submit_task?: SparkSubmitTask;

    task_key: string;
    // An optional timeout applied to each run of this job task. The default
    // behavior is to have no timeout.
    timeout_seconds: number;
}
export const DefaultJobTaskSettings: Pick<JobTaskSettings, "retry_on_timeout"> =
    {
        retry_on_timeout: false,
    };

export interface Library {
    // If cran, specification of a CRAN library to be installed.
    cran?: RCranLibrary;

    egg: string;

    jar: string;
    // If maven, specification of a Maven library to be installed. For example:
    // `{ "coordinates": "org.jsoup:jsoup:1.7.2" }`
    maven?: MavenLibrary;
    // If pypi, specification of a PyPI library to be installed. Specifying the
    // `repo` field is optional and if not specified, the default pip index is
    // used. For example: `{ "package": "simplejson", "repo":
    // "https://my-repo.com" }`
    pypi?: PythonPyPiLibrary;

    whl: string;
}
export const DefaultLibrary = {};

export interface ListRunsResponse {
    // If true, additional runs matching the provided filter are available for
    // listing.
    has_more: boolean;
    // A list of runs, from most recently started to least.
    runs: Run[];
}
export const DefaultListRunsResponse: Pick<ListRunsResponse, "has_more"> = {
    has_more: false,
};

export interface MavenLibrary {
    // Gradle-style Maven coordinates. For example: `org.jsoup:jsoup:1.7.2`.
    // This field is required.
    coordinates: string;
    // List of dependences to exclude. For example: `["slf4j:slf4j",
    // "*:hadoop-client"]`. Maven dependency exclusions:
    // <https://maven.apache.org/guides/introduction/introduction-to-optional-and-excludes-dependencies.html>.
    exclusions: string[];
    // Maven repo to install the Maven package from. If omitted, both Maven
    // Central Repository and Spark Packages are searched.
    repo: string;
}
export const DefaultMavenLibrary = {};

export interface NewCluster {
    // If autoscale, the required parameters to automatically scale clusters up
    // and down based on load.
    autoscale?: AutoScale;
    // Attributes related to clusters running on Amazon Web Services. If not
    // specified at cluster creation, a set of default values is used.
    aws_attributes: any /* ERROR */;
    // Defines attributes such as the instance availability type, node
    // placement, and max bid price. If not specified during cluster creation, a
    // set of default values is used.
    azure_attributes: any /* ERROR */;
    // The configuration for delivering Spark logs to a long-term storage
    // destination. Only one destination can be specified for one cluster. If
    // the conf is given, the logs are delivered to the destination every `5
    // mins`. The destination of driver logs is
    // `<destination>/<cluster-id>/driver`, while the destination of executor
    // logs is `<destination>/<cluster-id>/executor`.
    cluster_log_conf?: ClusterLogConf;

    custom_tags: Record<string, string>;
    // The optional ID of the instance pool to use for the driver node. You must
    // also specify `instance_pool_id`. Refer to [Instance Pools
    // API](..dev-tools/api/latest/instance-poolshtml) for details.
    driver_instance_pool_id: string;
    // The node type of the Spark driver. This field is optional; if unset, the
    // driver node type is set as the same value as `node_type_id` defined
    // above.
    driver_node_type_id: string;

    enable_elastic_disk: boolean;
    // Attributes related to clusters running on Google Cloud. If not specified
    // at cluster creation, a set of default values is used.
    gcp_attributes: any /* ERROR */;
    // The configuration for storing init scripts. Any number of scripts can be
    // specified. The scripts are executed sequentially in the order provided.
    // If `cluster_log_conf` is specified, init script logs are sent to
    // `<destination>/<cluster-id>/init_scripts`.
    init_scripts: InitScriptInfo[];
    // The optional ID of the instance pool to use for cluster nodes. If
    // `driver_instance_pool_id` is present, `instance_pool_id` is used for
    // worker nodes only. Otherwise, it is used for both the driver node and
    // worker nodes. Refer to [Instance Pools
    // API](..dev-tools/api/latest/instance-poolshtml) for details.
    instance_pool_id: string;
    // This field encodes, through a single value, the resources available to
    // each of the Spark nodes in this cluster. For example, the Spark nodes can
    // be provisioned and optimized for memory or compute intensive workloads A
    // list of available node types can be retrieved by using the [List node
    // types](..dev-tools/api/latest/clustershtml#list-node-types) API call.
    // This field is required.
    node_type_id: string;
    // If num_workers, number of worker nodes that this cluster must have. A
    // cluster has one Spark driver and num_workers executors for a total of
    // num_workers + 1 Spark nodes. When reading the properties of a cluster,
    // this field reflects the desired number of workers rather than the actual
    // current number of workers. For example, if a cluster is resized from 5 to
    // 10 workers, this field immediately updates to reflect the target size of
    // 10 workers, whereas the workers listed in `spark_info` gradually increase
    // from 5 to 10 as the new nodes are provisioned.
    num_workers: number;
    // A [cluster policy](..dev-tools/api/latest/policieshtml) ID.
    policy_id: string;
    // An object containing a set of optional, user-specified Spark
    // configuration key-value pairs. You can also pass in a string of extra JVM
    // options to the driver and the executors via
    // `spark.driver.extraJavaOptions` and `spark.executor.extraJavaOptions`
    // respectively. Example Spark confs: `{"spark.speculation": true,
    // "spark.streaming.ui.retainedBatches": 5}` or
    // `{"spark.driver.extraJavaOptions": "-verbose:gc -XX:+PrintGCDetails"}`
    spark_conf: Record<string, any /* MISSING TYPE */>;
    // An object containing a set of optional, user-specified environment
    // variable key-value pairs. Key-value pair of the form (X,Y) are exported
    // as is (for example, `export X='Y'`) while launching the driver and
    // workers. To specify an additional set of `SPARK_DAEMON_JAVA_OPTS`, we
    // recommend appending them to `$SPARK_DAEMON_JAVA_OPTS` as shown in the
    // following example. This ensures that all default databricks managed
    // environmental variables are included as well. Example Spark environment
    // variables: `{"SPARK_WORKER_MEMORY": "28000m", "SPARK_LOCAL_DIRS":
    // "/local_disk0"}` or `{"SPARK_DAEMON_JAVA_OPTS": "$SPARK_DAEMON_JAVA_OPTS
    // -Dspark.shuffle.service.enabled=true"}`
    spark_env_vars: Record<string, any /* MISSING TYPE */>;
    // The Spark version of the cluster. A list of available Spark versions can
    // be retrieved by using the [Runtime
    // versions](..dev-tools/api/latest/clustershtml#runtime-versions) API call.
    // This field is required.
    spark_version: string;

    ssh_public_keys: string[];
}
export const DefaultNewCluster: Pick<NewCluster, "enable_elastic_disk"> = {
    enable_elastic_disk: false,
};

export interface NotebookOutput {
    // The value passed to
    // [dbutils.notebook.exit()](..notebooks/notebook-workflowshtml#notebook-workflows-exit).
    // jobs restricts this API to return the first 5 MB of the value. For a
    // larger result, your job can store the results in a cloud storage service.
    // This field is absent if `dbutils.notebook.exit()` was never called.
    result: string;
    // Whether or not the result was truncated.
    truncated: boolean;
}
export const DefaultNotebookOutput: Pick<NotebookOutput, "truncated"> = {
    truncated: false,
};

export interface NotebookTask {
    // Base parameters to be used for each run of this job. If the run is
    // initiated by a call to
    // [`run-now`](..dev-tools/api/latest/jobshtml#operation/JobsRunNow) with
    // parameters specified, the two parameters maps are merged. If the same key
    // is specified in `base_parameters` and in `run-now`, the value from
    // `run-now` is used. Use [Task parameter
    // variables](..jobshtml#parameter-variables) to set parameters containing
    // information about job runs. If the notebook takes a parameter that is not
    // specified in the job?s `base_parameters` or the `run-now` override
    // parameters, the default value from the notebook is used. Retrieve these
    // parameters in a notebook using
    // [dbutils.widgets.get](..dev-tools/databricks-utilshtml#dbutils-widgets).
    base_parameters: Record<string, any /* MISSING TYPE */>;
    // The path of the notebook to be run in the jobs workspace or remote
    // repository. For notebooks stored in the Databricks workspace, the path
    // must be absolute and begin with a slash. For notebooks stored in a remote
    // repository, the path must be relative. This field is required.
    notebook_path: string;
}
export const DefaultNotebookTask = {};

export interface PipelineTask {
    // If true, a full refresh will be triggered on the delta live table.
    full_refresh: boolean;
    // The full name of the pipeline task to execute.
    pipeline_id: string;
}
export const DefaultPipelineTask: Pick<PipelineTask, "full_refresh"> = {
    full_refresh: false,
};

export interface PythonPyPiLibrary {
    // The name of the PyPI package to install. An optional exact version
    // specification is also supported. Examples: `simplejson` and
    // `simplejson==3.8.0`. This field is required.
    package: string;
    // The repository where the package can be found. If not specified, the
    // default pip index is used.
    repo: string;
}
export const DefaultPythonPyPiLibrary = {};

export interface PythonWheelTask {
    // Named entry point to use, if it does not exist in the metadata of the
    // package it executes the function from the package directly using
    // `$packageName.$entryPoint()`
    entry_point: string;
    // Command-line parameters passed to Python wheel task in the form of
    // `["--name=task", "--data=dbfs:/path/to/data.json"]`. Leave it empty if
    // `parameters` is not null.
    named_parameters: any /* MISSING TYPE */;
    // Name of the package to execute
    package_name: string;
    // Command-line parameters passed to Python wheel task. Leave it empty if
    // `named_parameters` is not null.
    parameters: string[];
}
export const DefaultPythonWheelTask = {};

export interface RCranLibrary {
    // The name of the CRAN package to install. This field is required.
    package: string;
    // The repository where the package can be found. If not specified, the
    // default CRAN repo is used.
    repo: string;
}
export const DefaultRCranLibrary = {};

export interface RepairHistoryItem {
    // The end time of the (repaired) run.
    end_time: number;
    // The ID of the repair. Only returned for the items that represent a repair
    // in `repair_history`.
    id: number;
    // The start time of the (repaired) run.
    start_time: number;

    state?: RunState;
    // The run IDs of the task runs that ran as part of this repair history
    // item.
    task_run_ids: number[];
    // The repair history item type. Indicates whether a run is the original run
    // or a repair run.
    type: RepairHistoryItemType;
}
export const DefaultRepairHistoryItem = {};
// The repair history item type. Indicates whether a run is the original run or
// a repair run.
export type RepairHistoryItemType = "ORIGINAL" | "REPAIR";
export interface RepairRun {
    // A list of parameters for jobs with Spark JAR tasks, for example
    // `"jar_params": ["john doe", "35"]`. The parameters are used to invoke the
    // main function of the main class specified in the Spark JAR task. If not
    // specified upon `run-now`, it defaults to an empty list. jar_params cannot
    // be specified in conjunction with notebook_params. The JSON representation
    // of this field (for example `{"jar_params":["john doe","35"]}`) cannot
    // exceed 10,000 bytes. Use [Task parameter
    // variables](..jobshtml#parameter-variables) to set parameters containing
    // information about job runs.
    jar_params: string[];
    // The ID of the latest repair. This parameter is not required when
    // repairing a run for the first time, but must be provided on subsequent
    // requests to repair the same run.
    latest_repair_id: number;
    // A map from keys to values for jobs with notebook task, for example
    // `"notebook_params": {"name": "john doe", "age": "35"}`. The map is passed
    // to the notebook and is accessible through the
    // [dbutils.widgets.get](..dev-tools/databricks-utilshtml#dbutils-widgets)
    // function. If not specified upon `run-now`, the triggered run uses the
    // job?s base parameters. notebook_params cannot be specified in conjunction
    // with jar_params. Use [Task parameter
    // variables](..jobshtml#parameter-variables) to set parameters containing
    // information about job runs. The JSON representation of this field (for
    // example `{"notebook_params":{"name":"john doe","age":"35"}}`) cannot
    // exceed 10,000 bytes.
    notebook_params: Record<string, string>;

    pipeline_params?: RepairRunPipelineParams;
    // A map from keys to values for jobs with Python wheel task, for example
    // `"python_named_params": {"name": "task", "data":
    // "dbfs:/path/to/data.json"}`.
    python_named_params: Record<string, string>;
    // A list of parameters for jobs with Python tasks, for example
    // `"python_params": ["john doe", "35"]`. The parameters are passed to
    // Python file as command-line parameters. If specified upon `run-now`, it
    // would overwrite the parameters specified in job setting. The JSON
    // representation of this field (for example `{"python_params":["john
    // doe","35"]}`) cannot exceed 10,000 bytes. Use [Task parameter
    // variables](..jobshtml#parameter-variables) to set parameters containing
    // information about job runs. Important These parameters accept only Latin
    // characters (ASCII character set). Using non-ASCII characters returns an
    // error. Examples of invalid, non-ASCII characters are Chinese, Japanese
    // kanjis, and emojis.
    python_params: string[];
    // The task keys of the task runs to repair.
    rerun_tasks: string[];
    // The job run ID of the run to repair. The run must not be in progress.
    run_id: number;
    // A list of parameters for jobs with spark submit task, for example
    // `"spark_submit_params": ["--class",
    // "org.apache.spark.examples.SparkPi"]`. The parameters are passed to
    // spark-submit script as command-line parameters. If specified upon
    // `run-now`, it would overwrite the parameters specified in job setting.
    // The JSON representation of this field (for example
    // `{"python_params":["john doe","35"]}`) cannot exceed 10,000 bytes. Use
    // [Task parameter variables](..jobshtml#parameter-variables) to set
    // parameters containing information about job runs. Important These
    // parameters accept only Latin characters (ASCII character set). Using
    // non-ASCII characters returns an error. Examples of invalid, non-ASCII
    // characters are Chinese, Japanese kanjis, and emojis.
    spark_submit_params: string[];
}
export const DefaultRepairRun = {};

export interface RepairRunPipelineParams {
    // If true, triggers a full refresh on the delta live table.
    full_refresh: boolean;
}
export const DefaultRepairRunPipelineParams: Pick<
    RepairRunPipelineParams,
    "full_refresh"
> = {full_refresh: false};

export interface ResetJob {
    // The canonical identifier of the job to reset. This field is required.
    job_id: number;
    // The new settings of the job. These settings completely replace the old
    // settings. Changes to the field `JobSettings.timeout_seconds` are applied
    // to active runs. Changes to other fields are applied to future runs only.
    new_settings?: JobSettings;
}
export const DefaultResetJob = {};

export interface Run {
    // The sequence number of this run attempt for a triggered job run. The
    // initial attempt of a run has an attempt_number of 0\. If the initial run
    // attempt fails, and the job has a retry policy (`max_retries` \> 0),
    // subsequent runs are created with an `original_attempt_run_id` of the
    // original attempt?s ID and an incrementing `attempt_number`. Runs are
    // retried only until they succeed, and the maximum `attempt_number` is the
    // same as the `max_retries` value for the job.
    attempt_number: number;
    // The time in milliseconds it took to terminate the cluster and clean up
    // any associated artifacts. The total duration of the run is the sum of the
    // setup_duration, the execution_duration, and the cleanup_duration.
    cleanup_duration: number;
    // The cluster used for this run. If the run is specified to use a new
    // cluster, this field is set once the Jobs service has requested a cluster
    // for the run.
    cluster_instance?: ClusterInstance;
    // A snapshot of the job?s cluster specification when this run was created.
    cluster_spec?: ClusterSpec;
    // The creator user name. This field won?t be included in the response if
    // the user has already been deleted.
    creator_user_name: string;
    // The time at which this run ended in epoch milliseconds (milliseconds
    // since 1/1/1970 UTC). This field is set to 0 if the job is still running.
    end_time: number;
    // The time in milliseconds it took to execute the commands in the JAR or
    // notebook until they completed, failed, timed out, were cancelled, or
    // encountered an unexpected error.
    execution_duration: number;
    // An optional specification for a remote repository containing the
    // notebooks used by this job's notebook tasks.
    git_source?: GitSource;
    // A list of job cluster specifications that can be shared and reused by
    // tasks of this job. Libraries cannot be declared in a shared job cluster.
    // You must declare dependent libraries in task settings.
    job_clusters: JobCluster[];
    // The canonical identifier of the job that contains this run.
    job_id: number;
    // A unique identifier for this job run. This is set to the same value as
    // `run_id`.
    number_in_job: number;
    // If this run is a retry of a prior run attempt, this field contains the
    // run_id of the original attempt; otherwise, it is the same as the run_id.
    original_attempt_run_id: number;
    // The parameters used for this run.
    overriding_parameters?: RunParameters;
    // The repair history of the run.
    repair_history: RepairHistoryItem[];
    // The canonical identifier of the run. This ID is unique across all runs of
    // all jobs.
    run_id: number;
    // An optional name for the run. The maximum allowed length is 4096 bytes in
    // UTF-8 encoding.
    run_name: string;
    // The URL to the detail page of the run.
    run_page_url: string;

    run_type: RunType;
    // The cron schedule that triggered this run if it was triggered by the
    // periodic scheduler.
    schedule?: CronSchedule;
    // The time it took to set up the cluster in milliseconds. For runs that run
    // on new clusters this is the cluster creation time, for runs that run on
    // existing clusters this time should be very short.
    setup_duration: number;
    // The time at which this run was started in epoch milliseconds
    // (milliseconds since 1/1/1970 UTC). This may not be the time when the job
    // task starts executing, for example, if the job is scheduled to run on a
    // new cluster, this is the time the cluster creation call is issued.
    start_time: number;
    // The result and lifecycle states of the run.
    state?: RunState;
    // The list of tasks performed by the run. Each task has its own `run_id`
    // which you can use to call `JobsGetOutput` to retrieve the run resutls.
    tasks: RunTask[];
    // The type of trigger that fired this run.
    trigger: TriggerType;
}
export const DefaultRun = {};
// * `PENDING`: The run has been triggered. If there is not already an active
// run of the same job, the cluster and execution context are being prepared. If
// there is already an active run of the same job, the run immediately
// transitions into the `SKIPPED` state without preparing any resources. *
// `RUNNING`: The task of this run is being executed. * `TERMINATING`: The task
// of this run has completed, and the cluster and execution context are being
// cleaned up. * `TERMINATED`: The task of this run has completed, and the
// cluster and execution context have been cleaned up. This state is terminal. *
// `SKIPPED`: This run was aborted because a previous run of the same job was
// already active. This state is terminal. * `INTERNAL_ERROR`: An exceptional
// state that indicates a failure in the Jobs service, such as network failure
// over a long period. If a run on a new cluster ends in the `INTERNAL_ERROR`
// state, the Jobs service terminates the cluster as soon as possible. This
// state is terminal.
export type RunLifeCycleState =
    // * `PENDING`: The run has been triggered. If there is not already an active
    // run of the same job, the cluster and execution context are being prepared. If
    // there is already an active run of the same job, the run immediately
    // transitions into the `SKIPPED` state without preparing any resources. *
    // `RUNNING`: The task of this run is being executed. * `TERMINATING`: The task
    // of this run has completed, and the cluster and execution context are being
    // cleaned up. * `TERMINATED`: The task of this run has completed, and the
    // cluster and execution context have been cleaned up. This state is terminal. *
    // `SKIPPED`: This run was aborted because a previous run of the same job was
    // already active. This state is terminal. * `INTERNAL_ERROR`: An exceptional
    // state that indicates a failure in the Jobs service, such as network failure
    // over a long period. If a run on a new cluster ends in the `INTERNAL_ERROR`
    // state, the Jobs service terminates the cluster as soon as possible. This
    // state is terminal.
    | "INTERNALERROR"
    // * `PENDING`: The run has been triggered. If there is not already an active
    // run of the same job, the cluster and execution context are being prepared. If
    // there is already an active run of the same job, the run immediately
    // transitions into the `SKIPPED` state without preparing any resources. *
    // `RUNNING`: The task of this run is being executed. * `TERMINATING`: The task
    // of this run has completed, and the cluster and execution context are being
    // cleaned up. * `TERMINATED`: The task of this run has completed, and the
    // cluster and execution context have been cleaned up. This state is terminal. *
    // `SKIPPED`: This run was aborted because a previous run of the same job was
    // already active. This state is terminal. * `INTERNAL_ERROR`: An exceptional
    // state that indicates a failure in the Jobs service, such as network failure
    // over a long period. If a run on a new cluster ends in the `INTERNAL_ERROR`
    // state, the Jobs service terminates the cluster as soon as possible. This
    // state is terminal.
    | "PENDING"
    // * `PENDING`: The run has been triggered. If there is not already an active
    // run of the same job, the cluster and execution context are being prepared. If
    // there is already an active run of the same job, the run immediately
    // transitions into the `SKIPPED` state without preparing any resources. *
    // `RUNNING`: The task of this run is being executed. * `TERMINATING`: The task
    // of this run has completed, and the cluster and execution context are being
    // cleaned up. * `TERMINATED`: The task of this run has completed, and the
    // cluster and execution context have been cleaned up. This state is terminal. *
    // `SKIPPED`: This run was aborted because a previous run of the same job was
    // already active. This state is terminal. * `INTERNAL_ERROR`: An exceptional
    // state that indicates a failure in the Jobs service, such as network failure
    // over a long period. If a run on a new cluster ends in the `INTERNAL_ERROR`
    // state, the Jobs service terminates the cluster as soon as possible. This
    // state is terminal.
    | "RUNNING"
    // * `PENDING`: The run has been triggered. If there is not already an active
    // run of the same job, the cluster and execution context are being prepared. If
    // there is already an active run of the same job, the run immediately
    // transitions into the `SKIPPED` state without preparing any resources. *
    // `RUNNING`: The task of this run is being executed. * `TERMINATING`: The task
    // of this run has completed, and the cluster and execution context are being
    // cleaned up. * `TERMINATED`: The task of this run has completed, and the
    // cluster and execution context have been cleaned up. This state is terminal. *
    // `SKIPPED`: This run was aborted because a previous run of the same job was
    // already active. This state is terminal. * `INTERNAL_ERROR`: An exceptional
    // state that indicates a failure in the Jobs service, such as network failure
    // over a long period. If a run on a new cluster ends in the `INTERNAL_ERROR`
    // state, the Jobs service terminates the cluster as soon as possible. This
    // state is terminal.
    | "SKIPPED"
    // * `PENDING`: The run has been triggered. If there is not already an active
    // run of the same job, the cluster and execution context are being prepared. If
    // there is already an active run of the same job, the run immediately
    // transitions into the `SKIPPED` state without preparing any resources. *
    // `RUNNING`: The task of this run is being executed. * `TERMINATING`: The task
    // of this run has completed, and the cluster and execution context are being
    // cleaned up. * `TERMINATED`: The task of this run has completed, and the
    // cluster and execution context have been cleaned up. This state is terminal. *
    // `SKIPPED`: This run was aborted because a previous run of the same job was
    // already active. This state is terminal. * `INTERNAL_ERROR`: An exceptional
    // state that indicates a failure in the Jobs service, such as network failure
    // over a long period. If a run on a new cluster ends in the `INTERNAL_ERROR`
    // state, the Jobs service terminates the cluster as soon as possible. This
    // state is terminal.
    | "TERMINATED"
    // * `PENDING`: The run has been triggered. If there is not already an active
    // run of the same job, the cluster and execution context are being prepared. If
    // there is already an active run of the same job, the run immediately
    // transitions into the `SKIPPED` state without preparing any resources. *
    // `RUNNING`: The task of this run is being executed. * `TERMINATING`: The task
    // of this run has completed, and the cluster and execution context are being
    // cleaned up. * `TERMINATED`: The task of this run has completed, and the
    // cluster and execution context have been cleaned up. This state is terminal. *
    // `SKIPPED`: This run was aborted because a previous run of the same job was
    // already active. This state is terminal. * `INTERNAL_ERROR`: An exceptional
    // state that indicates a failure in the Jobs service, such as network failure
    // over a long period. If a run on a new cluster ends in the `INTERNAL_ERROR`
    // state, the Jobs service terminates the cluster as soon as possible. This
    // state is terminal.
    | "TERMINATING";
export interface RunNow {
    // An optional token to guarantee the idempotency of job run requests. If a
    // run with the provided token already exists, the request does not create a
    // new run but returns the ID of the existing run instead. If a run with the
    // provided token is deleted, an error is returned. If you specify the
    // idempotency token, upon failure you can retry until the request succeeds.
    // Databricks guarantees that exactly one run is launched with that
    // idempotency token. This token must have at most 64 characters. For more
    // information, see [How to ensure idempotency for
    // jobs](https://kb.databricks.com/jobs/jobs-idempotency.html).
    idempotency_token: string;
    // A list of parameters for jobs with Spark JAR tasks, for example
    // `"jar_params": ["john doe", "35"]`. The parameters are used to invoke the
    // main function of the main class specified in the Spark JAR task. If not
    // specified upon `run-now`, it defaults to an empty list. jar_params cannot
    // be specified in conjunction with notebook_params. The JSON representation
    // of this field (for example `{"jar_params":["john doe","35"]}`) cannot
    // exceed 10,000 bytes. Use [Task parameter
    // variables](..jobshtml#parameter-variables) to set parameters containing
    // information about job runs.
    jar_params: string[];
    // The ID of the job to be executed
    job_id: number;
    // A map from keys to values for jobs with notebook task, for example
    // `"notebook_params": {"name": "john doe", "age": "35"}`. The map is passed
    // to the notebook and is accessible through the
    // [dbutils.widgets.get](..dev-tools/databricks-utilshtml#dbutils-widgets)
    // function. If not specified upon `run-now`, the triggered run uses the
    // job?s base parameters. notebook_params cannot be specified in conjunction
    // with jar_params. Use [Task parameter
    // variables](..jobshtml#parameter-variables) to set parameters containing
    // information about job runs. The JSON representation of this field (for
    // example `{"notebook_params":{"name":"john doe","age":"35"}}`) cannot
    // exceed 10,000 bytes.
    notebook_params: Record<string, string>;

    pipeline_params?: RunNowPipelineParams;
    // A map from keys to values for jobs with Python wheel task, for example
    // `"python_named_params": {"name": "task", "data":
    // "dbfs:/path/to/data.json"}`.
    python_named_params: Record<string, string>;
    // A list of parameters for jobs with Python tasks, for example
    // `"python_params": ["john doe", "35"]`. The parameters are passed to
    // Python file as command-line parameters. If specified upon `run-now`, it
    // would overwrite the parameters specified in job setting. The JSON
    // representation of this field (for example `{"python_params":["john
    // doe","35"]}`) cannot exceed 10,000 bytes. Use [Task parameter
    // variables](..jobshtml#parameter-variables) to set parameters containing
    // information about job runs. Important These parameters accept only Latin
    // characters (ASCII character set). Using non-ASCII characters returns an
    // error. Examples of invalid, non-ASCII characters are Chinese, Japanese
    // kanjis, and emojis.
    python_params: string[];
    // A list of parameters for jobs with spark submit task, for example
    // `"spark_submit_params": ["--class",
    // "org.apache.spark.examples.SparkPi"]`. The parameters are passed to
    // spark-submit script as command-line parameters. If specified upon
    // `run-now`, it would overwrite the parameters specified in job setting.
    // The JSON representation of this field (for example
    // `{"python_params":["john doe","35"]}`) cannot exceed 10,000 bytes. Use
    // [Task parameter variables](..jobshtml#parameter-variables) to set
    // parameters containing information about job runs. Important These
    // parameters accept only Latin characters (ASCII character set). Using
    // non-ASCII characters returns an error. Examples of invalid, non-ASCII
    // characters are Chinese, Japanese kanjis, and emojis.
    spark_submit_params: string[];
}
export const DefaultRunNow = {};

export interface RunNowPipelineParams {
    // If true, triggers a full refresh on the delta live table.
    full_refresh: boolean;
}
export const DefaultRunNowPipelineParams: Pick<
    RunNowPipelineParams,
    "full_refresh"
> = {full_refresh: false};

export interface RunNowResponse {
    // A unique identifier for this job run. This is set to the same value as
    // `run_id`.
    number_in_job: number;
    // The globally unique ID of the newly triggered run.
    run_id: number;
}
export const DefaultRunNowResponse = {};

export interface RunOutput {
    // An error message indicating why a task failed or why output is not
    // available. The message is unstructured, and its exact format is subject
    // to change.
    error: string;
    // If there was an error executing the run, this field contains any
    // available stack traces.
    error_trace: string;
    // The output from tasks that write to standard streams (stdout/stderr) such
    // as
    // [SparkJarTask](..dev-tools/api/latest/jobshtml#/components/schemas/SparkJarTask),
    // [SparkPythonTask](..dev-tools/api/latest/jobshtml#/components/schemas/SparkPythonTask,
    // [PythonWheelTask](..dev-tools/api/latest/jobshtml#/components/schemas/PythonWheelTask.
    // It's not supported for the
    // [NotebookTask](..dev-tools/api/latest/jobshtml#/components/schemas/NotebookTask,
    // [PipelineTask](..dev-tools/api/latest/jobshtml#/components/schemas/PipelineTask,
    // or
    // [SparkSubmitTask](..dev-tools/api/latest/jobshtml#/components/schemas/SparkSubmitTask.
    // jobs restricts this API to return the last 5 MB of these logs.
    logs: string;
    // Whether the logs are truncated.
    logs_truncated: boolean;
    // All details of the run except for its output.
    metadata?: Run;
    // The output of a notebook task, if available. A notebook task that
    // terminates (either successfully or with a failure) without calling
    // `dbutils.notebook.exit()` is considered to have an empty output. This
    // field is set but its result value is empty. jobs restricts this API to
    // return the first 5 MB of the output. To return a larger result, use the
    // [ClusterLogConf](..dev-tools/api/latest/clustershtml#clusterlogconf)
    // field to configure log storage for the job cluster.
    notebook_output?: NotebookOutput;
}
export const DefaultRunOutput: Pick<RunOutput, "logs_truncated"> = {
    logs_truncated: false,
};

export interface RunParameters {
    // A list of parameters for jobs with Spark JAR tasks, for example
    // `"jar_params": ["john doe", "35"]`. The parameters are used to invoke the
    // main function of the main class specified in the Spark JAR task. If not
    // specified upon `run-now`, it defaults to an empty list. jar_params cannot
    // be specified in conjunction with notebook_params. The JSON representation
    // of this field (for example `{"jar_params":["john doe","35"]}`) cannot
    // exceed 10,000 bytes. Use [Task parameter
    // variables](..jobshtml#parameter-variables) to set parameters containing
    // information about job runs.
    jar_params: string[];
    // A map from keys to values for jobs with notebook task, for example
    // `"notebook_params": {"name": "john doe", "age": "35"}`. The map is passed
    // to the notebook and is accessible through the
    // [dbutils.widgets.get](..dev-tools/databricks-utilshtml#dbutils-widgets)
    // function. If not specified upon `run-now`, the triggered run uses the
    // job?s base parameters. notebook_params cannot be specified in conjunction
    // with jar_params. Use [Task parameter
    // variables](..jobshtml#parameter-variables) to set parameters containing
    // information about job runs. The JSON representation of this field (for
    // example `{"notebook_params":{"name":"john doe","age":"35"}}`) cannot
    // exceed 10,000 bytes.
    notebook_params: Record<string, string>;

    pipeline_params?: RunParametersPipelineParams;
    // A map from keys to values for jobs with Python wheel task, for example
    // `"python_named_params": {"name": "task", "data":
    // "dbfs:/path/to/data.json"}`.
    python_named_params: Record<string, string>;
    // A list of parameters for jobs with Python tasks, for example
    // `"python_params": ["john doe", "35"]`. The parameters are passed to
    // Python file as command-line parameters. If specified upon `run-now`, it
    // would overwrite the parameters specified in job setting. The JSON
    // representation of this field (for example `{"python_params":["john
    // doe","35"]}`) cannot exceed 10,000 bytes. Use [Task parameter
    // variables](..jobshtml#parameter-variables) to set parameters containing
    // information about job runs. Important These parameters accept only Latin
    // characters (ASCII character set). Using non-ASCII characters returns an
    // error. Examples of invalid, non-ASCII characters are Chinese, Japanese
    // kanjis, and emojis.
    python_params: string[];
    // A list of parameters for jobs with spark submit task, for example
    // `"spark_submit_params": ["--class",
    // "org.apache.spark.examples.SparkPi"]`. The parameters are passed to
    // spark-submit script as command-line parameters. If specified upon
    // `run-now`, it would overwrite the parameters specified in job setting.
    // The JSON representation of this field (for example
    // `{"python_params":["john doe","35"]}`) cannot exceed 10,000 bytes. Use
    // [Task parameter variables](..jobshtml#parameter-variables) to set
    // parameters containing information about job runs. Important These
    // parameters accept only Latin characters (ASCII character set). Using
    // non-ASCII characters returns an error. Examples of invalid, non-ASCII
    // characters are Chinese, Japanese kanjis, and emojis.
    spark_submit_params: string[];
}
export const DefaultRunParameters = {};

export interface RunParametersPipelineParams {
    // If true, triggers a full refresh on the delta live table.
    full_refresh: boolean;
}
export const DefaultRunParametersPipelineParams: Pick<
    RunParametersPipelineParams,
    "full_refresh"
> = {full_refresh: false};
// * `SUCCESS`: The task completed successfully. * `FAILED`: The task completed
// with an error. * `TIMEDOUT`: The run was stopped after reaching the timeout.
// * `CANCELED`: The run was canceled at user request.
export type RunResultState =
    // * `SUCCESS`: The task completed successfully. * `FAILED`: The task completed
    // with an error. * `TIMEDOUT`: The run was stopped after reaching the timeout.
    // * `CANCELED`: The run was canceled at user request.
    | "CANCELED"
    // * `SUCCESS`: The task completed successfully. * `FAILED`: The task completed
    // with an error. * `TIMEDOUT`: The run was stopped after reaching the timeout.
    // * `CANCELED`: The run was canceled at user request.
    | "FAILED"
    // * `SUCCESS`: The task completed successfully. * `FAILED`: The task completed
    // with an error. * `TIMEDOUT`: The run was stopped after reaching the timeout.
    // * `CANCELED`: The run was canceled at user request.
    | "SUCCESS"
    // * `SUCCESS`: The task completed successfully. * `FAILED`: The task completed
    // with an error. * `TIMEDOUT`: The run was stopped after reaching the timeout.
    // * `CANCELED`: The run was canceled at user request.
    | "TIMEDOUT"; // The result and lifecycle state of the run.
export interface RunState {
    // A description of a run?s current location in the run lifecycle. This
    // field is always available in the response.
    life_cycle_state: RunLifeCycleState;

    result_state: RunResultState;
    // A descriptive message for the current state. This field is unstructured,
    // and its exact format is subject to change.
    state_message: string;
    // Whether a run was canceled manually by a user or by the scheduler because
    // the run timed out.
    user_cancelled_or_timedout: boolean;
}
export const DefaultRunState: Pick<RunState, "user_cancelled_or_timedout"> = {
    user_cancelled_or_timedout: false,
};

export interface RunSubmitTaskSettings {
    depends_on: TaskDependenciesItem[];
    // If existing_cluster_id, the ID of an existing cluster that is used for
    // all runs of this task. When running tasks on an existing cluster, you may
    // need to manually restart the cluster if it stops responding. We suggest
    // running jobs on new clusters for greater reliability.
    existing_cluster_id: string;
    // An optional list of libraries to be installed on the cluster that
    // executes the task. The default value is an empty list.
    libraries: Library[];
    // If new_cluster, a description of a cluster that is created for each run.
    new_cluster?: NewCluster;
    // If notebook_task, indicates that this task must run a notebook. This
    // field may not be specified in conjunction with spark_jar_task.
    notebook_task?: NotebookTask;
    // If pipeline_task, indicates that this task must execute a Pipeline.
    pipeline_task?: PipelineTask;
    // If python_wheel_task, indicates that this job must execute a PythonWheel.
    python_wheel_task?: PythonWheelTask;
    // If spark_jar_task, indicates that this task must run a JAR.
    spark_jar_task?: SparkJarTask;
    // If spark_python_task, indicates that this task must run a Python file.
    spark_python_task?: SparkPythonTask;
    // If spark_submit_task, indicates that this task must be launched by the
    // spark submit script.
    spark_submit_task?: SparkSubmitTask;

    task_key: string;
    // An optional timeout applied to each run of this job task. The default
    // behavior is to have no timeout.
    timeout_seconds: number;
}
export const DefaultRunSubmitTaskSettings = {};

export interface RunTask {
    // The sequence number of this run attempt for a triggered job run. The
    // initial attempt of a run has an attempt_number of 0\. If the initial run
    // attempt fails, and the job has a retry policy (`max_retries` \> 0),
    // subsequent runs are created with an `original_attempt_run_id` of the
    // original attempt?s ID and an incrementing `attempt_number`. Runs are
    // retried only until they succeed, and the maximum `attempt_number` is the
    // same as the `max_retries` value for the job.
    attempt_number: number;
    // The time in milliseconds it took to terminate the cluster and clean up
    // any associated artifacts. The total duration of the run is the sum of the
    // setup_duration, the execution_duration, and the cleanup_duration.
    cleanup_duration: number;
    // The cluster used for this run. If the run is specified to use a new
    // cluster, this field is set once the Jobs service has requested a cluster
    // for the run.
    cluster_instance?: ClusterInstance;

    depends_on: TaskDependenciesItem[];

    description: string;
    // The time at which this run ended in epoch milliseconds (milliseconds
    // since 1/1/1970 UTC). This field is set to 0 if the job is still running.
    end_time: number;
    // The time in milliseconds it took to execute the commands in the JAR or
    // notebook until they completed, failed, timed out, were cancelled, or
    // encountered an unexpected error.
    execution_duration: number;
    // If existing_cluster_id, the ID of an existing cluster that is used for
    // all runs of this job. When running jobs on an existing cluster, you may
    // need to manually restart the cluster if it stops responding. We suggest
    // running jobs on new clusters for greater reliability.
    existing_cluster_id: string;
    // An optional specification for a remote repository containing the
    // notebooks used by this job's notebook tasks.
    git_source?: GitSource;
    // An optional list of libraries to be installed on the cluster that
    // executes the job. The default value is an empty list.
    libraries: Library[];
    // If new_cluster, a description of a cluster that is created for each run.
    new_cluster?: NewCluster;
    // If notebook_task, indicates that this job must run a notebook. This field
    // may not be specified in conjunction with spark_jar_task.
    notebook_task?: NotebookTask;
    // If pipeline_task, indicates that this job must execute a Pipeline.
    pipeline_task?: PipelineTask;
    // If python_wheel_task, indicates that this job must execute a PythonWheel.
    python_wheel_task?: PythonWheelTask;
    // The ID of the task run.
    run_id: number;
    // The time it took to set up the cluster in milliseconds. For runs that run
    // on new clusters this is the cluster creation time, for runs that run on
    // existing clusters this time should be very short.
    setup_duration: number;
    // If spark_jar_task, indicates that this job must run a JAR.
    spark_jar_task?: SparkJarTask;
    // If spark_python_task, indicates that this job must run a Python file.
    spark_python_task?: SparkPythonTask;
    // If spark_submit_task, indicates that this job must be launched by the
    // spark submit script.
    spark_submit_task?: SparkSubmitTask;
    // The time at which this run was started in epoch milliseconds
    // (milliseconds since 1/1/1970 UTC). This may not be the time when the job
    // task starts executing, for example, if the job is scheduled to run on a
    // new cluster, this is the time the cluster creation call is issued.
    start_time: number;
    // The result and lifecycle states of the run.
    state?: RunState;

    task_key: string;
}
export const DefaultRunTask = {};
// The type of the run. * `JOB_RUN` \- Normal job run. A run created with [Run
// now](..dev-tools/api/latest/jobshtml#operation/JobsRunNow). * `WORKFLOW_RUN`
// \- Workflow run. A run created with
// [dbutils.notebook.run](..dev-tools/databricks-utilshtml#dbutils-workflow). *
// `SUBMIT_RUN` \- Submit run. A run created with [Run
// now](..dev-tools/api/latest/jobshtml#operation/JobsRunNow).
export type RunType =
    // The type of the run. * `JOB_RUN` \- Normal job run. A run created with [Run
    // now](..dev-tools/api/latest/jobshtml#operation/JobsRunNow). * `WORKFLOW_RUN`
    // \- Workflow run. A run created with
    // [dbutils.notebook.run](..dev-tools/databricks-utilshtml#dbutils-workflow). *
    // `SUBMIT_RUN` \- Submit run. A run created with [Run
    // now](..dev-tools/api/latest/jobshtml#operation/JobsRunNow).
    | "JOBRUN"
    // The type of the run. * `JOB_RUN` \- Normal job run. A run created with [Run
    // now](..dev-tools/api/latest/jobshtml#operation/JobsRunNow). * `WORKFLOW_RUN`
    // \- Workflow run. A run created with
    // [dbutils.notebook.run](..dev-tools/databricks-utilshtml#dbutils-workflow). *
    // `SUBMIT_RUN` \- Submit run. A run created with [Run
    // now](..dev-tools/api/latest/jobshtml#operation/JobsRunNow).
    | "SUBMITRUN"
    // The type of the run. * `JOB_RUN` \- Normal job run. A run created with [Run
    // now](..dev-tools/api/latest/jobshtml#operation/JobsRunNow). * `WORKFLOW_RUN`
    // \- Workflow run. A run created with
    // [dbutils.notebook.run](..dev-tools/databricks-utilshtml#dbutils-workflow). *
    // `SUBMIT_RUN` \- Submit run. A run created with [Run
    // now](..dev-tools/api/latest/jobshtml#operation/JobsRunNow).
    | "WORKFLOWRUN"; // An arbitrary object where the object key is a configuration propery name and
// the value is a configuration property value.
// An arbitrary object where the object key is an environment variable name and
// the value is an environment variable value.

export interface SparkJarTask {
    // Deprecated since 04/2016\. Provide a `jar` through the `libraries` field
    // instead. For an example, see
    // [Create](..dev-tools/api/latest/jobshtml#operation/JobsCreate).
    jar_uri: string;
    // The full name of the class containing the main method to be executed.
    // This class must be contained in a JAR provided as a library. The code
    // must use `SparkContext.getOrCreate` to obtain a Spark context; otherwise,
    // runs of the job fail.
    main_class_name: string;
    // Parameters passed to the main method. Use [Task parameter
    // variables](..jobshtml#parameter-variables) to set parameters containing
    // information about job runs.
    parameters: string[];
}
export const DefaultSparkJarTask = {};

export interface SparkPythonTask {
    // Command line parameters passed to the Python file. Use [Task parameter
    // variables](..jobshtml#parameter-variables) to set parameters containing
    // information about job runs.
    parameters: string[];

    python_file: string;
}
export const DefaultSparkPythonTask = {};

export interface SparkSubmitTask {
    // Command-line parameters passed to spark submit. Use [Task parameter
    // variables](..jobshtml#parameter-variables) to set parameters containing
    // information about job runs.
    parameters: string[];
}
export const DefaultSparkSubmitTask = {};

export interface SubmitRun {
    // List of permissions to set on the job.
    access_control_list: any /* MISSING TYPE */[];
    // An optional specification for a remote repository containing the
    // notebooks used by this job's notebook tasks.
    git_source?: GitSource;
    // An optional token that can be used to guarantee the idempotency of job
    // run requests. If a run with the provided token already exists, the
    // request does not create a new run but returns the ID of the existing run
    // instead. If a run with the provided token is deleted, an error is
    // returned. If you specify the idempotency token, upon failure you can
    // retry until the request succeeds. Databricks guarantees that exactly one
    // run is launched with that idempotency token. This token must have at most
    // 64 characters. For more information, see [How to ensure idempotency for
    // jobs](https://kb.databricks.com/jobs/jobs-idempotency.html).
    idempotency_token: string;
    // An optional name for the run. The default value is `Untitled`.
    run_name: string;

    tasks: RunSubmitTaskSettings[];
    // An optional timeout applied to each run of this job. The default behavior
    // is to have no timeout.
    timeout_seconds: number;
}
export const DefaultSubmitRun = {};

export interface SubmitRunResponse {
    // The canonical identifier for the newly submitted run.
    run_id: number;
}
export const DefaultSubmitRunResponse = {};
// An optional array of objects specifying the dependency graph of the task. All
// tasks specified in this field must complete successfully before executing
// this task. The key is `task_key`, and the value is the name assigned to the
// dependent task. This field is required when a job consists of more than one
// task.

export interface TaskDependenciesItem {
    task_key: string;
}
export const DefaultTaskDependenciesItem = {};
// An optional description for this task. The maximum length is 4096 bytes.
// A unique name for the task. This field is used to refer to this task from
// other tasks. This field is required and must be unique within its parent job.
// On Update or Reset, this field is used to reference the tasks to be updated
// or reset. The maximum length is 100 characters.
// * `PERIODIC`: Schedules that periodically trigger runs, such as a cron
// scheduler. * `ONE_TIME`: One time triggers that fire a single run. This
// occurs you triggered a single run on demand through the UI or the API. *
// `RETRY`: Indicates a run that is triggered as a retry of a previously failed
// run. This occurs when you request to re-run the job in case of failures.
export type TriggerType =
    // * `PERIODIC`: Schedules that periodically trigger runs, such as a cron
    // scheduler. * `ONE_TIME`: One time triggers that fire a single run. This
    // occurs you triggered a single run on demand through the UI or the API. *
    // `RETRY`: Indicates a run that is triggered as a retry of a previously failed
    // run. This occurs when you request to re-run the job in case of failures.
    | "ONETIME"
    // * `PERIODIC`: Schedules that periodically trigger runs, such as a cron
    // scheduler. * `ONE_TIME`: One time triggers that fire a single run. This
    // occurs you triggered a single run on demand through the UI or the API. *
    // `RETRY`: Indicates a run that is triggered as a retry of a previously failed
    // run. This occurs when you request to re-run the job in case of failures.
    | "PERIODIC"
    // * `PERIODIC`: Schedules that periodically trigger runs, such as a cron
    // scheduler. * `ONE_TIME`: One time triggers that fire a single run. This
    // occurs you triggered a single run on demand through the UI or the API. *
    // `RETRY`: Indicates a run that is triggered as a retry of a previously failed
    // run. This occurs when you request to re-run the job in case of failures.
    | "RETRY";
export interface UpdateJob {
    // Remove top-level fields in the job settings. Removing nested fields is
    // not supported. This field is optional.
    fields_to_remove: string[];
    // The canonical identifier of the job to update. This field is required.
    job_id: number;
    // The new settings for the job. Any top-level fields specified in
    // `new_settings` are completely replaced. Partially updating nested fields
    // is not supported. Changes to the field `JobSettings.timeout_seconds` are
    // applied to active runs. Changes to other fields are applied to future
    // runs only.
    new_settings?: JobSettings;
}
export const DefaultUpdateJob = {};

export interface ViewItem {
    // Content of the view.
    content: string;
    // Name of the view item. In the case of code view, it would be the
    // notebook?s name. In the case of dashboard view, it would be the
    // dashboard?s name.
    name: string;
    // Type of the view item.
    type: ViewType;
}
export const DefaultViewItem = {};
// * `NOTEBOOK`: Notebook view item. * `DASHBOARD`: Dashboard view item.
export type ViewType =
    // * `NOTEBOOK`: Notebook view item. * `DASHBOARD`: Dashboard view item.
    | "DASHBOARD"
    // * `NOTEBOOK`: Notebook view item. * `DASHBOARD`: Dashboard view item.
    | "NOTEBOOK"; // * `CODE`: Code view of the notebook. * `DASHBOARDS`: All dashboard views of
// the notebook. * `ALL`: All views of the notebook.
export type ViewsToExport =
    // * `CODE`: Code view of the notebook. * `DASHBOARDS`: All dashboard views of
    // the notebook. * `ALL`: All views of the notebook.
    | "ALL"
    // * `CODE`: Code view of the notebook. * `DASHBOARDS`: All dashboard views of
    // the notebook. * `ALL`: All views of the notebook.
    | "CODE"
    // * `CODE`: Code view of the notebook. * `DASHBOARDS`: All dashboard views of
    // the notebook. * `ALL`: All views of the notebook.
    | "DASHBOARDS";
export interface CreateResponse {
    // The canonical identifier for the newly created job.
    job_id: number;
}
export const DefaultCreateResponse = {};

export interface ExportRunRequest {
    // The canonical identifier for the run. This field is required.
    run_id: number;
    // Which views to export (CODE, DASHBOARDS, or ALL). Defaults to CODE.
    views_to_export: ViewsToExport;
}
export const DefaultExportRunRequest = {};

export interface GetRequest {
    // The canonical identifier of the job to retrieve information about. This
    // field is required.
    job_id: number;
}
export const DefaultGetRequest = {};

export interface GetRunOutputRequest {
    // The canonical identifier for the run. This field is required.
    run_id: number;
}
export const DefaultGetRunOutputRequest = {};

export interface GetRunRequest {
    // Whether to include the repair history in the response.
    include_history: boolean;
    // The canonical identifier of the run for which to retrieve the metadata.
    // This field is required.
    run_id: number;
}
export const DefaultGetRunRequest: Pick<GetRunRequest, "include_history"> = {
    include_history: false,
};

export interface ListRequest {
    // Whether to include task and cluster details in the response.
    expand_tasks: boolean;
    // The number of jobs to return. This value must be greater than 0 and less
    // or equal to 25. The default value is 20.
    limit: number;
    // The offset of the first job to return, relative to the most recently
    // created job.
    offset: number;
}
export const DefaultListRequest: Pick<ListRequest, "expand_tasks"> = {
    expand_tasks: false,
};

export interface ListResponse {
    has_more: boolean;
    // The list of jobs.
    jobs: Job[];
}
export const DefaultListResponse: Pick<ListResponse, "has_more"> = {
    has_more: false,
};

export interface ListRunsRequest {
    // If active_only is `true`, only active runs are included in the results;
    // otherwise, lists both active and completed runs. An active run is a run
    // in the `PENDING`, `RUNNING`, or `TERMINATING`. This field cannot be
    // `true` when completed_only is `true`.
    active_only: boolean;
    // If completed_only is `true`, only completed runs are included in the
    // results; otherwise, lists both active and completed runs. This field
    // cannot be `true` when active_only is `true`.
    completed_only: boolean;
    // Whether to include task and cluster details in the response.
    expand_tasks: boolean;
    // The job for which to list runs. If omitted, the Jobs service lists runs
    // from all jobs.
    job_id: number;
    // The number of runs to return. This value must be greater than 0 and less
    // than 25\. The default value is 25\. If a request specifies a limit of 0,
    // the service instead uses the maximum limit.
    limit: number;
    // The offset of the first run to return, relative to the most recent run.
    offset: number;
    // The type of runs to return. For a description of run types, see
    // [Run](..dev-tools/api/latest/jobshtml#operation/JobsRunsGet).
    run_type: ListRunsRunType;
    // Show runs that started _at or after_ this value. The value must be a UTC
    // timestamp in milliseconds. Can be combined with _start_time_to_ to filter
    // by a time range.
    start_time_from: number;
    // Show runs that started _at or before_ this value. The value must be a UTC
    // timestamp in milliseconds. Can be combined with _start_time_from_ to
    // filter by a time range.
    start_time_to: number;
}
export const DefaultListRunsRequest: Pick<
    ListRunsRequest,
    "active_only" | "completed_only" | "expand_tasks"
> = {active_only: false, completed_only: false, expand_tasks: false};

export type ListRunsRunType = "JOBRUN" | "SUBMITRUN" | "WORKFLOWRUN";
export interface RepairRunResponse {
    // The ID of the repair.
    repair_id: number;
}
export const DefaultRepairRunResponse = {};

export interface AccessControlRequest {}
export interface AccessControlRequest {}
export interface CancelAllRunsResponse {}
export interface CancelRunResponse {}
export interface DeleteResponse {}
export interface DeleteRunResponse {}
export interface ResetResponse {}
export interface UpdateResponse {}
