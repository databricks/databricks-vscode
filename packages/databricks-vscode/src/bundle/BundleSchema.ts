/* eslint-disable */
// To parse this data:
//
//   import { Convert, BundleSchema } from "./file";
//
//   const bundleSchema = Convert.toBundleSchema(json);
//
// These functions will throw an error if the JSON doesn't
// match the expected interface, even if the JSON is valid.

export interface BundleSchema {
    /**
     * Defines the attributes to build an artifact
     */
    artifacts?: {[key: string]: ArtifactClass | string} | string;
    /**
     * The bundle attributes when deploying to this target.
     */
    bundle?: BundleClass | string;
    environments?: {[key: string]: TargetClass | string} | string;
    /**
     * Defines attributes for experimental features.
     */
    experimental?: ExperimentalClass | string;
    /**
     * Specifies a list of path globs that contain configuration files to include within the
     * bundle.
     */
    include?: string[] | string;
    /**
     * Defines a permission for a specific entity.
     */
    permissions?: Array<FluffyBundleSchem | string> | string;
    /**
     * Defines bundle deployment presets.
     */
    presets?: PresetsClass | string;
    /**
     * A Map that defines the resources for the bundle, where each key is the name of the
     * resource, and the value is a Map that defines the resource.
     */
    resources?: ResourcesClass | string;
    /**
     * The identity to use when running Databricks Asset Bundles workflows.
     */
    run_as?: BundleSchem6 | string;
    /**
     * The files and file paths to include or exclude in the bundle.
     */
    sync?: SyncClass | string;
    /**
     * Defines deployment targets for the bundle.
     */
    targets?: {[key: string]: TargetClass | string} | string;
    /**
     * A Map that defines the custom variables for the bundle, where each key is the name of the
     * variable, and the value is a Map that defines the variable.
     */
    variables?: {[key: string]: VariableValue} | string;
    /**
     * Defines the Databricks workspace for the bundle.
     */
    workspace?: BundleSchem36 | string;
    [property: string]: any;
}

export interface ArtifactClass {
    /**
     * An optional set of build commands to run locally before deployment.
     */
    build?: string;
    /**
     * Whether to patch the wheel version dynamically based on the timestamp of the whl file. If
     * this is set to `true`, new code can be deployed without having to update the version in
     * `setup.py` or `pyproject.toml`. This setting is only valid when `type` is set to `whl`.
     * See [\_](/dev-tools/bundles/settings.md#bundle-syntax-mappings-artifacts).
     */
    dynamic_version?: boolean | string;
    /**
     * The executable type. Valid values are `bash`, `sh`, and `cmd`.
     */
    executable?: string;
    /**
     * The relative or absolute path to the built artifact files.
     */
    files?: Array<PurpleBundleSchem | string> | string;
    /**
     * The local path of the directory for the artifact.
     */
    path?: string;
    /**
     * Required if the artifact is a Python wheel. The type of the artifact. Valid values are
     * `whl` and `jar`.
     */
    type?: string;
}

export interface PurpleBundleSchem {
    /**
     * Required. The artifact source file.
     */
    source: string;
}

export interface BundleClass {
    /**
     * The ID of a cluster to use to run the bundle.
     */
    cluster_id?: string;
    /**
     * Deprecated. The ID of the compute to use to run the bundle.
     */
    compute_id?: string;
    /**
     * The Databricks CLI version to use for the bundle.
     */
    databricks_cli_version?: string;
    /**
     * The definition of the bundle deployment
     */
    deployment?: DeploymentClass | string;
    /**
     * The Git version control details that are associated with your bundle.
     */
    git?: GitClass | string;
    /**
     * The name of the bundle.
     */
    name: string;
    /**
     * Reserved. A Universally Unique Identifier (UUID) for the bundle that uniquely identifies
     * the bundle in internal Databricks systems. This is generated when a bundle project is
     * initialized using a Databricks template (using the `databricks bundle init` command).
     */
    uuid?: string;
}

export interface DeploymentClass {
    /**
     * Whether to fail on active runs. If this is set to true a deployment that is running can
     * be interrupted.
     */
    fail_on_active_runs?: boolean | string;
    /**
     * The deployment lock attributes.
     */
    lock?: LockClass | string;
}

export interface LockClass {
    /**
     * Whether this lock is enabled.
     */
    enabled?: boolean | string;
    /**
     * Whether to force this lock if it is enabled.
     */
    force?: boolean | string;
}

export interface GitClass {
    /**
     * The Git branch name.
     */
    branch?: string;
    /**
     * The origin URL of the repository.
     */
    origin_url?: string;
}

export interface TargetClass {
    /**
     * The artifacts to include in the target deployment.
     */
    artifacts?: {[key: string]: ArtifactClass | string} | string;
    /**
     * The bundle attributes when deploying to this target.
     */
    bundle?: BundleClass | string;
    /**
     * The ID of the cluster to use for this target.
     */
    cluster_id?: string;
    /**
     * Deprecated. The ID of the compute to use for this target.
     */
    compute_id?: string;
    /**
     * Whether this target is the default target.
     */
    default?: boolean | string;
    /**
     * The Git version control settings for the target.
     */
    git?: GitClass | string;
    /**
     * The deployment mode for the target.
     */
    mode?: string;
    /**
     * The permissions for deploying and running the bundle in the target.
     */
    permissions?: Array<FluffyBundleSchem | string> | string;
    /**
     * The deployment presets for the target.
     */
    presets?: PresetsClass | string;
    /**
     * The resource definitions for the target.
     */
    resources?: ResourcesClass | string;
    /**
     * The identity to use to run the bundle.
     */
    run_as?: BundleSchem6 | string;
    /**
     * The local paths to sync to the target workspace when a bundle is run or deployed.
     */
    sync?: SyncClass | string;
    /**
     * The custom variable definitions for the target.
     */
    variables?: {[key: string]: any} | string;
    /**
     * The Databricks workspace for the target.
     */
    workspace?: BundleSchem36 | string;
}

export interface FluffyBundleSchem {
    /**
     * The name of the group that has the permission set in level.
     */
    group_name?: string;
    /**
     * The allowed permission for user, group, service principal defined for this permission.
     */
    level: string;
    /**
     * The name of the service principal that has the permission set in level.
     */
    service_principal_name?: string;
    /**
     * The name of the user that has the permission set in level.
     */
    user_name?: string;
}

export interface PresetsClass {
    /**
     * Whether to enable dynamic_version on all artifacts.
     */
    artifacts_dynamic_version?: boolean | string;
    /**
     * The maximum concurrent runs for a job.
     */
    jobs_max_concurrent_runs?: number | string;
    /**
     * The prefix for job runs of the bundle.
     */
    name_prefix?: string;
    /**
     * Whether pipeline deployments should be locked in development mode.
     */
    pipelines_development?: boolean | string;
    /**
     * Whether to link the deployment to the bundle source.
     */
    source_linked_deployment?: boolean | string;
    /**
     * The tags for the bundle deployment.
     */
    tags?: {[key: string]: string} | string;
    /**
     * A pause status to apply to all job triggers and schedules. Valid values are PAUSED or
     * UNPAUSED.
     */
    trigger_pause_status?: string;
}

export interface ResourcesClass {
    /**
     * The app resource defines a Databricks app.
     */
    apps?: {[key: string]: AppClass | string} | string;
    /**
     * The cluster definitions for the bundle, where each key is the name of a cluster.
     */
    clusters?: {[key: string]: IndigoBundleSchem | string} | string;
    /**
     * The dashboard definitions for the bundle, where each key is the name of the dashboard.
     */
    dashboards?: {[key: string]: MagentaBundleSchem | string} | string;
    /**
     * The experiment definitions for the bundle, where each key is the name of the experiment.
     */
    experiments?: {[key: string]: ExperimentClass | string} | string;
    /**
     * The job definitions for the bundle, where each key is the name of the job.
     */
    jobs?: {[key: string]: BundleSchem1 | string} | string;
    /**
     * The model serving endpoint definitions for the bundle, where each key is the name of the
     * model serving endpoint.
     */
    model_serving_endpoints?:
        | {[key: string]: ModelServingEndpointClass | string}
        | string;
    /**
     * The model definitions for the bundle, where each key is the name of the model.
     */
    models?: {[key: string]: ModelClass | string} | string;
    /**
     * The pipeline definitions for the bundle, where each key is the name of the pipeline.
     */
    pipelines?: {[key: string]: PipelineClass | string} | string;
    /**
     * The quality monitor definitions for the bundle, where each key is the name of the quality
     * monitor.
     */
    quality_monitors?: {[key: string]: QualityMonitorClass | string} | string;
    /**
     * The registered model definitions for the bundle, where each key is the name of the Unity
     * Catalog registered model.
     */
    registered_models?: {[key: string]: RegisteredModelClass | string} | string;
    /**
     * The schema definitions for the bundle, where each key is the name of the schema.
     */
    schemas?: {[key: string]: BundleSchem34 | string} | string;
    secret_scopes?: {[key: string]: SecretScopeClass | string} | string;
    /**
     * The volume definitions for the bundle, where each key is the name of the volume.
     */
    volumes?: {[key: string]: VolumeClass | string} | string;
}

export interface AppClass {
    /**
     * The active deployment of the app. A deployment is considered active when it has been
     * deployed
     * to the app compute.
     */
    active_deployment?: ActiveDeploymentClass | string;
    app_status?: AppStatusClass | string;
    budget_policy_id?: string;
    compute_status?: ComputeStatusClass | string;
    config?: {[key: string]: any} | string;
    /**
     * The creation time of the app. Formatted timestamp in ISO 6801.
     */
    create_time?: string;
    /**
     * The email of the user that created the app.
     */
    creator?: string;
    /**
     * The default workspace file system path of the source code from which app deployment are
     * created. This field tracks the workspace source code path of the last active deployment.
     */
    default_source_code_path?: string;
    /**
     * The description of the app.
     */
    description?: string;
    effective_budget_policy_id?: string;
    /**
     * The effective api scopes granted to the user access token.
     */
    effective_user_api_scopes?: string[] | string;
    /**
     * The unique identifier of the app.
     */
    id?: string;
    /**
     * The name of the app. The name must contain only lowercase alphanumeric characters and
     * hyphens.
     * It must be unique within the workspace.
     */
    name: string;
    oauth2_app_client_id?: string;
    oauth2_app_integration_id?: string;
    /**
     * The pending deployment of the app. A deployment is considered pending when it is being
     * prepared
     * for deployment to the app compute.
     */
    pending_deployment?: ActiveDeploymentClass | string;
    permissions?: Array<TentacledBundleSchem | string> | string;
    /**
     * Resources for the app.
     */
    resources?: Array<ResourceClass | string> | string;
    service_principal_client_id?: string;
    service_principal_id?: number | string;
    service_principal_name?: string;
    source_code_path: string;
    /**
     * The update time of the app. Formatted timestamp in ISO 6801.
     */
    update_time?: string;
    /**
     * The email of the user that last updated the app.
     */
    updater?: string;
    /**
     * The URL of the app once it is deployed.
     */
    url?: string;
    user_api_scopes?: string[] | string;
}

export interface ActiveDeploymentClass {
    create_time?: string;
    creator?: string;
    deployment_artifacts?: DeploymentArtifactsClass | string;
    deployment_id?: string;
    mode?: string;
    source_code_path?: string;
    status?: StatusClass | string;
    update_time?: string;
}

export interface DeploymentArtifactsClass {
    source_code_path?: string;
}

export interface StatusClass {
    message?: string;
    state?: string;
}

export interface AppStatusClass {
    message?: string;
    state?: string;
}

export interface ComputeStatusClass {
    message?: string;
    /**
     * State of the app compute.
     */
    state?: string;
}

export interface TentacledBundleSchem {
    group_name?: string;
    level: string;
    service_principal_name?: string;
    user_name?: string;
}

export interface ResourceClass {
    /**
     * Description of the App Resource.
     */
    description?: string;
    job?: StickyBundleSchem | string;
    /**
     * Name of the App Resource.
     */
    name: string;
    secret?: SecretClass | string;
    serving_endpoint?: ServingEndpointClass | string;
    sql_warehouse?: SQLWarehouseClass | string;
    uc_securable?: UcSecurableClass | string;
}

export interface StickyBundleSchem {
    id: string;
    permission: string;
}

export interface SecretClass {
    key: string;
    permission: string;
    scope: string;
}

export interface ServingEndpointClass {
    name: string;
    permission: string;
}

export interface SQLWarehouseClass {
    id: string;
    permission: string;
}

export interface UcSecurableClass {
    permission: string;
    securable_full_name: string;
    securable_type: string;
}

/**
 * Contains a snapshot of the latest user specified settings that were used to create/edit
 * the cluster.
 */
export interface IndigoBundleSchem {
    /**
     * When set to true, fixed and default values from the policy will be used for fields that
     * are omitted. When set to false, only fixed values from the policy will be applied.
     */
    apply_policy_default_values?: boolean | string;
    /**
     * Parameters needed in order to automatically scale clusters up and down based on load.
     * Note: autoscaling works best with DB runtime versions 3.0 or later.
     */
    autoscale?: IndecentBundleSchem | string;
    /**
     * Automatically terminates the cluster after it is inactive for this time in minutes. If
     * not set,
     * this cluster will not be automatically terminated. If specified, the threshold must be
     * between
     * 10 and 10000 minutes.
     * Users can also set this value to 0 to explicitly disable automatic termination.
     */
    autotermination_minutes?: number | string;
    /**
     * Attributes related to clusters running on Amazon Web Services.
     * If not specified at cluster creation, a set of default values will be used.
     */
    aws_attributes?: AwsAttributesClass | string;
    /**
     * Attributes related to clusters running on Microsoft Azure.
     * If not specified at cluster creation, a set of default values will be used.
     */
    azure_attributes?: AzureAttributesClass | string;
    /**
     * The configuration for delivering spark logs to a long-term storage destination.
     * Three kinds of destinations (DBFS, S3 and Unity Catalog volumes) are supported. Only one
     * destination can be specified
     * for one cluster. If the conf is given, the logs will be delivered to the destination
     * every
     * `5 mins`. The destination of driver logs is `$destination/$clusterId/driver`, while
     * the destination of executor logs is `$destination/$clusterId/executor`.
     */
    cluster_log_conf?: ClusterLogConfClass | string;
    /**
     * Cluster name requested by the user. This doesn't have to be unique.
     * If not specified at creation, the cluster name will be an empty string.
     * For job clusters, the cluster name is automatically set based on the job and job run IDs.
     */
    cluster_name?: string;
    /**
     * Additional tags for cluster resources. Databricks will tag all cluster resources (e.g.,
     * AWS
     * instances and EBS volumes) with these tags in addition to `default_tags`. Notes:
     *
     * - Currently, Databricks allows at most 45 custom tags
     *
     * - Clusters can only reuse cloud resources if the resources' tags are a subset of the
     * cluster tags
     */
    custom_tags?: {[key: string]: string} | string;
    data_security_mode?: string;
    docker_image?: DockerImageClass | string;
    /**
     * The optional ID of the instance pool for the driver of the cluster belongs.
     * The pool cluster uses the instance pool with id (instance_pool_id) if the driver pool is
     * not
     * assigned.
     */
    driver_instance_pool_id?: string;
    /**
     * The node type of the Spark driver.
     * Note that this field is optional; if unset, the driver node type will be set as the same
     * value
     * as `node_type_id` defined above.
     *
     * This field, along with node_type_id, should not be set if virtual_cluster_size is set.
     * If both driver_node_type_id, node_type_id, and virtual_cluster_size are specified,
     * driver_node_type_id and node_type_id take precedence.
     */
    driver_node_type_id?: string;
    /**
     * Autoscaling Local Storage: when enabled, this cluster will dynamically acquire additional
     * disk
     * space when its Spark workers are running low on disk space. This feature requires
     * specific AWS
     * permissions to function correctly - refer to the User Guide for more details.
     */
    enable_elastic_disk?: boolean | string;
    /**
     * Whether to enable LUKS on cluster VMs' local disks
     */
    enable_local_disk_encryption?: boolean | string;
    /**
     * Attributes related to clusters running on Google Cloud Platform.
     * If not specified at cluster creation, a set of default values will be used.
     */
    gcp_attributes?: GcpAttributesClass | string;
    /**
     * The configuration for storing init scripts. Any number of destinations can be specified.
     * The scripts are executed sequentially in the order provided.
     * If `cluster_log_conf` is specified, init script logs are sent to
     * `<destination>/<cluster-ID>/init_scripts`.
     */
    init_scripts?: Array<InitScriptClass | string> | string;
    /**
     * The optional ID of the instance pool to which the cluster belongs.
     */
    instance_pool_id?: string;
    /**
     * This field can only be used when `kind = CLASSIC_PREVIEW`.
     *
     * When set to true, Databricks will automatically set single node related `custom_tags`,
     * `spark_conf`, and `num_workers`
     */
    is_single_node?: boolean | string;
    kind?: string;
    /**
     * This field encodes, through a single value, the resources available to each of
     * the Spark nodes in this cluster. For example, the Spark nodes can be provisioned
     * and optimized for memory or compute intensive workloads. A list of available node
     * types can be retrieved by using the :method:clusters/listNodeTypes API call.
     */
    node_type_id?: string;
    /**
     * Number of worker nodes that this cluster should have. A cluster has one Spark Driver
     * and `num_workers` Executors for a total of `num_workers` + 1 Spark nodes.
     *
     * Note: When reading the properties of a cluster, this field reflects the desired number
     * of workers rather than the actual current number of workers. For instance, if a cluster
     * is resized from 5 to 10 workers, this field will immediately be updated to reflect
     * the target size of 10 workers, whereas the workers listed in `spark_info` will gradually
     * increase from 5 to 10 as the new nodes are provisioned.
     */
    num_workers?: number | string;
    permissions?: Array<CunningBundleSchem | string> | string;
    /**
     * The ID of the cluster policy used to create the cluster if applicable.
     */
    policy_id?: string;
    /**
     * If set, what the configurable throughput (in Mb/s) for the remote disk is. Currently only
     * supported for GCP HYPERDISK_BALANCED disks.
     */
    remote_disk_throughput?: number | string;
    runtime_engine?: string;
    /**
     * Single user name if data_security_mode is `SINGLE_USER`
     */
    single_user_name?: string;
    /**
     * An object containing a set of optional, user-specified Spark configuration key-value
     * pairs.
     * Users can also pass in a string of extra JVM options to the driver and the executors via
     * `spark.driver.extraJavaOptions` and `spark.executor.extraJavaOptions` respectively.
     */
    spark_conf?: {[key: string]: string} | string;
    /**
     * An object containing a set of optional, user-specified environment variable key-value
     * pairs.
     * Please note that key-value pair of the form (X,Y) will be exported as is (i.e.,
     * `export X='Y'`) while launching the driver and workers.
     *
     * In order to specify an additional set of `SPARK_DAEMON_JAVA_OPTS`, we recommend appending
     * them to `$SPARK_DAEMON_JAVA_OPTS` as shown in the example below. This ensures that all
     * default databricks managed environmental variables are included as well.
     *
     * Example Spark environment variables:
     * `{"SPARK_WORKER_MEMORY": "28000m", "SPARK_LOCAL_DIRS": "/local_disk0"}` or
     * `{"SPARK_DAEMON_JAVA_OPTS": "$SPARK_DAEMON_JAVA_OPTS
     * -Dspark.shuffle.service.enabled=true"}`
     */
    spark_env_vars?: {[key: string]: string} | string;
    /**
     * The Spark version of the cluster, e.g. `3.3.x-scala2.11`.
     * A list of available Spark versions can be retrieved by using
     * the :method:clusters/sparkVersions API call.
     */
    spark_version?: string;
    /**
     * SSH public key contents that will be added to each Spark node in this cluster. The
     * corresponding private keys can be used to login with the user name `ubuntu` on port
     * `2200`.
     * Up to 10 keys can be specified.
     */
    ssh_public_keys?: string[] | string;
    /**
     * If set, what the total initial volume size (in GB) of the remote disks should be.
     * Currently only supported for GCP HYPERDISK_BALANCED disks.
     */
    total_initial_remote_disk_size?: number | string;
    /**
     * This field can only be used when `kind = CLASSIC_PREVIEW`.
     *
     * `effective_spark_version` is determined by `spark_version` (DBR release), this field
     * `use_ml_runtime`, and whether `node_type_id` is gpu node or not.
     */
    use_ml_runtime?: boolean | string;
    workload_type?: WorkloadTypeClass | string;
}

export interface IndecentBundleSchem {
    /**
     * The maximum number of workers to which the cluster can scale up when overloaded.
     * Note that `max_workers` must be strictly greater than `min_workers`.
     */
    max_workers?: number | string;
    /**
     * The minimum number of workers to which the cluster can scale down when underutilized.
     * It is also the initial number of workers the cluster will have after creation.
     */
    min_workers?: number | string;
}

/**
 * Attributes set during cluster creation which are related to Amazon Web Services.
 */
export interface AwsAttributesClass {
    availability?: string;
    /**
     * The number of volumes launched for each instance. Users can choose up to 10 volumes.
     * This feature is only enabled for supported node types. Legacy node types cannot specify
     * custom EBS volumes.
     * For node types with no instance store, at least one EBS volume needs to be specified;
     * otherwise, cluster creation will fail.
     *
     * These EBS volumes will be mounted at `/ebs0`, `/ebs1`, and etc.
     * Instance store volumes will be mounted at `/local_disk0`, `/local_disk1`, and etc.
     *
     * If EBS volumes are attached, Databricks will configure Spark to use only the EBS volumes
     * for
     * scratch storage because heterogenously sized scratch devices can lead to inefficient disk
     * utilization. If no EBS volumes are attached, Databricks will configure Spark to use
     * instance
     * store volumes.
     *
     * Please note that if EBS volumes are specified, then the Spark configuration
     * `spark.local.dir`
     * will be overridden.
     */
    ebs_volume_count?: number | string;
    /**
     * If using gp3 volumes, what IOPS to use for the disk. If this is not set, the maximum
     * performance of a gp2 volume with the same volume size will be used.
     */
    ebs_volume_iops?: number | string;
    /**
     * The size of each EBS volume (in GiB) launched for each instance. For general purpose
     * SSD, this value must be within the range 100 - 4096. For throughput optimized HDD,
     * this value must be within the range 500 - 4096.
     */
    ebs_volume_size?: number | string;
    /**
     * If using gp3 volumes, what throughput to use for the disk. If this is not set, the
     * maximum performance of a gp2 volume with the same volume size will be used.
     */
    ebs_volume_throughput?: number | string;
    ebs_volume_type?: string;
    /**
     * The first `first_on_demand` nodes of the cluster will be placed on on-demand instances.
     * If this value is greater than 0, the cluster driver node in particular will be placed on
     * an
     * on-demand instance. If this value is greater than or equal to the current cluster size,
     * all
     * nodes will be placed on on-demand instances. If this value is less than the current
     * cluster
     * size, `first_on_demand` nodes will be placed on on-demand instances and the remainder
     * will
     * be placed on `availability` instances. Note that this value does not affect
     * cluster size and cannot currently be mutated over the lifetime of a cluster.
     */
    first_on_demand?: number | string;
    /**
     * Nodes for this cluster will only be placed on AWS instances with this instance profile.
     * If
     * ommitted, nodes will be placed on instances without an IAM instance profile. The instance
     * profile must have previously been added to the Databricks environment by an account
     * administrator.
     *
     * This feature may only be available to certain customer plans.
     */
    instance_profile_arn?: string;
    /**
     * The bid price for AWS spot instances, as a percentage of the corresponding instance
     * type's
     * on-demand price.
     * For example, if this field is set to 50, and the cluster needs a new `r3.xlarge` spot
     * instance, then the bid price is half of the price of
     * on-demand `r3.xlarge` instances. Similarly, if this field is set to 200, the bid price is
     * twice
     * the price of on-demand `r3.xlarge` instances. If not specified, the default value is 100.
     * When spot instances are requested for this cluster, only spot instances whose bid price
     * percentage matches this field will be considered.
     * Note that, for safety, we enforce this field to be no more than 10000.
     */
    spot_bid_price_percent?: number | string;
    /**
     * Identifier for the availability zone/datacenter in which the cluster resides.
     * This string will be of a form like "us-west-2a". The provided availability
     * zone must be in the same region as the Databricks deployment. For example, "us-west-2a"
     * is not a valid zone id if the Databricks deployment resides in the "us-east-1" region.
     * This is an optional field at cluster creation, and if not specified, a default zone will
     * be used.
     * If the zone specified is "auto", will try to place cluster in a zone with high
     * availability,
     * and will retry placement in a different AZ if there is not enough capacity.
     *
     * The list of available zones as well as the default value can be found by using the
     * `List Zones` method.
     */
    zone_id?: string;
}

/**
 * Attributes set during cluster creation which are related to Microsoft Azure.
 */
export interface AzureAttributesClass {
    availability?: string;
    /**
     * The first `first_on_demand` nodes of the cluster will be placed on on-demand instances.
     * This value should be greater than 0, to make sure the cluster driver node is placed on an
     * on-demand instance. If this value is greater than or equal to the current cluster size,
     * all
     * nodes will be placed on on-demand instances. If this value is less than the current
     * cluster
     * size, `first_on_demand` nodes will be placed on on-demand instances and the remainder
     * will
     * be placed on `availability` instances. Note that this value does not affect
     * cluster size and cannot currently be mutated over the lifetime of a cluster.
     */
    first_on_demand?: number | string;
    /**
     * Defines values necessary to configure and run Azure Log Analytics agent
     */
    log_analytics_info?: LogAnalyticsInfoClass | string;
    /**
     * The max bid price to be used for Azure spot instances.
     * The Max price for the bid cannot be higher than the on-demand price of the instance.
     * If not specified, the default value is -1, which specifies that the instance cannot be
     * evicted
     * on the basis of price, and only on the basis of availability. Further, the value should >
     * 0 or -1.
     */
    spot_bid_max_price?: number | string;
}

export interface LogAnalyticsInfoClass {
    /**
     * The primary key for the Azure Log Analytics agent configuration
     */
    log_analytics_primary_key?: string;
    /**
     * The workspace ID for the Azure Log Analytics agent configuration
     */
    log_analytics_workspace_id?: string;
}

/**
 * Cluster log delivery config
 */
export interface ClusterLogConfClass {
    /**
     * destination needs to be provided. e.g.
     * `{ "dbfs" : { "destination" : "dbfs:/home/cluster_log" } }`
     */
    dbfs?: DbfsClass | string;
    /**
     * destination and either the region or endpoint need to be provided. e.g.
     * `{ "s3": { "destination" : "s3://cluster_log_bucket/prefix", "region" : "us-west-2" } }`
     * Cluster iam role is used to access s3, please make sure the cluster iam role in
     * `instance_profile_arn` has permission to write data to the s3 destination.
     */
    s3?: S3Class | string;
    /**
     * destination needs to be provided, e.g.
     * `{ "volumes": { "destination": "/Volumes/catalog/schema/volume/cluster_log" } }`
     */
    volumes?: VolumesClass | string;
}

/**
 * A storage location in DBFS
 */
export interface DbfsClass {
    /**
     * dbfs destination, e.g. `dbfs:/my/path`
     */
    destination: string;
}

/**
 * A storage location in Amazon S3
 */
export interface S3Class {
    /**
     * (Optional) Set canned access control list for the logs, e.g. `bucket-owner-full-control`.
     * If `canned_cal` is set, please make sure the cluster iam role has `s3:PutObjectAcl`
     * permission on
     * the destination bucket and prefix. The full list of possible canned acl can be found at
     * http://docs.aws.amazon.com/AmazonS3/latest/dev/acl-overview.html#canned-acl.
     * Please also note that by default only the object owner gets full controls. If you are
     * using cross account
     * role for writing data, you may want to set `bucket-owner-full-control` to make bucket
     * owner able to
     * read the logs.
     */
    canned_acl?: string;
    /**
     * S3 destination, e.g. `s3://my-bucket/some-prefix` Note that logs will be delivered using
     * cluster iam role, please make sure you set cluster iam role and the role has write access
     * to the
     * destination. Please also note that you cannot use AWS keys to deliver logs.
     */
    destination: string;
    /**
     * (Optional) Flag to enable server side encryption, `false` by default.
     */
    enable_encryption?: boolean | string;
    /**
     * (Optional) The encryption type, it could be `sse-s3` or `sse-kms`. It will be used only
     * when
     * encryption is enabled and the default type is `sse-s3`.
     */
    encryption_type?: string;
    /**
     * S3 endpoint, e.g. `https://s3-us-west-2.amazonaws.com`. Either region or endpoint needs
     * to be set.
     * If both are set, endpoint will be used.
     */
    endpoint?: string;
    /**
     * (Optional) Kms key which will be used if encryption is enabled and encryption type is set
     * to `sse-kms`.
     */
    kms_key?: string;
    /**
     * S3 region, e.g. `us-west-2`. Either region or endpoint needs to be set. If both are set,
     * endpoint will be used.
     */
    region?: string;
}

/**
 * A storage location back by UC Volumes.
 */
export interface VolumesClass {
    /**
     * UC Volumes destination, e.g. `/Volumes/catalog/schema/vol1/init-scripts/setup-datadog.sh`
     * or `dbfs:/Volumes/catalog/schema/vol1/init-scripts/setup-datadog.sh`
     */
    destination: string;
}

export interface DockerImageClass {
    basic_auth?: BasicAuthClass | string;
    /**
     * URL of the docker image.
     */
    url?: string;
}

export interface BasicAuthClass {
    /**
     * Password of the user
     */
    password?: string;
    /**
     * Name of the user
     */
    username?: string;
}

/**
 * Attributes set during cluster creation which are related to GCP.
 */
export interface GcpAttributesClass {
    availability?: string;
    /**
     * Boot disk size in GB
     */
    boot_disk_size?: number | string;
    /**
     * If provided, the cluster will impersonate the google service account when accessing
     * gcloud services (like GCS). The google service account
     * must have previously been added to the Databricks environment by an account
     * administrator.
     */
    google_service_account?: string;
    /**
     * If provided, each node (workers and driver) in the cluster will have this number of local
     * SSDs attached.
     * Each local SSD is 375GB in size.
     * Refer to [GCP
     * documentation](https://cloud.google.com/compute/docs/disks/local-ssd#choose_number_local_ssds)
     * for the supported number of local SSDs for each instance type.
     */
    local_ssd_count?: number | string;
    /**
     * This field determines whether the spark executors will be scheduled to run on preemptible
     * VMs (when set to true) versus standard compute engine VMs (when set to false; default).
     * Note: Soon to be deprecated, use the 'availability' field instead.
     */
    use_preemptible_executors?: boolean | string;
    /**
     * Identifier for the availability zone in which the cluster resides.
     * This can be one of the following:
     * - "HA" => High availability, spread nodes across availability zones for a Databricks
     * deployment region [default].
     * - "AUTO" => Databricks picks an availability zone to schedule the cluster on.
     * - A GCP availability zone => Pick One of the available zones for (machine type + region)
     * from
     * https://cloud.google.com/compute/docs/regions-zones.
     */
    zone_id?: string;
}

/**
 * Config for an individual init script
 * Next ID: 11
 */
export interface InitScriptClass {
    /**
     * Contains the Azure Data Lake Storage destination path
     */
    abfss?: AbfssClass | string;
    /**
     * destination needs to be provided. e.g.
     * `{ "dbfs": { "destination" : "dbfs:/home/cluster_log" } }`
     */
    dbfs?: DbfsClass | string;
    /**
     * destination needs to be provided, e.g.
     * `{ "file": { "destination": "file:/my/local/file.sh" } }`
     */
    file?: HilariousBundleSchem | string;
    /**
     * destination needs to be provided, e.g.
     * `{ "gcs": { "destination": "gs://my-bucket/file.sh" } }`
     */
    gcs?: GcsClass | string;
    /**
     * destination and either the region or endpoint need to be provided. e.g.
     * `{ \"s3\": { \"destination\": \"s3://cluster_log_bucket/prefix\", \"region\":
     * \"us-west-2\" } }`
     * Cluster iam role is used to access s3, please make sure the cluster iam role in
     * `instance_profile_arn` has permission to write data to the s3 destination.
     */
    s3?: S3Class | string;
    /**
     * destination needs to be provided. e.g.
     * `{ \"volumes\" : { \"destination\" : \"/Volumes/my-init.sh\" } }`
     */
    volumes?: VolumesClass | string;
    /**
     * destination needs to be provided, e.g.
     * `{ "workspace": { "destination": "/cluster-init-scripts/setup-datadog.sh" } }`
     */
    workspace?: AmbitiousBundleSchem | string;
}

/**
 * A storage location in Adls Gen2
 */
export interface AbfssClass {
    /**
     * abfss destination, e.g.
     * `abfss://<container-name>@<storage-account-name>.dfs.core.windows.net/<directory-name>`.
     */
    destination: string;
}

export interface HilariousBundleSchem {
    /**
     * local file destination, e.g. `file:/my/local/file.sh`
     */
    destination: string;
}

