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

export class WorkspaceClient {
    readonly config: Config;
    readonly apiClient: ApiClient;

    /**
     * The alerts API can be used to perform CRUD operations on alerts. An alert is a
     * Databricks SQL object that periodically runs a query, evaluates a condition of
     * its result, and notifies one or more users and/or alert destinations if the
     * condition was met.
     */
    readonly alerts: sql.AlertsService;

    /**
     * A catalog is the first layer of Unity Catalog’s three-level namespace.
     * It’s used to organize your data assets. Users can see all catalogs on which
     * they have been assigned the USE_CATALOG data permission.
     *
     * In Unity Catalog, admins and data stewards manage users and their access to
     * data centrally across all of the workspaces in a Databricks account. Users in
     * different workspaces can share access to the same data, depending on
     * privileges granted centrally in Unity Catalog.
     */
    readonly catalogs: unitycatalog.CatalogsService;

    /**
     * Cluster policy limits the ability to configure clusters based on a set of
     * rules. The policy rules limit the attributes or attribute values available for
     * cluster creation. Cluster policies have ACLs that limit their use to specific
     * users and groups.
     *
     * Cluster policies let you limit users to create clusters with prescribed
     * settings, simplify the user interface and enable more users to create their
     * own clusters (by fixing and hiding some values), control cost by limiting per
     * cluster maximum cost (by setting limits on attributes whose values contribute
     * to hourly price).
     *
     * Cluster policy permissions limit which policies a user can select in the
     * Policy drop-down when the user creates a cluster: - A user who has cluster
     * create permission can select the Unrestricted policy and create
     * fully-configurable clusters. - A user who has both cluster create permission
     * and access to cluster policies can select the Unrestricted policy and policies
     * they have access to. - A user that has access to only cluster policies, can
     * select the policies they have access to.
     *
     * If no policies have been created in the workspace, the Policy drop-down does
     * not display.
     *
     * Only admin users can create, edit, and delete policies. Admin users also have
     * access to all policies.
     */
    readonly clusterPolicies: clusterpolicies.ClusterPoliciesService;

    /**
     * The Clusters API allows you to create, start, edit, list, terminate, and
     * delete clusters.
     *
     * Databricks maps cluster node instance types to compute units known as DBUs.
     * See the instance type pricing page for a list of the supported instance types
     * and their corresponding DBUs.
     *
     * A Databricks cluster is a set of computation resources and configurations on
     * which you run data engineering, data science, and data analytics workloads,
     * such as production ETL pipelines, streaming analytics, ad-hoc analytics, and
     * machine learning.
     *
     * You run these workloads as a set of commands in a notebook or as an automated
     * job. Databricks makes a distinction between all-purpose clusters and job
     * clusters. You use all-purpose clusters to analyze data collaboratively using
     * interactive notebooks. You use job clusters to run fast and robust automated
     * jobs.
     *
     * You can create an all-purpose cluster using the UI, CLI, or REST API. You can
     * manually terminate and restart an all-purpose cluster. Multiple users can
     * share such clusters to do collaborative interactive analysis.
     *
     * IMPORTANT: Databricks retains cluster configuration information for up to 200
     * all-purpose clusters terminated in the last 30 days and up to 30 job clusters
     * recently terminated by the job scheduler. To keep an all-purpose cluster
     * configuration even after it has been terminated for more than 30 days, an
     * administrator can pin a cluster to the cluster list.
     */
    readonly clusters: clusters.ClustersService;

    /**
     * This API allows executing commands on running clusters.
     */
    readonly commands: commands.CommandExecutionService;

    /**
     * This API allows retrieving information about currently authenticated user or
     * service principal.
     */
    readonly currentUser: scim.CurrentUserService;

    /**
     * In general, there is little need to modify dashboards using the API. However,
     * it can be useful to use dashboard objects to look-up a collection of related
     * query IDs. The API can also be used to duplicate multiple dashboards at once
     * since you can get a dashboard definition with a GET request and then POST it
     * to create a new one.
     */
    readonly dashboards: sql.DashboardsService;

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
    readonly dataSources: sql.DataSourcesService;

