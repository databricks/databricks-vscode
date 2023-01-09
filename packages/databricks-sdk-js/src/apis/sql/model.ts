/* eslint-disable @typescript-eslint/naming-convention */

// Code generated from OpenAPI specs by Databricks SDK Generator. DO NOT EDIT.

// all definitions in this file are in alphabetical order
export interface AccessControl {
    group_name?: string;
    /**
     * This describes an enum
     */
    permission_level?: PermissionLevel;
    user_name?: string;
}

export interface Alert {
    /**
     * Timestamp when the alert was created.
     */
    created_at?: string;
    /**
     * ID of the alert.
     */
    id?: string;
    /**
     * Timestamp when the alert was last triggered.
     */
    last_triggered_at?: string;
    /**
     * Name of the alert.
     */
    name?: string;
    /**
     * Alert configuration options.
     */
    options?: AlertOptions;
    query?: Query;
    /**
     * Number of seconds after being triggered before the alert rearms itself and
     * can be triggered again. If `null`, alert will never be triggered again.
     */
    rearm?: number;
    /**
     * State of the alert. Possible values are: `unknown` (yet to be evaluated),
     * `triggered` (evaluated and fulfilled trigger conditions), or `ok`
     * (evaluated and did not fulfill trigger conditions).
     */
    state?: AlertState;
    /**
     * Timestamp when the alert was last updated.
     */
    updated_at?: string;
    user?: User;
}

/**
 * Alert configuration options.
 */
export interface AlertOptions {
    /**
     * Name of column in the query result to compare in alert evaluation.
     */
    column: string;
    /**
     * Custom body of alert notification, if it exists. See [here] for custom
     * templating instructions.
     *
     * [here]: https://docs.databricks.com/sql/user/alerts/index.html
     */
    custom_body?: string;
    /**
     * Custom subject of alert notification, if it exists. This includes email
     * subject, Slack notification header, etc. See [here] for custom templating
     * instructions.
     *
     * [here]: https://docs.databricks.com/sql/user/alerts/index.html
     */
    custom_subject?: string;
    /**
     * Whether or not the alert is muted. If an alert is muted, it will not
     * notify users and alert destinations when triggered.
     */
    muted?: boolean;
    /**
     * Operator used to compare in alert evaluation: `>`, `>=`, `<`, `<=`, `==`,
     * `!=`
     */
    op: string;
    /**
     * Number of failures encountered during alert refresh. This counter is used
     * for sending aggregated alert failure email notifications.
     */
    schedule_failures?: number;
    /**
     * Value used to compare in alert evaluation.
     */
    value: string;
}

/**
 * State of the alert. Possible values are: `unknown` (yet to be evaluated),
 * `triggered` (evaluated and fulfilled trigger conditions), or `ok` (evaluated
 * and did not fulfill trigger conditions).
 */
export type AlertState = "ok" | "triggered" | "unknown";

export interface Channel {
    dbsql_version?: string;
    name?: ChannelName;
}

/**
 * Channel information for the SQL warehouse at the time of query execution
 */
export interface ChannelInfo {
    /**
     * DBSQL Version the channel is mapped to
     */
    dbsql_version?: string;
    /**
     * Name of the channel
     */
    name?: ChannelName;
}

/**
 * Name of the channel
 */
export type ChannelName =
    | "CHANNEL_NAME_CURRENT"
    | "CHANNEL_NAME_CUSTOM"
    | "CHANNEL_NAME_PREVIEW"
    | "CHANNEL_NAME_PREVIOUS"
    | "CHANNEL_NAME_UNSPECIFIED";

/**
 * Create a dashboard object
 */
export interface CreateDashboardRequest {
    /**
     * In the web application, query filters that share a name are coupled to a
     * single selection box if this value is true.
     */
    dashboard_filters_enabled?: boolean;
    /**
     * Draft dashboards only appear in list views for their owners.
     */
    is_draft?: boolean;
    /**
     * Indicates whether the dashboard is trashed. Trashed dashboards don't
     * appear in list views.
     */
    is_trashed?: boolean;
    /**
     * The title of this dashboard that appears in list views and at the top of
     * the dashboard page.
     */
    name?: string;
    tags?: Array<string>;
    /**
     * An array of widget objects. A complete description of widget objects can
     * be found in the response to [Retrieve A Dashboard
     * Definition](#operation/sql-analytics-fetch-dashboard). Databricks does not
     * recommend creating new widgets via this API.
     */
    widgets?: Array<Widget>;
}

export interface CreateRefreshSchedule {
    alert_id: string;
    /**
     * Cron string representing the refresh schedule.
     */
    cron: string;
    /**
     * ID of the SQL warehouse to refresh with. If `null`, query's SQL warehouse
     * will be used to refresh.
     */
    data_source_id?: string;
}

export interface CreateSubscription {
    /**
     * ID of the alert.
     */
    alert_id: string;
    /**
     * ID of the alert subscriber (if subscribing an alert destination). Alert
     * destinations can be configured by admins through the UI. See
     * [here](/sql/admin/alert-destinations.html).
     */
    destination_id?: string;
    /**
     * ID of the alert subscriber (if subscribing a user).
     */
    user_id?: number;
}

export interface CreateWarehouseRequest {
    /**
     * The amount of time in minutes that a SQL Endpoint must be idle (i.e., no
     * RUNNING queries) before it is automatically stopped.
     *
     * Supported values: - Must be == 0 or >= 10 mins - 0 indicates no autostop.
     *
     * Defaults to 120 mins
     */
    auto_stop_mins?: number;
    /**
     * Channel Details
     */
    channel?: Channel;
    /**
     * Size of the clusters allocated for this endpoint. Increasing the size of a
     * spark cluster allows you to run larger queries on it. If you want to
     * increase the number of concurrent queries, please tune max_num_clusters.
     *
     * Supported values: - 2X-Small - X-Small - Small - Medium - Large - X-Large
     * - 2X-Large - 3X-Large - 4X-Large
     */
    cluster_size?: string;
    /**
     * endpoint creator name
     */
    creator_name?: string;
    /**
     * Configures whether the endpoint should use Photon optimized clusters.
     *
     * Defaults to false.
     */
    enable_photon?: boolean;
    /**
     * Configures whether the endpoint should use Serverless Compute (aka Nephos)
     *
     * Defaults to value in global endpoint settings
     */
    enable_serverless_compute?: boolean;
    /**
     * Deprecated. Instance profile used to pass IAM role to the cluster
     */
    instance_profile_arn?: string;
    /**
     * Maximum number of clusters that the autoscaler will create to handle
     * concurrent queries.
     *
     * Supported values: - Must be >= min_num_clusters - Must be <= 30.
     *
     * Defaults to min_clusters if unset.
     */
    max_num_clusters?: number;
    /**
     * Minimum number of available clusters that will be maintained for this SQL
     * Endpoint. Increasing this will ensure that a larger number of clusters are
     * always running and therefore may reduce the cold start time for new
     * queries. This is similar to reserved vs. revocable cores in a resource
     * manager.
     *
     * Supported values: - Must be > 0 - Must be <= min(max_num_clusters, 30)
     *
     * Defaults to 1
     */
    min_num_clusters?: number;
    /**
     * Logical name for the cluster.
     *
     * Supported values: - Must be unique within an org. - Must be less than 100
     * characters.
     */
    name?: string;
    /**
     * Configurations whether the warehouse should use spot instances.
     */
    spot_instance_policy?: SpotInstancePolicy;
    /**
     * A set of key-value pairs that will be tagged on all resources (e.g., AWS
     * instances and EBS volumes) associated with this SQL Endpoints.
     *
     * Supported values: - Number of tags < 45.
     */
    tags?: EndpointTags;
    warehouse_type?: WarehouseType;
}

