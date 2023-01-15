/* eslint-disable @typescript-eslint/naming-convention */

// Code generated from OpenAPI specs by Databricks SDK Generator. DO NOT EDIT.

// all definitions in this file are in alphabetical order
export interface CreateInstancePool {
    /**
     * Attributes related to pool running on Amazon Web Services. If not
     * specified at pool creation, a set of default values will be used.
     */
    aws_attributes?: InstancePoolAwsAttributes;
    /**
     * Attributes related to pool running on Azure. If not specified at pool
     * creation, a set of default values will be used.
     */
    azure_attributes?: InstancePoolAzureAttributes;
    /**
     * Additional tags for pool resources. Databricks will tag all pool resources
     * (e.g., AWS instances and EBS volumes) with these tags in addition to
     * `default_tags`. Notes:
     *
     * - Currently, Databricks allows at most 45 custom tags
     */
    custom_tags?: Record<string, string>;
    /**
     * Defines the specification of the disks that will be attached to all spark
     * containers.
     */
    disk_spec?: DiskSpec;
    /**
     * Autoscaling Local Storage: when enabled, this instances in this pool will
     * dynamically acquire additional disk space when its Spark workers are
     * running low on disk space. In AWS, this feature requires specific AWS
     * permissions to function correctly - refer to the User Guide for more
     * details.
     */
    enable_elastic_disk?: boolean;
    /**
     * Automatically terminates the extra instances in the pool cache after they
     * are inactive for this time in minutes if min_idle_instances requirement is
     * already met. If not set, the extra pool instances will be automatically
     * terminated after a default timeout. If specified, the threshold must be
     * between 0 and 10000 minutes. Users can also set this value to 0 to
     * instantly remove idle instances from the cache if min cache size could
     * still hold.
     */
    idle_instance_autotermination_minutes?: number;
    /**
     * The fleet related setting to power the instance pool.
     */
    instance_pool_fleet_attributes?: InstancePoolFleetAttributes;
    /**
     * Pool name requested by the user. Pool name must be unique. Length must be
     * between 1 and 100 characters.
     */
    instance_pool_name: string;
    /**
     * Maximum number of outstanding instances to keep in the pool, including
     * both instances used by clusters and idle instances. Clusters that require
     * further instance provisioning will fail during upsize requests.
     */
    max_capacity?: number;
    /**
     * Minimum number of idle instances to keep in the instance pool
     */
    min_idle_instances?: number;
    /**
     * This field encodes, through a single value, the resources available to
     * each of the Spark nodes in this cluster. For example, the Spark nodes can
     * be provisioned and optimized for memory or compute intensive workloads. A
     * list of available node types can be retrieved by using the
     * :method:clusters/listNodeTypes API call.
     */
    node_type_id: string;
    /**
     * Custom Docker Image BYOC
     */
    preloaded_docker_images?: Array<DockerImage>;
    /**
     * A list of preloaded Spark image versions for the pool. Pool-backed
     * clusters started with the preloaded Spark version will start faster. A
     * list of available Spark versions can be retrieved by using the
     * :method:clusters/sparkVersions API call.
     */
    preloaded_spark_versions?: Array<string>;
}

export interface CreateInstancePoolResponse {
    /**
     * The ID of the created instance pool.
     */
    instance_pool_id?: string;
}

export interface DeleteInstancePool {
    /**
     * The instance pool to be terminated.
     */
    instance_pool_id: string;
}

export interface DiskSpec {
    /**
     * The number of disks launched for each instance: - This feature is only
     * enabled for supported node types. - Users can choose up to the limit of
     * the disks supported by the node type. - For node types with no OS disk, at
     * least one disk must be specified; otherwise, cluster creation will fail.
     *
     * If disks are attached, Databricks will configure Spark to use only the
     * disks for scratch storage, because heterogenously sized scratch devices
     * can lead to inefficient disk utilization. If no disks are attached,
     * Databricks will configure Spark to use instance store disks.
     *
     * Note: If disks are specified, then the Spark configuration
     * `spark.local.dir` will be overridden.
     *
     * Disks will be mounted at: - For AWS: `/ebs0`, `/ebs1`, and etc. - For
     * Azure: `/remote_volume0`, `/remote_volume1`, and etc.
     */
    disk_count?: number;
    disk_iops?: number;
    /**
     * The size of each disk (in GiB) launched for each instance. Values must
     * fall into the supported range for a particular instance type.
     *
     * For AWS: - General Purpose SSD: 100 - 4096 GiB - Throughput Optimized HDD:
     * 500 - 4096 GiB
     *
     * For Azure: - Premium LRS (SSD): 1 - 1023 GiB - Standard LRS (HDD): 1- 1023
     * GiB
     */
    disk_size?: number;
    disk_throughput?: number;
    /**
     * The type of disks that will be launched with this cluster.
     */
    disk_type?: DiskType;
}

