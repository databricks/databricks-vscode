/* eslint-disable @typescript-eslint/naming-convention */

// Code generated from OpenAPI specs by Databricks SDK Generator. DO NOT EDIT.

// all definitions in this file are in alphabetical order
export interface BaseJob {
    
	/**
    * The time at which this job was created in epoch milliseconds (milliseconds
    * since 1/1/1970 UTC).
	*/
	created_time?: number;
	/**
    * The creator user name. This field won’t be included in the response if
    * the user has already been deleted.
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

export interface BaseRun {
    
	/**
    * The sequence number of this run attempt for a triggered job run. The
    * initial attempt of a run has an attempt_number of 0\. If the initial run
    * attempt fails, and the job has a retry policy (`max_retries` \> 0),
    * subsequent runs are created with an `original_attempt_run_id` of the
    * original attempt’s ID and an incrementing `attempt_number`. Runs are
    * retried only until they succeed, and the maximum `attempt_number` is the
    * same as the `max_retries` value for the job.
	*/
	attempt_number?: number;
	/**
    * The time in milliseconds it took to terminate the cluster and clean up any
    * associated artifacts. The duration of a task run is the sum of the
    * `setup_duration`, `execution_duration`, and the `cleanup_duration`. The
    * `cleanup_duration` field is set to 0 for multitask job runs. The total
    * duration of a multitask job run is the value of the `run_duration` field.
	*/
	cleanup_duration?: number;
	/**
    * The cluster used for this run. If the run is specified to use a new
    * cluster, this field is set once the Jobs service has requested a cluster
    * for the run.
	*/
	cluster_instance?: ClusterInstance;
	/**
    * A snapshot of the job’s cluster specification when this run was created.
	*/
	cluster_spec?: ClusterSpec;
	/**
    * The continuous trigger that triggered this run.
	*/
	continuous?: Continuous;
	/**
    * The creator user name. This field won’t be included in the response if
    * the user has already been deleted.
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
    * encountered an unexpected error. The duration of a task run is the sum of
    * the `setup_duration`, `execution_duration`, and the `cleanup_duration`.
    * The `execution_duration` field is set to 0 for multitask job runs. The
    * total duration of a multitask job run is the value of the `run_duration`
    * field.
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
    * Job-level parameters used in the run
	*/
	job_parameters?: Array<JobParameter>;
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
    * The time in milliseconds it took the job run and all of its repairs to
    * finish.
	*/
	run_duration?: number;
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
	/**
    * This describes an enum
	*/
	run_type?: RunType;
	/**
    * The cron schedule that triggered this run if it was triggered by the
    * periodic scheduler.
	*/
	schedule?: CronSchedule;
	/**
    * The time in milliseconds it took to set up the cluster. For runs that run
    * on new clusters this is the cluster creation time, for runs that run on
    * existing clusters this time should be very short. The duration of a task
    * run is the sum of the `setup_duration`, `execution_duration`, and the
    * `cleanup_duration`. The `setup_duration` field is set to 0 for multitask
    * job runs. The total duration of a multitask job run is the value of the
    * `run_duration` field.
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
    * The current state of the run.
	*/
	state?: RunState;
	/**
    * The list of tasks performed by the run. Each task has its own `run_id`
    * which you can use to call `JobsGetOutput` to retrieve the run resutls.
	*/
	tasks?: Array<RunTask>;
	/**
    * This describes an enum
	*/
	trigger?: TriggerType;
	trigger_info?: TriggerInfo;
}

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
    * The response won’t include this field if the identifier is not available
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
    * The response won’t include this field if the identifier is not available
    * yet.
	*/
	spark_context_id?: string;
}

export interface ClusterSpec {
    
	/**
    * If existing_cluster_id, the ID of an existing cluster that is used for all
    * runs of this job. When running jobs on an existing cluster, you may need
    * to manually restart the cluster if it stops responding. We suggest running
    * jobs on new clusters for greater reliability
	*/
	existing_cluster_id?: string;
	/**
    * An optional list of libraries to be installed on the cluster that executes
    * the job. The default value is an empty list.
	*/
	libraries?: Array<any /* MISSING TYPE */>;
	/**
    * If new_cluster, a description of a cluster that is created for each run.
	*/
	new_cluster?: any /* MISSING TYPE */;
}

export interface ConditionTask {
    
	/**
    * The left operand of the condition task. Can be either a string value or a
    * job state or parameter reference.
	*/
	left?: string;
	/**
    * * `EQUAL_TO`, `NOT_EQUAL` operators perform string comparison of their
    * operands. This means that `“12.0” == “12”` will evaluate to
    * `false`. * `GREATER_THAN`, `GREATER_THAN_OR_EQUAL`, `LESS_THAN`,
    * `LESS_THAN_OR_EQUAL` operators perform numeric comparison of their
    * operands. `“12.0” >= “12”` will evaluate to `true`, `“10.0” >=
    * “12”` will evaluate to `false`.
    * 
    * The boolean comparison to task values can be implemented with operators
    * `EQUAL_TO`, `NOT_EQUAL`. If a task value was set to a boolean value, it
    * will be serialized to `“true”` or `“false”` for the comparison.
	*/
	op?: ConditionTaskOp;
	/**
    * The right operand of the condition task. Can be either a string value or a
    * job state or parameter reference.
	*/
	right?: string;
}

/**
* * `EQUAL_TO`, `NOT_EQUAL` operators perform string comparison of their
* operands. This means that `“12.0” == “12”` will evaluate to `false`. *
* `GREATER_THAN`, `GREATER_THAN_OR_EQUAL`, `LESS_THAN`, `LESS_THAN_OR_EQUAL`
* operators perform numeric comparison of their operands. `“12.0” >=
* “12”` will evaluate to `true`, `“10.0” >= “12”` will evaluate to
* `false`.
* 
* The boolean comparison to task values can be implemented with operators
* `EQUAL_TO`, `NOT_EQUAL`. If a task value was set to a boolean value, it will
* be serialized to `“true”` or `“false”` for the comparison.
*/
export type ConditionTaskOp = 
"EQUAL_TO"
 |"GREATER_THAN"
 |"GREATER_THAN_OR_EQUAL"
 |"LESS_THAN"
 |"LESS_THAN_OR_EQUAL"
 |"NOT_EQUAL"
;

export interface Continuous {
    
	/**
    * Indicate whether the continuous execution of the job is paused or not.
    * Defaults to UNPAUSED.
	*/
	pause_status?: PauseStatus;
}

export interface CreateJob {
    
	/**
    * List of permissions to set on the job.
	*/
	access_control_list?: Array<any /* MISSING TYPE */>;
	/**
    * A list of compute requirements that can be referenced by tasks of this
    * job.
	*/
	compute?: Array<JobCompute>;
	/**
    * An optional continuous property for this job. The continuous property will
    * ensure that there is always one run executing. Only one of `schedule` and
    * `continuous` can be used.
	*/
	continuous?: Continuous;
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
	format?: Format;
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
    * This setting affects only new runs. For example, suppose the job’s
    * concurrency is 4 and there are 4 concurrent active runs. Then setting the
    * concurrency to 3 won’t kill any of the active runs. However, from then
    * on, new runs are skipped unless there are fewer than 3 active runs.
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
    * Optional notification settings that are used when sending notifications to
    * each of the `email_notifications` and `webhook_notifications` for this
    * job.
	*/
	notification_settings?: JobNotificationSettings;
	/**
    * Job-level parameter definitions
	*/
	parameters?: Array<JobParameterDefinition>;
	/**
    * Write-only setting, available only in Create/Update/Reset and Submit
    * calls. Specifies the user or service principal that the job runs as. If
    * not specified, the job runs as the user who created the job.
    * 
    * Only `user_name` or `service_principal_name` can be specified. If both are
    * specified, an error is thrown.
	*/
	run_as?: JobRunAs;
	/**
    * An optional periodic schedule for this job. The default behavior is that
    * the job only runs when triggered by clicking “Run Now” in the Jobs UI
    * or sending an API request to `runNow`.
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
	tasks?: Array<Task>;
	/**
    * An optional timeout applied to each run of this job. The default behavior
    * is to have no timeout.
	*/
	timeout_seconds?: number;
	/**
    * Trigger settings for the job. Can be used to trigger a run when new files
    * arrive in an external location. The default behavior is that the job runs
    * only when triggered by clicking “Run Now” in the Jobs UI or sending an
    * API request to `runNow`.
	*/
	trigger?: TriggerSettings;
	/**
    * A collection of system notification IDs to notify when the run begins or
    * completes. The default behavior is to not send any system notifications.
	*/
	webhook_notifications?: WebhookNotifications;
}

export interface CreateResponse {
    
	/**
    * The canonical identifier for the newly created job.
	*/
	job_id?: number;
}

export interface CronSchedule {
    