export interface CreateWarehouseResponse {
    /**
     * Id for the SQL warehouse. This value is unique across all SQL warehouses.
     */
    id?: string;
}

/**
 * A JSON representing a dashboard containing widgets of visualizations and text
 * boxes.
 */
export interface Dashboard {
    /**
     * Whether the authenticated user can edit the query definition.
     */
    can_edit?: boolean;
    /**
     * Timestamp when this dashboard was created.
     */
    created_at?: string;
    /**
     * In the web application, query filters that share a name are coupled to a
     * single selection box if this value is `true`.
     */
    dashboard_filters_enabled?: boolean;
    /**
     * The ID for this dashboard.
     */
    id?: string;
    /**
     * Indicates whether a dashboard is trashed. Trashed dashboards won't appear
     * in list views. If this boolean is `true`, the `options` property for this
     * dashboard includes a `moved_to_trash_at` timestamp. Items in trash are
     * permanently deleted after 30 days.
     */
    is_archived?: boolean;
    /**
     * Whether a dashboard is a draft. Draft dashboards only appear in list views
     * for their owners.
     */
    is_draft?: boolean;
    /**
     * Indicates whether this query object appears in the current user's
     * favorites list. This flag determines whether the star icon for favorites
     * is selected.
     */
    is_favorite?: boolean;
    /**
     * The title of the dashboard that appears in list views and at the top of
     * the dashboard page.
     */
    name?: string;
    options?: DashboardOptions;
    /**
     * This describes an enum
     */
    permission_tier?: PermissionLevel;
    /**
     * URL slug. Usually mirrors the query name with dashes (`-`) instead of
     * spaces. Appears in the URL for this query.
     */
    slug?: string;
    tags?: Array<string>;
    /**
     * Timestamp when this dashboard was last updated.
     */
    updated_at?: string;
    user?: User;
    /**
     * The ID of the user that created and owns this dashboard.
     */
    user_id?: number;
    widgets?: Array<Widget>;
}

export interface DashboardOptions {
    /**
     * The timestamp when this dashboard was moved to trash. Only present when
     * the `is_archived` property is `true`. Trashed items are deleted after
     * thirty days.
     */
    moved_to_trash_at?: string;
}

/**
 * A JSON object representing a DBSQL data source / SQL warehouse.
 */
export interface DataSource {
    /**
     * The unique identifier for this data source / SQL warehouse. Can be used
     * when creating / modifying queries and dashboards.
     */
    id?: string;
    /**
     * The string name of this data source / SQL warehouse as it appears in the
     * Databricks SQL web application.
     */
    name?: string;
    /**
     * Reserved for internal use.
     */
    pause_reason?: string;
    /**
     * Reserved for internal use.
     */
    paused?: number;
    /**
     * Reserved for internal use.
     */
    supports_auto_limit?: boolean;
    /**
     * Reserved for internal use.
     */
    syntax?: string;
    /**
     * The type of data source. For SQL warehouses, this will be
     * `databricks_internal`.
     */
    type?: string;
    /**
     * Reserved for internal use.
     */
    view_only?: boolean;
    /**
     * The ID of the associated SQL warehouse, if this data source is backed by a
     * SQL warehouse.
     */
    warehouse_id?: string;
}

/**
 * Delete an alert
 */
export interface DeleteAlertRequest {
    alert_id: string;
}

/**
 * Remove a dashboard
 */
export interface DeleteDashboardRequest {
    dashboard_id: string;
}

/**
 * Delete a query
 */
export interface DeleteQueryRequest {
    query_id: string;
}

/**
 * Delete a refresh schedule
 */
export interface DeleteScheduleRequest {
    alert_id: string;
    schedule_id: string;
}

/**
 * Delete a warehouse
 */
export interface DeleteWarehouseRequest {
    /**
     * Required. Id of the SQL warehouse.
     */
    id: string;
}

/**
 * Alert destination subscribed to the alert, if it exists. Alert destinations
 * can be configured by admins through the UI. See [here].
 *
 * [here]: https://docs.databricks.com/sql/admin/alert-destinations.html
 */
export interface Destination {
    /**
     * ID of the alert destination.
     */
    id?: string;
    /**
     * Name of the alert destination.
     */
    name?: string;
    /**
     * Type of the alert destination.
     */
    type?: DestinationType;
}

/**
 * Type of the alert destination.
 */
export type DestinationType =
    | "email"
    | "hangouts_chat"
    | "mattermost"
    | "microsoft_teams"
    | "pagerduty"
    | "slack"
    | "webhook";

export interface EditAlert {
    alert_id: string;
    /**
     * Name of the alert.
     */
    name: string;
    /**
     * Alert configuration options.
     */
    options: AlertOptions;
    /**
     * ID of the query evaluated by the alert.
     */
    query_id: string;
    /**
     * Number of seconds after being triggered before the alert rearms itself and
     * can be triggered again. If `null`, alert will never be triggered again.
     */
    rearm?: number;
}

