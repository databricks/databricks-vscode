/* eslint-disable @typescript-eslint/naming-convention */

// Code generated from OpenAPI specs by Databricks SDK Generator. DO NOT EDIT.

// all definitions in this file are in alphabetical order
/**
 * Retrieve the logs associated with building the model's environment for a given
 * serving endpoint's served model.
 */
export interface BuildLogsRequest {
    /**
     * The name of the serving endpoint that the served model belongs to. This
     * field is required.
     */
    name: string;
    /**
     * The name of the served model that build logs will be retrieved for. This
     * field is required.
     */
    served_model_name: string;
}

export interface BuildLogsResponse {
    /**
     * The logs associated with building the served model's environment.
     */
    logs: string;
}

export interface CreateServingEndpoint {
    /**
     * The core config of the serving endpoint.
     */
    config: EndpointCoreConfigInput;
    /**
     * The name of the serving endpoint. This field is required and must be
     * unique across a Databricks workspace. An endpoint name can consist of
     * alphanumeric characters, dashes, and underscores.
     */
    name: string;
}

/**
 * Delete a serving endpoint
 */
export interface DeleteServingEndpointRequest {
    /**
     * The name of the serving endpoint. This field is required.
     */
    name: string;
}

export interface EndpointCoreConfigInput {
    /**
     * The name of the serving endpoint to update. This field is required.
     */
    name: string;
    /**
     * A list of served models for the endpoint to serve. A serving endpoint can
     * have up to 10 served models.
     */
    served_models: Array<ServedModelInput>;
    /**
     * The traffic config defining how invocations to the serving endpoint should
     * be routed.
     */
    traffic_config?: TrafficConfig;
}

export interface EndpointCoreConfigOutput {
    /**
     * The config version that the serving endpoint is currently serving.
     */
    config_version?: number;
    /**
     * The list of served models under the serving endpoint config.
     */
    served_models?: Array<ServedModelOutput>;
    /**
     * The traffic configuration associated with the serving endpoint config.
     */
    traffic_config?: TrafficConfig;
}

export interface EndpointCoreConfigSummary {
    /**
     * The list of served models under the serving endpoint config.
     */
    served_models?: Array<ServedModelSpec>;
}

export interface EndpointPendingConfig {
    /**
     * The config version that the serving endpoint is currently serving.
     */
    config_version?: number;
    /**
     * The list of served models belonging to the last issued update to the
     * serving endpoint.
     */
    served_models?: Array<ServedModelOutput>;
    /**
     * The timestamp when the update to the pending config started.
     */
    start_time?: number;
    /**
     * The traffic config defining how invocations to the serving endpoint should
     * be routed.
     */
    traffic_config?: TrafficConfig;
}

export interface EndpointState {
    /**
     * The state of an endpoint's config update. This informs the user if the
     * pending_config is in progress, if the update failed, or if there is no
     * update in progress. Note that if the endpoint's config_update state value
     * is IN_PROGRESS, another update can not be made until the update completes
     * or fails."
     */
    config_update?: EndpointStateConfigUpdate;
    /**
     * The state of an endpoint, indicating whether or not the endpoint is
     * queryable. An endpoint is READY if all of the served models in its active
     * configuration are ready. If any of the actively served models are in a
     * non-ready state, the endpoint state will be NOT_READY.
     */
    ready?: EndpointStateReady;
}

/**
 * The state of an endpoint's config update. This informs the user if the
 * pending_config is in progress, if the update failed, or if there is no update
 * in progress. Note that if the endpoint's config_update state value is
 * IN_PROGRESS, another update can not be made until the update completes or
 * fails."
 */
export type EndpointStateConfigUpdate =
    | "IN_PROGRESS"
    | "NOT_UPDATING"
    | "UPDATE_FAILED";

/**
 * The state of an endpoint, indicating whether or not the endpoint is queryable.
 * An endpoint is READY if all of the served models in its active configuration
 * are ready. If any of the actively served models are in a non-ready state, the
 * endpoint state will be NOT_READY.
 */
export type EndpointStateReady = "NOT_READY" | "READY";

/**
 * Retrieve the metrics associated with a serving endpoint
 */
export interface ExportMetricsRequest {
    /**
     * The name of the serving endpoint to retrieve metrics for. This field is
     * required.
     */
    name: string;
}

/**
 * Get a single serving endpoint
 */
export interface GetServingEndpointRequest {
    /**
     * The name of the serving endpoint. This field is required.
     */
    name: string;
}

