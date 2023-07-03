/* eslint-disable @typescript-eslint/no-unused-vars */

// Code generated from OpenAPI specs by Databricks SDK Generator. DO NOT EDIT.

import {Config, ConfigOptions} from "./config/Config";
import {ApiClient, ClientOptions} from "./api-client";

import * as billing from "./apis/billing";
import * as catalog from "./apis/catalog";
import * as compute from "./apis/compute";
import * as files from "./apis/files";
import * as iam from "./apis/iam";
import * as jobs from "./apis/jobs";
import * as ml from "./apis/ml";
import * as oauth2 from "./apis/oauth2";
import * as pipelines from "./apis/pipelines";
import * as provisioning from "./apis/provisioning";
import * as serving from "./apis/serving";
import * as settings from "./apis/settings";
import * as sharing from "./apis/sharing";
import * as sql from "./apis/sql";
import * as workspace from "./apis/workspace";

export class AccountClient {
    readonly config: Config;
    readonly apiClient: ApiClient;

    /**
     * These APIs manage access rules on resources in an account. Currently, only
     * grant rules are supported. A grant rule specifies a role assigned to a set of
     * principals. A list of rules attached to a resource is called a rule set.
     */
    readonly accountAccessControl: iam.AccountAccessControlService;

    /**
     * This API allows you to download billable usage logs for the specified account
     * and date range. This feature works with all account types.
     */
    readonly billableUsage: billing.BillableUsageService;

    /**
     * These APIs manage budget configuration including notifications for exceeding a
     * budget for a period. They can also retrieve the status of each budget.
     */
    readonly budgets: billing.BudgetsService;

    /**
     * These APIs manage credential configurations for this workspace. Databricks
     * needs access to a cross-account service IAM role in your AWS account so that
     * Databricks can deploy clusters in the appropriate VPC for the new workspace. A
     * credential configuration encapsulates this role information, and its ID is
     * used when creating a new workspace.
     */
    readonly credentials: provisioning.CredentialsService;

    /**
     * These APIs enable administrators to manage custom oauth app integrations,
     * which is required for adding/using Custom OAuth App Integration like Tableau
     * Cloud for Databricks in AWS cloud.
     *
     * **Note:** You can only add/use the OAuth custom application integrations when
     * OAuth enrollment status is enabled. For more details see
     * :method:OAuthEnrollment/create
     */
    readonly customAppIntegration: oauth2.CustomAppIntegrationService;

    /**
     * These APIs manage encryption key configurations for this workspace (optional).
     * A key configuration encapsulates the AWS KMS key information and some
     * information about how the key configuration can be used. There are two
     * possible uses for key configurations:
     *
     * * Managed services: A key configuration can be used to encrypt a workspace's
     * notebook and secret data in the control plane, as well as Databricks SQL
     * queries and query history. * Storage: A key configuration can be used to
     * encrypt a workspace's DBFS and EBS data in the data plane.
     *
     * In both of these cases, the key configuration's ID is used when creating a new
     * workspace. This Preview feature is available if your account is on the E2
     * version of the platform. Updating a running workspace with workspace storage
     * encryption requires that the workspace is on the E2 version of the platform.
     * If you have an older workspace, it might not be on the E2 version of the
     * platform. If you are not sure, contact your Databricks representative.
     */
    readonly encryptionKeys: provisioning.EncryptionKeysService;

    /**
     * Groups simplify identity management, making it easier to assign access to
     * Databricks account, data, and other securable objects.
     *
     * It is best practice to assign access to workspaces and access-control policies
     * in Unity Catalog to groups, instead of to users individually. All Databricks
     * account identities can be assigned as members of groups, and members inherit
     * permissions that are assigned to their group.
     */
    readonly accountGroups: iam.AccountGroupsService;

