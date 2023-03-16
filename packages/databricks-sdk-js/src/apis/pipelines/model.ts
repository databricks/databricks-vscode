/* eslint-disable @typescript-eslint/naming-convention */

// Code generated from OpenAPI specs by Databricks SDK Generator. DO NOT EDIT.

// all definitions in this file are in alphabetical order
export interface CreatePipeline {
    /**
     * If false, deployment will fail if name conflicts with that of another
     * pipeline.
     */
    allow_duplicate_names?: boolean;
    /**
     * Catalog in UC to add tables to. If target is specified, tables in this
     * pipeline will be published to a "target" schema inside catalog (i.e.
     * <catalog>.<target>.<table>).
     */
    catalog?: string;
    /**
     * DLT Release Channel that specifies which version to use.
     */
    channel?: string;
    /**
     * Cluster settings for this pipeline deployment.
     */
    clusters?: Array<PipelineCluster>;
    /**
     * String-String configuration for this pipeline execution.
     */
    configuration?: Record<string, string>;
    /**
     * Whether the pipeline is continuous or triggered. This replaces `trigger`.
     */
    continuous?: boolean;
    /**
     * Whether the pipeline is in Development mode. Defaults to false.
     */
    development?: boolean;
    dry_run?: boolean;
    /**
     * Pipeline product edition.
     */
    edition?: string;
    /**
     * Filters on which Pipeline packages to include in the deployed graph.
     */
    filters?: Filters;
    /**
     * Unique identifier for this pipeline.
     */
    id?: string;
    /**
     * Libraries or code needed by this deployment.
     */
    libraries?: Array<PipelineLibrary>;
    /**
     * Friendly identifier for this pipeline.
     */
    name?: string;
    /**
     * Whether Photon is enabled for this pipeline.
     */
    photon?: boolean;
    /**
     * DBFS root directory for storing checkpoints and tables.
     */
    storage?: string;
    /**
     * Target schema (database) to add tables in this pipeline to.
     */
    target?: string;
    /**
     * Which pipeline trigger to use. Deprecated: Use `continuous` instead.
     */
    trigger?: PipelineTrigger;
}

export interface CreatePipelineResponse {
    /**
     * Only returned when dry_run is true
     */
    effective_settings?: PipelineSpec;
    /**
     * Only returned when dry_run is false
     */
    pipeline_id?: string;
}

export interface CronTrigger {
    quartz_cron_schedule?: string;
    timezone_id?: string;
}

export interface DataPlaneId {
    /**
     * The instance name of the data plane emitting an event.
     */
    instance?: string;
    /**
     * A sequence number, unique and increasing within the data plane instance.
     */
    seq_no?: any /* MISSING TYPE */;
}

/**
 * Delete a pipeline
 */
export interface Delete {
    pipeline_id: string;
}

export interface EditPipeline {
    /**
     * If false, deployment will fail if name has changed and conflicts the name
     * of another pipeline.
     */
    allow_duplicate_names?: boolean;
    /**
     * Catalog in UC to add tables to. If target is specified, tables in this
     * pipeline will be published to a "target" schema inside catalog (i.e.
     * <catalog>.<target>.<table>).
     */
    catalog?: string;
    /**
     * DLT Release Channel that specifies which version to use.
     */
    channel?: string;
    /**
     * Cluster settings for this pipeline deployment.
     */
    clusters?: Array<PipelineCluster>;
    /**
     * String-String configuration for this pipeline execution.
     */
    configuration?: Record<string, string>;
    /**
     * Whether the pipeline is continuous or triggered. This replaces `trigger`.
     */
    continuous?: boolean;
    /**
     * Whether the pipeline is in Development mode. Defaults to false.
     */
    development?: boolean;
    /**
     * Pipeline product edition.
     */
    edition?: string;
    /**
     * If present, the last-modified time of the pipeline settings before the
     * edit. If the settings were modified after that time, then the request will
     * fail with a conflict.
     */
    expected_last_modified?: number;
    /**
     * Filters on which Pipeline packages to include in the deployed graph.
     */
    filters?: Filters;
    /**
     * Unique identifier for this pipeline.
     */
    id?: string;
    /**
     * Libraries or code needed by this deployment.
     */
    libraries?: Array<PipelineLibrary>;
    /**
     * Friendly identifier for this pipeline.
     */
    name?: string;
    /**
     * Whether Photon is enabled for this pipeline.
     */
    photon?: boolean;
    /**
     * Unique identifier for this pipeline.
     */
    pipeline_id?: string;
    /**
     * DBFS root directory for storing checkpoints and tables.
     */
    storage?: string;
    /**
     * Target schema (database) to add tables in this pipeline to.
     */
    target?: string;
    /**
     * Which pipeline trigger to use. Deprecated: Use `continuous` instead.
     */
    trigger?: PipelineTrigger;
}

