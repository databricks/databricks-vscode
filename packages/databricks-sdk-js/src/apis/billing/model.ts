/* eslint-disable @typescript-eslint/naming-convention */

// Code generated from OpenAPI specs by Databricks SDK Generator. DO NOT EDIT.

// all definitions in this file are in alphabetical order
/**
 * Budget configuration to be created.
 */
export interface Budget {
    alerts?: Array<BudgetAlert>;
    /**
     * Optional end date of the budget.
     */
    end_date?: string;
    /**
     * SQL-like filter expression with workspaceId, SKU and tag. Usage in your
     * account that matches this expression will be counted in this budget.
     *
     * Supported properties on left-hand side of comparison: * `workspaceId` -
     * the ID of the workspace * `sku` - SKU of the cluster, e.g.
     * `STANDARD_ALL_PURPOSE_COMPUTE` * `tag.tagName`, `tag.'tag name'` - tag of
     * the cluster
     *
     * Supported comparison operators: * `=` - equal * `!=` - not equal
     *
     * Supported logical operators: `AND`, `OR`.
     *
     * Examples: * `workspaceId=123 OR (sku='STANDARD_ALL_PURPOSE_COMPUTE' AND
     * tag.'my tag'='my value')` * `workspaceId!=456` *
     * `sku='STANDARD_ALL_PURPOSE_COMPUTE' OR sku='PREMIUM_ALL_PURPOSE_COMPUTE'`
     * * `tag.name1='value1' AND tag.name2='value2'`
     */
    filter: string;
    /**
     * Human-readable name of the budget.
     */
    name: string;
    /**
     * Period length in years, months, weeks and/or days. Examples: `1 month`,
     * `30 days`, `1 year, 2 months, 1 week, 2 days`
     */
    period: string;
    /**
     * Start date of the budget period calculation.
     */
    start_date: string;
    /**
     * Target amount of the budget per period in USD.
     */
    target_amount: string;
}

export interface BudgetAlert {
    /**
     * List of email addresses to be notified when budget percentage is exceeded
     * in the given period.
     */
    email_notifications?: Array<string>;
    /**
     * Percentage of the target amount used in the currect period that will
     * trigger a notification.
     */
    min_percentage?: number;
}

/**
 * List of budgets.
 */
export interface BudgetList {
    budgets?: Array<BudgetWithStatus>;
}

/**
 * Budget configuration with daily status.
 */
export interface BudgetWithStatus {
    alerts?: Array<BudgetAlert>;
    budget_id?: string;
    creation_time?: string;
    /**
     * Optional end date of the budget.
     */
    end_date?: string;
    /**
     * SQL-like filter expression with workspaceId, SKU and tag. Usage in your
     * account that matches this expression will be counted in this budget.
     *
     * Supported properties on left-hand side of comparison: * `workspaceId` -
     * the ID of the workspace * `sku` - SKU of the cluster, e.g.
     * `STANDARD_ALL_PURPOSE_COMPUTE` * `tag.tagName`, `tag.'tag name'` - tag of
     * the cluster
     *
     * Supported comparison operators: * `=` - equal * `!=` - not equal
     *
     * Supported logical operators: `AND`, `OR`.
     *
     * Examples: * `workspaceId=123 OR (sku='STANDARD_ALL_PURPOSE_COMPUTE' AND
     * tag.'my tag'='my value')` * `workspaceId!=456` *
     * `sku='STANDARD_ALL_PURPOSE_COMPUTE' OR sku='PREMIUM_ALL_PURPOSE_COMPUTE'`
     * * `tag.name1='value1' AND tag.name2='value2'`
     */
    filter?: string;
    /**
     * Human-readable name of the budget.
     */
    name?: string;
    /**
     * Period length in years, months, weeks and/or days. Examples: `1 month`,
     * `30 days`, `1 year, 2 months, 1 week, 2 days`
     */
    period?: string;
    /**
     * Start date of the budget period calculation.
     */
    start_date?: string;
    /**
     * Amount used in the budget for each day (noncumulative).
     */
    status_daily?: Array<BudgetWithStatusStatusDailyItem>;
    /**
     * Target amount of the budget per period in USD.
     */
    target_amount?: string;
    update_time?: string;
}

export interface BudgetWithStatusStatusDailyItem {
    /**
     * Amount used in this day in USD.
     */
    amount?: string;
    date?: string;
}