export interface DiskType {
    azure_disk_volume_type?: DiskTypeAzureDiskVolumeType;
    ebs_volume_type?: DiskTypeEbsVolumeType;
}

export type DiskTypeAzureDiskVolumeType = "PREMIUM_LRS" | "STANDARD_LRS";

export type DiskTypeEbsVolumeType =
    | "GENERAL_PURPOSE_SSD"
    | "THROUGHPUT_OPTIMIZED_HDD";

export interface DockerBasicAuth {
    password?: string;
    username?: string;
}

export interface DockerImage {
    basic_auth?: DockerBasicAuth;
    /**
     * URL of the docker image.
     */
    url?: string;
}

export interface EditInstancePool {
    /**
     * Attributes related to pool running on Amazon Web Services. If not
     * specified at pool creation, a set of default values will be used.
     */
    aws_attributes?: InstancePoolAwsAttributes;
    /**
     * Attributes related to pool running on Azure. If not specified at pool
     * creation, a set of default values will be used.
     */
    azure_attributes?: InstancePoolAzureAttributes;
    /**
     * Additional tags for pool resources. Databricks will tag all pool resources
     * (e.g., AWS instances and EBS volumes) with these tags in addition to
     * `default_tags`. Notes:
     *
     * - Currently, Databricks allows at most 45 custom tags
     */
    custom_tags?: Record<string, string>;
    /**
     * Defines the specification of the disks that will be attached to all spark
     * containers.
     */
    disk_spec?: DiskSpec;
    /**
     * Autoscaling Local Storage: when enabled, this instances in this pool will
     * dynamically acquire additional disk space when its Spark workers are
     * running low on disk space. In AWS, this feature requires specific AWS
     * permissions to function correctly - refer to the User Guide for more
     * details.
     */
    enable_elastic_disk?: boolean;
    /**
     * Automatically terminates the extra instances in the pool cache after they
     * are inactive for this time in minutes if min_idle_instances requirement is
     * already met. If not set, the extra pool instances will be automatically
     * terminated after a default timeout. If specified, the threshold must be
     * between 0 and 10000 minutes. Users can also set this value to 0 to
     * instantly remove idle instances from the cache if min cache size could
     * still hold.
     */
    idle_instance_autotermination_minutes?: number;
    /**
     * The fleet related setting to power the instance pool.
     */
    instance_pool_fleet_attributes?: InstancePoolFleetAttributes;
    /**
     * Instance pool ID
     */
    instance_pool_id: string;
    /**
     * Pool name requested by the user. Pool name must be unique. Length must be
     * between 1 and 100 characters.
     */
    instance_pool_name: string;
    /**
     * Maximum number of outstanding instances to keep in the pool, including
     * both instances used by clusters and idle instances. Clusters that require
     * further instance provisioning will fail during upsize requests.
     */
    max_capacity?: number;
    /**
     * Minimum number of idle instances to keep in the instance pool
     */
    min_idle_instances?: number;
    /**
     * This field encodes, through a single value, the resources available to
     * each of the Spark nodes in this cluster. For example, the Spark nodes can
     * be provisioned and optimized for memory or compute intensive workloads. A
     * list of available node types can be retrieved by using the
     * :method:clusters/listNodeTypes API call.
     */
    node_type_id: string;
    /**
     * Custom Docker Image BYOC
     */
    preloaded_docker_images?: Array<DockerImage>;
    /**
     * A list of preloaded Spark image versions for the pool. Pool-backed
     * clusters started with the preloaded Spark version will start faster. A
     * list of available Spark versions can be retrieved by using the
     * :method:clusters/sparkVersions API call.
     */
    preloaded_spark_versions?: Array<string>;
}

export interface FleetLaunchTemplateOverride {
    /**
     * User-assigned preferred availability zone. It will adjust to the default
     * zone of the worker environment if the preferred zone does not exist in the
     * subnet.
     */
    availability_zone: string;
    instance_type: string;
    /**
     * The maximum price per unit hour that you are willing to pay for a Spot
     * Instance.
     */
    max_price?: number;
    /**
     * The priority for the launch template override. If AllocationStrategy is
     * set to prioritized, EC2 Fleet uses priority to determine which launch
     * template override or to use first in fulfilling On-Demand capacity. The
     * highest priority is launched first. Valid values are whole numbers
     * starting at 0. The lower the number, the higher the priority. If no number
     * is set, the launch template override has the lowest priority.
     */
    priority?: number;
}