/**
 * A storage location in Google Cloud Platform's GCS
 */
export interface GcsClass {
    /**
     * GCS destination/URI, e.g. `gs://my-bucket/some-prefix`
     */
    destination: string;
}

/**
 * A storage location in Workspace Filesystem (WSFS)
 */
export interface AmbitiousBundleSchem {
    /**
     * wsfs destination, e.g. `workspace:/cluster-init-scripts/setup-datadog.sh`
     */
    destination: string;
}

export interface CunningBundleSchem {
    group_name?: string;
    level: string;
    service_principal_name?: string;
    user_name?: string;
}

/**
 * Cluster Attributes showing for clusters workload types.
 */
export interface WorkloadTypeClass {
    /**
     * defined what type of clients can use the cluster. E.g. Notebooks, Jobs
     */
    clients: ClientsClass | string;
}

export interface ClientsClass {
    /**
     * With jobs set, the cluster can be used for jobs
     */
    jobs?: boolean | string;
    /**
     * With notebooks set, this cluster can be used for notebooks
     */
    notebooks?: boolean | string;
}

export interface MagentaBundleSchem {
    /**
     * The timestamp of when the dashboard was created.
     */
    create_time?: string;
    /**
     * UUID identifying the dashboard.
     */
    dashboard_id?: string;
    /**
     * The display name of the dashboard.
     */
    display_name?: string;
    embed_credentials?: boolean | string;
    /**
     * The etag for the dashboard. Can be optionally provided on updates to ensure that the
     * dashboard
     * has not been modified since the last read.
     * This field is excluded in List Dashboards responses.
     */
    etag?: string;
    file_path?: string;
    /**
     * The state of the dashboard resource. Used for tracking trashed status.
     */
    lifecycle_state?: string;
    /**
     * The workspace path of the folder containing the dashboard. Includes leading slash and no
     * trailing slash.
     * This field is excluded in List Dashboards responses.
     */
    parent_path?: string;
    /**
     * The workspace path of the dashboard asset, including the file name.
     * Exported dashboards always have the file extension `.lvdash.json`.
     * This field is excluded in List Dashboards responses.
     */
    path?: string;
    permissions?: Array<FriskyBundleSchem | string> | string;
    /**
     * The contents of the dashboard in serialized string form.
     * This field is excluded in List Dashboards responses.
     * Use the [get dashboard API](https://docs.databricks.com/api/workspace/lakeview/get)
     * to retrieve an example response, which includes the `serialized_dashboard` field.
     * This field provides the structure of the JSON string that represents the dashboard's
     * layout and components.
     */
    serialized_dashboard?: any;
    /**
     * The timestamp of when the dashboard was last updated by the user.
     * This field is excluded in List Dashboards responses.
     */
    update_time?: string;
    /**
     * The warehouse ID used to run the dashboard.
     */
    warehouse_id?: string;
}

export interface FriskyBundleSchem {
    group_name?: string;
    level: string;
    service_principal_name?: string;
    user_name?: string;
}

/**
 * An experiment and its metadata.
 */
export interface ExperimentClass {
    /**
     * Location where artifacts for the experiment are stored.
     */
    artifact_location?: string;
    /**
     * Creation time
     */
    creation_time?: number | string;
    /**
     * Unique identifier for the experiment.
     */
    experiment_id?: string;
    /**
     * Last update time
     */
    last_update_time?: number | string;
    /**
     * Current life cycle stage of the experiment: "active" or "deleted".
     * Deleted experiments are not returned by APIs.
     */
    lifecycle_stage?: string;
    /**
     * Human readable name that identifies the experiment.
     */
    name?: string;
    permissions?: Array<MischievousBundleSchem | string> | string;
    /**
     * Tags: Additional metadata key-value pairs.
     */
    tags?: Array<BraggadociousBundleSchem | string> | string;
}

export interface MischievousBundleSchem {
    group_name?: string;
    level: string;
    service_principal_name?: string;
    user_name?: string;
}

/**
 * A tag for an experiment.
 */
export interface BraggadociousBundleSchem {
    /**
     * The tag key.
     */
    key?: string;
    /**
     * The tag value.
     */
    value?: string;
}

export interface BundleSchem1 {
    /**
     * The id of the user specified budget policy to use for this job.
     * If not specified, a default budget policy may be applied when creating or modifying the
     * job.
     * See `effective_budget_policy_id` for the budget policy used by this workload.
     */
    budget_policy_id?: string;
    /**
     * An optional continuous property for this job. The continuous property will ensure that
     * there is always one run executing. Only one of `schedule` and `continuous` can be used.
     */
    continuous?: ContinuousClass | string;
    /**
     * An optional description for the job. The maximum length is 27700 characters in UTF-8
     * encoding.
     */
    description?: string;
    /**
     * An optional set of email addresses that is notified when runs of this job begin or
     * complete as well as when this job is deleted.
     */
    email_notifications?: BundleSchem2 | string;
    /**
     * A list of task execution environment specifications that can be referenced by serverless
     * tasks of this job.
     * An environment is required to be present for serverless tasks.
     * For serverless notebook tasks, the environment is accessible in the notebook environment
     * panel.
     * For other serverless tasks, the task environment is required to be specified using
     * environment_key in the task settings.
     */
    environments?: Array<BundleSchem3 | string> | string;
    /**
     * An optional specification for a remote Git repository containing the source code used by
     * tasks. Version-controlled source code is supported by notebook, dbt, Python script, and
     * SQL File tasks.
     *
     * If `git_source` is set, these tasks retrieve the file from the remote repository by
     * default. However, this behavior can be overridden by setting `source` to `WORKSPACE` on
     * the task.
     *
     * Note: dbt and SQL File tasks support only version-controlled sources. If dbt or SQL File
     * tasks are used, `git_source` must be defined on the job.
     */
    git_source?: GitSourceClass | string;
    health?: HealthClass | string;
    /**
     * A list of job cluster specifications that can be shared and reused by tasks of this job.
     * Libraries cannot be declared in a shared job cluster. You must declare dependent
     * libraries in task settings.
     */
    job_clusters?: Array<JobClusterClass | string> | string;
    /**
     * An optional maximum allowed number of concurrent runs of the job.
     * Set this value if you want to be able to execute multiple runs of the same job
     * concurrently.
     * This is useful for example if you trigger your job on a frequent schedule and want to
     * allow consecutive runs to overlap with each other, or if you want to trigger multiple
     * runs which differ by their input parameters.
     * This setting affects only new runs. For example, suppose the job’s concurrency is 4 and
     * there are 4 concurrent active runs. Then setting the concurrency to 3 won’t kill any of
     * the active runs.
     * However, from then on, new runs are skipped unless there are fewer than 3 active runs.
     * This value cannot exceed 1000. Setting this value to `0` causes all new runs to be
     * skipped.
     */
    max_concurrent_runs?: number | string;
    /**
     * An optional name for the job. The maximum length is 4096 bytes in UTF-8 encoding.
     */
    name?: string;
    /**
     * Optional notification settings that are used when sending notifications to each of the
     * `email_notifications` and `webhook_notifications` for this job.
     */
    notification_settings?: BundleSchem4 | string;
    /**
     * Job-level parameter definitions
     */
    parameters?: Array<ParameterClass | string> | string;
    /**
     * The performance mode on a serverless job. This field determines the level of compute
     * performance or cost-efficiency for the run.
     *
     * * `STANDARD`: Enables cost-efficient execution of serverless workloads.
     * * `PERFORMANCE_OPTIMIZED`: Prioritizes fast startup and execution times through rapid
     * scaling and optimized cluster performance.
     */
    performance_target?: string;
    permissions?: Array<BundleSchem5 | string> | string;
    /**
     * The queue settings of the job.
     */
    queue?: QueueClass | string;
    run_as?: BundleSchem6 | string;
    /**
     * An optional periodic schedule for this job. The default behavior is that the job only
     * runs when triggered by clicking “Run Now” in the Jobs UI or sending an API request to
     * `runNow`.
     */
    schedule?: BundleSchem7 | string;
    /**
     * A map of tags associated with the job. These are forwarded to the cluster as cluster tags
     * for jobs clusters, and are subject to the same limitations as cluster tags. A maximum of
     * 25 tags can be added to the job.
     */
    tags?: {[key: string]: string} | string;
    /**
     * A list of task specifications to be executed by this job.
     * It supports up to 1000 elements in write endpoints (:method:jobs/create,
     * :method:jobs/reset, :method:jobs/update, :method:jobs/submit).
     * Read endpoints return only 100 tasks. If more than 100 tasks are available, you can
     * paginate through them using :method:jobs/get. Use the `next_page_token` field at the
     * object root to determine if more results are available.
     */
    tasks?: Array<TaskClass | string> | string;
    /**
     * An optional timeout applied to each run of this job. A value of `0` means no timeout.
     */
    timeout_seconds?: number | string;
    /**
     * A configuration to trigger a run when certain conditions are met. The default behavior is
     * that the job runs only when triggered by clicking “Run Now” in the Jobs UI or sending an
     * API request to `runNow`.
     */
    trigger?: BundleSchem16 | string;
    /**
     * A collection of system notification IDs to notify when runs of this job begin or complete.
     */
    webhook_notifications?: WebhookNotificationsClass | string;
}

export interface ContinuousClass {
    /**
     * Indicate whether the continuous execution of the job is paused or not. Defaults to
     * UNPAUSED.
     */
    pause_status?: string;
}

export interface BundleSchem2 {
    /**
     * If true, do not send email to recipients specified in `on_failure` if the run is skipped.
     * This field is `deprecated`. Please use the
     * `notification_settings.no_alert_for_skipped_runs` field.
     */
    no_alert_for_skipped_runs?: boolean | string;
    /**
     * A list of email addresses to be notified when the duration of a run exceeds the threshold
     * specified for the `RUN_DURATION_SECONDS` metric in the `health` field. If no rule for the
     * `RUN_DURATION_SECONDS` metric is specified in the `health` field for the job,
     * notifications are not sent.
     */
    on_duration_warning_threshold_exceeded?: string[] | string;
    /**
     * A list of email addresses to be notified when a run unsuccessfully completes. A run is
     * considered to have completed unsuccessfully if it ends with an `INTERNAL_ERROR`
     * `life_cycle_state` or a `FAILED`, or `TIMED_OUT` result_state. If this is not specified
     * on job creation, reset, or update the list is empty, and notifications are not sent.
     */
    on_failure?: string[] | string;
    /**
     * A list of email addresses to be notified when a run begins. If not specified on job
     * creation, reset, or update, the list is empty, and notifications are not sent.
     */
    on_start?: string[] | string;
    /**
     * A list of email addresses to notify when any streaming backlog thresholds are exceeded
     * for any stream.
     * Streaming backlog thresholds can be set in the `health` field using the following
     * metrics: `STREAMING_BACKLOG_BYTES`, `STREAMING_BACKLOG_RECORDS`,
     * `STREAMING_BACKLOG_SECONDS`, or `STREAMING_BACKLOG_FILES`.
     * Alerting is based on the 10-minute average of these metrics. If the issue persists,
     * notifications are resent every 30 minutes.
     */
    on_streaming_backlog_exceeded?: string[] | string;
    /**
     * A list of email addresses to be notified when a run successfully completes. A run is
     * considered to have completed successfully if it ends with a `TERMINATED`
     * `life_cycle_state` and a `SUCCESS` result_state. If not specified on job creation, reset,
     * or update, the list is empty, and notifications are not sent.
     */
    on_success?: string[] | string;
}

export interface BundleSchem3 {
    /**
     * The key of an environment. It has to be unique within a job.
     */
    environment_key: string;
    spec?: SpecClass | string;
}

/**
 * The environment entity used to preserve serverless environment side panel, jobs'
 * environment for non-notebook task, and DLT's environment for classic and serverless
 * pipelines.
 * In this minimal environment spec, only pip dependencies are supported.
 */
export interface SpecClass {
    /**
     * Use `environment_version` instead.
     */
    client?: string;
    /**
     * List of pip dependencies, as supported by the version of pip in this environment.
     */
    dependencies?: string[] | string;
    /**
     * Required. Environment version used by the environment.
     * Each version comes with a specific Python version and a set of Python packages.
     * The version is a string, consisting of an integer.
     */
    environment_version?: string;
    /**
     * List of jar dependencies, should be string representing volume paths. For example:
     * `/Volumes/path/to/test.jar`.
     */
    jar_dependencies?: string[] | string;
}

/**
 * An optional specification for a remote Git repository containing the source code used by
 * tasks. Version-controlled source code is supported by notebook, dbt, Python script, and
 * SQL File tasks.
 *
 * If `git_source` is set, these tasks retrieve the file from the remote repository by
 * default. However, this behavior can be overridden by setting `source` to `WORKSPACE` on
 * the task.
 *
 * Note: dbt and SQL File tasks support only version-controlled sources. If dbt or SQL File
 * tasks are used, `git_source` must be defined on the job.
 */
export interface GitSourceClass {
    /**
     * Name of the branch to be checked out and used by this job. This field cannot be specified
     * in conjunction with git_tag or git_commit.
     */
    git_branch?: string;
    /**
     * Commit to be checked out and used by this job. This field cannot be specified in
     * conjunction with git_branch or git_tag.
     */
    git_commit?: string;
    /**
     * Unique identifier of the service used to host the Git repository. The value is case
     * insensitive.
     */
    git_provider: string;
    /**
     * Name of the tag to be checked out and used by this job. This field cannot be specified in
     * conjunction with git_branch or git_commit.
     */
    git_tag?: string;
    /**
     * URL of the repository to be cloned by this job.
     */
    git_url: string;
}

/**
 * An optional set of health rules that can be defined for this job.
 */
export interface HealthClass {
    rules?: Array<RuleClass | string> | string;
}

export interface RuleClass {
    metric: string;
    op: string;
    /**
     * Specifies the threshold value that the health metric should obey to satisfy the health
     * rule.
     */
    value: number | string;
}

export interface JobClusterClass {
    /**
     * A unique name for the job cluster. This field is required and must be unique within the
     * job.
     * `JobTaskSettings` may refer to this field to determine which cluster to launch for the
     * task execution.
     */
    job_cluster_key: string;
    /**
     * If new_cluster, a description of a cluster that is created for each task.
     */
    new_cluster: NewClusterClass | string;
}

/**
 * Contains a snapshot of the latest user specified settings that were used to create/edit
 * the cluster.
 */
export interface NewClusterClass {
    /**
     * When set to true, fixed and default values from the policy will be used for fields that
     * are omitted. When set to false, only fixed values from the policy will be applied.
     */
    apply_policy_default_values?: boolean | string;
    /**
     * Parameters needed in order to automatically scale clusters up and down based on load.
     * Note: autoscaling works best with DB runtime versions 3.0 or later.
     */
    autoscale?: IndecentBundleSchem | string;
    /**
     * Automatically terminates the cluster after it is inactive for this time in minutes. If
     * not set,
     * this cluster will not be automatically terminated. If specified, the threshold must be
     * between
     * 10 and 10000 minutes.
     * Users can also set this value to 0 to explicitly disable automatic termination.
     */
    autotermination_minutes?: number | string;
    /**
     * Attributes related to clusters running on Amazon Web Services.
     * If not specified at cluster creation, a set of default values will be used.
     */
    aws_attributes?: AwsAttributesClass | string;
    /**
     * Attributes related to clusters running on Microsoft Azure.
     * If not specified at cluster creation, a set of default values will be used.
     */
    azure_attributes?: AzureAttributesClass | string;
    /**
     * The configuration for delivering spark logs to a long-term storage destination.
     * Three kinds of destinations (DBFS, S3 and Unity Catalog volumes) are supported. Only one
     * destination can be specified
     * for one cluster. If the conf is given, the logs will be delivered to the destination
     * every
     * `5 mins`. The destination of driver logs is `$destination/$clusterId/driver`, while
     * the destination of executor logs is `$destination/$clusterId/executor`.
     */
    cluster_log_conf?: ClusterLogConfClass | string;
    /**
     * Cluster name requested by the user. This doesn't have to be unique.
     * If not specified at creation, the cluster name will be an empty string.
     * For job clusters, the cluster name is automatically set based on the job and job run IDs.
     */
    cluster_name?: string;
    /**
     * Additional tags for cluster resources. Databricks will tag all cluster resources (e.g.,
     * AWS
     * instances and EBS volumes) with these tags in addition to `default_tags`. Notes:
     *
     * - Currently, Databricks allows at most 45 custom tags
     *
     * - Clusters can only reuse cloud resources if the resources' tags are a subset of the
     * cluster tags
     */
    custom_tags?: {[key: string]: string} | string;
    data_security_mode?: string;
    docker_image?: DockerImageClass | string;
    /**
     * The optional ID of the instance pool for the driver of the cluster belongs.
     * The pool cluster uses the instance pool with id (instance_pool_id) if the driver pool is
     * not
     * assigned.
     */
    driver_instance_pool_id?: string;
    /**
     * The node type of the Spark driver.
     * Note that this field is optional; if unset, the driver node type will be set as the same
     * value
     * as `node_type_id` defined above.
     *
     * This field, along with node_type_id, should not be set if virtual_cluster_size is set.
     * If both driver_node_type_id, node_type_id, and virtual_cluster_size are specified,
     * driver_node_type_id and node_type_id take precedence.
     */
    driver_node_type_id?: string;
    /**
     * Autoscaling Local Storage: when enabled, this cluster will dynamically acquire additional
     * disk
     * space when its Spark workers are running low on disk space. This feature requires
     * specific AWS
     * permissions to function correctly - refer to the User Guide for more details.
     */
    enable_elastic_disk?: boolean | string;
    /**
     * Whether to enable LUKS on cluster VMs' local disks
     */
    enable_local_disk_encryption?: boolean | string;
    /**
     * Attributes related to clusters running on Google Cloud Platform.
     * If not specified at cluster creation, a set of default values will be used.
     */
    gcp_attributes?: GcpAttributesClass | string;
    /**
     * The configuration for storing init scripts. Any number of destinations can be specified.
     * The scripts are executed sequentially in the order provided.
     * If `cluster_log_conf` is specified, init script logs are sent to
     * `<destination>/<cluster-ID>/init_scripts`.
     */
    init_scripts?: Array<InitScriptClass | string> | string;
    /**
     * The optional ID of the instance pool to which the cluster belongs.
     */
    instance_pool_id?: string;
    /**
     * This field can only be used when `kind = CLASSIC_PREVIEW`.
     *
     * When set to true, Databricks will automatically set single node related `custom_tags`,
     * `spark_conf`, and `num_workers`
     */
    is_single_node?: boolean | string;
    kind?: string;
    /**
     * This field encodes, through a single value, the resources available to each of
     * the Spark nodes in this cluster. For example, the Spark nodes can be provisioned
     * and optimized for memory or compute intensive workloads. A list of available node
     * types can be retrieved by using the :method:clusters/listNodeTypes API call.
     */
    node_type_id?: string;
    /**
     * Number of worker nodes that this cluster should have. A cluster has one Spark Driver
     * and `num_workers` Executors for a total of `num_workers` + 1 Spark nodes.
     *
     * Note: When reading the properties of a cluster, this field reflects the desired number
     * of workers rather than the actual current number of workers. For instance, if a cluster
     * is resized from 5 to 10 workers, this field will immediately be updated to reflect
     * the target size of 10 workers, whereas the workers listed in `spark_info` will gradually
     * increase from 5 to 10 as the new nodes are provisioned.
     */
    num_workers?: number | string;
    /**
     * The ID of the cluster policy used to create the cluster if applicable.
     */
    policy_id?: string;
    /**
     * If set, what the configurable throughput (in Mb/s) for the remote disk is. Currently only
     * supported for GCP HYPERDISK_BALANCED disks.
     */
    remote_disk_throughput?: number | string;
    runtime_engine?: string;
    /**
     * Single user name if data_security_mode is `SINGLE_USER`
     */
    single_user_name?: string;
    /**
     * An object containing a set of optional, user-specified Spark configuration key-value
     * pairs.
     * Users can also pass in a string of extra JVM options to the driver and the executors via
     * `spark.driver.extraJavaOptions` and `spark.executor.extraJavaOptions` respectively.
     */
    spark_conf?: {[key: string]: string} | string;
    /**
     * An object containing a set of optional, user-specified environment variable key-value
     * pairs.
     * Please note that key-value pair of the form (X,Y) will be exported as is (i.e.,
     * `export X='Y'`) while launching the driver and workers.
     *
     * In order to specify an additional set of `SPARK_DAEMON_JAVA_OPTS`, we recommend appending
     * them to `$SPARK_DAEMON_JAVA_OPTS` as shown in the example below. This ensures that all
     * default databricks managed environmental variables are included as well.
     *
     * Example Spark environment variables:
     * `{"SPARK_WORKER_MEMORY": "28000m", "SPARK_LOCAL_DIRS": "/local_disk0"}` or
     * `{"SPARK_DAEMON_JAVA_OPTS": "$SPARK_DAEMON_JAVA_OPTS
     * -Dspark.shuffle.service.enabled=true"}`
     */
    spark_env_vars?: {[key: string]: string} | string;
    /**
     * The Spark version of the cluster, e.g. `3.3.x-scala2.11`.
     * A list of available Spark versions can be retrieved by using
     * the :method:clusters/sparkVersions API call.
     */
    spark_version?: string;
    /**
     * SSH public key contents that will be added to each Spark node in this cluster. The
     * corresponding private keys can be used to login with the user name `ubuntu` on port
     * `2200`.
     * Up to 10 keys can be specified.
     */
    ssh_public_keys?: string[] | string;
    /**
     * If set, what the total initial volume size (in GB) of the remote disks should be.
     * Currently only supported for GCP HYPERDISK_BALANCED disks.
     */
    total_initial_remote_disk_size?: number | string;
    /**
     * This field can only be used when `kind = CLASSIC_PREVIEW`.
     *
     * `effective_spark_version` is determined by `spark_version` (DBR release), this field
     * `use_ml_runtime`, and whether `node_type_id` is gpu node or not.
     */
    use_ml_runtime?: boolean | string;
    workload_type?: WorkloadTypeClass | string;
}

export interface BundleSchem4 {
    /**
     * If true, do not send notifications to recipients specified in `on_failure` if the run is
     * canceled.
     */
    no_alert_for_canceled_runs?: boolean | string;
    /**
     * If true, do not send notifications to recipients specified in `on_failure` if the run is
     * skipped.
     */
    no_alert_for_skipped_runs?: boolean | string;
}

export interface ParameterClass {
    /**
     * Default value of the parameter.
     */
    default: string;
    /**
     * The name of the defined parameter. May only contain alphanumeric characters, `_`, `-`,
     * and `.`
     */
    name: string;
}

export interface BundleSchem5 {
    group_name?: string;
    level: string;
    service_principal_name?: string;
    user_name?: string;
}

export interface QueueClass {
    /**
     * If true, enable queueing for the job. This is a required field.
     */
    enabled: boolean | string;
}

/**
 * Write-only setting. Specifies the user or service principal that the job runs as. If not
 * specified, the job runs as the user who created the job.
 *
 * Either `user_name` or `service_principal_name` should be specified. If not, an error is
 * thrown.
 */
export interface BundleSchem6 {
    /**
     * The application ID of an active service principal. Setting this field requires the
     * `servicePrincipal/user` role.
     */
    service_principal_name?: string;
    /**
     * The email of an active workspace user. Non-admin users can only set this field to their
     * own email.
     */
    user_name?: string;
}

export interface BundleSchem7 {
    /**
     * Indicate whether this schedule is paused or not.
     */
    pause_status?: string;
    /**
     * A Cron expression using Quartz syntax that describes the schedule for a job. See [Cron
     * Trigger](http://www.quartz-scheduler.org/documentation/quartz-2.3.0/tutorials/crontrigger.html)
     * for details. This field is required.
     */
    quartz_cron_expression: string;
    /**
     * A Java timezone ID. The schedule for a job is resolved with respect to this timezone. See
     * [Java TimeZone](https://docs.oracle.com/javase/7/docs/api/java/util/TimeZone.html) for
     * details. This field is required.
     */
    timezone_id: string;
}

export interface ForEachTaskClass {
    /**
     * An optional maximum allowed number of concurrent runs of the task.
     * Set this value if you want to be able to execute multiple runs of the task concurrently.
     */
    concurrency?: number | string;
    /**
     * Array for task to iterate on. This can be a JSON string or a reference to
     * an array parameter.
     */
    inputs: string;
    /**
     * Configuration for the task that will be run for each element in the array
     */
    task: TaskClass | string;
}

export interface TaskClass {
    /**
     * The task runs a [clean rooms](https://docs.databricks.com/en/clean-rooms/index.html)
     * notebook
     * when the `clean_rooms_notebook_task` field is present.
     */
    clean_rooms_notebook_task?: CleanRoomsNotebookTaskClass | string;
    /**
     * The task evaluates a condition that can be used to control the execution of other tasks
     * when the `condition_task` field is present.
     * The condition task does not require a cluster to execute and does not support retries or
     * notifications.
     */
    condition_task?: ConditionTaskClass | string;
    /**
     * The task refreshes a dashboard and sends a snapshot to subscribers.
     */
    dashboard_task?: DashboardTaskClass | string;
    /**
     * Task type for dbt cloud, deprecated in favor of the new name dbt_platform_task
     */
    dbt_cloud_task?: DbtCloudTaskClass | string;
    dbt_platform_task?: DbtPlatformTaskClass | string;
    /**
     * The task runs one or more dbt commands when the `dbt_task` field is present. The dbt task
     * requires both Databricks SQL and the ability to use a serverless or a pro SQL warehouse.
     */
    dbt_task?: DbtTaskClass | string;
    /**
     * An optional array of objects specifying the dependency graph of the task. All tasks
     * specified in this field must complete before executing this task. The task will run only
     * if the `run_if` condition is true.
     * The key is `task_key`, and the value is the name assigned to the dependent task.
     */
    depends_on?: Array<DependsOnClass | string> | string;
    /**
     * An optional description for this task.
     */
    description?: string;
    /**
     * An option to disable auto optimization in serverless
     */
    disable_auto_optimization?: boolean | string;
    /**
     * An optional set of email addresses that is notified when runs of this task begin or
     * complete as well as when this task is deleted. The default behavior is to not send any
     * emails.
     */
    email_notifications?: BundleSchem9 | string;
    /**
     * The key that references an environment spec in a job. This field is required for Python
     * script, Python wheel and dbt tasks when using serverless compute.
     */
    environment_key?: string;
    /**
     * If existing_cluster_id, the ID of an existing cluster that is used for all runs.
     * When running jobs or tasks on an existing cluster, you may need to manually restart
     * the cluster if it stops responding. We suggest running jobs and tasks on new clusters for
     * greater reliability
     */
    existing_cluster_id?: string;
    /**
     * The task executes a nested task for every input provided when the `for_each_task` field
     * is present.
     */
    for_each_task?: ForEachTaskClass | string;
    gen_ai_compute_task?: GenAIComputeTaskClass | string;
    health?: HealthClass | string;
    /**
     * If job_cluster_key, this task is executed reusing the cluster specified in
     * `job.settings.job_clusters`.
     */
    job_cluster_key?: string;
    /**
     * An optional list of libraries to be installed on the cluster.
     * The default value is an empty list.
     */
    libraries?: Array<BundleSchem10 | string> | string;
    /**
     * An optional maximum number of times to retry an unsuccessful run. A run is considered to
     * be unsuccessful if it completes with the `FAILED` result_state or `INTERNAL_ERROR`
     * `life_cycle_state`. The value `-1` means to retry indefinitely and the value `0` means to
     * never retry.
     */
    max_retries?: number | string;
    /**
     * An optional minimal interval in milliseconds between the start of the failed run and the
     * subsequent retry run. The default behavior is that unsuccessful runs are immediately
     * retried.
     */
    min_retry_interval_millis?: number | string;
    /**
     * If new_cluster, a description of a new cluster that is created for each run.
     */
    new_cluster?: NewClusterClass | string;
    /**
     * The task runs a notebook when the `notebook_task` field is present.
     */
    notebook_task?: NotebookTaskClass | string;
    /**
     * Optional notification settings that are used when sending notifications to each of the
     * `email_notifications` and `webhook_notifications` for this task.
     */
    notification_settings?: BundleSchem11 | string;
    /**
     * The task triggers a pipeline update when the `pipeline_task` field is present. Only
     * pipelines configured to use triggered more are supported.
     */
    pipeline_task?: PipelineTaskClass | string;
    /**
     * The task triggers a Power BI semantic model update when the `power_bi_task` field is
     * present.
     */
    power_bi_task?: PowerBITaskClass | string;
    /**
     * The task runs a Python wheel when the `python_wheel_task` field is present.
     */
    python_wheel_task?: PythonWheelTaskClass | string;
    /**
     * An optional policy to specify whether to retry a job when it times out. The default
     * behavior
     * is to not retry on timeout.
     */
    retry_on_timeout?: boolean | string;
    /**
     * An optional value specifying the condition determining whether the task is run once its
     * dependencies have been completed.
     *
     * * `ALL_SUCCESS`: All dependencies have executed and succeeded
     * * `AT_LEAST_ONE_SUCCESS`: At least one dependency has succeeded
     * * `NONE_FAILED`: None of the dependencies have failed and at least one was executed
     * * `ALL_DONE`: All dependencies have been completed
     * * `AT_LEAST_ONE_FAILED`: At least one dependency failed
     * * `ALL_FAILED`: ALl dependencies have failed
     */
    run_if?: string;
    /**
     * The task triggers another job when the `run_job_task` field is present.
     */
    run_job_task?: RunJobTaskClass | string;
    /**
     * The task runs a JAR when the `spark_jar_task` field is present.
     */
    spark_jar_task?: SparkJarTaskClass | string;
    /**
     * The task runs a Python file when the `spark_python_task` field is present.
     */
    spark_python_task?: SparkPythonTaskClass | string;
    /**
     * (Legacy) The task runs the spark-submit script when the `spark_submit_task` field is
     * present. This task can run only on new clusters and is not compatible with serverless
     * compute.
     *
     * In the `new_cluster` specification, `libraries` and `spark_conf` are not supported.
     * Instead, use `--jars` and `--py-files` to add Java and Python libraries and `--conf` to
     * set the Spark configurations.
     *
     * `master`, `deploy-mode`, and `executor-cores` are automatically configured by Databricks;
     * you _cannot_ specify them in parameters.
     *
     * By default, the Spark submit job uses all available memory (excluding reserved memory for
     * Databricks services). You can set `--driver-memory`, and `--executor-memory` to a smaller
     * value to leave some room for off-heap usage.
     *
     * The `--jars`, `--py-files`, `--files` arguments support DBFS and S3 paths.
     */
    spark_submit_task?: SparkSubmitTaskClass | string;
    /**
     * The task runs a SQL query or file, or it refreshes a SQL alert or a legacy SQL dashboard
     * when the `sql_task` field is present.
     */
    sql_task?: SQLTaskClass | string;
    /**
     * A unique name for the task. This field is used to refer to this task from other tasks.
     * This field is required and must be unique within its parent job.
     * On Update or Reset, this field is used to reference the tasks to be updated or reset.
     */
    task_key: string;
    /**
     * An optional timeout applied to each run of this job task. A value of `0` means no timeout.
     */
    timeout_seconds?: number | string;
    /**
     * A collection of system notification IDs to notify when runs of this task begin or
     * complete. The default behavior is to not send any system notifications.
     */
    webhook_notifications?: WebhookNotificationsClass | string;
}

export interface CleanRoomsNotebookTaskClass {
    /**
     * The clean room that the notebook belongs to.
     */
    clean_room_name: string;
    /**
     * Checksum to validate the freshness of the notebook resource (i.e. the notebook being run
     * is the latest version).
     * It can be fetched by calling the :method:cleanroomassets/get API.
     */
    etag?: string;
    /**
     * Base parameters to be used for the clean room notebook job.
     */
    notebook_base_parameters?: {[key: string]: string} | string;
    /**
     * Name of the notebook being run.
     */
    notebook_name: string;
}

export interface ConditionTaskClass {
    /**
     * The left operand of the condition task. Can be either a string value or a job state or
     * parameter reference.
     */
    left: string;
    /**
     * * `EQUAL_TO`, `NOT_EQUAL` operators perform string comparison of their operands. This
     * means that `“12.0” == “12”` will evaluate to `false`.
     * * `GREATER_THAN`, `GREATER_THAN_OR_EQUAL`, `LESS_THAN`, `LESS_THAN_OR_EQUAL` operators
     * perform numeric comparison of their operands. `“12.0” >= “12”` will evaluate to `true`,
     * `“10.0” >= “12”` will evaluate to `false`.
     *
     * The boolean comparison to task values can be implemented with operators `EQUAL_TO`,
     * `NOT_EQUAL`. If a task value was set to a boolean value, it will be serialized to
     * `“true”` or `“false”` for the comparison.
     */
    op: string;
    /**
     * The right operand of the condition task. Can be either a string value or a job state or
     * parameter reference.
     */
    right: string;
}