export interface EditWarehouseRequest {
    /**
     * The amount of time in minutes that a SQL Endpoint must be idle (i.e., no
     * RUNNING queries) before it is automatically stopped.
     *
     * Supported values: - Must be == 0 or >= 10 mins - 0 indicates no autostop.
     *
     * Defaults to 120 mins
     */
    auto_stop_mins?: number;
    /**
     * Channel Details
     */
    channel?: Channel;
    /**
     * Size of the clusters allocated for this endpoint. Increasing the size of a
     * spark cluster allows you to run larger queries on it. If you want to
     * increase the number of concurrent queries, please tune max_num_clusters.
     *
     * Supported values: - 2X-Small - X-Small - Small - Medium - Large - X-Large
     * - 2X-Large - 3X-Large - 4X-Large
     */
    cluster_size?: string;
    /**
     * endpoint creator name
     */
    creator_name?: string;
    /**
     * Configures whether the endpoint should use Databricks Compute (aka Nephos)
     *
     * Deprecated: Use enable_serverless_compute TODO(SC-79930): Remove the field
     * once clients are updated
     */
    enable_databricks_compute?: boolean;
    /**
     * Configures whether the endpoint should use Photon optimized clusters.
     *
     * Defaults to false.
     */
    enable_photon?: boolean;
    /**
     * Configures whether the endpoint should use Serverless Compute (aka Nephos)
     *
     * Defaults to value in global endpoint settings
     */
    enable_serverless_compute?: boolean;
    /**
     * Required. Id of the warehouse to configure.
     */
    id: string;
    /**
     * Deprecated. Instance profile used to pass IAM role to the cluster
     */
    instance_profile_arn?: string;
    /**
     * Maximum number of clusters that the autoscaler will create to handle
     * concurrent queries.
     *
     * Supported values: - Must be >= min_num_clusters - Must be <= 30.
     *
     * Defaults to min_clusters if unset.
     */
    max_num_clusters?: number;
    /**
     * Minimum number of available clusters that will be maintained for this SQL
     * Endpoint. Increasing this will ensure that a larger number of clusters are
     * always running and therefore may reduce the cold start time for new
     * queries. This is similar to reserved vs. revocable cores in a resource
     * manager.
     *
     * Supported values: - Must be > 0 - Must be <= min(max_num_clusters, 30)
     *
     * Defaults to 1
     */
    min_num_clusters?: number;
    /**
     * Logical name for the cluster.
     *
     * Supported values: - Must be unique within an org. - Must be less than 100
     * characters.
     */
    name?: string;
    /**
     * Configurations whether the warehouse should use spot instances.
     */
    spot_instance_policy?: SpotInstancePolicy;
    /**
     * A set of key-value pairs that will be tagged on all resources (e.g., AWS
     * instances and EBS volumes) associated with this SQL Endpoints.
     *
     * Supported values: - Number of tags < 45.
     */
    tags?: EndpointTags;
    warehouse_type?: WarehouseType;
}

export interface EndpointConfPair {
    key?: string;
    value?: string;
}

export interface EndpointHealth {
    /**
     * Details about errors that are causing current degraded/failed status.
     */
    details?: string;
    /**
     * The reason for failure to bring up clusters for this endpoint. This is
     * available when status is 'FAILED' and sometimes when it is DEGRADED.
     */
    failure_reason?: TerminationReason;
    /**
     * Deprecated. split into summary and details for security
     */
    message?: string;
    /**
     * Health status of the endpoint.
     */
    status?: Status;
    /**
     * A short summary of the health status in case of degraded/failed endpoints.
     */
    summary?: string;
}

export interface EndpointInfo {
    /**
     * The amount of time in minutes that a SQL Endpoint must be idle (i.e., no
     * RUNNING queries) before it is automatically stopped.
     *
     * Supported values: - Must be == 0 or >= 10 mins - 0 indicates no autostop.
     *
     * Defaults to 120 mins
     */
    auto_stop_mins?: number;
    /**
     * Channel Details
     */
    channel?: Channel;
    /**
     * Size of the clusters allocated for this endpoint. Increasing the size of a
     * spark cluster allows you to run larger queries on it. If you want to
     * increase the number of concurrent queries, please tune max_num_clusters.
     *
     * Supported values: - 2X-Small - X-Small - Small - Medium - Large - X-Large
     * - 2X-Large - 3X-Large - 4X-Large
     */
    cluster_size?: string;
    /**
     * endpoint creator name
     */
    creator_name?: string;
    /**
     * Configures whether the endpoint should use Databricks Compute (aka Nephos)
     *
     * Deprecated: Use enable_serverless_compute TODO(SC-79930): Remove the field
     * once clients are updated
     */
    enable_databricks_compute?: boolean;
    /**
     * Configures whether the endpoint should use Photon optimized clusters.
     *
     * Defaults to false.
     */
    enable_photon?: boolean;
    /**
     * Configures whether the endpoint should use Serverless Compute (aka Nephos)
     *
     * Defaults to value in global endpoint settings
     */
    enable_serverless_compute?: boolean;
    /**
     * Optional health status. Assume the endpoint is healthy if this field is
     * not set.
     */
    health?: EndpointHealth;
    /**
     * unique identifier for endpoint
     */
    id?: string;
    /**
     * Deprecated. Instance profile used to pass IAM role to the cluster
     */
    instance_profile_arn?: string;
    /**
     * the jdbc connection string for this endpoint
     */
    jdbc_url?: string;
    /**
     * Maximum number of clusters that the autoscaler will create to handle
     * concurrent queries.
     *
     * Supported values: - Must be >= min_num_clusters - Must be <= 30.
     *
     * Defaults to min_clusters if unset.
     */
    max_num_clusters?: number;
    /**
     * Minimum number of available clusters that will be maintained for this SQL
     * Endpoint. Increasing this will ensure that a larger number of clusters are
     * always running and therefore may reduce the cold start time for new
     * queries. This is similar to reserved vs. revocable cores in a resource
     * manager.
     *
     * Supported values: - Must be > 0 - Must be <= min(max_num_clusters, 30)
     *
     * Defaults to 1
     */
    min_num_clusters?: number;
    /**
     * Logical name for the cluster.
     *
     * Supported values: - Must be unique within an org. - Must be less than 100
     * characters.
     */
    name?: string;
    /**
     * current number of active sessions for the endpoint
     */
    num_active_sessions?: number;
    /**
     * current number of clusters running for the service
     */
    num_clusters?: number;
    /**
     * ODBC parameters for the sql endpoint
     */
    odbc_params?: OdbcParams;
    /**
     * Configurations whether the warehouse should use spot instances.
     */
    spot_instance_policy?: SpotInstancePolicy;
    /**
     * State of the warehouse
     */
    state?: State;
    /**
     * A set of key-value pairs that will be tagged on all resources (e.g., AWS
     * instances and EBS volumes) associated with this SQL Endpoints.
     *
     * Supported values: - Number of tags < 45.
     */
    tags?: EndpointTags;
    warehouse_type?: WarehouseType;
}

export interface EndpointTagPair {
    key?: string;
    value?: string;
}

export interface EndpointTags {
    custom_tags?: Array<EndpointTagPair>;
}

/**
 * Get an alert
 */
export interface GetAlertRequest {
    alert_id: string;
}

/**
 * Retrieve a definition
 */
export interface GetDashboardRequest {
    dashboard_id: string;
}

/**
 * Get object ACL
 */
export interface GetDbsqlPermissionRequest {
    /**
     * Object ID. An ACL is returned for the object with this UUID.
     */
    objectId: string;
    /**
     * The type of object permissions to check.
     */
    objectType: ObjectTypePlural;
}

/**
 * Get a query definition.
 */
export interface GetQueryRequest {
    query_id: string;
}

export interface GetResponse {
    access_control_list?: Array<AccessControl>;
    /**
     * A singular noun object type.
     */
    object_id?: ObjectType;
    /**
     * An object's type and UUID, separated by a forward slash (/) character.
     */
    object_type?: string;
}

/**
 * Get an alert's subscriptions
 */
export interface GetSubscriptionsRequest {
    alert_id: string;
}

/**
 * Get warehouse info
 */
export interface GetWarehouseRequest {
    /**
     * Required. Id of the SQL warehouse.
     */
    id: string;
}