export interface ErrorDetail {
    /**
     * The exception thrown for this error, with its chain of cause.
     */
    exceptions?: Array<SerializedException>;
    /**
     * Whether this error is considered fatal, that is, unrecoverable.
     */
    fatal?: boolean;
}

/**
 * The severity level of the event.
 */
export type EventLevel = "ERROR" | "INFO" | "METRICS" | "WARN";

export interface Filters {
    /**
     * Paths to exclude.
     */
    exclude?: Array<string>;
    /**
     * Paths to include.
     */
    include?: Array<string>;
}

/**
 * Get a pipeline
 */
export interface Get {
    pipeline_id: string;
}

export interface GetPipelineResponse {
    /**
     * An optional message detailing the cause of the pipeline state.
     */
    cause?: string;
    /**
     * The ID of the cluster that the pipeline is running on.
     */
    cluster_id?: string;
    /**
     * The username of the pipeline creator.
     */
    creator_user_name?: string;
    /**
     * The health of a pipeline.
     */
    health?: GetPipelineResponseHealth;
    /**
     * The last time the pipeline settings were modified or created.
     */
    last_modified?: number;
    /**
     * Status of the latest updates for the pipeline. Ordered with the newest
     * update first.
     */
    latest_updates?: Array<UpdateStateInfo>;
    /**
     * A human friendly identifier for the pipeline, taken from the `spec`.
     */
    name?: string;
    /**
     * The ID of the pipeline.
     */
    pipeline_id?: string;
    /**
     * Username of the user that the pipeline will run on behalf of.
     */
    run_as_user_name?: string;
    /**
     * The pipeline specification. This field is not returned when called by
     * `ListPipelines`.
     */
    spec?: PipelineSpec;
    /**
     * The pipeline state.
     */
    state?: PipelineState;
}

/**
 * The health of a pipeline.
 */
export type GetPipelineResponseHealth = "HEALTHY" | "UNHEALTHY";

/**
 * Get a pipeline update
 */
export interface GetUpdate {
    /**
     * The ID of the pipeline.
     */
    pipeline_id: string;
    /**
     * The ID of the update.
     */
    update_id: string;
}

export interface GetUpdateResponse {
    /**
     * The current update info.
     */
    update?: UpdateInfo;
}

/**
 * List pipeline events
 */
export interface ListPipelineEvents {
    /**
     * Criteria to select a subset of results, expressed using a SQL-like syntax.
     * The supported filters are:
     *
     * 1. level='INFO' (or WARN or ERROR)
     *
     * 2. level in ('INFO', 'WARN')
     *
     * 3. id='[event-id]'
     *
     * 4. timestamp > 'TIMESTAMP' (or >=,<,<=,=)
     *
     * Composite expressions are supported, for example: level in ('ERROR',
     * 'WARN') AND timestamp> '2021-07-22T06:37:33.083Z'
     */
    filter?: string;
    /**
     * Max number of entries to return in a single page. The system may return
     * fewer than max_results events in a response, even if there are more events
     * available.
     */
    max_results?: number;
    /**
     * A string indicating a sort order by timestamp for the results, for
     * example, ["timestamp asc"]. The sort order can be ascending or descending.
     * By default, events are returned in descending order by timestamp.
     */
    order_by?: Array<string>;
    /**
     * Page token returned by previous call. This field is mutually exclusive
     * with all fields in this request except max_results. An error is returned
     * if any fields other than max_results are set when this field is set.
     */
    page_token?: string;
    pipeline_id: string;
}

export interface ListPipelineEventsResponse {
    /**
     * The list of events matching the request criteria.
     */
    events?: Array<PipelineEvent>;
    /**
     * If present, a token to fetch the next page of events.
     */
    next_page_token?: string;
    /**
     * If present, a token to fetch the previous page of events.
     */
    prev_page_token?: string;
}

/**
 * List pipelines
 */