	/**
    * Indicate whether this schedule is paused or not.
	*/
	pause_status?: PauseStatus;
	/**
    * A Cron expression using Quartz syntax that describes the schedule for a
    * job. See [Cron Trigger] for details. This field is required."
    * 
    * [Cron Trigger]: http://www.quartz-scheduler.org/documentation/quartz-2.3.0/tutorials/crontrigger.html
	*/
	quartz_cron_expression: string;
	/**
    * A Java timezone ID. The schedule for a job is resolved with respect to
    * this timezone. See [Java TimeZone] for details. This field is required.
    * 
    * [Java TimeZone]: https://docs.oracle.com/javase/7/docs/api/java/util/TimeZone.html
	*/
	timezone_id: string;
}

export interface DbtOutput {
    
	/**
    * An optional map of headers to send when retrieving the artifact from the
    * `artifacts_link`.
	*/
	artifacts_headers?: Record<string, string>;
	/**
    * A pre-signed URL to download the (compressed) dbt artifacts. This link is
    * valid for a limited time (30 minutes). This information is only available
    * after the run has finished.
	*/
	artifacts_link?: string;
}

export interface DbtTask {
    
	/**
    * Optional name of the catalog to use. The value is the top level in the
    * 3-level namespace of Unity Catalog (catalog / schema / relation). The
    * catalog value can only be specified if a warehouse_id is specified.
    * Requires dbt-databricks >= 1.1.1.
	*/
	catalog?: string;
	/**
    * A list of dbt commands to execute. All commands must start with `dbt`.
    * This parameter must not be empty. A maximum of up to 10 commands can be
    * provided.
	*/
	commands: Array<string>;
	/**
    * Optional (relative) path to the profiles directory. Can only be specified
    * if no warehouse_id is specified. If no warehouse_id is specified and this
    * folder is unset, the root directory is used.
	*/
	profiles_directory?: string;
	/**
    * Optional (relative) path to the project directory, if no value is
    * provided, the root of the git repository is used.
	*/
	project_directory?: string;
	/**
    * Optional schema to write to. This parameter is only used when a
    * warehouse_id is also provided. If not provided, the `default` schema is
    * used.
	*/
	schema?: string;
	/**
    * ID of the SQL warehouse to connect to. If provided, we automatically
    * generate and provide the profile and connection details to dbt. It can be
    * overridden on a per-command basis by using the `--profiles-dir` command
    * line argument.
	*/
	warehouse_id?: string;
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
	run_id: number;
}

export interface ExportRunOutput {
    
	/**
    * The exported content in HTML format (one for every view item).
	*/
	views?: Array<ViewItem>;
}

/**
* Export and retrieve a job run
*/
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

export interface FileArrivalTriggerConfiguration {
    
	/**
    * If set, the trigger starts a run only after the specified amount of time
    * passed since the last time the trigger fired. The minimum allowed value is
    * 60 seconds
	*/
	min_time_between_triggers_seconds?: number;
	/**
    * URL to be monitored for file arrivals. The path must point to the root or
    * a subpath of the external location.
	*/
	url?: string;
	/**
    * If set, the trigger starts a run only after no file activity has occurred
    * for the specified amount of time. This makes it possible to wait for a
    * batch of incoming files to arrive before triggering a run. The minimum
    * allowed value is 60 seconds.
	*/
	wait_after_last_change_seconds?: number;
}

export type Format = 
"MULTI_TASK"
 |"SINGLE_TASK"
;

/**
* Get a single job
*/
export interface GetJobRequest {
    
	/**
    * The canonical identifier of the job to retrieve information about. This
    * field is required.
	*/
	job_id: number;
}

/**
* Get the output for a single run
*/
export interface GetRunOutputRequest {
    
	/**
    * The canonical identifier for the run. This field is required.
	*/
	run_id: number;
}

/**
* Get a single job run
*/
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

export type GitProvider = 
"awsCodeCommit"
 |"azureDevOpsServices"
 |"bitbucketCloud"
 |"bitbucketServer"
 |"gitHub"
 |"gitHubEnterprise"
 |"gitLab"
 |"gitLabEnterpriseEdition"
;

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
    * cannot be specified in conjunction with git_tag or git_commit.
    * 
    * The maximum length is 255 characters.
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
	git_provider: GitProvider;
	/**
    * Read-only state of the remote repository at the time the job was run. This
    * field is only included on job runs.
	*/
	git_snapshot?: GitSnapshot;
	/**
    * Name of the tag to be checked out and used by this job. This field cannot
    * be specified in conjunction with git_branch or git_commit.
    * 
    * The maximum length is 255 characters.
	*/
	git_tag?: string;
	/**
    * URL of the repository to be cloned by this job. The maximum length is 300
    * characters.
	*/
	git_url: string;
	/**
    * The source of the job specification in the remote repository when the job
    * is source controlled.
	*/
	job_source?: JobSource;
}

export interface Job {
    
	/**
    * The time at which this job was created in epoch milliseconds (milliseconds
    * since 1/1/1970 UTC).
	*/
	created_time?: number;
	/**
    * The creator user name. This field won’t be included in the response if
    * the user has already been deleted.
	*/
	creator_user_name?: string;
	/**
    * The canonical identifier for this job.
	*/
	job_id?: number;
	/**
    * The email of an active workspace user or the application ID of a service
    * principal that the job runs as. This value can be changed by setting the
    * `run_as` field when creating or updating a job.
    * 
    * By default, `run_as_user_name` is based on the current job settings and is
    * set to the creator of the job if job access control is disabled or to the
    * user with the `is_owner` permission if job access control is enabled.
	*/
	run_as_user_name?: string;
	/**
    * Settings for this job and all of its runs. These settings can be updated
    * using the `resetJob` method.
	*/
	settings?: JobSettings;
	/**
    * History of the file arrival trigger associated with the job.
	*/
	trigger_history?: TriggerHistory;
}

export interface JobCluster {
    
	/**
    * A unique name for the job cluster. This field is required and must be
    * unique within the job. `JobTaskSettings` may refer to this field to
    * determine which cluster to launch for the task execution.
	*/
	job_cluster_key: string;
	/**
    * If new_cluster, a description of a cluster that is created for each task.
	*/
	new_cluster?: any /* MISSING TYPE */;
}

export interface JobCompute {
    
	/**
    * A unique name for the compute requirement. This field is required and must
    * be unique within the job. `JobTaskSettings` may refer to this field to
    * determine the compute requirements for the task execution.
	*/
	compute_key: string;
	spec: any /* MISSING TYPE */;
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
    * with an `INTERNAL_ERROR` `life_cycle_state` or a `FAILED`, or `TIMED_OUT`
    * result_state. If this is not specified on job creation, reset, or update
    * the list is empty, and notifications are not sent.
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
    * with a `TERMINATED` `life_cycle_state` and a `SUCCESS` result_state. If
    * not specified on job creation, reset, or update, the list is empty, and
    * notifications are not sent.
	*/
	on_success?: Array<string>;
}

export interface JobNotificationSettings {
    
	/**
    * If true, do not send notifications to recipients specified in `on_failure`
    * if the run is canceled.
	*/
	no_alert_for_canceled_runs?: boolean;
	/**
    * If true, do not send notifications to recipients specified in `on_failure`
    * if the run is skipped.
	*/
	no_alert_for_skipped_runs?: boolean;
}

export interface JobParameter {
    
	/**
    * The optional default value of the parameter
	*/
	default?: string;
	/**
    * The name of the parameter
	*/
	name?: string;
	/**
    * The value used in the run
	*/
	value?: string;
}

export interface JobParameterDefinition {
    
	/**
    * Default value of the parameter.
	*/
	default: string;
	/**
    * The name of the defined parameter. May only contain alphanumeric
    * characters, `_`, `-`, and `.`
	*/
	name: string;
}

/**
* Write-only setting, available only in Create/Update/Reset and Submit calls.
* Specifies the user or service principal that the job runs as. If not
* specified, the job runs as the user who created the job.
* 
* Only `user_name` or `service_principal_name` can be specified. If both are
* specified, an error is thrown.
*/
export interface JobRunAs {
    
	/**
    * Application ID of an active service principal. Setting this field requires
    * the `servicePrincipal/user` role.
	*/
	service_principal_name?: string;
	/**
    * The email of an active workspace user. Non-admin users can only set this
    * field to their own email.
	*/
	user_name?: string;
}

export interface JobSettings {
    
