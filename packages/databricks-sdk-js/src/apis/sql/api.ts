/* eslint-disable @typescript-eslint/naming-convention */

// Code generated from OpenAPI specs by Databricks SDK Generator. DO NOT EDIT.

import {ApiClient} from "../../api-client";
import * as model from "./model";
import Time from "../../retries/Time";
import retry from "../../retries/retries";
import {CancellationToken} from "../../types";
import {ApiError, ApiRetriableError} from "../apiError";
import {context, Context} from "../../context";
import {ExposedLoggers, withLogContext} from "../../logging";

export class AlertsRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("Alerts", method, message);
    }
}
export class AlertsError extends ApiError {
    constructor(method: string, message?: string) {
        super("Alerts", method, message);
    }
}

/**
 * The alerts API can be used to perform CRUD operations on alerts. An alert is a
 * Databricks SQL object that periodically runs a query, evaluates a condition of
 * its result, and notifies one or more users and/or alert destinations if the
 * condition was met.
 */
export class AlertsService {
    constructor(readonly client: ApiClient) {}
    /**
     * Create an alert.
     *
     * Creates an alert. An alert is a Databricks SQL object that periodically
     * runs a query, evaluates a condition of its result, and notifies users or
     * alert destinations if the condition was met.
     */
    @withLogContext(ExposedLoggers.SDK)
    async create(
        request: model.EditAlert,
        @context context?: Context
    ): Promise<model.Alert> {
        const path = "/api/2.0/preview/sql/alerts";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as unknown as model.Alert;
    }

    /**
     * Create a refresh schedule.
     *
     * Creates a new refresh schedule for an alert.
     *
     * **Note:** The structure of refresh schedules is subject to change.
     */
    @withLogContext(ExposedLoggers.SDK)
    async createSchedule(
        request: model.CreateRefreshSchedule,
        @context context?: Context
    ): Promise<model.RefreshSchedule> {
        const path = `/api/2.0/preview/sql/alerts/${request.alert_id}/refresh-schedules`;
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as unknown as model.RefreshSchedule;
    }

    /**
     * Delete an alert.
     *
     * Deletes an alert. Deleted alerts are no longer accessible and cannot be
     * restored. **Note:** Unlike queries and dashboards, alerts cannot be moved
     * to the trash.
     */
    @withLogContext(ExposedLoggers.SDK)
    async delete(
        request: model.DeleteAlertRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.0/preview/sql/alerts/${request.alert_id}`;
        return (await this.client.request(
            path,
            "DELETE",
            request,
            context
        )) as unknown as model.EmptyResponse;
    }

    /**
     * Delete a refresh schedule.
     *
     * Deletes an alert's refresh schedule. The refresh schedule specifies when
     * to refresh and evaluate the associated query result.
     */
    @withLogContext(ExposedLoggers.SDK)
    async deleteSchedule(
        request: model.DeleteScheduleRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.0/preview/sql/alerts/${request.alert_id}/refresh-schedules/${request.schedule_id}`;
        return (await this.client.request(
            path,
            "DELETE",
            request,
            context
        )) as unknown as model.EmptyResponse;
    }

    /**
     * Get an alert.
     *
     * Gets an alert.
     */
    @withLogContext(ExposedLoggers.SDK)
    async get(
        request: model.GetAlertRequest,
        @context context?: Context
    ): Promise<model.Alert> {
        const path = `/api/2.0/preview/sql/alerts/${request.alert_id}`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as unknown as model.Alert;
    }

    /**
     * Get an alert's subscriptions.
     *
     * Get the subscriptions for an alert. An alert subscription represents
     * exactly one recipient being notified whenever the alert is triggered. The
     * alert recipient is specified by either the `user` field or the
     * `destination` field. The `user` field is ignored if `destination` is
     * non-`null`.
     */
    @withLogContext(ExposedLoggers.SDK)
    async getSubscriptions(
        request: model.GetSubscriptionsRequest,
        @context context?: Context
    ): Promise<Array<model.Subscription>> {
        const path = `/api/2.0/preview/sql/alerts/${request.alert_id}/subscriptions`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as unknown as Array<model.Subscription>;
    }

