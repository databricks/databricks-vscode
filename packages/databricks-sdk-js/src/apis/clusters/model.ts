/* eslint-disable @typescript-eslint/naming-convention */

// Code generated from OpenAPI specs by Databricks SDK Generator. DO NOT EDIT.

// all definitions in this file are in alphabetical order
export interface AutoScale {
    /**
     * The maximum number of workers to which the cluster can scale up when
     * overloaded. Note that ``max_workers`` must be strictly greater than
     * ``min_workers``.
     */
    max_workers?: number;
    /**
     * The minimum number of workers to which the cluster can scale down when
     * underutilized. It is also the initial number of workers the cluster will
     * have after creation.
     */
    min_workers?: number;
}

export interface AwsAttributes {
    /**
     * Availability type used for all subsequent nodes past the
     * ``first_on_demand`` ones. Note: If ``first_on_demand`` is zero, this
     * availability type will be used for the entire cluster.
     */
    availability?: AwsAttributesAvailability;
    /**
     * The number of volumes launched for each instance. Users can choose up to
     * 10 volumes. This feature is only enabled for supported node types. Legacy
     * node types cannot specify custom EBS volumes. For node types with no
     * instance store, at least one EBS volume needs to be specified; otherwise,
     * cluster creation will fail.
     *
     * These EBS volumes will be mounted at ``/ebs0``, ``/ebs1``, and etc.
     * Instance store volumes will be mounted at ``/local_disk0``,
     * ``/local_disk1``, and etc.
     *
     * If EBS volumes are attached, Databricks will configure Spark to use only
     * the EBS volumes for scratch storage because heterogenously sized scratch
     * devices can lead to inefficient disk utilization. If no EBS volumes are
     * attached, Databricks will configure Spark to use instance store volumes.
     *
     * Please note that if EBS volumes are specified, then the Spark
     * configuration ``spark.local.dir`` will be overridden.
     */
    ebs_volume_count?: number;
    /**
     * <needs content added>
     */
    ebs_volume_iops?: number;
    /**
     * The size of each EBS volume (in GiB) launched for each instance. For
     * general purpose SSD, this value must be within the range 100 - 4096. For
     * throughput optimized HDD, this value must be within the range 500 - 4096.
     */
    ebs_volume_size?: number;
    /**
     * <needs content added>
     */
    ebs_volume_throughput?: number;
    /**
     * The type of EBS volumes that will be launched with this cluster.
     */
    ebs_volume_type?: AwsAttributesEbsVolumeType;
    /**
     * The first ``first_on_demand`` nodes of the cluster will be placed on
     * on-demand instances. If this value is greater than 0, the cluster driver
     * node in particular will be placed on an on-demand instance. If this value
     * is greater than or equal to the current cluster size, all nodes will be
     * placed on on-demand instances. If this value is less than the current
     * cluster size, ``first_on_demand`` nodes will be placed on on-demand
     * instances and the remainder will be placed on ``availability`` instances.
     * Note that this value does not affect cluster size and cannot currently be
     * mutated over the lifetime of a cluster.
     */
    first_on_demand?: number;
    /**
     * Nodes for this cluster will only be placed on AWS instances with this
     * instance profile. If ommitted, nodes will be placed on instances without
     * an IAM instance profile. The instance profile must have previously been
     * added to the Databricks environment by an account administrator.
     *
     * This feature may only be available to certain customer plans.
     *
     * If this field is ommitted, we will pull in the default from the conf if it
     * exists.
     */
    instance_profile_arn?: string;
    /**
     * The bid price for AWS spot instances, as a percentage of the corresponding
     * instance type's on-demand price. For example, if this field is set to 50,
     * and the cluster needs a new ``r3.xlarge`` spot instance, then the bid
     * price is half of the price of on-demand ``r3.xlarge`` instances.
     * Similarly, if this field is set to 200, the bid price is twice the price
     * of on-demand ``r3.xlarge`` instances. If not specified, the default value
     * is 100. When spot instances are requested for this cluster, only spot
     * instances whose bid price percentage matches this field will be
     * considered. Note that, for safety, we enforce this field to be no more
     * than 10000.
     *
     * The default value and documentation here should be kept consistent with
     * CommonConf.defaultSpotBidPricePercent and
     * CommonConf.maxSpotBidPricePercent.
     */
    spot_bid_price_percent?: number;
    /**
     * Identifier for the availability zone/datacenter in which the cluster
     * resides. This string will be of a form like "us-west-2a". The provided
     * availability zone must be in the same region as the Databricks deployment.
     * For example, "us-west-2a" is not a valid zone id if the Databricks
     * deployment resides in the "us-east-1" region. This is an optional field at
     * cluster creation, and if not specified, a default zone will be used. If
     * the zone specified is "auto", will try to place cluster in a zone with
     * high availability, and will retry placement in a different AZ if there is
     * not enough capacity. See [[AutoAZHelper.scala]] for more details. The list
     * of available zones as well as the default value can be found by using the
     * `List Zones`_ method.
     */
    zone_id?: string;
}

/**
 * Availability type used for all subsequent nodes past the ``first_on_demand``
 * ones. Note: If ``first_on_demand`` is zero, this availability type will be
 * used for the entire cluster.
 */
export type AwsAttributesAvailability =
    | "ON_DEMAND"
    | "SPOT"
    | "SPOT_WITH_FALLBACK";

/**
 * The type of EBS volumes that will be launched with this cluster.
 */
export type AwsAttributesEbsVolumeType =
    | "GENERAL_PURPOSE_SSD"
    | "THROUGHPUT_OPTIMIZED_HDD";

export interface AzureAttributes {
    /**
     * Availability type used for all subsequent nodes past the
     * ``first_on_demand`` ones. Note: If ``first_on_demand`` is zero (which only
     * happens on pool clusters), this availability type will be used for the
     * entire cluster.
     */
    availability?: AzureAttributesAvailability;
    /**
     * The first ``first_on_demand`` nodes of the cluster will be placed on
     * on-demand instances. This value should be greater than 0, to make sure the
     * cluster driver node is placed on an on-demand instance. If this value is
     * greater than or equal to the current cluster size, all nodes will be
     * placed on on-demand instances. If this value is less than the current
     * cluster size, ``first_on_demand`` nodes will be placed on on-demand
     * instances and the remainder will be placed on ``availability`` instances.
     * Note that this value does not affect cluster size and cannot currently be
     * mutated over the lifetime of a cluster.
     */
    first_on_demand?: number;
    /**
     * Defines values necessary to configure and run Azure Log Analytics agent
     */
    log_analytics_info?: LogAnalyticsInfo;
    /**
     * The max bid price to be used for Azure spot instances. The Max price for
     * the bid cannot be higher than the on-demand price of the instance. If not
     * specified, the default value is -1, which specifies that the instance
     * cannot be evicted on the basis of price, and only on the basis of
     * availability. Further, the value should > 0 or -1.
     */
    spot_bid_max_price?: number;
}

/**
 * Availability type used for all subsequent nodes past the ``first_on_demand``
 * ones. Note: If ``first_on_demand`` is zero (which only happens on pool
 * clusters), this availability type will be used for the entire cluster.
 */
export type AzureAttributesAvailability =
    | "ON_DEMAND_AZURE"
    | "SPOT_AZURE"
    | "SPOT_WITH_FALLBACK_AZURE";

export interface ChangeClusterOwner {
    /**
     * <needs content added>
     */
    cluster_id: string;
    /**
     * New owner of the cluster_id after this RPC.
     */
    owner_username?: string;
}

export interface ClientsTypes {
    /**
     * With jobs set, the cluster can be used for jobs
     */
    jobs?: boolean;
    /**
     * With notebooks set, this cluster can be used for notebooks
     */
    notebooks?: boolean;
}

export interface CloudProviderNodeInfo {
    status?: Array<CloudProviderNodeStatus>;
}

export type CloudProviderNodeStatus =
    | "NotAvailableInRegion"
    | "NotEnabledOnSubscription";