export interface GetWarehouseResponse {
    /**
     * The amount of time in minutes that a SQL Endpoint must be idle (i.e., no
     * RUNNING queries) before it is automatically stopped.
     *
     * Supported values: - Must be == 0 or >= 10 mins - 0 indicates no autostop.
     *
     * Defaults to 120 mins
     */
    auto_stop_mins?: number;
    /**
     * Channel Details
     */
    channel?: Channel;
    /**
     * Size of the clusters allocated for this endpoint. Increasing the size of a
     * spark cluster allows you to run larger queries on it. If you want to
     * increase the number of concurrent queries, please tune max_num_clusters.
     *
     * Supported values: - 2X-Small - X-Small - Small - Medium - Large - X-Large
     * - 2X-Large - 3X-Large - 4X-Large
     */
    cluster_size?: string;
    /**
     * endpoint creator name
     */
    creator_name?: string;
    /**
     * Configures whether the endpoint should use Databricks Compute (aka Nephos)
     *
     * Deprecated: Use enable_serverless_compute TODO(SC-79930): Remove the field
     * once clients are updated
     */
    enable_databricks_compute?: boolean;
    /**
     * Configures whether the endpoint should use Photon optimized clusters.
     *
     * Defaults to false.
     */
    enable_photon?: boolean;
    /**
     * Configures whether the endpoint should use Serverless Compute (aka Nephos)
     *
     * Defaults to value in global endpoint settings
     */
    enable_serverless_compute?: boolean;
    /**
     * Optional health status. Assume the endpoint is healthy if this field is
     * not set.
     */
    health?: EndpointHealth;
    /**
     * unique identifier for endpoint
     */
    id?: string;
    /**
     * Deprecated. Instance profile used to pass IAM role to the cluster
     */
    instance_profile_arn?: string;
    /**
     * the jdbc connection string for this endpoint
     */
    jdbc_url?: string;
    /**
     * Maximum number of clusters that the autoscaler will create to handle
     * concurrent queries.
     *
     * Supported values: - Must be >= min_num_clusters - Must be <= 30.
     *
     * Defaults to min_clusters if unset.
     */
    max_num_clusters?: number;
    /**
     * Minimum number of available clusters that will be maintained for this SQL
     * Endpoint. Increasing this will ensure that a larger number of clusters are
     * always running and therefore may reduce the cold start time for new
     * queries. This is similar to reserved vs. revocable cores in a resource
     * manager.
     *
     * Supported values: - Must be > 0 - Must be <= min(max_num_clusters, 30)
     *
     * Defaults to 1
     */
    min_num_clusters?: number;
    /**
     * Logical name for the cluster.
     *
     * Supported values: - Must be unique within an org. - Must be less than 100
     * characters.
     */
    name?: string;
    /**
     * current number of active sessions for the endpoint
     */
    num_active_sessions?: number;
    /**
     * current number of clusters running for the service
     */
    num_clusters?: number;
    /**
     * ODBC parameters for the sql endpoint
     */
    odbc_params?: OdbcParams;
    /**
     * Configurations whether the warehouse should use spot instances.
     */
    spot_instance_policy?: SpotInstancePolicy;
    /**
     * State of the warehouse
     */
    state?: State;
    /**
     * A set of key-value pairs that will be tagged on all resources (e.g., AWS
     * instances and EBS volumes) associated with this SQL Endpoints.
     *
     * Supported values: - Number of tags < 45.
     */
    tags?: EndpointTags;
    warehouse_type?: WarehouseType;
}

export interface GetWorkspaceWarehouseConfigResponse {
    /**
     * Optional: Channel selection details
     */
    channel?: Channel;
    /**
     * Deprecated: Use sql_configuration_parameters
     */
    config_param?: RepeatedEndpointConfPairs;
    /**
     * Spark confs for external hive metastore configuration JSON serialized size
     * must be less than <= 512K
     */
    data_access_config?: Array<EndpointConfPair>;
    /**
     * Enable Serverless compute for SQL Endpoints
     *
     * Deprecated: Use enable_serverless_compute TODO(SC-79930): Remove the field
     * once clients are updated
     */
    enable_databricks_compute?: boolean;
    /**
     * Enable Serverless compute for SQL Endpoints
     */
    enable_serverless_compute?: boolean;
    /**
     * List of Warehouse Types allowed in this workspace (limits allowed value of
     * the type field in CreateWarehouse and EditWarehouse). Note: Some types
     * cannot be disabled, they don't need to be specified in
     * SetWorkspaceWarehouseConfig. Note: Disabling a type may cause existing
     * warehouses to be converted to another type. Used by frontend to save
     * specific type availability in the warehouse create and edit form UI.
     */
    enabled_warehouse_types?: Array<WarehouseTypePair>;
    /**
     * Deprecated: Use sql_configuration_parameters
     */
    global_param?: RepeatedEndpointConfPairs;
    /**
     * GCP only: Google Service Account used to pass to cluster to access Google
     * Cloud Storage
     */
    google_service_account?: string;
    /**
     * AWS Only: Instance profile used to pass IAM role to the cluster
     */
    instance_profile_arn?: string;
    /**
     * Security policy for endpoints
     */
    security_policy?: GetWorkspaceWarehouseConfigResponseSecurityPolicy;
    /**
     * SQL configuration parameters
     */
    sql_configuration_parameters?: RepeatedEndpointConfPairs;
}

/**
 * Security policy for endpoints
 */
export type GetWorkspaceWarehouseConfigResponseSecurityPolicy =
    | "DATA_ACCESS_CONTROL"
    | "NONE"
    | "PASSTHROUGH";

/**
 * Get dashboard objects
 */
export interface ListDashboardsRequest {
    /**
     * Name of dashboard attribute to order by.
     */
    order?: ListOrder;
    /**
     * Page number to retrieve.
     */
    page?: number;
    /**
     * Number of dashboards to return per page.
     */
    page_size?: number;
    /**
     * Full text search term.
     */
    q?: string;
}

export type ListOrder = "created_at" | "name";

/**
 * Get a list of queries
 */
export interface ListQueriesRequest {
    /**
     * Name of query attribute to order by. Default sort order is ascending.
     * Append a dash (`-`) to order descending instead.
     *
     * - `name`: The name of the query.
     *
     * - `created_at`: The timestamp the query was created.
     *
     * - `schedule`: The refresh interval for each query. For example: "Every 5
     * Hours" or "Every 5 Minutes". "Never" is treated as the highest value for
     * sorting.
     *
     * - `runtime`: The time it took to run this query. This is blank for
     * parameterized queries. A blank value is treated as the highest value for
     * sorting.
     *
     * - `executed_at`: The timestamp when the query was last run.
     *
     * - `created_by`: The user name of the user that created the query.
     */
    order?: string;
    /**
     * Page number to retrieve.
     */
    page?: number;
    /**
     * Number of queries to return per page.
     */
    page_size?: number;
    /**
     * Full text search term
     */
    q?: string;
}