export interface FleetOnDemandOption {
    /**
     * Only lowest-price and prioritized are allowed
     */
    allocation_strategy?: FleetOnDemandOptionAllocationStrategy;
    /**
     * The maximum amount per hour for On-Demand Instances that you're willing to
     * pay.
     */
    max_total_price?: number;
    /**
     * If you specify use-capacity-reservations-first, the fleet uses unused
     * Capacity Reservations to fulfill On-Demand capacity up to the target
     * On-Demand capacity. If multiple instance pools have unused Capacity
     * Reservations, the On-Demand allocation strategy (lowest-price or
     * prioritized) is applied. If the number of unused Capacity Reservations is
     * less than the On-Demand target capacity, the remaining On-Demand target
     * capacity is launched according to the On-Demand allocation strategy
     * (lowest-price or prioritized).
     */
    use_capacity_reservations_first?: boolean;
}

/**
 * Only lowest-price and prioritized are allowed
 */
export type FleetOnDemandOptionAllocationStrategy =
    | "CAPACITY_OPTIMIZED"
    | "DIVERSIFIED"
    | "LOWEST_PRICE"
    | "PRIORITIZED";

export interface FleetSpotOption {
    /**
     * lowest-price | diversified | capacity-optimized
     */
    allocation_strategy?: FleetSpotOptionAllocationStrategy;
    /**
     * The number of Spot pools across which to allocate your target Spot
     * capacity. Valid only when Spot Allocation Strategy is set to lowest-price.
     * EC2 Fleet selects the cheapest Spot pools and evenly allocates your target
     * Spot capacity across the number of Spot pools that you specify.
     */
    instance_pools_to_use_count?: number;
    /**
     * The maximum amount per hour for Spot Instances that you're willing to pay.
     */
    max_total_price?: number;
}

/**
 * lowest-price | diversified | capacity-optimized
 */
export type FleetSpotOptionAllocationStrategy =
    | "CAPACITY_OPTIMIZED"
    | "DIVERSIFIED"
    | "LOWEST_PRICE"
    | "PRIORITIZED";

/**
 * Get instance pool information
 */
export interface Get {
    /**
     * The canonical unique identifier for the instance pool.
     */
    instance_pool_id: string;
}

export interface GetInstancePool {
    /**
     * Attributes related to pool running on Amazon Web Services. If not
     * specified at pool creation, a set of default values will be used.
     */
    aws_attributes?: InstancePoolAwsAttributes;
    /**
     * Attributes related to pool running on Azure. If not specified at pool
     * creation, a set of default values will be used.
     */
    azure_attributes?: InstancePoolAzureAttributes;
    /**
     * Additional tags for pool resources. Databricks will tag all pool resources
     * (e.g., AWS instances and EBS volumes) with these tags in addition to
     * `default_tags`. Notes:
     *
     * - Currently, Databricks allows at most 45 custom tags
     */
    custom_tags?: Record<string, string>;
    /**
     * Tags that are added by Databricks regardless of any `custom_tags`,
     * including:
     *
     * - Vendor: Databricks
     *
     * - InstancePoolCreator: <user_id_of_creator>
     *
     * - InstancePoolName: <name_of_pool>
     *
     * - InstancePoolId: <id_of_pool>
     */
    default_tags?: Record<string, string>;
    /**
     * Defines the specification of the disks that will be attached to all spark
     * containers.
     */
    disk_spec?: DiskSpec;
    /**
     * Autoscaling Local Storage: when enabled, this instances in this pool will
     * dynamically acquire additional disk space when its Spark workers are
     * running low on disk space. In AWS, this feature requires specific AWS
     * permissions to function correctly - refer to the User Guide for more
     * details.
     */
    enable_elastic_disk?: boolean;
    /**
     * Automatically terminates the extra instances in the pool cache after they
     * are inactive for this time in minutes if min_idle_instances requirement is
     * already met. If not set, the extra pool instances will be automatically
     * terminated after a default timeout. If specified, the threshold must be
     * between 0 and 10000 minutes. Users can also set this value to 0 to
     * instantly remove idle instances from the cache if min cache size could
     * still hold.
     */
    idle_instance_autotermination_minutes?: number;
    /**
     * The fleet related setting to power the instance pool.
     */
    instance_pool_fleet_attributes?: InstancePoolFleetAttributes;
    /**
     * Canonical unique identifier for the pool.
     */
    instance_pool_id: string;
    /**
     * Pool name requested by the user. Pool name must be unique. Length must be
     * between 1 and 100 characters.
     */
    instance_pool_name?: string;
    /**
     * Maximum number of outstanding instances to keep in the pool, including
     * both instances used by clusters and idle instances. Clusters that require
     * further instance provisioning will fail during upsize requests.
     */
    max_capacity?: number;
    /**
     * Minimum number of idle instances to keep in the instance pool
     */
    min_idle_instances?: number;
    /**
     * This field encodes, through a single value, the resources available to
     * each of the Spark nodes in this cluster. For example, the Spark nodes can
     * be provisioned and optimized for memory or compute intensive workloads. A
     * list of available node types can be retrieved by using the
     * :method:clusters/listNodeTypes API call.
     */
    node_type_id?: string;
    /**
     * Custom Docker Image BYOC
     */
    preloaded_docker_images?: Array<DockerImage>;
    /**
     * A list of preloaded Spark image versions for the pool. Pool-backed
     * clusters started with the preloaded Spark version will start faster. A
     * list of available Spark versions can be retrieved by using the
     * :method:clusters/sparkVersions API call.
     */
    preloaded_spark_versions?: Array<string>;
    /**
     * Current state of the instance pool.
     */
    state?: InstancePoolState;
    /**
     * Usage statistics about the instance pool.
     */
    stats?: InstancePoolStats;
    /**
     * Status of failed pending instances in the pool.
     */
    status?: InstancePoolStatus;
}