    /**
     * Get alerts.
     *
     * Gets a list of alerts.
     */
    @withLogContext(ExposedLoggers.SDK)
    async list(@context context?: Context): Promise<Array<model.Alert>> {
        const path = "/api/2.0/preview/sql/alerts";
        return (await this.client.request(
            path,
            "GET",
            undefined,
            context
        )) as unknown as Array<model.Alert>;
    }

    /**
     * Get refresh schedules.
     *
     * Gets the refresh schedules for the specified alert. Alerts can have
     * refresh schedules that specify when to refresh and evaluate the associated
     * query result.
     *
     * **Note:** Although refresh schedules are returned in a list, only one
     * refresh schedule per alert is currently supported. The structure of
     * refresh schedules is subject to change.
     */
    @withLogContext(ExposedLoggers.SDK)
    async listSchedules(
        request: model.ListSchedulesRequest,
        @context context?: Context
    ): Promise<Array<model.RefreshSchedule>> {
        const path = `/api/2.0/preview/sql/alerts/${request.alert_id}/refresh-schedules`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as unknown as Array<model.RefreshSchedule>;
    }

    /**
     * Subscribe to an alert.
     */
    @withLogContext(ExposedLoggers.SDK)
    async subscribe(
        request: model.CreateSubscription,
        @context context?: Context
    ): Promise<model.Subscription> {
        const path = `/api/2.0/preview/sql/alerts/${request.alert_id}/subscriptions`;
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as unknown as model.Subscription;
    }

    /**
     * Unsubscribe to an alert.
     *
     * Unsubscribes a user or a destination to an alert.
     */
    @withLogContext(ExposedLoggers.SDK)
    async unsubscribe(
        request: model.UnsubscribeRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.0/preview/sql/alerts/${request.alert_id}/subscriptions/${request.subscription_id}`;
        return (await this.client.request(
            path,
            "DELETE",
            request,
            context
        )) as unknown as model.EmptyResponse;
    }

    /**
     * Update an alert.
     *
     * Updates an alert.
     */
    @withLogContext(ExposedLoggers.SDK)
    async update(
        request: model.EditAlert,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.0/preview/sql/alerts/${request.alert_id}`;
        return (await this.client.request(
            path,
            "PUT",
            request,
            context
        )) as unknown as model.EmptyResponse;
    }
}

export class DashboardsRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("Dashboards", method, message);
    }
}
export class DashboardsError extends ApiError {
    constructor(method: string, message?: string) {
        super("Dashboards", method, message);
    }
}

/**
 * In general, there is little need to modify dashboards using the API. However,
 * it can be useful to use dashboard objects to look-up a collection of related
 * query IDs. The API can also be used to duplicate multiple dashboards at once
 * since you can get a dashboard definition with a GET request and then POST it
 * to create a new one.
 */
export class DashboardsService {
    constructor(readonly client: ApiClient) {}
    /**
     * Create a dashboard object.
     */
    @withLogContext(ExposedLoggers.SDK)
    async create(
        request: model.CreateDashboardRequest,
        @context context?: Context
    ): Promise<model.Dashboard> {
        const path = "/api/2.0/preview/sql/dashboards";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as unknown as model.Dashboard;
    }