export interface CreateLogDeliveryConfigurationParams {
    /**
     * The optional human-readable name of the log delivery configuration.
     * Defaults to empty.
     */
    config_name?: string;
    /**
     * The ID for a method:credentials/create that represents the AWS IAM role
     * with policy and trust relationship as described in the main billable usage
     * documentation page. See [Configure billable usage delivery].
     *
     * [Configure billable usage delivery]: https://docs.databricks.com/administration-guide/account-settings/billable-usage-delivery.html
     */
    credentials_id: string;
    /**
     * The optional delivery path prefix within Amazon S3 storage. Defaults to
     * empty, which means that logs are delivered to the root of the bucket. This
     * must be a valid S3 object key. This must not start or end with a slash
     * character.
     */
    delivery_path_prefix?: string;
    /**
     * This field applies only if `log_type` is `BILLABLE_USAGE`. This is the
     * optional start month and year for delivery, specified in `YYYY-MM` format.
     * Defaults to current year and month. `BILLABLE_USAGE` logs are not
     * available for usage before March 2019 (`2019-03`).
     */
    delivery_start_time?: string;
    /**
     * Log delivery type. Supported values are:
     *
     * * `BILLABLE_USAGE` — Configure [billable usage log delivery]. For the
     * CSV schema, see the [View billable usage].
     *
     * * `AUDIT_LOGS` — Configure [audit log delivery]. For the JSON schema,
     * see [Configure audit logging]
     *
     * [Configure audit logging]: https://docs.databricks.com/administration-guide/account-settings/audit-logs.html
     * [View billable usage]: https://docs.databricks.com/administration-guide/account-settings/usage.html
     * [audit log delivery]: https://docs.databricks.com/administration-guide/account-settings/audit-logs.html
     * [billable usage log delivery]: https://docs.databricks.com/administration-guide/account-settings/billable-usage-delivery.html
     */
    log_type: LogType;
    /**
     * The file type of log delivery.
     *
     * * If `log_type` is `BILLABLE_USAGE`, this value must be `CSV`. Only the
     * CSV (comma-separated values) format is supported. For the schema, see the
     * [View billable usage] * If `log_type` is `AUDIT_LOGS`, this value must be
     * `JSON`. Only the JSON (JavaScript Object Notation) format is supported.
     * For the schema, see the [Configuring audit logs].
     *
     * [Configuring audit logs]: https://docs.databricks.com/administration-guide/account-settings/audit-logs.html
     * [View billable usage]: https://docs.databricks.com/administration-guide/account-settings/usage.html
     */
    output_format: OutputFormat;
    /**
     * Status of log delivery configuration. Set to `ENABLED` (enabled) or
     * `DISABLED` (disabled). Defaults to `ENABLED`. You can [enable or disable
     * the configuration](#operation/patch-log-delivery-config-status) later.
     * Deletion of a configuration is not supported, so disable a log delivery
     * configuration that is no longer needed.
     */
    status?: LogDeliveryConfigStatus;
    /**
     * The ID for a method:storage/create that represents the S3 bucket with
     * bucket policy as described in the main billable usage documentation page.
     * See [Configure billable usage delivery].
     *
     * [Configure billable usage delivery]: https://docs.databricks.com/administration-guide/account-settings/billable-usage-delivery.html
     */
    storage_configuration_id: string;
    /**
     * Optional filter that specifies workspace IDs to deliver logs for. By
     * default the workspace filter is empty and log delivery applies at the
     * account level, delivering workspace-level logs for all workspaces in your
     * account, plus account level logs. You can optionally set this field to an
     * array of workspace IDs (each one is an `int64`) to which log delivery
     * should apply, in which case only workspace-level logs relating to the
     * specified workspaces are delivered. If you plan to use different log
     * delivery configurations for different workspaces, set this field
     * explicitly. Be aware that delivery configurations mentioning specific
     * workspaces won't apply to new workspaces created in the future, and
     * delivery won't include account level logs. For some types of Databricks
     * deployments there is only one workspace per account ID, so this field is
     * unnecessary.
     */
    workspace_ids_filter?: Array<number>;
}

/**
 * Delete budget
 */
export interface DeleteBudgetRequest {
    /**
     * Budget ID
     */
    budget_id: string;
}

/**
 * This describes an enum
 */
export type DeliveryStatus =
    /**
     * There were no log delivery attempts since the config was created.
     */
    | "CREATED"
    /**
     * The log delivery status as the configuration has been disabled since the
     * release of this feature or there are no workspaces in the account.
     */
    | "NOT_FOUND"
    /**
     * The latest attempt of log delivery has succeeded completely.
     */
    | "SUCCEEDED"
    /**
     * The latest attempt of log delivery failed because of an <Databricks> internal
     * error. Contact support if it doesn't go away soon.
     */
    | "SYSTEM_FAILURE"
    /**
     * The latest attempt of log delivery failed because of misconfiguration of
     * customer provided permissions on role or storage.
     */
    | "USER_FAILURE";

/**
 * Return billable usage logs
 */
