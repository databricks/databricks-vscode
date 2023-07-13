/* eslint-disable @typescript-eslint/naming-convention */

// Code generated from OpenAPI specs by Databricks SDK Generator. DO NOT EDIT.

// all definitions in this file are in alphabetical order
/**
* Activity recorded for the action.
*/
export interface Activity {
    
	/**
    * This describes an enum
	*/
	activity_type?: ActivityType;
	/**
    * User-provided comment associated with the activity.
	*/
	comment?: string;
	/**
    * Creation time of the object, as a Unix timestamp in milliseconds.
	*/
	creation_timestamp?: number;
	/**
    * Source stage of the transition (if the activity is stage transition
    * related). Valid values are:
    * 
    * * `None`: The initial stage of a model version.
    * 
    * * `Staging`: Staging or pre-production stage.
    * 
    * * `Production`: Production stage.
    * 
    * * `Archived`: Archived stage.
	*/
	from_stage?: Stage;
	/**
    * Unique identifier for the object.
	*/
	id?: string;
	/**
    * Time of the object at last update, as a Unix timestamp in milliseconds.
	*/
	last_updated_timestamp?: number;
	/**
    * Comment made by system, for example explaining an activity of type
    * `SYSTEM_TRANSITION`. It usually describes a side effect, such as a version
    * being archived as part of another version's stage transition, and may not
    * be returned for some activity types.
	*/
	system_comment?: string;
	/**
    * Target stage of the transition (if the activity is stage transition
    * related). Valid values are:
    * 
    * * `None`: The initial stage of a model version.
    * 
    * * `Staging`: Staging or pre-production stage.
    * 
    * * `Production`: Production stage.
    * 
    * * `Archived`: Archived stage.
	*/
	to_stage?: Stage;
	/**
    * The username of the user that created the object.
	*/
	user_id?: string;
}

/**
* This describes an enum
*/
export type ActivityAction = 
/**
* Approve a transition request
*/
"APPROVE_TRANSITION_REQUEST"
/**
* Cancel (delete) a transition request
*/
 |"CANCEL_TRANSITION_REQUEST"
/**
* Reject a transition request
*/
 |"REJECT_TRANSITION_REQUEST"
;

/**
* Unique identifier of an activity
*/

/**
* This describes an enum
*/
export type ActivityType = 
/**
* User applied the corresponding stage transition.
*/
"APPLIED_TRANSITION"
/**
* User approved the corresponding stage transition.
*/
 |"APPROVED_REQUEST"
/**
* User cancelled an existing transition request.
*/
 |"CANCELLED_REQUEST"
 |"NEW_COMMENT"
/**
* User rejected the coressponding stage transition.
*/
 |"REJECTED_REQUEST"
/**
* User requested the corresponding stage transition.
*/
 |"REQUESTED_TRANSITION"
/**
* For events performed as a side effect, such as archiving existing model
* versions in a stage.
*/
 |"SYSTEM_TRANSITION"
;

export interface ApproveTransitionRequest {
    
	/**
    * Specifies whether to archive all current model versions in the target
    * stage.
	*/
	archive_existing_versions: boolean;
	/**
    * User-provided comment on the action.
	*/
	comment?: string;
	/**
    * Name of the model.
	*/
	name: string;
	/**
    * Target stage of the transition. Valid values are:
    * 
    * * `None`: The initial stage of a model version.
    * 
    * * `Staging`: Staging or pre-production stage.
    * 
    * * `Production`: Production stage.
    * 
    * * `Archived`: Archived stage.
	*/
	stage: Stage;
	/**
    * Version of the model.
	*/
	version: string;
}

export interface ApproveTransitionRequestResponse {
    
	/**
    * Activity recorded for the action.
	*/
	activity?: Activity;
}

/**
* This describes an enum
*/
export type CommentActivityAction = 
/**
* Delete the comment
*/
"DELETE_COMMENT"
/**
* Edit the comment
*/
 |"EDIT_COMMENT"
;

/**
* Comment details.
*/
export interface CommentObject {
    
	/**
    * Array of actions on the activity allowed for the current viewer.
	*/
	available_actions?: Array<CommentActivityAction>;
	/**
    * User-provided comment on the action.
	*/
	comment?: string;
	/**
    * Creation time of the object, as a Unix timestamp in milliseconds.
	*/
	creation_timestamp?: number;
	/**
    * Comment ID
	*/
	id?: string;
	/**
    * Time of the object at last update, as a Unix timestamp in milliseconds.
	*/
	last_updated_timestamp?: number;
	/**
    * The username of the user that created the object.
	*/
	user_id?: string;
}

export interface CreateComment {
    
	/**
    * User-provided comment on the action.
	*/
	comment: string;
	/**
    * Name of the model.
	*/
	name: string;
	/**
    * Version of the model.
	*/
	version: string;
}

export interface CreateCommentResponse {
    
	/**
    * Comment details.
	*/
	comment?: CommentObject;
}

export interface CreateExperiment {
    
	/**
    * Location where all artifacts for the experiment are stored. If not
    * provided, the remote server will select an appropriate default.
	*/
	artifact_location?: string;
	/**
    * Experiment name.
	*/
	name: string;
	/**
    * A collection of tags to set on the experiment. Maximum tag size and number
    * of tags per request depends on the storage backend. All storage backends
    * are guaranteed to support tag keys up to 250 bytes in size and tag values
    * up to 5000 bytes in size. All storage backends are also guaranteed to
    * support up to 20 tags per request.
	*/
	tags?: Array<ExperimentTag>;
}

export interface CreateExperimentResponse {
    
	/**
    * Unique identifier for the experiment.
	*/
	experiment_id?: string;
}

export interface CreateModelRequest {
    
	/**
    * Optional description for registered model.
	*/
	description?: string;
	/**
    * Register models under this name
	*/
	name: string;
	/**
    * Additional metadata for registered model.
	*/
	tags?: Array<ModelTag>;
}

export interface CreateModelResponse {
    
	registered_model?: Model;
}

export interface CreateModelVersionRequest {
    
	/**
    * Optional description for model version.
	*/
	description?: string;
	/**
    * Register model under this name
	*/
	name: string;
	/**
    * MLflow run ID for correlation, if `source` was generated by an experiment
    * run in MLflow tracking server
	*/
	run_id?: string;
	/**
    * MLflow run link - this is the exact link of the run that generated this
    * model version, potentially hosted at another instance of MLflow.
	*/
	run_link?: string;
	/**
    * URI indicating the location of the model artifacts.
	*/
	source: string;
	/**
    * Additional metadata for model version.
	*/
	tags?: Array<ModelVersionTag>;
}

export interface CreateModelVersionResponse {
    