/**
 * Configures the Lakeview Dashboard job task type.
 */
export interface DashboardTaskClass {
    dashboard_id?: string;
    subscription?: BundleSchem8 | string;
    /**
     * Optional: The warehouse id to execute the dashboard with for the schedule.
     * If not specified, the default warehouse of the dashboard will be used.
     */
    warehouse_id?: string;
}

export interface BundleSchem8 {
    /**
     * Optional: Allows users to specify a custom subject line on the email sent
     * to subscribers.
     */
    custom_subject?: string;
    /**
     * When true, the subscription will not send emails.
     */
    paused?: boolean | string;
    subscribers?: Array<SubscriberClass | string> | string;
}

export interface SubscriberClass {
    destination_id?: string;
    user_name?: string;
}

/**
 * Deprecated in favor of DbtPlatformTask
 */
export interface DbtCloudTaskClass {
    /**
     * The resource name of the UC connection that authenticates the dbt Cloud for this task
     */
    connection_resource_name?: string;
    /**
     * Id of the dbt Cloud job to be triggered
     */
    dbt_cloud_job_id?: number | string;
}

export interface DbtPlatformTaskClass {
    /**
     * The resource name of the UC connection that authenticates the dbt platform for this task
     */
    connection_resource_name?: string;
    /**
     * Id of the dbt platform job to be triggered. Specified as a string for maximum
     * compatibility with clients.
     */
    dbt_platform_job_id?: string;
}

export interface DbtTaskClass {
    /**
     * Optional name of the catalog to use. The value is the top level in the 3-level namespace
     * of Unity Catalog (catalog / schema / relation). The catalog value can only be specified
     * if a warehouse_id is specified. Requires dbt-databricks >= 1.1.1.
     */
    catalog?: string;
    /**
     * A list of dbt commands to execute. All commands must start with `dbt`. This parameter
     * must not be empty. A maximum of up to 10 commands can be provided.
     */
    commands: string[] | string;
    /**
     * Optional (relative) path to the profiles directory. Can only be specified if no
     * warehouse_id is specified. If no warehouse_id is specified and this folder is unset, the
     * root directory is used.
     */
    profiles_directory?: string;
    /**
     * Path to the project directory. Optional for Git sourced tasks, in which
     * case if no value is provided, the root of the Git repository is used.
     */
    project_directory?: string;
    /**
     * Optional schema to write to. This parameter is only used when a warehouse_id is also
     * provided. If not provided, the `default` schema is used.
     */
    schema?: string;
    /**
     * Optional location type of the project directory. When set to `WORKSPACE`, the project
     * will be retrieved
     * from the local Databricks workspace. When set to `GIT`, the project will be retrieved
     * from a Git repository
     * defined in `git_source`. If the value is empty, the task will use `GIT` if `git_source`
     * is defined and `WORKSPACE` otherwise.
     *
     * * `WORKSPACE`: Project is located in Databricks workspace.
     * * `GIT`: Project is located in cloud Git provider.
     */
    source?: string;
    /**
     * ID of the SQL warehouse to connect to. If provided, we automatically generate and provide
     * the profile and connection details to dbt. It can be overridden on a per-command basis by
     * using the `--profiles-dir` command line argument.
     */
    warehouse_id?: string;
}

export interface DependsOnClass {
    /**
     * Can only be specified on condition task dependencies. The outcome of the dependent task
     * that must be met for this task to run.
     */
    outcome?: string;
    /**
     * The name of the task this task depends on.
     */
    task_key: string;
}

export interface BundleSchem9 {
    /**
     * If true, do not send email to recipients specified in `on_failure` if the run is skipped.
     * This field is `deprecated`. Please use the
     * `notification_settings.no_alert_for_skipped_runs` field.
     */
    no_alert_for_skipped_runs?: boolean | string;
    /**
     * A list of email addresses to be notified when the duration of a run exceeds the threshold
     * specified for the `RUN_DURATION_SECONDS` metric in the `health` field. If no rule for the
     * `RUN_DURATION_SECONDS` metric is specified in the `health` field for the job,
     * notifications are not sent.
     */
    on_duration_warning_threshold_exceeded?: string[] | string;
    /**
     * A list of email addresses to be notified when a run unsuccessfully completes. A run is
     * considered to have completed unsuccessfully if it ends with an `INTERNAL_ERROR`
     * `life_cycle_state` or a `FAILED`, or `TIMED_OUT` result_state. If this is not specified
     * on job creation, reset, or update the list is empty, and notifications are not sent.
     */
    on_failure?: string[] | string;
    /**
     * A list of email addresses to be notified when a run begins. If not specified on job
     * creation, reset, or update, the list is empty, and notifications are not sent.
     */
    on_start?: string[] | string;
    /**
     * A list of email addresses to notify when any streaming backlog thresholds are exceeded
     * for any stream.
     * Streaming backlog thresholds can be set in the `health` field using the following
     * metrics: `STREAMING_BACKLOG_BYTES`, `STREAMING_BACKLOG_RECORDS`,
     * `STREAMING_BACKLOG_SECONDS`, or `STREAMING_BACKLOG_FILES`.
     * Alerting is based on the 10-minute average of these metrics. If the issue persists,
     * notifications are resent every 30 minutes.
     */
    on_streaming_backlog_exceeded?: string[] | string;
    /**
     * A list of email addresses to be notified when a run successfully completes. A run is
     * considered to have completed successfully if it ends with a `TERMINATED`
     * `life_cycle_state` and a `SUCCESS` result_state. If not specified on job creation, reset,
     * or update, the list is empty, and notifications are not sent.
     */
    on_success?: string[] | string;
}

export interface GenAIComputeTaskClass {
    /**
     * Command launcher to run the actual script, e.g. bash, python etc.
     */
    command?: string;
    compute?: ComputeClass | string;
    /**
     * Runtime image
     */
    dl_runtime_image: string;
    /**
     * Optional string containing the name of the MLflow experiment to log the run to. If name
     * is not
     * found, backend will create the mlflow experiment using the name.
     */
    mlflow_experiment_name?: string;
    /**
     * Optional location type of the training script. When set to `WORKSPACE`, the script will
     * be retrieved from the local Databricks workspace. When set to `GIT`, the script will be
     * retrieved from a Git repository
     * defined in `git_source`. If the value is empty, the task will use `GIT` if `git_source`
     * is defined and `WORKSPACE` otherwise.
     * * `WORKSPACE`: Script is located in Databricks workspace.
     * * `GIT`: Script is located in cloud Git provider.
     */
    source?: string;
    /**
     * The training script file path to be executed. Cloud file URIs (such as dbfs:/, s3:/,
     * adls:/, gcs:/) and workspace paths are supported. For python files stored in the
     * Databricks workspace, the path must be absolute and begin with `/`. For files stored in a
     * remote repository, the path must be relative. This field is required.
     */
    training_script_path?: string;
    /**
     * Optional string containing model parameters passed to the training script in yaml format.
     * If present, then the content in yaml_parameters_file_path will be ignored.
     */
    yaml_parameters?: string;
    /**
     * Optional path to a YAML file containing model parameters passed to the training script.
     */
    yaml_parameters_file_path?: string;
}

export interface ComputeClass {
    /**
     * IDof the GPU pool to use.
     */
    gpu_node_pool_id?: string;
    /**
     * GPU type.
     */
    gpu_type?: string;
    /**
     * Number of GPUs.
     */
    num_gpus: number | string;
}

export interface BundleSchem10 {
    /**
     * Specification of a CRAN library to be installed as part of the library
     */
    cran?: CRANClass | string;
    /**
     * Deprecated. URI of the egg library to install. Installing Python egg files is deprecated
     * and is not supported in Databricks Runtime 14.0 and above.
     */
    egg?: string;
    /**
     * URI of the JAR library to install. Supported URIs include Workspace paths, Unity Catalog
     * Volumes paths, and S3 URIs.
     * For example: `{ "jar": "/Workspace/path/to/library.jar" }`, `{ "jar" :
     * "/Volumes/path/to/library.jar" }` or
     * `{ "jar": "s3://my-bucket/library.jar" }`.
     * If S3 is used, please make sure the cluster has read access on the library. You may need
     * to
     * launch the cluster with an IAM role to access the S3 URI.
     */
    jar?: string;
    /**
     * Specification of a maven library to be installed. For example:
     * `{ "coordinates": "org.jsoup:jsoup:1.7.2" }`
     */
    maven?: MavenClass | string;
    /**
     * Specification of a PyPi library to be installed. For example:
     * `{ "package": "simplejson" }`
     */
    pypi?: PypiClass | string;
    /**
     * URI of the requirements.txt file to install. Only Workspace paths and Unity Catalog
     * Volumes paths are supported.
     * For example: `{ "requirements": "/Workspace/path/to/requirements.txt" }` or `{
     * "requirements" : "/Volumes/path/to/requirements.txt" }`
     */
    requirements?: string;
    /**
     * URI of the wheel library to install. Supported URIs include Workspace paths, Unity
     * Catalog Volumes paths, and S3 URIs.
     * For example: `{ "whl": "/Workspace/path/to/library.whl" }`, `{ "whl" :
     * "/Volumes/path/to/library.whl" }` or
     * `{ "whl": "s3://my-bucket/library.whl" }`.
     * If S3 is used, please make sure the cluster has read access on the library. You may need
     * to
     * launch the cluster with an IAM role to access the S3 URI.
     */
    whl?: string;
}

export interface CRANClass {
    /**
     * The name of the CRAN package to install.
     */
    package: string;
    /**
     * The repository where the package can be found. If not specified, the default CRAN repo is
     * used.
     */
    repo?: string;
}

export interface MavenClass {
    /**
     * Gradle-style maven coordinates. For example: "org.jsoup:jsoup:1.7.2".
     */
    coordinates: string;
    /**
     * List of dependences to exclude. For example: `["slf4j:slf4j", "*:hadoop-client"]`.
     *
     * Maven dependency exclusions:
     *
     * https://maven.apache.org/guides/introduction/introduction-to-optional-and-excludes-dependencies.html.
     */
    exclusions?: string[] | string;
    /**
     * Maven repo to install the Maven package from. If omitted, both Maven Central Repository
     * and Spark Packages are searched.
     */
    repo?: string;
}

export interface PypiClass {
    /**
     * The name of the pypi package to install. An optional exact version specification is also
     * supported. Examples: "simplejson" and "simplejson==3.8.0".
     */
    package: string;
    /**
     * The repository where the package can be found. If not specified, the default pip index is
     * used.
     */
    repo?: string;
}

export interface NotebookTaskClass {
    /**
     * Base parameters to be used for each run of this job. If the run is initiated by a call to
     * :method:jobs/run
     * Now with parameters specified, the two parameters maps are merged. If the same key is
     * specified in
     * `base_parameters` and in `run-now`, the value from `run-now` is used.
     * Use [Task parameter variables](https://docs.databricks.com/jobs.html#parameter-variables)
     * to set parameters containing information about job runs.
     *
     * If the notebook takes a parameter that is not specified in the job’s `base_parameters` or
     * the `run-now` override parameters,
     * the default value from the notebook is used.
     *
     * Retrieve these parameters in a notebook using
     * [dbutils.widgets.get](https://docs.databricks.com/dev-tools/databricks-utils.html#dbutils-widgets).
     *
     * The JSON representation of this field cannot exceed 1MB.
     */
    base_parameters?: {[key: string]: string} | string;
    /**
     * The path of the notebook to be run in the Databricks workspace or remote repository.
     * For notebooks stored in the Databricks workspace, the path must be absolute and begin
     * with a slash.
     * For notebooks stored in a remote repository, the path must be relative. This field is
     * required.
     */
    notebook_path: string;
    /**
     * Optional location type of the notebook. When set to `WORKSPACE`, the notebook will be
     * retrieved from the local Databricks workspace. When set to `GIT`, the notebook will be
     * retrieved from a Git repository
     * defined in `git_source`. If the value is empty, the task will use `GIT` if `git_source`
     * is defined and `WORKSPACE` otherwise.
     * * `WORKSPACE`: Notebook is located in Databricks workspace.
     * * `GIT`: Notebook is located in cloud Git provider.
     */
    source?: string;
    /**
     * Optional `warehouse_id` to run the notebook on a SQL warehouse. Classic SQL warehouses
     * are NOT supported, please use serverless or pro SQL warehouses.
     *
     * Note that SQL warehouses only support SQL cells; if the notebook contains non-SQL cells,
     * the run will fail.
     */
    warehouse_id?: string;
}

export interface BundleSchem11 {
    /**
     * If true, do not send notifications to recipients specified in `on_start` for the retried
     * runs and do not send notifications to recipients specified in `on_failure` until the last
     * retry of the run.
     */
    alert_on_last_attempt?: boolean | string;
    /**
     * If true, do not send notifications to recipients specified in `on_failure` if the run is
     * canceled.
     */
    no_alert_for_canceled_runs?: boolean | string;
    /**
     * If true, do not send notifications to recipients specified in `on_failure` if the run is
     * skipped.
     */
    no_alert_for_skipped_runs?: boolean | string;
}

export interface PipelineTaskClass {
    /**
     * If true, triggers a full refresh on the delta live table.
     */
    full_refresh?: boolean | string;
    /**
     * The full name of the pipeline task to execute.
     */
    pipeline_id: string;
}

export interface PowerBITaskClass {
    /**
     * The resource name of the UC connection to authenticate from Databricks to Power BI
     */
    connection_resource_name?: string;
    /**
     * The semantic model to update
     */
    power_bi_model?: PowerBIModelClass | string;
    /**
     * Whether the model should be refreshed after the update
     */
    refresh_after_update?: boolean | string;
    /**
     * The tables to be exported to Power BI
     */
    tables?: Array<BundleSchem12 | string> | string;
    /**
     * The SQL warehouse ID to use as the Power BI data source
     */
    warehouse_id?: string;
}

export interface PowerBIModelClass {
    /**
     * How the published Power BI model authenticates to Databricks
     */
    authentication_method?: string;
    /**
     * The name of the Power BI model
     */
    model_name?: string;
    /**
     * Whether to overwrite existing Power BI models
     */
    overwrite_existing?: boolean | string;
    /**
     * The default storage mode of the Power BI model
     */
    storage_mode?: string;
    /**
     * The name of the Power BI workspace of the model
     */
    workspace_name?: string;
}

export interface BundleSchem12 {
    /**
     * The catalog name in Databricks
     */
    catalog?: string;
    /**
     * The table name in Databricks
     */
    name?: string;
    /**
     * The schema name in Databricks
     */
    schema?: string;
    /**
     * The Power BI storage mode of the table
     */
    storage_mode?: string;
}

export interface PythonWheelTaskClass {
    /**
     * Named entry point to use, if it does not exist in the metadata of the package it executes
     * the function from the package directly using `$packageName.$entryPoint()`
     */
    entry_point: string;
    /**
     * Command-line parameters passed to Python wheel task in the form of `["--name=task",
     * "--data=dbfs:/path/to/data.json"]`. Leave it empty if `parameters` is not null.
     */
    named_parameters?: {[key: string]: string} | string;
    /**
     * Name of the package to execute
     */
    package_name: string;
    /**
     * Command-line parameters passed to Python wheel task. Leave it empty if `named_parameters`
     * is not null.
     */
    parameters?: string[] | string;
}

export interface RunJobTaskClass {
    /**
     * An array of commands to execute for jobs with the dbt task, for example `"dbt_commands":
     * ["dbt deps", "dbt seed", "dbt deps", "dbt seed", "dbt run"]`
     */
    dbt_commands?: string[] | string;
    /**
     * A list of parameters for jobs with Spark JAR tasks, for example `"jar_params": ["john
     * doe", "35"]`.
     * The parameters are used to invoke the main function of the main class specified in the
     * Spark JAR task.
     * If not specified upon `run-now`, it defaults to an empty list.
     * jar_params cannot be specified in conjunction with notebook_params.
     * The JSON representation of this field (for example `{"jar_params":["john doe","35"]}`)
     * cannot exceed 10,000 bytes.
     *
     * Use [Task parameter variables](https://docs.databricks.com/jobs.html#parameter-variables)
     * to set parameters containing information about job runs.
     */
    jar_params?: string[] | string;
    /**
     * ID of the job to trigger.
     */
    job_id: number | string;
    /**
     * Job-level parameters used to trigger the job.
     */
    job_parameters?: {[key: string]: string} | string;
    /**
     * A map from keys to values for jobs with notebook task, for example `"notebook_params":
     * {"name": "john doe", "age": "35"}`.
     * The map is passed to the notebook and is accessible through the
     * [dbutils.widgets.get](https://docs.databricks.com/dev-tools/databricks-utils.html)
     * function.
     *
     * If not specified upon `run-now`, the triggered run uses the job’s base parameters.
     *
     * notebook_params cannot be specified in conjunction with jar_params.
     *
     * Use [Task parameter variables](https://docs.databricks.com/jobs.html#parameter-variables)
     * to set parameters containing information about job runs.
     *
     * The JSON representation of this field (for example `{"notebook_params":{"name":"john
     * doe","age":"35"}}`) cannot exceed 10,000 bytes.
     */
    notebook_params?: {[key: string]: string} | string;
    /**
     * Controls whether the pipeline should perform a full refresh
     */
    pipeline_params?: PipelineParamsClass | string;
    python_named_params?: {[key: string]: string} | string;
    /**
     * A list of parameters for jobs with Python tasks, for example `"python_params": ["john
     * doe", "35"]`.
     * The parameters are passed to Python file as command-line parameters. If specified upon
     * `run-now`, it would overwrite
     * the parameters specified in job setting. The JSON representation of this field (for
     * example `{"python_params":["john doe","35"]}`)
     * cannot exceed 10,000 bytes.
     *
     * Use [Task parameter variables](https://docs.databricks.com/jobs.html#parameter-variables)
     * to set parameters containing information about job runs.
     *
     * Important
     *
     * These parameters accept only Latin characters (ASCII character set). Using non-ASCII
     * characters returns an error.
     * Examples of invalid, non-ASCII characters are Chinese, Japanese kanjis, and emojis.
     */
    python_params?: string[] | string;
    /**
     * A list of parameters for jobs with spark submit task, for example `"spark_submit_params":
     * ["--class", "org.apache.spark.examples.SparkPi"]`.
     * The parameters are passed to spark-submit script as command-line parameters. If specified
     * upon `run-now`, it would overwrite the
     * parameters specified in job setting. The JSON representation of this field (for example
     * `{"python_params":["john doe","35"]}`)
     * cannot exceed 10,000 bytes.
     *
     * Use [Task parameter variables](https://docs.databricks.com/jobs.html#parameter-variables)
     * to set parameters containing information about job runs
     *
     * Important
     *
     * These parameters accept only Latin characters (ASCII character set). Using non-ASCII
     * characters returns an error.
     * Examples of invalid, non-ASCII characters are Chinese, Japanese kanjis, and emojis.
     */
    spark_submit_params?: string[] | string;
    /**
     * A map from keys to values for jobs with SQL task, for example `"sql_params": {"name":
     * "john doe", "age": "35"}`. The SQL alert task does not support custom parameters.
     */
    sql_params?: {[key: string]: string} | string;
}

export interface PipelineParamsClass {
    /**
     * If true, triggers a full refresh on the delta live table.
     */
    full_refresh?: boolean | string;
}

export interface SparkJarTaskClass {
    /**
     * Deprecated since 04/2016. Provide a `jar` through the `libraries` field instead. For an
     * example, see :method:jobs/create.
     */
    jar_uri?: string;
    /**
     * The full name of the class containing the main method to be executed. This class must be
     * contained in a JAR provided as a library.
     *
     * The code must use `SparkContext.getOrCreate` to obtain a Spark context; otherwise, runs
     * of the job fail.
     */
    main_class_name?: string;
    /**
     * Parameters passed to the main method.
     *
     * Use [Task parameter variables](https://docs.databricks.com/jobs.html#parameter-variables)
     * to set parameters containing information about job runs.
     */
    parameters?: string[] | string;
    /**
     * Deprecated. A value of `false` is no longer supported.
     */
    run_as_repl?: boolean | string;
}

export interface SparkPythonTaskClass {
    /**
     * Command line parameters passed to the Python file.
     *
     * Use [Task parameter variables](https://docs.databricks.com/jobs.html#parameter-variables)
     * to set parameters containing information about job runs.
     */
    parameters?: string[] | string;
    /**
     * The Python file to be executed. Cloud file URIs (such as dbfs:/, s3:/, adls:/, gcs:/) and
     * workspace paths are supported. For python files stored in the Databricks workspace, the
     * path must be absolute and begin with `/`. For files stored in a remote repository, the
     * path must be relative. This field is required.
     */
    python_file: string;
    /**
     * Optional location type of the Python file. When set to `WORKSPACE` or not specified, the
     * file will be retrieved from the local
     * Databricks workspace or cloud location (if the `python_file` has a URI format). When set
     * to `GIT`,
     * the Python file will be retrieved from a Git repository defined in `git_source`.
     *
     * * `WORKSPACE`: The Python file is located in a Databricks workspace or at a cloud
     * filesystem URI.
     * * `GIT`: The Python file is located in a remote Git repository.
     */
    source?: string;
}

export interface SparkSubmitTaskClass {
    /**
     * Command-line parameters passed to spark submit.
     *
     * Use [Task parameter variables](https://docs.databricks.com/jobs.html#parameter-variables)
     * to set parameters containing information about job runs.
     */
    parameters?: string[] | string;
}

export interface SQLTaskClass {
    /**
     * If alert, indicates that this job must refresh a SQL alert.
     */
    alert?: AlertClass | string;
    /**
     * If dashboard, indicates that this job must refresh a SQL dashboard.
     */
    dashboard?: BundleSchem14 | string;
    /**
     * If file, indicates that this job runs a SQL file in a remote Git repository.
     */
    file?: BundleSchem15 | string;
    /**
     * Parameters to be used for each run of this job. The SQL alert task does not support
     * custom parameters.
     */
    parameters?: {[key: string]: string} | string;
    /**
     * If query, indicates that this job must execute a SQL query.
     */
    query?: QueryClass | string;
    /**
     * The canonical identifier of the SQL warehouse. Recommended to use with serverless or pro
     * SQL warehouses. Classic SQL warehouses are only supported for SQL alert, dashboard and
     * query tasks and are limited to scheduled single-task jobs.
     */
    warehouse_id: string;
}

export interface AlertClass {
    /**
     * The canonical identifier of the SQL alert.
     */
    alert_id: string;
    /**
     * If true, the alert notifications are not sent to subscribers.
     */
    pause_subscriptions?: boolean | string;
    /**
     * If specified, alert notifications are sent to subscribers.
     */
    subscriptions?: Array<BundleSchem13 | string> | string;
}

export interface BundleSchem13 {
    /**
     * The canonical identifier of the destination to receive email notification. This parameter
     * is mutually exclusive with user_name. You cannot set both destination_id and user_name
     * for subscription notifications.
     */
    destination_id?: string;
    /**
     * The user name to receive the subscription email. This parameter is mutually exclusive
     * with destination_id. You cannot set both destination_id and user_name for subscription
     * notifications.
     */
    user_name?: string;
}

export interface BundleSchem14 {
    /**
     * Subject of the email sent to subscribers of this task.
     */
    custom_subject?: string;
    /**
     * The canonical identifier of the SQL dashboard.
     */
    dashboard_id: string;
    /**
     * If true, the dashboard snapshot is not taken, and emails are not sent to subscribers.
     */
    pause_subscriptions?: boolean | string;
    /**
     * If specified, dashboard snapshots are sent to subscriptions.
     */
    subscriptions?: Array<BundleSchem13 | string> | string;
}

export interface BundleSchem15 {
    /**
     * Path of the SQL file. Must be relative if the source is a remote Git repository and
     * absolute for workspace paths.
     */
    path: string;
    /**
     * Optional location type of the SQL file. When set to `WORKSPACE`, the SQL file will be
     * retrieved
     * from the local Databricks workspace. When set to `GIT`, the SQL file will be retrieved
     * from a Git repository
     * defined in `git_source`. If the value is empty, the task will use `GIT` if `git_source`
     * is defined and `WORKSPACE` otherwise.
     *
     * * `WORKSPACE`: SQL file is located in Databricks workspace.
     * * `GIT`: SQL file is located in cloud Git provider.
     */
    source?: string;
}

export interface QueryClass {
    /**
     * The canonical identifier of the SQL query.
     */
    query_id: string;
}

export interface WebhookNotificationsClass {
    /**
     * An optional list of system notification IDs to call when the duration of a run exceeds
     * the threshold specified for the `RUN_DURATION_SECONDS` metric in the `health` field. A
     * maximum of 3 destinations can be specified for the
     * `on_duration_warning_threshold_exceeded` property.
     */
    on_duration_warning_threshold_exceeded?:
        | Array<OnDurationWarningThresholdExceededClass | string>
        | string;
    /**
     * An optional list of system notification IDs to call when the run fails. A maximum of 3
     * destinations can be specified for the `on_failure` property.
     */
    on_failure?:
        | Array<OnDurationWarningThresholdExceededClass | string>
        | string;
    /**
     * An optional list of system notification IDs to call when the run starts. A maximum of 3
     * destinations can be specified for the `on_start` property.
     */
    on_start?: Array<OnDurationWarningThresholdExceededClass | string> | string;
    /**
     * An optional list of system notification IDs to call when any streaming backlog thresholds
     * are exceeded for any stream.
     * Streaming backlog thresholds can be set in the `health` field using the following
     * metrics: `STREAMING_BACKLOG_BYTES`, `STREAMING_BACKLOG_RECORDS`,
     * `STREAMING_BACKLOG_SECONDS`, or `STREAMING_BACKLOG_FILES`.
     * Alerting is based on the 10-minute average of these metrics. If the issue persists,
     * notifications are resent every 30 minutes.
     * A maximum of 3 destinations can be specified for the `on_streaming_backlog_exceeded`
     * property.
     */
    on_streaming_backlog_exceeded?:
        | Array<OnDurationWarningThresholdExceededClass | string>
        | string;
    /**
     * An optional list of system notification IDs to call when the run completes successfully.
     * A maximum of 3 destinations can be specified for the `on_success` property.
     */
    on_success?:
        | Array<OnDurationWarningThresholdExceededClass | string>
        | string;
}

export interface OnDurationWarningThresholdExceededClass {
    id: string;
}

export interface BundleSchem16 {
    /**
     * File arrival trigger settings.
     */
    file_arrival?: FileArrivalClass | string;
    /**
     * Whether this trigger is paused or not.
     */
    pause_status?: string;
    /**
     * Periodic trigger settings.
     */
    periodic?: PeriodicClass | string;
    /**
     * Old table trigger settings name. Deprecated in favor of `table_update`.
     */
    table?: TableUpdateClass | string;
    table_update?: TableUpdateClass | string;
}

export interface FileArrivalClass {
    /**
     * If set, the trigger starts a run only after the specified amount of time passed since
     * the last time the trigger fired. The minimum allowed value is 60 seconds
     */
    min_time_between_triggers_seconds?: number | string;
    /**
     * URL to be monitored for file arrivals. The path must point to the root or a subpath of
     * the external location.
     */
    url: string;
    /**
     * If set, the trigger starts a run only after no file activity has occurred for the
     * specified amount of time.
     * This makes it possible to wait for a batch of incoming files to arrive before triggering
     * a run. The
     * minimum allowed value is 60 seconds.
     */
    wait_after_last_change_seconds?: number | string;
}

export interface PeriodicClass {
    /**
     * The interval at which the trigger should run.
     */
    interval: number | string;
    /**
     * The unit of time for the interval.
     */
    unit: string;
}

export interface TableUpdateClass {
    /**
     * The table(s) condition based on which to trigger a job run.
     */
    condition?: string;
    /**
     * If set, the trigger starts a run only after the specified amount of time has passed since
     * the last time the trigger fired. The minimum allowed value is 60 seconds.
     */
    min_time_between_triggers_seconds?: number | string;
    /**
     * A list of Delta tables to monitor for changes. The table name must be in the format
     * `catalog_name.schema_name.table_name`.
     */
    table_names?: string[] | string;
    /**
     * If set, the trigger starts a run only after no table updates have occurred for the
     * specified time
     * and can be used to wait for a series of table updates before triggering a run. The
     * minimum allowed value is 60 seconds.
     */
    wait_after_last_change_seconds?: number | string;
}

export interface ModelServingEndpointClass {
    /**
     * The AI Gateway configuration for the serving endpoint. NOTE: External model, provisioned
     * throughput, and pay-per-token endpoints are fully supported; agent endpoints currently
     * only support inference tables.
     */
    ai_gateway?: AIGatewayClass | string;
    /**
     * The budget policy to be applied to the serving endpoint.
     */
    budget_policy_id?: string;
    /**
     * The core config of the serving endpoint.
     */
    config?: ConfigClass | string;
    /**
     * The name of the serving endpoint. This field is required and must be unique across a
     * Databricks workspace.
     * An endpoint name can consist of alphanumeric characters, dashes, and underscores.
     */
    name: string;
    permissions?: Array<BundleSchem18 | string> | string;
    /**
     * Rate limits to be applied to the serving endpoint. NOTE: this field is deprecated, please
     * use AI Gateway to manage rate limits.
     */
    rate_limits?: Array<BundleSchem19 | string> | string;
    /**
     * Enable route optimization for the serving endpoint.
     */
    route_optimized?: boolean | string;
    /**
     * Tags to be attached to the serving endpoint and automatically propagated to billing logs.
     */
    tags?: Array<BundleSchem20 | string> | string;
}

export interface AIGatewayClass {
    /**
     * Configuration for traffic fallback which auto fallbacks to other served entities if the
     * request to a served
     * entity fails with certain error codes, to increase availability.
     */
    fallback_config?: FallbackConfigClass | string;
    /**
     * Configuration for AI Guardrails to prevent unwanted data and unsafe data in requests and
     * responses.
     */
    guardrails?: GuardrailsClass | string;
    /**
     * Configuration for payload logging using inference tables.
     * Use these tables to monitor and audit data being sent to and received from model APIs and
     * to improve model quality.
     */
    inference_table_config?: InferenceTableConfigClass | string;
    /**
     * Configuration for rate limits which can be set to limit endpoint traffic.
     */
    rate_limits?: Array<BundleSchem17 | string> | string;
    /**
     * Configuration to enable usage tracking using system tables.
     * These tables allow you to monitor operational usage on endpoints and their associated
     * costs.
     */
    usage_tracking_config?: UsageTrackingConfigClass | string;
}

export interface FallbackConfigClass {
    /**
     * Whether to enable traffic fallback. When a served entity in the serving endpoint returns
     * specific error
     * codes (e.g. 500), the request will automatically be round-robin attempted with other
     * served entities in the same
     * endpoint, following the order of served entity list, until a successful response is
     * returned.
     * If all attempts fail, return the last response with the error code.
     */
    enabled: boolean | string;
}

export interface GuardrailsClass {
    /**
     * Configuration for input guardrail filters.
     */
    input?: InputClass | string;
    /**
     * Configuration for output guardrail filters.
     */
    output?: InputClass | string;
}

export interface InputClass {
    /**
     * List of invalid keywords.
     * AI guardrail uses keyword or string matching to decide if the keyword exists in the
     * request or response content.
     */
    invalid_keywords?: string[] | string;
    /**
     * Configuration for guardrail PII filter.
     */
    pii?: PiiClass | string;
    /**
     * Indicates whether the safety filter is enabled.
     */
    safety?: boolean | string;
    /**
     * The list of allowed topics.
     * Given a chat request, this guardrail flags the request if its topic is not in the allowed
     * topics.
     */
    valid_topics?: string[] | string;
}

export interface PiiClass {
    /**
     * Configuration for input guardrail filters.
     */
    behavior?: string;
}

export interface InferenceTableConfigClass {
    /**
     * The name of the catalog in Unity Catalog. Required when enabling inference tables.
     * NOTE: On update, you have to disable inference table first in order to change the catalog
     * name.
     */
    catalog_name?: string;
    /**
     * Indicates whether the inference table is enabled.
     */
    enabled?: boolean | string;
    /**
     * The name of the schema in Unity Catalog. Required when enabling inference tables.
     * NOTE: On update, you have to disable inference table first in order to change the schema
     * name.
     */
    schema_name?: string;
    /**
     * The prefix of the table in Unity Catalog.
     * NOTE: On update, you have to disable inference table first in order to change the prefix
     * name.
     */
    table_name_prefix?: string;
}

export interface BundleSchem17 {
    /**
     * Used to specify how many calls are allowed for a key within the renewal_period.
     */
    calls: number | string;
    /**
     * Key field for a rate limit. Currently, only 'user' and 'endpoint' are supported,
     * with 'endpoint' being the default if not specified.
     */
    key?: string;
    /**
     * Renewal period field for a rate limit. Currently, only 'minute' is supported.
     */
    renewal_period: string;
}

export interface UsageTrackingConfigClass {
    /**
     * Whether to enable usage tracking.
     */
    enabled?: boolean | string;
}