export interface ClusterAttributes {
    /**
     * Automatically terminates the cluster after it is inactive for this time in
     * minutes. If not set, this cluster will not be automatically terminated. If
     * specified, the threshold must be between 10 and 10000 minutes. Users can
     * also set this value to 0 to explicitly disable automatic termination.
     */
    autotermination_minutes?: number;
    /**
     * Attributes related to clusters running on Amazon Web Services. If not
     * specified at cluster creation, a set of default values will be used.
     */
    aws_attributes?: AwsAttributes;
    /**
     * Attributes related to clusters running on Microsoft Azure. If not
     * specified at cluster creation, a set of default values will be used.
     */
    azure_attributes?: AzureAttributes;
    /**
     * The configuration for delivering spark logs to a long-term storage
     * destination. Two kinds of destinations (dbfs and s3) are supported. Only
     * one destination can be specified for one cluster. If the conf is given,
     * the logs will be delivered to the destination every ``5 mins``. The
     * destination of driver logs is ``$destination/$clusterId/driver``, while
     * the destination of executor logs is ``$destination/$clusterId/executor``.
     */
    cluster_log_conf?: ClusterLogConf;
    /**
     * Cluster name requested by the user. This doesn't have to be unique. If not
     * specified at creation, the cluster name will be an empty string.
     */
    cluster_name?: string;
    /**
     * Determines whether the cluster was created by a user through the UI,
     * created by the Databricks Jobs Scheduler, or through an API request. This
     * is the same as cluster_creator, but read only.
     */
    cluster_source?: ClusterAttributesClusterSource;
    /**
     * Additional tags for cluster resources. Databricks will tag all cluster
     * resources (e.g., AWS instances and EBS volumes) with these tags in
     * addition to ``default_tags``. Notes:
     *
     * - Currently, Databricks allows at most 45 custom tags
     *
     * - Clusters can only reuse cloud resources if the resources' tags are a
     * subset of the cluster tags
     */
    custom_tags?: Record<string, string>;
    /**
     * The optional ID of the instance pool for the driver of the cluster
     * belongs. The pool cluster uses the instance pool with id
     * (instance_pool_id) if the driver pool is not assigned.
     */
    driver_instance_pool_id?: string;
    /**
     * The node type of the Spark driver. Note that this field is optional; if
     * unset, the driver node type will be set as the same value as
     * `node_type_id` defined above.
     *
     * This field, along with node_type_id, should not be set if
     * virtual_cluster_size is set. If both driver_node_type_id, node_type_id,
     * and virtual_cluster_size are specified, driver_node_type_id and
     * node_type_id take precedence.
     */
    driver_node_type_id?: string;
    /**
     * The key of the spark version running in the dataplane. This is possibly
     * different from the spark_version (index 2). The spark_version is the raw
     * string provided by the user through API or UI, which could map to a
     * different effective_spark_version running in the dataplane, depending on
     * the cluster's instance type or the runtimeEngine parameter.
     */
    effective_spark_version?: string;
    /**
     * Autoscaling Local Storage: when enabled, this cluster will dynamically
     * acquire additional disk space when its Spark workers are running low on
     * disk space. This feature requires specific AWS permissions to function
     * correctly - refer to the User Guide for more details.
     */
    enable_elastic_disk?: boolean;
    /**
     * Whether to enable LUKS on cluster VMs' local disks
     */
    enable_local_disk_encryption?: boolean;
    /**
     * Attributes related to clusters running on Google Cloud Platform. If not
     * specified at cluster creation, a set of default values will be used.
     */
    gcp_attributes?: GcpAttributes;
    /**
     * The optional ID of the instance pool to which the cluster belongs.
     */
    instance_pool_id?: string;
    /**
     * This field encodes, through a single value, the resources available to
     * each of the Spark nodes in this cluster. For example, the Spark nodes can
     * be provisioned and optimized for memory or compute intensive workloads A
     * list of available node types can be retrieved by using the
     * :ref:`clusterClusterServicelistNodeTypes` API call.
     *
     * This field, along with driver_node_type_id, should not be set if
     * virtual_cluster_size is set. If both driver_node_type_id, node_type_id,
     * and virtual_cluster_size are specified, driver_node_type_id and
     * node_type_id take precedence.
     */
    node_type_id?: string;
    /**
     * The ID of the cluster policy used to create the cluster if applicable.
     */
    policy_id?: string;
    /**
     * Decides which runtime engine to be use, e.g. Standard vs. Photon. If
     * unspecified, the runtime engine is inferred from spark_version.
     */
    runtime_engine?: ClusterAttributesRuntimeEngine;
    /**
     * An object containing a set of optional, user-specified Spark configuration
     * key-value pairs. Users can also pass in a string of extra JVM options to
     * the driver and the executors via ``spark.driver.extraJavaOptions`` and
     * ``spark.executor.extraJavaOptions`` respectively.
     *
     * Example Spark confs: ``{"spark.speculation": true,
     * "spark.streaming.ui.retainedBatches": 5}`` or
     * ``{"spark.driver.extraJavaOptions": "-verbose:gc -XX:+PrintGCDetails"}``
     */
    spark_conf?: Record<string, string>;
    /**
     * An object containing a set of optional, user-specified environment
     * variable key-value pairs. Please note that key-value pair of the form
     * (X,Y) will be exported as is (i.e., ``export X='Y'``) while launching the
     * driver and workers.
     *
     * In order to specify an additional set of ``SPARK_DAEMON_JAVA_OPTS``, we
     * recommend appending them to ``$SPARK_DAEMON_JAVA_OPTS`` as shown in the
     * example below. This ensures that all default databricks managed
     * environmental variables are included as well.
     *
     * Example Spark environment variables: ``{"SPARK_WORKER_MEMORY": "28000m",
     * "SPARK_LOCAL_DIRS": "/local_disk0"}`` or ``{"SPARK_DAEMON_JAVA_OPTS":
     * "$SPARK_DAEMON_JAVA_OPTS -Dspark.shuffle.service.enabled=true"}``
     */
    spark_env_vars?: Record<string, string>;
    /**
     * The Spark version of the cluster, e.g. "3.3.x-scala2.11". A list of
     * available Spark versions can be retrieved by using the
     * :ref:`clusterClusterServicelistSparkVersions` API call. This is the Spark
     * version provided from the user input (API/UI) and may be different from
     * the effective_spark_version, which is the spark version that is actually
     * run in the dataplane. See index 45 for more context.
     */
    spark_version?: string;
    /**
     * SSH public key contents that will be added to each Spark node in this
     * cluster. The corresponding private keys can be used to login with the user
     * name ``ubuntu`` on port ``2200``. Up to 10 keys can be specified.
     */
    ssh_public_keys?: Array<string>;
    workload_type?: WorkloadType;
}

/**
 * Determines whether the cluster was created by a user through the UI, created
 * by the Databricks Jobs Scheduler, or through an API request. This is the same
 * as cluster_creator, but read only.
 */
export type ClusterAttributesClusterSource =
    | "API"
    | "JOB"
    | "MODELS"
    | "PIPELINE"
    | "PIPELINE_MAINTENANCE"
    | "SQL"
    | "UI";

/**
 * Decides which runtime engine to be use, e.g. Standard vs. Photon. If
 * unspecified, the runtime engine is inferred from spark_version.
 */
export type ClusterAttributesRuntimeEngine = "NULL" | "PHOTON" | "STANDARD";

export interface ClusterEvent {
    /**
     * <needs content added>
     */
    cluster_id: string;
    /**
     * <needs content added>
     */
    data_plane_event_details?: DataPlaneEventDetails;
    /**
     * <needs content added>
     */
    details?: EventDetails;
    /**
     * The timestamp when the event occurred, stored as the number of
     * milliseconds since the Unix epoch. If not provided, this will be assigned
     * by the Timeline service.
     */
    timestamp?: number;
    /**
     * <needs content added>
     */
    type?: ClusterEventType;
}

/**
 * <needs content added>
 */