	/**
    * A list of compute requirements that can be referenced by tasks of this
    * job.
	*/
	compute?: Array<JobCompute>;
	/**
    * An optional continuous property for this job. The continuous property will
    * ensure that there is always one run executing. Only one of `schedule` and
    * `continuous` can be used.
	*/
	continuous?: Continuous;
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
	format?: Format;
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
    * This setting affects only new runs. For example, suppose the job’s
    * concurrency is 4 and there are 4 concurrent active runs. Then setting the
    * concurrency to 3 won’t kill any of the active runs. However, from then
    * on, new runs are skipped unless there are fewer than 3 active runs.
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
    * Optional notification settings that are used when sending notifications to
    * each of the `email_notifications` and `webhook_notifications` for this
    * job.
	*/
	notification_settings?: JobNotificationSettings;
	/**
    * Job-level parameter definitions
	*/
	parameters?: Array<JobParameterDefinition>;
	/**
    * Write-only setting, available only in Create/Update/Reset and Submit
    * calls. Specifies the user or service principal that the job runs as. If
    * not specified, the job runs as the user who created the job.
    * 
    * Only `user_name` or `service_principal_name` can be specified. If both are
    * specified, an error is thrown.
	*/
	run_as?: JobRunAs;
	/**
    * An optional periodic schedule for this job. The default behavior is that
    * the job only runs when triggered by clicking “Run Now” in the Jobs UI
    * or sending an API request to `runNow`.
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
	tasks?: Array<Task>;
	/**
    * An optional timeout applied to each run of this job. The default behavior
    * is to have no timeout.
	*/
	timeout_seconds?: number;
	/**
    * Trigger settings for the job. Can be used to trigger a run when new files
    * arrive in an external location. The default behavior is that the job runs
    * only when triggered by clicking “Run Now” in the Jobs UI or sending an
    * API request to `runNow`.
	*/
	trigger?: TriggerSettings;
	/**
    * A collection of system notification IDs to notify when the run begins or
    * completes. The default behavior is to not send any system notifications.
	*/
	webhook_notifications?: WebhookNotifications;
}

/**
* The source of the job specification in the remote repository when the job is
* source controlled.
*/
export interface JobSource {
    
	/**
    * This describes an enum
	*/
	dirty_state?: JobSourceDirtyState;
	/**
    * Name of the branch which the job is imported from.
	*/
	import_from_git_branch: string;
	/**
    * Path of the job YAML file that contains the job specification.
	*/
	job_config_path: string;
}

/**
* This describes an enum
*/
export type JobSourceDirtyState = 
/**
* The job is temporary disconnected from the remote job specification and is
* allowed for live edit. Import the remote job specification again from UI to
* make the job fully synced.
*/
"DISCONNECTED"
/**
* The job is not yet synced with the remote job specification. Import the remote
* job specification from UI to make the job fully synced.
*/
 |"NOT_SYNCED"
;

/**
* List jobs
*/
export interface ListJobsRequest {
    
	/**
    * Whether to include task and cluster details in the response.
	*/
	expand_tasks?: boolean;
	/**
    * The number of jobs to return. This value must be greater than 0 and less
    * or equal to 100. The default value is 20.
	*/
	limit?: number;
	/**
    * A filter on the list based on the exact (case insensitive) job name.
	*/
	name?: string;
	/**
    * The offset of the first job to return, relative to the most recently
    * created job.
    * 
    * Deprecated since June 2023. Use `page_token` to iterate through the pages
    * instead.
	*/
	offset?: number;
	/**
    * Use `next_page_token` or `prev_page_token` returned from the previous
    * request to list the next or previous page of jobs respectively.
	*/
	page_token?: string;
}

export interface ListJobsResponse {
    
	/**
    * If true, additional jobs matching the provided filter are available for
    * listing.
	*/
	has_more?: boolean;
	/**
    * The list of jobs.
	*/
	jobs?: Array<BaseJob>;
	/**
    * A token that can be used to list the next page of jobs.
	*/
	next_page_token?: string;
	/**
    * A token that can be used to list the previous page of jobs.
	*/
	prev_page_token?: string;
}

/**
* List job runs
*/
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
    * than 25. The default value is 25. If a request specifies a limit of 0, the
    * service instead uses the maximum limit.
	*/
	limit?: number;
	/**
    * The offset of the first run to return, relative to the most recent run.
    * 
    * Deprecated since June 2023. Use `page_token` to iterate through the pages
    * instead.
	*/
	offset?: number;
	/**
    * Use `next_page_token` or `prev_page_token` returned from the previous
    * request to list the next or previous page of runs respectively.
	*/
	page_token?: string;
	/**
    * The type of runs to return. For a description of run types, see
    * :method:jobs/getRun.
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

export interface ListRunsResponse {
    
	/**
    * If true, additional runs matching the provided filter are available for
    * listing.
	*/
	has_more?: boolean;
	/**
    * A token that can be used to list the next page of runs.
	*/
	next_page_token?: string;
	/**
    * A token that can be used to list the previous page of runs.
	*/
	prev_page_token?: string;
	/**
    * A list of runs, from most recently started to least.
	*/
	runs?: Array<BaseRun>;
}

/**
* This describes an enum
*/
export type ListRunsRunType = 
/**
* Normal job run. A run created with :method:jobs/runNow.
*/
"JOB_RUN"
/**
* Submit run. A run created with :method:jobs/submit.
*/
 |"SUBMIT_RUN"
/**
* Workflow run. A run created with
* [dbutils.notebook.run](/dev-tools/databricks-utils.html#dbutils-workflow).
*/
 |"WORKFLOW_RUN"
;

export interface NotebookOutput {
    
	/**
    * The value passed to
    * [dbutils.notebook.exit()](/notebooks/notebook-workflows.html#notebook-workflows-exit).
    * Databricks restricts this API to return the first 5 MB of the value. For a
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
    * initiated by a call to :method:jobs/runNow with parameters specified, the
    * two parameters maps are merged. If the same key is specified in
    * `base_parameters` and in `run-now`, the value from `run-now` is used.
    * 
    * Use [Task parameter variables] to set parameters containing information
    * about job runs.
    * 
    * If the notebook takes a parameter that is not specified in the job’s
    * `base_parameters` or the `run-now` override parameters, the default value
    * from the notebook is used.
    * 
    * Retrieve these parameters in a notebook using [dbutils.widgets.get].
    * 
    * [Task parameter variables]: https://docs.databricks.com/jobs.html#parameter-variables
    * [dbutils.widgets.get]: https://docs.databricks.com/dev-tools/databricks-utils.html#dbutils-widgets
	*/
	base_parameters?: Record<string, string>;
	/**
    * The path of the notebook to be run in the Databricks workspace or remote
    * repository. For notebooks stored in the Databricks workspace, the path
    * must be absolute and begin with a slash. For notebooks stored in a remote
    * repository, the path must be relative. This field is required.
	*/
	notebook_path: string;
	/**
    * Optional location type of the notebook. When set to `WORKSPACE`, the
    * notebook will be retrieved from the local <Databricks> workspace. When set
    * to `GIT`, the notebook will be retrieved from a Git repository defined in
    * `git_source`. If the value is empty, the task will use `GIT` if
    * `git_source` is defined and `WORKSPACE` otherwise.
    * 
    * * `WORKSPACE`: Notebook is located in <Databricks> workspace. * `GIT`:
    * Notebook is located in cloud Git provider.
	*/
	source?: Source;
}

export type ParamPairs = Record<string, string>;

export type PauseStatus = 
"PAUSED"
 |"UNPAUSED"
;

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
	named_parameters?: Record<string, string>;
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
	/**
    * The current state of the run.
	*/
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
export type RepairHistoryItemType = 
"ORIGINAL"
 |"REPAIR"
;

export interface RepairRun {
    