export interface ConfigClass {
    /**
     * Configuration for Inference Tables which automatically logs requests and responses to
     * Unity Catalog.
     * Note: this field is deprecated for creating new provisioned throughput endpoints,
     * or updating existing provisioned throughput endpoints that never have inference table
     * configured;
     * in these cases please use AI Gateway to manage inference tables.
     */
    auto_capture_config?: AutoCaptureConfigClass | string;
    /**
     * The list of served entities under the serving endpoint config.
     */
    served_entities?: Array<ServedEntityClass | string> | string;
    /**
     * (Deprecated, use served_entities instead) The list of served models under the serving
     * endpoint config.
     */
    served_models?: Array<ServedModelClass | string> | string;
    /**
     * The traffic configuration associated with the serving endpoint config.
     */
    traffic_config?: TrafficConfigClass | string;
}

export interface AutoCaptureConfigClass {
    /**
     * The name of the catalog in Unity Catalog. NOTE: On update, you cannot change the catalog
     * name if the inference table is already enabled.
     */
    catalog_name?: string;
    /**
     * Indicates whether the inference table is enabled.
     */
    enabled?: boolean | string;
    /**
     * The name of the schema in Unity Catalog. NOTE: On update, you cannot change the schema
     * name if the inference table is already enabled.
     */
    schema_name?: string;
    /**
     * The prefix of the table in Unity Catalog. NOTE: On update, you cannot change the prefix
     * name if the inference table is already enabled.
     */
    table_name_prefix?: string;
}

export interface ServedEntityClass {
    /**
     * The name of the entity to be served. The entity may be a model in the Databricks Model
     * Registry, a model in the Unity Catalog (UC), or a function of type FEATURE_SPEC in the
     * UC. If it is a UC object, the full name of the object should be given in the form of
     * **catalog_name.schema_name.model_name**.
     */
    entity_name?: string;
    entity_version?: string;
    /**
     * An object containing a set of optional, user-specified environment variable key-value
     * pairs used for serving this entity. Note: this is an experimental feature and subject to
     * change. Example entity environment variables that refer to Databricks secrets:
     * `{"OPENAI_API_KEY": "{{secrets/my_scope/my_key}}", "DATABRICKS_TOKEN":
     * "{{secrets/my_scope2/my_key2}}"}`
     */
    environment_vars?: {[key: string]: string} | string;
    /**
     * The external model to be served. NOTE: Only one of external_model and (entity_name,
     * entity_version, workload_size, workload_type, and scale_to_zero_enabled) can be specified
     * with the latter set being used for custom model serving for a Databricks registered
     * model. For an existing endpoint with external_model, it cannot be updated to an endpoint
     * without external_model. If the endpoint is created without external_model, users cannot
     * update it to add external_model later. The task type of all external models within an
     * endpoint must be the same.
     */
    external_model?: ExternalModelClass | string;
    /**
     * ARN of the instance profile that the served entity uses to access AWS resources.
     */
    instance_profile_arn?: string;
    /**
     * The maximum provisioned concurrency that the endpoint can scale up to. Do not use if
     * workload_size is specified.
     */
    max_provisioned_concurrency?: number | string;
    /**
     * The maximum tokens per second that the endpoint can scale up to.
     */
    max_provisioned_throughput?: number | string;
    /**
     * The minimum provisioned concurrency that the endpoint can scale down to. Do not use if
     * workload_size is specified.
     */
    min_provisioned_concurrency?: number | string;
    /**
     * The minimum tokens per second that the endpoint can scale down to.
     */
    min_provisioned_throughput?: number | string;
    /**
     * The name of a served entity. It must be unique across an endpoint. A served entity name
     * can consist of alphanumeric characters, dashes, and underscores. If not specified for an
     * external model, this field defaults to external_model.name, with '.' and ':' replaced
     * with '-', and if not specified for other entities, it defaults to
     * entity_name-entity_version.
     */
    name?: string;
    /**
     * The number of model units provisioned.
     */
    provisioned_model_units?: number | string;
    /**
     * Whether the compute resources for the served entity should scale down to zero.
     */
    scale_to_zero_enabled?: boolean | string;
    /**
     * The workload size of the served entity. The workload size corresponds to a range of
     * provisioned concurrency that the compute autoscales between. A single unit of provisioned
     * concurrency can process one request at a time. Valid workload sizes are "Small" (4 - 4
     * provisioned concurrency), "Medium" (8 - 16 provisioned concurrency), and "Large" (16 - 64
     * provisioned concurrency). Additional custom workload sizes can also be used when
     * available in the workspace. If scale-to-zero is enabled, the lower bound of the
     * provisioned concurrency for each workload size is 0. Do not use if
     * min_provisioned_concurrency and max_provisioned_concurrency are specified.
     */
    workload_size?: string;
    /**
     * The workload type of the served entity. The workload type selects which type of compute
     * to use in the endpoint. The default value for this parameter is "CPU". For deep learning
     * workloads, GPU acceleration is available by selecting workload types like GPU_SMALL and
     * others. See the available [GPU
     * types](https://docs.databricks.com/en/machine-learning/model-serving/create-manage-serving-endpoints.html#gpu-workload-types).
     */
    workload_type?: string;
}

export interface ExternalModelClass {
    /**
     * AI21Labs Config. Only required if the provider is 'ai21labs'.
     */
    ai21labs_config?: Ai21LabsConfigClass | string;
    /**
     * Amazon Bedrock Config. Only required if the provider is 'amazon-bedrock'.
     */
    amazon_bedrock_config?: AmazonBedrockConfigClass | string;
    /**
     * Anthropic Config. Only required if the provider is 'anthropic'.
     */
    anthropic_config?: AnthropicConfigClass | string;
    /**
     * Cohere Config. Only required if the provider is 'cohere'.
     */
    cohere_config?: CohereConfigClass | string;
    /**
     * Custom Provider Config. Only required if the provider is 'custom'.
     */
    custom_provider_config?: CustomProviderConfigClass | string;
    /**
     * Databricks Model Serving Config. Only required if the provider is
     * 'databricks-model-serving'.
     */
    databricks_model_serving_config?:
        | DatabricksModelServingConfigClass
        | string;
    /**
     * Google Cloud Vertex AI Config. Only required if the provider is 'google-cloud-vertex-ai'.
     */
    google_cloud_vertex_ai_config?: GoogleCloudVertexAIConfigClass | string;
    /**
     * The name of the external model.
     */
    name: string;
    /**
     * OpenAI Config. Only required if the provider is 'openai'.
     */
    openai_config?: OpenaiConfigClass | string;
    /**
     * PaLM Config. Only required if the provider is 'palm'.
     */
    palm_config?: PalmConfigClass | string;
    /**
     * The name of the provider for the external model. Currently, the supported providers are
     * 'ai21labs', 'anthropic', 'amazon-bedrock', 'cohere', 'databricks-model-serving',
     * 'google-cloud-vertex-ai', 'openai', 'palm', and 'custom'.
     */
    provider: string;
    /**
     * The task type of the external model.
     */
    task: string;
}

export interface Ai21LabsConfigClass {
    /**
     * The Databricks secret key reference for an AI21 Labs API key. If you
     * prefer to paste your API key directly, see `ai21labs_api_key_plaintext`.
     * You must provide an API key using one of the following fields:
     * `ai21labs_api_key` or `ai21labs_api_key_plaintext`.
     */
    ai21labs_api_key?: string;
    /**
     * An AI21 Labs API key provided as a plaintext string. If you prefer to
     * reference your key using Databricks Secrets, see `ai21labs_api_key`. You
     * must provide an API key using one of the following fields:
     * `ai21labs_api_key` or `ai21labs_api_key_plaintext`.
     */
    ai21labs_api_key_plaintext?: string;
}

export interface AmazonBedrockConfigClass {
    /**
     * The Databricks secret key reference for an AWS access key ID with
     * permissions to interact with Bedrock services. If you prefer to paste
     * your API key directly, see `aws_access_key_id_plaintext`. You must provide an API
     * key using one of the following fields: `aws_access_key_id` or
     * `aws_access_key_id_plaintext`.
     */
    aws_access_key_id?: string;
    /**
     * An AWS access key ID with permissions to interact with Bedrock services
     * provided as a plaintext string. If you prefer to reference your key using
     * Databricks Secrets, see `aws_access_key_id`. You must provide an API key
     * using one of the following fields: `aws_access_key_id` or
     * `aws_access_key_id_plaintext`.
     */
    aws_access_key_id_plaintext?: string;
    /**
     * The AWS region to use. Bedrock has to be enabled there.
     */
    aws_region: string;
    /**
     * The Databricks secret key reference for an AWS secret access key paired
     * with the access key ID, with permissions to interact with Bedrock
     * services. If you prefer to paste your API key directly, see
     * `aws_secret_access_key_plaintext`. You must provide an API key using one
     * of the following fields: `aws_secret_access_key` or
     * `aws_secret_access_key_plaintext`.
     */
    aws_secret_access_key?: string;
    /**
     * An AWS secret access key paired with the access key ID, with permissions
     * to interact with Bedrock services provided as a plaintext string. If you
     * prefer to reference your key using Databricks Secrets, see
     * `aws_secret_access_key`. You must provide an API key using one of the
     * following fields: `aws_secret_access_key` or
     * `aws_secret_access_key_plaintext`.
     */
    aws_secret_access_key_plaintext?: string;
    /**
     * The underlying provider in Amazon Bedrock. Supported values (case
     * insensitive) include: Anthropic, Cohere, AI21Labs, Amazon.
     */
    bedrock_provider: string;
    /**
     * ARN of the instance profile that the external model will use to access AWS resources.
     * You must authenticate using an instance profile or access keys.
     * If you prefer to authenticate using access keys, see `aws_access_key_id`,
     * `aws_access_key_id_plaintext`, `aws_secret_access_key` and
     * `aws_secret_access_key_plaintext`.
     */
    instance_profile_arn?: string;
}

export interface AnthropicConfigClass {
    /**
     * The Databricks secret key reference for an Anthropic API key. If you
     * prefer to paste your API key directly, see `anthropic_api_key_plaintext`.
     * You must provide an API key using one of the following fields:
     * `anthropic_api_key` or `anthropic_api_key_plaintext`.
     */
    anthropic_api_key?: string;
    /**
     * The Anthropic API key provided as a plaintext string. If you prefer to
     * reference your key using Databricks Secrets, see `anthropic_api_key`. You
     * must provide an API key using one of the following fields:
     * `anthropic_api_key` or `anthropic_api_key_plaintext`.
     */
    anthropic_api_key_plaintext?: string;
}

export interface CohereConfigClass {
    /**
     * This is an optional field to provide a customized base URL for the Cohere
     * API. If left unspecified, the standard Cohere base URL is used.
     */
    cohere_api_base?: string;
    /**
     * The Databricks secret key reference for a Cohere API key. If you prefer
     * to paste your API key directly, see `cohere_api_key_plaintext`. You must
     * provide an API key using one of the following fields: `cohere_api_key` or
     * `cohere_api_key_plaintext`.
     */
    cohere_api_key?: string;
    /**
     * The Cohere API key provided as a plaintext string. If you prefer to
     * reference your key using Databricks Secrets, see `cohere_api_key`. You
     * must provide an API key using one of the following fields:
     * `cohere_api_key` or `cohere_api_key_plaintext`.
     */
    cohere_api_key_plaintext?: string;
}

/**
 * Configs needed to create a custom provider model route.
 */
export interface CustomProviderConfigClass {
    /**
     * This is a field to provide API key authentication for the custom provider API.
     * You can only specify one authentication method.
     */
    api_key_auth?: APIKeyAuthClass | string;
    /**
     * This is a field to provide bearer token authentication for the custom provider API.
     * You can only specify one authentication method.
     */
    bearer_token_auth?: BearerTokenAuthClass | string;
    /**
     * This is a field to provide the URL of the custom provider API.
     */
    custom_provider_url: string;
}

export interface APIKeyAuthClass {
    /**
     * The name of the API key parameter used for authentication.
     */
    key: string;
    /**
     * The Databricks secret key reference for an API Key.
     * If you prefer to paste your token directly, see `value_plaintext`.
     */
    value?: string;
    /**
     * The API Key provided as a plaintext string. If you prefer to reference your
     * token using Databricks Secrets, see `value`.
     */
    value_plaintext?: string;
}

export interface BearerTokenAuthClass {
    /**
     * The Databricks secret key reference for a token.
     * If you prefer to paste your token directly, see `token_plaintext`.
     */
    token?: string;
    /**
     * The token provided as a plaintext string. If you prefer to reference your
     * token using Databricks Secrets, see `token`.
     */
    token_plaintext?: string;
}

export interface DatabricksModelServingConfigClass {
    /**
     * The Databricks secret key reference for a Databricks API token that
     * corresponds to a user or service principal with Can Query access to the
     * model serving endpoint pointed to by this external model. If you prefer
     * to paste your API key directly, see `databricks_api_token_plaintext`. You
     * must provide an API key using one of the following fields:
     * `databricks_api_token` or `databricks_api_token_plaintext`.
     */
    databricks_api_token?: string;
    /**
     * The Databricks API token that corresponds to a user or service principal
     * with Can Query access to the model serving endpoint pointed to by this
     * external model provided as a plaintext string. If you prefer to reference
     * your key using Databricks Secrets, see `databricks_api_token`. You must
     * provide an API key using one of the following fields:
     * `databricks_api_token` or `databricks_api_token_plaintext`.
     */
    databricks_api_token_plaintext?: string;
    /**
     * The URL of the Databricks workspace containing the model serving endpoint
     * pointed to by this external model.
     */
    databricks_workspace_url: string;
}

export interface GoogleCloudVertexAIConfigClass {
    /**
     * The Databricks secret key reference for a private key for the service
     * account which has access to the Google Cloud Vertex AI Service. See [Best
     * practices for managing service account keys]. If you prefer to paste your
     * API key directly, see `private_key_plaintext`. You must provide an API
     * key using one of the following fields: `private_key` or
     * `private_key_plaintext`
     *
     * [Best practices for managing service account keys]:
     * https://cloud.google.com/iam/docs/best-practices-for-managing-service-account-keys
     */
    private_key?: string;
    /**
     * The private key for the service account which has access to the Google
     * Cloud Vertex AI Service provided as a plaintext secret. See [Best
     * practices for managing service account keys]. If you prefer to reference
     * your key using Databricks Secrets, see `private_key`. You must provide an
     * API key using one of the following fields: `private_key` or
     * `private_key_plaintext`.
     *
     * [Best practices for managing service account keys]:
     * https://cloud.google.com/iam/docs/best-practices-for-managing-service-account-keys
     */
    private_key_plaintext?: string;
    /**
     * This is the Google Cloud project id that the service account is
     * associated with.
     */
    project_id: string;
    /**
     * This is the region for the Google Cloud Vertex AI Service. See [supported
     * regions] for more details. Some models are only available in specific
     * regions.
     *
     * [supported regions]: https://cloud.google.com/vertex-ai/docs/general/locations
     */
    region: string;
}

/**
 * Configs needed to create an OpenAI model route.
 */
export interface OpenaiConfigClass {
    /**
     * This field is only required for Azure AD OpenAI and is the Microsoft
     * Entra Client ID.
     */
    microsoft_entra_client_id?: string;
    /**
     * The Databricks secret key reference for a client secret used for
     * Microsoft Entra ID authentication. If you prefer to paste your client
     * secret directly, see `microsoft_entra_client_secret_plaintext`. You must
     * provide an API key using one of the following fields:
     * `microsoft_entra_client_secret` or
     * `microsoft_entra_client_secret_plaintext`.
     */
    microsoft_entra_client_secret?: string;
    /**
     * The client secret used for Microsoft Entra ID authentication provided as
     * a plaintext string. If you prefer to reference your key using Databricks
     * Secrets, see `microsoft_entra_client_secret`. You must provide an API key
     * using one of the following fields: `microsoft_entra_client_secret` or
     * `microsoft_entra_client_secret_plaintext`.
     */
    microsoft_entra_client_secret_plaintext?: string;
    /**
     * This field is only required for Azure AD OpenAI and is the Microsoft
     * Entra Tenant ID.
     */
    microsoft_entra_tenant_id?: string;
    /**
     * This is a field to provide a customized base URl for the OpenAI API. For
     * Azure OpenAI, this field is required, and is the base URL for the Azure
     * OpenAI API service provided by Azure. For other OpenAI API types, this
     * field is optional, and if left unspecified, the standard OpenAI base URL
     * is used.
     */
    openai_api_base?: string;
    /**
     * The Databricks secret key reference for an OpenAI API key using the
     * OpenAI or Azure service. If you prefer to paste your API key directly,
     * see `openai_api_key_plaintext`. You must provide an API key using one of
     * the following fields: `openai_api_key` or `openai_api_key_plaintext`.
     */
    openai_api_key?: string;
    /**
     * The OpenAI API key using the OpenAI or Azure service provided as a
     * plaintext string. If you prefer to reference your key using Databricks
     * Secrets, see `openai_api_key`. You must provide an API key using one of
     * the following fields: `openai_api_key` or `openai_api_key_plaintext`.
     */
    openai_api_key_plaintext?: string;
    /**
     * This is an optional field to specify the type of OpenAI API to use. For
     * Azure OpenAI, this field is required, and adjust this parameter to
     * represent the preferred security access validation protocol. For access
     * token validation, use azure. For authentication using Azure Active
     * Directory (Azure AD) use, azuread.
     */
    openai_api_type?: string;
    /**
     * This is an optional field to specify the OpenAI API version. For Azure
     * OpenAI, this field is required, and is the version of the Azure OpenAI
     * service to utilize, specified by a date.
     */
    openai_api_version?: string;
    /**
     * This field is only required for Azure OpenAI and is the name of the
     * deployment resource for the Azure OpenAI service.
     */
    openai_deployment_name?: string;
    /**
     * This is an optional field to specify the organization in OpenAI or Azure
     * OpenAI.
     */
    openai_organization?: string;
}

export interface PalmConfigClass {
    /**
     * The Databricks secret key reference for a PaLM API key. If you prefer to
     * paste your API key directly, see `palm_api_key_plaintext`. You must
     * provide an API key using one of the following fields: `palm_api_key` or
     * `palm_api_key_plaintext`.
     */
    palm_api_key?: string;
    /**
     * The PaLM API key provided as a plaintext string. If you prefer to
     * reference your key using Databricks Secrets, see `palm_api_key`. You must
     * provide an API key using one of the following fields: `palm_api_key` or
     * `palm_api_key_plaintext`.
     */
    palm_api_key_plaintext?: string;
}

export interface ServedModelClass {
    /**
     * An object containing a set of optional, user-specified environment variable key-value
     * pairs used for serving this entity. Note: this is an experimental feature and subject to
     * change. Example entity environment variables that refer to Databricks secrets:
     * `{"OPENAI_API_KEY": "{{secrets/my_scope/my_key}}", "DATABRICKS_TOKEN":
     * "{{secrets/my_scope2/my_key2}}"}`
     */
    environment_vars?: {[key: string]: string} | string;
    /**
     * ARN of the instance profile that the served entity uses to access AWS resources.
     */
    instance_profile_arn?: string;
    /**
     * The maximum provisioned concurrency that the endpoint can scale up to. Do not use if
     * workload_size is specified.
     */
    max_provisioned_concurrency?: number | string;
    /**
     * The maximum tokens per second that the endpoint can scale up to.
     */
    max_provisioned_throughput?: number | string;
    /**
     * The minimum provisioned concurrency that the endpoint can scale down to. Do not use if
     * workload_size is specified.
     */
    min_provisioned_concurrency?: number | string;
    /**
     * The minimum tokens per second that the endpoint can scale down to.
     */
    min_provisioned_throughput?: number | string;
    model_name: string;
    model_version: string;
    /**
     * The name of a served entity. It must be unique across an endpoint. A served entity name
     * can consist of alphanumeric characters, dashes, and underscores. If not specified for an
     * external model, this field defaults to external_model.name, with '.' and ':' replaced
     * with '-', and if not specified for other entities, it defaults to
     * entity_name-entity_version.
     */
    name?: string;
    /**
     * The number of model units provisioned.
     */
    provisioned_model_units?: number | string;
    /**
     * Whether the compute resources for the served entity should scale down to zero.
     */
    scale_to_zero_enabled: boolean | string;
    /**
     * The workload size of the served entity. The workload size corresponds to a range of
     * provisioned concurrency that the compute autoscales between. A single unit of provisioned
     * concurrency can process one request at a time. Valid workload sizes are "Small" (4 - 4
     * provisioned concurrency), "Medium" (8 - 16 provisioned concurrency), and "Large" (16 - 64
     * provisioned concurrency). Additional custom workload sizes can also be used when
     * available in the workspace. If scale-to-zero is enabled, the lower bound of the
     * provisioned concurrency for each workload size is 0. Do not use if
     * min_provisioned_concurrency and max_provisioned_concurrency are specified.
     */
    workload_size?: string;
    /**
     * The workload type of the served entity. The workload type selects which type of compute
     * to use in the endpoint. The default value for this parameter is "CPU". For deep learning
     * workloads, GPU acceleration is available by selecting workload types like GPU_SMALL and
     * others. See the available [GPU
     * types](https://docs.databricks.com/en/machine-learning/model-serving/create-manage-serving-endpoints.html#gpu-workload-types).
     */
    workload_type?: string;
}

export interface TrafficConfigClass {
    /**
     * The list of routes that define traffic to each served entity.
     */
    routes?: Array<RouteClass | string> | string;
}

export interface RouteClass {
    /**
     * The name of the served model this route configures traffic for.
     */
    served_model_name: string;
    /**
     * The percentage of endpoint traffic to send to this route. It must be an integer between 0
     * and 100 inclusive.
     */
    traffic_percentage: number | string;
}

export interface BundleSchem18 {
    group_name?: string;
    level: string;
    service_principal_name?: string;
    user_name?: string;
}

export interface BundleSchem19 {
    /**
     * Used to specify how many calls are allowed for a key within the renewal_period.
     */
    calls: number | string;
    /**
     * Key field for a serving endpoint rate limit. Currently, only 'user' and 'endpoint' are
     * supported, with 'endpoint' being the default if not specified.
     */
    key?: string;
    /**
     * Renewal period field for a serving endpoint rate limit. Currently, only 'minute' is
     * supported.
     */
    renewal_period: string;
}

export interface BundleSchem20 {
    /**
     * Key field for a serving endpoint tag.
     */
    key: string;
    /**
     * Optional value field for a serving endpoint tag.
     */
    value?: string;
}

export interface ModelClass {
    /**
     * Optional description for registered model.
     */
    description?: string;
    /**
     * Register models under this name
     */
    name: string;
    permissions?: Array<BundleSchem21 | string> | string;
    /**
     * Additional metadata for registered model.
     */
    tags?: Array<BundleSchem22 | string> | string;
}

export interface BundleSchem21 {
    group_name?: string;
    level: string;
    service_principal_name?: string;
    user_name?: string;
}

export interface BundleSchem22 {
    /**
     * The tag key.
     */
    key?: string;
    /**
     * The tag value.
     */
    value?: string;
}

export interface PipelineClass {
    /**
     * Budget policy of this pipeline.
     */
    budget_policy_id?: string;
    /**
     * A catalog in Unity Catalog to publish data from this pipeline to. If `target` is
     * specified, tables in this pipeline are published to a `target` schema inside `catalog`
     * (for example, `catalog`.`target`.`table`). If `target` is not specified, no data is
     * published to Unity Catalog.
     */
    catalog?: string;
    /**
     * DLT Release Channel that specifies which version to use.
     */
    channel?: string;
    /**
     * Cluster settings for this pipeline deployment.
     */
    clusters?: Array<BundleSchem23 | string> | string;
    /**
     * String-String configuration for this pipeline execution.
     */
    configuration?: {[key: string]: string} | string;
    /**
     * Whether the pipeline is continuous or triggered. This replaces `trigger`.
     */
    continuous?: boolean | string;
    /**
     * Whether the pipeline is in Development mode. Defaults to false.
     */
    development?: boolean | string;
    /**
     * Pipeline product edition.
     */
    edition?: string;
    /**
     * Environment specification for this pipeline used to install dependencies.
     */
    environment?: BundleSchem25 | string;
    /**
     * Event log configuration for this pipeline
     */
    event_log?: EventLogClass | string;
    /**
     * Filters on which Pipeline packages to include in the deployed graph.
     */
    filters?: FiltersClass | string;
    /**
     * The definition of a gateway pipeline to support change data capture.
     */
    gateway_definition?: GatewayDefinitionClass | string;
    /**
     * Unique identifier for this pipeline.
     */
    id?: string;
    /**
     * The configuration for a managed ingestion pipeline. These settings cannot be used with
     * the 'libraries', 'schema', 'target', or 'catalog' settings.
     */
    ingestion_definition?: IngestionDefinitionClass | string;
    /**
     * Libraries or code needed by this deployment.
     */
    libraries?: Array<BundleSchem28 | string> | string;
    /**
     * Friendly identifier for this pipeline.
     */
    name?: string;
    /**
     * List of notification settings for this pipeline.
     */
    notifications?: Array<NotificationClass | string> | string;
    permissions?: Array<BundleSchem30 | string> | string;
    /**
     * Whether Photon is enabled for this pipeline.
     */
    photon?: boolean | string;
    /**
     * Restart window of this pipeline.
     */
    restart_window?: RestartWindowClass | string;
    /**
     * Root path for this pipeline.
     * This is used as the root directory when editing the pipeline in the Databricks user
     * interface and it is
     * added to sys.path when executing Python sources during pipeline execution.
     */
    root_path?: string;
    run_as?: BundleSchem31 | string;
    /**
     * The default schema (database) where tables are read from or published to.
     */
    schema?: string;
    /**
     * Whether serverless compute is enabled for this pipeline.
     */
    serverless?: boolean | string;
    /**
     * DBFS root directory for storing checkpoints and tables.
     */
    storage?: string;
    /**
     * A map of tags associated with the pipeline.
     * These are forwarded to the cluster as cluster tags, and are therefore subject to the same
     * limitations.
     * A maximum of 25 tags can be added to the pipeline.
     */
    tags?: {[key: string]: string} | string;
    /**
     * Target schema (database) to add tables in this pipeline to. Exactly one of `schema` or
     * `target` must be specified. To publish to Unity Catalog, also specify `catalog`. This
     * legacy field is deprecated for pipeline creation in favor of the `schema` field.
     */
    target?: string;
    /**
     * Which pipeline trigger to use. Deprecated: Use `continuous` instead.
     */
    trigger?: BundleSchem32 | string;
}

export interface BundleSchem23 {
    /**
     * Note: This field won't be persisted. Only API users will check this field.
     */
    apply_policy_default_values?: boolean | string;
    /**
     * Parameters needed in order to automatically scale clusters up and down based on load.
     * Note: autoscaling works best with DB runtime versions 3.0 or later.
     */
    autoscale?: BundleSchem24 | string;
    /**
     * Attributes related to clusters running on Amazon Web Services.
     * If not specified at cluster creation, a set of default values will be used.
     */
    aws_attributes?: AwsAttributesClass | string;
    /**
     * Attributes related to clusters running on Microsoft Azure.
     * If not specified at cluster creation, a set of default values will be used.
     */
    azure_attributes?: AzureAttributesClass | string;
    /**
     * The configuration for delivering spark logs to a long-term storage destination.
     * Only dbfs destinations are supported. Only one destination can be specified
     * for one cluster. If the conf is given, the logs will be delivered to the destination
     * every
     * `5 mins`. The destination of driver logs is `$destination/$clusterId/driver`, while
     * the destination of executor logs is `$destination/$clusterId/executor`.
     */
    cluster_log_conf?: ClusterLogConfClass | string;
    /**
     * Additional tags for cluster resources. Databricks will tag all cluster resources (e.g.,
     * AWS
     * instances and EBS volumes) with these tags in addition to `default_tags`. Notes:
     *
     * - Currently, Databricks allows at most 45 custom tags
     *
     * - Clusters can only reuse cloud resources if the resources' tags are a subset of the
     * cluster tags
     */
    custom_tags?: {[key: string]: string} | string;
    /**
     * The optional ID of the instance pool for the driver of the cluster belongs.
     * The pool cluster uses the instance pool with id (instance_pool_id) if the driver pool is
     * not
     * assigned.
     */
    driver_instance_pool_id?: string;
    /**
     * The node type of the Spark driver.
     * Note that this field is optional; if unset, the driver node type will be set as the same
     * value
     * as `node_type_id` defined above.
     */
    driver_node_type_id?: string;
    /**
     * Whether to enable local disk encryption for the cluster.
     */
    enable_local_disk_encryption?: boolean | string;
    /**
     * Attributes related to clusters running on Google Cloud Platform.
     * If not specified at cluster creation, a set of default values will be used.
     */
    gcp_attributes?: GcpAttributesClass | string;
    /**
     * The configuration for storing init scripts. Any number of destinations can be specified.
     * The scripts are executed sequentially in the order provided. If `cluster_log_conf` is
     * specified, init script logs are sent to `<destination>/<cluster-ID>/init_scripts`.
     */
    init_scripts?: Array<InitScriptClass | string> | string;
    /**
     * The optional ID of the instance pool to which the cluster belongs.
     */
    instance_pool_id?: string;
    /**
     * A label for the cluster specification, either `default` to configure the default cluster,
     * or `maintenance` to configure the maintenance cluster. This field is optional. The
     * default value is `default`.
     */
    label?: string;
    /**
     * This field encodes, through a single value, the resources available to each of
     * the Spark nodes in this cluster. For example, the Spark nodes can be provisioned
     * and optimized for memory or compute intensive workloads. A list of available node
     * types can be retrieved by using the :method:clusters/listNodeTypes API call.
     */
    node_type_id?: string;
    /**
     * Number of worker nodes that this cluster should have. A cluster has one Spark Driver
     * and `num_workers` Executors for a total of `num_workers` + 1 Spark nodes.
     *
     * Note: When reading the properties of a cluster, this field reflects the desired number
     * of workers rather than the actual current number of workers. For instance, if a cluster
     * is resized from 5 to 10 workers, this field will immediately be updated to reflect
     * the target size of 10 workers, whereas the workers listed in `spark_info` will gradually
     * increase from 5 to 10 as the new nodes are provisioned.
     */
    num_workers?: number | string;
    /**
     * The ID of the cluster policy used to create the cluster if applicable.
     */
    policy_id?: string;
    /**
     * An object containing a set of optional, user-specified Spark configuration key-value
     * pairs.
     * See :method:clusters/create for more details.
     */
    spark_conf?: {[key: string]: string} | string;
    /**
     * An object containing a set of optional, user-specified environment variable key-value
     * pairs.
     * Please note that key-value pair of the form (X,Y) will be exported as is (i.e.,
     * `export X='Y'`) while launching the driver and workers.
     *
     * In order to specify an additional set of `SPARK_DAEMON_JAVA_OPTS`, we recommend appending
     * them to `$SPARK_DAEMON_JAVA_OPTS` as shown in the example below. This ensures that all
     * default databricks managed environmental variables are included as well.
     *
     * Example Spark environment variables:
     * `{"SPARK_WORKER_MEMORY": "28000m", "SPARK_LOCAL_DIRS": "/local_disk0"}` or
     * `{"SPARK_DAEMON_JAVA_OPTS": "$SPARK_DAEMON_JAVA_OPTS
     * -Dspark.shuffle.service.enabled=true"}`
     */
    spark_env_vars?: {[key: string]: string} | string;
    /**
     * SSH public key contents that will be added to each Spark node in this cluster. The
     * corresponding private keys can be used to login with the user name `ubuntu` on port
     * `2200`.
     * Up to 10 keys can be specified.
     */
    ssh_public_keys?: string[] | string;
}

export interface BundleSchem24 {
    /**
     * The maximum number of workers to which the cluster can scale up when overloaded.
     * `max_workers` must be strictly greater than `min_workers`.
     */
    max_workers: number | string;
    /**
     * The minimum number of workers the cluster can scale down to when underutilized.
     * It is also the initial number of workers the cluster will have after creation.
     */
    min_workers: number | string;
    /**
     * Databricks Enhanced Autoscaling optimizes cluster utilization by automatically
     * allocating cluster resources based on workload volume, with minimal impact to
     * the data processing latency of your pipelines. Enhanced Autoscaling is available
     * for `updates` clusters only. The legacy autoscaling feature is used for `maintenance`
     * clusters.
     */
    mode?: string;
}

/**
 * The environment entity used to preserve serverless environment side panel, jobs'
 * environment for non-notebook task, and DLT's environment for classic and serverless
 * pipelines.
 * In this minimal environment spec, only pip dependencies are supported.
 */
export interface BundleSchem25 {
    /**
     * List of pip dependencies, as supported by the version of pip in this environment.
     * Each dependency is a pip requirement file line
     * https://pip.pypa.io/en/stable/reference/requirements-file-format/
     * Allowed dependency could be <requirement specifier>, <archive url/path>, <local project
     * path>(WSFS or Volumes in Databricks), <vcs project url>
     */
    dependencies?: string[] | string;
}

