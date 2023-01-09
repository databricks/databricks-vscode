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

export class BillableUsageRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("BillableUsage", method, message);
    }
}
export class BillableUsageError extends ApiError {
    constructor(method: string, message?: string) {
        super("BillableUsage", method, message);
    }
}

/**
 * This API allows you to download billable usage logs for the specified account
 * and date range. This feature works with all account types.
 */
export class BillableUsageService {
    constructor(readonly client: ApiClient) {}
    /**
     * Return billable usage logs.
     *
     * Returns billable usage logs in CSV format for the specified account and
     * date range. For the data schema, see [CSV file schema]. Note that this
     * method might take multiple seconds to complete.
     *
     * [CSV file schema]: https://docs.databricks.com/administration-guide/account-settings/usage-analysis.html#schema
     */
    @withLogContext(ExposedLoggers.SDK)
    async download(
        request: model.DownloadRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.0/accounts/${this.client.accountId}/usage/download`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.EmptyResponse;
    }
}

export class BudgetsRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("Budgets", method, message);
    }
}
export class BudgetsError extends ApiError {
    constructor(method: string, message?: string) {
        super("Budgets", method, message);
    }
}

/**
 * These APIs manage budget configuration including notifications for exceeding a
 * budget for a period. They can also retrieve the status of each budget.
 */
export class BudgetsService {
    constructor(readonly client: ApiClient) {}
    /**
     * Create a new budget.
     *
     * Creates a new budget in the specified account.
     */
    @withLogContext(ExposedLoggers.SDK)
    async create(
        request: model.WrappedBudget,
        @context context?: Context
    ): Promise<model.WrappedBudgetWithStatus> {
        const path = `/api/2.0/accounts/${this.client.accountId}/budget`;
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.WrappedBudgetWithStatus;
    }

    /**
     * Delete budget.
     *
     * Deletes the budget specified by its UUID.
     */
    @withLogContext(ExposedLoggers.SDK)
    async delete(
        request: model.DeleteBudgetRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.0/accounts/${this.client.accountId}/budget/${request.budget_id}`;
        return (await this.client.request(
            path,
            "DELETE",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Get budget and its status.
     *
     * Gets the budget specified by its UUID, including noncumulative status for
     * each day that the budget is configured to include.
     */
    @withLogContext(ExposedLoggers.SDK)
    async get(
        request: model.GetBudgetRequest,
        @context context?: Context
    ): Promise<model.WrappedBudgetWithStatus> {
        const path = `/api/2.0/accounts/${this.client.accountId}/budget/${request.budget_id}`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.WrappedBudgetWithStatus;
    }

    /**
     * Get all budgets.
     *
     * Gets all budgets associated with this account, including noncumulative
     * status for each day that the budget is configured to include.
     */
    @withLogContext(ExposedLoggers.SDK)
    async list(@context context?: Context): Promise<model.BudgetList> {
        const path = `/api/2.0/accounts/${this.client.accountId}/budget`;
        return (await this.client.request(
            path,
            "GET",
            undefined,
            context
        )) as model.BudgetList;
    }

    /**
     * Modify budget.
     *
     * Modifies a budget in this account. Budget properties are completely
     * overwritten.
     */
    @withLogContext(ExposedLoggers.SDK)
    async update(
        request: model.WrappedBudget,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.0/accounts/${this.client.accountId}/budget/${request.budget_id}`;
        return (await this.client.request(
            path,
            "PATCH",
            request,
            context
        )) as model.EmptyResponse;
    }
}

export class LogDeliveryRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("LogDelivery", method, message);
    }
}
export class LogDeliveryError extends ApiError {
    constructor(method: string, message?: string) {
        super("LogDelivery", method, message);
    }
}

/**
 * These APIs manage log delivery configurations for this account. The two
 * supported log types for this API are _billable usage logs_ and _audit logs_.
 * This feature is in Public Preview. This feature works with all account ID
 * types.
 *
 * Log delivery works with all account types. However, if your account is on the
 * E2 version of the platform or on a select custom plan that allows multiple
 * workspaces per account, you can optionally configure different storage
 * destinations for each workspace. Log delivery status is also provided to know
 * the latest status of log delivery attempts. The high-level flow of billable
 * usage delivery:
 *
 * 1. **Create storage**: In AWS, [create a new AWS S3 bucket] with a specific
 * bucket policy. Using Databricks APIs, call the Account API to create a
 * [storage configuration object](#operation/create-storage-config) that uses the
 * bucket name. 2. **Create credentials**: In AWS, create the appropriate AWS IAM
 * role. For full details, including the required IAM role policies and trust
 * relationship, see [Billable usage log delivery]. Using Databricks APIs, call
 * the Account API to create a [credential configuration
 * object](#operation/create-credential-config) that uses the IAM role's ARN. 3.
 * **Create log delivery configuration**: Using Databricks APIs, call the Account
 * API to [create a log delivery
 * configuration](#operation/create-log-delivery-config) that uses the credential
 * and storage configuration objects from previous steps. You can specify if the
 * logs should include all events of that log type in your account (_Account
 * level_ delivery) or only events for a specific set of workspaces (_workspace
 * level_ delivery). Account level log delivery applies to all current and future
 * workspaces plus account level logs, while workspace level log delivery solely
 * delivers logs related to the specified workspaces. You can create multiple
 * types of delivery configurations per account.
 *
 * For billable usage delivery: * For more information about billable usage logs,
 * see [Billable usage log delivery]. For the CSV schema, see the [Usage page]. *
 * The delivery location is `<bucket-name>/<prefix>/billable-usage/csv/`, where
 * `<prefix>` is the name of the optional delivery path prefix you set up during
 * log delivery configuration. Files are named
 * `workspaceId=<workspace-id>-usageMonth=<month>.csv`. * All billable usage logs
 * apply to specific workspaces (_workspace level_ logs). You can aggregate usage
 * for your entire account by creating an _account level_ delivery configuration
 * that delivers logs for all current and future workspaces in your account. *
 * The files are delivered daily by overwriting the month's CSV file for each
 * workspace.
 *
 * For audit log delivery: * For more information about about audit log delivery,
 * see [Audit log delivery], which includes information about the used JSON
 * schema. * The delivery location is
 * `<bucket-name>/<delivery-path-prefix>/workspaceId=<workspaceId>/date=<yyyy-mm-dd>/auditlogs_<internal-id>.json`.
 * Files may get overwritten with the same content multiple times to achieve
 * exactly-once delivery. * If the audit log delivery configuration included
 * specific workspace IDs, only _workspace-level_ audit logs for those workspaces
 * are delivered. If the log delivery configuration applies to the entire account
 * (_account level_ delivery configuration), the audit log delivery includes
 * workspace-level audit logs for all workspaces in the account as well as
 * account-level audit logs. See [Audit log delivery] for details. * Auditable
 * events are typically available in logs within 15 minutes.
 *
 * [Audit log delivery]: https://docs.databricks.com/administration-guide/account-settings/audit-logs.html
 * [Billable usage log delivery]: https://docs.databricks.com/administration-guide/account-settings/billable-usage-delivery.html
 * [Usage page]: https://docs.databricks.com/administration-guide/account-settings/usage.html
 * [create a new AWS S3 bucket]: https://docs.databricks.com/administration-guide/account-api/aws-storage.html
 */
export class LogDeliveryService {
    constructor(readonly client: ApiClient) {}
    /**
     * Create a new log delivery configuration.
     *
     * Creates a new Databricks log delivery configuration to enable delivery of
     * the specified type of logs to your storage location. This requires that
     * you already created a [credential
     * object](#operation/create-credential-config) (which encapsulates a
     * cross-account service IAM role) and a [storage configuration
     * object](#operation/create-storage-config) (which encapsulates an S3
     * bucket).
     *
     * For full details, including the required IAM role policies and bucket
     * policies, see [Deliver and access billable usage logs] or [Configure audit
     * logging].
     *
     * **Note**: There is a limit on the number of log delivery configurations
     * available per account (each limit applies separately to each log type
     * including billable usage and audit logs). You can create a maximum of two
     * enabled account-level delivery configurations (configurations without a
     * workspace filter) per type. Additionally, you can create two enabled
     * workspace-level delivery configurations per workspace for each log type,
     * which means that the same workspace ID can occur in the workspace filter
     * for no more than two delivery configurations per log type.
     *
     * You cannot delete a log delivery configuration, but you can disable it
     * (see [Enable or disable log delivery
     * configuration](#operation/patch-log-delivery-config-status)).
     *
     * [Configure audit logging]: https://docs.databricks.com/administration-guide/account-settings/audit-logs.html
     * [Deliver and access billable usage logs]: https://docs.databricks.com/administration-guide/account-settings/billable-usage-delivery.html
     */
    @withLogContext(ExposedLoggers.SDK)
    async create(
        request: model.WrappedCreateLogDeliveryConfiguration,
        @context context?: Context
    ): Promise<model.WrappedLogDeliveryConfiguration> {
        const path = `/api/2.0/accounts/${this.client.accountId}/log-delivery`;
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.WrappedLogDeliveryConfiguration;
    }

    /**
     * Get log delivery configuration.
     *
     * Gets a Databricks log delivery configuration object for an account, both
     * specified by ID.
     */
    @withLogContext(ExposedLoggers.SDK)
    async get(
        request: model.GetLogDeliveryRequest,
        @context context?: Context
    ): Promise<model.WrappedLogDeliveryConfiguration> {
        const path = `/api/2.0/accounts/${this.client.accountId}/log-delivery/${request.log_delivery_configuration_id}`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.WrappedLogDeliveryConfiguration;
    }

    /**
     * Get all log delivery configurations.
     *
     * Gets all Databricks log delivery configurations associated with an account
     * specified by ID.
     */
    @withLogContext(ExposedLoggers.SDK)
    async list(
        request: model.ListLogDeliveryRequest,
        @context context?: Context
    ): Promise<model.WrappedLogDeliveryConfigurations> {
        const path = `/api/2.0/accounts/${this.client.accountId}/log-delivery`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.WrappedLogDeliveryConfigurations;
    }

    /**
     * Enable or disable log delivery configuration.
     *
     * Enables or disables a log delivery configuration. Deletion of delivery
     * configurations is not supported, so disable log delivery configurations
     * that are no longer needed. Note that you can't re-enable a delivery
     * configuration if this would violate the delivery configuration limits
     * described under [Create log
     * delivery](#operation/create-log-delivery-config).
     */
    @withLogContext(ExposedLoggers.SDK)
    async patchStatus(
        request: model.UpdateLogDeliveryConfigurationStatusRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.0/accounts/${this.client.accountId}/log-delivery/${request.log_delivery_configuration_id}`;
        return (await this.client.request(
            path,
            "PATCH",
            request,
            context
        )) as model.EmptyResponse;
    }
}