	/**
    * Return new version number generated for this model in registry.
	*/
	model_version?: ModelVersion;
}

export interface CreateRegistryWebhook {
    
	/**
    * User-specified description for the webhook.
	*/
	description?: string;
	/**
    * Events that can trigger a registry webhook: * `MODEL_VERSION_CREATED`: A
    * new model version was created for the associated model.
    * 
    * * `MODEL_VERSION_TRANSITIONED_STAGE`: A model version’s stage was
    * changed.
    * 
    * * `TRANSITION_REQUEST_CREATED`: A user requested a model version’s stage
    * be transitioned.
    * 
    * * `COMMENT_CREATED`: A user wrote a comment on a registered model.
    * 
    * * `REGISTERED_MODEL_CREATED`: A new registered model was created. This
    * event type can only be specified for a registry-wide webhook, which can be
    * created by not specifying a model name in the create request.
    * 
    * * `MODEL_VERSION_TAG_SET`: A user set a tag on the model version.
    * 
    * * `MODEL_VERSION_TRANSITIONED_TO_STAGING`: A model version was
    * transitioned to staging.
    * 
    * * `MODEL_VERSION_TRANSITIONED_TO_PRODUCTION`: A model version was
    * transitioned to production.
    * 
    * * `MODEL_VERSION_TRANSITIONED_TO_ARCHIVED`: A model version was archived.
    * 
    * * `TRANSITION_REQUEST_TO_STAGING_CREATED`: A user requested a model
    * version be transitioned to staging.
    * 
    * * `TRANSITION_REQUEST_TO_PRODUCTION_CREATED`: A user requested a model
    * version be transitioned to production.
    * 
    * * `TRANSITION_REQUEST_TO_ARCHIVED_CREATED`: A user requested a model
    * version be archived.
	*/
	events: Array<RegistryWebhookEvent>;
	http_url_spec?: HttpUrlSpec;
	job_spec?: JobSpec;
	/**
    * Name of the model whose events would trigger this webhook.
	*/
	model_name?: string;
	/**
    * This describes an enum
	*/
	status?: RegistryWebhookStatus;
}

export interface CreateRun {
    
	/**
    * ID of the associated experiment.
	*/
	experiment_id?: string;
	/**
    * Unix timestamp in milliseconds of when the run started.
	*/
	start_time?: number;
	/**
    * Additional metadata for run.
	*/
	tags?: Array<RunTag>;
	/**
    * ID of the user executing the run. This field is deprecated as of MLflow
    * 1.0, and will be removed in a future MLflow release. Use 'mlflow.user' tag
    * instead.
	*/
	user_id?: string;
}

export interface CreateRunResponse {
    
	/**
    * The newly created run.
	*/
	run?: Run;
}

export interface CreateTransitionRequest {
    
	/**
    * User-provided comment on the action.
	*/
	comment?: string;
	/**
    * Name of the model.
	*/
	name: string;
	/**
    * Target stage of the transition. Valid values are:
    * 
    * * `None`: The initial stage of a model version.
    * 
    * * `Staging`: Staging or pre-production stage.
    * 
    * * `Production`: Production stage.
    * 
    * * `Archived`: Archived stage.
	*/
	stage: Stage;
	/**
    * Version of the model.
	*/
	version: string;
}

export interface CreateTransitionRequestResponse {
    
	/**
    * Transition request details.
	*/
	request?: TransitionRequest;
}

export interface CreateWebhookResponse {
    
	webhook?: RegistryWebhook;
}

export interface Dataset {
    
	/**
    * Dataset digest, e.g. an md5 hash of the dataset that uniquely identifies
    * it within datasets of the same name.
	*/
	digest?: string;
	/**
    * The name of the dataset. E.g. “my.uc.table@2” “nyc-taxi-dataset”,
    * “fantastic-elk-3”
	*/
	name?: string;
	/**
    * The profile of the dataset. Summary statistics for the dataset, such as
    * the number of rows in a table, the mean / std / mode of each column in a
    * table, or the number of elements in an array.
	*/
	profile?: string;
	/**
    * The schema of the dataset. E.g., MLflow ColSpec JSON for a dataframe,
    * MLflow TensorSpec JSON for an ndarray, or another schema format.
	*/
	schema?: string;
	/**
    * The type of the dataset source, e.g. ‘databricks-uc-table’,
    * ‘DBFS’, ‘S3’, ...
	*/
	source?: string;
	/**
    * Source information for the dataset. Note that the source may not exactly
    * reproduce the dataset if it was transformed / modified before use with
    * MLflow.
	*/
	source_type?: string;
}

export interface DatasetInput {
    
	/**
    * The dataset being used as a Run input.
	*/
	dataset?: Dataset;
	/**
    * A list of tags for the dataset input, e.g. a “context” tag with value
    * “training”
	*/
	tags?: Array<InputTag>;
}

/**
* Delete a comment
*/
export interface DeleteCommentRequest {
    
	id: string;
}

export interface DeleteExperiment {
    
	/**
    * ID of the associated experiment.
	*/
	experiment_id: string;
}

/**
* Delete a model
*/
export interface DeleteModelRequest {
    
	/**
    * Registered model unique name identifier.
	*/
	name: string;
}

/**
* Delete a model tag
*/
export interface DeleteModelTagRequest {
    
	/**
    * Name of the tag. The name must be an exact match; wild-card deletion is
    * not supported. Maximum size is 250 bytes.
	*/
	key: string;
	/**
    * Name of the registered model that the tag was logged under.
	*/
	name: string;
}

/**
* Delete a model version.
*/
export interface DeleteModelVersionRequest {
    
	/**
    * Name of the registered model
	*/
	name: string;
	/**
    * Model version number
	*/
	version: string;
}

/**
* Delete a model version tag
*/
export interface DeleteModelVersionTagRequest {
    
	/**
    * Name of the tag. The name must be an exact match; wild-card deletion is
    * not supported. Maximum size is 250 bytes.
	*/
	key: string;
	/**
    * Name of the registered model that the tag was logged under.
	*/
	name: string;
	/**
    * Model version number that the tag was logged under.
	*/
	version: string;
}

export interface DeleteRun {
    
	/**
    * ID of the run to delete.
	*/
	run_id: string;
}

export interface DeleteTag {
    
	/**
    * Name of the tag. Maximum size is 255 bytes. Must be provided.
	*/
	key: string;
	/**
    * ID of the run that the tag was logged under. Must be provided.
	*/
	run_id: string;
}

/**
* Delete a transition request
*/
export interface DeleteTransitionRequestRequest {
    
