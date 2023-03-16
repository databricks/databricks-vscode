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
import * as endpoints from "./apis/endpoints";
import * as gitcredentials from "./apis/gitcredentials";
import * as globalinitscripts from "./apis/globalinitscripts";
import * as instancepools from "./apis/instancepools";
import * as ipaccesslists from "./apis/ipaccesslists";
import * as jobs from "./apis/jobs";
import * as libraries from "./apis/libraries";
import * as mlflow from "./apis/mlflow";
import * as oauth2 from "./apis/oauth2";
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
     * its result, and notifies one or more users and/or notification destinations if
     * the condition was met.
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
     * **CREATE_EXTERNAL_LOCATION** privilege.
     */
    readonly externalLocations: unitycatalog.ExternalLocationsService;

    /**
     * Functions implement User-Defined Functions (UDFs) in Unity Catalog.
     *
     * The function implementation can be any SQL expression or Query, and it can be
     * invoked wherever a table reference is allowed in a query. In Unity Catalog, a
     * function resides at the same level as a table, so it can be referenced with
     * the form __catalog_name__.__schema_name__.__function_name__.
     */
    readonly functions: unitycatalog.FunctionsService;

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
     * IP Access List enables admins to configure IP access lists.
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
     * includes a legacy Hive metastore, the data in that metastore is available in a
     * catalog named hive_metastore.
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
     * tags, parameters, and visualizations.
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
     * three-level namespace. A schema organizes tables, views and functions. To
     * access (or list) a table or view in a schema, users must have the USE_SCHEMA
     * data permission on the schema and its parent catalog, and they must have the
     * SELECT permission on the table or view.
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
     * The Serving Endpoints API allows you to create, update, and delete model
     * serving endpoints.
     *
     * You can use a serving endpoint to serve models from the Databricks Model
     * Registry. Endpoints expose the underlying models as scalable REST API
     * endpoints using serverless compute. This means the endpoints and associated
     * compute resources are fully managed by Databricks and will not appear in your
     * cloud account. A serving endpoint can consist of one or more MLflow models
     * from the Databricks Model Registry, called served models. A serving endpoint
     * can have at most ten served models. You can configure traffic settings to
     * define how requests should be routed to your served models behind an endpoint.
     * Additionally, you can configure the scale of resources that should be applied
     * to each served model.
     */
    readonly servingEndpoints: endpoints.ServingEndpointsService;

    /**
     * Databricks Delta Sharing: Shares REST API
     */
    readonly shares: unitycatalog.SharesService;

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
    readonly statementExecution: sql.StatementExecutionService;

    /**
     * A storage credential represents an authentication and authorization mechanism
     * for accessing data stored on your cloud tenant. Each storage credential is
     * subject to Unity Catalog access-control policies that control which users and
     * groups can access the credential. If a user does not have access to a storage
     * credential in Unity Catalog, the request fails and Unity Catalog does not
     * attempt to authenticate to your cloud tenant on the user’s behalf.
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
     * Primary key and foreign key constraints encode relationships between fields in
     * tables.
     *
     * Primary and foreign keys are informational only and are not enforced. Foreign
     * keys must reference a primary key in another table. This primary key is the
     * parent constraint of the foreign key and the table this primary key is on is
     * the parent table of the foreign key. Similarly, the foreign key is the child
     * constraint of its referenced primary key; the table of the foreign key is the
     * child table of the primary key.
     *
     * You can declare primary keys and foreign keys as part of the table
     * specification during table creation. You can also add or drop constraints on
     * existing tables.
     */
    readonly tableConstraints: unitycatalog.TableConstraintsService;

    /**
     * A table resides in the third layer of Unity Catalog’s three-level namespace.
     * It contains rows of data. To create a table, users must have CREATE_TABLE and
     * USE_SCHEMA permissions on the schema, and they must have the USE_CATALOG
     * permission on its parent catalog. To query a table, users must have the SELECT
     * permission on the table, and they must have the USE_CATALOG permission on its
     * parent catalog and the USE_SCHEMA permission on its parent schema.
     *
     * A table can be managed or external. From an API perspective, a __VIEW__ is a
     * particular kind of table (rather than a managed or external table).
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
        this.functions = new unitycatalog.FunctionsService(this.apiClient);
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
        this.servingEndpoints = new endpoints.ServingEndpointsService(
            this.apiClient
        );
        this.shares = new unitycatalog.SharesService(this.apiClient);
        this.statementExecution = new sql.StatementExecutionService(
            this.apiClient
        );
        this.storageCredentials = new unitycatalog.StorageCredentialsService(
            this.apiClient
        );
        this.tableConstraints = new unitycatalog.TableConstraintsService(
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