	/**
    * An array of commands to execute for jobs with the dbt task, for example
    * `"dbt_commands": ["dbt deps", "dbt seed", "dbt run"]`
	*/
	dbt_commands?: Array<string>;
	/**
    * A list of parameters for jobs with Spark JAR tasks, for example
    * `\"jar_params\": [\"john doe\", \"35\"]`. The parameters are used to
    * invoke the main function of the main class specified in the Spark JAR
    * task. If not specified upon `run-now`, it defaults to an empty list.
    * jar_params cannot be specified in conjunction with notebook_params. The
    * JSON representation of this field (for example `{\"jar_params\":[\"john
    * doe\",\"35\"]}`) cannot exceed 10,000 bytes.
    * 
    * Use [Task parameter variables](/jobs.html"#parameter-variables") to set
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
    * `\"notebook_params\": {\"name\": \"john doe\", \"age\": \"35\"}`. The map
    * is passed to the notebook and is accessible through the
    * [dbutils.widgets.get] function.
    * 
    * If not specified upon `run-now`, the triggered run uses the job’s base
    * parameters.
    * 
    * notebook_params cannot be specified in conjunction with jar_params.
    * 
    * Use [Task parameter variables] to set parameters containing information
    * about job runs.
    * 
    * The JSON representation of this field (for example
    * `{\"notebook_params\":{\"name\":\"john doe\",\"age\":\"35\"}}`) cannot
    * exceed 10,000 bytes.
    * 
    * [Task parameter variables]: https://docs.databricks.com/jobs.html#parameter-variables
    * [dbutils.widgets.get]: https://docs.databricks.com/dev-tools/databricks-utils.html
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
    * `\"python_params\": [\"john doe\", \"35\"]`. The parameters are passed to
    * Python file as command-line parameters. If specified upon `run-now`, it
    * would overwrite the parameters specified in job setting. The JSON
    * representation of this field (for example `{\"python_params\":[\"john
    * doe\",\"35\"]}`) cannot exceed 10,000 bytes.
    * 
    * Use [Task parameter variables] to set parameters containing information
    * about job runs.
    * 
    * Important
    * 
    * These parameters accept only Latin characters (ASCII character set). Using
    * non-ASCII characters returns an error. Examples of invalid, non-ASCII
    * characters are Chinese, Japanese kanjis, and emojis.
    * 
    * [Task parameter variables]: https://docs.databricks.com/jobs.html#parameter-variables
	*/
	python_params?: Array<string>;
	/**
    * If true, repair all failed tasks. Only one of `rerun_tasks` or
    * `rerun_all_failed_tasks` can be used.
	*/
	rerun_all_failed_tasks?: boolean;
	/**
    * If true, repair all tasks that depend on the tasks in `rerun_tasks`, even
    * if they were previously successful. Can be also used in combination with
    * `rerun_all_failed_tasks`.
	*/
	rerun_dependent_tasks?: boolean;
	/**
    * The task keys of the task runs to repair.
	*/
	rerun_tasks?: Array<string>;
	/**
    * The job run ID of the run to repair. The run must not be in progress.
	*/
	run_id: number;
	/**
    * A list of parameters for jobs with spark submit task, for example
    * `\"spark_submit_params\": [\"--class\",
    * \"org.apache.spark.examples.SparkPi\"]`. The parameters are passed to
    * spark-submit script as command-line parameters. If specified upon
    * `run-now`, it would overwrite the parameters specified in job setting. The
    * JSON representation of this field (for example `{\"python_params\":[\"john
    * doe\",\"35\"]}`) cannot exceed 10,000 bytes.
    * 
    * Use [Task parameter variables] to set parameters containing information
    * about job runs
    * 
    * Important
    * 
    * These parameters accept only Latin characters (ASCII character set). Using
    * non-ASCII characters returns an error. Examples of invalid, non-ASCII
    * characters are Chinese, Japanese kanjis, and emojis.
    * 
    * [Task parameter variables]: https://docs.databricks.com/jobs.html#parameter-variables
	*/
	spark_submit_params?: Array<string>;
	/**
    * A map from keys to values for jobs with SQL task, for example
    * `"sql_params": {"name": "john doe", "age": "35"}`. The SQL alert task does
    * not support custom parameters.
	*/
	sql_params?: Record<string, string>;
}

export interface RepairRunResponse {
    
	/**
    * The ID of the repair. Must be provided in subsequent repairs using the
    * `latest_repair_id` field to ensure sequential repairs.
	*/
	repair_id?: number;
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
    * Changes to the field `JobBaseSettings.timeout_seconds` are applied to
    * active runs. Changes to other fields are applied to future runs only.
	*/
	new_settings: JobSettings;
}

export interface ResolvedConditionTaskValues {
    
	left?: string;
	right?: string;
}

export interface ResolvedDbtTaskValues {
    
	commands?: Array<string>;
}

export interface ResolvedNotebookTaskValues {
    
	base_parameters?: Record<string, string>;
}

export interface ResolvedParamPairValues {
    
	parameters?: Record<string, string>;
}

export interface ResolvedPythonWheelTaskValues {
    
	named_parameters?: Record<string, string>;
	parameters?: Array<string>;
}

export interface ResolvedRunJobTaskValues {
    
	named_parameters?: Record<string, string>;
	parameters?: Record<string, string>;
}

export interface ResolvedStringParamsValues {
    
	parameters?: Array<string>;
}

export interface ResolvedValues {
    
	condition_task?: ResolvedConditionTaskValues;
	dbt_task?: ResolvedDbtTaskValues;
	notebook_task?: ResolvedNotebookTaskValues;
	python_wheel_task?: ResolvedPythonWheelTaskValues;
	run_job_task?: ResolvedRunJobTaskValues;
	simulation_task?: ResolvedParamPairValues;
	spark_jar_task?: ResolvedStringParamsValues;
	spark_python_task?: ResolvedStringParamsValues;
	spark_submit_task?: ResolvedStringParamsValues;
	sql_task?: ResolvedParamPairValues;
}

export interface Run {
    
	/**
    * The sequence number of this run attempt for a triggered job run. The
    * initial attempt of a run has an attempt_number of 0\. If the initial run
    * attempt fails, and the job has a retry policy (`max_retries` \> 0),
    * subsequent runs are created with an `original_attempt_run_id` of the
    * original attempt’s ID and an incrementing `attempt_number`. Runs are
    * retried only until they succeed, and the maximum `attempt_number` is the
    * same as the `max_retries` value for the job.
	*/
	attempt_number?: number;
	/**
    * The time in milliseconds it took to terminate the cluster and clean up any
    * associated artifacts. The duration of a task run is the sum of the
    * `setup_duration`, `execution_duration`, and the `cleanup_duration`. The
    * `cleanup_duration` field is set to 0 for multitask job runs. The total
    * duration of a multitask job run is the value of the `run_duration` field.
	*/
	cleanup_duration?: number;
	/**
    * The cluster used for this run. If the run is specified to use a new
    * cluster, this field is set once the Jobs service has requested a cluster
    * for the run.
	*/
	cluster_instance?: ClusterInstance;
	/**
    * A snapshot of the job’s cluster specification when this run was created.
	*/
	cluster_spec?: ClusterSpec;
	/**
    * The continuous trigger that triggered this run.
	*/
	continuous?: Continuous;
	/**
    * The creator user name. This field won’t be included in the response if
    * the user has already been deleted.
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
    * encountered an unexpected error. The duration of a task run is the sum of
    * the `setup_duration`, `execution_duration`, and the `cleanup_duration`.
    * The `execution_duration` field is set to 0 for multitask job runs. The
    * total duration of a multitask job run is the value of the `run_duration`
    * field.
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
    * Job-level parameters used in the run
	*/
	job_parameters?: Array<JobParameter>;
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
    * The time in milliseconds it took the job run and all of its repairs to
    * finish.
	*/
	run_duration?: number;
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
	/**
    * This describes an enum
	*/
	run_type?: RunType;
	/**
    * The cron schedule that triggered this run if it was triggered by the
    * periodic scheduler.
	*/
	schedule?: CronSchedule;
	/**
    * The time in milliseconds it took to set up the cluster. For runs that run
    * on new clusters this is the cluster creation time, for runs that run on
    * existing clusters this time should be very short. The duration of a task
    * run is the sum of the `setup_duration`, `execution_duration`, and the
    * `cleanup_duration`. The `setup_duration` field is set to 0 for multitask
    * job runs. The total duration of a multitask job run is the value of the
    * `run_duration` field.
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
    * The current state of the run.
	*/
	state?: RunState;
	/**
    * The list of tasks performed by the run. Each task has its own `run_id`
    * which you can use to call `JobsGetOutput` to retrieve the run resutls.
	*/
	tasks?: Array<RunTask>;
	/**
    * This describes an enum
	*/
	trigger?: TriggerType;
	trigger_info?: TriggerInfo;
}

export interface RunConditionTask {
    
	/**
    * The left operand of the condition task.
	*/
	left: string;
	/**
    * The condtion task operator.
	*/
	op: RunConditionTaskOp;
	/**
    * The condition expression evaluation result. Filled in if the task was
    * successfully completed. Can be `"true"` or `"false"`
	*/
	outcome?: string;
	/**
    * The right operand of the condition task.
	*/
	right: string;
}

/**
* The condtion task operator.
*/
export type RunConditionTaskOp = 
"EQUAL_TO"
 |"GREATER_THAN"
 |"GREATER_THAN_OR_EQUAL"
 |"LESS_THAN"
 |"LESS_THAN_OR_EQUAL"
 |"NOT_EQUAL"
;

/**
* This describes an enum
*/
export type RunIf = 
/**
* All dependencies completed and at least one was executed
*/
"ALL_DONE"
/**
* ALl dependencies have failed
*/
 |"ALL_FAILED"
/**
* All dependencies have executed and succeeded
*/
 |"ALL_SUCCESS"
/**
* At least one dependency failed
*/
 |"AT_LEAST_ONE_FAILED"
/**
* At least one dependency has succeeded
*/
 |"AT_LEAST_ONE_SUCCESS"
/**
* None of the dependencies have failed and at least one was executed
*/
 |"NONE_FAILED"
;

export interface RunJobOutput {
    
	/**
    * The run id of the triggered job run
	*/
	run_id?: number;
}

export interface RunJobTask {
    
	/**
    * ID of the job to trigger.
	*/
	job_id: number;
	/**
    * Job-level parameters used to trigger the job.
	*/
	job_parameters?: any /* MISSING TYPE */;
}

/**
* This describes an enum
*/
export type RunLifeCycleState = 
/**
* The run is blocked on an upstream dependency.
*/
"BLOCKED"
/**
* An exceptional state that indicates a failure in the Jobs service, such as
* network failure over a long period. If a run on a new cluster ends in the
* `INTERNAL_ERROR` state, the Jobs service terminates the cluster as soon as
* possible. This state is terminal.
*/
 |"INTERNAL_ERROR"