    /**
     * Remove a dashboard.
     *
     * Moves a dashboard to the trash. Trashed dashboards do not appear in list
     * views or searches, and cannot be shared.
     */
    @withLogContext(ExposedLoggers.SDK)
    async delete(
        request: model.DeleteDashboardRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.0/preview/sql/dashboards/${request.dashboard_id}`;
        return (await this.client.request(
            path,
            "DELETE",
            request,
            context
        )) as unknown as model.EmptyResponse;
    }

    /**
     * Retrieve a definition.
     *
     * Returns a JSON representation of a dashboard object, including its
     * visualization and query objects.
     */
    @withLogContext(ExposedLoggers.SDK)
    async get(
        request: model.GetDashboardRequest,
        @context context?: Context
    ): Promise<model.Dashboard> {
        const path = `/api/2.0/preview/sql/dashboards/${request.dashboard_id}`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as unknown as model.Dashboard;
    }

    /**
     * Get dashboard objects.
     *
     * Fetch a paginated list of dashboard objects.
     */
    @withLogContext(ExposedLoggers.SDK)
    async list(
        request: model.ListDashboardsRequest,
        @context context?: Context
    ): Promise<model.ListResponse> {
        const path = "/api/2.0/preview/sql/dashboards";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as unknown as model.ListResponse;
    }

    /**
     * Restore a dashboard.
     *
     * A restored dashboard appears in list views and searches and can be shared.
     */
    @withLogContext(ExposedLoggers.SDK)
    async restore(
        request: model.RestoreDashboardRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.0/preview/sql/dashboards/trash/${request.dashboard_id}`;
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as unknown as model.EmptyResponse;
    }
}

export class DataSourcesRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("DataSources", method, message);
    }
}
export class DataSourcesError extends ApiError {
    constructor(method: string, message?: string) {
        super("DataSources", method, message);
    }
}

/**
 * This API is provided to assist you in making new query objects. When creating
 * a query object, you may optionally specify a `data_source_id` for the SQL
 * warehouse against which it will run. If you don't already know the
 * `data_source_id` for your desired SQL warehouse, this API will help you find
 * it.
 *
 * This API does not support searches. It returns the full list of SQL warehouses
 * in your workspace. We advise you to use any text editor, REST client, or
 * `grep` to search the response from this API for the name of your SQL warehouse
 * as it appears in Databricks SQL.
 */
export class DataSourcesService {
    constructor(readonly client: ApiClient) {}
    /**
     * Get a list of SQL warehouses.
     *
     * Retrieves a full list of SQL warehouses available in this workspace. All
     * fields that appear in this API response are enumerated for clarity.
     * However, you need only a SQL warehouse's `id` to create new queries
     * against it.
     */
    @withLogContext(ExposedLoggers.SDK)
    async list(@context context?: Context): Promise<Array<model.DataSource>> {
        const path = "/api/2.0/preview/sql/data_sources";
        return (await this.client.request(
            path,
            "GET",
            undefined,
            context
        )) as unknown as Array<model.DataSource>;
    }
}

export class DbsqlPermissionsRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("DbsqlPermissions", method, message);
    }
}
export class DbsqlPermissionsError extends ApiError {
    constructor(method: string, message?: string) {
        super("DbsqlPermissions", method, message);
    }
}

/**
 * The SQL Permissions API is similar to the endpoints of the
 * :method:permissions/setobjectpermissions. However, this exposes only one
 * endpoint, which gets the Access Control List for a given object. You cannot
 * modify any permissions using this API.
 *
 * There are three levels of permission:
 *
 * - `CAN_VIEW`: Allows read-only access
 *
 * - `CAN_RUN`: Allows read access and run access (superset of `CAN_VIEW`)
 *
 * - `CAN_MANAGE`: Allows all actions: read, run, edit, delete, modify
 * permissions (superset of `CAN_RUN`)
 */
export class DbsqlPermissionsService {
    constructor(readonly client: ApiClient) {}
    /**
     * Get object ACL.
     *
     * Gets a JSON representation of the access control list (ACL) for a
     * specified object.
     */
    @withLogContext(ExposedLoggers.SDK)
    async get(
        request: model.GetDbsqlPermissionRequest,
        @context context?: Context
    ): Promise<model.GetResponse> {
        const path = `/api/2.0/preview/sql/permissions/${request.objectType}/${request.objectId}`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as unknown as model.GetResponse;
    }

    /**
     * Set object ACL.
     *
     * Sets the access control list (ACL) for a specified object. This operation
     * will complete rewrite the ACL.
     */
    @withLogContext(ExposedLoggers.SDK)
    async set(
        request: model.SetRequest,
        @context context?: Context
    ): Promise<model.SetResponse> {
        const path = `/api/2.0/preview/sql/permissions/${request.objectType}/${request.objectId}`;
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as unknown as model.SetResponse;
    }