export interface ListPipelines {
    /**
     * Select a subset of results based on the specified criteria. The supported
     * filters are:
     *
     * * `notebook='<path>'` to select pipelines that reference the provided
     * notebook path. * `name LIKE '[pattern]'` to select pipelines with a name
     * that matches pattern. Wildcards are supported, for example: `name LIKE
     * '%shopping%'`
     *
     * Composite filters are not supported. This field is optional.
     */
    filter?: string;
    /**
     * The maximum number of entries to return in a single page. The system may
     * return fewer than max_results events in a response, even if there are more
     * events available. This field is optional. The default value is 25. The
     * maximum value is 100. An error is returned if the value of max_results is
     * greater than 100.
     */
    max_results?: number;
    /**
     * A list of strings specifying the order of results. Supported order_by
     * fields are id and name. The default is id asc. This field is optional.
     */
    order_by?: Array<string>;
    /**
     * Page token returned by previous call
     */
    page_token?: string;
}

export interface ListPipelinesResponse {
    /**
     * If present, a token to fetch the next page of events.
     */
    next_page_token?: string;
    /**
     * The list of events matching the request criteria.
     */
    statuses?: Array<PipelineStateInfo>;
}

/**
 * List pipeline updates
 */
export interface ListUpdates {
    /**
     * Max number of entries to return in a single page.
     */
    max_results?: number;
    /**
     * Page token returned by previous call
     */
    page_token?: string;
    /**
     * The pipeline to return updates for.
     */
    pipeline_id: string;
    /**
     * If present, returns updates until and including this update_id.
     */
    until_update_id?: string;
}

export interface ListUpdatesResponse {
    /**
     * If present, then there are more results, and this a token to be used in a
     * subsequent request to fetch the next page.
     */
    next_page_token?: string;
    /**
     * If present, then this token can be used in a subsequent request to fetch
     * the previous page.
     */
    prev_page_token?: string;
    updates?: Array<UpdateInfo>;
}

/**
 * Maturity level for EventDetails.
 */
export type MaturityLevel = "DEPRECATED" | "EVOLVING" | "STABLE";

export interface NotebookLibrary {
    /**
     * The absolute path of the notebook.
     */
    path?: string;
}

export interface Origin {
    /**
     * The id of a batch. Unique within a flow.
     */
    batch_id?: number;
    /**
     * The cloud provider, e.g., AWS or Azure.
     */
    cloud?: string;
    /**
     * The id of the cluster where an execution happens. Unique within a region.
     */
    cluster_id?: string;
    /**
     * The name of a dataset. Unique within a pipeline.
     */
    dataset_name?: string;
    /**
     * The id of the flow. Globally unique. Incremental queries will generally
     * reuse the same id while complete queries will have a new id per update.
     */
    flow_id?: string;
    /**
     * The name of the flow. Not unique.
     */
    flow_name?: string;
    /**
     * The optional host name where the event was triggered
     */
    host?: string;
    /**
     * The id of a maintenance run. Globally unique.
     */
    maintenance_id?: string;
    /**
     * Materialization name.
     */
    materialization_name?: string;
    /**
     * The org id of the user. Unique within a cloud.
     */
    org_id?: number;
    /**
     * The id of the pipeline. Globally unique.
     */
    pipeline_id?: string;
    /**
     * The name of the pipeline. Not unique.
     */
    pipeline_name?: string;
    /**
     * The cloud region.
     */
    region?: string;
    /**
     * The id of the request that caused an update.
     */
    request_id?: string;
    /**
     * The id of a (delta) table. Globally unique.
     */
    table_id?: string;
    /**
     * The Unity Catalog id of the MV or ST being updated.
     */
    uc_resource_id?: string;
    /**
     * The id of an execution. Globally unique.
     */
    update_id?: string;
}