/**
 * Configurable event log parameters.
 */
export interface EventLogClass {
    /**
     * The UC catalog the event log is published under.
     */
    catalog?: string;
    /**
     * The name the event log is published to in UC.
     */
    name?: string;
    /**
     * The UC schema the event log is published under.
     */
    schema?: string;
}

export interface FiltersClass {
    /**
     * Paths to exclude.
     */
    exclude?: string[] | string;
    /**
     * Paths to include.
     */
    include?: string[] | string;
}

export interface GatewayDefinitionClass {
    /**
     * [Deprecated, use connection_name instead] Immutable. The Unity Catalog connection that
     * this gateway pipeline uses to communicate with the source.
     */
    connection_id?: string;
    /**
     * Immutable. The Unity Catalog connection that this gateway pipeline uses to communicate
     * with the source.
     */
    connection_name: string;
    /**
     * Required, Immutable. The name of the catalog for the gateway pipeline's storage location.
     */
    gateway_storage_catalog: string;
    /**
     * Optional. The Unity Catalog-compatible name for the gateway storage location.
     * This is the destination to use for the data that is extracted by the gateway.
     * Delta Live Tables system will automatically create the storage location under the catalog
     * and schema.
     */
    gateway_storage_name?: string;
    /**
     * Required, Immutable. The name of the schema for the gateway pipelines's storage location.
     */
    gateway_storage_schema: string;
}

export interface IngestionDefinitionClass {
    /**
     * Immutable. The Unity Catalog connection that this ingestion pipeline uses to communicate
     * with the source. This is used with connectors for applications like Salesforce, Workday,
     * and so on.
     */
    connection_name?: string;
    /**
     * Immutable. Identifier for the gateway that is used by this ingestion pipeline to
     * communicate with the source database. This is used with connectors to databases like SQL
     * Server.
     */
    ingestion_gateway_id?: string;
    /**
     * Required. Settings specifying tables to replicate and the destination for the replicated
     * tables.
     */
    objects?: Array<ObjectClass | string> | string;
    /**
     * The type of the foreign source.
     * The source type will be inferred from the source connection or ingestion gateway.
     * This field is output only and will be ignored if provided.
     */
    source_type?: string;
    /**
     * Configuration settings to control the ingestion of tables. These settings are applied to
     * all tables in the pipeline.
     */
    table_configuration?: TableConfigurationClass | string;
}

export interface ObjectClass {
    /**
     * Select a specific source report.
     */
    report?: ReportClass | string;
    /**
     * Select all tables from a specific source schema.
     */
    schema?: BundleSchem26 | string;
    /**
     * Select a specific source table.
     */
    table?: BundleSchem27 | string;
}

export interface ReportClass {
    /**
     * Required. Destination catalog to store table.
     */
    destination_catalog: string;
    /**
     * Required. Destination schema to store table.
     */
    destination_schema: string;
    /**
     * Required. Destination table name. The pipeline fails if a table with that name already
     * exists.
     */
    destination_table?: string;
    /**
     * Required. Report URL in the source system.
     */
    source_url: string;
    /**
     * Configuration settings to control the ingestion of tables. These settings override the
     * table_configuration defined in the IngestionPipelineDefinition object.
     */
    table_configuration?: TableConfigurationClass | string;
}

export interface TableConfigurationClass {
    /**
     * A list of column names to be excluded for the ingestion.
     * When not specified, include_columns fully controls what columns to be ingested.
     * When specified, all other columns including future ones will be automatically included
     * for ingestion.
     * This field in mutually exclusive with `include_columns`.
     */
    exclude_columns?: string[] | string;
    /**
     * A list of column names to be included for the ingestion.
     * When not specified, all columns except ones in exclude_columns will be included. Future
     * columns will be automatically included.
     * When specified, all other future columns will be automatically excluded from ingestion.
     * This field in mutually exclusive with `exclude_columns`.
     */
    include_columns?: string[] | string;
    /**
     * The primary key of the table used to apply changes.
     */
    primary_keys?: string[] | string;
    /**
     * If true, formula fields defined in the table are included in the ingestion. This setting
     * is only valid for the Salesforce connector
     */
    salesforce_include_formula_fields?: boolean | string;
    /**
     * The SCD type to use to ingest the table.
     */
    scd_type?: string;
    /**
     * The column names specifying the logical order of events in the source data. Delta Live
     * Tables uses this sequencing to handle change events that arrive out of order.
     */
    sequence_by?: string[] | string;
}

export interface BundleSchem26 {
    /**
     * Required. Destination catalog to store tables.
     */
    destination_catalog: string;
    /**
     * Required. Destination schema to store tables in. Tables with the same name as the source
     * tables are created in this destination schema. The pipeline fails If a table with the
     * same name already exists.
     */
    destination_schema: string;
    /**
     * The source catalog name. Might be optional depending on the type of source.
     */
    source_catalog?: string;
    /**
     * Required. Schema name in the source database.
     */
    source_schema: string;
    /**
     * Configuration settings to control the ingestion of tables. These settings are applied to
     * all tables in this schema and override the table_configuration defined in the
     * IngestionPipelineDefinition object.
     */
    table_configuration?: TableConfigurationClass | string;
}

export interface BundleSchem27 {
    /**
     * Required. Destination catalog to store table.
     */
    destination_catalog: string;
    /**
     * Required. Destination schema to store table.
     */
    destination_schema: string;
    /**
     * Optional. Destination table name. The pipeline fails if a table with that name already
     * exists. If not set, the source table name is used.
     */
    destination_table?: string;
    /**
     * Source catalog name. Might be optional depending on the type of source.
     */
    source_catalog?: string;
    /**
     * Schema name in the source database. Might be optional depending on the type of source.
     */
    source_schema?: string;
    /**
     * Required. Table name in the source database.
     */
    source_table: string;
    /**
     * Configuration settings to control the ingestion of tables. These settings override the
     * table_configuration defined in the IngestionPipelineDefinition object and the SchemaSpec.
     */
    table_configuration?: TableConfigurationClass | string;
}

export interface BundleSchem28 {
    /**
     * The path to a file that defines a pipeline and is stored in the Databricks Repos.
     */
    file?: BundleSchem29 | string;
    /**
     * The unified field to include source codes.
     * Each entry can be a notebook path, a file path, or a folder path that ends `/**`.
     * This field cannot be used together with `notebook` or `file`.
     */
    glob?: GlobClass | string;
    /**
     * URI of the jar to be installed. Currently only DBFS is supported.
     */
    jar?: string;
    /**
     * Specification of a maven library to be installed.
     */
    maven?: MavenClass | string;
    /**
     * The path to a notebook that defines a pipeline and is stored in the Databricks workspace.
     */
    notebook?: NotebookClass | string;
    /**
     * URI of the whl to be installed.
     */
    whl?: string;
}

export interface BundleSchem29 {
    /**
     * The absolute path of the source code.
     */
    path?: string;
}

export interface GlobClass {
    /**
     * The source code to include for pipelines
     */
    include?: string;
}

export interface NotebookClass {
    /**
     * The absolute path of the source code.
     */
    path?: string;
}

export interface NotificationClass {
    /**
     * A list of alerts that trigger the sending of notifications to the configured
     * destinations. The supported alerts are:
     *
     * * `on-update-success`: A pipeline update completes successfully.
     * * `on-update-failure`: Each time a pipeline update fails.
     * * `on-update-fatal-failure`: A pipeline update fails with a non-retryable (fatal) error.
     * * `on-flow-failure`: A single data flow fails.
     */
    alerts?: string[] | string;
    /**
     * A list of email addresses notified when a configured alert is triggered.
     */
    email_recipients?: string[] | string;
}

export interface BundleSchem30 {
    group_name?: string;
    level: string;
    service_principal_name?: string;
    user_name?: string;
}

export interface RestartWindowClass {
    /**
     * Days of week in which the restart is allowed to happen (within a five-hour window
     * starting at start_hour).
     * If not specified all days of the week will be used.
     */
    days_of_week?: string[] | string;
    /**
     * An integer between 0 and 23 denoting the start hour for the restart window in the 24-hour
     * day.
     * Continuous pipeline restart is triggered only within a five-hour window starting at this
     * hour.
     */
    start_hour: number | string;
    /**
     * Time zone id of restart window. See
     * https://docs.databricks.com/sql/language-manual/sql-ref-syntax-aux-conf-mgmt-set-timezone.html
     * for details.
     * If not specified, UTC will be used.
     */
    time_zone_id?: string;
}

/**
 * Write-only setting, available only in Create/Update calls. Specifies the user or service
 * principal that the pipeline runs as. If not specified, the pipeline runs as the user who
 * created the pipeline.
 *
 * Only `user_name` or `service_principal_name` can be specified. If both are specified, an
 * error is thrown.
 */
export interface BundleSchem31 {
    /**
     * Application ID of an active service principal. Setting this field requires the
     * `servicePrincipal/user` role.
     */
    service_principal_name?: string;
    /**
     * The email of an active workspace user. Users can only set this field to their own email.
     */
    user_name?: string;
}

export interface BundleSchem32 {
    cron?: CronClass | string;
    manual?: ManualClass | string;
}

export interface CronClass {
    quartz_cron_schedule?: string;
    timezone_id?: string;
}

export interface ManualClass {}

export interface QualityMonitorClass {
    /**
     * The directory to store monitoring assets (e.g. dashboard, metric tables).
     */
    assets_dir: string;
    /**
     * Name of the baseline table from which drift metrics are computed from.
     * Columns in the monitored table should also be present in the baseline table.
     */
    baseline_table_name?: string;
    /**
     * Custom metrics to compute on the monitored table. These can be aggregate metrics, derived
     * metrics (from already computed aggregate metrics), or drift metrics (comparing metrics
     * across time
     * windows).
     */
    custom_metrics?: Array<CustomMetricClass | string> | string;
    /**
     * The data classification config for the monitor.
     */
    data_classification_config?: DataClassificationConfigClass | string;
    /**
     * Configuration for monitoring inference logs.
     */
    inference_log?: InferenceLogClass | string;
    /**
     * The notification settings for the monitor.
     */
    notifications?: NotificationsClass | string;
    /**
     * Schema where output metric tables are created.
     */
    output_schema_name: string;
    /**
     * The schedule for automatically updating and refreshing metric tables.
     */
    schedule?: BundleSchem33 | string;
    /**
     * Whether to skip creating a default dashboard summarizing data quality metrics.
     */
    skip_builtin_dashboard?: boolean | string;
    /**
     * List of column expressions to slice data with for targeted analysis. The data is grouped
     * by
     * each expression independently, resulting in a separate slice for each predicate and its
     * complements. For high-cardinality columns, only the top 100 unique values by frequency
     * will
     * generate slices.
     */
    slicing_exprs?: string[] | string;
    /**
     * Configuration for monitoring snapshot tables.
     */
    snapshot?: SnapshotClass | string;
    table_name: string;
    /**
     * Configuration for monitoring time series tables.
     */
    time_series?: TimeSeriesClass | string;
    /**
     * Optional argument to specify the warehouse for dashboard creation. If not specified, the
     * first running
     * warehouse will be used.
     */
    warehouse_id?: string;
}

export interface CustomMetricClass {
    /**
     * Jinja template for a SQL expression that specifies how to compute the metric. See [create
     * metric
     * definition](https://docs.databricks.com/en/lakehouse-monitoring/custom-metrics.html#create-definition).
     */
    definition: string;
    /**
     * A list of column names in the input table the metric should be computed for.
     * Can use ``":table"`` to indicate that the metric needs information from multiple columns.
     */
    input_columns: string[] | string;
    /**
     * Name of the metric in the output tables.
     */
    name: string;
    /**
     * The output type of the custom metric.
     */
    output_data_type: string;
    /**
     * Can only be one of ``"CUSTOM_METRIC_TYPE_AGGREGATE"``, ``"CUSTOM_METRIC_TYPE_DERIVED"``,
     * or ``"CUSTOM_METRIC_TYPE_DRIFT"``.
     * The ``"CUSTOM_METRIC_TYPE_AGGREGATE"`` and ``"CUSTOM_METRIC_TYPE_DERIVED"`` metrics
     * are computed on a single table, whereas the ``"CUSTOM_METRIC_TYPE_DRIFT"`` compare
     * metrics across
     * baseline and input table, or across the two consecutive time windows.
     * - CUSTOM_METRIC_TYPE_AGGREGATE: only depend on the existing columns in your table
     * - CUSTOM_METRIC_TYPE_DERIVED: depend on previously computed aggregate metrics
     * - CUSTOM_METRIC_TYPE_DRIFT:  depend on previously computed aggregate or derived metrics
     */
    type: string;
}

export interface DataClassificationConfigClass {
    /**
     * Whether data classification is enabled.
     */
    enabled?: boolean | string;
}

export interface InferenceLogClass {
    /**
     * Granularities for aggregating data into time windows based on their timestamp. Valid
     * values are 5 minutes, 30 minutes, 1 hour, 1 day, n weeks, 1 month, or 1 year.
     */
    granularities: string[] | string;
    /**
     * Optional column that contains the ground truth for the prediction.
     */
    label_col?: string;
    /**
     * Column that contains the id of the model generating the predictions. Metrics will be
     * computed per model id by
     * default, and also across all model ids.
     */
    model_id_col: string;
    /**
     * Column that contains the output/prediction from the model.
     */
    prediction_col: string;
    /**
     * Optional column that contains the prediction probabilities for each class in a
     * classification problem type.
     * The values in this column should be a map, mapping each class label to the prediction
     * probability for a given
     * sample. The map should be of PySpark MapType().
     */
    prediction_proba_col?: string;
    /**
     * Problem type the model aims to solve. Determines the type of model-quality metrics that
     * will be computed.
     */
    problem_type: string;
    /**
     * Column that contains the timestamps of requests. The column must be one of the following:
     * - A ``TimestampType`` column
     * - A column whose values can be converted to timestamps through the pyspark
     * ``to_timestamp``
     * [function](https://spark.apache.org/docs/latest/api/python/reference/pyspark.sql/api/pyspark.sql.functions.to_timestamp.html).
     */
    timestamp_col: string;
}

export interface NotificationsClass {
    /**
     * Who to send notifications to on monitor failure.
     */
    on_failure?: OnNewClassificationTagDetectedClass | string;
    /**
     * Who to send notifications to when new data classification tags are detected.
     */
    on_new_classification_tag_detected?:
        | OnNewClassificationTagDetectedClass
        | string;
}

export interface OnNewClassificationTagDetectedClass {
    /**
     * The list of email addresses to send the notification to. A maximum of 5 email addresses
     * is supported.
     */
    email_addresses?: string[] | string;
}

export interface BundleSchem33 {
    /**
     * Read only field that indicates whether a schedule is paused or not.
     */
    pause_status?: string;
    /**
     * The expression that determines when to run the monitor. See
     * [examples](https://www.quartz-scheduler.org/documentation/quartz-2.3.0/tutorials/crontrigger.html).
     */
    quartz_cron_expression: string;
    /**
     * The timezone id (e.g., ``"PST"``) in which to evaluate the quartz expression.
     */
    timezone_id: string;
}

export interface SnapshotClass {}

export interface TimeSeriesClass {
    /**
     * Granularities for aggregating data into time windows based on their timestamp. Valid
     * values are 5 minutes, 30 minutes, 1 hour, 1 day, n weeks, 1 month, or 1 year.
     */
    granularities: string[] | string;
    /**
     * Column that contains the timestamps of requests. The column must be one of the following:
     * - A ``TimestampType`` column
     * - A column whose values can be converted to timestamps through the pyspark
     * ``to_timestamp``
     * [function](https://spark.apache.org/docs/latest/api/python/reference/pyspark.sql/api/pyspark.sql.functions.to_timestamp.html).
     */
    timestamp_col: string;
}

export interface RegisteredModelClass {
    /**
     * The name of the catalog where the schema and the registered model reside
     */
    catalog_name: string;
    /**
     * The comment attached to the registered model
     */
    comment?: string;
    grants?: Array<GrantClass | string> | string;
    /**
     * The name of the registered model
     */
    name: string;
    /**
     * The name of the schema where the registered model resides
     */
    schema_name: string;
    /**
     * The storage location on the cloud under which model version data files are stored
     */
    storage_location?: string;
}

export interface GrantClass {
    /**
     * The name of the principal that will be granted privileges
     */
    principal: string;
    /**
     * The privileges to grant to the specified entity
     */
    privileges: string[] | string;
}

export interface BundleSchem34 {
    /**
     * Name of parent catalog.
     */
    catalog_name: string;
    /**
     * User-provided free-form text description.
     */
    comment?: string;
    grants?: Array<GrantClass | string> | string;
    /**
     * Name of schema, relative to parent catalog.
     */
    name: string;
    properties?: {[key: string]: string} | string;
    /**
     * Storage root URL for managed tables within schema.
     */
    storage_root?: string;
}

export interface SecretScopeClass {
    /**
     * The backend type the scope will be created with. If not specified, will default to
     * `DATABRICKS`
     */
    backend_type?: string;
    /**
     * The metadata for the secret scope if the `backend_type` is `AZURE_KEYVAULT`
     */
    keyvault_metadata?: KeyvaultMetadataClass | string;
    /**
     * Scope name requested by the user. Scope names are unique.
     */
    name: string;
    /**
     * The permissions to apply to the secret scope. Permissions are managed via secret scope
     * ACLs.
     */
    permissions?: Array<BundleSchem35 | string> | string;
}

export interface KeyvaultMetadataClass {
    /**
     * The DNS of the KeyVault
     */
    dns_name: string;
    /**
     * The resource id of the azure KeyVault that user wants to associate the scope with.
     */
    resource_id: string;
}

export interface BundleSchem35 {
    /**
     * The name of the group that has the permission set in level. This field translates to a
     * `principal` field in secret scope ACL.
     */
    group_name?: string;
    /**
     * The allowed permission for user, group, service principal defined for this permission.
     */
    level: string;
    /**
     * The application ID of an active service principal. This field translates to a `principal`
     * field in secret scope ACL.
     */
    service_principal_name?: string;
    /**
     * The name of the user that has the permission set in level. This field translates to a
     * `principal` field in secret scope ACL.
     */
    user_name?: string;
}

export interface VolumeClass {
    /**
     * The name of the catalog where the schema and the volume are
     */
    catalog_name: string;
    /**
     * The comment attached to the volume
     */
    comment?: string;
    grants?: Array<GrantClass | string> | string;
    /**
     * The name of the volume
     */
    name: string;
    /**
     * The name of the schema where the volume is
     */
    schema_name: string;
    /**
     * The storage location on the cloud
     */
    storage_location?: string;
    volume_type?: string;
}

export interface SyncClass {
    /**
     * A list of files or folders to exclude from the bundle.
     */
    exclude?: string[] | string;
    /**
     * A list of files or folders to include in the bundle.
     */
    include?: string[] | string;
    /**
     * The local folder paths, which can be outside the bundle root, to synchronize to the
     * workspace when the bundle is deployed.
     */
    paths?: string[] | string;
}

export interface BundleSchem36 {
    /**
     * The artifact path to use within the workspace for both deployments and workflow runs
     */
    artifact_path?: string;
    /**
     * The authentication type.
     */
    auth_type?: string;
    /**
     * The Azure client ID
     */
    azure_client_id?: string;
    /**
     * The Azure environment
     */
    azure_environment?: string;
    /**
     * The Azure login app ID
     */
    azure_login_app_id?: string;
    /**
     * The Azure tenant ID
     */
    azure_tenant_id?: string;
    /**
     * Whether to use MSI for Azure
     */
    azure_use_msi?: boolean | string;
    /**
     * The Azure workspace resource ID
     */
    azure_workspace_resource_id?: string;
    /**
     * The client ID for the workspace
     */
    client_id?: string;
    /**
     * The file path to use within the workspace for both deployments and workflow runs
     */
    file_path?: string;
    /**
     * The Google service account name
     */
    google_service_account?: string;
    /**
     * The Databricks workspace host URL
     */
    host?: string;
    /**
     * The Databricks workspace profile name
     */
    profile?: string;
    /**
     * The workspace resource path
     */
    resource_path?: string;
    /**
     * The Databricks workspace root path
     */
    root_path?: string;
    /**
     * The workspace state path
     */
    state_path?: string;
}

export interface ExperimentalClass {
    /**
     * The PyDABs configuration.
     */
    pydabs?: PydabsClass | string;
    /**
     * Configures loading of Python code defined with 'databricks-bundles' package.
     */
    python?: PythonClass | string;
    /**
     * Whether to use a Python wheel wrapper.
     */
    python_wheel_wrapper?: boolean | string;
    /**
     * The commands to run.
     */
    scripts?: {[key: string]: string} | string;
    /**
     * Determines whether to skip cleaning up the .internal folder
     */
    skip_artifact_cleanup?: boolean | string;
    /**
     * Skip adding the prefix that is either set in `presets.name_prefix` or computed when
     * `mode: development`
     * is set, to the names of UC schemas defined in the bundle.
     */
    skip_name_prefix_for_schema?: boolean | string;
    /**
     * Whether to use the legacy run_as behavior.
     */
    use_legacy_run_as?: boolean | string;
}

export interface PydabsClass {
    /**
     * Whether or not PyDABs (Private Preview) is enabled
     */
    enabled?: boolean | string;
}

export interface PythonClass {
    /**
     * Mutators contains a list of fully qualified function paths to mutator functions.
     *
     * Example: ["my_project.mutators:add_default_cluster"]
     */
    mutators?: string[] | string;
    /**
     * Resources contains a list of fully qualified function paths to load resources
     * defined in Python code.
     *
     * Example: ["my_project.resources:load_resources"]
     */
    resources?: string[] | string;
    /**
     * VEnvPath is path to the virtual environment.
     *
     * If enabled, Python code will execute within this environment. If disabled,
     * it defaults to using the Python interpreter available in the current shell.
     */
    venv_path?: string;
}

/**
 * Defines a custom variable for the bundle.
 */
export interface VariableValue {
    /**
     * The default value for the variable.
     */
    default?: any;
    /**
     * The description of the variable
     */
    description?: string;
    /**
     * The name of the alert, cluster_policy, cluster, dashboard, instance_pool, job, metastore,
     * pipeline, query, service_principal, or warehouse object for which to retrieve an ID.
     */
    lookup?: LookupClass | string;
    /**
     * The type of the variable.
     */
    type?: string;
}

export interface LookupClass {
    /**
     * The name of the alert for which to retrieve an ID.
     */
    alert?: string;
    /**
     * The name of the cluster for which to retrieve an ID.
     */
    cluster?: string;
    /**
     * The name of the cluster_policy for which to retrieve an ID.
     */
    cluster_policy?: string;
    /**
     * The name of the dashboard for which to retrieve an ID.
     */
    dashboard?: string;
    /**
     * The name of the instance_pool for which to retrieve an ID.
     */
    instance_pool?: string;
    /**
     * The name of the job for which to retrieve an ID.
     */
    job?: string;
    /**
     * The name of the metastore for which to retrieve an ID.
     */
    metastore?: string;
    /**
     * The name of the notification_destination for which to retrieve an ID.
     */
    notification_destination?: string;
    /**
     * The name of the pipeline for which to retrieve an ID.
     */
    pipeline?: string;
    /**
     * The name of the query for which to retrieve an ID.
     */
    query?: string;
    /**
     * The name of the service_principal for which to retrieve an ID.
     */
    service_principal?: string;
    /**
     * The name of the warehouse for which to retrieve an ID.
     */
    warehouse?: string;
}

// Converts JSON strings to/from your types
// and asserts the results of JSON.parse at runtime
export class Convert {
    public static toBundleSchema(json: string): BundleSchema {
        return cast(JSON.parse(json), r("BundleSchema"));
    }

    public static bundleSchemaToJson(value: BundleSchema): string {
        return JSON.stringify(uncast(value, r("BundleSchema")), null, 2);
    }
}

function invalidValue(typ: any, val: any, key: any, parent: any = ""): never {
    const prettyTyp = prettyTypeName(typ);
    const parentText = parent ? ` on ${parent}` : "";
    const keyText = key ? ` for key "${key}"` : "";
    throw Error(
        `Invalid value${keyText}${parentText}. Expected ${prettyTyp} but got ${JSON.stringify(
            val
        )}`
    );
}

function prettyTypeName(typ: any): string {
    if (Array.isArray(typ)) {
        if (typ.length === 2 && typ[0] === undefined) {
            return `an optional ${prettyTypeName(typ[1])}`;
        } else {
            return `one of [${typ
                .map((a) => {
                    return prettyTypeName(a);
                })
                .join(", ")}]`;
        }
    } else if (typeof typ === "object" && typ.literal !== undefined) {
        return typ.literal;
    } else {
        return typeof typ;
    }
}

function jsonToJSProps(typ: any): any {
    if (typ.jsonToJS === undefined) {
        const map: any = {};
        typ.props.forEach((p: any) => (map[p.json] = {key: p.js, typ: p.typ}));
        typ.jsonToJS = map;
    }
    return typ.jsonToJS;
}

function jsToJSONProps(typ: any): any {
    if (typ.jsToJSON === undefined) {
        const map: any = {};
        typ.props.forEach((p: any) => (map[p.js] = {key: p.json, typ: p.typ}));
        typ.jsToJSON = map;
    }
    return typ.jsToJSON;
}

function transform(
    val: any,
    typ: any,
    getProps: any,
    key: any = "",
    parent: any = ""
): any {
    function transformPrimitive(typ: string, val: any): any {
        if (typeof typ === typeof val) return val;
        return invalidValue(typ, val, key, parent);
    }

    function transformUnion(typs: any[], val: any): any {
        // val must validate against one typ in typs
        const l = typs.length;
        for (let i = 0; i < l; i++) {
            const typ = typs[i];
            try {
                return transform(val, typ, getProps);
            } catch (_) {}
        }
        return invalidValue(typs, val, key, parent);
    }

    function transformEnum(cases: string[], val: any): any {
        if (cases.indexOf(val) !== -1) return val;
        return invalidValue(
            cases.map((a) => {
                return l(a);
            }),
            val,
            key,
            parent
        );
    }

    function transformArray(typ: any, val: any): any {
        // val must be an array with no invalid elements
        if (!Array.isArray(val))
            return invalidValue(l("array"), val, key, parent);
        return val.map((el) => transform(el, typ, getProps));
    }

    function transformDate(val: any): any {
        if (val === null) {
            return null;
        }
        const d = new Date(val);
        if (isNaN(d.valueOf())) {
            return invalidValue(l("Date"), val, key, parent);
        }
        return d;
    }

    function transformObject(
        props: {[k: string]: any},
        additional: any,
        val: any
    ): any {
        if (val === null || typeof val !== "object" || Array.isArray(val)) {
            return invalidValue(l(ref || "object"), val, key, parent);
        }
        const result: any = {};
        Object.getOwnPropertyNames(props).forEach((key) => {
            const prop = props[key];
            const v = Object.prototype.hasOwnProperty.call(val, key)
                ? val[key]
                : undefined;
            result[prop.key] = transform(v, prop.typ, getProps, key, ref);
        });
        Object.getOwnPropertyNames(val).forEach((key) => {
            if (!Object.prototype.hasOwnProperty.call(props, key)) {
                result[key] = transform(
                    val[key],
                    additional,
                    getProps,
                    key,
                    ref
                );
            }
        });
        return result;
    }

    if (typ === "any") return val;
    if (typ === null) {
        if (val === null) return val;
        return invalidValue(typ, val, key, parent);
    }
    if (typ === false) return invalidValue(typ, val, key, parent);
    let ref: any = undefined;
    while (typeof typ === "object" && typ.ref !== undefined) {
        ref = typ.ref;
        typ = typeMap[typ.ref];
    }
    if (Array.isArray(typ)) return transformEnum(typ, val);
    if (typeof typ === "object") {
        return typ.hasOwnProperty("unionMembers")
            ? transformUnion(typ.unionMembers, val)
            : typ.hasOwnProperty("arrayItems")
              ? transformArray(typ.arrayItems, val)
              : typ.hasOwnProperty("props")
                ? transformObject(getProps(typ), typ.additional, val)
                : invalidValue(typ, val, key, parent);
    }
    // Numbers can be parsed by Date but shouldn't be.
    if (typ === Date && typeof val !== "number") return transformDate(val);
    return transformPrimitive(typ, val);
}

function cast<T>(val: any, typ: any): T {
    return transform(val, typ, jsonToJSProps);
}

function uncast<T>(val: T, typ: any): any {
    return transform(val, typ, jsToJSONProps);
}

function l(typ: any) {
    return {literal: typ};
}

function a(typ: any) {
    return {arrayItems: typ};
}

function u(...typs: any[]) {
    return {unionMembers: typs};
}

function o(props: any[], additional: any) {
    return {props, additional};
}

function m(additional: any) {
    return {props: [], additional};
}

function r(name: string) {
    return {ref: name};
}