	/**
    * User-provided comment on the action.
	*/
	comment?: string;
	/**
    * Username of the user who created this request. Of the transition requests
    * matching the specified details, only the one transition created by this
    * user will be deleted.
	*/
	creator: string;
	/**
    * Name of the model.
	*/
	name: string;
	/**
    * Target stage of the transition request. Valid values are:
    * 
    * * `None`: The initial stage of a model version.
    * 
    * * `Staging`: Staging or pre-production stage.
    * 
    * * `Production`: Production stage.
    * 
    * * `Archived`: Archived stage.
	*/
	stage: DeleteTransitionRequestStage;
	/**
    * Version of the model.
	*/
	version: string;
}

export type DeleteTransitionRequestStage = 
"Archived"
 |"None"
 |"Production"
 |"Staging"
;

/**
* Delete a webhook
*/
export interface DeleteWebhookRequest {
    
	/**
    * Webhook ID required to delete a registry webhook.
	*/
	id?: string;
}

export interface Experiment {
    
	/**
    * Location where artifacts for the experiment are stored.
	*/
	artifact_location?: string;
	/**
    * Creation time
	*/
	creation_time?: number;
	/**
    * Unique identifier for the experiment.
	*/
	experiment_id?: string;
	/**
    * Last update time
	*/
	last_update_time?: number;
	/**
    * Current life cycle stage of the experiment: "active" or "deleted". Deleted
    * experiments are not returned by APIs.
	*/
	lifecycle_stage?: string;
	/**
    * Human readable name that identifies the experiment.
	*/
	name?: string;
	/**
    * Tags: Additional metadata key-value pairs.
	*/
	tags?: Array<ExperimentTag>;
}

export interface ExperimentTag {
    
	/**
    * The tag key.
	*/
	key?: string;
	/**
    * The tag value.
	*/
	value?: string;
}

export interface FileInfo {
    
	/**
    * Size in bytes. Unset for directories.
	*/
	file_size?: number;
	/**
    * Whether the path is a directory.
	*/
	is_dir?: boolean;
	/**
    * Path relative to the root artifact directory run.
	*/
	path?: string;
}

/**
* Get metadata
*/
export interface GetByNameRequest {
    
	/**
    * Name of the associated experiment.
	*/
	experiment_name: string;
}

export interface GetExperimentByNameResponse {
    
	/**
    * Experiment details.
	*/
	experiment?: Experiment;
}

/**
* Get an experiment
*/
export interface GetExperimentRequest {
    
	/**
    * ID of the associated experiment.
	*/
	experiment_id: string;
}

/**
* Get history of a given metric within a run
*/
export interface GetHistoryRequest {
    
	/**
    * Maximum number of Metric records to return per paginated request. Default
    * is set to 25,000. If set higher than 25,000, a request Exception will be
    * raised.
	*/
	max_results?: number;
	/**
    * Name of the metric.
	*/
	metric_key: string;
	/**
    * Token indicating the page of metric histories to fetch.
	*/
	page_token?: string;
	/**
    * ID of the run from which to fetch metric values. Must be provided.
	*/
	run_id?: string;
	/**
    * [Deprecated, use run_id instead] ID of the run from which to fetch metric
    * values. This field will be removed in a future MLflow version.
	*/
	run_uuid?: string;
}

export interface GetLatestVersionsRequest {
    
	/**
    * Registered model unique name identifier.
	*/
	name: string;
	/**
    * List of stages.
	*/
	stages?: Array<string>;
}

export interface GetLatestVersionsResponse {
    
	/**
    * Latest version models for each requests stage. Only return models with
    * current `READY` status. If no `stages` provided, returns the latest
    * version for each stage, including `"None"`.
	*/
	model_versions?: Array<ModelVersion>;
}

export interface GetMetricHistoryResponse {
    
	/**
    * All logged values for this metric.
	*/
	metrics?: Array<Metric>;
	/**
    * Token that can be used to retrieve the next page of metric history results
	*/
	next_page_token?: string;
}

/**
* Get model
*/
export interface GetModelRequest {
    
	/**
    * Registered model unique name identifier.
	*/
	name: string;
}

export interface GetModelResponse {
    
	registered_model_databricks?: ModelDatabricks;
}

/**
* Get a model version URI
*/
export interface GetModelVersionDownloadUriRequest {
    
	/**
    * Name of the registered model
	*/
	name: string;
	/**
    * Model version number
	*/
	version: string;
}

export interface GetModelVersionDownloadUriResponse {
    
	/**
    * URI corresponding to where artifacts for this model version are stored.
	*/
	artifact_uri?: string;
}

/**
* Get a model version
*/
export interface GetModelVersionRequest {
    
	/**
    * Name of the registered model
	*/
	name: string;
	/**
    * Model version number
	*/
	version: string;
}

export interface GetModelVersionResponse {
    
	model_version?: ModelVersion;
}

/**
* Get a run
*/
export interface GetRunRequest {
    
	/**
    * ID of the run to fetch. Must be provided.
	*/
	run_id: string;
	/**
    * [Deprecated, use run_id instead] ID of the run to fetch. This field will
    * be removed in a future MLflow version.
	*/
	run_uuid?: string;
}

export interface GetRunResponse {
    
	/**
    * Run metadata (name, start time, etc) and data (metrics, params, and tags).
	*/
	run?: Run;
}

export interface HttpUrlSpec {
    
	/**
    * Value of the authorization header that should be sent in the request sent
    * by the wehbook. It should be of the form `"<auth type> <credentials>"`. If
    * set to an empty string, no authorization header will be included in the
    * request.
	*/
	authorization?: string;
	/**
    * Enable/disable SSL certificate validation. Default is true. For
    * self-signed certificates, this field must be false AND the destination
    * server must disable certificate validation as well. For security purposes,
    * it is encouraged to perform secret validation with the HMAC-encoded
    * portion of the payload and acknowledge the risk associated with disabling
    * hostname validation whereby it becomes more likely that requests can be
    * maliciously routed to an unintended host.
	*/
	enable_ssl_verification?: boolean;
	/**
    * Shared secret required for HMAC encoding payload. The HMAC-encoded payload
    * will be sent in the header as: { "X-Databricks-Signature":
    * $encoded_payload }.
	*/
	secret?: string;
	/**
    * External HTTPS URL called on event trigger (by using a POST request).
	*/
	url: string;
}

export interface HttpUrlSpecWithoutSecret {
    
	/**
    * Enable/disable SSL certificate validation. Default is true. For
    * self-signed certificates, this field must be false AND the destination
    * server must disable certificate validation as well. For security purposes,
    * it is encouraged to perform secret validation with the HMAC-encoded
    * portion of the payload and acknowledge the risk associated with disabling
    * hostname validation whereby it becomes more likely that requests can be
    * maliciously routed to an unintended host.
	*/
	enable_ssl_verification?: boolean;
	/**
    * External HTTPS URL called on event trigger (by using a POST request).
	*/
	url?: string;
}