    /**
     * DBFS API makes it simple to interact with various data sources without having
     * to include a users credentials every time to read a file.
     */
    readonly dbfs: dbfs.DbfsService;

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
    readonly dbsqlPermissions: sql.DbsqlPermissionsService;

    /**
    
    */
    readonly experiments: mlflow.ExperimentsService;

    /**
     * An external location is an object that combines a cloud storage path with a
     * storage credential that authorizes access to the cloud storage path. Each
     * external location is subject to Unity Catalog access-control policies that
     * control which users and groups can access the credential. If a user does not
     * have access to an external location in Unity Catalog, the request fails and
     * Unity Catalog does not attempt to authenticate to your cloud tenant on the
     * user’s behalf.
     *
     * Databricks recommends using external locations rather than using storage
     * credentials directly.
     *
     * To create external locations, you must be a metastore admin or a user with the
     * CREATE_EXTERNAL_LOCATION privilege.
     */
    readonly externalLocations: unitycatalog.ExternalLocationsService;

    /**
     * Registers personal access token for Databricks to do operations on behalf of
     * the user.
     *
     * See [more info].
     *
     * [more info]: https://docs.databricks.com/repos/get-access-tokens-from-git-provider.html
     */
    readonly gitCredentials: gitcredentials.GitCredentialsService;

    /**
     * The Global Init Scripts API enables Workspace administrators to configure
     * global initialization scripts for their workspace. These scripts run on every
     * node in every cluster in the workspace.
     *
     * **Important:** Existing clusters must be restarted to pick up any changes made
     * to global init scripts. Global init scripts are run in order. If the init
     * script returns with a bad exit code, the Apache Spark container fails to
     * launch and init scripts with later position are skipped. If enough containers
     * fail, the entire cluster fails with a `GLOBAL_INIT_SCRIPT_FAILURE` error code.
     */
    readonly globalInitScripts: globalinitscripts.GlobalInitScriptsService;

    /**
     * In Unity Catalog, data is secure by default. Initially, users have no access
     * to data in a metastore. Access can be granted by either a metastore admin, the
     * owner of an object, or the owner of the catalog or schema that contains the
     * object. Securable objects in Unity Catalog are hierarchical and privileges are
     * inherited downward.
     *
     * Initially, users have no access to data in a metastore. Access can be granted
     * by either a metastore admin, the owner of an object, or the owner of the
     * catalog or schema that contains the object.
     *
     * Securable objects in Unity Catalog are hierarchical and privileges are
     * inherited downward. This means that granting a privilege on the catalog
     * automatically grants the privilege to all current and future objects within
     * the catalog. Similarly, privileges granted on a schema are inherited by all
     * current and future objects within that schema.
     */
    readonly grants: unitycatalog.GrantsService;

    /**
     * Groups simplify identity management, making it easier to assign access to
     * Databricks Workspace, data, and other securable objects.
     *
     * It is best practice to assign access to workspaces and access-control policies
     * in Unity Catalog to groups, instead of to users individually. All Databricks
     * Workspace identities can be assigned as members of groups, and members inherit
     * permissions that are assigned to their group.
     */
    readonly groups: scim.GroupsService;

    /**
     * Instance Pools API are used to create, edit, delete and list instance pools by
     * using ready-to-use cloud instances which reduces a cluster start and
     * auto-scaling times.
     *
     * Databricks pools reduce cluster start and auto-scaling times by maintaining a
     * set of idle, ready-to-use instances. When a cluster is attached to a pool,
     * cluster nodes are created using the pool’s idle instances. If the pool has
     * no idle instances, the pool expands by allocating a new instance from the
     * instance provider in order to accommodate the cluster’s request. When a
     * cluster releases an instance, it returns to the pool and is free for another
     * cluster to use. Only clusters attached to a pool can use that pool’s idle
     * instances.
     *
     * You can specify a different pool for the driver node and worker nodes, or use
     * the same pool for both.
     *
     * Databricks does not charge DBUs while instances are idle in the pool. Instance
     * provider billing does apply. See pricing.
     */
    readonly instancePools: instancepools.InstancePoolsService;