/**
* The run has been triggered. If there is not an active run of the same job, the
* cluster and execution context are being prepared. If there is already an
* active run of the same job, the run immediately transitions into the `SKIPPED`
* state without preparing any resources.
*/
 |"PENDING"
/**
* The task of this run is being executed.
*/
 |"RUNNING"
/**
* This run was aborted because a previous run of the same job was already
* active. This state is terminal.
*/
 |"SKIPPED"
/**
* The task of this run has completed, and the cluster and execution context have
* been cleaned up. This state is terminal.
*/
 |"TERMINATED"
/**
* The task of this run has completed, and the cluster and execution context are
* being cleaned up.
*/
 |"TERMINATING"
/**
* The run is waiting for a retry.
*/
 |"WAITING_FOR_RETRY"
;

export interface RunNow {
    
	/**
    * An array of commands to execute for jobs with the dbt task, for example
    * `"dbt_commands": ["dbt deps", "dbt seed", "dbt run"]`
	*/
	dbt_commands?: Array<string>;
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
    * For more information, see [How to ensure idempotency for jobs].
    * 
    * [How to ensure idempotency for jobs]: https://kb.databricks.com/jobs/jobs-idempotency.html
	*/
	idempotency_token?: string;
	/**
    * A list of parameters for jobs with Spark JAR tasks, for example
    * `\"jar_params\": [\"john doe\", \"35\"]`. The parameters are used to
    * invoke the main function of the main class specified in the Spark JAR
    * task. If not specified upon `run-now`, it defaults to an empty list.
    * jar_params cannot be specified in conjunction with notebook_params. The
    * JSON representation of this field (for example `{\"jar_params\":[\"john
    * doe\",\"35\"]}`) cannot exceed 10,000 bytes.
    * 
    * Use [Task parameter variables](/jobs.html"#parameter-variables") to set
    * parameters containing information about job runs.
	*/
	jar_params?: Array<string>;
	/**
    * The ID of the job to be executed
	*/
	job_id: number;
	/**
    * Job-level parameters used in the run
	*/
	job_parameters?: Array<Record<string, string>>;
	/**
    * A map from keys to values for jobs with notebook task, for example
    * `\"notebook_params\": {\"name\": \"john doe\", \"age\": \"35\"}`. The map
    * is passed to the notebook and is accessible through the
    * [dbutils.widgets.get] function.
    * 
    * If not specified upon `run-now`, the triggered run uses the job’s base
    * parameters.
    * 
    * notebook_params cannot be specified in conjunction with jar_params.
    * 
    * Use [Task parameter variables] to set parameters containing information
    * about job runs.
    * 
    * The JSON representation of this field (for example
    * `{\"notebook_params\":{\"name\":\"john doe\",\"age\":\"35\"}}`) cannot
    * exceed 10,000 bytes.
    * 
    * [Task parameter variables]: https://docs.databricks.com/jobs.html#parameter-variables
    * [dbutils.widgets.get]: https://docs.databricks.com/dev-tools/databricks-utils.html
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
    * `\"python_params\": [\"john doe\", \"35\"]`. The parameters are passed to
    * Python file as command-line parameters. If specified upon `run-now`, it
    * would overwrite the parameters specified in job setting. The JSON
    * representation of this field (for example `{\"python_params\":[\"john
    * doe\",\"35\"]}`) cannot exceed 10,000 bytes.
    * 
    * Use [Task parameter variables] to set parameters containing information
    * about job runs.
    * 
    * Important
    * 
    * These parameters accept only Latin characters (ASCII character set). Using
    * non-ASCII characters returns an error. Examples of invalid, non-ASCII
    * characters are Chinese, Japanese kanjis, and emojis.
    * 
    * [Task parameter variables]: https://docs.databricks.com/jobs.html#parameter-variables
	*/
	python_params?: Array<string>;
	/**
    * A list of parameters for jobs with spark submit task, for example
    * `\"spark_submit_params\": [\"--class\",
    * \"org.apache.spark.examples.SparkPi\"]`. The parameters are passed to
    * spark-submit script as command-line parameters. If specified upon
    * `run-now`, it would overwrite the parameters specified in job setting. The
    * JSON representation of this field (for example `{\"python_params\":[\"john
    * doe\",\"35\"]}`) cannot exceed 10,000 bytes.
    * 
    * Use [Task parameter variables] to set parameters containing information
    * about job runs
    * 
    * Important
    * 
    * These parameters accept only Latin characters (ASCII character set). Using
    * non-ASCII characters returns an error. Examples of invalid, non-ASCII
    * characters are Chinese, Japanese kanjis, and emojis.
    * 
    * [Task parameter variables]: https://docs.databricks.com/jobs.html#parameter-variables
	*/
	spark_submit_params?: Array<string>;
	/**
    * A map from keys to values for jobs with SQL task, for example
    * `"sql_params": {"name": "john doe", "age": "35"}`. The SQL alert task does
    * not support custom parameters.
	*/
	sql_params?: Record<string, string>;
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
    * The output of a condition task, if available.
	*/
	condition_task?: any /* MISSING TYPE */;
	/**
    * The output of a dbt task, if available.
	*/
	dbt_output?: DbtOutput;
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
    * as spark_jar_task, spark_python_task, python_wheel_task.
    * 
    * It's not supported for the notebook_task, pipeline_task or
    * spark_submit_task.
    * 
    * Databricks restricts this API to return the last 5 MB of these logs.
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
    * field is set but its result value is empty. <Databricks> restricts this
    * API to return the first 5 MB of the output. To return a larger result, use
    * the [ClusterLogConf](/dev-tools/api/latest/clusters.html#clusterlogconf)
    * field to configure log storage for the job cluster.
	*/
	notebook_output?: NotebookOutput;
	/**
    * The output of a run job task, if available
	*/
	run_job_output?: RunJobOutput;
	/**
    * The output of a SQL task, if available.
	*/
	sql_output?: SqlOutput;
}

export interface RunParameters {
    
	/**
    * An array of commands to execute for jobs with the dbt task, for example
    * `"dbt_commands": ["dbt deps", "dbt seed", "dbt run"]`
	*/
	dbt_commands?: Array<string>;
	/**
    * A list of parameters for jobs with Spark JAR tasks, for example
    * `\"jar_params\": [\"john doe\", \"35\"]`. The parameters are used to
    * invoke the main function of the main class specified in the Spark JAR
    * task. If not specified upon `run-now`, it defaults to an empty list.
    * jar_params cannot be specified in conjunction with notebook_params. The
    * JSON representation of this field (for example `{\"jar_params\":[\"john
    * doe\",\"35\"]}`) cannot exceed 10,000 bytes.
    * 
    * Use [Task parameter variables](/jobs.html"#parameter-variables") to set
    * parameters containing information about job runs.
	*/
	jar_params?: Array<string>;
	/**
    * A map from keys to values for jobs with notebook task, for example
    * `\"notebook_params\": {\"name\": \"john doe\", \"age\": \"35\"}`. The map
    * is passed to the notebook and is accessible through the
    * [dbutils.widgets.get] function.
    * 
    * If not specified upon `run-now`, the triggered run uses the job’s base
    * parameters.
    * 
    * notebook_params cannot be specified in conjunction with jar_params.
    * 
    * Use [Task parameter variables] to set parameters containing information
    * about job runs.
    * 
    * The JSON representation of this field (for example
    * `{\"notebook_params\":{\"name\":\"john doe\",\"age\":\"35\"}}`) cannot
    * exceed 10,000 bytes.
    * 
    * [Task parameter variables]: https://docs.databricks.com/jobs.html#parameter-variables
    * [dbutils.widgets.get]: https://docs.databricks.com/dev-tools/databricks-utils.html
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
    * `\"python_params\": [\"john doe\", \"35\"]`. The parameters are passed to
    * Python file as command-line parameters. If specified upon `run-now`, it
    * would overwrite the parameters specified in job setting. The JSON
    * representation of this field (for example `{\"python_params\":[\"john
    * doe\",\"35\"]}`) cannot exceed 10,000 bytes.
    * 
    * Use [Task parameter variables] to set parameters containing information
    * about job runs.
    * 
    * Important
    * 
    * These parameters accept only Latin characters (ASCII character set). Using
    * non-ASCII characters returns an error. Examples of invalid, non-ASCII
    * characters are Chinese, Japanese kanjis, and emojis.
    * 
    * [Task parameter variables]: https://docs.databricks.com/jobs.html#parameter-variables
	*/
	python_params?: Array<string>;
	/**
    * A list of parameters for jobs with spark submit task, for example
    * `\"spark_submit_params\": [\"--class\",
    * \"org.apache.spark.examples.SparkPi\"]`. The parameters are passed to
    * spark-submit script as command-line parameters. If specified upon
    * `run-now`, it would overwrite the parameters specified in job setting. The
    * JSON representation of this field (for example `{\"python_params\":[\"john
    * doe\",\"35\"]}`) cannot exceed 10,000 bytes.
    * 
    * Use [Task parameter variables] to set parameters containing information
    * about job runs
    * 
    * Important
    * 
    * These parameters accept only Latin characters (ASCII character set). Using
    * non-ASCII characters returns an error. Examples of invalid, non-ASCII
    * characters are Chinese, Japanese kanjis, and emojis.
    * 
    * [Task parameter variables]: https://docs.databricks.com/jobs.html#parameter-variables
	*/
	spark_submit_params?: Array<string>;
	/**
    * A map from keys to values for jobs with SQL task, for example
    * `"sql_params": {"name": "john doe", "age": "35"}`. The SQL alert task does
    * not support custom parameters.
	*/
	sql_params?: Record<string, string>;
}

/**
* This describes an enum
*/
export type RunResultState = 
/**
* The run was canceled at user request.
*/
"CANCELED"
/**
* The run was skipped because the necessary conditions were not met.
*/
 |"EXCLUDED"
/**
* The task completed with an error.
*/
 |"FAILED"
/**
* The run was skipped because the maximum concurrent runs were reached.
*/
 |"MAXIMUM_CONCURRENT_RUNS_REACHED"
/**
* The task completed successfully.
*/
 |"SUCCESS"
/**
* The job run completed successfully with some failures; leaf tasks were
* successful.
*/
 |"SUCCESS_WITH_FAILURES"
/**
* The run was stopped after reaching the timeout.
*/
 |"TIMEDOUT"
/**
* The run was skipped because an upstream task was canceled.
*/
 |"UPSTREAM_CANCELED"
/**
* The run was skipped because of an upstream failure.
*/
 |"UPSTREAM_FAILED"
;

/**
* The current state of the run.
*/
export interface RunState {
    