    /**
     * The Accounts IP Access List API enables account admins to configure IP access
     * lists for access to the account console.
     *
     * Account IP Access Lists affect web application access and REST API access to
     * the account console and account APIs. If the feature is disabled for the
     * account, all access is allowed for this account. There is support for allow
     * lists (inclusion) and block lists (exclusion).
     *
     * When a connection is attempted: 1. **First, all block lists are checked.** If
     * the connection IP address matches any block list, the connection is rejected.
     * 2. **If the connection was not rejected by block lists**, the IP address is
     * compared with the allow lists.
     *
     * If there is at least one allow list for the account, the connection is allowed
     * only if the IP address matches an allow list. If there are no allow lists for
     * the account, all IP addresses are allowed.
     *
     * For all allow lists and block lists combined, the account supports a maximum
     * of 1000 IP/CIDR values, where one CIDR counts as a single value.
     *
     * After changes to the account-level IP access lists, it can take a few minutes
     * for changes to take effect.
     */
    readonly accountIpAccessLists: settings.AccountIpAccessListsService;

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
    readonly logDelivery: billing.LogDeliveryService;

    /**
     * These APIs manage metastore assignments to a workspace.
     */
    readonly accountMetastoreAssignments: catalog.AccountMetastoreAssignmentsService;

    /**
     * These APIs manage Unity Catalog metastores for an account. A metastore
     * contains catalogs that can be associated with workspaces
     */
    readonly accountMetastores: catalog.AccountMetastoresService;

    /**
     * These APIs manage network configurations for customer-managed VPCs (optional).
     * Its ID is used when creating a new workspace if you use customer-managed VPCs.
     */
    readonly networks: provisioning.NetworksService;

    /**
     * These APIs enable administrators to enroll OAuth for their accounts, which is
     * required for adding/using any OAuth published/custom application integration.
     *
     * **Note:** Your account must be on the E2 version to use these APIs, this is
     * because OAuth is only supported on the E2 version.
     */
    readonly oAuthEnrollment: oauth2.OAuthEnrollmentService;

    /**
     * These APIs manage private access settings for this account.
     */
    readonly privateAccess: provisioning.PrivateAccessService;

    /**
     * These APIs enable administrators to manage published oauth app integrations,
     * which is required for adding/using Published OAuth App Integration like
     * Tableau Cloud for Databricks in AWS cloud.
     *
     * **Note:** You can only add/use the OAuth published application integrations
     * when OAuth enrollment status is enabled. For more details see
     * :method:OAuthEnrollment/create
     */
    readonly publishedAppIntegration: oauth2.PublishedAppIntegrationService;

    /**
     * These APIs enable administrators to manage service principal secrets.
     *
     * You can use the generated secrets to obtain OAuth access tokens for a service
     * principal, which can then be used to access Databricks Accounts and Workspace
     * APIs. For more information, see [Authentication using OAuth tokens for service
     * principals],
     *
     * In addition, the generated secrets can be used to configure the Databricks
     * Terraform Provider to authenticate with the service principal. For more
     * information, see [Databricks Terraform Provider].
     *
     * [Authentication using OAuth tokens for service principals]: https://docs.databricks.com/dev-tools/authentication-oauth.html
     * [Databricks Terraform Provider]: https://github.com/databricks/terraform-provider-databricks/blob/master/docs/index.md#authenticating-with-service-principal
     */
    readonly servicePrincipalSecrets: oauth2.ServicePrincipalSecretsService;

    /**
     * Identities for use with jobs, automated tools, and systems such as scripts,
     * apps, and CI/CD platforms. Databricks recommends creating service principals
     * to run production jobs or modify production data. If all processes that act on
     * production data run with service principals, interactive users do not need any
     * write, delete, or modify privileges in production. This eliminates the risk of
     * a user overwriting production data by accident.
     */
    readonly accountServicePrincipals: iam.AccountServicePrincipalsService;

    /**
     * TBD
     */
    readonly accountSettings: settings.AccountSettingsService;

    /**
     * These APIs manage storage configurations for this workspace. A root storage S3
     * bucket in your account is required to store objects like cluster logs,
     * notebook revisions, and job results. You can also use the root storage S3
     * bucket for storage of non-production DBFS data. A storage configuration
     * encapsulates this bucket information, and its ID is used when creating a new
     * workspace.
     */
    readonly storage: provisioning.StorageService;