export interface ListQueriesResponse {
    /**
     * Whether there is another page of results.
     */
    has_next_page?: boolean;
    /**
     * A token that can be used to get the next page of results.
     */
    next_page_token?: string;
    res?: Array<QueryInfo>;
}

/**
 * List Queries
 */
export interface ListQueryHistoryRequest {
    /**
     * A filter to limit query history results. This field is optional.
     */
    filter_by?: QueryFilter;
    /**
     * Whether to include metrics about query.
     */
    include_metrics?: boolean;
    /**
     * Limit the number of results returned in one page. The default is 100.
     */
    max_results?: number;
    /**
     * A token that can be used to get the next page of results.
     */
    page_token?: string;
}

export interface ListResponse {
    /**
     * The total number of dashboards.
     */
    count?: number;
    /**
     * The current page being displayed.
     */
    page?: number;
    /**
     * The number of dashboards per page.
     */
    page_size?: number;
    /**
     * List of dashboards returned.
     */
    results?: Array<Dashboard>;
}

/**
 * Get refresh schedules
 */
export interface ListSchedulesRequest {
    alert_id: string;
}

/**
 * List warehouses
 */
export interface ListWarehousesRequest {
    /**
     * Service Principal which will be used to fetch the list of endpoints. If
     * not specified, the user from the session header is used.
     */
    run_as_user_id?: number;
}

export interface ListWarehousesResponse {
    /**
     * A list of warehouses and their configurations.
     */
    warehouses?: Array<EndpointInfo>;
}

/**
 * A UUID generated by the application.
 */

/**
 * A singular noun object type.
 */
export type ObjectType = "alert" | "dashboard" | "data_source" | "query";

/**
 * Always a plural of the object type.
 */
export type ObjectTypePlural =
    | "alerts"
    | "dashboards"
    | "data_sources"
    | "queries";

export interface OdbcParams {
    hostname?: string;
    path?: string;
    port?: number;
    protocol?: string;
}

/**
 * The singular form of the type of object which can be owned.
 */
export type OwnableObjectType = "alert" | "dashboard" | "query";

export interface Parameter {
    /**
     * The literal parameter marker that appears between double curly braces in
     * the query text.
     */
    name?: string;
    /**
     * The text displayed in a parameter picking widget.
     */
    title?: string;
    /**
     * Parameters can have several different types.
     */
    type?: ParameterType;
    /**
     * The default value for this parameter.
     */
    value?: any /* MISSING TYPE */;
}

/**
 * Parameters can have several different types.
 */
export type ParameterType = "datetime" | "number" | "text";

/**
 * This describes an enum
 */
export type PermissionLevel =
    /**
     * Can manage the query
     */
    | "CAN_MANAGE"
    /**
     * Can run the query
     */
    | "CAN_RUN"
    /**
     * Can view the query
     */
    | "CAN_VIEW";

/**
 * Whether plans exist for the execution, or the reason why they are missing
 */
export type PlansState =
    | "EMPTY"
    | "EXISTS"
    | "IGNORED_LARGE_PLANS_SIZE"
    | "IGNORED_SMALL_DURATION"
    | "IGNORED_SPARK_PLAN_TYPE"
    | "UNKNOWN";

export interface Query {
    /**
     * Describes whether the authenticated user is allowed to edit the definition
     * of this query.
     */
    can_edit?: boolean;
    /**
     * The timestamp when this query was created.
     */
    created_at?: string;
    /**
     * Data Source ID. The UUID that uniquely identifies this data source / SQL
     * warehouse across the API.
     */
    data_source_id?: string;
    /**
     * General description that conveys additional information about this query
     * such as usage notes.
     */
    description?: string;
    id?: string;
    /**
     * Indicates whether the query is trashed. Trashed queries can't be used in
     * dashboards, or appear in search results. If this boolean is `true`, the
     * `options` property for this query includes a `moved_to_trash_at`
     * timestamp. Trashed queries are permanently deleted after 30 days.
     */
    is_archived?: boolean;
    /**
     * Whether the query is a draft. Draft queries only appear in list views for
     * their owners. Visualizations from draft queries cannot appear on
     * dashboards.
     */
    is_draft?: boolean;
    /**
     * Whether this query object appears in the current user's favorites list.
     * This flag determines whether the star icon for favorites is selected.
     */
    is_favorite?: boolean;
    /**
     * Text parameter types are not safe from SQL injection for all types of data
     * source. Set this Boolean parameter to `true` if a query either does not
     * use any text type parameters or uses a data source type where text type
     * parameters are handled safely.
     */
    is_safe?: boolean;
    last_modified_by?: User;
    /**
     * The ID of the user who last saved changes to this query.
     */
    last_modified_by_id?: number;
    /**
     * If there is a cached result for this query and user, this field includes
     * the query result ID. If this query uses parameters, this field is always
     * null.
     */
    latest_query_data_id?: string;
    /**
     * The title of this query that appears in list views, widget headings, and
     * on the query page.
     */
    name?: string;
    options?: QueryOptions;
    /**
     * This describes an enum
     */
    permission_tier?: PermissionLevel;
    /**
     * The text of the query to be run.
     */
    query?: string;
    /**
     * A SHA-256 hash of the query text along with the authenticated user ID.
     */
    query_hash?: string;
    schedule?: QueryInterval;
    tags?: Array<string>;
    /**
     * The timestamp at which this query was last updated.
     */
    updated_at?: string;
    user?: User;
    /**
     * The ID of the user who created this query.
     */
    user_id?: number;
    visualizations?: Array<Visualization>;
}

/**
 * A filter to limit query history results. This field is optional.
 */
export interface QueryFilter {
    query_start_time_range?: TimeRange;
    statuses?: Array<QueryStatus>;
    /**
     * A list of user IDs who ran the queries.
     */
    user_ids?: Array<number>;
    /**
     * A list of warehouse IDs.
     */
    warehouse_ids?: Array<string>;
}

export interface QueryInfo {
    /**
     * Channel information for the SQL warehouse at the time of query execution
     */
    channel_used?: ChannelInfo;
    /**
     * Total execution time of the query from the client’s point of view, in
     * milliseconds.
     */
    duration?: number;
    /**
     * Alias for `warehouse_id`.
     */
    endpoint_id?: string;
    /**
     * Message describing why the query could not complete.
     */
    error_message?: string;
    /**
     * The ID of the user whose credentials were used to run the query.
     */
    executed_as_user_id?: number;
    /**
     * The email address or username of the user whose credentials were used to
     * run the query.
     */
    executed_as_user_name?: string;
    /**
     * The time execution of the query ended.
     */
    execution_end_time_ms?: number;
    /**
     * Whether more updates for the query are expected.
     */
    is_final?: boolean;
    /**
     * A key that can be used to look up query details.
     */
    lookup_key?: string;
    /**
     * Metrics about query execution.
     */
    metrics?: QueryMetrics;
    /**
     * Whether plans exist for the execution, or the reason why they are missing
     */
    plans_state?: PlansState;
    /**
     * The time the query ended.
     */
    query_end_time_ms?: number;
    /**
     * The query ID.
     */
    query_id?: string;
    /**
     * The time the query started.
     */
    query_start_time_ms?: number;
    /**
     * The text of the query.
     */
    query_text?: string;
    /**
     * The number of results returned by the query.
     */
    rows_produced?: number;
    /**
     * URL to the query plan.
     */
    spark_ui_url?: string;
    /**
     * Type of statement for this query
     */
    statement_type?: QueryStatementType;
    /**
     * This describes an enum
     */
    status?: QueryStatus;
    /**
     * The ID of the user who ran the query.
     */
    user_id?: number;
    /**
     * The email address or username of the user who ran the query.
     */
    user_name?: string;
    /**
     * Warehouse ID.
     */
    warehouse_id?: string;
}