    /**
     * Transfer object ownership.
     *
     * Transfers ownership of a dashboard, query, or alert to an active user.
     * Requires an admin API key.
     */
    @withLogContext(ExposedLoggers.SDK)
    async transferOwnership(
        request: model.TransferOwnershipRequest,
        @context context?: Context
    ): Promise<model.Success> {
        const path = `/api/2.0/preview/sql/permissions/${request.objectType}/${request.objectId}/transfer`;
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as unknown as model.Success;
    }
}

export class QueriesRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("Queries", method, message);
    }
}
export class QueriesError extends ApiError {
    constructor(method: string, message?: string) {
        super("Queries", method, message);
    }
}

/**
 * These endpoints are used for CRUD operations on query definitions. Query
 * definitions include the target SQL warehouse, query text, name, description,
 * tags, execution schedule, parameters, and visualizations.
 */
export class QueriesService {
    constructor(readonly client: ApiClient) {}
    /**
     * Create a new query definition.
     *
     * Creates a new query definition. Queries created with this endpoint belong
     * to the authenticated user making the request.
     *
     * The `data_source_id` field specifies the ID of the SQL warehouse to run
     * this query against. You can use the Data Sources API to see a complete
     * list of available SQL warehouses. Or you can copy the `data_source_id`
     * from an existing query.
     *
     * **Note**: You cannot add a visualization until you create the query.
     */
    @withLogContext(ExposedLoggers.SDK)
    async create(
        request: model.QueryPostContent,
        @context context?: Context
    ): Promise<model.Query> {
        const path = "/api/2.0/preview/sql/queries";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as unknown as model.Query;
    }

    /**
     * Delete a query.
     *
     * Moves a query to the trash. Trashed queries immediately disappear from
     * searches and list views, and they cannot be used for alerts. The trash is
     * deleted after 30 days.
     */
    @withLogContext(ExposedLoggers.SDK)
    async delete(
        request: model.DeleteQueryRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.0/preview/sql/queries/${request.query_id}`;
        return (await this.client.request(
            path,
            "DELETE",
            request,
            context
        )) as unknown as model.EmptyResponse;
    }

    /**
     * Get a query definition.
     *
     * Retrieve a query object definition along with contextual permissions
     * information about the currently authenticated user.
     */
    @withLogContext(ExposedLoggers.SDK)
    async get(
        request: model.GetQueryRequest,
        @context context?: Context
    ): Promise<model.Query> {
        const path = `/api/2.0/preview/sql/queries/${request.query_id}`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as unknown as model.Query;
    }

    /**
     * Get a list of queries.
     *
     * Gets a list of queries. Optionally, this list can be filtered by a search
     * term.
     */
    @withLogContext(ExposedLoggers.SDK)
    async list(
        request: model.ListQueriesRequest,
        @context context?: Context
    ): Promise<model.QueryList> {
        const path = "/api/2.0/preview/sql/queries";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as unknown as model.QueryList;
    }

    /**
     * Restore a query.
     *
     * Restore a query that has been moved to the trash. A restored query appears
     * in list views and searches. You can use restored queries for alerts.
     */
    @withLogContext(ExposedLoggers.SDK)
    async restore(
        request: model.RestoreQueryRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.0/preview/sql/queries/trash/${request.query_id}`;
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as unknown as model.EmptyResponse;
    }

    /**
     * Change a query definition.
     *
     * Modify this query definition.
     *
     * **Note**: You cannot undo this operation.
     */
    @withLogContext(ExposedLoggers.SDK)
    async update(
        request: model.QueryPostContent,
        @context context?: Context
    ): Promise<model.Query> {
        const path = `/api/2.0/preview/sql/queries/${request.query_id}`;
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as unknown as model.Query;
    }
}

export class QueryHistoryRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("QueryHistory", method, message);
    }
}
export class QueryHistoryError extends ApiError {
    constructor(method: string, message?: string) {
        super("QueryHistory", method, message);
    }
}

