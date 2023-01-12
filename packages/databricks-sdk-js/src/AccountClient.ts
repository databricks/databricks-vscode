/* eslint-disable @typescript-eslint/no-unused-vars */

// Code generated from OpenAPI specs by Databricks SDK Generator. DO NOT EDIT.

import {Config, ConfigOptions} from "./config/Config";
import {ApiClient, ClientOptions} from "./api-client";

import * as billing from "./apis/billing";
import * as clusterpolicies from "./apis/clusterpolicies";
import * as clusters from "./apis/clusters";
import * as commands from "./apis/commands";
import * as dbfs from "./apis/dbfs";
import * as deployment from "./apis/deployment";
import * as gitcredentials from "./apis/gitcredentials";
import * as globalinitscripts from "./apis/globalinitscripts";
import * as instancepools from "./apis/instancepools";
import * as ipaccesslists from "./apis/ipaccesslists";
import * as jobs from "./apis/jobs";
import * as libraries from "./apis/libraries";
import * as mlflow from "./apis/mlflow";
import * as permissions from "./apis/permissions";
import * as pipelines from "./apis/pipelines";
import * as repos from "./apis/repos";
import * as scim from "./apis/scim";
import * as secrets from "./apis/secrets";
import * as sql from "./apis/sql";
import * as tokenmanagement from "./apis/tokenmanagement";
import * as tokens from "./apis/tokens";
import * as unitycatalog from "./apis/unitycatalog";
import * as workspace from "./apis/workspace";
import * as workspaceconf from "./apis/workspaceconf";

export class AccountClient {
    readonly config: Config;
    readonly apiClient: ApiClient;

    constructor(config: ConfigOptions | Config, options: ClientOptions = {}) {
        if (!(config instanceof Config)) {
            config = new Config(config);
        }

        this.config = config as Config;

        this.config.ensureResolved();
        if (!this.config.accountId || !this.config.isAccountClient()) {
            throw new Error("invalid Databricks Account configuration");
        }

        this.apiClient = new ApiClient(this.config, options);
    }

    /**
     * This API allows you to download billable usage logs for the specified account
     * and date range. This feature works with all account types.
     */
    get billableUsage() {
        return new billing.BillableUsageService(this.apiClient);
    }

    /**
     * These APIs manage budget configuration including notifications for exceeding a
     * budget for a period. They can also retrieve the status of each budget.
     */
    get budgets() {
        return new billing.BudgetsService(this.apiClient);
    }

    /**
     * These APIs manage credential configurations for this workspace. Databricks
     * needs access to a cross-account service IAM role in your AWS account so that
     * Databricks can deploy clusters in the appropriate VPC for the new workspace. A
     * credential configuration encapsulates this role information, and its ID is
     * used when creating a new workspace.
     */
    get credentials() {
        return new deployment.CredentialsService(this.apiClient);
    }

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
     * platform. If you are not sure, contact your Databricks reprsentative.
     */
    get encryptionKeys() {
        return new deployment.EncryptionKeysService(this.apiClient);
    }

    /**
     * Groups simplify identity management, making it easier to assign access to
     * Databricks Account, data, and other securable objects.
     *
     * It is best practice to assign access to workspaces and access-control policies
     * in Unity Catalog to groups, instead of to users individually. All Databricks
     * Account identities can be assigned as members of groups, and members inherit
     * permissions that are assigned to their group.
     */
    get groups() {
        return new scim.AccountGroupsService(this.apiClient);
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
    get logDelivery() {
        return new billing.LogDeliveryService(this.apiClient);
    }

    /**
     * These APIs manage network configurations for customer-managed VPCs (optional).
     * A network configuration encapsulates the IDs for AWS VPCs, subnets, and
     * security groups. Its ID is used when creating a new workspace if you use
     * customer-managed VPCs.
     */
    get networks() {
        return new deployment.NetworksService(this.apiClient);
    }

    /**
     * These APIs manage private access settings for this account. A private access
     * settings object specifies how your workspace is accessed using AWS
     * PrivateLink. Each workspace that has any PrivateLink connections must include
     * the ID for a private access settings object is in its workspace configuration
     * object. Your account must be enabled for PrivateLink to use these APIs. Before
     * configuring PrivateLink, it is important to read the [Databricks article about
     * PrivateLink].
     *
     * [Databricks article about PrivateLink]: https://docs.databricks.com/administration-guide/cloud-configurations/aws/privatelink.html
     */
    get privateAccess() {
        return new deployment.PrivateAccessService(this.apiClient);
    }

    /**
     * Identities for use with jobs, automated tools, and systems such as scripts,
     * apps, and CI/CD platforms. Databricks recommends creating service principals
     * to run production jobs or modify production data. If all processes that act on
     * production data run with service principals, interactive users do not need any
     * write, delete, or modify privileges in production. This eliminates the risk of
     * a user overwriting production data by accident.
     */
    get servicePrincipals() {
        return new scim.AccountServicePrincipalsService(this.apiClient);
    }

    /**
     * These APIs manage storage configurations for this workspace. A root storage S3
     * bucket in your account is required to store objects like cluster logs,
     * notebook revisions, and job results. You can also use the root storage S3
     * bucket for storage of non-production DBFS data. A storage configuration
     * encapsulates this bucket information, and its ID is used when creating a new
     * workspace.
     */
    get storage() {
        return new deployment.StorageService(this.apiClient);
    }

    /**
     * User identities recognized by Databricks and represented by email addresses.
     *
     * Databricks recommends using SCIM provisioning to sync users and groups
     * automatically from your identity provider to your Databricks Account. SCIM
     * streamlines onboarding a new employee or team by using your identity provider
     * to create users and groups in Databricks Account and give them the proper
     * level of access. When a user leaves your organization or no longer needs
     * access to Databricks Account, admins can terminate the user in your identity
     * provider and that user’s account will also be removed from Databricks
     * Account. This ensures a consistent offboarding process and prevents
     * unauthorized users from accessing sensitive data.
     */
    get users() {
        return new scim.AccountUsersService(this.apiClient);
    }

    /**
     * These APIs manage VPC endpoint configurations for this account. This object
     * registers an AWS VPC endpoint in your Databricks account so your workspace can
     * use it with AWS PrivateLink. Your VPC endpoint connects to one of two VPC
     * endpoint services -- one for workspace (both for front-end connection and for
     * back-end connection to REST APIs) and one for the back-end secure cluster
     * connectivity relay from the data plane. Your account must be enabled for
     * PrivateLink to use these APIs. Before configuring PrivateLink, it is important
     * to read the [Databricks article about PrivateLink].
     *
     * [Databricks article about PrivateLink]: https://docs.databricks.com/administration-guide/cloud-configurations/aws/privatelink.html
     */
    get vpcEndpoints() {
        return new deployment.VpcEndpointsService(this.apiClient);
    }

    /**
     * Databricks Workspace Assignment REST API
     */
    get workspaceAssignment() {
        return new permissions.WorkspaceAssignmentService(this.apiClient);
    }

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
    get workspaces() {
        return new deployment.WorkspacesService(this.apiClient);
    }
}