export interface InputTag {
    
	/**
    * The tag key.
	*/
	key?: string;
	/**
    * The tag value.
	*/
	value?: string;
}

export interface JobSpec {
    
	/**
    * The personal access token used to authorize webhook's job runs.
	*/
	access_token: string;
	/**
    * ID of the job that the webhook runs.
	*/
	job_id: string;
	/**
    * URL of the workspace containing the job that this webhook runs. If not
    * specified, the job’s workspace URL is assumed to be the same as the
    * workspace where the webhook is created.
	*/
	workspace_url?: string;
}

export interface JobSpecWithoutSecret {
    
	/**
    * ID of the job that the webhook runs.
	*/
	job_id?: string;
	/**
    * URL of the workspace containing the job that this webhook runs. Defaults
    * to the workspace URL in which the webhook is created. If not specified,
    * the job’s workspace is assumed to be the same as the webhook’s.
	*/
	workspace_url?: string;
}

/**
* Get all artifacts
*/
export interface ListArtifactsRequest {
    
	/**
    * Token indicating the page of artifact results to fetch
	*/
	page_token?: string;
	/**
    * Filter artifacts matching this path (a relative path from the root
    * artifact directory).
	*/
	path?: string;
	/**
    * ID of the run whose artifacts to list. Must be provided.
	*/
	run_id?: string;
	/**
    * [Deprecated, use run_id instead] ID of the run whose artifacts to list.
    * This field will be removed in a future MLflow version.
	*/
	run_uuid?: string;
}

export interface ListArtifactsResponse {
    
	/**
    * File location and metadata for artifacts.
	*/
	files?: Array<FileInfo>;
	/**
    * Token that can be used to retrieve the next page of artifact results
	*/
	next_page_token?: string;
	/**
    * Root artifact directory for the run.
	*/
	root_uri?: string;
}

/**
* List experiments
*/
export interface ListExperimentsRequest {
    
	/**
    * Maximum number of experiments desired. If `max_results` is unspecified,
    * return all experiments. If `max_results` is too large, it'll be
    * automatically capped at 1000. Callers of this endpoint are encouraged to
    * pass max_results explicitly and leverage page_token to iterate through
    * experiments.
	*/
	max_results?: number;
	/**
    * Token indicating the page of experiments to fetch
	*/
	page_token?: string;
	/**
    * Qualifier for type of experiments to be returned. If unspecified, return
    * only active experiments.
	*/
	view_type?: string;
}

export interface ListExperimentsResponse {
    
	/**
    * Paginated Experiments beginning with the first item on the requested page.
	*/
	experiments?: Array<Experiment>;
	/**
    * Token that can be used to retrieve the next page of experiments. Empty
    * token means no more experiment is available for retrieval.
	*/
	next_page_token?: string;
}

/**
* List models
*/
export interface ListModelsRequest {
    
	/**
    * Maximum number of registered models desired. Max threshold is 1000.
	*/
	max_results?: number;
	/**
    * Pagination token to go to the next page based on a previous query.
	*/
	page_token?: string;
}

export interface ListModelsResponse {
    
	/**
    * Pagination token to request next page of models for the same query.
	*/
	next_page_token?: string;
	registered_models?: Array<Model>;
}

export interface ListRegistryWebhooks {
    
	/**
    * Token that can be used to retrieve the next page of artifact results
	*/
	next_page_token?: string;
	/**
    * Array of registry webhooks.
	*/
	webhooks?: Array<RegistryWebhook>;
}

/**
* List transition requests
*/
export interface ListTransitionRequestsRequest {
    
	/**
    * Name of the model.
	*/
	name: string;
	/**
    * Version of the model.
	*/
	version: string;
}

export interface ListTransitionRequestsResponse {
    
	/**
    * Array of open transition requests.
	*/
	requests?: Array<Activity>;
}

/**
* List registry webhooks
*/
export interface ListWebhooksRequest {
    
	/**
    * If `events` is specified, any webhook with one or more of the specified
    * trigger events is included in the output. If `events` is not specified,
    * webhooks of all event types are included in the output.
	*/
	events?: Array<RegistryWebhookEvent>;
	/**
    * If not specified, all webhooks associated with the specified events are
    * listed, regardless of their associated model.
	*/
	model_name?: string;
	/**
    * Token indicating the page of artifact results to fetch
	*/
	page_token?: string;
}

export interface LogBatch {
    
	/**
    * Metrics to log. A single request can contain up to 1000 metrics, and up to
    * 1000 metrics, params, and tags in total.
	*/
	metrics?: Array<Metric>;
	/**
    * Params to log. A single request can contain up to 100 params, and up to
    * 1000 metrics, params, and tags in total.
	*/
	params?: Array<Param>;
	/**
    * ID of the run to log under
	*/
	run_id?: string;
	/**
    * Tags to log. A single request can contain up to 100 tags, and up to 1000
    * metrics, params, and tags in total.
	*/
	tags?: Array<RunTag>;
}

export interface LogInputs {
    
	/**
    * Dataset inputs
	*/
	datasets?: Array<DatasetInput>;
	/**
    * ID of the run to log under
	*/
	run_id?: string;
}

export interface LogMetric {
    
	/**
    * Name of the metric.
	*/
	key: string;
	/**
    * ID of the run under which to log the metric. Must be provided.
	*/
	run_id?: string;
	/**
    * [Deprecated, use run_id instead] ID of the run under which to log the
    * metric. This field will be removed in a future MLflow version.
	*/
	run_uuid?: string;
	/**
    * Step at which to log the metric
	*/
	step?: number;
	/**
    * Unix timestamp in milliseconds at the time metric was logged.
	*/
	timestamp: number;
	/**
    * Double value of the metric being logged.
	*/
	value: number;
}

export interface LogModel {
    
	/**
    * MLmodel file in json format.
	*/
	model_json?: string;
	/**
    * ID of the run to log under
	*/
	run_id?: string;
}

export interface LogParam {
    
	/**
    * Name of the param. Maximum size is 255 bytes.
	*/
	key: string;
	/**
    * ID of the run under which to log the param. Must be provided.
	*/
	run_id?: string;
	/**
    * [Deprecated, use run_id instead] ID of the run under which to log the
    * param. This field will be removed in a future MLflow version.
	*/
	run_uuid?: string;
	/**
    * String value of the param being logged. Maximum size is 500 bytes.
	*/
	value: string;
}

export interface Metric {
    
	/**
    * Key identifying this metric.
	*/
	key?: string;
	/**
    * Step at which to log the metric.
	*/
	step?: number;
	/**
    * The timestamp at which this metric was recorded.
	*/
	timestamp?: number;
	/**
    * Value associated with this metric.
	*/
	value?: number;
}