/**
 * Access the history of queries through SQL warehouses.
 */
export class QueryHistoryService {
    constructor(readonly client: ApiClient) {}
    /**
     * List Queries.
     *
     * List the history of queries through SQL warehouses.
     *
     * You can filter by user ID, warehouse ID, status, and time range.
     */
    @withLogContext(ExposedLoggers.SDK)
    async list(
        request: model.ListQueryHistoryRequest,
        @context context?: Context
    ): Promise<model.ListQueriesResponse> {
        const path = "/api/2.0/sql/history/queries";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as unknown as model.ListQueriesResponse;
    }
}

export class WarehousesRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("Warehouses", method, message);
    }
}
export class WarehousesError extends ApiError {
    constructor(method: string, message?: string) {
        super("Warehouses", method, message);
    }
}

/**
 * A SQL warehouse is a compute resource that lets you run SQL commands on data
 * objects within Databricks SQL. Compute resources are infrastructure resources
 * that provide processing capabilities in the cloud.
 */
export class WarehousesService {
    constructor(readonly client: ApiClient) {}
    /**
     * Create a warehouse.
     *
     * Creates a new SQL warehouse.
     */
    @withLogContext(ExposedLoggers.SDK)
    async create(
        request: model.CreateWarehouseRequest,
        @context context?: Context
    ): Promise<model.CreateWarehouseResponse> {
        const path = "/api/2.0/sql/warehouses";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as unknown as model.CreateWarehouseResponse;
    }

    /**
     * create and wait to reach RUNNING state
     *  or fail on reaching STOPPED or DELETED state
     */
    @withLogContext(ExposedLoggers.SDK)
    async createAndWait(
        createWarehouseRequest: model.CreateWarehouseRequest,
        options?: {
            timeout?: Time;
            onProgress?: (
                newPollResponse: model.GetWarehouseResponse
            ) => Promise<void>;
        },
        @context context?: Context
    ): Promise<model.GetWarehouseResponse> {
        options = options || {};
        options.onProgress =
            options.onProgress || (async (newPollResponse) => {});
        const {timeout, onProgress} = options;
        const cancellationToken = context?.cancellationToken;

        const createWarehouseResponse = await this.create(
            createWarehouseRequest,
            context
        );

        return await retry<model.GetWarehouseResponse>({
            timeout,
            fn: async () => {
                const pollResponse = await this.get(
                    {
                        id: createWarehouseResponse.id!,
                    },
                    context
                );
                if (cancellationToken?.isCancellationRequested) {
                    context?.logger?.error(
                        "Warehouses.createAndWait: cancelled"
                    );
                    throw new WarehousesError("createAndWait", "cancelled");
                }
                await onProgress(pollResponse);
                const status = pollResponse.state;
                const statusMessage = pollResponse.health!.summary;
                switch (status) {
                    case "RUNNING": {
                        return pollResponse;
                    }
                    case "STOPPED":
                    case "DELETED": {
                        const errorMessage = `failed to reach RUNNING state, got ${status}: ${statusMessage}`;
                        context?.logger?.error(
                            `Warehouses.createAndWait: ${errorMessage}`
                        );
                        throw new WarehousesError(
                            "createAndWait",
                            errorMessage
                        );
                    }
                    default: {
                        const errorMessage = `failed to reach RUNNING state, got ${status}: ${statusMessage}`;
                        context?.logger?.error(
                            `Warehouses.createAndWait: retrying: ${errorMessage}`
                        );
                        throw new WarehousesRetriableError(
                            "createAndWait",
                            errorMessage
                        );
                    }
                }
            },
        });
    }