export interface QueryInterval {
    /**
     * For weekly runs, the day of the week to start the run.
     */
    day_of_week?: string;
    /**
     * Integer number of seconds between runs.
     */
    interval?: number;
    /**
     * For daily, weekly, and monthly runs, the time of day to start the run.
     */
    time?: string;
    /**
     * A date after which this schedule no longer applies.
     */
    until?: string;
}

export interface QueryList {
    /**
     * The total number of queries.
     */
    count?: number;
    /**
     * The page number that is currently displayed.
     */
    page?: number;
    /**
     * The number of queries per page.
     */
    page_size?: number;
    /**
     * List of queries returned.
     */
    results?: Array<Query>;
}

/**
 * Metrics about query execution.
 */
export interface QueryMetrics {
    /**
     * Time spent loading metadata and optimizing the query, in milliseconds.
     */
    compilation_time_ms?: number;
    /**
     * Time spent executing the query, in milliseconds.
     */
    execution_time_ms?: number;
    /**
     * Total amount of data sent over the network, in bytes.
     */
    network_sent_bytes?: number;
    /**
     * Total execution time for all individual Photon query engine tasks in the
     * query, in milliseconds.
     */
    photon_total_time_ms?: number;
    /**
     * Time spent waiting to execute the query because the SQL warehouse is
     * already running the maximum number of concurrent queries, in milliseconds.
     */
    queued_overload_time_ms?: number;
    /**
     * Time waiting for compute resources to be provisioned for the SQL
     * warehouse, in milliseconds.
     */
    queued_provisioning_time_ms?: number;
    /**
     * Total size of data read by the query, in bytes.
     */
    read_bytes?: number;
    /**
     * Size of persistent data read from the cache, in bytes.
     */
    read_cache_bytes?: number;
    /**
     * Number of files read after pruning.
     */
    read_files_count?: number;
    /**
     * Number of partitions read after pruning.
     */
    read_partitions_count?: number;
    /**
     * Size of persistent data read from cloud object storage on your cloud
     * tenant, in bytes.
     */
    read_remote_bytes?: number;
    /**
     * Time spent fetching the query results after the execution finished, in
     * milliseconds.
     */
    result_fetch_time_ms?: number;
    /**
     * true if the query result was fetched from cache, false otherwise.
     */
    result_from_cache?: boolean;
    /**
     * Total number of rows returned by the query.
     */
    rows_produced_count?: number;
    /**
     * Total number of rows read by the query.
     */
    rows_read_count?: number;
    /**
     * Size of data temporarily written to disk while executing the query, in
     * bytes.
     */
    spill_to_disk_bytes?: number;
    /**
     * Sum of execution time for all of the query’s tasks, in milliseconds.
     */
    task_total_time_ms?: number;
    /**
     * Number of files that would have been read without pruning.
     */
    total_files_count?: number;
    /**
     * Number of partitions that would have been read without pruning.
     */
    total_partitions_count?: number;
    /**
     * Total execution time of the query from the client’s point of view, in
     * milliseconds.
     */
    total_time_ms?: number;
    /**
     * Size pf persistent data written to cloud object storage in your cloud
     * tenant, in bytes.
     */
    write_remote_bytes?: number;
}

export interface QueryOptions {
    /**
     * The timestamp when this query was moved to trash. Only present when the
     * `is_archived` property is `true`. Trashed items are deleted after thirty
     * days.
     */
    moved_to_trash_at?: string;
    parameters?: Array<Parameter>;
}

export interface QueryPostContent {
    /**
     * The ID of the data source / SQL warehouse where this query will run.
     */
    data_source_id?: string;
    /**
     * General description that can convey additional information about this
     * query such as usage notes.
     */
    description?: string;
    /**
     * The name or title of this query to display in list views.
     */
    name?: string;
    /**
     * Exclusively used for storing a list parameter definitions. A parameter is
     * an object with `title`, `name`, `type`, and `value` properties. The
     * `value` field here is the default value. It can be overridden at runtime.
     */
    options?: any /* MISSING TYPE */;
    /**
     * The text of the query.
     */
    query?: string;
    query_id: string;
    /**
     * JSON object that describes the scheduled execution frequency. A schedule
     * object includes `interval`, `time`, `day_of_week`, and `until` fields. If
     * a scheduled is supplied, then only `interval` is required. All other field
     * can be `null`.
     */
    schedule?: QueryInterval;
}

/**
 * Type of statement for this query
 */
export type QueryStatementType =
    | "ALTER"
    | "ANALYZE"
    | "COPY"
    | "CREATE"
    | "DELETE"
    | "DESCRIBE"
    | "DROP"
    | "EXPLAIN"
    | "GRANT"
    | "INSERT"
    | "MERGE"
    | "OPTIMIZE"
    | "OTHER"
    | "REFRESH"
    | "REPLACE"
    | "REVOKE"
    | "SELECT"
    | "SET"
    | "SHOW"
    | "TRUNCATE"
    | "UPDATE"
    | "USE";

/**
 * This describes an enum
 */
export type QueryStatus =
    /**
     * Query has been cancelled by the user.
     */
    | "CANCELED"
    /**
     * Query has failed.
     */
    | "FAILED"
    /**
     * Query has completed.
     */
    | "FINISHED"
    /**
     * Query has been received and queued.
     */
    | "QUEUED"
    /**
     * Query has started.
     */
    | "RUNNING";

export interface RefreshSchedule {
    /**
     * Cron string representing the refresh schedule.
     */
    cron?: string;
    /**
     * ID of the SQL warehouse to refresh with. If `null`, query's SQL warehouse
     * will be used to refresh.
     */
    data_source_id?: string;
    /**
     * ID of the refresh schedule.
     */
    id?: string;
}

export interface RepeatedEndpointConfPairs {
    /**
     * Deprecated: Use configuration_pairs
     */
    config_pair?: Array<EndpointConfPair>;
    configuration_pairs?: Array<EndpointConfPair>;
}

/**
 * Restore a dashboard
 */
export interface RestoreDashboardRequest {
    dashboard_id: string;
}

/**
 * Restore a query
 */
export interface RestoreQueryRequest {
    query_id: string;
}