    /**
     * The Instance Profiles API allows admins to add, list, and remove instance
     * profiles that users can launch clusters with. Regular users can list the
     * instance profiles available to them. See [Secure access to S3 buckets] using
     * instance profiles for more information.
     *
     * [Secure access to S3 buckets]: https://docs.databricks.com/administration-guide/cloud-configurations/aws/instance-profiles.html
     */
    readonly instanceProfiles: clusters.InstanceProfilesService;

    /**
     * The IP Access List API enables Databricks admins to configure IP access lists
     * for a workspace.
     *
     * IP access lists affect web application access and REST API access to this
     * workspace only. If the feature is disabled for a workspace, all access is
     * allowed for this workspace. There is support for allow lists (inclusion) and
     * block lists (exclusion).
     *
     * When a connection is attempted: 1. **First, all block lists are checked.** If
     * the connection IP address matches any block list, the connection is rejected.
     * 2. **If the connection was not rejected by block lists**, the IP address is
     * compared with the allow lists.
     *
     * If there is at least one allow list for the workspace, the connection is
     * allowed only if the IP address matches an allow list. If there are no allow
     * lists for the workspace, all IP addresses are allowed.
     *
     * For all allow lists and block lists combined, the workspace supports a maximum
     * of 1000 IP/CIDR values, where one CIDR counts as a single value.
     *
     * After changes to the IP access list feature, it can take a few minutes for
     * changes to take effect.
     */
    readonly ipAccessLists: ipaccesslists.IpAccessListsService;

    /**
     * The Jobs API allows you to create, edit, and delete jobs.
     *
     * You can use a Databricks job to run a data processing or data analysis task in
     * a Databricks cluster with scalable resources. Your job can consist of a single
     * task or can be a large, multi-task workflow with complex dependencies.
     * Databricks manages the task orchestration, cluster management, monitoring, and
     * error reporting for all of your jobs. You can run your jobs immediately or
     * periodically through an easy-to-use scheduling system. You can implement job
     * tasks using notebooks, JARS, Delta Live Tables pipelines, or Python, Scala,
     * Spark submit, and Java applications.
     *
     * You should never hard code secrets or store them in plain text. Use the
     * :service:secrets to manage secrets in the [Databricks CLI]. Use the [Secrets
     * utility] to reference secrets in notebooks and jobs.
     *
     * [Databricks CLI]: https://docs.databricks.com/dev-tools/cli/index.html
     * [Secrets utility]: https://docs.databricks.com/dev-tools/databricks-utils.html#dbutils-secrets
     */
    readonly jobs: jobs.JobsService;

    /**
     * The Libraries API allows you to install and uninstall libraries and get the
     * status of libraries on a cluster.
     *
     * To make third-party or custom code available to notebooks and jobs running on
     * your clusters, you can install a library. Libraries can be written in Python,
     * Java, Scala, and R. You can upload Java, Scala, and Python libraries and point
     * to external packages in PyPI, Maven, and CRAN repositories.
     *
     * Cluster libraries can be used by all notebooks running on a cluster. You can
     * install a cluster library directly from a public repository such as PyPI or
     * Maven, using a previously installed workspace library, or using an init
     * script.
     *
     * When you install a library on a cluster, a notebook already attached to that
     * cluster will not immediately see the new library. You must first detach and
     * then reattach the notebook to the cluster.
     *
     * When you uninstall a library from a cluster, the library is removed only when
     * you restart the cluster. Until you restart the cluster, the status of the
     * uninstalled library appears as Uninstall pending restart.
     */
    readonly libraries: libraries.LibrariesService;

    /**
    
    */
    readonly mLflowArtifacts: mlflow.MLflowArtifactsService;

    /**
     * These endpoints are modified versions of the MLflow API that accept additional
     * input parameters or return additional information.
     */
    readonly mLflowDatabricks: mlflow.MLflowDatabricksService;

    /**
    
    */
    readonly mLflowMetrics: mlflow.MLflowMetricsService;

    /**
    
    */
    readonly mLflowRuns: mlflow.MLflowRunsService;