    /**
     * Delete a warehouse.
     *
     * Deletes a SQL warehouse.
     */
    @withLogContext(ExposedLoggers.SDK)
    async delete(
        request: model.DeleteWarehouseRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.0/sql/warehouses/${request.id}`;
        return (await this.client.request(
            path,
            "DELETE",
            request,
            context
        )) as unknown as model.EmptyResponse;
    }

    /**
     * delete and wait to reach DELETED state
     *
     */
    @withLogContext(ExposedLoggers.SDK)
    async deleteAndWait(
        deleteWarehouseRequest: model.DeleteWarehouseRequest,
        options?: {
            timeout?: Time;
            onProgress?: (
                newPollResponse: model.GetWarehouseResponse
            ) => Promise<void>;
        },
        @context context?: Context
    ): Promise<model.GetWarehouseResponse> {
        options = options || {};
        options.onProgress =
            options.onProgress || (async (newPollResponse) => {});
        const {timeout, onProgress} = options;
        const cancellationToken = context?.cancellationToken;

        await this.delete(deleteWarehouseRequest, context);

        return await retry<model.GetWarehouseResponse>({
            timeout,
            fn: async () => {
                const pollResponse = await this.get(
                    {
                        id: deleteWarehouseRequest.id!,
                    },
                    context
                );
                if (cancellationToken?.isCancellationRequested) {
                    context?.logger?.error(
                        "Warehouses.deleteAndWait: cancelled"
                    );
                    throw new WarehousesError("deleteAndWait", "cancelled");
                }
                await onProgress(pollResponse);
                const status = pollResponse.state;
                const statusMessage = pollResponse.health!.summary;
                switch (status) {
                    case "DELETED": {
                        return pollResponse;
                    }
                    default: {
                        const errorMessage = `failed to reach DELETED state, got ${status}: ${statusMessage}`;
                        context?.logger?.error(
                            `Warehouses.deleteAndWait: retrying: ${errorMessage}`
                        );
                        throw new WarehousesRetriableError(
                            "deleteAndWait",
                            errorMessage
                        );
                    }
                }
            },
        });
    }

    /**
     * Update a warehouse.
     *
     * Updates the configuration for a SQL warehouse.
     */
    @withLogContext(ExposedLoggers.SDK)
    async edit(
        request: model.EditWarehouseRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.0/sql/warehouses/${request.id}/edit`;
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as unknown as model.EmptyResponse;
    }

    /**
     * edit and wait to reach RUNNING state
     *  or fail on reaching STOPPED or DELETED state
     */
    @withLogContext(ExposedLoggers.SDK)
    async editAndWait(
        editWarehouseRequest: model.EditWarehouseRequest,
        options?: {
            timeout?: Time;
            onProgress?: (
                newPollResponse: model.GetWarehouseResponse
            ) => Promise<void>;
        },
        @context context?: Context
    ): Promise<model.GetWarehouseResponse> {
        options = options || {};
        options.onProgress =
            options.onProgress || (async (newPollResponse) => {});
        const {timeout, onProgress} = options;
        const cancellationToken = context?.cancellationToken;

        await this.edit(editWarehouseRequest, context);

        return await retry<model.GetWarehouseResponse>({
            timeout,
            fn: async () => {
                const pollResponse = await this.get(
                    {
                        id: editWarehouseRequest.id!,
                    },
                    context
                );
                if (cancellationToken?.isCancellationRequested) {
                    context?.logger?.error("Warehouses.editAndWait: cancelled");
                    throw new WarehousesError("editAndWait", "cancelled");
                }
                await onProgress(pollResponse);
                const status = pollResponse.state;
                const statusMessage = pollResponse.health!.summary;
                switch (status) {
                    case "RUNNING": {
                        return pollResponse;
                    }
                    case "STOPPED":
                    case "DELETED": {
                        const errorMessage = `failed to reach RUNNING state, got ${status}: ${statusMessage}`;
                        context?.logger?.error(
                            `Warehouses.editAndWait: ${errorMessage}`
                        );
                        throw new WarehousesError("editAndWait", errorMessage);
                    }
                    default: {
                        const errorMessage = `failed to reach RUNNING state, got ${status}: ${statusMessage}`;
                        context?.logger?.error(
                            `Warehouses.editAndWait: retrying: ${errorMessage}`
                        );
                        throw new WarehousesRetriableError(
                            "editAndWait",
                            errorMessage
                        );
                    }
                }
            },
        });
    }