export interface ListEndpointsResponse {
    /**
     * The list of endpoints.
     */
    endpoints?: Array<ServingEndpoint>;
}

/**
 * Retrieve the most recent log lines associated with a given serving endpoint's
 * served model
 */
export interface LogsRequest {
    /**
     * The name of the serving endpoint that the served model belongs to. This
     * field is required.
     */
    name: string;
    /**
     * The name of the served model that logs will be retrieved for. This field
     * is required.
     */
    served_model_name: string;
}

export interface QueryEndpointResponse {
    /**
     * The predictions returned by the serving endpoint.
     */
    predictions: Array<any /* MISSING TYPE */>;
}

/**
 * Query a serving endpoint with provided model input.
 */
export interface QueryRequest {
    /**
     * The name of the serving endpoint. This field is required.
     */
    name: string;
}

export interface Route {
    /**
     * The name of the served model this route configures traffic for.
     */
    served_model_name: string;
    /**
     * The percentage of endpoint traffic to send to this route. It must be an
     * integer between 0 and 100 inclusive.
     */
    traffic_percentage: number;
}

export interface ServedModelInput {
    /**
     * An object containing a set of optional, user-specified environment
     * variable key-value pairs used for serving this model. Note: this is an
     * experimental feature and subject to change. Example model environment
     * variables that refer to Databricks secrets: `{"OPENAI_API_KEY":
     * "{{secrets/my_scope/my_key}}", "DATABRICKS_TOKEN":
     * "{{secrets/my_scope2/my_key2}}"}`
     */
    environment_vars?: Record<string, string>;
    /**
     * The name of the model in Databricks Model Registry to be served or if the
     * model resides in Unity Catalog, the full name of model, in the form of
     * __catalog_name__.__schema_name__.__model_name__.
     */
    model_name: string;
    /**
     * The version of the model in Databricks Model Registry or Unity Catalog to
     * be served.
     */
    model_version: string;
    /**
     * The name of a served model. It must be unique across an endpoint. If not
     * specified, this field will default to <model-name>-<model-version>. A
     * served model name can consist of alphanumeric characters, dashes, and
     * underscores.
     */
    name?: string;
    /**
     * Whether the compute resources for the served model should scale down to
     * zero.
     */
    scale_to_zero_enabled: boolean;
    /**
     * The workload size of the served model. The workload size corresponds to a
     * range of provisioned concurrency that the compute will autoscale between.
     * A single unit of provisioned concurrency can process one request at a
     * time. Valid workload sizes are "Small" (4 - 4 provisioned concurrency),
     * "Medium" (8 - 16 provisioned concurrency), and "Large" (16 - 64
     * provisioned concurrency). If scale-to-zero is enabled, the lower bound of
     * the provisioned concurrency for each workload size will be 0.
     */
    workload_size: string;
}

export interface ServedModelOutput {
    /**
     * The creation timestamp of the served model in Unix time.
     */
    creation_timestamp?: number;
    /**
     * The email of the user who created the served model.
     */
    creator?: string;
    /**
     * An object containing a set of optional, user-specified environment
     * variable key-value pairs used for serving this model. Note: this is an
     * experimental feature and subject to change. Example model environment
     * variables that refer to Databricks secrets: `{"OPENAI_API_KEY":
     * "{{secrets/my_scope/my_key}}", "DATABRICKS_TOKEN":
     * "{{secrets/my_scope2/my_key2}}"}`
     */
    environment_vars?: Record<string, string>;
    /**
     * The name of the model in Databricks Model Registry or the full name of the
     * model in Unity Catalog.
     */
    model_name?: string;
    /**
     * The version of the model in Databricks Model Registry or Unity Catalog to
     * be served.
     */
    model_version?: string;
    /**
     * The name of the served model.
     */
    name?: string;
    /**
     * Whether the compute resources for the Served Model should scale down to
     * zero.
     */
    scale_to_zero_enabled?: boolean;
    /**
     * Information corresponding to the state of the Served Model.
     */
    state?: ServedModelState;
    /**
     * The workload size of the served model. The workload size corresponds to a
     * range of provisioned concurrency that the compute will autoscale between.
     * A single unit of provisioned concurrency can process one request at a
     * time. Valid workload sizes are "Small" (4 - 4 provisioned concurrency),
     * "Medium" (8 - 16 provisioned concurrency), and "Large" (16 - 64
     * provisioned concurrency). If scale-to-zero is enabled, the lower bound of
     * the provisioned concurrency for each workload size will be 0.
     */
    workload_size?: string;
}