export type ClusterEventType =
    | "AUTOSCALING_STATS_REPORT"
    | "CREATING"
    | "DBFS_DOWN"
    | "DID_NOT_EXPAND_DISK"
    | "DRIVER_HEALTHY"
    | "DRIVER_NOT_RESPONDING"
    | "DRIVER_UNAVAILABLE"
    | "EDITED"
    | "EXPANDED_DISK"
    | "FAILED_TO_EXPAND_DISK"
    | "INIT_SCRIPTS_FINISHED"
    | "INIT_SCRIPTS_STARTED"
    | "METASTORE_DOWN"
    | "NODE_BLACKLISTED"
    | "NODE_EXCLUDED_DECOMMISSIONED"
    | "NODES_LOST"
    | "PINNED"
    | "RESIZING"
    | "RESTARTING"
    | "RUNNING"
    | "SPARK_EXCEPTION"
    | "STARTING"
    | "TERMINATING"
    | "UNPINNED"
    | "UPSIZE_COMPLETED";

export interface ClusterInfo {
    /**
     * Parameters needed in order to automatically scale clusters up and down
     * based on load. Note: autoscaling works best with DB runtime versions 3.0
     * or later.
     */
    autoscale?: AutoScale;
    /**
     * Automatically terminates the cluster after it is inactive for this time in
     * minutes. If not set, this cluster will not be automatically terminated. If
     * specified, the threshold must be between 10 and 10000 minutes. Users can
     * also set this value to 0 to explicitly disable automatic termination.
     */
    autotermination_minutes?: number;
    /**
     * Attributes related to clusters running on Amazon Web Services. If not
     * specified at cluster creation, a set of default values will be used.
     */
    aws_attributes?: AwsAttributes;
    /**
     * Attributes related to clusters running on Microsoft Azure. If not
     * specified at cluster creation, a set of default values will be used.
     */
    azure_attributes?: AzureAttributes;
    /**
     * Number of CPU cores available for this cluster. Note that this can be
     * fractional, e.g. 7.5 cores, since certain node types are configured to
     * share cores between Spark nodes on the same instance.
     */
    cluster_cores?: number;
    /**
     * Canonical identifier for the cluster. This id is retained during cluster
     * restarts and resizes, while each new cluster has a globally unique id.
     */
    cluster_id?: string;
    /**
     * The configuration for delivering spark logs to a long-term storage
     * destination. Two kinds of destinations (dbfs and s3) are supported. Only
     * one destination can be specified for one cluster. If the conf is given,
     * the logs will be delivered to the destination every ``5 mins``. The
     * destination of driver logs is ``$destination/$clusterId/driver``, while
     * the destination of executor logs is ``$destination/$clusterId/executor``.
     */
    cluster_log_conf?: ClusterLogConf;
    /**
     * Cluster log delivery status.
     */
    cluster_log_status?: LogSyncStatus;
    /**
     * Total amount of cluster memory, in megabytes
     */
    cluster_memory_mb?: number;
    /**
     * Cluster name requested by the user. This doesn't have to be unique. If not
     * specified at creation, the cluster name will be an empty string.
     */
    cluster_name?: string;
    /**
     * Determines whether the cluster was created by a user through the UI,
     * created by the Databricks Jobs Scheduler, or through an API request. This
     * is the same as cluster_creator, but read only.
     */
    cluster_source?: ClusterInfoClusterSource;
    /**
     * Creator user name. The field won't be included in the response if the user
     * has already been deleted.
     */
    creator_user_name?: string;
    /**
     * Additional tags for cluster resources. Databricks will tag all cluster
     * resources (e.g., AWS instances and EBS volumes) with these tags in
     * addition to ``default_tags``. Notes:
     *
     * - Currently, Databricks allows at most 45 custom tags
     *
     * - Clusters can only reuse cloud resources if the resources' tags are a
     * subset of the cluster tags
     */
    custom_tags?: Record<string, string>;
    data_security_mode?: DataSecurityMode;
    access_mode?: AccessMode;
    /**
     * Tags that are added by Databricks regardless of any ``custom_tags``,
     * including:
     *
     * - Vendor: Databricks
     *
     * - Creator: <username_of_creator>
     *
     * - ClusterName: <name_of_cluster>
     *
     * - ClusterId: <id_of_cluster>
     *
     * - Name: <Databricks internal use>
     */
    default_tags?: Record<string, string>;
    /**
     * Node on which the Spark driver resides. The driver node contains the Spark
     * master and the Databricks application that manages the per-notebook Spark
     * REPLs.
     */
    driver?: SparkNode;
    /**
     * The optional ID of the instance pool for the driver of the cluster
     * belongs. The pool cluster uses the instance pool with id
     * (instance_pool_id) if the driver pool is not assigned.
     */
    driver_instance_pool_id?: string;
    /**
     * The node type of the Spark driver. Note that this field is optional; if
     * unset, the driver node type will be set as the same value as
     * `node_type_id` defined above.
     *
     * This field, along with node_type_id, should not be set if
     * virtual_cluster_size is set. If both driver_node_type_id, node_type_id,
     * and virtual_cluster_size are specified, driver_node_type_id and
     * node_type_id take precedence.
     */
    driver_node_type_id?: string;
    /**
     * The key of the spark version running in the dataplane. This is possibly
     * different from the spark_version (index 2). The spark_version is the raw
     * string provided by the user through API or UI, which could map to a
     * different effective_spark_version running in the dataplane, depending on
     * the cluster's instance type or the runtimeEngine parameter.
     */
    effective_spark_version?: string;
    /**
     * Autoscaling Local Storage: when enabled, this cluster will dynamically
     * acquire additional disk space when its Spark workers are running low on
     * disk space. This feature requires specific AWS permissions to function
     * correctly - refer to the User Guide for more details.
     */
    enable_elastic_disk?: boolean;
    /**
     * Whether to enable LUKS on cluster VMs' local disks
     */
    enable_local_disk_encryption?: boolean;
    /**
     * Nodes on which the Spark executors reside.
     */
    executors?: Array<SparkNode>;
    /**
     * Attributes related to clusters running on Google Cloud Platform. If not
     * specified at cluster creation, a set of default values will be used.
     */
    gcp_attributes?: GcpAttributes;
    /**
     * The optional ID of the instance pool to which the cluster belongs.
     */
    instance_pool_id?: string;
    /**
     * Port on which Spark JDBC server is listening, in the driver nod. No
     * service will be listeningon on this port in executor nodes.
     */
    jdbc_port?: number;
    /**
     * the timestamp that the cluster was started/restarted
     */
    last_restarted_time?: number;
    /**
     * Time when the cluster driver last lost its state (due to a restart or
     * driver failure).
     */
    last_state_loss_time?: number;
    /**
     * This field encodes, through a single value, the resources available to
     * each of the Spark nodes in this cluster. For example, the Spark nodes can
     * be provisioned and optimized for memory or compute intensive workloads. A
     * list of available node types can be retrieved by using the
     * :ref:`clusterClusterServicelistNodeTypes` API call.
     *
     * This field, along with driver_node_type_id, should not be set if
     * virtual_cluster_size is set. If both driver_node_type_id, node_type_id,
     * and virtual_cluster_size are specified, driver_node_type_id and
     * node_type_id take precedence.
     */
    node_type_id?: string;
    /**
     * Number of worker nodes that this cluster should have. A cluster has one
     * Spark Driver and ``num_workers`` Executors for a total of ``num_workers``
     * + 1 Spark nodes.
     *
     * Note: When reading the properties of a cluster, this field reflects the
     * desired number of workers rather than the actual current number of
     * workers. For instance, if a cluster is resized from 5 to 10 workers, this
     * field will immediately be updated to reflect the target size of 10
     * workers, whereas the workers listed in ``spark_info`` will gradually
     * increase from 5 to 10 as the new nodes are provisioned.
     */
    num_workers?: number;
    /**
     * The ID of the cluster policy used to create the cluster if applicable.
     */
    policy_id?: string;
    /**
     * Decides which runtime engine to be use, e.g. Standard vs. Photon. If
     * unspecified, the runtime engine is inferred from spark_version.
     */
    runtime_engine?: ClusterInfoRuntimeEngine;
    /**
     * Single user name if data_security_mode is `SINGLE_USER`
     */
    single_user_name?: string;
    /**
     * An object containing a set of optional, user-specified Spark configuration
     * key-value pairs. Users can also pass in a string of extra JVM options to
     * the driver and the executors via ``spark.driver.extraJavaOptions`` and
     * ``spark.executor.extraJavaOptions`` respectively.
     *
     * Example Spark confs: ``{"spark.speculation": true,
     * "spark.streaming.ui.retainedBatches": 5}`` or
     * ``{"spark.driver.extraJavaOptions": "-verbose:gc -XX:+PrintGCDetails"}``
     */
    spark_conf?: Record<string, string>;
    /**
     * A canonical SparkContext identifier. This value *does* change when the
     * Spark driver restarts. The pair `(cluster_id, spark_context_id)` is a
     * globally unique identifier over all Spark contexts.
     */
    spark_context_id?: number;
    /**
     * An object containing a set of optional, user-specified environment
     * variable key-value pairs. Please note that key-value pair of the form
     * (X,Y) will be exported as is (i.e., `export X='Y'`) while launching the
     * driver and workers. In order to specify an additional set of
     * ``SPARK_DAEMON_JAVA_OPTS``, we recommend appending them to
     * ``$SPARK_DAEMON_JAVA_OPTS`` as shown in the example. This ensures that all
     * default databricks managed environmental variables are included as well.
     */
    spark_env_vars?: Record<string, string>;
    /**
     * The Spark version of the cluster, e.g. "3.3.x-scala2.11". A list of
     * available Spark versions can be retrieved by using the
     * :ref:`clusterClusterServicelistSparkVersions` API call. This is the Spark
     * version provided from the user input (API/UI) and may be different from
     * the effective_spark_version, which is the spark version that is actually
     * run in the dataplane. See index 45 for more context.
     */
    spark_version?: string;
    /**
     * SSH public key contents that will be added to each Spark node in this
     * cluster. The corresponding private keys can be used to login with the user
     * name ``ubuntu`` on port ``2200``. Up to 10 keys can be specified.
     */
    ssh_public_keys?: Array<string>;
    /**
     * Time (in epoch milliseconds) when the cluster creation request was
     * received (when the cluster entered a ``PENDING`` state).
     */
    start_time?: number;
    /**
     * Current state of the cluster.
     */
    state?: ClusterInfoState;
    /**
     * A message associated with the most recent state transition (e.g., the
     * reason why the cluster entered a ``TERMINATED`` state).
     */
    state_message?: string;
    /**
     * Time (in epoch milliseconds) when the cluster was terminated, if
     * applicable.
     */
    terminated_time?: number;
    /**
     * Information about why the cluster was terminated. This field only appears
     * when the cluster is in a ``TERMINATING`` or ``TERMINATED`` state.
     */
    termination_reason?: TerminationReason;
    workload_type?: WorkloadType;
}