export interface PipelineCluster {
    /**
     * Note: This field won't be persisted. Only API users will check this field.
     */
    apply_policy_default_values?: boolean;
    /**
     * Parameters needed in order to automatically scale clusters up and down
     * based on load. Note: autoscaling works best with DB runtime versions 3.0
     * or later.
     */
    autoscale?: any /* MISSING TYPE */;
    /**
     * Attributes related to clusters running on Amazon Web Services. If not
     * specified at cluster creation, a set of default values will be used.
     */
    aws_attributes?: any /* MISSING TYPE */;
    /**
     * Attributes related to clusters running on Amazon Web Services. If not
     * specified at cluster creation, a set of default values will be used.
     */
    azure_attributes?: any /* MISSING TYPE */;
    /**
     * The configuration for delivering spark logs to a long-term storage
     * destination. Two kinds of destinations (dbfs and s3) are supported. Only
     * one destination can be specified for one cluster. If the conf is given,
     * the logs will be delivered to the destination every `5 mins`. The
     * destination of driver logs is `$destination/$clusterId/driver`, while the
     * destination of executor logs is `$destination/$clusterId/executor`.
     */
    cluster_log_conf?: any /* MISSING TYPE */;
    /**
     * Additional tags for cluster resources. Databricks will tag all cluster
     * resources (e.g., AWS instances and EBS volumes) with these tags in
     * addition to `default_tags`. Notes:
     *
     * - Currently, Databricks allows at most 45 custom tags
     *
     * - Clusters can only reuse cloud resources if the resources' tags are a
     * subset of the cluster tags
     */
    custom_tags?: Record<string, string>;
    /**
     * The optional ID of the instance pool for the driver of the cluster
     * belongs. The pool cluster uses the instance pool with id
     * (instance_pool_id) if the driver pool is not assigned.
     */
    driver_instance_pool_id?: string;
    /**
     * The node type of the Spark driver. Note that this field is optional; if
     * unset, the driver node type will be set as the same value as
     * `node_type_id` defined above.
     */
    driver_node_type_id?: string;
    /**
     * Attributes related to clusters running on Google Cloud Platform. If not
     * specified at cluster creation, a set of default values will be used.
     */
    gcp_attributes?: any /* MISSING TYPE */;
    /**
     * The optional ID of the instance pool to which the cluster belongs.
     */
    instance_pool_id?: string;
    /**
     * Cluster label
     */
    label?: string;
    /**
     * This field encodes, through a single value, the resources available to
     * each of the Spark nodes in this cluster. For example, the Spark nodes can
     * be provisioned and optimized for memory or compute intensive workloads. A
     * list of available node types can be retrieved by using the
     * :method:clusters/listNodeTypes API call.
     */
    node_type_id?: string;
    /**
     * Number of worker nodes that this cluster should have. A cluster has one
     * Spark Driver and `num_workers` Executors for a total of `num_workers` + 1
     * Spark nodes.
     *
     * Note: When reading the properties of a cluster, this field reflects the
     * desired number of workers rather than the actual current number of
     * workers. For instance, if a cluster is resized from 5 to 10 workers, this
     * field will immediately be updated to reflect the target size of 10
     * workers, whereas the workers listed in `spark_info` will gradually
     * increase from 5 to 10 as the new nodes are provisioned.
     */
    num_workers?: number;
    /**
     * The ID of the cluster policy used to create the cluster if applicable.
     */
    policy_id?: string;
    /**
     * An object containing a set of optional, user-specified Spark configuration
     * key-value pairs. See :method:clusters/create for more details.
     */
    spark_conf?: Record<string, string>;
    /**
     * An object containing a set of optional, user-specified environment
     * variable key-value pairs. Please note that key-value pair of the form
     * (X,Y) will be exported as is (i.e., `export X='Y'`) while launching the
     * driver and workers.
     *
     * In order to specify an additional set of `SPARK_DAEMON_JAVA_OPTS`, we
     * recommend appending them to `$SPARK_DAEMON_JAVA_OPTS` as shown in the
     * example below. This ensures that all default databricks managed
     * environmental variables are included as well.
     *
     * Example Spark environment variables: `{"SPARK_WORKER_MEMORY": "28000m",
     * "SPARK_LOCAL_DIRS": "/local_disk0"}` or `{"SPARK_DAEMON_JAVA_OPTS":
     * "$SPARK_DAEMON_JAVA_OPTS -Dspark.shuffle.service.enabled=true"}`
     */
    spark_env_vars?: Record<string, string>;
    /**
     * SSH public key contents that will be added to each Spark node in this
     * cluster. The corresponding private keys can be used to login with the user
     * name `ubuntu` on port `2200`. Up to 10 keys can be specified.
     */
    ssh_public_keys?: Array<string>;
}

export interface PipelineEvent {
    /**
     * Information about an error captured by the event.
     */
    error?: ErrorDetail;
    /**
     * The event type. Should always correspond to the details
     */
    event_type?: string;
    /**
     * A time-based, globally unique id.
     */
    id?: string;
    /**
     * The severity level of the event.
     */
    level?: EventLevel;
    /**
     * Maturity level for event_type.
     */
    maturity_level?: MaturityLevel;
    /**
     * The display message associated with the event.
     */
    message?: string;
    /**
     * Describes where the event originates from.
     */
    origin?: Origin;
    /**
     * A sequencing object to identify and order events.
     */
    sequence?: Sequencing;
    /**
     * The time of the event.
     */
    timestamp?: string;
}