	/**
    * A value indicating the run's current lifecycle state. This field is always
    * available in the response.
	*/
	life_cycle_state?: RunLifeCycleState;
	/**
    * A value indicating the run's result. This field is only available for
    * terminal lifecycle states.
	*/
	result_state?: RunResultState;
	/**
    * A descriptive message for the current state. This field is unstructured,
    * and its exact format is subject to change.
	*/
	state_message?: string;
	/**
    * A value indicating whether a run was canceled manually by a user or by the
    * scheduler because the run timed out.
	*/
	user_cancelled_or_timedout?: boolean;
}

export interface RunTask {
    
	/**
    * The sequence number of this run attempt for a triggered job run. The
    * initial attempt of a run has an attempt_number of 0\. If the initial run
    * attempt fails, and the job has a retry policy (`max_retries` \> 0),
    * subsequent runs are created with an `original_attempt_run_id` of the
    * original attempt’s ID and an incrementing `attempt_number`. Runs are
    * retried only until they succeed, and the maximum `attempt_number` is the
    * same as the `max_retries` value for the job.
	*/
	attempt_number?: number;
	/**
    * The time in milliseconds it took to terminate the cluster and clean up any
    * associated artifacts. The duration of a task run is the sum of the
    * `setup_duration`, `execution_duration`, and the `cleanup_duration`. The
    * `cleanup_duration` field is set to 0 for multitask job runs. The total
    * duration of a multitask job run is the value of the `run_duration` field.
	*/
	cleanup_duration?: number;
	/**
    * The cluster used for this run. If the run is specified to use a new
    * cluster, this field is set once the Jobs service has requested a cluster
    * for the run.
	*/
	cluster_instance?: ClusterInstance;
	/**
    * If condition_task, specifies a condition with an outcome that can be used
    * to control the execution of other tasks. Does not require a cluster to
    * execute and does not support retries or notifications.
	*/
	condition_task?: RunConditionTask;
	/**
    * If dbt_task, indicates that this must execute a dbt task. It requires both
    * Databricks SQL and the ability to use a serverless or a pro SQL warehouse.
	*/
	dbt_task?: DbtTask;
	/**
    * An optional array of objects specifying the dependency graph of the task.
    * All tasks specified in this field must complete successfully before
    * executing this task. The key is `task_key`, and the value is the name
    * assigned to the dependent task.
	*/
	depends_on?: Array<TaskDependency>;
	/**
    * An optional description for this task. The maximum length is 4096 bytes.
	*/
	description?: string;
	/**
    * The time at which this run ended in epoch milliseconds (milliseconds since
    * 1/1/1970 UTC). This field is set to 0 if the job is still running.
	*/
	end_time?: number;
	/**
    * The time in milliseconds it took to execute the commands in the JAR or
    * notebook until they completed, failed, timed out, were cancelled, or
    * encountered an unexpected error. The duration of a task run is the sum of
    * the `setup_duration`, `execution_duration`, and the `cleanup_duration`.
    * The `execution_duration` field is set to 0 for multitask job runs. The
    * total duration of a multitask job run is the value of the `run_duration`
    * field.
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
	libraries?: Array<any /* MISSING TYPE */>;
	/**
    * If new_cluster, a description of a new cluster that is created only for
    * this task.
	*/
	new_cluster?: any /* MISSING TYPE */;
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
    * Parameter values including resolved references
	*/
	resolved_values?: ResolvedValues;
	/**
    * The ID of the task run.
	*/
	run_id?: number;
	/**
    * An optional value indicating the condition that determines whether the
    * task should be run once its dependencies have been completed. When
    * omitted, defaults to `ALL_SUCCESS`. See :method:jobs/create for a list of
    * possible values.
	*/
	run_if?: RunIf;
	/**
    * If run_job_task, indicates that this task must execute another job.
	*/
	run_job_task?: RunJobTask;
	/**
    * The time in milliseconds it took to set up the cluster. For runs that run
    * on new clusters this is the cluster creation time, for runs that run on
    * existing clusters this time should be very short. The duration of a task
    * run is the sum of the `setup_duration`, `execution_duration`, and the
    * `cleanup_duration`. The `setup_duration` field is set to 0 for multitask
    * job runs. The total duration of a multitask job run is the value of the
    * `run_duration` field.
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
    * If spark_submit_task, indicates that this task must be launched by the
    * spark submit script. This task can run only on new clusters
	*/
	spark_submit_task?: SparkSubmitTask;
	/**
    * If sql_task, indicates that this job must execute a SQL.
	*/
	sql_task?: SqlTask;
	/**
    * The time at which this run was started in epoch milliseconds (milliseconds
    * since 1/1/1970 UTC). This may not be the time when the job task starts
    * executing, for example, if the job is scheduled to run on a new cluster,
    * this is the time the cluster creation call is issued.
	*/
	start_time?: number;
	/**
    * The current state of the run.
	*/
	state?: RunState;
	/**
    * A unique name for the task. This field is used to refer to this task from
    * other tasks. This field is required and must be unique within its parent
    * job. On Update or Reset, this field is used to reference the tasks to be
    * updated or reset. The maximum length is 100 characters.
	*/
	task_key?: string;
}

/**
* This describes an enum
*/
export type RunType = 
/**
* Normal job run. A run created with :method:jobs/runNow.
*/
"JOB_RUN"
/**
* Submit run. A run created with :method:jobs/submit.
*/
 |"SUBMIT_RUN"
/**
* Workflow run. A run created with
* [dbutils.notebook.run](/dev-tools/databricks-utils.html#dbutils-workflow).
*/
 |"WORKFLOW_RUN"
;

export type Source = 
"GIT"
 |"WORKSPACE"
;

export interface SparkJarTask {
    
	/**
    * Deprecated since 04/2016. Provide a `jar` through the `libraries` field
    * instead. For an example, see :method:jobs/create.
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
    * Use [Task parameter variables] to set parameters containing information
    * about job runs.
    * 
    * [Task parameter variables]: https://docs.databricks.com/jobs.html#parameter-variables
	*/
	parameters?: Array<string>;
}

export interface SparkPythonTask {
    
	/**
    * Command line parameters passed to the Python file.
    * 
    * Use [Task parameter variables] to set parameters containing information
    * about job runs.
    * 
    * [Task parameter variables]: https://docs.databricks.com/jobs.html#parameter-variables
	*/
	parameters?: Array<string>;
	/**
    * The Python file to be executed. Cloud file URIs (such as dbfs:/, s3:/,
    * adls:/, gcs:/) and workspace paths are supported. For python files stored
    * in the Databricks workspace, the path must be absolute and begin with `/`.
    * For files stored in a remote repository, the path must be relative. This
    * field is required.
	*/
	python_file: string;
	/**
    * Optional location type of the Python file. When set to `WORKSPACE` or not
    * specified, the file will be retrieved from the local <Databricks>
    * workspace or cloud location (if the `python_file` has a URI format). When
    * set to `GIT`, the Python file will be retrieved from a Git repository
    * defined in `git_source`.
    * 
    * * `WORKSPACE`: The Python file is located in a <Databricks> workspace or
    * at a cloud filesystem URI. * `GIT`: The Python file is located in a remote
    * Git repository.
	*/
	source?: Source;
}

export interface SparkSubmitTask {
    