/**
 * Determines whether the cluster was created by a user through the UI, created
 * by the Databricks Jobs Scheduler, or through an API request. This is the same
 * as cluster_creator, but read only.
 */
export type ClusterInfoClusterSource =
    | "API"
    | "JOB"
    | "MODELS"
    | "PIPELINE"
    | "PIPELINE_MAINTENANCE"
    | "SQL"
    | "UI";

/**
 * Decides which runtime engine to be use, e.g. Standard vs. Photon. If
 * unspecified, the runtime engine is inferred from spark_version.
 */
export type ClusterInfoRuntimeEngine = "NULL" | "PHOTON" | "STANDARD";

/**
 * Current state of the cluster.
 */
export type ClusterInfoState =
    | "ERROR"
    | "PENDING"
    | "RESIZING"
    | "RESTARTING"
    | "RUNNING"
    | "TERMINATED"
    | "TERMINATING"
    | "UNKNOWN";

export interface ClusterLogConf {
    /**
     * destination needs to be provided. e.g. ``{ "dbfs" : { "destination" :
     * "dbfs:/home/cluster_log" } }``
     */
    dbfs?: DbfsStorageInfo;
    /**
     * destination and either region or endpoint should also be provided. e.g.
     * ``{ "s3": { "destination" : "s3://cluster_log_bucket/prefix", "region" :
     * "us-west-2" } }`` Cluster iam role is used to access s3, please make sure
     * the cluster iam role in ``instance_profile_arn`` has permission to write
     * data to the s3 destination.
     */
    s3?: S3StorageInfo;
}

export interface ClusterSize {
    /**
     * Parameters needed in order to automatically scale clusters up and down
     * based on load. Note: autoscaling works best with DB runtime versions 3.0
     * or later.
     */
    autoscale?: AutoScale;
    /**
     * Number of worker nodes that this cluster should have. A cluster has one
     * Spark Driver and ``num_workers`` Executors for a total of ``num_workers``
     * + 1 Spark nodes.
     *
     * Note: When reading the properties of a cluster, this field reflects the
     * desired number of workers rather than the actual current number of
     * workers. For instance, if a cluster is resized from 5 to 10 workers, this
     * field will immediately be updated to reflect the target size of 10
     * workers, whereas the workers listed in ``spark_info`` will gradually
     * increase from 5 to 10 as the new nodes are provisioned.
     */
    num_workers?: number;
}