/**
 * Set object ACL
 */
export interface SetRequest {
    access_control_list?: Array<AccessControl>;
    /**
     * Object ID. The ACL for the object with this UUID is overwritten by this
     * request's POST content.
     */
    objectId: string;
    /**
     * The type of object permission to set.
     */
    objectType: ObjectTypePlural;
}

export interface SetResponse {
    access_control_list?: Array<AccessControl>;
    /**
     * A singular noun object type.
     */
    object_id?: ObjectType;
    /**
     * An object's type and UUID, separated by a forward slash (/) character.
     */
    object_type?: string;
}

export interface SetWorkspaceWarehouseConfigRequest {
    /**
     * Optional: Channel selection details
     */
    channel?: Channel;
    /**
     * Deprecated: Use sql_configuration_parameters
     */
    config_param?: RepeatedEndpointConfPairs;
    /**
     * Spark confs for external hive metastore configuration JSON serialized size
     * must be less than <= 512K
     */
    data_access_config?: Array<EndpointConfPair>;
    /**
     * Enable Serverless compute for SQL Endpoints
     *
     * Deprecated: Use enable_serverless_compute TODO(SC-79930): Remove the field
     * once clients are updated
     */
    enable_databricks_compute?: boolean;
    /**
     * Enable Serverless compute for SQL Endpoints
     */
    enable_serverless_compute?: boolean;
    /**
     * List of Warehouse Types allowed in this workspace (limits allowed value of
     * the type field in CreateWarehouse and EditWarehouse). Note: Some types
     * cannot be disabled, they don't need to be specified in
     * SetWorkspaceWarehouseConfig. Note: Disabling a type may cause existing
     * warehouses to be converted to another type. Used by frontend to save
     * specific type availability in the warehouse create and edit form UI.
     */
    enabled_warehouse_types?: Array<WarehouseTypePair>;
    /**
     * Deprecated: Use sql_configuration_parameters
     */
    global_param?: RepeatedEndpointConfPairs;
    /**
     * GCP only: Google Service Account used to pass to cluster to access Google
     * Cloud Storage
     */
    google_service_account?: string;
    /**
     * AWS Only: Instance profile used to pass IAM role to the cluster
     */
    instance_profile_arn?: string;
    /**
     * Security policy for endpoints
     */
    security_policy?: SetWorkspaceWarehouseConfigRequestSecurityPolicy;
    /**
     * Internal. Used by frontend to save Serverless Compute agreement value.
     */
    serverless_agreement?: boolean;
    /**
     * SQL configuration parameters
     */
    sql_configuration_parameters?: RepeatedEndpointConfPairs;
}

/**
 * Security policy for endpoints
 */
export type SetWorkspaceWarehouseConfigRequestSecurityPolicy =
    | "DATA_ACCESS_CONTROL"
    | "NONE"
    | "PASSTHROUGH";

/**
 * Configurations whether the warehouse should use spot instances.
 */
export type SpotInstancePolicy =
    | "COST_OPTIMIZED"
    | "POLICY_UNSPECIFIED"
    | "RELIABILITY_OPTIMIZED";

/**
 * Start a warehouse
 */
export interface StartRequest {
    /**
     * Required. Id of the SQL warehouse.
     */
    id: string;
}

/**
 * State of the warehouse
 */
export type State =
    | "DELETED"
    | "DELETING"
    | "RUNNING"
    | "STARTING"
    | "STOPPED"
    | "STOPPING";

/**
 * Health status of the endpoint.
 */
export type Status = "DEGRADED" | "FAILED" | "HEALTHY" | "STATUS_UNSPECIFIED";

/**
 * Stop a warehouse
 */
export interface StopRequest {
    /**
     * Required. Id of the SQL warehouse.
     */
    id: string;
}

export interface Subscription {
    /**
     * ID of the alert.
     */
    alert_id?: string;
    /**
     * Alert destination subscribed to the alert, if it exists. Alert
     * destinations can be configured by admins through the UI. See [here].
     *
     * [here]: https://docs.databricks.com/sql/admin/alert-destinations.html
     */
    destination?: Destination;
    /**
     * ID of the alert subscription.
     */
    id?: string;
    user?: User;
}

export interface Success {
    message?: SuccessMessage;
}

export type SuccessMessage = "Success";

/**
 * Tags can be applied to dashboards and queries. They are used for filtering
 * list views.
 */

export interface TerminationReason {
    /**
     * status code indicating why the cluster was terminated
     */
    code?: TerminationReasonCode;
    /**
     * list of parameters that provide additional information about why the
     * cluster was terminated
     */
    parameters?: Record<string, string>;
    /**
     * type of the termination
     */
    type?: TerminationReasonType;
}

/**
 * status code indicating why the cluster was terminated
 */