export interface Model {
    
	/**
    * Timestamp recorded when this `registered_model` was created.
	*/
	creation_timestamp?: number;
	/**
    * Description of this `registered_model`.
	*/
	description?: string;
	/**
    * Timestamp recorded when metadata for this `registered_model` was last
    * updated.
	*/
	last_updated_timestamp?: number;
	/**
    * Collection of latest model versions for each stage. Only contains models
    * with current `READY` status.
	*/
	latest_versions?: Array<ModelVersion>;
	/**
    * Unique name for the model.
	*/
	name?: string;
	/**
    * Tags: Additional metadata key-value pairs for this `registered_model`.
	*/
	tags?: Array<ModelTag>;
	/**
    * User that created this `registered_model`
	*/
	user_id?: string;
}

export interface ModelDatabricks {
    
	/**
    * Creation time of the object, as a Unix timestamp in milliseconds.
	*/
	creation_timestamp?: number;
	/**
    * User-specified description for the object.
	*/
	description?: string;
	/**
    * Unique identifier for the object.
	*/
	id?: string;
	/**
    * Time of the object at last update, as a Unix timestamp in milliseconds.
	*/
	last_updated_timestamp?: number;
	/**
    * Array of model versions, each the latest version for its stage.
	*/
	latest_versions?: Array<ModelVersion>;
	/**
    * Name of the model.
	*/
	name?: string;
	/**
    * Permission level of the requesting user on the object. For what is allowed
    * at each level, see [MLflow Model permissions](..).
	*/
	permission_level?: PermissionLevel;
	/**
    * Array of tags associated with the model.
	*/
	tags?: Array<ModelTag>;
	/**
    * The username of the user that created the object.
	*/
	user_id?: string;
}

/**
* Name of the model whose events would trigger this webhook.
*/

export interface ModelTag {
    
	/**
    * The tag key.
	*/
	key?: string;
	/**
    * The tag value.
	*/
	value?: string;
}

export interface ModelVersion {
    
	/**
    * Timestamp recorded when this `model_version` was created.
	*/
	creation_timestamp?: number;
	/**
    * Current stage for this `model_version`.
	*/
	current_stage?: string;
	/**
    * Description of this `model_version`.
	*/
	description?: string;
	/**
    * Timestamp recorded when metadata for this `model_version` was last
    * updated.
	*/
	last_updated_timestamp?: number;
	/**
    * Unique name of the model
	*/
	name?: string;
	/**
    * MLflow run ID used when creating `model_version`, if `source` was
    * generated by an experiment run stored in MLflow tracking server.
	*/
	run_id?: string;
	/**
    * Run Link: Direct link to the run that generated this version
	*/
	run_link?: string;
	/**
    * URI indicating the location of the source model artifacts, used when
    * creating `model_version`
	*/
	source?: string;
	/**
    * Current status of `model_version`
	*/
	status?: ModelVersionStatus;
	/**
    * Details on current `status`, if it is pending or failed.
	*/
	status_message?: string;
	/**
    * Tags: Additional metadata key-value pairs for this `model_version`.
	*/
	tags?: Array<ModelVersionTag>;
	/**
    * User that created this `model_version`.
	*/
	user_id?: string;
	/**
    * Model's version number.
	*/
	version?: string;
}

export interface ModelVersionDatabricks {
    
	/**
    * Creation time of the object, as a Unix timestamp in milliseconds.
	*/
	creation_timestamp?: number;
	/**
    * This describes an enum
	*/
	current_stage?: Stage;
	/**
    * User-specified description for the object.
	*/
	description?: string;
	/**
    * Time of the object at last update, as a Unix timestamp in milliseconds.
	*/
	last_updated_timestamp?: number;
	/**
    * Name of the model.
	*/
	name?: string;
	/**
    * Permission level of the requesting user on the object. For what is allowed
    * at each level, see [MLflow Model permissions](..).
	*/
	permission_level?: PermissionLevel;
	/**
    * Unique identifier for the MLflow tracking run associated with the source
    * model artifacts.
	*/
	run_id?: string;
	/**
    * URL of the run associated with the model artifacts. This field is set at
    * model version creation time only for model versions whose source run is
    * from a tracking server that is different from the registry server.
	*/
	run_link?: string;
	/**
    * URI that indicates the location of the source model artifacts. This is
    * used when creating the model version.
	*/
	source?: string;
	/**
    * This describes an enum
	*/
	status?: Status;
	/**
    * Details on the current status, for example why registration failed.
	*/
	status_message?: string;
	/**
    * Array of tags that are associated with the model version.
	*/
	tags?: Array<ModelVersionTag>;
	/**
    * The username of the user that created the object.
	*/
	user_id?: string;
	/**
    * Version of the model.
	*/
	version?: string;
}

/**
* Current status of `model_version`
*/
export type ModelVersionStatus = 
"FAILED_REGISTRATION"
 |"PENDING_REGISTRATION"
 |"READY"
;

export interface ModelVersionTag {
    
	/**
    * The tag key.
	*/
	key?: string;
	/**
    * The tag value.
	*/
	value?: string;
}

export interface Param {
    
	/**
    * Key identifying this param.
	*/
	key?: string;
	/**
    * Value associated with this param.
	*/
	value?: string;
}

/**
* Permission level of the requesting user on the object. For what is allowed at
* each level, see [MLflow Model permissions](..).
*/
export type PermissionLevel = 
"CAN_EDIT"
 |"CAN_MANAGE"
 |"CAN_MANAGE_PRODUCTION_VERSIONS"
 |"CAN_MANAGE_STAGING_VERSIONS"
 |"CAN_READ"
;

export interface RegistryWebhook {
    