    /**
     * A metastore is the top-level container of objects in Unity Catalog. It stores
     * data assets (tables and views) and the permissions that govern access to them.
     * Databricks account admins can create metastores and assign them to Databricks
     * workspaces to control which workloads use each metastore. For a workspace to
     * use Unity Catalog, it must have a Unity Catalog metastore attached.
     *
     * Each metastore is configured with a root storage location in a cloud storage
     * account. This storage location is used for metadata and managed tables data.
     *
     * NOTE: This metastore is distinct from the metastore included in Databricks
     * workspaces created before Unity Catalog was released. If your workspace
     * includes a legacy Hive metastore, the data in that metastore is available in
     * Unity Catalog in a catalog named hive_metastore.
     */
    readonly metastores: unitycatalog.MetastoresService;

    /**
    
    */
    readonly modelVersionComments: mlflow.ModelVersionCommentsService;

    /**
    
    */
    readonly modelVersions: mlflow.ModelVersionsService;

    /**
     * Permissions API are used to create read, write, edit, update and manage access
     * for various users on different objects and endpoints.
     */
    readonly permissions: permissions.PermissionsService;

    /**
     * The Delta Live Tables API allows you to create, edit, delete, start, and view
     * details about pipelines.
     *
     * Delta Live Tables is a framework for building reliable, maintainable, and
     * testable data processing pipelines. You define the transformations to perform
     * on your data, and Delta Live Tables manages task orchestration, cluster
     * management, monitoring, data quality, and error handling.
     *
     * Instead of defining your data pipelines using a series of separate Apache
     * Spark tasks, Delta Live Tables manages how your data is transformed based on a
     * target schema you define for each processing step. You can also enforce data
     * quality with Delta Live Tables expectations. Expectations allow you to define
     * expected data quality and specify how to handle records that fail those
     * expectations.
     */
    readonly pipelines: pipelines.PipelinesService;

    /**
     * View available policy families. A policy family contains a policy definition
     * providing best practices for configuring clusters for a particular use case.
     *
     * Databricks manages and provides policy families for several common cluster use
     * cases. You cannot create, edit, or delete policy families.
     *
     * Policy families cannot be used directly to create clusters. Instead, you
     * create cluster policies using a policy family. Cluster policies created using
     * a policy family inherit the policy family's policy definition.
     */
    readonly policyFamilies: clusterpolicies.PolicyFamiliesService;

    /**
     * Databricks Delta Sharing: Providers REST API
     */
    readonly providers: unitycatalog.ProvidersService;

    /**
     * These endpoints are used for CRUD operations on query definitions. Query
     * definitions include the target SQL warehouse, query text, name, description,
     * tags, execution schedule, parameters, and visualizations.
     */
    readonly queries: sql.QueriesService;

    /**
     * Access the history of queries through SQL warehouses.
     */
    readonly queryHistory: sql.QueryHistoryService;

    /**
     * Databricks Delta Sharing: Recipient Activation REST API
     */
    readonly recipientActivation: unitycatalog.RecipientActivationService;

    /**
     * Databricks Delta Sharing: Recipients REST API
     */
    readonly recipients: unitycatalog.RecipientsService;

    /**
    
    */
    readonly registeredModels: mlflow.RegisteredModelsService;

    /**
    
    */
    readonly registryWebhooks: mlflow.RegistryWebhooksService;

    /**
     * The Repos API allows users to manage their git repos. Users can use the API to
     * access all repos that they have manage permissions on.
     *
     * Databricks Repos is a visual Git client in Databricks. It supports common Git
     * operations such a cloning a repository, committing and pushing, pulling,
     * branch management, and visual comparison of diffs when committing.
     *
     * Within Repos you can develop code in notebooks or other files and follow data
     * science and engineering code development best practices using Git for version
     * control, collaboration, and CI/CD.
     */
    readonly repos: repos.ReposService;

    /**
     * A schema (also called a database) is the second layer of Unity Catalog’s
     * three-level namespace. A schema organizes tables and views. To access (or
     * list) a table or view in a schema, users must have the USE_SCHEMA data
     * permission on the schema and its parent catalog, and they must have the SELECT
     * permission on the table or view.
     */
    readonly schemas: unitycatalog.SchemasService;

    /**
     * The Secrets API allows you to manage secrets, secret scopes, and access
     * permissions.
     *
     * Sometimes accessing data requires that you authenticate to external data
     * sources through JDBC. Instead of directly entering your credentials into a
     * notebook, use Databricks secrets to store your credentials and reference them
     * in notebooks and jobs.
     *
     * Administrators, secret creators, and users granted permission can read
     * Databricks secrets. While Databricks makes an effort to redact secret values
     * that might be displayed in notebooks, it is not possible to prevent such users
     * from reading secrets.
     */
    readonly secrets: secrets.SecretsService;