export interface CreateCluster {
    /**
     * Note: This field won't be true for webapp requests. Only API users will
     * check this field.
     */
    apply_policy_default_values?: boolean;
    /**
     * Parameters needed in order to automatically scale clusters up and down
     * based on load. Note: autoscaling works best with DB runtime versions 3.0
     * or later.
     */
    autoscale?: AutoScale;
    /**
     * Automatically terminates the cluster after it is inactive for this time in
     * minutes. If not set, this cluster will not be automatically terminated. If
     * specified, the threshold must be between 10 and 10000 minutes. Users can
     * also set this value to 0 to explicitly disable automatic termination.
     */
    autotermination_minutes?: number;
    /**
     * Attributes related to clusters running on Amazon Web Services. If not
     * specified at cluster creation, a set of default values will be used.
     */
    aws_attributes?: AwsAttributes;
    /**
     * Attributes related to clusters running on Microsoft Azure. If not
     * specified at cluster creation, a set of default values will be used.
     */
    azure_attributes?: AzureAttributes;
    /**
     * The configuration for delivering spark logs to a long-term storage
     * destination. Two kinds of destinations (dbfs and s3) are supported. Only
     * one destination can be specified for one cluster. If the conf is given,
     * the logs will be delivered to the destination every ``5 mins``. The
     * destination of driver logs is ``$destination/$clusterId/driver``, while
     * the destination of executor logs is ``$destination/$clusterId/executor``.
     */
    cluster_log_conf?: ClusterLogConf;
    /**
     * Cluster name requested by the user. This doesn't have to be unique. If not
     * specified at creation, the cluster name will be an empty string.
     */
    cluster_name?: string;
    /**
     * Determines whether the cluster was created by a user through the UI,
     * created by the Databricks Jobs Scheduler, or through an API request. This
     * is the same as cluster_creator, but read only.
     */
    cluster_source?: CreateClusterClusterSource;
    /**
     * Additional tags for cluster resources. Databricks will tag all cluster
     * resources (e.g., AWS instances and EBS volumes) with these tags in
     * addition to ``default_tags``. Notes:
     *
     * - Currently, Databricks allows at most 45 custom tags
     *
     * - Clusters can only reuse cloud resources if the resources' tags are a
     * subset of the cluster tags
     */
    custom_tags?: Record<string, string>;
    /**
     * The optional ID of the instance pool for the driver of the cluster
     * belongs. The pool cluster uses the instance pool with id
     * (instance_pool_id) if the driver pool is not assigned.
     */
    driver_instance_pool_id?: string;
    /**
     * The node type of the Spark driver. Note that this field is optional; if
     * unset, the driver node type will be set as the same value as
     * `node_type_id` defined above.
     *
     * This field, along with node_type_id, should not be set if
     * virtual_cluster_size is set. If both driver_node_type_id, node_type_id,
     * and virtual_cluster_size are specified, driver_node_type_id and
     * node_type_id take precedence.
     */
    driver_node_type_id?: string;
    /**
     * The key of the spark version running in the dataplane. This is possibly
     * different from the spark_version (index 2). The spark_version is the raw
     * string provided by the user through API or UI, which could map to a
     * different effective_spark_version running in the dataplane, depending on
     * the cluster's instance type or the runtimeEngine parameter.
     */
    effective_spark_version?: string;
    /**
     * Autoscaling Local Storage: when enabled, this cluster will dynamically
     * acquire additional disk space when its Spark workers are running low on
     * disk space. This feature requires specific AWS permissions to function
     * correctly - refer to the User Guide for more details.
     */
    enable_elastic_disk?: boolean;
    /**
     * Whether to enable LUKS on cluster VMs' local disks
     */
    enable_local_disk_encryption?: boolean;
    /**
     * Attributes related to clusters running on Google Cloud Platform. If not
     * specified at cluster creation, a set of default values will be used.
     */
    gcp_attributes?: GcpAttributes;
    /**
     * The optional ID of the instance pool to which the cluster belongs.
     */
    instance_pool_id?: string;
    /**
     * This field encodes, through a single value, the resources available to
     * each of the Spark nodes in this cluster. For example, the Spark nodes can
     * be provisioned and optimized for memory or compute intensive workloads A
     * list of available node types can be retrieved by using the
     * :ref:`clusterClusterServicelistNodeTypes` API call.
     *
     * This field, along with driver_node_type_id, should not be set if
     * virtual_cluster_size is set. If both driver_node_type_id, node_type_id,
     * and virtual_cluster_size are specified, driver_node_type_id and
     * node_type_id take precedence.
     */
    node_type_id?: string;
    /**
     * Number of worker nodes that this cluster should have. A cluster has one
     * Spark Driver and ``num_workers`` Executors for a total of ``num_workers``
     * + 1 Spark nodes.
     *
     * Note: When reading the properties of a cluster, this field reflects the
     * desired number of workers rather than the actual current number of
     * workers. For instance, if a cluster is resized from 5 to 10 workers, this
     * field will immediately be updated to reflect the target size of 10
     * workers, whereas the workers listed in ``spark_info`` will gradually
     * increase from 5 to 10 as the new nodes are provisioned.
     */
    num_workers?: number;
    /**
     * The ID of the cluster policy used to create the cluster if applicable.
     */
    policy_id?: string;
    /**
     * Decides which runtime engine to be use, e.g. Standard vs. Photon. If
     * unspecified, the runtime engine is inferred from spark_version.
     */
    runtime_engine?: CreateClusterRuntimeEngine;
    /**
     * An object containing a set of optional, user-specified Spark configuration
     * key-value pairs. Users can also pass in a string of extra JVM options to
     * the driver and the executors via ``spark.driver.extraJavaOptions`` and
     * ``spark.executor.extraJavaOptions`` respectively.
     */
    spark_conf?: Record<string, string>;
    /**
     * An object containing a set of optional, user-specified environment
     * variable key-value pairs. Please note that key-value pair of the form
     * (X,Y) will be exported as is (i.e., ``export X='Y'``) while launching the
     * driver and workers.
     *
     * In order to specify an additional set of ``SPARK_DAEMON_JAVA_OPTS``, we
     * recommend appending them to ``$SPARK_DAEMON_JAVA_OPTS`` as shown in the
     * example below. This ensures that all default databricks managed
     * environmental variables are included as well.
     *
     * Example Spark environment variables: ``{"SPARK_WORKER_MEMORY": "28000m",
     * "SPARK_LOCAL_DIRS": "/local_disk0"}`` or ``{"SPARK_DAEMON_JAVA_OPTS":
     * "$SPARK_DAEMON_JAVA_OPTS -Dspark.shuffle.service.enabled=true"}``
     */
    spark_env_vars?: Record<string, string>;
    /**
     * The Spark version of the cluster, e.g. "3.3.x-scala2.11". A list of
     * available Spark versions can be retrieved by using the
     * :ref:`clusterClusterServicelistSparkVersions` API call. This is the Spark
     * version provided from the user input (API/UI) and may be different from
     * the effective_spark_version, which is the spark version that is actually
     * run in the dataplane. See index 45 for more context.
     */
    spark_version?: string;
    /**
     * SSH public key contents that will be added to each Spark node in this
     * cluster. The corresponding private keys can be used to login with the user
     * name ``ubuntu`` on port ``2200``. Up to 10 keys can be specified.
     */
    ssh_public_keys?: Array<string>;
    workload_type?: WorkloadType;
}

/**
 * Determines whether the cluster was created by a user through the UI, created
 * by the Databricks Jobs Scheduler, or through an API request. This is the same
 * as cluster_creator, but read only.
 */
export type CreateClusterClusterSource =
    | "API"
    | "JOB"
    | "MODELS"
    | "PIPELINE"
    | "PIPELINE_MAINTENANCE"
    | "SQL"
    | "UI";

export interface CreateClusterResponse {
    cluster_id?: string;
}

/**
 * Decides which runtime engine to be use, e.g. Standard vs. Photon. If
 * unspecified, the runtime engine is inferred from spark_version.
 */
export type CreateClusterRuntimeEngine = "NULL" | "PHOTON" | "STANDARD";

export interface DataPlaneEventDetails {
    /**
     * <needs content added>
     */
    event_type?: DataPlaneEventDetailsEventType;
    /**
     * <needs content added>
     */
    executor_failures?: number;
    /**
     * <needs content added>
     */
    host_id?: string;
    /**
     * <needs content added>
     */
    timestamp?: number;
}

/**
 * <needs content added>
 */
export type DataPlaneEventDetailsEventType =
    | "NODE_BLACKLISTED"
    | "NODE_EXCLUDED_DECOMMISSIONED";

export type DataSecurityMode =
    /**
     * This is mode where single user is enforced but no actual security feature enabled.
     */
    | "LEGACY_SINGLE_USER_STANDARD"
    /**
     * This mode is for users migrating from legacy Passthrough on high concurrency
     * clusters.
     */
    | "LEGACY_PASSTHROUGH"
    /**
     * This mode is for users migrating from legacy Passthrough on standard clusters.
     */
    | "LEGACY_SINGLE_USER"
    /**
     * This mode is for users migrating from legacy Table ACL clusters.
     */
    | "LEGACY_TABLE_ACL"
    /**
     * No security isolation for multiple users sharing the cluster. Data governance
     * features are not available in this mode.
     */
    | "NONE"
    /**
     * A secure cluster that can only be exclusively used by a single user specified
     * in `single_user_name`. Most programming languages, cluster features and data
     * governance features are available in this mode.
     */
    | "SINGLE_USER"
    /**
     * A secure cluster that can be shared by multiple users. Cluster users are fully isolated
     * so that they cannot see each other's data and credentials. Most data governance features
     * are supported in this mode. But programming languages and cluster features might be limited.
     */
    | "USER_ISOLATION"
    /**
     * Internal mode used by DBSQL endpoint clusters
     */
    | "INTERNAL_SQL";

/**
 * This describes an enum
 */
export type AccessMode =
    /**
     * No security isolation for multiple users sharing the cluster. Data governance features
     * are not available in this mode.
     */
    | "NO_ISOLATION"
    /**
     *  A secure cluster that can only be exclusively used by a single user specified in
     *``single_user_name``. Most programming languages, cluster features and data governance
     * features are available in this mode.
     */
    | "SINGLE_USER"
    /**
     * A secure cluster that can be shared by multiple users. Cluster users are fully isolated
     * so that they cannot see each other's data and credentials. Most data governance features
     * are supported in this mode. But programming languages and cluster features might be limited.
     */
    | "SHARED"
    /**
     * This mode is for users migrating from legacy Table ACL clusters.
     */
    | "LEGACY_SHARED_TABLE_ACL"
    /**
     * This mode is for users migrating from legacy Passthrough on high concurrency clusters.
     */
    | "LEGACY_SHARED_PASSTHROUGH"
    /**
     * Internal mode used by DBSQL endpoint clusters
     */
    | "INTERNAL_SQL"
    /**
     * This mode is for users migrating from legacy Passthrough on standard clusters.
     */
    | "LEGACY_SINGLE_USER_PASSTHROUGH"
    /**
     * This is mode where single user is enforced but no actual security feature enabled.
     */
    | "LEGACY_SINGLE_USER_STANDARD";