	/**
    * Creation time of the object, as a Unix timestamp in milliseconds.
	*/
	creation_timestamp?: number;
	/**
    * User-specified description for the webhook.
	*/
	description?: string;
	/**
    * Events that can trigger a registry webhook: * `MODEL_VERSION_CREATED`: A
    * new model version was created for the associated model.
    * 
    * * `MODEL_VERSION_TRANSITIONED_STAGE`: A model version’s stage was
    * changed.
    * 
    * * `TRANSITION_REQUEST_CREATED`: A user requested a model version’s stage
    * be transitioned.
    * 
    * * `COMMENT_CREATED`: A user wrote a comment on a registered model.
    * 
    * * `REGISTERED_MODEL_CREATED`: A new registered model was created. This
    * event type can only be specified for a registry-wide webhook, which can be
    * created by not specifying a model name in the create request.
    * 
    * * `MODEL_VERSION_TAG_SET`: A user set a tag on the model version.
    * 
    * * `MODEL_VERSION_TRANSITIONED_TO_STAGING`: A model version was
    * transitioned to staging.
    * 
    * * `MODEL_VERSION_TRANSITIONED_TO_PRODUCTION`: A model version was
    * transitioned to production.
    * 
    * * `MODEL_VERSION_TRANSITIONED_TO_ARCHIVED`: A model version was archived.
    * 
    * * `TRANSITION_REQUEST_TO_STAGING_CREATED`: A user requested a model
    * version be transitioned to staging.
    * 
    * * `TRANSITION_REQUEST_TO_PRODUCTION_CREATED`: A user requested a model
    * version be transitioned to production.
    * 
    * * `TRANSITION_REQUEST_TO_ARCHIVED_CREATED`: A user requested a model
    * version be archived.
	*/
	events?: Array<RegistryWebhookEvent>;
	http_url_spec?: HttpUrlSpecWithoutSecret;
	/**
    * Webhook ID
	*/
	id?: string;
	job_spec?: JobSpecWithoutSecret;
	/**
    * Time of the object at last update, as a Unix timestamp in milliseconds.
	*/
	last_updated_timestamp?: number;
	/**
    * Name of the model whose events would trigger this webhook.
	*/
	model_name?: string;
	/**
    * This describes an enum
	*/
	status?: RegistryWebhookStatus;
}

export type RegistryWebhookEvent = 
"COMMENT_CREATED"
 |"MODEL_VERSION_CREATED"
 |"MODEL_VERSION_TAG_SET"
 |"MODEL_VERSION_TRANSITIONED_STAGE"
 |"MODEL_VERSION_TRANSITIONED_TO_ARCHIVED"
 |"MODEL_VERSION_TRANSITIONED_TO_PRODUCTION"
 |"MODEL_VERSION_TRANSITIONED_TO_STAGING"
 |"REGISTERED_MODEL_CREATED"
 |"TRANSITION_REQUEST_CREATED"
 |"TRANSITION_REQUEST_TO_ARCHIVED_CREATED"
 |"TRANSITION_REQUEST_TO_PRODUCTION_CREATED"
 |"TRANSITION_REQUEST_TO_STAGING_CREATED"
;

/**
* This describes an enum
*/
export type RegistryWebhookStatus = 
/**
* Webhook is triggered when an associated event happens.
*/
"ACTIVE"
/**
* Webhook is not triggered.
*/
 |"DISABLED"
/**
* Webhook can be triggered through the test endpoint, but is not triggered on a
* real event.
*/
 |"TEST_MODE"
;

export interface RejectTransitionRequest {
    
	/**
    * User-provided comment on the action.
	*/
	comment?: string;
	/**
    * Name of the model.
	*/
	name: string;
	/**
    * Target stage of the transition. Valid values are:
    * 
    * * `None`: The initial stage of a model version.
    * 
    * * `Staging`: Staging or pre-production stage.
    * 
    * * `Production`: Production stage.
    * 
    * * `Archived`: Archived stage.
	*/
	stage: Stage;
	/**
    * Version of the model.
	*/
	version: string;
}

export interface RejectTransitionRequestResponse {
    
	/**
    * Activity recorded for the action.
	*/
	activity?: Activity;
}

export interface RenameModelRequest {
    
	/**
    * Registered model unique name identifier.
	*/
	name: string;
	/**
    * If provided, updates the name for this `registered_model`.
	*/
	new_name?: string;
}

export interface RenameModelResponse {
    
	registered_model?: Model;
}

export interface RestoreExperiment {
    
	/**
    * ID of the associated experiment.
	*/
	experiment_id: string;
}

export interface RestoreRun {
    
	/**
    * ID of the run to restore.
	*/
	run_id: string;
}

export interface Run {
    
	/**
    * Run data.
	*/
	data?: RunData;
	/**
    * Run metadata.
	*/
	info?: RunInfo;
	/**
    * Run inputs.
	*/
	inputs?: RunInputs;
}

export interface RunData {
    
	/**
    * Run metrics.
	*/
	metrics?: Array<Metric>;
	/**
    * Run parameters.
	*/
	params?: Array<Param>;
	/**
    * Additional metadata key-value pairs.
	*/
	tags?: Array<RunTag>;
}

export interface RunInfo {
    
	/**
    * URI of the directory where artifacts should be uploaded. This can be a
    * local path (starting with "/"), or a distributed file system (DFS) path,
    * like `s3://bucket/directory` or `dbfs:/my/directory`. If not set, the
    * local `./mlruns` directory is chosen.
	*/
	artifact_uri?: string;
	/**
    * Unix timestamp of when the run ended in milliseconds.
	*/
	end_time?: number;
	/**
    * The experiment ID.
	*/
	experiment_id?: string;
	/**
    * Current life cycle stage of the experiment : OneOf("active", "deleted")
	*/
	lifecycle_stage?: string;
	/**
    * Unique identifier for the run.
	*/
	run_id?: string;
	/**
    * [Deprecated, use run_id instead] Unique identifier for the run. This field
    * will be removed in a future MLflow version.
	*/
	run_uuid?: string;
	/**
    * Unix timestamp of when the run started in milliseconds.
	*/
	start_time?: number;
	/**
    * Current status of the run.
	*/
	status?: RunInfoStatus;
	/**
    * User who initiated the run. This field is deprecated as of MLflow 1.0, and
    * will be removed in a future MLflow release. Use 'mlflow.user' tag instead.
	*/
	user_id?: string;
}

/**
* Current status of the run.
*/
export type RunInfoStatus = 
"FAILED"
 |"FINISHED"
 |"KILLED"
 |"RUNNING"
 |"SCHEDULED"
;

export interface RunInputs {
    
	/**
    * Run metrics.
	*/
	dataset_inputs?: Array<DatasetInput>;
}

export interface RunTag {
    
	/**
    * The tag key.
	*/
	key?: string;
	/**
    * The tag value.
	*/
	value?: string;
}

export interface SearchExperiments {
    
	/**
    * String representing a SQL filter condition (e.g. "name ILIKE
    * 'my-experiment%'")
	*/
	filter?: string;
	/**
    * Maximum number of experiments desired. Max threshold is 3000.
	*/
	max_results?: number;
	/**
    * List of columns for ordering search results, which can include experiment
    * name and last updated timestamp with an optional "DESC" or "ASC"
    * annotation, where "ASC" is the default. Tiebreaks are done by experiment
    * id DESC.
	*/
	order_by?: Array<string>;
	/**
    * Token indicating the page of experiments to fetch
	*/
	page_token?: string;
	/**
    * Qualifier for type of experiments to be returned. If unspecified, return
    * only active experiments.
	*/
	view_type?: SearchExperimentsViewType;
}

export interface SearchExperimentsResponse {
    