	/**
    * Command-line parameters passed to spark submit.
    * 
    * Use [Task parameter variables] to set parameters containing information
    * about job runs.
    * 
    * [Task parameter variables]: https://docs.databricks.com/jobs.html#parameter-variables
	*/
	parameters?: Array<string>;
}

export interface SqlAlertOutput {
    
	/**
    * The state of the SQL alert.
    * 
    * * UNKNOWN: alert yet to be evaluated * OK: alert evaluated and did not
    * fulfill trigger conditions * TRIGGERED: alert evaluated and fulfilled
    * trigger conditions
	*/
	alert_state?: SqlAlertState;
	/**
    * The link to find the output results.
	*/
	output_link?: string;
	/**
    * The text of the SQL query. Can Run permission of the SQL query associated
    * with the SQL alert is required to view this field.
	*/
	query_text?: string;
	/**
    * Information about SQL statements executed in the run.
	*/
	sql_statements?: Array<SqlStatementOutput>;
	/**
    * The canonical identifier of the SQL warehouse.
	*/
	warehouse_id?: string;
}

/**
* The state of the SQL alert.
* 
* * UNKNOWN: alert yet to be evaluated * OK: alert evaluated and did not fulfill
* trigger conditions * TRIGGERED: alert evaluated and fulfilled trigger
* conditions
*/
export type SqlAlertState = 
"OK"
 |"TRIGGERED"
 |"UNKNOWN"
;

export interface SqlDashboardOutput {
    
	/**
    * The canonical identifier of the SQL warehouse.
	*/
	warehouse_id?: string;
	/**
    * Widgets executed in the run. Only SQL query based widgets are listed.
	*/
	widgets?: Array<SqlDashboardWidgetOutput>;
}

export interface SqlDashboardWidgetOutput {
    
	/**
    * Time (in epoch milliseconds) when execution of the SQL widget ends.
	*/
	end_time?: number;
	/**
    * The information about the error when execution fails.
	*/
	error?: SqlOutputError;
	/**
    * The link to find the output results.
	*/
	output_link?: string;
	/**
    * Time (in epoch milliseconds) when execution of the SQL widget starts.
	*/
	start_time?: number;
	/**
    * The execution status of the SQL widget.
	*/
	status?: SqlDashboardWidgetOutputStatus;
	/**
    * The canonical identifier of the SQL widget.
	*/
	widget_id?: string;
	/**
    * The title of the SQL widget.
	*/
	widget_title?: string;
}

/**
* The execution status of the SQL widget.
*/
export type SqlDashboardWidgetOutputStatus = 
"CANCELLED"
 |"FAILED"
 |"PENDING"
 |"RUNNING"
 |"SUCCESS"
;

export interface SqlOutput {
    
	/**
    * The output of a SQL alert task, if available.
	*/
	alert_output?: SqlAlertOutput;
	/**
    * The output of a SQL dashboard task, if available.
	*/
	dashboard_output?: SqlDashboardOutput;
	/**
    * The output of a SQL query task, if available.
	*/
	query_output?: SqlQueryOutput;
}

export interface SqlOutputError {
    
	/**
    * The error message when execution fails.
	*/
	message?: string;
}

export interface SqlQueryOutput {
    
	/**
    * The link to find the output results.
	*/
	output_link?: string;
	/**
    * The text of the SQL query. Can Run permission of the SQL query is required
    * to view this field.
	*/
	query_text?: string;
	/**
    * Information about SQL statements executed in the run.
	*/
	sql_statements?: Array<SqlStatementOutput>;
	/**
    * The canonical identifier of the SQL warehouse.
	*/
	warehouse_id?: string;
}

export interface SqlStatementOutput {
    
	/**
    * A key that can be used to look up query details.
	*/
	lookup_key?: string;
}

export interface SqlTask {
    
	/**
    * If alert, indicates that this job must refresh a SQL alert.
	*/
	alert?: SqlTaskAlert;
	/**
    * If dashboard, indicates that this job must refresh a SQL dashboard.
	*/
	dashboard?: SqlTaskDashboard;
	/**
    * If file, indicates that this job runs a SQL file in a remote Git
    * repository. Only one SQL statement is supported in a file. Multiple SQL
    * statements separated by semicolons (;) are not permitted.
	*/
	file?: SqlTaskFile;
	/**
    * Parameters to be used for each run of this job. The SQL alert task does
    * not support custom parameters.
	*/
	parameters?: Record<string, string>;
	/**
    * If query, indicates that this job must execute a SQL query.
	*/
	query?: SqlTaskQuery;
	/**
    * The canonical identifier of the SQL warehouse. Only serverless and pro SQL
    * warehouses are supported.
	*/
	warehouse_id: string;
}

export interface SqlTaskAlert {
    
	/**
    * The canonical identifier of the SQL alert.
	*/
	alert_id: string;
	/**
    * If true, the alert notifications are not sent to subscribers.
	*/
	pause_subscriptions?: boolean;
	/**
    * If specified, alert notifications are sent to subscribers.
	*/
	subscriptions?: Array<SqlTaskSubscription>;
}

export interface SqlTaskDashboard {
    
	/**
    * Subject of the email sent to subscribers of this task.
	*/
	custom_subject?: string;
	/**
    * The canonical identifier of the SQL dashboard.
	*/
	dashboard_id: string;
	/**
    * If true, the dashboard snapshot is not taken, and emails are not sent to
    * subscribers.
	*/
	pause_subscriptions?: boolean;
	/**
    * If specified, dashboard snapshots are sent to subscriptions.
	*/
	subscriptions?: Array<SqlTaskSubscription>;
}

export interface SqlTaskFile {
    
	/**
    * Relative path of the SQL file in the remote Git repository.
	*/
	path: string;
}

export interface SqlTaskQuery {
    
	/**
    * The canonical identifier of the SQL query.
	*/
	query_id: string;
}

export interface SqlTaskSubscription {
    
	/**
    * The canonical identifier of the destination to receive email notification.
	*/
	destination_id?: string;
	/**
    * The user name to receive the subscription email.
	*/
	user_name?: string;
}

export interface SubmitRun {
    
	/**
    * List of permissions to set on the job.
	*/
	access_control_list?: Array<any /* MISSING TYPE */>;
	/**
    * An optional set of email addresses notified when the run begins or
    * completes. The default behavior is to not send any emails.
	*/
	email_notifications?: JobEmailNotifications;
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
    * For more information, see [How to ensure idempotency for jobs].
    * 
    * [How to ensure idempotency for jobs]: https://kb.databricks.com/jobs/jobs-idempotency.html
	*/
	idempotency_token?: string;
	/**
    * Optional notification settings that are used when sending notifications to
    * each of the `webhook_notifications` for this run.
	*/
	notification_settings?: JobNotificationSettings;
	/**
    * An optional name for the run. The default value is `Untitled`.
	*/
	run_name?: string;
	tasks?: Array<SubmitTask>;
	/**
    * An optional timeout applied to each run of this job. The default behavior
    * is to have no timeout.
	*/
	timeout_seconds?: number;
	/**
    * A collection of system notification IDs to notify when the run begins or
    * completes. The default behavior is to not send any system notifications.
	*/
	webhook_notifications?: WebhookNotifications;
}

export interface SubmitRunResponse {
    
	/**
    * The canonical identifier for the newly submitted run.
	*/
	run_id?: number;
}

export interface SubmitTask {
    
	/**
    * If condition_task, specifies a condition with an outcome that can be used
    * to control the execution of other tasks. Does not require a cluster to
    * execute and does not support retries or notifications.
	*/
	condition_task?: ConditionTask;
	/**
    * An optional array of objects specifying the dependency graph of the task.
    * All tasks specified in this field must complete successfully before
    * executing this task. The key is `task_key`, and the value is the name
    * assigned to the dependent task.
	*/
	depends_on?: Array<TaskDependency>;
	/**
    * An optional set of email addresses notified when the task run begins or
    * completes. The default behavior is to not send any emails.
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
    * An optional list of libraries to be installed on the cluster that executes
    * the task. The default value is an empty list.
	*/
	libraries?: Array<any /* MISSING TYPE */>;
	/**
    * If new_cluster, a description of a cluster that is created for each run.
	*/
	new_cluster?: any /* MISSING TYPE */;
	/**
    * If notebook_task, indicates that this task must run a notebook. This field
    * may not be specified in conjunction with spark_jar_task.
	*/
	notebook_task?: NotebookTask;
	/**
    * Optional notification settings that are used when sending email
    * notifications for this task run.
	*/
	notification_settings?: TaskNotificationSettings;
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
    * spark submit script. This task can run only on new clusters.
	*/
	spark_submit_task?: SparkSubmitTask;
	/**
    * If sql_task, indicates that this job must execute a SQL.
	*/
	sql_task?: SqlTask;
	/**
    * A unique name for the task. This field is used to refer to this task from
    * other tasks. This field is required and must be unique within its parent
    * job. On Update or Reset, this field is used to reference the tasks to be
    * updated or reset. The maximum length is 100 characters.
	*/
	task_key: string;
	/**
    * An optional timeout applied to each run of this job task. The default
    * behavior is to have no timeout.
	*/
	timeout_seconds?: number;
}

export interface Task {
    