    /**
     * Get warehouse info.
     *
     * Gets the information for a single SQL warehouse.
     */
    @withLogContext(ExposedLoggers.SDK)
    async get(
        request: model.GetWarehouseRequest,
        @context context?: Context
    ): Promise<model.GetWarehouseResponse> {
        const path = `/api/2.0/sql/warehouses/${request.id}`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as unknown as model.GetWarehouseResponse;
    }

    /**
     * get and wait to reach RUNNING state
     *  or fail on reaching STOPPED or DELETED state
     */
    @withLogContext(ExposedLoggers.SDK)
    async getAndWait(
        getWarehouseRequest: model.GetWarehouseRequest,
        options?: {
            timeout?: Time;
            onProgress?: (
                newPollResponse: model.GetWarehouseResponse
            ) => Promise<void>;
        },
        @context context?: Context
    ): Promise<model.GetWarehouseResponse> {
        options = options || {};
        options.onProgress =
            options.onProgress || (async (newPollResponse) => {});
        const {timeout, onProgress} = options;
        const cancellationToken = context?.cancellationToken;

        const getWarehouseResponse = await this.get(
            getWarehouseRequest,
            context
        );

        return await retry<model.GetWarehouseResponse>({
            timeout,
            fn: async () => {
                const pollResponse = await this.get(
                    {
                        id: getWarehouseResponse.id!,
                    },
                    context
                );
                if (cancellationToken?.isCancellationRequested) {
                    context?.logger?.error("Warehouses.getAndWait: cancelled");
                    throw new WarehousesError("getAndWait", "cancelled");
                }
                await onProgress(pollResponse);
                const status = pollResponse.state;
                const statusMessage = pollResponse.health!.summary;
                switch (status) {
                    case "RUNNING": {
                        return pollResponse;
                    }
                    case "STOPPED":
                    case "DELETED": {
                        const errorMessage = `failed to reach RUNNING state, got ${status}: ${statusMessage}`;
                        context?.logger?.error(
                            `Warehouses.getAndWait: ${errorMessage}`
                        );
                        throw new WarehousesError("getAndWait", errorMessage);
                    }
                    default: {
                        const errorMessage = `failed to reach RUNNING state, got ${status}: ${statusMessage}`;
                        context?.logger?.error(
                            `Warehouses.getAndWait: retrying: ${errorMessage}`
                        );
                        throw new WarehousesRetriableError(
                            "getAndWait",
                            errorMessage
                        );
                    }
                }
            },
        });
    }

    /**
     * Get the workspace configuration.
     *
     * Gets the workspace level configuration that is shared by all SQL
     * warehouses in a workspace.
     */
    @withLogContext(ExposedLoggers.SDK)
    async getWorkspaceWarehouseConfig(
        @context context?: Context
    ): Promise<model.GetWorkspaceWarehouseConfigResponse> {
        const path = "/api/2.0/sql/config/warehouses";
        return (await this.client.request(
            path,
            "GET",
            undefined,
            context
        )) as unknown as model.GetWorkspaceWarehouseConfigResponse;
    }

    /**
     * List warehouses.
     *
     * Lists all SQL warehouses that a user has manager permissions on.
     */
    @withLogContext(ExposedLoggers.SDK)
    async list(
        request: model.ListWarehousesRequest,
        @context context?: Context
    ): Promise<model.ListWarehousesResponse> {
        const path = "/api/2.0/sql/warehouses";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as unknown as model.ListWarehousesResponse;
    }

    /**
     * Set the workspace configuration.
     *
     * Sets the workspace level configuration that is shared by all SQL
     * warehouses in a workspace.
     */
    @withLogContext(ExposedLoggers.SDK)
    async setWorkspaceWarehouseConfig(
        request: model.SetWorkspaceWarehouseConfigRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = "/api/2.0/sql/config/warehouses";
        return (await this.client.request(
            path,
            "PUT",
            request,
            context
        )) as unknown as model.EmptyResponse;
    }