export interface InstancePoolAndStats {
    /**
     * Attributes related to pool running on Amazon Web Services. If not
     * specified at pool creation, a set of default values will be used.
     */
    aws_attributes?: InstancePoolAwsAttributes;
    /**
     * Attributes related to pool running on Azure. If not specified at pool
     * creation, a set of default values will be used.
     */
    azure_attributes?: InstancePoolAzureAttributes;
    /**
     * Additional tags for pool resources. Databricks will tag all pool resources
     * (e.g., AWS instances and EBS volumes) with these tags in addition to
     * `default_tags`. Notes:
     *
     * - Currently, Databricks allows at most 45 custom tags
     */
    custom_tags?: Record<string, string>;
    /**
     * Tags that are added by Databricks regardless of any `custom_tags`,
     * including:
     *
     * - Vendor: Databricks
     *
     * - InstancePoolCreator: <user_id_of_creator>
     *
     * - InstancePoolName: <name_of_pool>
     *
     * - InstancePoolId: <id_of_pool>
     */
    default_tags?: Record<string, string>;
    /**
     * Defines the specification of the disks that will be attached to all spark
     * containers.
     */
    disk_spec?: DiskSpec;
    /**
     * Autoscaling Local Storage: when enabled, this instances in this pool will
     * dynamically acquire additional disk space when its Spark workers are
     * running low on disk space. In AWS, this feature requires specific AWS
     * permissions to function correctly - refer to the User Guide for more
     * details.
     */
    enable_elastic_disk?: boolean;
    /**
     * Automatically terminates the extra instances in the pool cache after they
     * are inactive for this time in minutes if min_idle_instances requirement is
     * already met. If not set, the extra pool instances will be automatically
     * terminated after a default timeout. If specified, the threshold must be
     * between 0 and 10000 minutes. Users can also set this value to 0 to
     * instantly remove idle instances from the cache if min cache size could
     * still hold.
     */
    idle_instance_autotermination_minutes?: number;
    /**
     * The fleet related setting to power the instance pool.
     */
    instance_pool_fleet_attributes?: InstancePoolFleetAttributes;
    /**
     * Canonical unique identifier for the pool.
     */
    instance_pool_id?: string;
    /**
     * Pool name requested by the user. Pool name must be unique. Length must be
     * between 1 and 100 characters.
     */
    instance_pool_name?: string;
    /**
     * Maximum number of outstanding instances to keep in the pool, including
     * both instances used by clusters and idle instances. Clusters that require
     * further instance provisioning will fail during upsize requests.
     */
    max_capacity?: number;
    /**
     * Minimum number of idle instances to keep in the instance pool
     */
    min_idle_instances?: number;
    /**
     * This field encodes, through a single value, the resources available to
     * each of the Spark nodes in this cluster. For example, the Spark nodes can
     * be provisioned and optimized for memory or compute intensive workloads. A
     * list of available node types can be retrieved by using the
     * :method:clusters/listNodeTypes API call.
     */
    node_type_id?: string;
    /**
     * Custom Docker Image BYOC
     */
    preloaded_docker_images?: Array<DockerImage>;
    /**
     * A list of preloaded Spark image versions for the pool. Pool-backed
     * clusters started with the preloaded Spark version will start faster. A
     * list of available Spark versions can be retrieved by using the
     * :method:clusters/sparkVersions API call.
     */
    preloaded_spark_versions?: Array<string>;
    /**
     * Current state of the instance pool.
     */
    state?: InstancePoolState;
    /**
     * Usage statistics about the instance pool.
     */
    stats?: InstancePoolStats;
    /**
     * Status of failed pending instances in the pool.
     */
    status?: InstancePoolStatus;
}