    /**
     * These APIs manage storage credentials for a particular metastore.
     */
    readonly accountStorageCredentials: catalog.AccountStorageCredentialsService;

    /**
     * User identities recognized by Databricks and represented by email addresses.
     *
     * Databricks recommends using SCIM provisioning to sync users and groups
     * automatically from your identity provider to your Databricks account. SCIM
     * streamlines onboarding a new employee or team by using your identity provider
     * to create users and groups in Databricks account and give them the proper
     * level of access. When a user leaves your organization or no longer needs
     * access to Databricks account, admins can terminate the user in your identity
     * provider and that user’s account will also be removed from Databricks
     * account. This ensures a consistent offboarding process and prevents
     * unauthorized users from accessing sensitive data.
     */
    readonly accountUsers: iam.AccountUsersService;

    /**
     * These APIs manage VPC endpoint configurations for this account.
     */
    readonly vpcEndpoints: provisioning.VpcEndpointsService;

    /**
     * The Workspace Permission Assignment API allows you to manage workspace
     * permissions for principals in your account.
     */
    readonly workspaceAssignment: iam.WorkspaceAssignmentService;

    /**
     * These APIs manage workspaces for this account. A Databricks workspace is an
     * environment for accessing all of your Databricks assets. The workspace
     * organizes objects (notebooks, libraries, and experiments) into folders, and
     * provides access to data and computational resources such as clusters and jobs.
     *
     * These endpoints are available if your account is on the E2 version of the
     * platform or on a select custom plan that allows multiple workspaces per
     * account.
     */
    readonly workspaces: provisioning.WorkspacesService;

    constructor(config: ConfigOptions | Config, options: ClientOptions = {}) {
        if (!(config instanceof Config)) {
            config = new Config(config);
        }

        this.config = config as Config;
        this.apiClient = new ApiClient(this.config, options);

        this.accountAccessControl = new iam.AccountAccessControlService(
            this.apiClient
        );
        this.billableUsage = new billing.BillableUsageService(this.apiClient);
        this.budgets = new billing.BudgetsService(this.apiClient);
        this.credentials = new provisioning.CredentialsService(this.apiClient);
        this.customAppIntegration = new oauth2.CustomAppIntegrationService(
            this.apiClient
        );
        this.encryptionKeys = new provisioning.EncryptionKeysService(
            this.apiClient
        );
        this.accountGroups = new iam.AccountGroupsService(this.apiClient);
        this.accountIpAccessLists = new settings.AccountIpAccessListsService(
            this.apiClient
        );
        this.logDelivery = new billing.LogDeliveryService(this.apiClient);
        this.accountMetastoreAssignments =
            new catalog.AccountMetastoreAssignmentsService(this.apiClient);
        this.accountMetastores = new catalog.AccountMetastoresService(
            this.apiClient
        );
        this.networks = new provisioning.NetworksService(this.apiClient);
        this.oAuthEnrollment = new oauth2.OAuthEnrollmentService(
            this.apiClient
        );
        this.privateAccess = new provisioning.PrivateAccessService(
            this.apiClient
        );
        this.publishedAppIntegration =
            new oauth2.PublishedAppIntegrationService(this.apiClient);
        this.servicePrincipalSecrets =
            new oauth2.ServicePrincipalSecretsService(this.apiClient);
        this.accountServicePrincipals = new iam.AccountServicePrincipalsService(
            this.apiClient
        );
        this.accountSettings = new settings.AccountSettingsService(
            this.apiClient
        );
        this.storage = new provisioning.StorageService(this.apiClient);
        this.accountStorageCredentials =
            new catalog.AccountStorageCredentialsService(this.apiClient);
        this.accountUsers = new iam.AccountUsersService(this.apiClient);
        this.vpcEndpoints = new provisioning.VpcEndpointsService(
            this.apiClient
        );
        this.workspaceAssignment = new iam.WorkspaceAssignmentService(
            this.apiClient
        );
        this.workspaces = new provisioning.WorkspacesService(this.apiClient);
    }
}