    /**
     * Identities for use with jobs, automated tools, and systems such as scripts,
     * apps, and CI/CD platforms. Databricks recommends creating service principals
     * to run production jobs or modify production data. If all processes that act on
     * production data run with service principals, interactive users do not need any
     * write, delete, or modify privileges in production. This eliminates the risk of
     * a user overwriting production data by accident.
     */
    readonly servicePrincipals: scim.ServicePrincipalsService;

    /**
     * Databricks Delta Sharing: Shares REST API
     */
    readonly shares: unitycatalog.SharesService;

    /**
     * A storage credential represents an authentication and authorization mechanism
     * for accessing data stored on your cloud tenant, using an IAM role. Each
     * storage credential is subject to Unity Catalog access-control policies that
     * control which users and groups can access the credential. If a user does not
     * have access to a storage credential in Unity Catalog, the request fails and
     * Unity Catalog does not attempt to authenticate to your cloud tenant on the
     * user’s behalf.
     *
     * Databricks recommends using external locations rather than using storage
     * credentials directly.
     *
     * To create storage credentials, you must be a Databricks account admin. The
     * account admin who creates the storage credential can delegate ownership to
     * another user or group to manage permissions on it.
     */
    readonly storageCredentials: unitycatalog.StorageCredentialsService;

    /**
     * A table resides in the third layer of Unity Catalog’s three-level namespace.
     * It contains rows of data. To create a table, users must have CREATE_TABLE and
     * USE_SCHEMA permissions on the schema, and they must have the USE_CATALOG
     * permission on its parent catalog. To query a table, users must have the SELECT
     * permission on the table, and they must have the USE_CATALOG permission on its
     * parent catalog and the USE_SCHEMA permission on its parent schema.
     *
     * A table can be managed or external.
     */
    readonly tables: unitycatalog.TablesService;

    /**
     * Enables administrators to get all tokens and delete tokens for other users.
     * Admins can either get every token, get a specific token by ID, or get all
     * tokens for a particular user.
     */
    readonly tokenManagement: tokenmanagement.TokenManagementService;

    /**
     * The Token API allows you to create, list, and revoke tokens that can be used
     * to authenticate and access Databricks REST APIs.
     */
    readonly tokens: tokens.TokensService;

    /**
    
    */
    readonly transitionRequests: mlflow.TransitionRequestsService;

    /**
     * User identities recognized by Databricks and represented by email addresses.
     *
     * Databricks recommends using SCIM provisioning to sync users and groups
     * automatically from your identity provider to your Databricks Workspace. SCIM
     * streamlines onboarding a new employee or team by using your identity provider
     * to create users and groups in Databricks Workspace and give them the proper
     * level of access. When a user leaves your organization or no longer needs
     * access to Databricks Workspace, admins can terminate the user in your identity
     * provider and that user’s account will also be removed from Databricks
     * Workspace. This ensures a consistent offboarding process and prevents
     * unauthorized users from accessing sensitive data.
     */
    readonly users: scim.UsersService;

    /**
     * A SQL warehouse is a compute resource that lets you run SQL commands on data
     * objects within Databricks SQL. Compute resources are infrastructure resources
     * that provide processing capabilities in the cloud.
     */
    readonly warehouses: sql.WarehousesService;

    /**
     * The Workspace API allows you to list, import, export, and delete notebooks and
     * folders.
     *
     * A notebook is a web-based interface to a document that contains runnable code,
     * visualizations, and explanatory text.
     */
    readonly workspace: workspace.WorkspaceService;

    /**
     * This API allows updating known workspace settings for advanced users.
     */
    readonly workspaceConf: workspaceconf.WorkspaceConfService;

