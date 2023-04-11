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
import {Waiter, asWaiter} from "../../wait";

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
 * its result, and notifies one or more users and/or notification destinations if
 * the condition was met.
 */
export class AlertsService {
    constructor(readonly client: ApiClient) {}

    @withLogContext(ExposedLoggers.SDK)
    private async _create(
        request: model.CreateAlert,
        @context context?: Context
    ): Promise<model.Alert> {
        const path = "/api/2.0/preview/sql/alerts";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.Alert;
    }

    /**
     * Create an alert.
     *
     * Creates an alert. An alert is a Databricks SQL object that periodically
     * runs a query, evaluates a condition of its result, and notifies users or
     * notification destinations if the condition was met.
     */
    @withLogContext(ExposedLoggers.SDK)
    async create(
        request: model.CreateAlert,
        @context context?: Context
    ): Promise<model.Alert> {
        return await this._create(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _delete(
        request: model.DeleteAlertRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.0/preview/sql/alerts/${request.alert_id}`;
        return (await this.client.request(
            path,
            "DELETE",
            request,
            context
        )) as model.EmptyResponse;
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
        return await this._delete(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _get(
        request: model.GetAlertRequest,
        @context context?: Context
    ): Promise<model.Alert> {
        const path = `/api/2.0/preview/sql/alerts/${request.alert_id}`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.Alert;
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
        return await this._get(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _list(
        @context context?: Context
    ): Promise<Array<model.Alert>> {
        const path = "/api/2.0/preview/sql/alerts";
        return (await this.client.request(
            path,
            "GET",
            undefined,
            context
        )) as Array<model.Alert>;
    }

    /**
     * Get alerts.
     *
     * Gets a list of alerts.
     */
    @withLogContext(ExposedLoggers.SDK)
    async list(@context context?: Context): Promise<Array<model.Alert>> {
        return await this._list(context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _update(
        request: model.EditAlert,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.0/preview/sql/alerts/${request.alert_id}`;
        return (await this.client.request(
            path,
            "PUT",
            request,
            context
        )) as model.EmptyResponse;
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
        return await this._update(request, context);
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

    @withLogContext(ExposedLoggers.SDK)
    private async _create(
        request: model.CreateDashboardRequest,
        @context context?: Context
    ): Promise<model.Dashboard> {
        const path = "/api/2.0/preview/sql/dashboards";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.Dashboard;
    }

    /**
     * Create a dashboard object.
     */
    @withLogContext(ExposedLoggers.SDK)
    async create(
        request: model.CreateDashboardRequest,
        @context context?: Context
    ): Promise<model.Dashboard> {
        return await this._create(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _delete(
        request: model.DeleteDashboardRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.0/preview/sql/dashboards/${request.dashboard_id}`;
        return (await this.client.request(
            path,
            "DELETE",
            request,
            context
        )) as model.EmptyResponse;
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
        return await this._delete(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _get(
        request: model.GetDashboardRequest,
        @context context?: Context
    ): Promise<model.Dashboard> {
        const path = `/api/2.0/preview/sql/dashboards/${request.dashboard_id}`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.Dashboard;
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
        return await this._get(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _list(
        request: model.ListDashboardsRequest,
        @context context?: Context
    ): Promise<model.ListResponse> {
        const path = "/api/2.0/preview/sql/dashboards";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.ListResponse;
    }

    /**
     * Get dashboard objects.
     *
     * Fetch a paginated list of dashboard objects.
     */
    @withLogContext(ExposedLoggers.SDK)
    async *list(
        request: model.ListDashboardsRequest,
        @context context?: Context
    ): AsyncIterable<model.Dashboard> {
        // deduplicate items that may have been added during iteration
        const seen: Record<string, boolean> = {};
        request.page = 1; // start iterating from the first page

        while (true) {
            const response = await this._list(request, context);
            if (
                context?.cancellationToken &&
                context?.cancellationToken.isCancellationRequested
            ) {
                break;
            }

            if (!response.results || response.results.length === 0) {
                break;
            }

            for (const v of response.results) {
                const id = v.id;
                if (id) {
                    if (seen[id]) {
                        // item was added during iteration
                        continue;
                    }
                    seen[id] = true;
                }
                yield v;
            }

            request.page += 1;
        }
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _restore(
        request: model.RestoreDashboardRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.0/preview/sql/dashboards/trash/${request.dashboard_id}`;
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.EmptyResponse;
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
        return await this._restore(request, context);
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

    @withLogContext(ExposedLoggers.SDK)
    private async _list(
        @context context?: Context
    ): Promise<Array<model.DataSource>> {
        const path = "/api/2.0/preview/sql/data_sources";
        return (await this.client.request(
            path,
            "GET",
            undefined,
            context
        )) as Array<model.DataSource>;
    }

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
        return await this._list(context);
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
 * :method:permissions/set. However, this exposes only one endpoint, which gets
 * the Access Control List for a given object. You cannot modify any permissions
 * using this API.
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

    @withLogContext(ExposedLoggers.SDK)
    private async _get(
        request: model.GetDbsqlPermissionRequest,
        @context context?: Context
    ): Promise<model.GetResponse> {
        const path = `/api/2.0/preview/sql/permissions/${request.objectType}/${request.objectId}`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.GetResponse;
    }

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
        return await this._get(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _set(
        request: model.SetRequest,
        @context context?: Context
    ): Promise<model.SetResponse> {
        const path = `/api/2.0/preview/sql/permissions/${request.objectType}/${request.objectId}`;
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.SetResponse;
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
        return await this._set(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _transferOwnership(
        request: model.TransferOwnershipRequest,
        @context context?: Context
    ): Promise<model.Success> {
        const path = `/api/2.0/preview/sql/permissions/${request.objectType}/${request.objectId}/transfer`;
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.Success;
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
        return await this._transferOwnership(request, context);
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
 * tags, parameters, and visualizations.
 */
export class QueriesService {
    constructor(readonly client: ApiClient) {}

    @withLogContext(ExposedLoggers.SDK)
    private async _create(
        request: model.QueryPostContent,
        @context context?: Context
    ): Promise<model.Query> {
        const path = "/api/2.0/preview/sql/queries";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.Query;
    }

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
        return await this._create(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _delete(
        request: model.DeleteQueryRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.0/preview/sql/queries/${request.query_id}`;
        return (await this.client.request(
            path,
            "DELETE",
            request,
            context
        )) as model.EmptyResponse;
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
        return await this._delete(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _get(
        request: model.GetQueryRequest,
        @context context?: Context
    ): Promise<model.Query> {
        const path = `/api/2.0/preview/sql/queries/${request.query_id}`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.Query;
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
        return await this._get(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _list(
        request: model.ListQueriesRequest,
        @context context?: Context
    ): Promise<model.QueryList> {
        const path = "/api/2.0/preview/sql/queries";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.QueryList;
    }

    /**
     * Get a list of queries.
     *
     * Gets a list of queries. Optionally, this list can be filtered by a search
     * term.
     */
    @withLogContext(ExposedLoggers.SDK)
    async *list(
        request: model.ListQueriesRequest,
        @context context?: Context
    ): AsyncIterable<model.Query> {
        // deduplicate items that may have been added during iteration
        const seen: Record<string, boolean> = {};
        request.page = 1; // start iterating from the first page

        while (true) {
            const response = await this._list(request, context);
            if (
                context?.cancellationToken &&
                context?.cancellationToken.isCancellationRequested
            ) {
                break;
            }

            if (!response.results || response.results.length === 0) {
                break;
            }

            for (const v of response.results) {
                const id = v.id;
                if (id) {
                    if (seen[id]) {
                        // item was added during iteration
                        continue;
                    }
                    seen[id] = true;
                }
                yield v;
            }

            request.page += 1;
        }
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _restore(
        request: model.RestoreQueryRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.0/preview/sql/queries/trash/${request.query_id}`;
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.EmptyResponse;
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
        return await this._restore(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _update(
        request: model.QueryEditContent,
        @context context?: Context
    ): Promise<model.Query> {
        const path = `/api/2.0/preview/sql/queries/${request.query_id}`;
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.Query;
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
        request: model.QueryEditContent,
        @context context?: Context
    ): Promise<model.Query> {
        return await this._update(request, context);
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

    @withLogContext(ExposedLoggers.SDK)
    private async _list(
        request: model.ListQueryHistoryRequest,
        @context context?: Context
    ): Promise<model.ListQueriesResponse> {
        const path = "/api/2.0/sql/history/queries";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.ListQueriesResponse;
    }

    /**
     * List Queries.
     *
     * List the history of queries through SQL warehouses.
     *
     * You can filter by user ID, warehouse ID, status, and time range.
     */
    @withLogContext(ExposedLoggers.SDK)
    async *list(
        request: model.ListQueryHistoryRequest,
        @context context?: Context
    ): AsyncIterable<model.QueryInfo> {
        while (true) {
            const response = await this._list(request, context);
            if (
                context?.cancellationToken &&
                context?.cancellationToken.isCancellationRequested
            ) {
                break;
            }

            if (!response.res || response.res.length === 0) {
                break;
            }

            for (const v of response.res) {
                yield v;
            }

            request.page_token = response.next_page_token;
            if (!response.next_page_token) {
                break;
            }
        }
    }
}

export class StatementExecutionRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("StatementExecution", method, message);
    }
}
export class StatementExecutionError extends ApiError {
    constructor(method: string, message?: string) {
        super("StatementExecution", method, message);
    }
}

/**
 * The SQL Statement Execution API manages the execution of arbitrary SQL
 * statements and the fetching of result data.
 *
 * **Release status**
 *
 * This feature is in [Public Preview].
 *
 * **Getting started**
 *
 * We suggest beginning with the [SQL Statement Execution API tutorial].
 *
 * **Overview of statement execution and result fetching**
 *
 * Statement execution begins by issuing a
 * :method:statementexecution/executeStatement request with a valid SQL statement
 * and warehouse ID, along with optional parameters such as the data catalog and
 * output format.
 *
 * When submitting the statement, the call can behave synchronously or
 * asynchronously, based on the `wait_timeout` setting. When set between 5-50
 * seconds (default: 10) the call behaves synchronously and waits for results up
 * to the specified timeout; when set to `0s`, the call is asynchronous and
 * responds immediately with a statement ID that can be used to poll for status
 * or fetch the results in a separate call.
 *
 * **Call mode: synchronous**
 *
 * In synchronous mode, when statement execution completes within the `wait
 * timeout`, the result data is returned directly in the response. This response
 * will contain `statement_id`, `status`, `manifest`, and `result` fields. The
 * `status` field confirms success whereas the `manifest` field contains the
 * result data column schema and metadata about the result set. The `result`
 * field contains the first chunk of result data according to the specified
 * `disposition`, and links to fetch any remaining chunks.
 *
 * If the execution does not complete before `wait_timeout`, the setting
 * `on_wait_timeout` determines how the system responds.
 *
 * By default, `on_wait_timeout=CONTINUE`, and after reaching `wait_timeout`, a
 * response is returned and statement execution continues asynchronously. The
 * response will contain only `statement_id` and `status` fields, and the caller
 * must now follow the flow described for asynchronous call mode to poll and
 * fetch the result.
 *
 * Alternatively, `on_wait_timeout` can also be set to `CANCEL`; in this case if
 * the timeout is reached before execution completes, the underlying statement
 * execution is canceled, and a `CANCELED` status is returned in the response.
 *
 * **Call mode: asynchronous**
 *
 * In asynchronous mode, or after a timed-out synchronous request continues, a
 * `statement_id` and `status` will be returned. In this case polling
 * :method:statementexecution/getStatement calls are required to fetch the result
 * and metadata.
 *
 * Next, a caller must poll until execution completes (`SUCCEEDED`, `FAILED`,
 * etc.) by issuing :method:statementexecution/getStatement requests for the
 * given `statement_id`.
 *
 * When execution has succeeded, the response will contain `status`, `manifest`,
 * and `result` fields. These fields and the structure are identical to those in
 * the response to a successful synchronous submission. The `result` field will
 * contain the first chunk of result data, either `INLINE` or as `EXTERNAL_LINKS`
 * depending on `disposition`. Additional chunks of result data can be fetched by
 * checking for the presence of the `next_chunk_internal_link` field, and
 * iteratively `GET` those paths until that field is unset: `GET
 * https://$DATABRICKS_HOST/{next_chunk_internal_link}`.
 *
 * **Fetching result data: format and disposition**
 *
 * Result data from statement execution is available in two formats: JSON, and
 * [Apache Arrow Columnar]. Statements producing a result set smaller than 16 MiB
 * can be fetched as `format=JSON_ARRAY`, using the `disposition=INLINE`. When a
 * statement executed in `INLINE` disposition exceeds this limit, the execution
 * is aborted, and no result can be fetched. Using `format=ARROW_STREAM` and
 * `disposition=EXTERNAL_LINKS` allows large result sets, and with higher
 * throughput.
 *
 * The API uses defaults of `format=JSON_ARRAY` and `disposition=INLINE`. `We
 * advise explicitly setting format and disposition in all production use cases.
 *
 * **Statement response: statement_id, status, manifest, and result**
 *
 * The base call :method:statementexecution/getStatement returns a single
 * response combining `statement_id`, `status`, a result `manifest`, and a
 * `result` data chunk or link, depending on the `disposition`. The `manifest`
 * contains the result schema definition and the result summary metadata. When
 * using `disposition=EXTERNAL_LINKS`, it also contains a full listing of all
 * chunks and their summary metadata.
 *
 * **Use case: small result sets with INLINE + JSON_ARRAY**
 *
 * For flows that generate small and predictable result sets (<= 16 MiB),
 * `INLINE` downloads of `JSON_ARRAY` result data are typically the simplest way
 * to execute and fetch result data.
 *
 * When the result set with `disposition=INLINE` is larger, the result can be
 * transferred in chunks. After receiving the initial chunk with
 * :method:statementexecution/executeStatement or
 * :method:statementexecution/getStatement subsequent calls are required to
 * iteratively fetch each chunk. Each result response contains a link to the next
 * chunk, when there are additional chunks to fetch; it can be found in the field
 * `.next_chunk_internal_link`. This link is an absolute `path` to be joined with
 * your `$DATABRICKS_HOST`, and of the form
 * `/api/2.0/sql/statements/{statement_id}/result/chunks/{chunk_index}`. The next
 * chunk can be fetched by issuing a
 * :method:statementexecution/getStatementResultChunkN request.
 *
 * When using this mode, each chunk may be fetched once, and in order. A chunk
 * without a field `next_chunk_internal_link` indicates the last chunk was
 * reached and all chunks have been fetched from the result set.
 *
 * **Use case: large result sets with EXTERNAL_LINKS + ARROW_STREAM**
 *
 * Using `EXTERNAL_LINKS` to fetch result data in Arrow format allows you to
 * fetch large result sets efficiently. The primary difference from using
 * `INLINE` disposition is that fetched result chunks contain resolved
 * `external_links` URLs, which can be fetched with standard HTTP.
 *
 * **Presigned URLs**
 *
 * External links point to data stored within your workspace's internal DBFS, in
 * the form of a presigned URL. The URLs are valid for only a short period, <= 15
 * minutes. Alongside each `external_link` is an expiration field indicating the
 * time at which the URL is no longer valid. In `EXTERNAL_LINKS` mode, chunks can
 * be resolved and fetched multiple times and in parallel.
 *
 * ----
 *
 * ### **Warning: We recommend you protect the URLs in the EXTERNAL_LINKS.**
 *
 * When using the EXTERNAL_LINKS disposition, a short-lived pre-signed URL is
 * generated, which the client can use to download the result chunk directly from
 * cloud storage. As the short-lived credential is embedded in a pre-signed URL,
 * this URL should be protected.
 *
 * Since pre-signed URLs are generated with embedded temporary credentials, you
 * need to remove the authorization header from the fetch requests.
 *
 * ----
 *
 * Similar to `INLINE` mode, callers can iterate through the result set, by using
 * the `next_chunk_internal_link` field. Each internal link response will contain
 * an external link to the raw chunk data, and additionally contain the
 * `next_chunk_internal_link` if there are more chunks.
 *
 * Unlike `INLINE` mode, when using `EXTERNAL_LINKS`, chunks may be fetched out
 * of order, and in parallel to achieve higher throughput.
 *
 * **Limits and limitations**
 *
 * Note: All byte limits are calculated based on internal storage metrics and
 * will not match byte counts of actual payloads.
 *
 * - Statements with `disposition=INLINE` are limited to 16 MiB and will abort
 * when this limit is exceeded. - Statements with `disposition=EXTERNAL_LINKS`
 * are limited to 100 GiB. - The maximum query text size is 16 MiB. - Cancelation
 * may silently fail. A successful response from a cancel request indicates that
 * the cancel request was successfully received and sent to the processing
 * engine. However, for example, an outstanding statement may complete execution
 * during signal delivery, with the cancel signal arriving too late to be
 * meaningful. Polling for status until a terminal state is reached is a reliable
 * way to determine the final state. - Wait timeouts are approximate, occur
 * server-side, and cannot account for caller delays, network latency from caller
 * to service, and similarly. - After a statement has been submitted and a
 * statement_id is returned, that statement's status and result will
 * automatically close after either of 2 conditions: - The last result chunk is
 * fetched (or resolved to an external link). - Ten (10) minutes pass with no
 * calls to get status or fetch result data. Best practice: in asynchronous
 * clients, poll for status regularly (and with backoff) to keep the statement
 * open and alive. - After a `CANCEL` or `CLOSE` operation, the statement will no
 * longer be visible from the API which means that a subsequent poll request may
 * return an HTTP 404 NOT FOUND error. - After fetching the last result chunk
 * (including chunk_index=0), the statement is closed; shortly after closure the
 * statement will no longer be visible to the API and so, further calls such as
 * :method:statementexecution/getStatement may return an HTTP 404 NOT FOUND
 * error.
 *
 * [Apache Arrow Columnar]: https://arrow.apache.org/overview/
 * [Public Preview]: https://docs.databricks.com/release-notes/release-types.html
 * [SQL Statement Execution API tutorial]: https://docs.databricks.com/sql/api/sql-execution-tutorial.html
 */
export class StatementExecutionService {
    constructor(readonly client: ApiClient) {}

    @withLogContext(ExposedLoggers.SDK)
    private async _cancelExecution(
        request: model.CancelExecutionRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.0/sql/statements/${request.statement_id}/cancel`;
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Cancel statement execution.
     *
     * Requests that an executing statement be canceled. Callers must poll for
     * status to see the terminal state.
     */
    @withLogContext(ExposedLoggers.SDK)
    async cancelExecution(
        request: model.CancelExecutionRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._cancelExecution(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _executeStatement(
        request: model.ExecuteStatementRequest,
        @context context?: Context
    ): Promise<model.ExecuteStatementResponse> {
        const path = "/api/2.0/sql/statements/";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.ExecuteStatementResponse;
    }

    /**
     * Execute a SQL statement.
     *
     * Execute a SQL statement, and if flagged as such, await its result for a
     * specified time.
     */
    @withLogContext(ExposedLoggers.SDK)
    async executeStatement(
        request: model.ExecuteStatementRequest,
        @context context?: Context
    ): Promise<model.ExecuteStatementResponse> {
        return await this._executeStatement(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _getStatement(
        request: model.GetStatementRequest,
        @context context?: Context
    ): Promise<model.GetStatementResponse> {
        const path = `/api/2.0/sql/statements/${request.statement_id}`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.GetStatementResponse;
    }

    /**
     * Get status, manifest, and result first chunk.
     *
     * Polls for the statement's status; when `status.state=SUCCEEDED` it will
     * also return the result manifest and the first chunk of the result data.
     *
     * **NOTE** This call currently may take up to 5 seconds to get the latest
     * status and result.
     */
    @withLogContext(ExposedLoggers.SDK)
    async getStatement(
        request: model.GetStatementRequest,
        @context context?: Context
    ): Promise<model.GetStatementResponse> {
        return await this._getStatement(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _getStatementResultChunkN(
        request: model.GetStatementResultChunkNRequest,
        @context context?: Context
    ): Promise<model.ResultData> {
        const path = `/api/2.0/sql/statements/${request.statement_id}/result/chunks/${request.chunk_index}`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.ResultData;
    }

    /**
     * Get result chunk by index.
     *
     * After statement execution has SUCCEEDED, result data can be fetched by
     * chunks.
     *
     * The first chunk (`chunk_index=0`) is typically fetched through
     * `getStatementResult`, and subsequent chunks with this call. The response
     * structure is identical to the nested `result` element described in
     * getStatementResult, and similarly includes `next_chunk_index` and
     * `next_chunk_internal_link` for simple iteration through the result set.
     */
    @withLogContext(ExposedLoggers.SDK)
    async getStatementResultChunkN(
        request: model.GetStatementResultChunkNRequest,
        @context context?: Context
    ): Promise<model.ResultData> {
        return await this._getStatementResultChunkN(request, context);
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

    @withLogContext(ExposedLoggers.SDK)
    private async _create(
        request: model.CreateWarehouseRequest,
        @context context?: Context
    ): Promise<model.CreateWarehouseResponse> {
        const path = "/api/2.0/sql/warehouses";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.CreateWarehouseResponse;
    }

    /**
     * Create a warehouse.
     *
     * Creates a new SQL warehouse.
     */
    @withLogContext(ExposedLoggers.SDK)
    async create(
        createWarehouseRequest: model.CreateWarehouseRequest,
        @context context?: Context
    ): Promise<
        Waiter<model.CreateWarehouseResponse, model.GetWarehouseResponse>
    > {
        const cancellationToken = context?.cancellationToken;

        const createWarehouseResponse = await this._create(
            createWarehouseRequest,
            context
        );

        return asWaiter(createWarehouseResponse, async (options) => {
            options = options || {};
            options.onProgress =
                options.onProgress || (async (newPollResponse) => {});
            const {timeout, onProgress} = options;

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
        });
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _delete(
        request: model.DeleteWarehouseRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.0/sql/warehouses/${request.id}`;
        return (await this.client.request(
            path,
            "DELETE",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Delete a warehouse.
     *
     * Deletes a SQL warehouse.
     */
    @withLogContext(ExposedLoggers.SDK)
    async delete(
        deleteWarehouseRequest: model.DeleteWarehouseRequest,
        @context context?: Context
    ): Promise<Waiter<model.EmptyResponse, model.GetWarehouseResponse>> {
        const cancellationToken = context?.cancellationToken;

        await this._delete(deleteWarehouseRequest, context);

        return asWaiter(null, async (options) => {
            options = options || {};
            options.onProgress =
                options.onProgress || (async (newPollResponse) => {});
            const {timeout, onProgress} = options;

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
        });
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _edit(
        request: model.EditWarehouseRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.0/sql/warehouses/${request.id}/edit`;
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Update a warehouse.
     *
     * Updates the configuration for a SQL warehouse.
     */
    @withLogContext(ExposedLoggers.SDK)
    async edit(
        editWarehouseRequest: model.EditWarehouseRequest,
        @context context?: Context
    ): Promise<Waiter<model.EmptyResponse, model.GetWarehouseResponse>> {
        const cancellationToken = context?.cancellationToken;

        await this._edit(editWarehouseRequest, context);

        return asWaiter(null, async (options) => {
            options = options || {};
            options.onProgress =
                options.onProgress || (async (newPollResponse) => {});
            const {timeout, onProgress} = options;

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
                        context?.logger?.error(
                            "Warehouses.editAndWait: cancelled"
                        );
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
                            throw new WarehousesError(
                                "editAndWait",
                                errorMessage
                            );
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
        });
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _get(
        request: model.GetWarehouseRequest,
        @context context?: Context
    ): Promise<model.GetWarehouseResponse> {
        const path = `/api/2.0/sql/warehouses/${request.id}`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.GetWarehouseResponse;
    }

    /**
     * Get warehouse info.
     *
     * Gets the information for a single SQL warehouse.
     */
    @withLogContext(ExposedLoggers.SDK)
    async get(
        getWarehouseRequest: model.GetWarehouseRequest,
        @context context?: Context
    ): Promise<Waiter<model.GetWarehouseResponse, model.GetWarehouseResponse>> {
        const cancellationToken = context?.cancellationToken;

        const getWarehouseResponse = await this._get(
            getWarehouseRequest,
            context
        );

        return asWaiter(getWarehouseResponse, async (options) => {
            options = options || {};
            options.onProgress =
                options.onProgress || (async (newPollResponse) => {});
            const {timeout, onProgress} = options;

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
                        context?.logger?.error(
                            "Warehouses.getAndWait: cancelled"
                        );
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
                            throw new WarehousesError(
                                "getAndWait",
                                errorMessage
                            );
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
        });
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _getWorkspaceWarehouseConfig(
        @context context?: Context
    ): Promise<model.GetWorkspaceWarehouseConfigResponse> {
        const path = "/api/2.0/sql/config/warehouses";
        return (await this.client.request(
            path,
            "GET",
            undefined,
            context
        )) as model.GetWorkspaceWarehouseConfigResponse;
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
        return await this._getWorkspaceWarehouseConfig(context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _list(
        request: model.ListWarehousesRequest,
        @context context?: Context
    ): Promise<model.ListWarehousesResponse> {
        const path = "/api/2.0/sql/warehouses";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.ListWarehousesResponse;
    }

    /**
     * List warehouses.
     *
     * Lists all SQL warehouses that a user has manager permissions on.
     */
    @withLogContext(ExposedLoggers.SDK)
    async *list(
        request: model.ListWarehousesRequest,
        @context context?: Context
    ): AsyncIterable<model.EndpointInfo> {
        const response = (await this._list(request, context)).warehouses;
        for (const v of response || []) {
            yield v;
        }
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _setWorkspaceWarehouseConfig(
        request: model.SetWorkspaceWarehouseConfigRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = "/api/2.0/sql/config/warehouses";
        return (await this.client.request(
            path,
            "PUT",
            request,
            context
        )) as model.EmptyResponse;
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
        return await this._setWorkspaceWarehouseConfig(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _start(
        request: model.StartRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.0/sql/warehouses/${request.id}/start`;
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Start a warehouse.
     *
     * Starts a SQL warehouse.
     */
    @withLogContext(ExposedLoggers.SDK)
    async start(
        startRequest: model.StartRequest,
        @context context?: Context
    ): Promise<Waiter<model.EmptyResponse, model.GetWarehouseResponse>> {
        const cancellationToken = context?.cancellationToken;

        await this._start(startRequest, context);

        return asWaiter(null, async (options) => {
            options = options || {};
            options.onProgress =
                options.onProgress || (async (newPollResponse) => {});
            const {timeout, onProgress} = options;

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
                            throw new WarehousesError(
                                "startAndWait",
                                errorMessage
                            );
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
        });
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _stop(
        request: model.StopRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.0/sql/warehouses/${request.id}/stop`;
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Stop a warehouse.
     *
     * Stops a SQL warehouse.
     */
    @withLogContext(ExposedLoggers.SDK)
    async stop(
        stopRequest: model.StopRequest,
        @context context?: Context
    ): Promise<Waiter<model.EmptyResponse, model.GetWarehouseResponse>> {
        const cancellationToken = context?.cancellationToken;

        await this._stop(stopRequest, context);

        return asWaiter(null, async (options) => {
            options = options || {};
            options.onProgress =
                options.onProgress || (async (newPollResponse) => {});
            const {timeout, onProgress} = options;

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
                        context?.logger?.error(
                            "Warehouses.stopAndWait: cancelled"
                        );
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
        });
    }
}