export interface DownloadRequest {
    /**
     * Format: `YYYY-MM`. Last month to return billable usage logs for. This
     * field is required.
     */
    end_month: string;
    /**
     * Specify whether to include personally identifiable information in the
     * billable usage logs, for example the email addresses of cluster creators.
     * Handle this information with care. Defaults to false.
     */
    personal_data?: boolean;
    /**
     * Format: `YYYY-MM`. First month to return billable usage logs for. This
     * field is required.
     */
    start_month: string;
}

/**
 * Get budget and its status
 */
export interface GetBudgetRequest {
    /**
     * Budget ID
     */
    budget_id: string;
}

/**
 * Get log delivery configuration
 */
export interface GetLogDeliveryRequest {
    /**
     * Databricks log delivery configuration ID
     */
    log_delivery_configuration_id: string;
}

/**
 * Get all log delivery configurations
 */
export interface ListLogDeliveryRequest {
    /**
     * Filter by credential configuration ID.
     */
    credentials_id?: string;
    /**
     * Filter by status `ENABLED` or `DISABLED`.
     */
    status?: LogDeliveryConfigStatus;
    /**
     * Filter by storage configuration ID.
     */
    storage_configuration_id?: string;
}

/**
 * Status of log delivery configuration. Set to `ENABLED` (enabled) or `DISABLED`
 * (disabled). Defaults to `ENABLED`. You can [enable or disable the
 * configuration](#operation/patch-log-delivery-config-status) later. Deletion of
 * a configuration is not supported, so disable a log delivery configuration that
 * is no longer needed.
 */
export type LogDeliveryConfigStatus = "DISABLED" | "ENABLED";

export interface LogDeliveryConfiguration {
    /**
     * The Databricks account ID that hosts the log delivery configuration.
     */
    account_id?: string;
    /**
     * Databricks log delivery configuration ID.
     */
    config_id?: string;
    /**
     * The optional human-readable name of the log delivery configuration.
     * Defaults to empty.
     */
    config_name?: string;
    /**
     * Time in epoch milliseconds when the log delivery configuration was
     * created.
     */
    creation_time?: number;
    /**
     * The ID for a method:credentials/create that represents the AWS IAM role
     * with policy and trust relationship as described in the main billable usage
     * documentation page. See [Configure billable usage delivery].
     *
     * [Configure billable usage delivery]: https://docs.databricks.com/administration-guide/account-settings/billable-usage-delivery.html
     */
    credentials_id?: string;
    /**
     * The optional delivery path prefix within Amazon S3 storage. Defaults to
     * empty, which means that logs are delivered to the root of the bucket. This
     * must be a valid S3 object key. This must not start or end with a slash
     * character.
     */
    delivery_path_prefix?: string;
    /**
     * This field applies only if `log_type` is `BILLABLE_USAGE`. This is the
     * optional start month and year for delivery, specified in `YYYY-MM` format.
     * Defaults to current year and month. `BILLABLE_USAGE` logs are not
     * available for usage before March 2019 (`2019-03`).
     */
    delivery_start_time?: string;
    /**
     * Databricks log delivery status.
     */
    log_delivery_status?: LogDeliveryStatus;
    /**
     * Log delivery type. Supported values are:
     *
     * * `BILLABLE_USAGE` — Configure [billable usage log delivery]. For the
     * CSV schema, see the [View billable usage].
     *
     * * `AUDIT_LOGS` — Configure [audit log delivery]. For the JSON schema,
     * see [Configure audit logging]
     *
     * [Configure audit logging]: https://docs.databricks.com/administration-guide/account-settings/audit-logs.html
     * [View billable usage]: https://docs.databricks.com/administration-guide/account-settings/usage.html
     * [audit log delivery]: https://docs.databricks.com/administration-guide/account-settings/audit-logs.html
     * [billable usage log delivery]: https://docs.databricks.com/administration-guide/account-settings/billable-usage-delivery.html
     */
    log_type?: LogType;
    /**
     * The file type of log delivery.
     *
     * * If `log_type` is `BILLABLE_USAGE`, this value must be `CSV`. Only the
     * CSV (comma-separated values) format is supported. For the schema, see the
     * [View billable usage] * If `log_type` is `AUDIT_LOGS`, this value must be
     * `JSON`. Only the JSON (JavaScript Object Notation) format is supported.
     * For the schema, see the [Configuring audit logs].
     *
     * [Configuring audit logs]: https://docs.databricks.com/administration-guide/account-settings/audit-logs.html
     * [View billable usage]: https://docs.databricks.com/administration-guide/account-settings/usage.html
     */
    output_format?: OutputFormat;
    /**
     * Status of log delivery configuration. Set to `ENABLED` (enabled) or
     * `DISABLED` (disabled). Defaults to `ENABLED`. You can [enable or disable
     * the configuration](#operation/patch-log-delivery-config-status) later.
     * Deletion of a configuration is not supported, so disable a log delivery
     * configuration that is no longer needed.
     */
    status?: LogDeliveryConfigStatus;
    /**
     * The ID for a method:storage/create that represents the S3 bucket with
     * bucket policy as described in the main billable usage documentation page.
     * See [Configure billable usage delivery].
     *
     * [Configure billable usage delivery]: https://docs.databricks.com/administration-guide/account-settings/billable-usage-delivery.html
     */
    storage_configuration_id?: string;
    /**
     * Time in epoch milliseconds when the log delivery configuration was
     * updated.
     */
    update_time?: number;
    /**
     * Optional filter that specifies workspace IDs to deliver logs for. By
     * default the workspace filter is empty and log delivery applies at the
     * account level, delivering workspace-level logs for all workspaces in your
     * account, plus account level logs. You can optionally set this field to an
     * array of workspace IDs (each one is an `int64`) to which log delivery
     * should apply, in which case only workspace-level logs relating to the
     * specified workspaces are delivered. If you plan to use different log
     * delivery configurations for different workspaces, set this field
     * explicitly. Be aware that delivery configurations mentioning specific
     * workspaces won't apply to new workspaces created in the future, and
     * delivery won't include account level logs. For some types of Databricks
     * deployments there is only one workspace per account ID, so this field is
     * unnecessary.
     */
    workspace_ids_filter?: Array<number>;
}