export interface InstancePoolAwsAttributes {
    /**
     * Availability type used for the spot nodes.
     *
     * The default value is defined by
     * InstancePoolConf.instancePoolDefaultAwsAvailability
     */
    availability?: InstancePoolAwsAttributesAvailability;
    /**
     * Calculates the bid price for AWS spot instances, as a percentage of the
     * corresponding instance type's on-demand price. For example, if this field
     * is set to 50, and the cluster needs a new `r3.xlarge` spot instance, then
     * the bid price is half of the price of on-demand `r3.xlarge` instances.
     * Similarly, if this field is set to 200, the bid price is twice the price
     * of on-demand `r3.xlarge` instances. If not specified, the default value is
     * 100. When spot instances are requested for this cluster, only spot
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
     * cluster creation, and if not specified, a default zone will be used. The
     * list of available zones as well as the default value can be found by using
     * the `List Zones`_ method.
     */
    zone_id?: string;
}

/**
 * Availability type used for the spot nodes.
 *
 * The default value is defined by
 * InstancePoolConf.instancePoolDefaultAwsAvailability
 */
export type InstancePoolAwsAttributesAvailability =
    | "ON_DEMAND"
    | "SPOT"
    | "SPOT_WITH_FALLBACK";

export interface InstancePoolAzureAttributes {
    /**
     * Shows the Availability type used for the spot nodes.
     *
     * The default value is defined by
     * InstancePoolConf.instancePoolDefaultAzureAvailability
     */
    availability?: InstancePoolAzureAttributesAvailability;
    /**
     * The default value and documentation here should be kept consistent with
     * CommonConf.defaultSpotBidMaxPrice.
     */
    spot_bid_max_price?: number;
}

/**
 * Shows the Availability type used for the spot nodes.
 *
 * The default value is defined by
 * InstancePoolConf.instancePoolDefaultAzureAvailability
 */
export type InstancePoolAzureAttributesAvailability =
    | "ON_DEMAND_AZURE"
    | "SPOT_AZURE"
    | "SPOT_WITH_FALLBACK_AZURE";

export interface InstancePoolFleetAttributes {
    fleet_on_demand_option?: FleetOnDemandOption;
    fleet_spot_option?: FleetSpotOption;
    launch_template_overrides?: Array<FleetLaunchTemplateOverride>;
}

/**
 * Current state of the instance pool.
 */
export type InstancePoolState = "ACTIVE" | "DELETED" | "STOPPED";

export interface InstancePoolStats {
    /**
     * Number of active instances in the pool that are NOT part of a cluster.
     */
    idle_count?: number;
    /**
     * Number of pending instances in the pool that are NOT part of a cluster.
     */
    pending_idle_count?: number;
    /**
     * Number of pending instances in the pool that are part of a cluster.
     */
    pending_used_count?: number;
    /**
     * Number of active instances in the pool that are part of a cluster.
     */
    used_count?: number;
}

export interface InstancePoolStatus {
    /**
     * List of error messages for the failed pending instances. The
     * pending_instance_errors follows FIFO with maximum length of the min_idle
     * of the pool. The pending_instance_errors is emptied once the number of
     * exiting available instances reaches the min_idle of the pool.
     */
    pending_instance_errors?: Array<PendingInstanceError>;
}

export interface ListInstancePools {
    instance_pools?: Array<InstancePoolAndStats>;
}

export interface PendingInstanceError {
    instance_id?: string;
    message?: string;
}

export interface EmptyResponse {}