    constructor(config: ConfigOptions | Config, options: ClientOptions = {}) {
        if (!(config instanceof Config)) {
            config = new Config(config);
        }

        this.config = config as Config;
        this.apiClient = new ApiClient(this.config, options);

        this.alerts = new sql.AlertsService(this.apiClient);
        this.catalogs = new unitycatalog.CatalogsService(this.apiClient);
        this.clusterPolicies = new clusterpolicies.ClusterPoliciesService(
            this.apiClient
        );
        this.clusters = new clusters.ClustersService(this.apiClient);
        this.commands = new commands.CommandExecutionService(this.apiClient);
        this.currentUser = new scim.CurrentUserService(this.apiClient);
        this.dashboards = new sql.DashboardsService(this.apiClient);
        this.dataSources = new sql.DataSourcesService(this.apiClient);
        this.dbfs = new dbfs.DbfsService(this.apiClient);
        this.dbsqlPermissions = new sql.DbsqlPermissionsService(this.apiClient);
        this.experiments = new mlflow.ExperimentsService(this.apiClient);
        this.externalLocations = new unitycatalog.ExternalLocationsService(
            this.apiClient
        );
        this.gitCredentials = new gitcredentials.GitCredentialsService(
            this.apiClient
        );
        this.globalInitScripts = new globalinitscripts.GlobalInitScriptsService(
            this.apiClient
        );
        this.grants = new unitycatalog.GrantsService(this.apiClient);
        this.groups = new scim.GroupsService(this.apiClient);
        this.instancePools = new instancepools.InstancePoolsService(
            this.apiClient
        );
        this.instanceProfiles = new clusters.InstanceProfilesService(
            this.apiClient
        );
        this.ipAccessLists = new ipaccesslists.IpAccessListsService(
            this.apiClient
        );
        this.jobs = new jobs.JobsService(this.apiClient);
        this.libraries = new libraries.LibrariesService(this.apiClient);
        this.mLflowArtifacts = new mlflow.MLflowArtifactsService(
            this.apiClient
        );
        this.mLflowDatabricks = new mlflow.MLflowDatabricksService(
            this.apiClient
        );
        this.mLflowMetrics = new mlflow.MLflowMetricsService(this.apiClient);
        this.mLflowRuns = new mlflow.MLflowRunsService(this.apiClient);
        this.metastores = new unitycatalog.MetastoresService(this.apiClient);
        this.modelVersionComments = new mlflow.ModelVersionCommentsService(
            this.apiClient
        );
        this.modelVersions = new mlflow.ModelVersionsService(this.apiClient);
        this.permissions = new permissions.PermissionsService(this.apiClient);
        this.pipelines = new pipelines.PipelinesService(this.apiClient);
        this.policyFamilies = new clusterpolicies.PolicyFamiliesService(
            this.apiClient
        );
        this.providers = new unitycatalog.ProvidersService(this.apiClient);
        this.queries = new sql.QueriesService(this.apiClient);
        this.queryHistory = new sql.QueryHistoryService(this.apiClient);
        this.recipientActivation = new unitycatalog.RecipientActivationService(
            this.apiClient
        );
        this.recipients = new unitycatalog.RecipientsService(this.apiClient);
        this.registeredModels = new mlflow.RegisteredModelsService(
            this.apiClient
        );
        this.registryWebhooks = new mlflow.RegistryWebhooksService(
            this.apiClient
        );
        this.repos = new repos.ReposService(this.apiClient);
        this.schemas = new unitycatalog.SchemasService(this.apiClient);
        this.secrets = new secrets.SecretsService(this.apiClient);
        this.servicePrincipals = new scim.ServicePrincipalsService(
            this.apiClient
        );
        this.shares = new unitycatalog.SharesService(this.apiClient);
        this.storageCredentials = new unitycatalog.StorageCredentialsService(
            this.apiClient
        );
        this.tables = new unitycatalog.TablesService(this.apiClient);
        this.tokenManagement = new tokenmanagement.TokenManagementService(
            this.apiClient
        );
        this.tokens = new tokens.TokensService(this.apiClient);
        this.transitionRequests = new mlflow.TransitionRequestsService(
            this.apiClient
        );
        this.users = new scim.UsersService(this.apiClient);
        this.warehouses = new sql.WarehousesService(this.apiClient);
        this.workspace = new workspace.WorkspaceService(this.apiClient);
        this.workspaceConf = new workspaceconf.WorkspaceConfService(
            this.apiClient
        );
    }
}