const typeMap: any = {
    BundleSchema: o(
        [
            {
                json: "artifacts",
                js: "artifacts",
                typ: u(undefined, u(m(u(r("ArtifactClass"), "")), "")),
            },
            {
                json: "bundle",
                js: "bundle",
                typ: u(undefined, u(r("BundleClass"), "")),
            },
            {
                json: "environments",
                js: "environments",
                typ: u(undefined, u(m(u(r("TargetClass"), "")), "")),
            },
            {
                json: "experimental",
                js: "experimental",
                typ: u(undefined, u(r("ExperimentalClass"), "")),
            },
            {json: "include", js: "include", typ: u(undefined, u(a(""), ""))},
            {
                json: "permissions",
                js: "permissions",
                typ: u(undefined, u(a(u(r("FluffyBundleSchem"), "")), "")),
            },
            {
                json: "presets",
                js: "presets",
                typ: u(undefined, u(r("PresetsClass"), "")),
            },
            {
                json: "resources",
                js: "resources",
                typ: u(undefined, u(r("ResourcesClass"), "")),
            },
            {
                json: "run_as",
                js: "run_as",
                typ: u(undefined, u(r("BundleSchem6"), "")),
            },
            {
                json: "sync",
                js: "sync",
                typ: u(undefined, u(r("SyncClass"), "")),
            },
            {
                json: "targets",
                js: "targets",
                typ: u(undefined, u(m(u(r("TargetClass"), "")), "")),
            },
            {
                json: "variables",
                js: "variables",
                typ: u(undefined, u(m(r("VariableValue")), "")),
            },
            {
                json: "workspace",
                js: "workspace",
                typ: u(undefined, u(r("BundleSchem36"), "")),
            },
        ],
        "any"
    ),
    ArtifactClass: o(
        [
            {json: "build", js: "build", typ: u(undefined, "")},
            {
                json: "dynamic_version",
                js: "dynamic_version",
                typ: u(undefined, u(true, "")),
            },
            {json: "executable", js: "executable", typ: u(undefined, "")},
            {
                json: "files",
                js: "files",
                typ: u(undefined, u(a(u(r("PurpleBundleSchem"), "")), "")),
            },
            {json: "path", js: "path", typ: u(undefined, "")},
            {json: "type", js: "type", typ: u(undefined, "")},
        ],
        false
    ),
    PurpleBundleSchem: o([{json: "source", js: "source", typ: ""}], false),
    BundleClass: o(
        [
            {json: "cluster_id", js: "cluster_id", typ: u(undefined, "")},
            {json: "compute_id", js: "compute_id", typ: u(undefined, "")},
            {
                json: "databricks_cli_version",
                js: "databricks_cli_version",
                typ: u(undefined, ""),
            },
            {
                json: "deployment",
                js: "deployment",
                typ: u(undefined, u(r("DeploymentClass"), "")),
            },
            {json: "git", js: "git", typ: u(undefined, u(r("GitClass"), ""))},
            {json: "name", js: "name", typ: ""},
            {json: "uuid", js: "uuid", typ: u(undefined, "")},
        ],
        false
    ),
    DeploymentClass: o(
        [
            {
                json: "fail_on_active_runs",
                js: "fail_on_active_runs",
                typ: u(undefined, u(true, "")),
            },
            {
                json: "lock",
                js: "lock",
                typ: u(undefined, u(r("LockClass"), "")),
            },
        ],
        false
    ),
    LockClass: o(
        [
            {json: "enabled", js: "enabled", typ: u(undefined, u(true, ""))},
            {json: "force", js: "force", typ: u(undefined, u(true, ""))},
        ],
        false
    ),
    GitClass: o(
        [
            {json: "branch", js: "branch", typ: u(undefined, "")},
            {json: "origin_url", js: "origin_url", typ: u(undefined, "")},
        ],
        false
    ),
    TargetClass: o(
        [
            {
                json: "artifacts",
                js: "artifacts",
                typ: u(undefined, u(m(u(r("ArtifactClass"), "")), "")),
            },
            {
                json: "bundle",
                js: "bundle",
                typ: u(undefined, u(r("BundleClass"), "")),
            },
            {json: "cluster_id", js: "cluster_id", typ: u(undefined, "")},
            {json: "compute_id", js: "compute_id", typ: u(undefined, "")},
            {json: "default", js: "default", typ: u(undefined, u(true, ""))},
            {json: "git", js: "git", typ: u(undefined, u(r("GitClass"), ""))},
            {json: "mode", js: "mode", typ: u(undefined, "")},
            {
                json: "permissions",
                js: "permissions",
                typ: u(undefined, u(a(u(r("FluffyBundleSchem"), "")), "")),
            },
            {
                json: "presets",
                js: "presets",
                typ: u(undefined, u(r("PresetsClass"), "")),
            },
            {
                json: "resources",
                js: "resources",
                typ: u(undefined, u(r("ResourcesClass"), "")),
            },
            {
                json: "run_as",
                js: "run_as",
                typ: u(undefined, u(r("BundleSchem6"), "")),
            },
            {
                json: "sync",
                js: "sync",
                typ: u(undefined, u(r("SyncClass"), "")),
            },
            {
                json: "variables",
                js: "variables",
                typ: u(undefined, u(m("any"), "")),
            },
            {
                json: "workspace",
                js: "workspace",
                typ: u(undefined, u(r("BundleSchem36"), "")),
            },
        ],
        false
    ),
    FluffyBundleSchem: o(
        [
            {json: "group_name", js: "group_name", typ: u(undefined, "")},
            {json: "level", js: "level", typ: ""},
            {
                json: "service_principal_name",
                js: "service_principal_name",
                typ: u(undefined, ""),
            },
            {json: "user_name", js: "user_name", typ: u(undefined, "")},
        ],
        false
    ),
    PresetsClass: o(
        [
            {
                json: "artifacts_dynamic_version",
                js: "artifacts_dynamic_version",
                typ: u(undefined, u(true, "")),
            },
            {
                json: "jobs_max_concurrent_runs",
                js: "jobs_max_concurrent_runs",
                typ: u(undefined, u(0, "")),
            },
            {json: "name_prefix", js: "name_prefix", typ: u(undefined, "")},
            {
                json: "pipelines_development",
                js: "pipelines_development",
                typ: u(undefined, u(true, "")),
            },
            {
                json: "source_linked_deployment",
                js: "source_linked_deployment",
                typ: u(undefined, u(true, "")),
            },
            {json: "tags", js: "tags", typ: u(undefined, u(m(""), ""))},
            {
                json: "trigger_pause_status",
                js: "trigger_pause_status",
                typ: u(undefined, ""),
            },
        ],
        false
    ),
    ResourcesClass: o(
        [
            {
                json: "apps",
                js: "apps",
                typ: u(undefined, u(m(u(r("AppClass"), "")), "")),
            },
            {
                json: "clusters",
                js: "clusters",
                typ: u(undefined, u(m(u(r("IndigoBundleSchem"), "")), "")),
            },
            {
                json: "dashboards",
                js: "dashboards",
                typ: u(undefined, u(m(u(r("MagentaBundleSchem"), "")), "")),
            },
            {
                json: "experiments",
                js: "experiments",
                typ: u(undefined, u(m(u(r("ExperimentClass"), "")), "")),
            },
            {
                json: "jobs",
                js: "jobs",
                typ: u(undefined, u(m(u(r("BundleSchem1"), "")), "")),
            },
            {
                json: "model_serving_endpoints",
                js: "model_serving_endpoints",
                typ: u(
                    undefined,
                    u(m(u(r("ModelServingEndpointClass"), "")), "")
                ),
            },
            {
                json: "models",
                js: "models",
                typ: u(undefined, u(m(u(r("ModelClass"), "")), "")),
            },
            {
                json: "pipelines",
                js: "pipelines",
                typ: u(undefined, u(m(u(r("PipelineClass"), "")), "")),
            },
            {
                json: "quality_monitors",
                js: "quality_monitors",
                typ: u(undefined, u(m(u(r("QualityMonitorClass"), "")), "")),
            },
            {
                json: "registered_models",
                js: "registered_models",
                typ: u(undefined, u(m(u(r("RegisteredModelClass"), "")), "")),
            },
            {
                json: "schemas",
                js: "schemas",
                typ: u(undefined, u(m(u(r("BundleSchem34"), "")), "")),
            },
            {
                json: "secret_scopes",
                js: "secret_scopes",
                typ: u(undefined, u(m(u(r("SecretScopeClass"), "")), "")),
            },
            {
                json: "volumes",
                js: "volumes",
                typ: u(undefined, u(m(u(r("VolumeClass"), "")), "")),
            },
        ],
        false
    ),
    AppClass: o(
        [
            {
                json: "active_deployment",
                js: "active_deployment",
                typ: u(undefined, u(r("ActiveDeploymentClass"), "")),
            },
            {
                json: "app_status",
                js: "app_status",
                typ: u(undefined, u(r("AppStatusClass"), "")),
            },
            {
                json: "budget_policy_id",
                js: "budget_policy_id",
                typ: u(undefined, ""),
            },
            {
                json: "compute_status",
                js: "compute_status",
                typ: u(undefined, u(r("ComputeStatusClass"), "")),
            },
            {json: "config", js: "config", typ: u(undefined, u(m("any"), ""))},
            {json: "create_time", js: "create_time", typ: u(undefined, "")},
            {json: "creator", js: "creator", typ: u(undefined, "")},
            {
                json: "default_source_code_path",
                js: "default_source_code_path",
                typ: u(undefined, ""),
            },
            {json: "description", js: "description", typ: u(undefined, "")},
            {
                json: "effective_budget_policy_id",
                js: "effective_budget_policy_id",
                typ: u(undefined, ""),
            },
            {
                json: "effective_user_api_scopes",
                js: "effective_user_api_scopes",
                typ: u(undefined, u(a(""), "")),
            },
            {json: "id", js: "id", typ: u(undefined, "")},
            {json: "name", js: "name", typ: ""},
            {
                json: "oauth2_app_client_id",
                js: "oauth2_app_client_id",
                typ: u(undefined, ""),
            },
            {
                json: "oauth2_app_integration_id",
                js: "oauth2_app_integration_id",
                typ: u(undefined, ""),
            },
            {
                json: "pending_deployment",
                js: "pending_deployment",
                typ: u(undefined, u(r("ActiveDeploymentClass"), "")),
            },
            {
                json: "permissions",
                js: "permissions",
                typ: u(undefined, u(a(u(r("TentacledBundleSchem"), "")), "")),
            },
            {
                json: "resources",
                js: "resources",
                typ: u(undefined, u(a(u(r("ResourceClass"), "")), "")),
            },
            {
                json: "service_principal_client_id",
                js: "service_principal_client_id",
                typ: u(undefined, ""),
            },
            {
                json: "service_principal_id",
                js: "service_principal_id",
                typ: u(undefined, u(0, "")),
            },
            {
                json: "service_principal_name",
                js: "service_principal_name",
                typ: u(undefined, ""),
            },
            {json: "source_code_path", js: "source_code_path", typ: ""},
            {json: "update_time", js: "update_time", typ: u(undefined, "")},
            {json: "updater", js: "updater", typ: u(undefined, "")},
            {json: "url", js: "url", typ: u(undefined, "")},
            {
                json: "user_api_scopes",
                js: "user_api_scopes",
                typ: u(undefined, u(a(""), "")),
            },
        ],
        false
    ),
    ActiveDeploymentClass: o(
        [
            {json: "create_time", js: "create_time", typ: u(undefined, "")},
            {json: "creator", js: "creator", typ: u(undefined, "")},
            {
                json: "deployment_artifacts",
                js: "deployment_artifacts",
                typ: u(undefined, u(r("DeploymentArtifactsClass"), "")),
            },
            {json: "deployment_id", js: "deployment_id", typ: u(undefined, "")},
            {json: "mode", js: "mode", typ: u(undefined, "")},
            {
                json: "source_code_path",
                js: "source_code_path",
                typ: u(undefined, ""),
            },
            {
                json: "status",
                js: "status",
                typ: u(undefined, u(r("StatusClass"), "")),
            },
            {json: "update_time", js: "update_time", typ: u(undefined, "")},
        ],
        false
    ),
    DeploymentArtifactsClass: o(
        [
            {
                json: "source_code_path",
                js: "source_code_path",
                typ: u(undefined, ""),
            },
        ],
        false
    ),
    StatusClass: o(
        [
            {json: "message", js: "message", typ: u(undefined, "")},
            {json: "state", js: "state", typ: u(undefined, "")},
        ],
        false
    ),
    AppStatusClass: o(
        [
            {json: "message", js: "message", typ: u(undefined, "")},
            {json: "state", js: "state", typ: u(undefined, "")},
        ],
        false
    ),
    ComputeStatusClass: o(
        [
            {json: "message", js: "message", typ: u(undefined, "")},
            {json: "state", js: "state", typ: u(undefined, "")},
        ],
        false
    ),
    TentacledBundleSchem: o(
        [
            {json: "group_name", js: "group_name", typ: u(undefined, "")},
            {json: "level", js: "level", typ: ""},
            {
                json: "service_principal_name",
                js: "service_principal_name",
                typ: u(undefined, ""),
            },
            {json: "user_name", js: "user_name", typ: u(undefined, "")},
        ],
        false
    ),
    ResourceClass: o(
        [
            {json: "description", js: "description", typ: u(undefined, "")},
            {
                json: "job",
                js: "job",
                typ: u(undefined, u(r("StickyBundleSchem"), "")),
            },
            {json: "name", js: "name", typ: ""},
            {
                json: "secret",
                js: "secret",
                typ: u(undefined, u(r("SecretClass"), "")),
            },
            {
                json: "serving_endpoint",
                js: "serving_endpoint",
                typ: u(undefined, u(r("ServingEndpointClass"), "")),
            },
            {
                json: "sql_warehouse",
                js: "sql_warehouse",
                typ: u(undefined, u(r("SQLWarehouseClass"), "")),
            },
            {
                json: "uc_securable",
                js: "uc_securable",
                typ: u(undefined, u(r("UcSecurableClass"), "")),
            },
        ],
        false
    ),
    StickyBundleSchem: o(
        [
            {json: "id", js: "id", typ: ""},
            {json: "permission", js: "permission", typ: ""},
        ],
        false
    ),
    SecretClass: o(
        [
            {json: "key", js: "key", typ: ""},
            {json: "permission", js: "permission", typ: ""},
            {json: "scope", js: "scope", typ: ""},
        ],
        false
    ),
    ServingEndpointClass: o(
        [
            {json: "name", js: "name", typ: ""},
            {json: "permission", js: "permission", typ: ""},
        ],
        false
    ),
    SQLWarehouseClass: o(
        [
            {json: "id", js: "id", typ: ""},
            {json: "permission", js: "permission", typ: ""},
        ],
        false
    ),
    UcSecurableClass: o(
        [
            {json: "permission", js: "permission", typ: ""},
            {json: "securable_full_name", js: "securable_full_name", typ: ""},
            {json: "securable_type", js: "securable_type", typ: ""},
        ],
        false
    ),
    IndigoBundleSchem: o(
        [
            {
                json: "apply_policy_default_values",
                js: "apply_policy_default_values",
                typ: u(undefined, u(true, "")),
            },
            {
                json: "autoscale",
                js: "autoscale",
                typ: u(undefined, u(r("IndecentBundleSchem"), "")),
            },
            {
                json: "autotermination_minutes",
                js: "autotermination_minutes",
                typ: u(undefined, u(0, "")),
            },
            {
                json: "aws_attributes",
                js: "aws_attributes",
                typ: u(undefined, u(r("AwsAttributesClass"), "")),
            },
            {
                json: "azure_attributes",
                js: "azure_attributes",
                typ: u(undefined, u(r("AzureAttributesClass"), "")),
            },
            {
                json: "cluster_log_conf",
                js: "cluster_log_conf",
                typ: u(undefined, u(r("ClusterLogConfClass"), "")),
            },
            {json: "cluster_name", js: "cluster_name", typ: u(undefined, "")},
            {
                json: "custom_tags",
                js: "custom_tags",
                typ: u(undefined, u(m(""), "")),
            },
            {
                json: "data_security_mode",
                js: "data_security_mode",
                typ: u(undefined, ""),
            },
            {
                json: "docker_image",
                js: "docker_image",
                typ: u(undefined, u(r("DockerImageClass"), "")),
            },
            {
                json: "driver_instance_pool_id",
                js: "driver_instance_pool_id",
                typ: u(undefined, ""),
            },
            {
                json: "driver_node_type_id",
                js: "driver_node_type_id",
                typ: u(undefined, ""),
            },
            {
                json: "enable_elastic_disk",
                js: "enable_elastic_disk",
                typ: u(undefined, u(true, "")),
            },
            {
                json: "enable_local_disk_encryption",
                js: "enable_local_disk_encryption",
                typ: u(undefined, u(true, "")),
            },
            {
                json: "gcp_attributes",
                js: "gcp_attributes",
                typ: u(undefined, u(r("GcpAttributesClass"), "")),
            },
            {
                json: "init_scripts",
                js: "init_scripts",
                typ: u(undefined, u(a(u(r("InitScriptClass"), "")), "")),
            },
            {
                json: "instance_pool_id",
                js: "instance_pool_id",
                typ: u(undefined, ""),
            },
            {
                json: "is_single_node",
                js: "is_single_node",
                typ: u(undefined, u(true, "")),
            },
            {json: "kind", js: "kind", typ: u(undefined, "")},
            {json: "node_type_id", js: "node_type_id", typ: u(undefined, "")},
            {
                json: "num_workers",
                js: "num_workers",
                typ: u(undefined, u(0, "")),
            },
            {
                json: "permissions",
                js: "permissions",
                typ: u(undefined, u(a(u(r("CunningBundleSchem"), "")), "")),
            },
            {json: "policy_id", js: "policy_id", typ: u(undefined, "")},
            {
                json: "remote_disk_throughput",
                js: "remote_disk_throughput",
                typ: u(undefined, u(0, "")),
            },
            {
                json: "runtime_engine",
                js: "runtime_engine",
                typ: u(undefined, ""),
            },
            {
                json: "single_user_name",
                js: "single_user_name",
                typ: u(undefined, ""),
            },
            {
                json: "spark_conf",
                js: "spark_conf",
                typ: u(undefined, u(m(""), "")),
            },
            {
                json: "spark_env_vars",
                js: "spark_env_vars",
                typ: u(undefined, u(m(""), "")),
            },
            {json: "spark_version", js: "spark_version", typ: u(undefined, "")},
            {
                json: "ssh_public_keys",
                js: "ssh_public_keys",
                typ: u(undefined, u(a(""), "")),
            },
            {
                json: "total_initial_remote_disk_size",
                js: "total_initial_remote_disk_size",
                typ: u(undefined, u(0, "")),
            },
            {
                json: "use_ml_runtime",
                js: "use_ml_runtime",
                typ: u(undefined, u(true, "")),
            },
            {
                json: "workload_type",
                js: "workload_type",
                typ: u(undefined, u(r("WorkloadTypeClass"), "")),
            },
        ],
        false
    ),
    IndecentBundleSchem: o(
        [
            {
                json: "max_workers",
                js: "max_workers",
                typ: u(undefined, u(0, "")),
            },
            {
                json: "min_workers",
                js: "min_workers",
                typ: u(undefined, u(0, "")),
            },
        ],
        false
    ),
    AwsAttributesClass: o(
        [
            {json: "availability", js: "availability", typ: u(undefined, "")},
            {
                json: "ebs_volume_count",
                js: "ebs_volume_count",
                typ: u(undefined, u(0, "")),
            },
            {
                json: "ebs_volume_iops",
                js: "ebs_volume_iops",
                typ: u(undefined, u(0, "")),
            },
            {
                json: "ebs_volume_size",
                js: "ebs_volume_size",
                typ: u(undefined, u(0, "")),
            },
            {
                json: "ebs_volume_throughput",
                js: "ebs_volume_throughput",
                typ: u(undefined, u(0, "")),
            },
            {
                json: "ebs_volume_type",
                js: "ebs_volume_type",
                typ: u(undefined, ""),
            },
            {
                json: "first_on_demand",
                js: "first_on_demand",
                typ: u(undefined, u(0, "")),
            },
            {
                json: "instance_profile_arn",
                js: "instance_profile_arn",
                typ: u(undefined, ""),
            },
            {
                json: "spot_bid_price_percent",
                js: "spot_bid_price_percent",
                typ: u(undefined, u(0, "")),
            },
            {json: "zone_id", js: "zone_id", typ: u(undefined, "")},
        ],
        false
    ),
    AzureAttributesClass: o(
        [
            {json: "availability", js: "availability", typ: u(undefined, "")},
            {
                json: "first_on_demand",
                js: "first_on_demand",
                typ: u(undefined, u(0, "")),
            },
            {
                json: "log_analytics_info",
                js: "log_analytics_info",
                typ: u(undefined, u(r("LogAnalyticsInfoClass"), "")),
            },
            {
                json: "spot_bid_max_price",
                js: "spot_bid_max_price",
                typ: u(undefined, u(3.14, "")),
            },
        ],
        false
    ),
    LogAnalyticsInfoClass: o(
        [
            {
                json: "log_analytics_primary_key",
                js: "log_analytics_primary_key",
                typ: u(undefined, ""),
            },
            {
                json: "log_analytics_workspace_id",
                js: "log_analytics_workspace_id",
                typ: u(undefined, ""),
            },
        ],
        false
    ),
    ClusterLogConfClass: o(
        [
            {
                json: "dbfs",
                js: "dbfs",
                typ: u(undefined, u(r("DbfsClass"), "")),
            },
            {json: "s3", js: "s3", typ: u(undefined, u(r("S3Class"), ""))},
            {
                json: "volumes",
                js: "volumes",
                typ: u(undefined, u(r("VolumesClass"), "")),
            },
        ],
        false
    ),
    DbfsClass: o([{json: "destination", js: "destination", typ: ""}], false),
    S3Class: o(
        [
            {json: "canned_acl", js: "canned_acl", typ: u(undefined, "")},
            {json: "destination", js: "destination", typ: ""},
            {
                json: "enable_encryption",
                js: "enable_encryption",
                typ: u(undefined, u(true, "")),
            },
            {
                json: "encryption_type",
                js: "encryption_type",
                typ: u(undefined, ""),
            },
            {json: "endpoint", js: "endpoint", typ: u(undefined, "")},
            {json: "kms_key", js: "kms_key", typ: u(undefined, "")},
            {json: "region", js: "region", typ: u(undefined, "")},
        ],
        false
    ),
    VolumesClass: o([{json: "destination", js: "destination", typ: ""}], false),
    DockerImageClass: o(
        [
            {
                json: "basic_auth",
                js: "basic_auth",
                typ: u(undefined, u(r("BasicAuthClass"), "")),
            },
            {json: "url", js: "url", typ: u(undefined, "")},
        ],
        false
    ),
    BasicAuthClass: o(
        [
            {json: "password", js: "password", typ: u(undefined, "")},
            {json: "username", js: "username", typ: u(undefined, "")},
        ],
        false
    ),
    GcpAttributesClass: o(
        [
            {json: "availability", js: "availability", typ: u(undefined, "")},
            {
                json: "boot_disk_size",
                js: "boot_disk_size",
                typ: u(undefined, u(0, "")),
            },
            {
                json: "google_service_account",
                js: "google_service_account",
                typ: u(undefined, ""),
            },
            {
                json: "local_ssd_count",
                js: "local_ssd_count",
                typ: u(undefined, u(0, "")),
            },
            {
                json: "use_preemptible_executors",
                js: "use_preemptible_executors",
                typ: u(undefined, u(true, "")),
            },
            {json: "zone_id", js: "zone_id", typ: u(undefined, "")},
        ],
        false
    ),
    InitScriptClass: o(
        [
            {
                json: "abfss",
                js: "abfss",
                typ: u(undefined, u(r("AbfssClass"), "")),
            },
            {
                json: "dbfs",
                js: "dbfs",
                typ: u(undefined, u(r("DbfsClass"), "")),
            },
            {
                json: "file",
                js: "file",
                typ: u(undefined, u(r("HilariousBundleSchem"), "")),
            },
            {json: "gcs", js: "gcs", typ: u(undefined, u(r("GcsClass"), ""))},
            {json: "s3", js: "s3", typ: u(undefined, u(r("S3Class"), ""))},
            {
                json: "volumes",
                js: "volumes",
                typ: u(undefined, u(r("VolumesClass"), "")),
            },
            {
                json: "workspace",
                js: "workspace",
                typ: u(undefined, u(r("AmbitiousBundleSchem"), "")),
            },
        ],
        false
    ),
    AbfssClass: o([{json: "destination", js: "destination", typ: ""}], false),
    HilariousBundleSchem: o(
        [{json: "destination", js: "destination", typ: ""}],
        false
    ),
    GcsClass: o([{json: "destination", js: "destination", typ: ""}], false),
    AmbitiousBundleSchem: o(
        [{json: "destination", js: "destination", typ: ""}],
        false
    ),
    CunningBundleSchem: o(
        [
            {json: "group_name", js: "group_name", typ: u(undefined, "")},
            {json: "level", js: "level", typ: ""},
            {
                json: "service_principal_name",
                js: "service_principal_name",
                typ: u(undefined, ""),
            },
            {json: "user_name", js: "user_name", typ: u(undefined, "")},
        ],
        false
    ),
    WorkloadTypeClass: o(
        [{json: "clients", js: "clients", typ: u(r("ClientsClass"), "")}],
        false
    ),
    ClientsClass: o(
        [
            {json: "jobs", js: "jobs", typ: u(undefined, u(true, ""))},
            {
                json: "notebooks",
                js: "notebooks",
                typ: u(undefined, u(true, "")),
            },
        ],
        false
    ),
    MagentaBundleSchem: o(
        [
            {json: "create_time", js: "create_time", typ: u(undefined, "")},
            {json: "dashboard_id", js: "dashboard_id", typ: u(undefined, "")},
            {json: "display_name", js: "display_name", typ: u(undefined, "")},
            {
                json: "embed_credentials",
                js: "embed_credentials",
                typ: u(undefined, u(true, "")),
            },
            {json: "etag", js: "etag", typ: u(undefined, "")},
            {json: "file_path", js: "file_path", typ: u(undefined, "")},
            {
                json: "lifecycle_state",
                js: "lifecycle_state",
                typ: u(undefined, ""),
            },
            {json: "parent_path", js: "parent_path", typ: u(undefined, "")},
            {json: "path", js: "path", typ: u(undefined, "")},
            {
                json: "permissions",
                js: "permissions",
                typ: u(undefined, u(a(u(r("FriskyBundleSchem"), "")), "")),
            },
            {
                json: "serialized_dashboard",
                js: "serialized_dashboard",
                typ: u(undefined, "any"),
            },
            {json: "update_time", js: "update_time", typ: u(undefined, "")},
            {json: "warehouse_id", js: "warehouse_id", typ: u(undefined, "")},
        ],
        false
    ),
    FriskyBundleSchem: o(
        [
            {json: "group_name", js: "group_name", typ: u(undefined, "")},
            {json: "level", js: "level", typ: ""},
            {
                json: "service_principal_name",
                js: "service_principal_name",
                typ: u(undefined, ""),
            },
            {json: "user_name", js: "user_name", typ: u(undefined, "")},
        ],
        false
    ),
    ExperimentClass: o(
        [
            {
                json: "artifact_location",
                js: "artifact_location",
                typ: u(undefined, ""),
            },
            {
                json: "creation_time",
                js: "creation_time",
                typ: u(undefined, u(0, "")),
            },
            {json: "experiment_id", js: "experiment_id", typ: u(undefined, "")},
            {
                json: "last_update_time",
                js: "last_update_time",
                typ: u(undefined, u(0, "")),
            },
            {
                json: "lifecycle_stage",
                js: "lifecycle_stage",
                typ: u(undefined, ""),
            },
            {json: "name", js: "name", typ: u(undefined, "")},
            {
                json: "permissions",
                js: "permissions",
                typ: u(undefined, u(a(u(r("MischievousBundleSchem"), "")), "")),
            },
            {
                json: "tags",
                js: "tags",
                typ: u(
                    undefined,
                    u(a(u(r("BraggadociousBundleSchem"), "")), "")
                ),
            },
        ],
        false
    ),
    MischievousBundleSchem: o(
        [
            {json: "group_name", js: "group_name", typ: u(undefined, "")},
            {json: "level", js: "level", typ: ""},
            {
                json: "service_principal_name",
                js: "service_principal_name",
                typ: u(undefined, ""),
            },
            {json: "user_name", js: "user_name", typ: u(undefined, "")},
        ],
        false
    ),
    BraggadociousBundleSchem: o(
        [
            {json: "key", js: "key", typ: u(undefined, "")},
            {json: "value", js: "value", typ: u(undefined, "")},
        ],
        false
    ),
    BundleSchem1: o(
        [
            {
                json: "budget_policy_id",
                js: "budget_policy_id",
                typ: u(undefined, ""),
            },
            {
                json: "continuous",
                js: "continuous",
                typ: u(undefined, u(r("ContinuousClass"), "")),
            },
            {json: "description", js: "description", typ: u(undefined, "")},
            {
                json: "email_notifications",
                js: "email_notifications",
                typ: u(undefined, u(r("BundleSchem2"), "")),
            },
            {
                json: "environments",
                js: "environments",
                typ: u(undefined, u(a(u(r("BundleSchem3"), "")), "")),
            },
            {
                json: "git_source",
                js: "git_source",
                typ: u(undefined, u(r("GitSourceClass"), "")),
            },
            {
                json: "health",
                js: "health",
                typ: u(undefined, u(r("HealthClass"), "")),
            },
            {
                json: "job_clusters",
                js: "job_clusters",
                typ: u(undefined, u(a(u(r("JobClusterClass"), "")), "")),
            },
            {
                json: "max_concurrent_runs",
                js: "max_concurrent_runs",
                typ: u(undefined, u(0, "")),
            },
            {json: "name", js: "name", typ: u(undefined, "")},
            {
                json: "notification_settings",
                js: "notification_settings",
                typ: u(undefined, u(r("BundleSchem4"), "")),
            },
            {
                json: "parameters",
                js: "parameters",
                typ: u(undefined, u(a(u(r("ParameterClass"), "")), "")),
            },
            {
                json: "performance_target",
                js: "performance_target",
                typ: u(undefined, ""),
            },
            {
                json: "permissions",
                js: "permissions",
                typ: u(undefined, u(a(u(r("BundleSchem5"), "")), "")),
            },
            {
                json: "queue",
                js: "queue",
                typ: u(undefined, u(r("QueueClass"), "")),
            },
            {
                json: "run_as",
                js: "run_as",
                typ: u(undefined, u(r("BundleSchem6"), "")),
            },
            {
                json: "schedule",
                js: "schedule",
                typ: u(undefined, u(r("BundleSchem7"), "")),
            },
            {json: "tags", js: "tags", typ: u(undefined, u(m(""), ""))},
            {
                json: "tasks",
                js: "tasks",
                typ: u(undefined, u(a(u(r("TaskClass"), "")), "")),
            },
            {
                json: "timeout_seconds",
                js: "timeout_seconds",
                typ: u(undefined, u(0, "")),
            },
            {
                json: "trigger",
                js: "trigger",
                typ: u(undefined, u(r("BundleSchem16"), "")),
            },
            {
                json: "webhook_notifications",
                js: "webhook_notifications",
                typ: u(undefined, u(r("WebhookNotificationsClass"), "")),
            },
        ],
        false
    ),
    ContinuousClass: o(
        [{json: "pause_status", js: "pause_status", typ: u(undefined, "")}],
        false
    ),
    BundleSchem2: o(
        [
            {
                json: "no_alert_for_skipped_runs",
                js: "no_alert_for_skipped_runs",
                typ: u(undefined, u(true, "")),
            },
            {
                json: "on_duration_warning_threshold_exceeded",
                js: "on_duration_warning_threshold_exceeded",
                typ: u(undefined, u(a(""), "")),
            },
            {
                json: "on_failure",
                js: "on_failure",
                typ: u(undefined, u(a(""), "")),
            },
            {json: "on_start", js: "on_start", typ: u(undefined, u(a(""), ""))},
            {
                json: "on_streaming_backlog_exceeded",
                js: "on_streaming_backlog_exceeded",
                typ: u(undefined, u(a(""), "")),
            },
            {
                json: "on_success",
                js: "on_success",
                typ: u(undefined, u(a(""), "")),
            },
        ],
        false
    ),
    BundleSchem3: o(
        [
            {json: "environment_key", js: "environment_key", typ: ""},
            {
                json: "spec",
                js: "spec",
                typ: u(undefined, u(r("SpecClass"), "")),
            },
        ],
        false
    ),
    SpecClass: o(
        [
            {json: "client", js: "client", typ: u(undefined, "")},
            {
                json: "dependencies",
                js: "dependencies",
                typ: u(undefined, u(a(""), "")),
            },
            {
                json: "environment_version",
                js: "environment_version",
                typ: u(undefined, ""),
            },
            {
                json: "jar_dependencies",
                js: "jar_dependencies",
                typ: u(undefined, u(a(""), "")),
            },
        ],
        false
    ),
    GitSourceClass: o(
        [
            {json: "git_branch", js: "git_branch", typ: u(undefined, "")},
            {json: "git_commit", js: "git_commit", typ: u(undefined, "")},
            {json: "git_provider", js: "git_provider", typ: ""},
            {json: "git_tag", js: "git_tag", typ: u(undefined, "")},
            {json: "git_url", js: "git_url", typ: ""},
        ],
        false
    ),
    HealthClass: o(
        [
            {
                json: "rules",
                js: "rules",
                typ: u(undefined, u(a(u(r("RuleClass"), "")), "")),
            },
        ],
        false
    ),
    RuleClass: o(
        [
            {json: "metric", js: "metric", typ: ""},
            {json: "op", js: "op", typ: ""},
            {json: "value", js: "value", typ: u(0, "")},
        ],
        false
    ),
    JobClusterClass: o(
        [
            {json: "job_cluster_key", js: "job_cluster_key", typ: ""},
            {
                json: "new_cluster",
                js: "new_cluster",
                typ: u(r("NewClusterClass"), ""),
            },
        ],
        false
    ),
    NewClusterClass: o(
        [
            {
                json: "apply_policy_default_values",
                js: "apply_policy_default_values",
                typ: u(undefined, u(true, "")),
            },
            {
                json: "autoscale",
                js: "autoscale",
                typ: u(undefined, u(r("IndecentBundleSchem"), "")),
            },
            {
                json: "autotermination_minutes",
                js: "autotermination_minutes",
                typ: u(undefined, u(0, "")),
            },
            {
                json: "aws_attributes",
                js: "aws_attributes",
                typ: u(undefined, u(r("AwsAttributesClass"), "")),
            },
            {
                json: "azure_attributes",
                js: "azure_attributes",
                typ: u(undefined, u(r("AzureAttributesClass"), "")),
            },
            {
                json: "cluster_log_conf",
                js: "cluster_log_conf",
                typ: u(undefined, u(r("ClusterLogConfClass"), "")),
            },
            {json: "cluster_name", js: "cluster_name", typ: u(undefined, "")},
            {
                json: "custom_tags",
                js: "custom_tags",
                typ: u(undefined, u(m(""), "")),
            },
            {
                json: "data_security_mode",
                js: "data_security_mode",
                typ: u(undefined, ""),
            },
            {
                json: "docker_image",
                js: "docker_image",
                typ: u(undefined, u(r("DockerImageClass"), "")),
            },
            {
                json: "driver_instance_pool_id",
                js: "driver_instance_pool_id",
                typ: u(undefined, ""),
            },
            {
                json: "driver_node_type_id",
                js: "driver_node_type_id",
                typ: u(undefined, ""),
            },
            {
                json: "enable_elastic_disk",
                js: "enable_elastic_disk",
                typ: u(undefined, u(true, "")),
            },
            {
                json: "enable_local_disk_encryption",
                js: "enable_local_disk_encryption",
                typ: u(undefined, u(true, "")),
            },
            {
                json: "gcp_attributes",
                js: "gcp_attributes",
                typ: u(undefined, u(r("GcpAttributesClass"), "")),
            },
            {
                json: "init_scripts",
                js: "init_scripts",
                typ: u(undefined, u(a(u(r("InitScriptClass"), "")), "")),
            },
            {
                json: "instance_pool_id",
                js: "instance_pool_id",
                typ: u(undefined, ""),
            },
            {
                json: "is_single_node",
                js: "is_single_node",
                typ: u(undefined, u(true, "")),
            },
            {json: "kind", js: "kind", typ: u(undefined, "")},
            {json: "node_type_id", js: "node_type_id", typ: u(undefined, "")},
            {
                json: "num_workers",
                js: "num_workers",
                typ: u(undefined, u(0, "")),
            },
            {json: "policy_id", js: "policy_id", typ: u(undefined, "")},
            {
                json: "remote_disk_throughput",
                js: "remote_disk_throughput",
                typ: u(undefined, u(0, "")),
            },
            {
                json: "runtime_engine",
                js: "runtime_engine",
                typ: u(undefined, ""),
            },
            {
                json: "single_user_name",
                js: "single_user_name",
                typ: u(undefined, ""),
            },
            {
                json: "spark_conf",
                js: "spark_conf",
                typ: u(undefined, u(m(""), "")),
            },
            {
                json: "spark_env_vars",
                js: "spark_env_vars",
                typ: u(undefined, u(m(""), "")),
            },
            {json: "spark_version", js: "spark_version", typ: u(undefined, "")},
            {
                json: "ssh_public_keys",
                js: "ssh_public_keys",
                typ: u(undefined, u(a(""), "")),
            },
            {
                json: "total_initial_remote_disk_size",
                js: "total_initial_remote_disk_size",
                typ: u(undefined, u(0, "")),
            },
            {
                json: "use_ml_runtime",
                js: "use_ml_runtime",
                typ: u(undefined, u(true, "")),
            },
            {
                json: "workload_type",
                js: "workload_type",
                typ: u(undefined, u(r("WorkloadTypeClass"), "")),
            },
        ],
        false
    ),
    BundleSchem4: o(
        [
            {
                json: "no_alert_for_canceled_runs",
                js: "no_alert_for_canceled_runs",
                typ: u(undefined, u(true, "")),
            },
            {
                json: "no_alert_for_skipped_runs",
                js: "no_alert_for_skipped_runs",
                typ: u(undefined, u(true, "")),
            },
        ],
        false
    ),
    ParameterClass: o(
        [
            {json: "default", js: "default", typ: ""},
            {json: "name", js: "name", typ: ""},
        ],
        false
    ),
    BundleSchem5: o(
        [
            {json: "group_name", js: "group_name", typ: u(undefined, "")},
            {json: "level", js: "level", typ: ""},
            {
                json: "service_principal_name",
                js: "service_principal_name",
                typ: u(undefined, ""),
            },
            {json: "user_name", js: "user_name", typ: u(undefined, "")},
        ],
        false
    ),
    QueueClass: o([{json: "enabled", js: "enabled", typ: u(true, "")}], false),
    BundleSchem6: o(
        [
            {
                json: "service_principal_name",
                js: "service_principal_name",
                typ: u(undefined, ""),
            },
            {json: "user_name", js: "user_name", typ: u(undefined, "")},
        ],
        false
    ),
    BundleSchem7: o(
        [
            {json: "pause_status", js: "pause_status", typ: u(undefined, "")},
            {
                json: "quartz_cron_expression",
                js: "quartz_cron_expression",
                typ: "",
            },
            {json: "timezone_id", js: "timezone_id", typ: ""},
        ],
        false
    ),
    ForEachTaskClass: o(
        [
            {
                json: "concurrency",
                js: "concurrency",
                typ: u(undefined, u(0, "")),
            },
            {json: "inputs", js: "inputs", typ: ""},
            {json: "task", js: "task", typ: u(r("TaskClass"), "")},
        ],
        false
    ),
    TaskClass: o(
        [
            {
                json: "clean_rooms_notebook_task",
                js: "clean_rooms_notebook_task",
                typ: u(undefined, u(r("CleanRoomsNotebookTaskClass"), "")),
            },
            {
                json: "condition_task",
                js: "condition_task",
                typ: u(undefined, u(r("ConditionTaskClass"), "")),
            },
            {
                json: "dashboard_task",
                js: "dashboard_task",
                typ: u(undefined, u(r("DashboardTaskClass"), "")),
            },
            {
                json: "dbt_cloud_task",
                js: "dbt_cloud_task",
                typ: u(undefined, u(r("DbtCloudTaskClass"), "")),
            },
            {
                json: "dbt_platform_task",
                js: "dbt_platform_task",
                typ: u(undefined, u(r("DbtPlatformTaskClass"), "")),
            },
            {
                json: "dbt_task",
                js: "dbt_task",
                typ: u(undefined, u(r("DbtTaskClass"), "")),
            },
            {
                json: "depends_on",
                js: "depends_on",
                typ: u(undefined, u(a(u(r("DependsOnClass"), "")), "")),
            },
            {json: "description", js: "description", typ: u(undefined, "")},
            {
                json: "disable_auto_optimization",
                js: "disable_auto_optimization",
                typ: u(undefined, u(true, "")),
            },
            {
                json: "email_notifications",
                js: "email_notifications",
                typ: u(undefined, u(r("BundleSchem9"), "")),
            },
            {
                json: "environment_key",
                js: "environment_key",
                typ: u(undefined, ""),
            },
            {
                json: "existing_cluster_id",
                js: "existing_cluster_id",
                typ: u(undefined, ""),
            },
            {
                json: "for_each_task",
                js: "for_each_task",
                typ: u(undefined, u(r("ForEachTaskClass"), "")),
            },
            {
                json: "gen_ai_compute_task",
                js: "gen_ai_compute_task",
                typ: u(undefined, u(r("GenAIComputeTaskClass"), "")),
            },
            {
                json: "health",
                js: "health",
                typ: u(undefined, u(r("HealthClass"), "")),
            },
            {
                json: "job_cluster_key",
                js: "job_cluster_key",
                typ: u(undefined, ""),
            },
            {
                json: "libraries",
                js: "libraries",
                typ: u(undefined, u(a(u(r("BundleSchem10"), "")), "")),
            },
            {
                json: "max_retries",
                js: "max_retries",
                typ: u(undefined, u(0, "")),
            },
            {
                json: "min_retry_interval_millis",
                js: "min_retry_interval_millis",
                typ: u(undefined, u(0, "")),
            },
            {
                json: "new_cluster",
                js: "new_cluster",
                typ: u(undefined, u(r("NewClusterClass"), "")),
            },
            {
                json: "notebook_task",
                js: "notebook_task",
                typ: u(undefined, u(r("NotebookTaskClass"), "")),
            },
            {
                json: "notification_settings",
                js: "notification_settings",
                typ: u(undefined, u(r("BundleSchem11"), "")),
            },
            {
                json: "pipeline_task",
                js: "pipeline_task",
                typ: u(undefined, u(r("PipelineTaskClass"), "")),
            },
            {
                json: "power_bi_task",
                js: "power_bi_task",
                typ: u(undefined, u(r("PowerBITaskClass"), "")),
            },
            {
                json: "python_wheel_task",
                js: "python_wheel_task",
                typ: u(undefined, u(r("PythonWheelTaskClass"), "")),
            },
            {
                json: "retry_on_timeout",
                js: "retry_on_timeout",
                typ: u(undefined, u(true, "")),
            },
            {json: "run_if", js: "run_if", typ: u(undefined, "")},
            {
                json: "run_job_task",
                js: "run_job_task",
                typ: u(undefined, u(r("RunJobTaskClass"), "")),
            },
            {
                json: "spark_jar_task",
                js: "spark_jar_task",
                typ: u(undefined, u(r("SparkJarTaskClass"), "")),
            },
            {
                json: "spark_python_task",
                js: "spark_python_task",
                typ: u(undefined, u(r("SparkPythonTaskClass"), "")),
            },
            {
                json: "spark_submit_task",
                js: "spark_submit_task",
                typ: u(undefined, u(r("SparkSubmitTaskClass"), "")),
            },
            {
                json: "sql_task",
                js: "sql_task",
                typ: u(undefined, u(r("SQLTaskClass"), "")),
            },
            {json: "task_key", js: "task_key", typ: ""},
            {
                json: "timeout_seconds",
                js: "timeout_seconds",
                typ: u(undefined, u(0, "")),
            },
            {
                json: "webhook_notifications",
                js: "webhook_notifications",
                typ: u(undefined, u(r("WebhookNotificationsClass"), "")),
            },
        ],
        false
    ),
    CleanRoomsNotebookTaskClass: o(
        [
            {json: "clean_room_name", js: "clean_room_name", typ: ""},
            {json: "etag", js: "etag", typ: u(undefined, "")},
            {
                json: "notebook_base_parameters",
                js: "notebook_base_parameters",
                typ: u(undefined, u(m(""), "")),
            },
            {json: "notebook_name", js: "notebook_name", typ: ""},
        ],
        false
    ),
    ConditionTaskClass: o(
        [
            {json: "left", js: "left", typ: ""},
            {json: "op", js: "op", typ: ""},
            {json: "right", js: "right", typ: ""},
        ],
        false
    ),
    DashboardTaskClass: o(
        [
            {json: "dashboard_id", js: "dashboard_id", typ: u(undefined, "")},
            {
                json: "subscription",
                js: "subscription",
                typ: u(undefined, u(r("BundleSchem8"), "")),
            },
            {json: "warehouse_id", js: "warehouse_id", typ: u(undefined, "")},
        ],
        false
    ),
    BundleSchem8: o(
        [
            {
                json: "custom_subject",
                js: "custom_subject",
                typ: u(undefined, ""),
            },
            {json: "paused", js: "paused", typ: u(undefined, u(true, ""))},
            {
                json: "subscribers",
                js: "subscribers",
                typ: u(undefined, u(a(u(r("SubscriberClass"), "")), "")),
            },
        ],
        false
    ),
    SubscriberClass: o(
        [
            {
                json: "destination_id",
                js: "destination_id",
                typ: u(undefined, ""),
            },
            {json: "user_name", js: "user_name", typ: u(undefined, "")},
        ],
        false
    ),
    DbtCloudTaskClass: o(
        [
            {
                json: "connection_resource_name",
                js: "connection_resource_name",
                typ: u(undefined, ""),
            },
            {
                json: "dbt_cloud_job_id",
                js: "dbt_cloud_job_id",
                typ: u(undefined, u(0, "")),
            },
        ],
        false
    ),
    DbtPlatformTaskClass: o(
        [
            {
                json: "connection_resource_name",
                js: "connection_resource_name",
                typ: u(undefined, ""),
            },
            {
                json: "dbt_platform_job_id",
                js: "dbt_platform_job_id",
                typ: u(undefined, ""),
            },
        ],
        false
    ),
    DbtTaskClass: o(
        [
            {json: "catalog", js: "catalog", typ: u(undefined, "")},
            {json: "commands", js: "commands", typ: u(a(""), "")},
            {
                json: "profiles_directory",
                js: "profiles_directory",
                typ: u(undefined, ""),
            },
            {
                json: "project_directory",
                js: "project_directory",
                typ: u(undefined, ""),
            },
            {json: "schema", js: "schema", typ: u(undefined, "")},
            {json: "source", js: "source", typ: u(undefined, "")},
            {json: "warehouse_id", js: "warehouse_id", typ: u(undefined, "")},
        ],
        false
    ),
    DependsOnClass: o(
        [
            {json: "outcome", js: "outcome", typ: u(undefined, "")},
            {json: "task_key", js: "task_key", typ: ""},
        ],
        false
    ),
    BundleSchem9: o(
        [
            {
                json: "no_alert_for_skipped_runs",
                js: "no_alert_for_skipped_runs",
                typ: u(undefined, u(true, "")),
            },
            {
                json: "on_duration_warning_threshold_exceeded",
                js: "on_duration_warning_threshold_exceeded",
                typ: u(undefined, u(a(""), "")),
            },
            {
                json: "on_failure",
                js: "on_failure",
                typ: u(undefined, u(a(""), "")),
            },
            {json: "on_start", js: "on_start", typ: u(undefined, u(a(""), ""))},
            {
                json: "on_streaming_backlog_exceeded",
                js: "on_streaming_backlog_exceeded",
                typ: u(undefined, u(a(""), "")),
            },
            {
                json: "on_success",
                js: "on_success",
                typ: u(undefined, u(a(""), "")),
            },
        ],
        false
    ),
    GenAIComputeTaskClass: o(
        [
            {json: "command", js: "command", typ: u(undefined, "")},
            {
                json: "compute",
                js: "compute",
                typ: u(undefined, u(r("ComputeClass"), "")),
            },
            {json: "dl_runtime_image", js: "dl_runtime_image", typ: ""},
            {
                json: "mlflow_experiment_name",
                js: "mlflow_experiment_name",
                typ: u(undefined, ""),
            },
            {json: "source", js: "source", typ: u(undefined, "")},
            {
                json: "training_script_path",
                js: "training_script_path",
                typ: u(undefined, ""),
            },
            {
                json: "yaml_parameters",
                js: "yaml_parameters",
                typ: u(undefined, ""),
            },
            {
                json: "yaml_parameters_file_path",
                js: "yaml_parameters_file_path",
                typ: u(undefined, ""),
            },
        ],
        false
    ),
    ComputeClass: o(
        [
            {
                json: "gpu_node_pool_id",
                js: "gpu_node_pool_id",
                typ: u(undefined, ""),
            },
            {json: "gpu_type", js: "gpu_type", typ: u(undefined, "")},
            {json: "num_gpus", js: "num_gpus", typ: u(0, "")},
        ],
        false
    ),
    BundleSchem10: o(
        [
            {
                json: "cran",
                js: "cran",
                typ: u(undefined, u(r("CRANClass"), "")),
            },
            {json: "egg", js: "egg", typ: u(undefined, "")},
            {json: "jar", js: "jar", typ: u(undefined, "")},
            {
                json: "maven",
                js: "maven",
                typ: u(undefined, u(r("MavenClass"), "")),
            },
            {
                json: "pypi",
                js: "pypi",
                typ: u(undefined, u(r("PypiClass"), "")),
            },
            {json: "requirements", js: "requirements", typ: u(undefined, "")},
            {json: "whl", js: "whl", typ: u(undefined, "")},
        ],
        false
    ),
    CRANClass: o(
        [
            {json: "package", js: "package", typ: ""},
            {json: "repo", js: "repo", typ: u(undefined, "")},
        ],
        false
    ),
    MavenClass: o(
        [
            {json: "coordinates", js: "coordinates", typ: ""},
            {
                json: "exclusions",
                js: "exclusions",
                typ: u(undefined, u(a(""), "")),
            },
            {json: "repo", js: "repo", typ: u(undefined, "")},
        ],
        false
    ),
    PypiClass: o(
        [
            {json: "package", js: "package", typ: ""},
            {json: "repo", js: "repo", typ: u(undefined, "")},
        ],
        false
    ),
    NotebookTaskClass: o(
        [
            {
                json: "base_parameters",
                js: "base_parameters",
                typ: u(undefined, u(m(""), "")),
            },
            {json: "notebook_path", js: "notebook_path", typ: ""},
            {json: "source", js: "source", typ: u(undefined, "")},
            {json: "warehouse_id", js: "warehouse_id", typ: u(undefined, "")},
        ],
        false
    ),
    BundleSchem11: o(
        [
            {
                json: "alert_on_last_attempt",
                js: "alert_on_last_attempt",
                typ: u(undefined, u(true, "")),
            },
            {
                json: "no_alert_for_canceled_runs",
                js: "no_alert_for_canceled_runs",
                typ: u(undefined, u(true, "")),
            },
            {
                json: "no_alert_for_skipped_runs",
                js: "no_alert_for_skipped_runs",
                typ: u(undefined, u(true, "")),
            },
        ],
        false
    ),
    PipelineTaskClass: o(
        [
            {
                json: "full_refresh",
                js: "full_refresh",
                typ: u(undefined, u(true, "")),
            },
            {json: "pipeline_id", js: "pipeline_id", typ: ""},
        ],
        false
    ),
    PowerBITaskClass: o(
        [
            {
                json: "connection_resource_name",
                js: "connection_resource_name",
                typ: u(undefined, ""),
            },
            {
                json: "power_bi_model",
                js: "power_bi_model",
                typ: u(undefined, u(r("PowerBIModelClass"), "")),
            },
            {
                json: "refresh_after_update",
                js: "refresh_after_update",
                typ: u(undefined, u(true, "")),
            },
            {
                json: "tables",
                js: "tables",
                typ: u(undefined, u(a(u(r("BundleSchem12"), "")), "")),
            },
            {json: "warehouse_id", js: "warehouse_id", typ: u(undefined, "")},
        ],
        false
    ),
    PowerBIModelClass: o(
        [
            {
                json: "authentication_method",
                js: "authentication_method",
                typ: u(undefined, ""),
            },
            {json: "model_name", js: "model_name", typ: u(undefined, "")},
            {
                json: "overwrite_existing",
                js: "overwrite_existing",
                typ: u(undefined, u(true, "")),
            },
            {json: "storage_mode", js: "storage_mode", typ: u(undefined, "")},
            {
                json: "workspace_name",
                js: "workspace_name",
                typ: u(undefined, ""),
            },
        ],
        false
    ),
    BundleSchem12: o(
        [
            {json: "catalog", js: "catalog", typ: u(undefined, "")},
            {json: "name", js: "name", typ: u(undefined, "")},
            {json: "schema", js: "schema", typ: u(undefined, "")},
            {json: "storage_mode", js: "storage_mode", typ: u(undefined, "")},
        ],
        false
    ),
    PythonWheelTaskClass: o(
        [
            {json: "entry_point", js: "entry_point", typ: ""},
            {
                json: "named_parameters",
                js: "named_parameters",
                typ: u(undefined, u(m(""), "")),
            },
            {json: "package_name", js: "package_name", typ: ""},
            {
                json: "parameters",
                js: "parameters",
                typ: u(undefined, u(a(""), "")),
            },
        ],
        false
    ),
    RunJobTaskClass: o(
        [
            {
                json: "dbt_commands",
                js: "dbt_commands",
                typ: u(undefined, u(a(""), "")),
            },
            {
                json: "jar_params",
                js: "jar_params",
                typ: u(undefined, u(a(""), "")),
            },
            {json: "job_id", js: "job_id", typ: u(0, "")},
            {
                json: "job_parameters",
                js: "job_parameters",
                typ: u(undefined, u(m(""), "")),
            },
            {
                json: "notebook_params",
                js: "notebook_params",
                typ: u(undefined, u(m(""), "")),
            },
            {
                json: "pipeline_params",
                js: "pipeline_params",
                typ: u(undefined, u(r("PipelineParamsClass"), "")),
            },
            {
                json: "python_named_params",
                js: "python_named_params",
                typ: u(undefined, u(m(""), "")),
            },
            {
                json: "python_params",
                js: "python_params",
                typ: u(undefined, u(a(""), "")),
            },
            {
                json: "spark_submit_params",
                js: "spark_submit_params",
                typ: u(undefined, u(a(""), "")),
            },
            {
                json: "sql_params",
                js: "sql_params",
                typ: u(undefined, u(m(""), "")),
            },
        ],
        false
    ),
    PipelineParamsClass: o(
        [
            {
                json: "full_refresh",
                js: "full_refresh",
                typ: u(undefined, u(true, "")),
            },
        ],
        false
    ),
    SparkJarTaskClass: o(
        [
            {json: "jar_uri", js: "jar_uri", typ: u(undefined, "")},
            {
                json: "main_class_name",
                js: "main_class_name",
                typ: u(undefined, ""),
            },
            {
                json: "parameters",
                js: "parameters",
                typ: u(undefined, u(a(""), "")),
            },
            {
                json: "run_as_repl",
                js: "run_as_repl",
                typ: u(undefined, u(true, "")),
            },
        ],
        false
    ),
    SparkPythonTaskClass: o(
        [
            {
                json: "parameters",
                js: "parameters",
                typ: u(undefined, u(a(""), "")),
            },
            {json: "python_file", js: "python_file", typ: ""},
            {json: "source", js: "source", typ: u(undefined, "")},
        ],
        false
    ),
    SparkSubmitTaskClass: o(
        [
            {
                json: "parameters",
                js: "parameters",
                typ: u(undefined, u(a(""), "")),
            },
        ],
        false
    ),
    SQLTaskClass: o(
        [
            {
                json: "alert",
                js: "alert",
                typ: u(undefined, u(r("AlertClass"), "")),
            },
            {
                json: "dashboard",
                js: "dashboard",
                typ: u(undefined, u(r("BundleSchem14"), "")),
            },
            {
                json: "file",
                js: "file",
                typ: u(undefined, u(r("BundleSchem15"), "")),
            },
            {
                json: "parameters",
                js: "parameters",
                typ: u(undefined, u(m(""), "")),
            },
            {
                json: "query",
                js: "query",
                typ: u(undefined, u(r("QueryClass"), "")),
            },
            {json: "warehouse_id", js: "warehouse_id", typ: ""},
        ],
        false
    ),
    AlertClass: o(
        [
            {json: "alert_id", js: "alert_id", typ: ""},
            {
                json: "pause_subscriptions",
                js: "pause_subscriptions",
                typ: u(undefined, u(true, "")),
            },
            {
                json: "subscriptions",
                js: "subscriptions",
                typ: u(undefined, u(a(u(r("BundleSchem13"), "")), "")),
            },
        ],
        false
    ),
    BundleSchem13: o(
        [
            {
                json: "destination_id",
                js: "destination_id",
                typ: u(undefined, ""),
            },
            {json: "user_name", js: "user_name", typ: u(undefined, "")},
        ],
        false
    ),
    BundleSchem14: o(
        [
            {
                json: "custom_subject",
                js: "custom_subject",
                typ: u(undefined, ""),
            },
            {json: "dashboard_id", js: "dashboard_id", typ: ""},
            {
                json: "pause_subscriptions",
                js: "pause_subscriptions",
                typ: u(undefined, u(true, "")),
            },
            {
                json: "subscriptions",
                js: "subscriptions",
                typ: u(undefined, u(a(u(r("BundleSchem13"), "")), "")),
            },
        ],
        false
    ),
    BundleSchem15: o(
        [
            {json: "path", js: "path", typ: ""},
            {json: "source", js: "source", typ: u(undefined, "")},
        ],
        false
    ),
    QueryClass: o([{json: "query_id", js: "query_id", typ: ""}], false),
    WebhookNotificationsClass: o(
        [
            {
                json: "on_duration_warning_threshold_exceeded",
                js: "on_duration_warning_threshold_exceeded",
                typ: u(
                    undefined,
                    u(
                        a(u(r("OnDurationWarningThresholdExceededClass"), "")),
                        ""
                    )
                ),
            },
            {
                json: "on_failure",
                js: "on_failure",
                typ: u(
                    undefined,
                    u(
                        a(u(r("OnDurationWarningThresholdExceededClass"), "")),
                        ""
                    )
                ),
            },
            {
                json: "on_start",
                js: "on_start",
                typ: u(
                    undefined,
                    u(
                        a(u(r("OnDurationWarningThresholdExceededClass"), "")),
                        ""
                    )
                ),
            },
            {
                json: "on_streaming_backlog_exceeded",
                js: "on_streaming_backlog_exceeded",
                typ: u(
                    undefined,
                    u(
                        a(u(r("OnDurationWarningThresholdExceededClass"), "")),
                        ""
                    )
                ),
            },
            {
                json: "on_success",
                js: "on_success",
                typ: u(
                    undefined,
                    u(
                        a(u(r("OnDurationWarningThresholdExceededClass"), "")),
                        ""
                    )
                ),
            },
        ],
        false
    ),
    OnDurationWarningThresholdExceededClass: o(
        [{json: "id", js: "id", typ: ""}],
        false
    ),
    BundleSchem16: o(
        [
            {
                json: "file_arrival",
                js: "file_arrival",
                typ: u(undefined, u(r("FileArrivalClass"), "")),
            },
            {json: "pause_status", js: "pause_status", typ: u(undefined, "")},
            {
                json: "periodic",
                js: "periodic",
                typ: u(undefined, u(r("PeriodicClass"), "")),
            },
            {
                json: "table",
                js: "table",
                typ: u(undefined, u(r("TableUpdateClass"), "")),
            },
            {
                json: "table_update",
                js: "table_update",
                typ: u(undefined, u(r("TableUpdateClass"), "")),
            },
        ],
        false
    ),
    FileArrivalClass: o(
        [
            {
                json: "min_time_between_triggers_seconds",
                js: "min_time_between_triggers_seconds",
                typ: u(undefined, u(0, "")),
            },
            {json: "url", js: "url", typ: ""},
            {
                json: "wait_after_last_change_seconds",
                js: "wait_after_last_change_seconds",
                typ: u(undefined, u(0, "")),
            },
        ],
        false
    ),
    PeriodicClass: o(
        [
            {json: "interval", js: "interval", typ: u(0, "")},
            {json: "unit", js: "unit", typ: ""},
        ],
        false
    ),
    TableUpdateClass: o(
        [
            {json: "condition", js: "condition", typ: u(undefined, "")},
            {
                json: "min_time_between_triggers_seconds",
                js: "min_time_between_triggers_seconds",
                typ: u(undefined, u(0, "")),
            },
            {
                json: "table_names",
                js: "table_names",
                typ: u(undefined, u(a(""), "")),
            },
            {
                json: "wait_after_last_change_seconds",
                js: "wait_after_last_change_seconds",
                typ: u(undefined, u(0, "")),
            },
        ],
        false
    ),
    ModelServingEndpointClass: o(
        [
            {
                json: "ai_gateway",
                js: "ai_gateway",
                typ: u(undefined, u(r("AIGatewayClass"), "")),
            },
            {
                json: "budget_policy_id",
                js: "budget_policy_id",
                typ: u(undefined, ""),
            },
            {
                json: "config",
                js: "config",
                typ: u(undefined, u(r("ConfigClass"), "")),
            },
            {json: "name", js: "name", typ: ""},
            {
                json: "permissions",
                js: "permissions",
                typ: u(undefined, u(a(u(r("BundleSchem18"), "")), "")),
            },
            {
                json: "rate_limits",
                js: "rate_limits",
                typ: u(undefined, u(a(u(r("BundleSchem19"), "")), "")),
            },
            {
                json: "route_optimized",
                js: "route_optimized",
                typ: u(undefined, u(true, "")),
            },
            {
                json: "tags",
                js: "tags",
                typ: u(undefined, u(a(u(r("BundleSchem20"), "")), "")),
            },
        ],
        false
    ),
    AIGatewayClass: o(
        [
            {
                json: "fallback_config",
                js: "fallback_config",
                typ: u(undefined, u(r("FallbackConfigClass"), "")),
            },
            {
                json: "guardrails",
                js: "guardrails",
                typ: u(undefined, u(r("GuardrailsClass"), "")),
            },
            {
                json: "inference_table_config",
                js: "inference_table_config",
                typ: u(undefined, u(r("InferenceTableConfigClass"), "")),
            },
            {
                json: "rate_limits",
                js: "rate_limits",
                typ: u(undefined, u(a(u(r("BundleSchem17"), "")), "")),
            },
            {
                json: "usage_tracking_config",
                js: "usage_tracking_config",
                typ: u(undefined, u(r("UsageTrackingConfigClass"), "")),
            },
        ],
        false
    ),
    FallbackConfigClass: o(
        [{json: "enabled", js: "enabled", typ: u(true, "")}],
        false
    ),
    GuardrailsClass: o(
        [
            {
                json: "input",
                js: "input",
                typ: u(undefined, u(r("InputClass"), "")),
            },
            {
                json: "output",
                js: "output",
                typ: u(undefined, u(r("InputClass"), "")),
            },
        ],
        false
    ),
    InputClass: o(
        [
            {
                json: "invalid_keywords",
                js: "invalid_keywords",
                typ: u(undefined, u(a(""), "")),
            },
            {json: "pii", js: "pii", typ: u(undefined, u(r("PiiClass"), ""))},
            {json: "safety", js: "safety", typ: u(undefined, u(true, ""))},
            {
                json: "valid_topics",
                js: "valid_topics",
                typ: u(undefined, u(a(""), "")),
            },
        ],
        false
    ),
    PiiClass: o(
        [{json: "behavior", js: "behavior", typ: u(undefined, "")}],
        false
    ),
    InferenceTableConfigClass: o(
        [
            {json: "catalog_name", js: "catalog_name", typ: u(undefined, "")},
            {json: "enabled", js: "enabled", typ: u(undefined, u(true, ""))},
            {json: "schema_name", js: "schema_name", typ: u(undefined, "")},
            {
                json: "table_name_prefix",
                js: "table_name_prefix",
                typ: u(undefined, ""),
            },
        ],
        false
    ),
    BundleSchem17: o(
        [
            {json: "calls", js: "calls", typ: u(0, "")},
            {json: "key", js: "key", typ: u(undefined, "")},
            {json: "renewal_period", js: "renewal_period", typ: ""},
        ],
        false
    ),
    UsageTrackingConfigClass: o(
        [{json: "enabled", js: "enabled", typ: u(undefined, u(true, ""))}],
        false
    ),
    ConfigClass: o(
        [
            {
                json: "auto_capture_config",
                js: "auto_capture_config",
                typ: u(undefined, u(r("AutoCaptureConfigClass"), "")),
            },
            {
                json: "served_entities",
                js: "served_entities",
                typ: u(undefined, u(a(u(r("ServedEntityClass"), "")), "")),
            },
            {
                json: "served_models",
                js: "served_models",
                typ: u(undefined, u(a(u(r("ServedModelClass"), "")), "")),
            },
            {
                json: "traffic_config",
                js: "traffic_config",
                typ: u(undefined, u(r("TrafficConfigClass"), "")),
            },
        ],
        false
    ),
    AutoCaptureConfigClass: o(
        [
            {json: "catalog_name", js: "catalog_name", typ: u(undefined, "")},
            {json: "enabled", js: "enabled", typ: u(undefined, u(true, ""))},
            {json: "schema_name", js: "schema_name", typ: u(undefined, "")},
            {
                json: "table_name_prefix",
                js: "table_name_prefix",
                typ: u(undefined, ""),
            },
        ],
        false
    ),
    ServedEntityClass: o(
        [
            {json: "entity_name", js: "entity_name", typ: u(undefined, "")},
            {
                json: "entity_version",
                js: "entity_version",
                typ: u(undefined, ""),
            },
            {
                json: "environment_vars",
                js: "environment_vars",
                typ: u(undefined, u(m(""), "")),
            },
            {
                json: "external_model",
                js: "external_model",
                typ: u(undefined, u(r("ExternalModelClass"), "")),
            },
            {
                json: "instance_profile_arn",
                js: "instance_profile_arn",
                typ: u(undefined, ""),
            },
            {
                json: "max_provisioned_concurrency",
                js: "max_provisioned_concurrency",
                typ: u(undefined, u(0, "")),
            },
            {
                json: "max_provisioned_throughput",
                js: "max_provisioned_throughput",
                typ: u(undefined, u(0, "")),
            },
            {
                json: "min_provisioned_concurrency",
                js: "min_provisioned_concurrency",
                typ: u(undefined, u(0, "")),
            },
            {
                json: "min_provisioned_throughput",
                js: "min_provisioned_throughput",
                typ: u(undefined, u(0, "")),
            },
            {json: "name", js: "name", typ: u(undefined, "")},
            {
                json: "provisioned_model_units",
                js: "provisioned_model_units",
                typ: u(undefined, u(0, "")),
            },
            {
                json: "scale_to_zero_enabled",
                js: "scale_to_zero_enabled",
                typ: u(undefined, u(true, "")),
            },
            {json: "workload_size", js: "workload_size", typ: u(undefined, "")},
            {json: "workload_type", js: "workload_type", typ: u(undefined, "")},
        ],
        false
    ),
    ExternalModelClass: o(
        [
            {
                json: "ai21labs_config",
                js: "ai21labs_config",
                typ: u(undefined, u(r("Ai21LabsConfigClass"), "")),
            },
            {
                json: "amazon_bedrock_config",
                js: "amazon_bedrock_config",
                typ: u(undefined, u(r("AmazonBedrockConfigClass"), "")),
            },
            {
                json: "anthropic_config",
                js: "anthropic_config",
                typ: u(undefined, u(r("AnthropicConfigClass"), "")),
            },
            {
                json: "cohere_config",
                js: "cohere_config",
                typ: u(undefined, u(r("CohereConfigClass"), "")),
            },
            {
                json: "custom_provider_config",
                js: "custom_provider_config",
                typ: u(undefined, u(r("CustomProviderConfigClass"), "")),
            },
            {
                json: "databricks_model_serving_config",
                js: "databricks_model_serving_config",
                typ: u(
                    undefined,
                    u(r("DatabricksModelServingConfigClass"), "")
                ),
            },
            {
                json: "google_cloud_vertex_ai_config",
                js: "google_cloud_vertex_ai_config",
                typ: u(undefined, u(r("GoogleCloudVertexAIConfigClass"), "")),
            },
            {json: "name", js: "name", typ: ""},
            {
                json: "openai_config",
                js: "openai_config",
                typ: u(undefined, u(r("OpenaiConfigClass"), "")),
            },
            {
                json: "palm_config",
                js: "palm_config",
                typ: u(undefined, u(r("PalmConfigClass"), "")),
            },
            {json: "provider", js: "provider", typ: ""},
            {json: "task", js: "task", typ: ""},
        ],
        false
    ),
    Ai21LabsConfigClass: o(
        [
            {
                json: "ai21labs_api_key",
                js: "ai21labs_api_key",
                typ: u(undefined, ""),
            },
            {
                json: "ai21labs_api_key_plaintext",
                js: "ai21labs_api_key_plaintext",
                typ: u(undefined, ""),
            },
        ],
        false
    ),
    AmazonBedrockConfigClass: o(
        [
            {
                json: "aws_access_key_id",
                js: "aws_access_key_id",
                typ: u(undefined, ""),
            },
            {
                json: "aws_access_key_id_plaintext",
                js: "aws_access_key_id_plaintext",
                typ: u(undefined, ""),
            },
            {json: "aws_region", js: "aws_region", typ: ""},
            {
                json: "aws_secret_access_key",
                js: "aws_secret_access_key",
                typ: u(undefined, ""),
            },
            {
                json: "aws_secret_access_key_plaintext",
                js: "aws_secret_access_key_plaintext",
                typ: u(undefined, ""),
            },
            {json: "bedrock_provider", js: "bedrock_provider", typ: ""},
            {
                json: "instance_profile_arn",
                js: "instance_profile_arn",
                typ: u(undefined, ""),
            },
        ],
        false
    ),
    AnthropicConfigClass: o(
        [
            {
                json: "anthropic_api_key",
                js: "anthropic_api_key",
                typ: u(undefined, ""),
            },
            {
                json: "anthropic_api_key_plaintext",
                js: "anthropic_api_key_plaintext",
                typ: u(undefined, ""),
            },
        ],
        false
    ),
    CohereConfigClass: o(
        [
            {
                json: "cohere_api_base",
                js: "cohere_api_base",
                typ: u(undefined, ""),
            },
            {
                json: "cohere_api_key",
                js: "cohere_api_key",
                typ: u(undefined, ""),
            },
            {
                json: "cohere_api_key_plaintext",
                js: "cohere_api_key_plaintext",
                typ: u(undefined, ""),
            },
        ],
        false
    ),
    CustomProviderConfigClass: o(
        [
            {
                json: "api_key_auth",
                js: "api_key_auth",
                typ: u(undefined, u(r("APIKeyAuthClass"), "")),
            },
            {
                json: "bearer_token_auth",
                js: "bearer_token_auth",
                typ: u(undefined, u(r("BearerTokenAuthClass"), "")),
            },
            {json: "custom_provider_url", js: "custom_provider_url", typ: ""},
        ],
        false
    ),
    APIKeyAuthClass: o(
        [
            {json: "key", js: "key", typ: ""},
            {json: "value", js: "value", typ: u(undefined, "")},
            {
                json: "value_plaintext",
                js: "value_plaintext",
                typ: u(undefined, ""),
            },
        ],
        false
    ),
    BearerTokenAuthClass: o(
        [
            {json: "token", js: "token", typ: u(undefined, "")},
            {
                json: "token_plaintext",
                js: "token_plaintext",
                typ: u(undefined, ""),
            },
        ],
        false
    ),
    DatabricksModelServingConfigClass: o(
        [
            {
                json: "databricks_api_token",
                js: "databricks_api_token",
                typ: u(undefined, ""),
            },
            {
                json: "databricks_api_token_plaintext",
                js: "databricks_api_token_plaintext",
                typ: u(undefined, ""),
            },
            {
                json: "databricks_workspace_url",
                js: "databricks_workspace_url",
                typ: "",
            },
        ],
        false
    ),
    GoogleCloudVertexAIConfigClass: o(
        [
            {json: "private_key", js: "private_key", typ: u(undefined, "")},
            {
                json: "private_key_plaintext",
                js: "private_key_plaintext",
                typ: u(undefined, ""),
            },
            {json: "project_id", js: "project_id", typ: ""},
            {json: "region", js: "region", typ: ""},
        ],
        false
    ),
    OpenaiConfigClass: o(
        [
            {
                json: "microsoft_entra_client_id",
                js: "microsoft_entra_client_id",
                typ: u(undefined, ""),
            },
            {
                json: "microsoft_entra_client_secret",
                js: "microsoft_entra_client_secret",
                typ: u(undefined, ""),
            },
            {
                json: "microsoft_entra_client_secret_plaintext",
                js: "microsoft_entra_client_secret_plaintext",
                typ: u(undefined, ""),
            },
            {
                json: "microsoft_entra_tenant_id",
                js: "microsoft_entra_tenant_id",
                typ: u(undefined, ""),
            },
            {
                json: "openai_api_base",
                js: "openai_api_base",
                typ: u(undefined, ""),
            },
            {
                json: "openai_api_key",
                js: "openai_api_key",
                typ: u(undefined, ""),
            },
            {
                json: "openai_api_key_plaintext",
                js: "openai_api_key_plaintext",
                typ: u(undefined, ""),
            },
            {
                json: "openai_api_type",
                js: "openai_api_type",
                typ: u(undefined, ""),
            },
            {
                json: "openai_api_version",
                js: "openai_api_version",
                typ: u(undefined, ""),
            },
            {
                json: "openai_deployment_name",
                js: "openai_deployment_name",
                typ: u(undefined, ""),
            },
            {
                json: "openai_organization",
                js: "openai_organization",
                typ: u(undefined, ""),
            },
        ],
        false
    ),
    PalmConfigClass: o(
        [
            {json: "palm_api_key", js: "palm_api_key", typ: u(undefined, "")},
            {
                json: "palm_api_key_plaintext",
                js: "palm_api_key_plaintext",
                typ: u(undefined, ""),
            },
        ],
        false
    ),
    ServedModelClass: o(
        [
            {
                json: "environment_vars",
                js: "environment_vars",
                typ: u(undefined, u(m(""), "")),
            },
            {
                json: "instance_profile_arn",
                js: "instance_profile_arn",
                typ: u(undefined, ""),
            },
            {
                json: "max_provisioned_concurrency",
                js: "max_provisioned_concurrency",
                typ: u(undefined, u(0, "")),
            },
            {
                json: "max_provisioned_throughput",
                js: "max_provisioned_throughput",
                typ: u(undefined, u(0, "")),
            },
            {
                json: "min_provisioned_concurrency",
                js: "min_provisioned_concurrency",
                typ: u(undefined, u(0, "")),
            },
            {
                json: "min_provisioned_throughput",
                js: "min_provisioned_throughput",
                typ: u(undefined, u(0, "")),
            },
            {json: "model_name", js: "model_name", typ: ""},
            {json: "model_version", js: "model_version", typ: ""},
            {json: "name", js: "name", typ: u(undefined, "")},
            {
                json: "provisioned_model_units",
                js: "provisioned_model_units",
                typ: u(undefined, u(0, "")),
            },
            {
                json: "scale_to_zero_enabled",
                js: "scale_to_zero_enabled",
                typ: u(true, ""),
            },
            {json: "workload_size", js: "workload_size", typ: u(undefined, "")},
            {json: "workload_type", js: "workload_type", typ: u(undefined, "")},
        ],
        false
    ),
    TrafficConfigClass: o(
        [
            {
                json: "routes",
                js: "routes",
                typ: u(undefined, u(a(u(r("RouteClass"), "")), "")),
            },
        ],
        false
    ),
    RouteClass: o(
        [
            {json: "served_model_name", js: "served_model_name", typ: ""},
            {
                json: "traffic_percentage",
                js: "traffic_percentage",
                typ: u(0, ""),
            },
        ],
        false
    ),
    BundleSchem18: o(
        [
            {json: "group_name", js: "group_name", typ: u(undefined, "")},
            {json: "level", js: "level", typ: ""},
            {
                json: "service_principal_name",
                js: "service_principal_name",
                typ: u(undefined, ""),
            },
            {json: "user_name", js: "user_name", typ: u(undefined, "")},
        ],
        false
    ),
    BundleSchem19: o(
        [
            {json: "calls", js: "calls", typ: u(0, "")},
            {json: "key", js: "key", typ: u(undefined, "")},
            {json: "renewal_period", js: "renewal_period", typ: ""},
        ],
        false
    ),
    BundleSchem20: o(
        [
            {json: "key", js: "key", typ: ""},
            {json: "value", js: "value", typ: u(undefined, "")},
        ],
        false
    ),
    ModelClass: o(
        [
            {json: "description", js: "description", typ: u(undefined, "")},
            {json: "name", js: "name", typ: ""},
            {
                json: "permissions",
                js: "permissions",
                typ: u(undefined, u(a(u(r("BundleSchem21"), "")), "")),
            },
            {
                json: "tags",
                js: "tags",
                typ: u(undefined, u(a(u(r("BundleSchem22"), "")), "")),
            },
        ],
        false
    ),
    BundleSchem21: o(
        [
            {json: "group_name", js: "group_name", typ: u(undefined, "")},
            {json: "level", js: "level", typ: ""},
            {
                json: "service_principal_name",
                js: "service_principal_name",
                typ: u(undefined, ""),
            },
            {json: "user_name", js: "user_name", typ: u(undefined, "")},
        ],
        false
    ),
    BundleSchem22: o(
        [
            {json: "key", js: "key", typ: u(undefined, "")},
            {json: "value", js: "value", typ: u(undefined, "")},
        ],
        false
    ),
    PipelineClass: o(
        [
            {
                json: "budget_policy_id",
                js: "budget_policy_id",
                typ: u(undefined, ""),
            },
            {json: "catalog", js: "catalog", typ: u(undefined, "")},
            {json: "channel", js: "channel", typ: u(undefined, "")},
            {
                json: "clusters",
                js: "clusters",
                typ: u(undefined, u(a(u(r("BundleSchem23"), "")), "")),
            },
            {
                json: "configuration",
                js: "configuration",
                typ: u(undefined, u(m(""), "")),
            },
            {
                json: "continuous",
                js: "continuous",
                typ: u(undefined, u(true, "")),
            },
            {
                json: "development",
                js: "development",
                typ: u(undefined, u(true, "")),
            },
            {json: "edition", js: "edition", typ: u(undefined, "")},
            {
                json: "environment",
                js: "environment",
                typ: u(undefined, u(r("BundleSchem25"), "")),
            },
            {
                json: "event_log",
                js: "event_log",
                typ: u(undefined, u(r("EventLogClass"), "")),
            },
            {
                json: "filters",
                js: "filters",
                typ: u(undefined, u(r("FiltersClass"), "")),
            },
            {
                json: "gateway_definition",
                js: "gateway_definition",
                typ: u(undefined, u(r("GatewayDefinitionClass"), "")),
            },
            {json: "id", js: "id", typ: u(undefined, "")},
            {
                json: "ingestion_definition",
                js: "ingestion_definition",
                typ: u(undefined, u(r("IngestionDefinitionClass"), "")),
            },
            {
                json: "libraries",
                js: "libraries",
                typ: u(undefined, u(a(u(r("BundleSchem28"), "")), "")),
            },
            {json: "name", js: "name", typ: u(undefined, "")},
            {
                json: "notifications",
                js: "notifications",
                typ: u(undefined, u(a(u(r("NotificationClass"), "")), "")),
            },
            {
                json: "permissions",
                js: "permissions",
                typ: u(undefined, u(a(u(r("BundleSchem30"), "")), "")),
            },
            {json: "photon", js: "photon", typ: u(undefined, u(true, ""))},
            {
                json: "restart_window",
                js: "restart_window",
                typ: u(undefined, u(r("RestartWindowClass"), "")),
            },
            {json: "root_path", js: "root_path", typ: u(undefined, "")},
            {
                json: "run_as",
                js: "run_as",
                typ: u(undefined, u(r("BundleSchem31"), "")),
            },
            {json: "schema", js: "schema", typ: u(undefined, "")},
            {
                json: "serverless",
                js: "serverless",
                typ: u(undefined, u(true, "")),
            },
            {json: "storage", js: "storage", typ: u(undefined, "")},
            {json: "tags", js: "tags", typ: u(undefined, u(m(""), ""))},
            {json: "target", js: "target", typ: u(undefined, "")},
            {
                json: "trigger",
                js: "trigger",
                typ: u(undefined, u(r("BundleSchem32"), "")),
            },
        ],
        false
    ),
    BundleSchem23: o(
        [
            {
                json: "apply_policy_default_values",
                js: "apply_policy_default_values",
                typ: u(undefined, u(true, "")),
            },
            {
                json: "autoscale",
                js: "autoscale",
                typ: u(undefined, u(r("BundleSchem24"), "")),
            },
            {
                json: "aws_attributes",
                js: "aws_attributes",
                typ: u(undefined, u(r("AwsAttributesClass"), "")),
            },
            {
                json: "azure_attributes",
                js: "azure_attributes",
                typ: u(undefined, u(r("AzureAttributesClass"), "")),
            },
            {
                json: "cluster_log_conf",
                js: "cluster_log_conf",
                typ: u(undefined, u(r("ClusterLogConfClass"), "")),
            },
            {
                json: "custom_tags",
                js: "custom_tags",
                typ: u(undefined, u(m(""), "")),
            },
            {
                json: "driver_instance_pool_id",
                js: "driver_instance_pool_id",
                typ: u(undefined, ""),
            },
            {
                json: "driver_node_type_id",
                js: "driver_node_type_id",
                typ: u(undefined, ""),
            },
            {
                json: "enable_local_disk_encryption",
                js: "enable_local_disk_encryption",
                typ: u(undefined, u(true, "")),
            },
            {
                json: "gcp_attributes",
                js: "gcp_attributes",
                typ: u(undefined, u(r("GcpAttributesClass"), "")),
            },
            {
                json: "init_scripts",
                js: "init_scripts",
                typ: u(undefined, u(a(u(r("InitScriptClass"), "")), "")),
            },
            {
                json: "instance_pool_id",
                js: "instance_pool_id",
                typ: u(undefined, ""),
            },
            {json: "label", js: "label", typ: u(undefined, "")},
            {json: "node_type_id", js: "node_type_id", typ: u(undefined, "")},
            {
                json: "num_workers",
                js: "num_workers",
                typ: u(undefined, u(0, "")),
            },
            {json: "policy_id", js: "policy_id", typ: u(undefined, "")},
            {
                json: "spark_conf",
                js: "spark_conf",
                typ: u(undefined, u(m(""), "")),
            },
            {
                json: "spark_env_vars",
                js: "spark_env_vars",
                typ: u(undefined, u(m(""), "")),
            },
            {
                json: "ssh_public_keys",
                js: "ssh_public_keys",
                typ: u(undefined, u(a(""), "")),
            },
        ],
        false
    ),
    BundleSchem24: o(
        [
            {json: "max_workers", js: "max_workers", typ: u(0, "")},
            {json: "min_workers", js: "min_workers", typ: u(0, "")},
            {json: "mode", js: "mode", typ: u(undefined, "")},
        ],
        false
    ),
    BundleSchem25: o(
        [
            {
                json: "dependencies",
                js: "dependencies",
                typ: u(undefined, u(a(""), "")),
            },
        ],
        false
    ),
    EventLogClass: o(
        [
            {json: "catalog", js: "catalog", typ: u(undefined, "")},
            {json: "name", js: "name", typ: u(undefined, "")},
            {json: "schema", js: "schema", typ: u(undefined, "")},
        ],
        false
    ),
    FiltersClass: o(
        [
            {json: "exclude", js: "exclude", typ: u(undefined, u(a(""), ""))},
            {json: "include", js: "include", typ: u(undefined, u(a(""), ""))},
        ],
        false
    ),
    GatewayDefinitionClass: o(
        [
            {json: "connection_id", js: "connection_id", typ: u(undefined, "")},
            {json: "connection_name", js: "connection_name", typ: ""},
            {
                json: "gateway_storage_catalog",
                js: "gateway_storage_catalog",
                typ: "",
            },
            {
                json: "gateway_storage_name",
                js: "gateway_storage_name",
                typ: u(undefined, ""),
            },
            {
                json: "gateway_storage_schema",
                js: "gateway_storage_schema",
                typ: "",
            },
        ],
        false
    ),
    IngestionDefinitionClass: o(
        [
            {
                json: "connection_name",
                js: "connection_name",
                typ: u(undefined, ""),
            },
            {
                json: "ingestion_gateway_id",
                js: "ingestion_gateway_id",
                typ: u(undefined, ""),
            },
            {
                json: "objects",
                js: "objects",
                typ: u(undefined, u(a(u(r("ObjectClass"), "")), "")),
            },
            {json: "source_type", js: "source_type", typ: u(undefined, "")},
            {
                json: "table_configuration",
                js: "table_configuration",
                typ: u(undefined, u(r("TableConfigurationClass"), "")),
            },
        ],
        false
    ),
    ObjectClass: o(
        [
            {
                json: "report",
                js: "report",
                typ: u(undefined, u(r("ReportClass"), "")),
            },
            {
                json: "schema",
                js: "schema",
                typ: u(undefined, u(r("BundleSchem26"), "")),
            },
            {
                json: "table",
                js: "table",
                typ: u(undefined, u(r("BundleSchem27"), "")),
            },
        ],
        false
    ),
    ReportClass: o(
        [
            {json: "destination_catalog", js: "destination_catalog", typ: ""},
            {json: "destination_schema", js: "destination_schema", typ: ""},
            {
                json: "destination_table",
                js: "destination_table",
                typ: u(undefined, ""),
            },
            {json: "source_url", js: "source_url", typ: ""},
            {
                json: "table_configuration",
                js: "table_configuration",
                typ: u(undefined, u(r("TableConfigurationClass"), "")),
            },
        ],
        false
    ),
    TableConfigurationClass: o(
        [
            {
                json: "exclude_columns",
                js: "exclude_columns",
                typ: u(undefined, u(a(""), "")),
            },
            {
                json: "include_columns",
                js: "include_columns",
                typ: u(undefined, u(a(""), "")),
            },
            {
                json: "primary_keys",
                js: "primary_keys",
                typ: u(undefined, u(a(""), "")),
            },
            {
                json: "salesforce_include_formula_fields",
                js: "salesforce_include_formula_fields",
                typ: u(undefined, u(true, "")),
            },
            {json: "scd_type", js: "scd_type", typ: u(undefined, "")},
            {
                json: "sequence_by",
                js: "sequence_by",
                typ: u(undefined, u(a(""), "")),
            },
        ],
        false
    ),
    BundleSchem26: o(
        [
            {json: "destination_catalog", js: "destination_catalog", typ: ""},
            {json: "destination_schema", js: "destination_schema", typ: ""},
            {
                json: "source_catalog",
                js: "source_catalog",
                typ: u(undefined, ""),
            },
            {json: "source_schema", js: "source_schema", typ: ""},
            {
                json: "table_configuration",
                js: "table_configuration",
                typ: u(undefined, u(r("TableConfigurationClass"), "")),
            },
        ],
        false
    ),
    BundleSchem27: o(
        [
            {json: "destination_catalog", js: "destination_catalog", typ: ""},
            {json: "destination_schema", js: "destination_schema", typ: ""},
            {
                json: "destination_table",
                js: "destination_table",
                typ: u(undefined, ""),
            },
            {
                json: "source_catalog",
                js: "source_catalog",
                typ: u(undefined, ""),
            },
            {json: "source_schema", js: "source_schema", typ: u(undefined, "")},
            {json: "source_table", js: "source_table", typ: ""},
            {
                json: "table_configuration",
                js: "table_configuration",
                typ: u(undefined, u(r("TableConfigurationClass"), "")),
            },
        ],
        false
    ),
    BundleSchem28: o(
        [
            {
                json: "file",
                js: "file",
                typ: u(undefined, u(r("BundleSchem29"), "")),
            },
            {
                json: "glob",
                js: "glob",
                typ: u(undefined, u(r("GlobClass"), "")),
            },
            {json: "jar", js: "jar", typ: u(undefined, "")},
            {
                json: "maven",
                js: "maven",
                typ: u(undefined, u(r("MavenClass"), "")),
            },
            {
                json: "notebook",
                js: "notebook",
                typ: u(undefined, u(r("NotebookClass"), "")),
            },
            {json: "whl", js: "whl", typ: u(undefined, "")},
        ],
        false
    ),
    BundleSchem29: o(
        [{json: "path", js: "path", typ: u(undefined, "")}],
        false
    ),
    GlobClass: o(
        [{json: "include", js: "include", typ: u(undefined, "")}],
        false
    ),
    NotebookClass: o(
        [{json: "path", js: "path", typ: u(undefined, "")}],
        false
    ),
    NotificationClass: o(
        [
            {json: "alerts", js: "alerts", typ: u(undefined, u(a(""), ""))},
            {
                json: "email_recipients",
                js: "email_recipients",
                typ: u(undefined, u(a(""), "")),
            },
        ],
        false
    ),
    BundleSchem30: o(
        [
            {json: "group_name", js: "group_name", typ: u(undefined, "")},
            {json: "level", js: "level", typ: ""},
            {
                json: "service_principal_name",
                js: "service_principal_name",
                typ: u(undefined, ""),
            },
            {json: "user_name", js: "user_name", typ: u(undefined, "")},
        ],
        false
    ),
    RestartWindowClass: o(
        [
            {
                json: "days_of_week",
                js: "days_of_week",
                typ: u(undefined, u(a(""), "")),
            },
            {json: "start_hour", js: "start_hour", typ: u(0, "")},
            {json: "time_zone_id", js: "time_zone_id", typ: u(undefined, "")},
        ],
        false
    ),
    BundleSchem31: o(
        [
            {
                json: "service_principal_name",
                js: "service_principal_name",
                typ: u(undefined, ""),
            },
            {json: "user_name", js: "user_name", typ: u(undefined, "")},
        ],
        false
    ),
    BundleSchem32: o(
        [
            {
                json: "cron",
                js: "cron",
                typ: u(undefined, u(r("CronClass"), "")),
            },
            {
                json: "manual",
                js: "manual",
                typ: u(undefined, u(r("ManualClass"), "")),
            },
        ],
        false
    ),
    CronClass: o(
        [
            {
                json: "quartz_cron_schedule",
                js: "quartz_cron_schedule",
                typ: u(undefined, ""),
            },
            {json: "timezone_id", js: "timezone_id", typ: u(undefined, "")},
        ],
        false
    ),
    ManualClass: o([], false),
    QualityMonitorClass: o(
        [
            {json: "assets_dir", js: "assets_dir", typ: ""},
            {
                json: "baseline_table_name",
                js: "baseline_table_name",
                typ: u(undefined, ""),
            },
            {
                json: "custom_metrics",
                js: "custom_metrics",
                typ: u(undefined, u(a(u(r("CustomMetricClass"), "")), "")),
            },
            {
                json: "data_classification_config",
                js: "data_classification_config",
                typ: u(undefined, u(r("DataClassificationConfigClass"), "")),
            },
            {
                json: "inference_log",
                js: "inference_log",
                typ: u(undefined, u(r("InferenceLogClass"), "")),
            },
            {
                json: "notifications",
                js: "notifications",
                typ: u(undefined, u(r("NotificationsClass"), "")),
            },
            {json: "output_schema_name", js: "output_schema_name", typ: ""},
            {
                json: "schedule",
                js: "schedule",
                typ: u(undefined, u(r("BundleSchem33"), "")),
            },
            {
                json: "skip_builtin_dashboard",
                js: "skip_builtin_dashboard",
                typ: u(undefined, u(true, "")),
            },
            {
                json: "slicing_exprs",
                js: "slicing_exprs",
                typ: u(undefined, u(a(""), "")),
            },
            {
                json: "snapshot",
                js: "snapshot",
                typ: u(undefined, u(r("SnapshotClass"), "")),
            },
            {json: "table_name", js: "table_name", typ: ""},
            {
                json: "time_series",
                js: "time_series",
                typ: u(undefined, u(r("TimeSeriesClass"), "")),
            },
            {json: "warehouse_id", js: "warehouse_id", typ: u(undefined, "")},
        ],
        false
    ),
    CustomMetricClass: o(
        [
            {json: "definition", js: "definition", typ: ""},
            {json: "input_columns", js: "input_columns", typ: u(a(""), "")},
            {json: "name", js: "name", typ: ""},
            {json: "output_data_type", js: "output_data_type", typ: ""},
            {json: "type", js: "type", typ: ""},
        ],
        false
    ),
    DataClassificationConfigClass: o(
        [{json: "enabled", js: "enabled", typ: u(undefined, u(true, ""))}],
        false
    ),
    InferenceLogClass: o(
        [
            {json: "granularities", js: "granularities", typ: u(a(""), "")},
            {json: "label_col", js: "label_col", typ: u(undefined, "")},
            {json: "model_id_col", js: "model_id_col", typ: ""},
            {json: "prediction_col", js: "prediction_col", typ: ""},
            {
                json: "prediction_proba_col",
                js: "prediction_proba_col",
                typ: u(undefined, ""),
            },
            {json: "problem_type", js: "problem_type", typ: ""},
            {json: "timestamp_col", js: "timestamp_col", typ: ""},
        ],
        false
    ),
    NotificationsClass: o(
        [
            {
                json: "on_failure",
                js: "on_failure",
                typ: u(
                    undefined,
                    u(r("OnNewClassificationTagDetectedClass"), "")
                ),
            },
            {
                json: "on_new_classification_tag_detected",
                js: "on_new_classification_tag_detected",
                typ: u(
                    undefined,
                    u(r("OnNewClassificationTagDetectedClass"), "")
                ),
            },
        ],
        false
    ),
    OnNewClassificationTagDetectedClass: o(
        [
            {
                json: "email_addresses",
                js: "email_addresses",
                typ: u(undefined, u(a(""), "")),
            },
        ],
        false
    ),
    BundleSchem33: o(
        [
            {json: "pause_status", js: "pause_status", typ: u(undefined, "")},
            {
                json: "quartz_cron_expression",
                js: "quartz_cron_expression",
                typ: "",
            },
            {json: "timezone_id", js: "timezone_id", typ: ""},
        ],
        false
    ),
    SnapshotClass: o([], false),
    TimeSeriesClass: o(
        [
            {json: "granularities", js: "granularities", typ: u(a(""), "")},
            {json: "timestamp_col", js: "timestamp_col", typ: ""},
        ],
        false
    ),
    RegisteredModelClass: o(
        [
            {json: "catalog_name", js: "catalog_name", typ: ""},
            {json: "comment", js: "comment", typ: u(undefined, "")},
            {
                json: "grants",
                js: "grants",
                typ: u(undefined, u(a(u(r("GrantClass"), "")), "")),
            },
            {json: "name", js: "name", typ: ""},
            {json: "schema_name", js: "schema_name", typ: ""},
            {
                json: "storage_location",
                js: "storage_location",
                typ: u(undefined, ""),
            },
        ],
        false
    ),
    GrantClass: o(
        [
            {json: "principal", js: "principal", typ: ""},
            {json: "privileges", js: "privileges", typ: u(a(""), "")},
        ],
        false
    ),
    BundleSchem34: o(
        [
            {json: "catalog_name", js: "catalog_name", typ: ""},
            {json: "comment", js: "comment", typ: u(undefined, "")},
            {
                json: "grants",
                js: "grants",
                typ: u(undefined, u(a(u(r("GrantClass"), "")), "")),
            },
            {json: "name", js: "name", typ: ""},
            {
                json: "properties",
                js: "properties",
                typ: u(undefined, u(m(""), "")),
            },
            {json: "storage_root", js: "storage_root", typ: u(undefined, "")},
        ],
        false
    ),
    SecretScopeClass: o(
        [
            {json: "backend_type", js: "backend_type", typ: u(undefined, "")},
            {
                json: "keyvault_metadata",
                js: "keyvault_metadata",
                typ: u(undefined, u(r("KeyvaultMetadataClass"), "")),
            },
            {json: "name", js: "name", typ: ""},
            {
                json: "permissions",
                js: "permissions",
                typ: u(undefined, u(a(u(r("BundleSchem35"), "")), "")),
            },
        ],
        false
    ),
    KeyvaultMetadataClass: o(
        [
            {json: "dns_name", js: "dns_name", typ: ""},
            {json: "resource_id", js: "resource_id", typ: ""},
        ],
        false
    ),
    BundleSchem35: o(
        [
            {json: "group_name", js: "group_name", typ: u(undefined, "")},
            {json: "level", js: "level", typ: ""},
            {
                json: "service_principal_name",
                js: "service_principal_name",
                typ: u(undefined, ""),
            },
            {json: "user_name", js: "user_name", typ: u(undefined, "")},
        ],
        false
    ),
    VolumeClass: o(
        [
            {json: "catalog_name", js: "catalog_name", typ: ""},
            {json: "comment", js: "comment", typ: u(undefined, "")},
            {
                json: "grants",
                js: "grants",
                typ: u(undefined, u(a(u(r("GrantClass"), "")), "")),
            },
            {json: "name", js: "name", typ: ""},
            {json: "schema_name", js: "schema_name", typ: ""},
            {
                json: "storage_location",
                js: "storage_location",
                typ: u(undefined, ""),
            },
            {json: "volume_type", js: "volume_type", typ: u(undefined, "")},
        ],
        false
    ),
    SyncClass: o(
        [
            {json: "exclude", js: "exclude", typ: u(undefined, u(a(""), ""))},
            {json: "include", js: "include", typ: u(undefined, u(a(""), ""))},
            {json: "paths", js: "paths", typ: u(undefined, u(a(""), ""))},
        ],
        false
    ),
    BundleSchem36: o(
        [
            {json: "artifact_path", js: "artifact_path", typ: u(undefined, "")},
            {json: "auth_type", js: "auth_type", typ: u(undefined, "")},
            {
                json: "azure_client_id",
                js: "azure_client_id",
                typ: u(undefined, ""),
            },
            {
                json: "azure_environment",
                js: "azure_environment",
                typ: u(undefined, ""),
            },
            {
                json: "azure_login_app_id",
                js: "azure_login_app_id",
                typ: u(undefined, ""),
            },
            {
                json: "azure_tenant_id",
                js: "azure_tenant_id",
                typ: u(undefined, ""),
            },
            {
                json: "azure_use_msi",
                js: "azure_use_msi",
                typ: u(undefined, u(true, "")),
            },
            {
                json: "azure_workspace_resource_id",
                js: "azure_workspace_resource_id",
                typ: u(undefined, ""),
            },
            {json: "client_id", js: "client_id", typ: u(undefined, "")},
            {json: "file_path", js: "file_path", typ: u(undefined, "")},
            {
                json: "google_service_account",
                js: "google_service_account",
                typ: u(undefined, ""),
            },
            {json: "host", js: "host", typ: u(undefined, "")},
            {json: "profile", js: "profile", typ: u(undefined, "")},
            {json: "resource_path", js: "resource_path", typ: u(undefined, "")},
            {json: "root_path", js: "root_path", typ: u(undefined, "")},
            {json: "state_path", js: "state_path", typ: u(undefined, "")},
        ],
        false
    ),
    ExperimentalClass: o(
        [
            {
                json: "pydabs",
                js: "pydabs",
                typ: u(undefined, u(r("PydabsClass"), "")),
            },
            {
                json: "python",
                js: "python",
                typ: u(undefined, u(r("PythonClass"), "")),
            },
            {
                json: "python_wheel_wrapper",
                js: "python_wheel_wrapper",
                typ: u(undefined, u(true, "")),
            },
            {json: "scripts", js: "scripts", typ: u(undefined, u(m(""), ""))},
            {
                json: "skip_artifact_cleanup",
                js: "skip_artifact_cleanup",
                typ: u(undefined, u(true, "")),
            },
            {
                json: "skip_name_prefix_for_schema",
                js: "skip_name_prefix_for_schema",
                typ: u(undefined, u(true, "")),
            },
            {
                json: "use_legacy_run_as",
                js: "use_legacy_run_as",
                typ: u(undefined, u(true, "")),
            },
        ],
        false
    ),
    PydabsClass: o(
        [{json: "enabled", js: "enabled", typ: u(undefined, u(true, ""))}],
        false
    ),
    PythonClass: o(
        [
            {json: "mutators", js: "mutators", typ: u(undefined, u(a(""), ""))},
            {
                json: "resources",
                js: "resources",
                typ: u(undefined, u(a(""), "")),
            },
            {json: "venv_path", js: "venv_path", typ: u(undefined, "")},
        ],
        false
    ),
    VariableValue: o(
        [
            {json: "default", js: "default", typ: u(undefined, "any")},
            {json: "description", js: "description", typ: u(undefined, "")},
            {
                json: "lookup",
                js: "lookup",
                typ: u(undefined, u(r("LookupClass"), "")),
            },
            {json: "type", js: "type", typ: u(undefined, "")},
        ],
        false
    ),
    LookupClass: o(
        [
            {json: "alert", js: "alert", typ: u(undefined, "")},
            {json: "cluster", js: "cluster", typ: u(undefined, "")},
            {
                json: "cluster_policy",
                js: "cluster_policy",
                typ: u(undefined, ""),
            },
            {json: "dashboard", js: "dashboard", typ: u(undefined, "")},
            {json: "instance_pool", js: "instance_pool", typ: u(undefined, "")},
            {json: "job", js: "job", typ: u(undefined, "")},
            {json: "metastore", js: "metastore", typ: u(undefined, "")},
            {
                json: "notification_destination",
                js: "notification_destination",
                typ: u(undefined, ""),
            },
            {json: "pipeline", js: "pipeline", typ: u(undefined, "")},
            {json: "query", js: "query", typ: u(undefined, "")},
            {
                json: "service_principal",
                js: "service_principal",
                typ: u(undefined, ""),
            },
            {json: "warehouse", js: "warehouse", typ: u(undefined, "")},
        ],
        false
    ),
};