export interface DbfsStorageInfo {
    /**
     * dbfs destination, e.g. ``dbfs:/my/path``
     */
    destination?: string;
}

export interface DeleteCluster {
    /**
     * The cluster to be terminated.
     */
    cluster_id: string;
}

export interface EditCluster {
    /**
     * Note: This field won't be true for webapp requests. Only API users will
     * check this field.
     */
    apply_policy_default_values?: boolean;
    /**
     * Parameters needed in order to automatically scale clusters up and down
     * based on load. Note: autoscaling works best with DB runtime versions 3.0
     * or later.
     */
    autoscale?: AutoScale;
    /**
     * Automatically terminates the cluster after it is inactive for this time in
     * minutes. If not set, this cluster will not be automatically terminated. If
     * specified, the threshold must be between 10 and 10000 minutes. Users can
     * also set this value to 0 to explicitly disable automatic termination.
     */
    autotermination_minutes?: number;
    /**
     * Attributes related to clusters running on Amazon Web Services. If not
     * specified at cluster creation, a set of default values will be used.
     */
    aws_attributes?: AwsAttributes;
    /**
     * Attributes related to clusters running on Microsoft Azure. If not
     * specified at cluster creation, a set of default values will be used.
     */
    azure_attributes?: AzureAttributes;
    /**
     * <needs content added>
     */
    cluster_id: string;
    /**
     * The configuration for delivering spark logs to a long-term storage
     * destination. Two kinds of destinations (dbfs and s3) are supported. Only
     * one destination can be specified for one cluster. If the conf is given,
     * the logs will be delivered to the destination every ``5 mins``. The
     * destination of driver logs is ``$destination/$clusterId/driver``, while
     * the destination of executor logs is ``$destination/$clusterId/executor``.
     */
    cluster_log_conf?: ClusterLogConf;
    /**
     * Cluster name requested by the user. This doesn't have to be unique. If not
     * specified at creation, the cluster name will be an empty string.
     */
    cluster_name?: string;
    /**
     * Determines whether the cluster was created by a user through the UI,
     * created by the Databricks Jobs Scheduler, or through an API request. This
     * is the same as cluster_creator, but read only.
     */
    cluster_source?: EditClusterClusterSource;
    /**
     * Additional tags for cluster resources. Databricks will tag all cluster
     * resources (e.g., AWS instances and EBS volumes) with these tags in
     * addition to ``default_tags``. Notes:
     *
     * - Currently, Databricks allows at most 45 custom tags
     *
     * - Clusters can only reuse cloud resources if the resources' tags are a
     * subset of the cluster tags
     */
    custom_tags?: Record<string, string>;
    /**
     * The optional ID of the instance pool for the driver of the cluster
     * belongs. The pool cluster uses the instance pool with id
     * (instance_pool_id) if the driver pool is not assigned.
     */
    driver_instance_pool_id?: string;
    /**
     * The node type of the Spark driver. Note that this field is optional; if
     * unset, the driver node type will be set as the same value as
     * `node_type_id` defined above.
     *
     * This field, along with node_type_id, should not be set if
     * virtual_cluster_size is set. If both driver_node_type_id, node_type_id,
     * and virtual_cluster_size are specified, driver_node_type_id and
     * node_type_id take precedence.
     */
    driver_node_type_id?: string;
    /**
     * The key of the spark version running in the dataplane. This is possibly
     * different from the spark_version (index 2). The spark_version is the raw
     * string provided by the user through API or UI, which could map to a
     * different effective_spark_version running in the dataplane, depending on
     * the cluster's instance type or the runtimeEngine parameter.
     */
    effective_spark_version?: string;
    /**
     * Autoscaling Local Storage: when enabled, this cluster will dynamically
     * acquire additional disk space when its Spark workers are running low on
     * disk space. This feature requires specific AWS permissions to function
     * correctly - refer to the User Guide for more details.
     */
    enable_elastic_disk?: boolean;
    /**
     * Whether to enable LUKS on cluster VMs' local disks
     */
    enable_local_disk_encryption?: boolean;
    /**
     * Attributes related to clusters running on Google Cloud Platform. If not
     * specified at cluster creation, a set of default values will be used.
     */
    gcp_attributes?: GcpAttributes;
    /**
     * The optional ID of the instance pool to which the cluster belongs.
     */
    instance_pool_id?: string;
    /**
     * This field encodes, through a single value, the resources available to
     * each of the Spark nodes in this cluster. For example, the Spark nodes can
     * be provisioned and optimized for memory or compute intensive workloads A
     * list of available node types can be retrieved by using the
     * :ref:`clusterClusterServicelistNodeTypes` API call.
     *
     * This field, along with driver_node_type_id, should not be set if
     * virtual_cluster_size is set. If both driver_node_type_id, node_type_id,
     * and virtual_cluster_size are specified, driver_node_type_id and
     * node_type_id take precedence.
     */
    node_type_id?: string;
    /**
     * Number of worker nodes that this cluster should have. A cluster has one
     * Spark Driver and ``num_workers`` Executors for a total of ``num_workers``
     * + 1 Spark nodes.
     *
     * Note: When reading the properties of a cluster, this field reflects the
     * desired number of workers rather than the actual current number of
     * workers. For instance, if a cluster is resized from 5 to 10 workers, this
     * field will immediately be updated to reflect the target size of 10
     * workers, whereas the workers listed in ``spark_info`` will gradually
     * increase from 5 to 10 as the new nodes are provisioned.
     */
    num_workers?: number;
    /**
     * The ID of the cluster policy used to create the cluster if applicable.
     */
    policy_id?: string;
    /**
     * Decides which runtime engine to be use, e.g. Standard vs. Photon. If
     * unspecified, the runtime engine is inferred from spark_version.
     */
    runtime_engine?: EditClusterRuntimeEngine;
    /**
     * An object containing a set of optional, user-specified Spark configuration
     * key-value pairs. Users can also pass in a string of extra JVM options to
     * the driver and the executors via ``spark.driver.extraJavaOptions`` and
     * ``spark.executor.extraJavaOptions`` respectively.
     *
     * Example Spark confs: ``{"spark.speculation": true,
     * "spark.streaming.ui.retainedBatches": 5}`` or
     * ``{"spark.driver.extraJavaOptions": "-verbose:gc -XX:+PrintGCDetails"}``
     */
    spark_conf?: Record<string, string>;
    /**
     * An object containing a set of optional, user-specified environment
     * variable key-value pairs. Please note that key-value pair of the form
     * (X,Y) will be exported as is (i.e., ``export X='Y'``) while launching the
     * driver and workers.
     *
     * In order to specify an additional set of ``SPARK_DAEMON_JAVA_OPTS``, we
     * recommend appending them to ``$SPARK_DAEMON_JAVA_OPTS`` as shown in the
     * example below. This ensures that all default databricks managed
     * environmental variables are included as well.
     *
     * Example Spark environment variables: ``{"SPARK_WORKER_MEMORY": "28000m",
     * "SPARK_LOCAL_DIRS": "/local_disk0"}`` or ``{"SPARK_DAEMON_JAVA_OPTS":
     * "$SPARK_DAEMON_JAVA_OPTS -Dspark.shuffle.service.enabled=true"}``
     */
    spark_env_vars?: Record<string, string>;
    /**
     * The Spark version of the cluster, e.g. "3.3.x-scala2.11". A list of
     * available Spark versions can be retrieved by using the
     * :ref:`clusterClusterServicelistSparkVersions` API call. This is the Spark
     * version provided from the user input (API/UI) and may be different from
     * the effective_spark_version, which is the spark version that is actually
     * run in the dataplane. See index 45 for more context.
     */
    spark_version?: string;
    /**
     * SSH public key contents that will be added to each Spark node in this
     * cluster. The corresponding private keys can be used to login with the user
     * name ``ubuntu`` on port ``2200``. Up to 10 keys can be specified.
     */
    ssh_public_keys?: Array<string>;
    /**
     * <needs content added>
     */
    workload_type?: WorkloadType;
}