	/**
    * The key of the compute requirement, specified in `job.settings.compute`,
    * to use for execution of this task.
	*/
	compute_key?: string;
	/**
    * If condition_task, specifies a condition with an outcome that can be used
    * to control the execution of other tasks. Does not require a cluster to
    * execute and does not support retries or notifications.
	*/
	condition_task?: ConditionTask;
	/**
    * If dbt_task, indicates that this must execute a dbt task. It requires both
    * Databricks SQL and the ability to use a serverless or a pro SQL warehouse.
	*/
	dbt_task?: DbtTask;
	/**
    * An optional array of objects specifying the dependency graph of the task.
    * All tasks specified in this field must complete successfully before
    * executing this task. The key is `task_key`, and the value is the name
    * assigned to the dependent task.
	*/
	depends_on?: Array<TaskDependency>;
	/**
    * An optional description for this task. The maximum length is 4096 bytes.
	*/
	description?: string;
	/**
    * An optional set of email addresses that is notified when runs of this task
    * begin or complete as well as when this task is deleted. The default
    * behavior is to not send any emails.
	*/
	email_notifications?: TaskEmailNotifications;
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
	libraries?: Array<any /* MISSING TYPE */>;
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
    * If new_cluster, a description of a cluster that is created for only for
    * this task.
	*/
	new_cluster?: any /* MISSING TYPE */;
	/**
    * If notebook_task, indicates that this task must run a notebook. This field
    * may not be specified in conjunction with spark_jar_task.
	*/
	notebook_task?: NotebookTask;
	/**
    * Optional notification settings that are used when sending notifications to
    * each of the `email_notifications` for this task.
	*/
	notification_settings?: TaskNotificationSettings;
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
    * An optional value specifying the condition determining whether the task is
    * run once its dependencies have been completed. When omitted, defaults to
    * `ALL_SUCCESS`.
    * 
    * * `ALL_SUCCESS`: All dependencies have executed and succeeded *
    * `AT_LEAST_ONE_SUCCESS`: At least one dependency has succeeded *
    * `NONE_FAILED`: None of the dependencies have failed and at least one was
    * executed * `ALL_DONE`: All dependencies completed and at least one was
    * executed * `AT_LEAST_ONE_FAILED`: At least one dependency failed *
    * `ALL_FAILED`: ALl dependencies have failed
	*/
	run_if?: RunIf;
	/**
    * If run_job_task, indicates that this task must execute another job.
	*/
	run_job_task?: RunJobTask;
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
    * spark submit script. This task can run only on new clusters.
	*/
	spark_submit_task?: SparkSubmitTask;
	/**
    * If sql_task, indicates that this job must execute a SQL task.
	*/
	sql_task?: SqlTask;
	/**
    * A unique name for the task. This field is used to refer to this task from
    * other tasks. This field is required and must be unique within its parent
    * job. On Update or Reset, this field is used to reference the tasks to be
    * updated or reset. The maximum length is 100 characters.
	*/
	task_key: string;
	/**
    * An optional timeout applied to each run of this job task. The default
    * behavior is to have no timeout.
	*/
	timeout_seconds?: number;
}

export interface TaskDependency {
    
	/**
    * Can only be specified on condition task dependencies. The outcome of the
    * dependent task that must be met for this task to run.
	*/
	outcome?: string;
	/**
    * The name of the task this task depends on.
	*/
	task_key: string;
}

export interface TaskEmailNotifications {
    
	/**
    * A list of email addresses to be notified when a run unsuccessfully
    * completes. A run is considered to have completed unsuccessfully if it ends
    * with an `INTERNAL_ERROR` `life_cycle_state` or a `FAILED`, or `TIMED_OUT`
    * result_state. If this is not specified on job creation, reset, or update
    * the list is empty, and notifications are not sent.
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
    * with a `TERMINATED` `life_cycle_state` and a `SUCCESS` result_state. If
    * not specified on job creation, reset, or update, the list is empty, and
    * notifications are not sent.
	*/
	on_success?: Array<string>;
}

export interface TaskNotificationSettings {
    
	/**
    * If true, do not send notifications to recipients specified in `on_start`
    * for the retried runs and do not send notifications to recipients specified
    * in `on_failure` until the last retry of the run.
	*/
	alert_on_last_attempt?: boolean;
	/**
    * If true, do not send notifications to recipients specified in `on_failure`
    * if the run is canceled.
	*/
	no_alert_for_canceled_runs?: boolean;
	/**
    * If true, do not send notifications to recipients specified in `on_failure`
    * if the run is skipped.
	*/
	no_alert_for_skipped_runs?: boolean;
}

export interface TriggerEvaluation {
    
	/**
    * Human-readable description of the the trigger evaluation result. Explains
    * why the trigger evaluation triggered or did not trigger a run, or failed.
	*/
	description?: string;
	/**
    * The ID of the run that was triggered by the trigger evaluation. Only
    * returned if a run was triggered.
	*/
	run_id?: number;
	/**
    * Timestamp at which the trigger was evaluated.
	*/
	timestamp?: number;
}

export interface TriggerHistory {
    
	/**
    * The last time the trigger failed to evaluate.
	*/
	last_failed?: TriggerEvaluation;
	/**
    * The last time the trigger was evaluated but did not trigger a run.
	*/
	last_not_triggered?: TriggerEvaluation;
	/**
    * The last time the run was triggered due to a file arrival.
	*/
	last_triggered?: TriggerEvaluation;
}

export interface TriggerInfo {
    
	/**
    * The run id of the Run Job task run
	*/
	run_id?: number;
}

export interface TriggerSettings {
    
	/**
    * File arrival trigger settings.
	*/
	file_arrival?: FileArrivalTriggerConfiguration;
	/**
    * Whether this trigger is paused or not.
	*/
	pause_status?: PauseStatus;
}

/**
* This describes an enum
*/
export type TriggerType = 
/**
* Indicates a run that is triggered by a file arrival.
*/
"FILE_ARRIVAL"
/**
* One time triggers that fire a single run. This occurs you triggered a single
* run on demand through the UI or the API.
*/
 |"ONE_TIME"
/**
* Schedules that periodically trigger runs, such as a cron scheduler.
*/
 |"PERIODIC"
/**
* Indicates a run that is triggered as a retry of a previously failed run. This
* occurs when you request to re-run the job in case of failures.
*/
 |"RETRY"
/**
* Indicates a run that is triggered using a Run Job task.
*/
 |"RUN_JOB_TASK"
;

export interface UpdateJob {
    
	/**
    * Remove top-level fields in the job settings. Removing nested fields is not
    * supported, except for tasks and job clusters (`tasks/task_1`). This field
    * is optional.
	*/
	fields_to_remove?: Array<string>;
	/**
    * The canonical identifier of the job to update. This field is required.
	*/
	job_id: number;
	/**
    * The new settings for the job.
    * 
    * Top-level fields specified in `new_settings` are completely replaced,
    * except for arrays which are merged. That is, new and existing entries are
    * completely replaced based on the respective key fields, i.e. `task_key` or
    * `job_cluster_key`, while previous entries are kept.
    * 
    * Partially updating nested fields is not supported.
    * 
    * Changes to the field `JobSettings.timeout_seconds` are applied to active
    * runs. Changes to other fields are applied to future runs only.
	*/
	new_settings?: JobSettings;
}

export interface ViewItem {
    
	/**
    * Content of the view.
	*/
	content?: string;
	/**
    * Name of the view item. In the case of code view, it would be the
    * notebook’s name. In the case of dashboard view, it would be the
    * dashboard’s name.
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
"DASHBOARD"
/**
* Notebook view item.
*/
 |"NOTEBOOK"
;

/**
* This describes an enum
*/
export type ViewsToExport = 
/**
* All views of the notebook.
*/
"ALL"
/**
* Code view of the notebook.
*/
 |"CODE"
/**
* All dashboard views of the notebook.
*/
 |"DASHBOARDS"
;

export interface Webhook {
    
	id?: string;
}

export interface WebhookNotifications {
    
	/**
    * An optional list of system notification IDs to call when the run fails. A
    * maximum of 3 destinations can be specified for the `on_failure` property.
	*/
	on_failure?: Array<Webhook>;
	/**
    * An optional list of system notification IDs to call when the run starts. A
    * maximum of 3 destinations can be specified for the `on_start` property.
	*/
	on_start?: Array<Webhook>;
	/**
    * An optional list of system notification IDs to call when the run completes
    * successfully. A maximum of 3 destinations can be specified for the
    * `on_success` property.
	*/
	on_success?: Array<Webhook>;
}