/**
 * Databricks log delivery status.
 */
export interface LogDeliveryStatus {
    /**
     * The UTC time for the latest log delivery attempt.
     */
    last_attempt_time?: string;
    /**
     * The UTC time for the latest successful log delivery.
     */
    last_successful_attempt_time?: string;
    /**
     * Informative message about the latest log delivery attempt. If the log
     * delivery fails with USER_FAILURE, error details will be provided for
     * fixing misconfigurations in cloud permissions.
     */
    message?: string;
    /**
     * This describes an enum
     */
    status?: DeliveryStatus;
}

/**
 * Log delivery type. Supported values are:
 *
 * * `BILLABLE_USAGE` — Configure [billable usage log delivery]. For the CSV
 * schema, see the [View billable usage].
 *
 * * `AUDIT_LOGS` — Configure [audit log delivery]. For the JSON schema, see
 * [Configure audit logging]
 *
 * [Configure audit logging]: https://docs.databricks.com/administration-guide/account-settings/audit-logs.html
 * [View billable usage]: https://docs.databricks.com/administration-guide/account-settings/usage.html
 * [audit log delivery]: https://docs.databricks.com/administration-guide/account-settings/audit-logs.html
 * [billable usage log delivery]: https://docs.databricks.com/administration-guide/account-settings/billable-usage-delivery.html
 */
export type LogType = "AUDIT_LOGS" | "BILLABLE_USAGE";

/**
 * The file type of log delivery.
 *
 * * If `log_type` is `BILLABLE_USAGE`, this value must be `CSV`. Only the CSV
 * (comma-separated values) format is supported. For the schema, see the [View
 * billable usage] * If `log_type` is `AUDIT_LOGS`, this value must be `JSON`.
 * Only the JSON (JavaScript Object Notation) format is supported. For the
 * schema, see the [Configuring audit logs].
 *
 * [Configuring audit logs]: https://docs.databricks.com/administration-guide/account-settings/audit-logs.html
 * [View billable usage]: https://docs.databricks.com/administration-guide/account-settings/usage.html
 */
export type OutputFormat = "CSV" | "JSON";

export interface UpdateLogDeliveryConfigurationStatusRequest {
    /**
     * Databricks log delivery configuration ID
     */
    log_delivery_configuration_id: string;
    /**
     * Status of log delivery configuration. Set to `ENABLED` (enabled) or
     * `DISABLED` (disabled). Defaults to `ENABLED`. You can [enable or disable
     * the configuration](#operation/patch-log-delivery-config-status) later.
     * Deletion of a configuration is not supported, so disable a log delivery
     * configuration that is no longer needed.
     */
    status: LogDeliveryConfigStatus;
}

/**
 * Format specification for month in the format `YYYY-MM`. This is used to
 * specify billable usage `start_month` and `end_month` properties. **Note**:
 * Billable usage logs are unavailable before March 2019 (`2019-03`).
 */

export interface WrappedBudget {
    /**
     * Budget configuration to be created.
     */
    budget: Budget;
    /**
     * Budget ID
     */
    budget_id: string;
}

export interface WrappedBudgetWithStatus {
    /**
     * Budget configuration with daily status.
     */
    budget: BudgetWithStatus;
}

export interface WrappedCreateLogDeliveryConfiguration {
    log_delivery_configuration?: CreateLogDeliveryConfigurationParams;
}

export interface WrappedLogDeliveryConfiguration {
    log_delivery_configuration?: LogDeliveryConfiguration;
}

export interface WrappedLogDeliveryConfigurations {
    log_delivery_configurations?: Array<LogDeliveryConfiguration>;
}