export interface PipelineLibrary {
    /**
     * URI of the jar to be installed. Currently only DBFS and S3 URIs are
     * supported. For example: `{ "jar": "dbfs:/mnt/databricks/library.jar" }` or
     * `{ "jar": "s3://my-bucket/library.jar" }`. If S3 is used, please make sure
     * the cluster has read access on the library. You may need to launch the
     * cluster with an IAM role to access the S3 URI.
     */
    jar?: string;
    /**
     * Specification of a maven library to be installed. For example: `{
     * "coordinates": "org.jsoup:jsoup:1.7.2" }`
     */
    maven?: any /* MISSING TYPE */;
    /**
     * The path to a notebook that defines a pipeline and is stored in the
     * Databricks workspace. For example: `{ "notebook" : { "path" :
     * "/my-pipeline-notebook-path" } }`. Currently, only Scala notebooks are
     * supported, and pipelines must be defined in a package cell.
     */
    notebook?: NotebookLibrary;
    /**
     * URI of the wheel to be installed. For example: `{ "whl": "dbfs:/my/whl" }`
     * or `{ "whl": "s3://my-bucket/whl" }`. If S3 is used, please make sure the
     * cluster has read access on the library. You may need to launch the cluster
     * with an IAM role to access the S3 URI.
     */
    whl?: string;
}

export interface PipelineSpec {
    /**
     * Catalog in UC to add tables to. If target is specified, tables in this
     * pipeline will be published to a "target" schema inside catalog (i.e.
     * <catalog>.<target>.<table>).
     */
    catalog?: string;
    /**
     * DLT Release Channel that specifies which version to use.
     */
    channel?: string;
    /**
     * Cluster settings for this pipeline deployment.
     */
    clusters?: Array<PipelineCluster>;
    /**
     * String-String configuration for this pipeline execution.
     */
    configuration?: Record<string, string>;
    /**
     * Whether the pipeline is continuous or triggered. This replaces `trigger`.
     */
    continuous?: boolean;
    /**
     * Whether the pipeline is in Development mode. Defaults to false.
     */
    development?: boolean;
    /**
     * Pipeline product edition.
     */
    edition?: string;
    /**
     * Filters on which Pipeline packages to include in the deployed graph.
     */
    filters?: Filters;
    /**
     * Unique identifier for this pipeline.
     */
    id?: string;
    /**
     * Libraries or code needed by this deployment.
     */
    libraries?: Array<PipelineLibrary>;
    /**
     * Friendly identifier for this pipeline.
     */
    name?: string;
    /**
     * Whether Photon is enabled for this pipeline.
     */
    photon?: boolean;
    /**
     * DBFS root directory for storing checkpoints and tables.
     */
    storage?: string;
    /**
     * Target schema (database) to add tables in this pipeline to.
     */
    target?: string;
    /**
     * Which pipeline trigger to use. Deprecated: Use `continuous` instead.
     */
    trigger?: PipelineTrigger;
}

/**
 * The pipeline state.
 */
export type PipelineState =
    | "DELETED"
    | "DEPLOYING"
    | "FAILED"
    | "IDLE"
    | "RECOVERING"
    | "RESETTING"
    | "RUNNING"
    | "STARTING"
    | "STOPPING";

export interface PipelineStateInfo {
    /**
     * The unique identifier of the cluster running the pipeline.
     */
    cluster_id?: string;
    /**
     * The username of the pipeline creator.
     */
    creator_user_name?: string;
    /**
     * Status of the latest updates for the pipeline. Ordered with the newest
     * update first.
     */
    latest_updates?: Array<UpdateStateInfo>;
    /**
     * The user-friendly name of the pipeline.
     */
    name?: string;
    /**
     * The unique identifier of the pipeline.
     */
    pipeline_id?: string;
    /**
     * The username that the pipeline runs as. This is a read only value derived
     * from the pipeline owner.
     */
    run_as_user_name?: string;
    /**
     * The pipeline state.
     */
    state?: PipelineState;
}

export interface PipelineTrigger {
    cron?: CronTrigger;
    manual?: any /* MISSING TYPE */;
}

/**
 * Reset a pipeline
 */
export interface Reset {
    pipeline_id: string;
}