export interface ServedModelSpec {
    /**
     * The name of the model in Databricks Model Registry or the full name of the
     * model in Unity Catalog.
     */
    model_name?: string;
    /**
     * The version of the model in Databricks Model Registry or Unity Catalog to
     * be served.
     */
    model_version?: string;
    /**
     * The name of the served model.
     */
    name?: string;
}

export interface ServedModelState {
    /**
     * The state of the served model deployment. DEPLOYMENT_CREATING indicates
     * that the served model is not ready yet because the deployment is still
     * being created (i.e container image is building, model server is deploying
     * for the first time, etc.). DEPLOYMENT_RECOVERING indicates that the served
     * model was previously in a ready state but no longer is and is attempting
     * to recover. DEPLOYMENT_READY indicates that the served model is ready to
     * receive traffic. DEPLOYMENT_FAILED indicates that there was an error
     * trying to bring up the served model (e.g container image build failed, the
     * model server failed to start due to a model loading error, etc.)
     * DEPLOYMENT_ABORTED indicates that the deployment was terminated likely due
     * to a failure in bringing up another served model under the same endpoint
     * and config version.
     */
    deployment?: ServedModelStateDeployment;
    /**
     * More information about the state of the served model, if available.
     */
    deployment_state_message?: string;
}

/**
 * The state of the served model deployment. DEPLOYMENT_CREATING indicates that
 * the served model is not ready yet because the deployment is still being
 * created (i.e container image is building, model server is deploying for the
 * first time, etc.). DEPLOYMENT_RECOVERING indicates that the served model was
 * previously in a ready state but no longer is and is attempting to recover.
 * DEPLOYMENT_READY indicates that the served model is ready to receive traffic.
 * DEPLOYMENT_FAILED indicates that there was an error trying to bring up the
 * served model (e.g container image build failed, the model server failed to
 * start due to a model loading error, etc.) DEPLOYMENT_ABORTED indicates that
 * the deployment was terminated likely due to a failure in bringing up another
 * served model under the same endpoint and config version.
 */
export type ServedModelStateDeployment =
    | "DEPLOYMENT_ABORTED"
    | "DEPLOYMENT_CREATING"
    | "DEPLOYMENT_FAILED"
    | "DEPLOYMENT_READY"
    | "DEPLOYMENT_RECOVERING";

export interface ServerLogsResponse {
    /**
     * The most recent log lines of the model server processing invocation
     * requests.
     */
    logs: string;
}

export interface ServingEndpoint {
    /**
     * The config that is currently being served by the endpoint.
     */
    config?: EndpointCoreConfigSummary;
    /**
     * The timestamp when the endpoint was created in Unix time.
     */
    creation_timestamp?: number;
    /**
     * The email of the user who created the serving endpoint.
     */
    creator?: string;
    /**
     * System-generated ID of the endpoint. This is used to refer to the endpoint
     * in the Permissions API
     */
    id?: string;
    /**
     * The timestamp when the endpoint was last updated by a user in Unix time.
     */
    last_updated_timestamp?: number;
    /**
     * The name of the serving endpoint.
     */
    name?: string;
    /**
     * Information corresponding to the state of the serving endpoint.
     */
    state?: EndpointState;
}

export interface ServingEndpointDetailed {
    /**
     * The config that is currently being served by the endpoint.
     */
    config?: EndpointCoreConfigOutput;
    /**
     * The timestamp when the endpoint was created in Unix time.
     */
    creation_timestamp?: number;
    /**
     * The email of the user who created the serving endpoint.
     */
    creator?: string;
    /**
     * System-generated ID of the endpoint. This is used to refer to the endpoint
     * in the Permissions API
     */
    id?: string;
    /**
     * The timestamp when the endpoint was last updated by a user in Unix time.
     */
    last_updated_timestamp?: number;
    /**
     * The name of the serving endpoint.
     */
    name?: string;
    /**
     * The config that the endpoint is attempting to update to.
     */
    pending_config?: EndpointPendingConfig;
    /**
     * The permission level of the principal making the request.
     */
    permission_level?: ServingEndpointDetailedPermissionLevel;
    /**
     * Information corresponding to the state of the serving endpoint.
     */
    state?: EndpointState;
}

/**
 * The permission level of the principal making the request.
 */
export type ServingEndpointDetailedPermissionLevel =
    | "CAN_MANAGE"
    | "CAN_QUERY"
    | "CAN_VIEW";

export interface TrafficConfig {
    /**
     * The list of routes that define traffic to each served model.
     */
    routes?: Array<Route>;
}