/**
 * Determines whether the cluster was created by a user through the UI, created
 * by the Databricks Jobs Scheduler, or through an API request. This is the same
 * as cluster_creator, but read only.
 */
export type EditClusterClusterSource =
    | "API"
    | "JOB"
    | "MODELS"
    | "PIPELINE"
    | "PIPELINE_MAINTENANCE"
    | "SQL"
    | "UI";

/**
 * Decides which runtime engine to be use, e.g. Standard vs. Photon. If
 * unspecified, the runtime engine is inferred from spark_version.
 */
export type EditClusterRuntimeEngine = "NULL" | "PHOTON" | "STANDARD";

export interface EventDetails {
    /**
     * * For created clusters, the attributes of the cluster. * For edited
     * clusters, the new attributes of the cluster.
     */
    attributes?: ClusterAttributes;
    /**
     * The cause of a change in target size.
     */
    cause?: EventDetailsCause;
    /**
     * The actual cluster size that was set in the cluster creation or edit.
     */
    cluster_size?: ClusterSize;
    /**
     * The current number of vCPUs in the cluster.
     */
    current_num_vcpus?: number;
    /**
     * The current number of nodes in the cluster.
     */
    current_num_workers?: number;
    /**
     * <needs content added>
     */
    did_not_expand_reason?: string;
    /**
     * Current disk size in bytes
     */
    disk_size?: number;
    /**
     * More details about the change in driver's state
     */
    driver_state_message?: string;
    /**
     * Whether or not a blocklisted node should be terminated. For
     * ClusterEventType NODE_BLACKLISTED.
     */
    enable_termination_for_node_blocklisted?: boolean;
    /**
     * <needs content added>
     */
    free_space?: number;
    /**
     * Instance Id where the event originated from
     */
    instance_id?: string;
    /**
     * Unique identifier of the specific job run associated with this cluster
     * event * For clusters created for jobs, this will be the same as the
     * cluster name
     */
    job_run_name?: string;
    /**
     * The cluster attributes before a cluster was edited.
     */
    previous_attributes?: ClusterAttributes;
    /**
     * The size of the cluster before an edit or resize.
     */
    previous_cluster_size?: ClusterSize;
    /**
     * Previous disk size in bytes
     */
    previous_disk_size?: number;
    /**
     * A termination reason: * On a TERMINATED event, this is the reason of the
     * termination. * On a RESIZE_COMPLETE event, this indicates the reason that
     * we failed to acquire some nodes.
     */
    reason?: TerminationReason;
    /**
     * The targeted number of vCPUs in the cluster.
     */
    target_num_vcpus?: number;
    /**
     * The targeted number of nodes in the cluster.
     */
    target_num_workers?: number;
    /**
     * The user that caused the event to occur. (Empty if it was done by the
     * control plane.)
     */
    user?: string;
}

/**
 * The cause of a change in target size.
 */
export type EventDetailsCause =
    | "AUTORECOVERY"
    | "AUTOSCALE"
    | "REPLACE_BAD_NODES"
    | "USER_REQUEST";

export interface GcpAttributes {
    /**
     * This field determines whether the spark executors will be scheduled to run
     * on preemptible VMs, on-demand VMs, or preemptible VMs with a fallback to
     * on-demand VMs if the former is unavailable.
     */
    availability?: GcpAttributesAvailability;
    /**
     * boot disk size in GB
     */
    boot_disk_size?: number;
    /**
     * If provided, the cluster will impersonate the google service account when
     * accessing gcloud services (like GCS). The google service account must have
     * previously been added to the Databricks environment by an account
     * administrator.
     */
    google_service_account?: string;
}

/**
 * This field determines whether the spark executors will be scheduled to run on
 * preemptible VMs, on-demand VMs, or preemptible VMs with a fallback to
 * on-demand VMs if the former is unavailable.
 */
export type GcpAttributesAvailability =
    | "ON_DEMAND_GCP"
    | "PREEMPTIBLE_GCP"
    | "PREEMPTIBLE_WITH_FALLBACK_GCP";

export interface GetEvents {
    /**
     * The ID of the cluster to retrieve events about.
     */
    cluster_id: string;
    /**
     * The end time in epoch milliseconds. If empty, returns events up to the
     * current time.
     */
    end_time?: number;
    /**
     * An optional set of event types to filter on. If empty, all event types are
     * returned.
     */
    event_types?: Array<GetEventsEventTypesItem>;
    /**
     * The maximum number of events to include in a page of events. Defaults to
     * 50, and maximum allowed value is 500.
     */
    limit?: number;
    /**
     * The offset in the result set. Defaults to 0 (no offset). When an offset is
     * specified and the results are requested in descending order, the end_time
     * field is required.
     */
    offset?: number;
    /**
     * The order to list events in; either "ASC" or "DESC". Defaults to "DESC".
     */
    order?: GetEventsOrder;
    /**
     * The start time in epoch milliseconds. If empty, returns events starting
     * from the beginning of time.
     */
    start_time?: number;
}

export type GetEventsEventTypesItem =
    | "AUTOSCALING_STATS_REPORT"
    | "CREATING"
    | "DBFS_DOWN"
    | "DID_NOT_EXPAND_DISK"
    | "DRIVER_HEALTHY"
    | "DRIVER_NOT_RESPONDING"
    | "DRIVER_UNAVAILABLE"
    | "EDITED"
    | "EXPANDED_DISK"
    | "FAILED_TO_EXPAND_DISK"
    | "INIT_SCRIPTS_FINISHED"
    | "INIT_SCRIPTS_STARTED"
    | "METASTORE_DOWN"
    | "NODE_BLACKLISTED"
    | "NODE_EXCLUDED_DECOMMISSIONED"
    | "NODES_LOST"
    | "PINNED"
    | "RESIZING"
    | "RESTARTING"
    | "RUNNING"
    | "SPARK_EXCEPTION"
    | "STARTING"
    | "TERMINATING"
    | "UNPINNED"
    | "UPSIZE_COMPLETED";

/**
 * The order to list events in; either "ASC" or "DESC". Defaults to "DESC".
 */
export type GetEventsOrder = "ASC" | "DESC";

export interface GetEventsResponse {
    /**
     * <content needs to be added>
     */
    events?: Array<ClusterEvent>;
    /**
     * The parameters required to retrieve the next page of events. Omitted if
     * there are no more events to read.
     */
    next_page?: GetEvents;
    /**
     * The total number of events filtered by the start_time, end_time, and
     * event_types.
     */
    total_count?: number;
}

export interface GetSparkVersionsResponse {
    /**
     * All the available Spark versions.
     */
    versions?: Array<SparkVersion>;
}

export interface ListAvailableZonesResponse {
    /**
     * The availability zone if no ``zone_id`` is provided in the cluster
     * creation request.
     */
    default_zone?: string;
    /**
     * The list of available zones (e.g., ['us-west-2c', 'us-east-2']).
     */
    zones?: Array<string>;
}

export interface ListClustersResponse {
    /**
     * <needs content added>
     */
    clusters?: Array<ClusterInfo>;
}

export interface ListNodeTypesResponse {
    /**
     * The list of available Spark node types.
     */
    node_types?: Array<NodeType>;
}

export interface LogAnalyticsInfo {
    /**
     * <needs content added>
     */
    log_analytics_primary_key?: string;
    /**
     * <needs content added>
     */
    log_analytics_workspace_id?: string;
}