	/**
    * Experiments that match the search criteria
	*/
	experiments?: Array<Experiment>;
	/**
    * Token that can be used to retrieve the next page of experiments. An empty
    * token means that no more experiments are available for retrieval.
	*/
	next_page_token?: string;
}

/**
* Qualifier for type of experiments to be returned. If unspecified, return only
* active experiments.
*/
export type SearchExperimentsViewType = 
"ACTIVE_ONLY"
 |"ALL"
 |"DELETED_ONLY"
;

/**
* Searches model versions
*/
export interface SearchModelVersionsRequest {
    
	/**
    * String filter condition, like "name='my-model-name'". Must be a single
    * boolean condition, with string values wrapped in single quotes.
	*/
	filter?: string;
	/**
    * Maximum number of models desired. Max threshold is 10K.
	*/
	max_results?: number;
	/**
    * List of columns to be ordered by including model name, version, stage with
    * an optional "DESC" or "ASC" annotation, where "ASC" is the default.
    * Tiebreaks are done by latest stage transition timestamp, followed by name
    * ASC, followed by version DESC.
	*/
	order_by?: Array<string>;
	/**
    * Pagination token to go to next page based on previous search query.
	*/
	page_token?: string;
}

export interface SearchModelVersionsResponse {
    
	/**
    * Models that match the search criteria
	*/
	model_versions?: Array<ModelVersion>;
	/**
    * Pagination token to request next page of models for the same search query.
	*/
	next_page_token?: string;
}

/**
* Search models
*/
export interface SearchModelsRequest {
    
	/**
    * String filter condition, like "name LIKE 'my-model-name'". Interpreted in
    * the backend automatically as "name LIKE '%my-model-name%'". Single boolean
    * condition, with string values wrapped in single quotes.
	*/
	filter?: string;
	/**
    * Maximum number of models desired. Default is 100. Max threshold is 1000.
	*/
	max_results?: number;
	/**
    * List of columns for ordering search results, which can include model name
    * and last updated timestamp with an optional "DESC" or "ASC" annotation,
    * where "ASC" is the default. Tiebreaks are done by model name ASC.
	*/
	order_by?: Array<string>;
	/**
    * Pagination token to go to the next page based on a previous search query.
	*/
	page_token?: string;
}

export interface SearchModelsResponse {
    
	/**
    * Pagination token to request the next page of models.
	*/
	next_page_token?: string;
	/**
    * Registered Models that match the search criteria.
	*/
	registered_models?: Array<Model>;
}

export interface SearchRuns {
    
	/**
    * List of experiment IDs to search over.
	*/
	experiment_ids?: Array<string>;
	/**
    * A filter expression over params, metrics, and tags, that allows returning
    * a subset of runs. The syntax is a subset of SQL that supports ANDing
    * together binary operations between a param, metric, or tag and a constant.
    * 
    * Example: `metrics.rmse < 1 and params.model_class = 'LogisticRegression'`
    * 
    * You can select columns with special characters (hyphen, space, period,
    * etc.) by using double quotes: `metrics."model class" = 'LinearRegression'
    * and tags."user-name" = 'Tomas'`
    * 
    * Supported operators are `=`, `!=`, `>`, `>=`, `<`, and `<=`.
	*/
	filter?: string;
	/**
    * Maximum number of runs desired. Max threshold is 50000
	*/
	max_results?: number;
	/**
    * List of columns to be ordered by, including attributes, params, metrics,
    * and tags with an optional "DESC" or "ASC" annotation, where "ASC" is the
    * default. Example: ["params.input DESC", "metrics.alpha ASC",
    * "metrics.rmse"] Tiebreaks are done by start_time DESC followed by run_id
    * for runs with the same start time (and this is the default ordering
    * criterion if order_by is not provided).
	*/
	order_by?: Array<string>;
	/**
    * Token for the current page of runs.
	*/
	page_token?: string;
	/**
    * Whether to display only active, only deleted, or all runs. Defaults to
    * only active runs.
	*/
	run_view_type?: SearchRunsRunViewType;
}

export interface SearchRunsResponse {
    
	/**
    * Token for the next page of runs.
	*/
	next_page_token?: string;
	/**
    * Runs that match the search criteria.
	*/
	runs?: Array<Run>;
}

/**
* Whether to display only active, only deleted, or all runs. Defaults to only
* active runs.
*/
export type SearchRunsRunViewType = 
"ACTIVE_ONLY"
 |"ALL"
 |"DELETED_ONLY"
;

export interface SetExperimentTag {
    
	/**
    * ID of the experiment under which to log the tag. Must be provided.
	*/
	experiment_id: string;
	/**
    * Name of the tag. Maximum size depends on storage backend. All storage
    * backends are guaranteed to support key values up to 250 bytes in size.
	*/
	key: string;
	/**
    * String value of the tag being logged. Maximum size depends on storage
    * backend. All storage backends are guaranteed to support key values up to
    * 5000 bytes in size.
	*/
	value: string;
}

export interface SetModelTagRequest {
    
	/**
    * Name of the tag. Maximum size depends on storage backend. If a tag with
    * this name already exists, its preexisting value will be replaced by the
    * specified `value`. All storage backends are guaranteed to support key
    * values up to 250 bytes in size.
	*/
	key: string;
	/**
    * Unique name of the model.
	*/
	name: string;
	/**
    * String value of the tag being logged. Maximum size depends on storage
    * backend. All storage backends are guaranteed to support key values up to
    * 5000 bytes in size.
	*/
	value: string;
}

export interface SetModelVersionTagRequest {
    
	/**
    * Name of the tag. Maximum size depends on storage backend. If a tag with
    * this name already exists, its preexisting value will be replaced by the
    * specified `value`. All storage backends are guaranteed to support key
    * values up to 250 bytes in size.
	*/
	key: string;
	/**
    * Unique name of the model.
	*/
	name: string;
	/**
    * String value of the tag being logged. Maximum size depends on storage
    * backend. All storage backends are guaranteed to support key values up to
    * 5000 bytes in size.
	*/
	value: string;
	/**
    * Model version number.
	*/
	version: string;
}

export interface SetTag {
    
	/**
    * Name of the tag. Maximum size depends on storage backend. All storage
    * backends are guaranteed to support key values up to 250 bytes in size.
	*/
	key: string;
	/**
    * ID of the run under which to log the tag. Must be provided.
	*/
	run_id?: string;
	/**
    * [Deprecated, use run_id instead] ID of the run under which to log the tag.
    * This field will be removed in a future MLflow version.
	*/
	run_uuid?: string;
	/**
    * String value of the tag being logged. Maximum size depends on storage
    * backend. All storage backends are guaranteed to support key values up to
    * 5000 bytes in size.
	*/
	value: string;
}