export type TerminationReasonCode =
    | "ABUSE_DETECTED"
    | "ATTACH_PROJECT_FAILURE"
    | "AWS_AUTHORIZATION_FAILURE"
    | "AWS_INSUFFICIENT_FREE_ADDRESSES_IN_SUBNET_FAILURE"
    | "AWS_INSUFFICIENT_INSTANCE_CAPACITY_FAILURE"
    | "AWS_MAX_SPOT_INSTANCE_COUNT_EXCEEDED_FAILURE"
    | "AWS_REQUEST_LIMIT_EXCEEDED"
    | "AWS_UNSUPPORTED_FAILURE"
    | "AZURE_BYOK_KEY_PERMISSION_FAILURE"
    | "AZURE_EPHEMERAL_DISK_FAILURE"
    | "AZURE_INVALID_DEPLOYMENT_TEMPLATE"
    | "AZURE_OPERATION_NOT_ALLOWED_EXCEPTION"
    | "AZURE_QUOTA_EXCEEDED_EXCEPTION"
    | "AZURE_RESOURCE_MANAGER_THROTTLING"
    | "AZURE_RESOURCE_PROVIDER_THROTTLING"
    | "AZURE_UNEXPECTED_DEPLOYMENT_TEMPLATE_FAILURE"
    | "AZURE_VM_EXTENSION_FAILURE"
    | "AZURE_VNET_CONFIGURATION_FAILURE"
    | "BOOTSTRAP_TIMEOUT"
    | "BOOTSTRAP_TIMEOUT_CLOUD_PROVIDER_EXCEPTION"
    | "CLOUD_PROVIDER_DISK_SETUP_FAILURE"
    | "CLOUD_PROVIDER_LAUNCH_FAILURE"
    | "CLOUD_PROVIDER_RESOURCE_STOCKOUT"
    | "CLOUD_PROVIDER_SHUTDOWN"
    | "COMMUNICATION_LOST"
    | "CONTAINER_LAUNCH_FAILURE"
    | "CONTROL_PLANE_REQUEST_FAILURE"
    | "DATABASE_CONNECTION_FAILURE"
    | "DBFS_COMPONENT_UNHEALTHY"
    | "DOCKER_IMAGE_PULL_FAILURE"
    | "DRIVER_UNREACHABLE"
    | "DRIVER_UNRESPONSIVE"
    | "EXECUTION_COMPONENT_UNHEALTHY"
    | "GCP_QUOTA_EXCEEDED"
    | "GCP_SERVICE_ACCOUNT_DELETED"
    | "GLOBAL_INIT_SCRIPT_FAILURE"
    | "HIVE_METASTORE_PROVISIONING_FAILURE"
    | "IMAGE_PULL_PERMISSION_DENIED"
    | "INACTIVITY"
    | "INIT_SCRIPT_FAILURE"
    | "INSTANCE_POOL_CLUSTER_FAILURE"
    | "INSTANCE_UNREACHABLE"
    | "INTERNAL_ERROR"
    | "INVALID_ARGUMENT"
    | "INVALID_SPARK_IMAGE"
    | "IP_EXHAUSTION_FAILURE"
    | "JOB_FINISHED"
    | "K8S_AUTOSCALING_FAILURE"
    | "K8S_DBR_CLUSTER_LAUNCH_TIMEOUT"
    | "METASTORE_COMPONENT_UNHEALTHY"
    | "NEPHOS_RESOURCE_MANAGEMENT"
    | "NETWORK_CONFIGURATION_FAILURE"
    | "NFS_MOUNT_FAILURE"
    | "NPIP_TUNNEL_SETUP_FAILURE"
    | "NPIP_TUNNEL_TOKEN_FAILURE"
    | "REQUEST_REJECTED"
    | "REQUEST_THROTTLED"
    | "SECRET_RESOLUTION_ERROR"
    | "SECURITY_DAEMON_REGISTRATION_EXCEPTION"
    | "SELF_BOOTSTRAP_FAILURE"
    | "SKIPPED_SLOW_NODES"
    | "SLOW_IMAGE_DOWNLOAD"
    | "SPARK_ERROR"
    | "SPARK_IMAGE_DOWNLOAD_FAILURE"
    | "SPARK_STARTUP_FAILURE"
    | "SPOT_INSTANCE_TERMINATION"
    | "STORAGE_DOWNLOAD_FAILURE"
    | "STS_CLIENT_SETUP_FAILURE"
    | "SUBNET_EXHAUSTED_FAILURE"
    | "TEMPORARILY_UNAVAILABLE"
    | "TRIAL_EXPIRED"
    | "UNEXPECTED_LAUNCH_FAILURE"
    | "UNKNOWN"
    | "UNSUPPORTED_INSTANCE_TYPE"
    | "UPDATE_INSTANCE_PROFILE_FAILURE"
    | "USER_REQUEST"
    | "WORKER_SETUP_FAILURE"
    | "WORKSPACE_CANCELLED_ERROR"
    | "WORKSPACE_CONFIGURATION_ERROR";

/**
 * type of the termination
 */
export type TerminationReasonType =
    | "CLIENT_ERROR"
    | "CLOUD_FAILURE"
    | "SERVICE_FAULT"
    | "SUCCESS";

export interface TimeRange {
    /**
     * Limit results to queries that started before this time.
     */
    end_time_ms?: number;
    /**
     * Limit results to queries that started after this time.
     */
    start_time_ms?: number;
}

export interface TransferOwnershipObjectId {
    /**
     * Email address for the new owner, who must exist in the workspace.
     */
    new_owner?: string;
}

/**
 * Transfer object ownership
 */
export interface TransferOwnershipRequest {
    /**
     * Email address for the new owner, who must exist in the workspace.
     */
    new_owner?: string;
    /**
     * The ID of the object on which to change ownership.
     */
    objectId: TransferOwnershipObjectId;
    /**
     * The type of object on which to change ownership.
     */
    objectType: OwnableObjectType;
}

/**
 * Unsubscribe to an alert
 */
export interface UnsubscribeRequest {
    alert_id: string;
    subscription_id: string;
}

export interface User {
    email?: string;
    id?: number;
    /**
     * Whether this user is an admin in the Databricks workspace.
     */
    is_db_admin?: boolean;
    name?: string;
    /**
     * The URL for the gravatar profile picture tied to this user's email
     * address.
     */
    profile_image_url?: string;
}

/**
 * The ID of the user who ran the query.
 */

/**
 * The visualization description API changes frequently and is unsupported. You
 * can duplicate a visualization by copying description objects received _from
 * the API_ and then using them to create a new one with a POST request to the
 * same endpoint. Databricks does not recommend constructing ad-hoc
 * visualizations entirely in JSON.
 */
export interface Visualization {
    created_at?: string;
    /**
     * A short description of this visualization. This is not displayed in the
     * UI.
     */
    description?: string;
    /**
     * The UUID for this visualization.
     */
    id?: string;
    /**
     * The name of the visualization that appears on dashboards and the query
     * screen.
     */
    name?: string;
    /**
     * The options object varies widely from one visualization type to the next
     * and is unsupported. Databricks does not recommend modifying visualization
     * settings in JSON.
     */
    options?: any /* MISSING TYPE */;
    /**
     * The type of visualization: chart, table, pivot table, and so on.
     */
    type?: string;
    updated_at?: string;
}

/**
 * Warehouse ID.
 */

export type WarehouseType = "CLASSIC" | "PRO" | "TYPE_UNSPECIFIED";

export interface WarehouseTypePair {
    /**
     * If set to false the specific warehouse type will not be be allowed as a
     * value for warehouse_type in CreateWarehouse and EditWarehouse
     */
    enabled?: boolean;
    warehouse_type?: WarehouseType;
}

export interface Widget {
    /**
     * The unique ID for this widget.
     */
    id?: number;
    options?: WidgetOptions;
    /**
     * The visualization description API changes frequently and is unsupported.
     * You can duplicate a visualization by copying description objects received
     * _from the API_ and then using them to create a new one with a POST request
     * to the same endpoint. Databricks does not recommend constructing ad-hoc
     * visualizations entirely in JSON.
     */
    visualization?: Visualization;
    /**
     * Unused field.
     */
    width?: number;
}

export interface WidgetOptions {
    /**
     * Timestamp when this object was created
     */
    created_at?: string;
    /**
     * The dashboard ID to which this widget belongs. Each widget can belong to
     * one dashboard.
     */
    dashboard_id?: string;
    /**
     * Whether this widget is hidden on the dashboard.
     */
    isHidden?: boolean;
    /**
     * How parameters used by the visualization in this widget relate to other
     * widgets on the dashboard. Databricks does not recommend modifying this
     * definition in JSON.
     */
    parameterMappings?: any /* MISSING TYPE */;
    /**
     * Coordinates of this widget on a dashboard. This portion of the API changes
     * frequently and is unsupported.
     */
    position?: any /* MISSING TYPE */;
    /**
     * If this is a textbox widget, the application displays this text. This
     * field is ignored if the widget contains a visualization in the
     * `visualization` field.
     */
    text?: string;
    /**
     * Timestamp of the last time this object was updated.
     */
    updated_at?: string;
}

export interface EmptyResponse {}