export interface LogSyncStatus {
    /**
     * The timestamp of last attempt. If the last attempt fails,
     * ``last_exception`` will contain the exception in the last attempt.
     */
    last_attempted?: number;
    /**
     * The exception thrown in the last attempt, it would be null (omitted in the
     * response) if there is no exception in last attempted.
     */
    last_exception?: string;
}

export interface NodeInstanceType {
    instance_type_id?: string;
    local_disk_size_gb?: number;
    local_disks?: number;
    local_nvme_disk_size_gb?: number;
    local_nvme_disks?: number;
}

export interface NodeType {
    category?: string;
    /**
     * A string description associated with this node type, e.g., "r3.xlarge".
     */
    description: string;
    display_order?: number;
    /**
     * An identifier for the type of hardware that this node runs on, e.g.,
     * "r3.2xlarge" in AWS.
     */
    instance_type_id: string;
    /**
     * Whether the node type is deprecated. Non-deprecated node types offer
     * greater performance.
     */
    is_deprecated?: boolean;
    /**
     * AWS specific, whether this instance supports encryption in transit, used
     * for hipaa and pci workloads.
     */
    is_encrypted_in_transit?: boolean;
    is_graviton?: boolean;
    is_hidden?: boolean;
    is_io_cache_enabled?: boolean;
    /**
     * Memory (in MB) available for this node type.
     */
    memory_mb: number;
    node_info?: CloudProviderNodeInfo;
    node_instance_type?: NodeInstanceType;
    /**
     * Unique identifier for this node type.
     */
    node_type_id: string;
    /**
     * Number of CPU cores available for this node type. Note that this can be
     * fractional, e.g., 2.5 cores, if the the number of cores on a machine
     * instance is not divisible by the number of Spark nodes on that machine.
     */
    num_cores: number;
    num_gpus?: number;
    photon_driver_capable?: boolean;
    photon_worker_capable?: boolean;
    support_cluster_tags?: boolean;
    support_ebs_volumes?: boolean;
    support_port_forwarding?: boolean;
}

export interface PermanentDeleteCluster {
    /**
     * The cluster to be deleted.
     */
    cluster_id: string;
}

export interface PinCluster {
    /**
     * <needs content added>
     */
    cluster_id: string;
}

export interface ResizeCluster {
    /**
     * Parameters needed in order to automatically scale clusters up and down
     * based on load. Note: autoscaling works best with DB runtime versions 3.0
     * or later.
     */
    autoscale?: AutoScale;
    /**
     * The cluster to be resized.
     */
    cluster_id: string;
    /**
     * Number of worker nodes that this cluster should have. A cluster has one
     * Spark Driver and ``num_workers`` Executors for a total of ``num_workers``
     * + 1 Spark nodes.
     *
     * Note: When reading the properties of a cluster, this field reflects the
     * desired number of workers rather than the actual current number of
     * workers. For instance, if a cluster is resized from 5 to 10 workers, this
     * field will immediately be updated to reflect the target size of 10
     * workers, whereas the workers listed in ``spark_info`` will gradually
     * increase from 5 to 10 as the new nodes are provisioned.
     */
    num_workers?: number;
}

export interface RestartCluster {
    /**
     * The cluster to be started.
     */
    cluster_id: string;
    /**
     * <needs content added>
     */
    restart_user?: string;
}

export interface S3StorageInfo {
    /**
     * (Optional) Set canned access control list for the logs, e.g.
     * ``bucket-owner-full-control``. If ``canned_cal`` is set, please make sure
     * the cluster iam role has ``s3:PutObjectAcl`` permission on the destination
     * bucket and prefix. The full list of possible canned acl can be found at
     * http://docs.aws.amazon.com/AmazonS3/latest/dev/acl-overview.html#canned-acl.
     * Please also note that by default only the object owner gets full controls.
     * If you are using cross account role for writing data, you may want to set
     * ``bucket-owner-full-control`` to make bucket owner able to read the logs.
     */
    canned_acl?: string;
    /**
     * S3 destination, e.g. ``s3://my-bucket/some-prefix`` Note that logs will be
     * delivered using cluster iam role, please make sure you set cluster iam
     * role and the role has write access to the destination. Please also note
     * that you cannot use AWS keys to deliver logs.
     */
    destination?: string;
    /**
     * (Optional) Flag to enable server side encryption, ``false`` by default.
     */
    enable_encryption?: boolean;
    /**
     * (Optional) The encryption type, it could be ``sse-s3`` or ``sse-kms``. It
     * will be used only when encryption is enabled and the default type is
     * ``sse-s3``.
     */
    encryption_type?: string;
    /**
     * S3 endpoint, e.g. ``https://s3-us-west-2.amazonaws.com``. Either region or
     * endpoint needs to be set. If both are set, endpoint will be used.
     */
    endpoint?: string;
    /**
     * (Optional) Kms key which will be used if encryption is enabled and
     * encryption type is set to ``sse-kms``.
     */
    kms_key?: string;
    /**
     * S3 region, e.g. ``us-west-2``. Either region or endpoint needs to be set.
     * If both are set, endpoint will be used.
     */
    region?: string;
}

export interface SparkNode {
    /**
     * The private IP address of the host instance.
     */
    host_private_ip?: string;
    /**
     * Globally unique identifier for the host instance from the cloud provider.
     */
    instance_id?: string;
    /**
     * Attributes specific to AWS for a Spark node.
     */
    node_aws_attributes?: SparkNodeAwsAttributes;
    /**
     * Globally unique identifier for this node.
     */
    node_id?: string;
    /**
     * Private IP address (typically a 10.x.x.x address) of the Spark node. Note
     * that this is different from the private IP address of the host instance.
     */
    private_ip?: string;
    /**
     * Public DNS address of this node. This address can be used to access the
     * Spark JDBC server on the driver node. To communicate with the JDBC server,
     * traffic must be manually authorized by adding security group rules to the
     * "worker-unmanaged" security group via the AWS console.
     *
     * Actually it's the public DNS address of the host instance.
     */
    public_dns?: string;
    /**
     * The timestamp (in millisecond) when the Spark node is launched.
     *
     * The start_timestamp is set right before the container is being launched.
     * The timestamp when the container is placed on the ResourceManager, before
     * its launch and setup by the NodeDaemon. This timestamp is the same as the
     * creation timestamp in the database.
     */
    start_timestamp?: number;
}

export interface SparkNodeAwsAttributes {
    /**
     * Whether this node is on an Amazon spot instance.
     */
    is_spot?: boolean;
}

export interface SparkVersion {
    /**
     * Spark version key, for example "2.1.x-scala2.11". This is the value which
     * should be provided as the "spark_version" when creating a new cluster.
     * Note that the exact Spark version may change over time for a "wildcard"
     * version (i.e., "2.1.x-scala2.11" is a "wildcard" version) with minor bug
     * fixes.
     */
    key?: string;
    /**
     * A descriptive name for this Spark version, for example "Spark 2.1".
     */
    name?: string;
}

export interface StartCluster {
    /**
     * The cluster to be started.
     */
    cluster_id: string;
}

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

export interface UnpinCluster {
    /**
     * <needs content added>
     */
    cluster_id: string;
}

export interface WorkloadType {
    /**
     * defined what type of clients can use the cluster. E.g. Notebooks, Jobs
     */
    clients?: ClientsTypes;
}

export interface GetRequest {
    /**
     * The cluster about which to retrieve information.
     */
    cluster_id: string;
}

export interface ListRequest {
    /**
     * Filter clusters based on what type of client it can be used for. Could be
     * either NOTEBOOKS or JOBS. No input for this field will get all clusters in
     * the workspace without filtering on its supported client
     */
    can_use_client?: string;
}

export interface ChangeClusterOwnerResponse {}
export interface DeleteClusterResponse {}
export interface EditClusterResponse {}
export interface PermanentDeleteClusterResponse {}
export interface PinClusterResponse {}
export interface ResizeClusterResponse {}
export interface RestartClusterResponse {}
export interface StartClusterResponse {}
export interface UnpinClusterResponse {}