/**
* This describes an enum
*/
export type Stage = 
/**
* Archived stage.
*/
"Archived"
/**
* The initial stage of a model version.
*/
 |"None"
/**
* Production stage.
*/
 |"Production"
/**
* Staging or pre-production stage.
*/
 |"Staging"
;

/**
* This describes an enum
*/
export type Status = 
/**
* Request to register a new model version has failed.
*/
"FAILED_REGISTRATION"
/**
* Request to register a new model version is pending as server performs
* background tasks.
*/
 |"PENDING_REGISTRATION"
/**
* Model version is ready for use.
*/
 |"READY"
;

/**
* Test webhook response object.
*/
export interface TestRegistryWebhook {
    
	/**
    * Body of the response from the webhook URL
	*/
	body?: string;
	/**
    * Status code returned by the webhook URL
	*/
	status_code?: number;
}

export interface TestRegistryWebhookRequest {
    
	/**
    * If `event` is specified, the test trigger uses the specified event. If
    * `event` is not specified, the test trigger uses a randomly chosen event
    * associated with the webhook.
	*/
	event?: RegistryWebhookEvent;
	/**
    * Webhook ID
	*/
	id: string;
}

export interface TestRegistryWebhookResponse {
    
	/**
    * Test webhook response object.
	*/
	webhook?: TestRegistryWebhook;
}

export interface TransitionModelVersionStageDatabricks {
    
	/**
    * Specifies whether to archive all current model versions in the target
    * stage.
	*/
	archive_existing_versions: boolean;
	/**
    * User-provided comment on the action.
	*/
	comment?: string;
	/**
    * Name of the model.
	*/
	name: string;
	/**
    * Target stage of the transition. Valid values are:
    * 
    * * `None`: The initial stage of a model version.
    * 
    * * `Staging`: Staging or pre-production stage.
    * 
    * * `Production`: Production stage.
    * 
    * * `Archived`: Archived stage.
	*/
	stage: Stage;
	/**
    * Version of the model.
	*/
	version: string;
}

/**
* Transition request details.
*/
export interface TransitionRequest {
    
	/**
    * Array of actions on the activity allowed for the current viewer.
	*/
	available_actions?: Array<ActivityAction>;
	/**
    * User-provided comment associated with the transition request.
	*/
	comment?: string;
	/**
    * Creation time of the object, as a Unix timestamp in milliseconds.
	*/
	creation_timestamp?: number;
	/**
    * Target stage of the transition (if the activity is stage transition
    * related). Valid values are:
    * 
    * * `None`: The initial stage of a model version.
    * 
    * * `Staging`: Staging or pre-production stage.
    * 
    * * `Production`: Production stage.
    * 
    * * `Archived`: Archived stage.
	*/
	to_stage?: Stage;
	/**
    * The username of the user that created the object.
	*/
	user_id?: string;
}

export interface TransitionStageResponse {
    
	model_version?: ModelVersionDatabricks;
}

export interface UpdateComment {
    
	/**
    * User-provided comment on the action.
	*/
	comment: string;
	/**
    * Unique identifier of an activity
	*/
	id: string;
}

export interface UpdateCommentResponse {
    
	/**
    * Comment details.
	*/
	comment?: CommentObject;
}

export interface UpdateExperiment {
    
	/**
    * ID of the associated experiment.
	*/
	experiment_id: string;
	/**
    * If provided, the experiment's name is changed to the new name. The new
    * name must be unique.
	*/
	new_name?: string;
}

export interface UpdateModelRequest {
    
	/**
    * If provided, updates the description for this `registered_model`.
	*/
	description?: string;
	/**
    * Registered model unique name identifier.
	*/
	name: string;
}

export interface UpdateModelVersionRequest {
    
	/**
    * If provided, updates the description for this `registered_model`.
	*/
	description?: string;
	/**
    * Name of the registered model
	*/
	name: string;
	/**
    * Model version number
	*/
	version: string;
}

export interface UpdateRegistryWebhook {
    
	/**
    * User-specified description for the webhook.
	*/
	description?: string;
	/**
    * Events that can trigger a registry webhook: * `MODEL_VERSION_CREATED`: A
    * new model version was created for the associated model.
    * 
    * * `MODEL_VERSION_TRANSITIONED_STAGE`: A model version’s stage was
    * changed.
    * 
    * * `TRANSITION_REQUEST_CREATED`: A user requested a model version’s stage
    * be transitioned.
    * 
    * * `COMMENT_CREATED`: A user wrote a comment on a registered model.
    * 
    * * `REGISTERED_MODEL_CREATED`: A new registered model was created. This
    * event type can only be specified for a registry-wide webhook, which can be
    * created by not specifying a model name in the create request.
    * 
    * * `MODEL_VERSION_TAG_SET`: A user set a tag on the model version.
    * 
    * * `MODEL_VERSION_TRANSITIONED_TO_STAGING`: A model version was
    * transitioned to staging.
    * 
    * * `MODEL_VERSION_TRANSITIONED_TO_PRODUCTION`: A model version was
    * transitioned to production.
    * 
    * * `MODEL_VERSION_TRANSITIONED_TO_ARCHIVED`: A model version was archived.
    * 
    * * `TRANSITION_REQUEST_TO_STAGING_CREATED`: A user requested a model
    * version be transitioned to staging.
    * 
    * * `TRANSITION_REQUEST_TO_PRODUCTION_CREATED`: A user requested a model
    * version be transitioned to production.
    * 
    * * `TRANSITION_REQUEST_TO_ARCHIVED_CREATED`: A user requested a model
    * version be archived.
	*/
	events?: Array<RegistryWebhookEvent>;
	http_url_spec?: HttpUrlSpec;
	/**
    * Webhook ID
	*/
	id: string;
	job_spec?: JobSpec;
	/**
    * This describes an enum
	*/
	status?: RegistryWebhookStatus;
}

export interface UpdateRun {
    
	/**
    * Unix timestamp in milliseconds of when the run ended.
	*/
	end_time?: number;
	/**
    * ID of the run to update. Must be provided.
	*/
	run_id?: string;
	/**
    * [Deprecated, use run_id instead] ID of the run to update.. This field will
    * be removed in a future MLflow version.
	*/
	run_uuid?: string;
	/**
    * Updated status of the run.
	*/
	status?: UpdateRunStatus;
}

export interface UpdateRunResponse {
    
	/**
    * Updated metadata of the run.
	*/
	run_info?: RunInfo;
}

/**
* Updated status of the run.
*/
export type UpdateRunStatus = 
"FAILED"
 |"FINISHED"
 |"KILLED"
 |"RUNNING"
 |"SCHEDULED"
;

/**
* Webhook ID
*/