export interface Sequencing {
    /**
     * A sequence number, unique and increasing within the control plane.
     */
    control_plane_seq_no?: number;
    /**
     * the ID assigned by the data plane.
     */
    data_plane_id?: DataPlaneId;
}

export interface SerializedException {
    /**
     * Runtime class of the exception
     */
    class_name?: string;
    /**
     * Exception message
     */
    message?: string;
    /**
     * Stack trace consisting of a list of stack frames
     */
    stack?: Array<StackFrame>;
}

export interface StackFrame {
    /**
     * Class from which the method call originated
     */
    declaring_class?: string;
    /**
     * File where the method is defined
     */
    file_name?: string;
    /**
     * Line from which the method was called
     */
    line_number?: number;
    /**
     * Name of the method which was called
     */
    method_name?: string;
}

export interface StartUpdate {
    cause?: StartUpdateCause;
    /**
     * If true, this update will reset all tables before running.
     */
    full_refresh?: boolean;
    /**
     * A list of tables to update with fullRefresh. If both refresh_selection and
     * full_refresh_selection are empty, this is a full graph update. Full
     * Refresh on a table means that the states of the table will be reset before
     * the refresh.
     */
    full_refresh_selection?: Array<string>;
    pipeline_id: string;
    /**
     * A list of tables to update without fullRefresh. If both refresh_selection
     * and full_refresh_selection are empty, this is a full graph update. Full
     * Refresh on a table means that the states of the table will be reset before
     * the refresh.
     */
    refresh_selection?: Array<string>;
}

export type StartUpdateCause =
    | "API_CALL"
    | "JOB_TASK"
    | "RETRY_ON_FAILURE"
    | "SCHEMA_CHANGE"
    | "SERVICE_UPGRADE"
    | "USER_ACTION";

export interface StartUpdateResponse {
    update_id?: string;
}

/**
 * Stop a pipeline
 */
export interface Stop {
    pipeline_id: string;
}

export interface UpdateInfo {
    /**
     * What triggered this update.
     */
    cause?: UpdateInfoCause;
    /**
     * The ID of the cluster that the update is running on.
     */
    cluster_id?: string;
    /**
     * The pipeline configuration with system defaults applied where unspecified
     * by the user. Not returned by ListUpdates.
     */
    config?: PipelineSpec;
    /**
     * The time when this update was created.
     */
    creation_time?: number;
    /**
     * If true, this update will reset all tables before running.
     */
    full_refresh?: boolean;
    /**
     * A list of tables to update with fullRefresh. If both refresh_selection and
     * full_refresh_selection are empty, this is a full graph update. Full
     * Refresh on a table means that the states of the table will be reset before
     * the refresh.
     */
    full_refresh_selection?: Array<string>;
    /**
     * The ID of the pipeline.
     */
    pipeline_id?: string;
    /**
     * A list of tables to update without fullRefresh. If both refresh_selection
     * and full_refresh_selection are empty, this is a full graph update. Full
     * Refresh on a table means that the states of the table will be reset before
     * the refresh.
     */
    refresh_selection?: Array<string>;
    /**
     * The update state.
     */
    state?: UpdateInfoState;
    /**
     * The ID of this update.
     */
    update_id?: string;
}

/**
 * What triggered this update.
 */
export type UpdateInfoCause =
    | "API_CALL"
    | "JOB_TASK"
    | "RETRY_ON_FAILURE"
    | "SCHEMA_CHANGE"
    | "SERVICE_UPGRADE"
    | "USER_ACTION";

/**
 * The update state.
 */
export type UpdateInfoState =
    | "CANCELED"
    | "COMPLETED"
    | "CREATED"
    | "FAILED"
    | "INITIALIZING"
    | "QUEUED"
    | "RESETTING"
    | "RUNNING"
    | "SETTING_UP_TABLES"
    | "STOPPING"
    | "WAITING_FOR_RESOURCES";

export interface UpdateStateInfo {
    creation_time?: string;
    state?: UpdateStateInfoState;
    update_id?: string;
}

export type UpdateStateInfoState =
    | "CANCELED"
    | "COMPLETED"
    | "CREATED"
    | "FAILED"
    | "INITIALIZING"
    | "QUEUED"
    | "RESETTING"
    | "RUNNING"
    | "SETTING_UP_TABLES"
    | "STOPPING"
    | "WAITING_FOR_RESOURCES";

export interface EmptyResponse {}