    /**
     * Start a warehouse.
     *
     * Starts a SQL warehouse.
     */
    @withLogContext(ExposedLoggers.SDK)
    async start(
        request: model.StartRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.0/sql/warehouses/${request.id}/start`;
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as unknown as model.EmptyResponse;
    }

    /**
     * start and wait to reach RUNNING state
     *  or fail on reaching STOPPED or DELETED state
     */
    @withLogContext(ExposedLoggers.SDK)
    async startAndWait(
        startRequest: model.StartRequest,
        options?: {
            timeout?: Time;
            onProgress?: (
                newPollResponse: model.GetWarehouseResponse
            ) => Promise<void>;
        },
        @context context?: Context
    ): Promise<model.GetWarehouseResponse> {
        options = options || {};
        options.onProgress =
            options.onProgress || (async (newPollResponse) => {});
        const {timeout, onProgress} = options;
        const cancellationToken = context?.cancellationToken;

        await this.start(startRequest, context);

        return await retry<model.GetWarehouseResponse>({
            timeout,
            fn: async () => {
                const pollResponse = await this.get(
                    {
                        id: startRequest.id!,
                    },
                    context
                );
                if (cancellationToken?.isCancellationRequested) {
                    context?.logger?.error(
                        "Warehouses.startAndWait: cancelled"
                    );
                    throw new WarehousesError("startAndWait", "cancelled");
                }
                await onProgress(pollResponse);
                const status = pollResponse.state;
                const statusMessage = pollResponse.health!.summary;
                switch (status) {
                    case "RUNNING": {
                        return pollResponse;
                    }
                    case "STOPPED":
                    case "DELETED": {
                        const errorMessage = `failed to reach RUNNING state, got ${status}: ${statusMessage}`;
                        context?.logger?.error(
                            `Warehouses.startAndWait: ${errorMessage}`
                        );
                        throw new WarehousesError("startAndWait", errorMessage);
                    }
                    default: {
                        const errorMessage = `failed to reach RUNNING state, got ${status}: ${statusMessage}`;
                        context?.logger?.error(
                            `Warehouses.startAndWait: retrying: ${errorMessage}`
                        );
                        throw new WarehousesRetriableError(
                            "startAndWait",
                            errorMessage
                        );
                    }
                }
            },
        });
    }

    /**
     * Stop a warehouse.
     *
     * Stops a SQL warehouse.
     */
    @withLogContext(ExposedLoggers.SDK)
    async stop(
        request: model.StopRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.0/sql/warehouses/${request.id}/stop`;
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as unknown as model.EmptyResponse;
    }

    /**
     * stop and wait to reach STOPPED state
     *
     */
    @withLogContext(ExposedLoggers.SDK)
    async stopAndWait(
        stopRequest: model.StopRequest,
        options?: {
            timeout?: Time;
            onProgress?: (
                newPollResponse: model.GetWarehouseResponse
            ) => Promise<void>;
        },
        @context context?: Context
    ): Promise<model.GetWarehouseResponse> {
        options = options || {};
        options.onProgress =
            options.onProgress || (async (newPollResponse) => {});
        const {timeout, onProgress} = options;
        const cancellationToken = context?.cancellationToken;

        await this.stop(stopRequest, context);

        return await retry<model.GetWarehouseResponse>({
            timeout,
            fn: async () => {
                const pollResponse = await this.get(
                    {
                        id: stopRequest.id!,
                    },
                    context
                );
                if (cancellationToken?.isCancellationRequested) {
                    context?.logger?.error("Warehouses.stopAndWait: cancelled");
                    throw new WarehousesError("stopAndWait", "cancelled");
                }
                await onProgress(pollResponse);
                const status = pollResponse.state;
                const statusMessage = pollResponse.health!.summary;
                switch (status) {
                    case "STOPPED": {
                        return pollResponse;
                    }
                    default: {
                        const errorMessage = `failed to reach STOPPED state, got ${status}: ${statusMessage}`;
                        context?.logger?.error(
                            `Warehouses.stopAndWait: retrying: ${errorMessage}`
                        );
                        throw new WarehousesRetriableError(
                            "stopAndWait",
                            errorMessage
                        );
                    }
                }
            },
        });
    }
}
