/* eslint-disable @typescript-eslint/naming-convention */

import {ApiClient} from "../api-client";

import * as delegate from "./delegate";

//
// Enums.
//

export type AwsAvailability = "SPOT" | "ON_DEMAND" | "SPOT_WITH_FALLBACK";

export type AzureAvailability =
    | "SPOT_AZURE"
    | "ON_DEMAND_AZURE"
    | "SPOT_WITH_FALLBACK_AZURE";

export type GcpAvailability =
    | "PREEMPTIBLE_GCP"
    | "ON_DEMAND_GCP"
    | "PREEMPTIBLE_WITH_FALLBACK_GCP";

export type ClusterSource =
    | "UI"
    | "JOB"
    | "API"
    | "SQL"
    | "MODELS"
    | "PIPELINE"
    | "PIPELINE_MAINTENANCE";

export type ClusterState =
    | "PENDING"
    | "RUNNING"
    | "RESTARTING"
    | "RESIZING"
    | "TERMINATING"
    | "TERMINATED"
    | "ERROR"
    | "UNKNOWN";

export type ListOrder = "DESC" | "ASC";

export type RuntimeEngine = "NULL" | "STANDARD" | "PHOTON";

export type ClusterClientRestriction = "NOTEBOOKS" | "JOBS";

export type FleetAllocationStrategy =
    | "LOWEST_PRICE"
    | "DIVERSIFIED"
    | "CAPACITY_OPTIMIZED"
    | "PRIORITIZED";

export type TerminationCode =
    | "UNKNOWN"
    | "USER_REQUEST"
    | "JOB_FINISHED"
    | "INACTIVITY"
    | "CLOUD_PROVIDER_SHUTDOWN"
    | "COMMUNICATION_LOST"
    | "CLOUD_PROVIDER_LAUNCH_FAILURE"
    | "INIT_SCRIPT_FAILURE"
    | "SPARK_STARTUP_FAILURE"
    | "INVALID_ARGUMENT"
    | "UNEXPECTED_LAUNCH_FAILURE"
    | "INTERNAL_ERROR"
    | "INSTANCE_UNREACHABLE"
    | "REQUEST_REJECTED"
    | "TRIAL_EXPIRED"
    | "DRIVER_UNREACHABLE"
    | "SPARK_ERROR"
    | "DRIVER_UNRESPONSIVE"
    | "METASTORE_COMPONENT_UNHEALTHY"
    | "DBFS_COMPONENT_UNHEALTHY"
    | "EXECUTION_COMPONENT_UNHEALTHY"
    | "AZURE_RESOURCE_MANAGER_THROTTLING"
    | "AZURE_RESOURCE_PROVIDER_THROTTLING"
    | "NETWORK_CONFIGURATION_FAILURE"
    | "CONTAINER_LAUNCH_FAILURE"
    | "INSTANCE_POOL_CLUSTER_FAILURE"
    | "SKIPPED_SLOW_NODES"
    | "ATTACH_PROJECT_FAILURE"
    | "UPDATE_INSTANCE_PROFILE_FAILURE"
    | "DATABASE_CONNECTION_FAILURE"
    | "REQUEST_THROTTLED"
    | "SELF_BOOTSTRAP_FAILURE"
    | "GLOBAL_INIT_SCRIPT_FAILURE"
    | "SLOW_IMAGE_DOWNLOAD"
    | "INVALID_SPARK_IMAGE"
    | "NPIP_TUNNEL_TOKEN_FAILURE"
    | "HIVE_METASTORE_PROVISIONING_FAILURE"
    | "AZURE_INVALID_DEPLOYMENT_TEMPLATE"
    | "AZURE_UNEXPECTED_DEPLOYMENT_TEMPLATE_FAILURE"
    | "SUBNET_EXHAUSTED_FAILURE"
    | "BOOTSTRAP_TIMEOUT"
    | "STORAGE_DOWNLOAD_FAILURE"
    | "CONTROL_PLANE_REQUEST_FAILURE"
    | "BOOTSTRAP_TIMEOUT_CLOUD_PROVIDER_EXCEPTION"
    | "AWS_INSUFFICIENT_INSTANCE_CAPACITY_FAILURE"
    | "DOCKER_IMAGE_PULL_FAILURE"
    | "AZURE_VNET_CONFIGURATION_FAILURE"
    | "NPIP_TUNNEL_SETUP_FAILURE"
    | "AWS_AUTHORIZATION_FAILURE"
    | "NEPHOS_RESOURCE_MANAGEMENT"
    | "STS_CLIENT_SETUP_FAILURE"
    | "SECURITY_DAEMON_REGISTRATION_EXCEPTION"
    | "AWS_REQUEST_LIMIT_EXCEEDED"
    | "AWS_INSUFFICIENT_FREE_ADDRESSES_IN_SUBNET_FAILURE"
    | "AWS_UNSUPPORTED_FAILURE"
    | "AZURE_QUOTA_EXCEEDED_EXCEPTION"
    | "AZURE_OPERATION_NOT_ALLOWED_EXCEPTION"
    | "NFS_MOUNT_FAILURE"
    | "K8S_AUTOSCALING_FAILURE"
    | "K8S_DBR_CLUSTER_LAUNCH_TIMEOUT"
    | "SPARK_IMAGE_DOWNLOAD_FAILURE"
    | "AZURE_VM_EXTENSION_FAILURE"
    | "WORKSPACE_CANCELLED_ERROR"
    | "AWS_MAX_SPOT_INSTANCE_COUNT_EXCEEDED_FAILURE"
    | "TEMPORARILY_UNAVAILABLE"
    | "WORKER_SETUP_FAILURE"
    | "IP_EXHAUSTION_FAILURE"
    | "GCP_QUOTA_EXCEEDED"
    | "CLOUD_PROVIDER_RESOURCE_STOCKOUT"
    | "GCP_SERVICE_ACCOUNT_DELETED"
    | "AZURE_BYOK_KEY_PERMISSION_FAILURE"
    | "SPOT_INSTANCE_TERMINATION"
    | "AZURE_EPHEMERAL_DISK_FAILURE"
    | "ABUSE_DETECTED"
    | "IMAGE_PULL_PERMISSION_DENIED";

export type TerminationParameter =
    | "username"
    | "aws_api_error_code"
    | "aws_instance_state_reason"
    | "aws_spot_request_status"
    | "aws_spot_request_fault_code"
    | "aws_impaired_status_details"
    | "aws_instance_status_event"
    | "aws_error_message"
    | "databricks_error_message"
    | "inactivity_duration_min"
    | "azure_error_code"
    | "azure_error_message"
    | "instance_id"
    | "instance_pool_id"
    | "instance_pool_error_code"
    | "invalid_spark_image_prefix"
    | "gcp_error_code"
    | "gcp_error_message";

export type TerminationType =
    | "SUCCESS"
    | "CLIENT_ERROR"
    | "SERVICE_FAULT"
    | "CLOUD_FAILURE";

export type ClusterEventType =
    | "CREATING"
    | "STARTING"
    | "RESTARTING"
    | "TERMINATING"
    | "EDITED"
    | "RUNNING"
    | "RESIZING"
    | "NODES_LOST"
    | "UPSIZE_COMPLETED"
    | "INIT_SCRIPTS_STARTED"
    | "INIT_SCRIPTS_FINISHED"
    | "DID_NOT_EXPAND_DISK"
    | "EXPANDED_DISK"
    | "FAILED_TO_EXPAND_DISK"
    | "DRIVER_HEALTHY"
    | "DRIVER_NOT_RESPONDING"
    | "DRIVER_UNAVAILABLE"
    | "SPARK_EXCEPTION"
    | "METASTORE_DOWN"
    | "DBFS_DOWN"
    | "AUTOSCALING_STATS_REPORT"
    | "NODE_BLACKLISTED"
    | "PINNED"
    | "UNPINNED"
    | "NODE_EXCLUDED_DECOMMISSIONED";

export type ResizeCause =
    | "AUTOSCALE"
    | "USER_REQUEST"
    | "AUTORECOVERY"
    | "REPLACE_BAD_NODES";

export type EbsVolumeType = "GENERAL_PURPOSE_SSD" | "THROUGHPUT_OPTIMIZED_HDD";

export type AzureDiskVolumeType = "PREMIUM_LRS" | "STANDARD_LRS";

export type InstancePoolState = "ACTIVE" | "STOPPED" | "DELETED";

//
// Subtypes used in request/response types.
//

export interface ClusterInfo {
    num_workers?: number;
    autoscale?: AutoScale;
    cluster_id?: string;
    creator_user_name?: string;
    driver?: SparkNode;
    executors?: Array<SparkNode>;
    spark_context_id?: number;
    jdbc_port?: number;
    cluster_name?: string;
    spark_version?: string;
    spark_conf?: Array<SparkConfPair>;
    aws_attributes?: AwsAttributes;
    azure_attributes?: AzureAttributes;
    gcp_attributes?: GcpAttributes;
    node_type_id?: string;
    driver_node_type_id?: string;
    ssh_public_keys?: Array<string>;
    custom_tags?: Array<ClusterTag>;
    cluster_log_conf?: ClusterLogConf;
    spark_env_vars?: Array<SparkEnvPair>;
    autotermination_minutes?: number;
    enable_elastic_disk?: boolean;
    cluster_source?: ClusterSource;
    instance_pool_id?: string;
    policy_id?: string;
    enable_local_disk_encryption?: boolean;
    driver_instance_pool_id?: string;
    workload_type?: WorkloadType;
    runtime_engine?: RuntimeEngine;
    effective_spark_version?: string;
    state?: ClusterState;
    state_message?: string;
    start_time?: number;
    terminated_time?: number;
    last_state_loss_time?: number;
    last_restarted_time?: number;
    cluster_memory_mb?: number;
    cluster_cores?: number;
    default_tags?: Array<ClusterTag>;
    cluster_log_status?: LogSyncStatus;
    termination_reason?: TerminationReason;
}

export interface ClusterAttributes {
    cluster_name?: string;
    spark_version?: string;
    spark_conf?: Array<SparkConfPair>;
    aws_attributes?: AwsAttributes;
    azure_attributes?: AzureAttributes;
    gcp_attributes?: GcpAttributes;
    node_type_id?: string;
    driver_node_type_id?: string;
    ssh_public_keys?: Array<string>;
    custom_tags?: Array<ClusterTag>;
    cluster_log_conf?: ClusterLogConf;
    spark_env_vars?: Array<SparkEnvPair>;
    autotermination_minutes?: number;
    enable_elastic_disk?: boolean;
    cluster_source?: ClusterSource;
    instance_pool_id?: string;
    policy_id?: string;
    enable_local_disk_encryption?: boolean;
    driver_instance_pool_id?: string;
    workload_type?: WorkloadType;
    runtime_engine?: RuntimeEngine;
    effective_spark_version?: string;
}

export interface ClusterTag {
    key?: string;
    value?: string;
}

export interface AwsAttributes {
    first_on_demand?: number;
    availability?: AwsAvailability;
    zone_id?: string;
    instance_profile_arn?: string;
    spot_bid_price_percent?: number;
    ebs_volume_type?: EbsVolumeType;
    ebs_volume_count?: number;
    ebs_volume_size?: number;
    ebs_volume_iops?: number;
    ebs_volume_throughput?: number;
}

export interface AzureAttributes {
    log_analytics_info?: LogAnalyticsInfo;
    first_on_demand?: number;
    availability?: AzureAvailability;
    spot_bid_max_price?: number;
}

export interface GcpAttributes {
    google_service_account?: string;
    boot_disk_size?: number;
    availability?: GcpAvailability;
}

export interface LogAnalyticsInfo {
    log_analytics_workspace_id?: string;
    log_analytics_primary_key?: string;
}

export interface ClusterSize {
    num_workers?: number;
    autoscale?: AutoScale;
}

export interface AutoScale {
    min_workers?: number;
    max_workers?: number;
}

export interface SparkInfo {}

export interface SparkNode {
    private_ip?: string;
    public_dns?: string;
    node_id?: string;
    instance_id?: string;
    start_timestamp?: number;
    node_aws_attributes?: SparkNodeAwsAttributes;
    host_private_ip?: string;
}

export interface SparkNodeAwsAttributes {
    is_spot?: boolean;
}

export interface SparkVersion {
    key?: string;
    name?: string;
}

export interface SparkConfPair {
    key?: string;
    value?: string;
}

export interface SparkEnvPair {
    key?: string;
    value?: string;
}

export interface DbfsStorageInfo {
    destination?: string;
}

export interface S3StorageInfo {
    destination?: string;
    region?: string;
    endpoint?: string;
    enable_encryption?: boolean;
    encryption_type?: string;
    kms_key?: string;
    canned_acl?: string;
}

export interface ClusterLogConf {
    dbfs?: DbfsStorageInfo;
    s3?: S3StorageInfo;
}

export interface LogSyncStatus {
    last_attempted?: number;
    last_exception?: string;
}

export interface WorkloadType {
    clients?: ClientsTypes;
}

export interface ClientsTypes {
    notebooks?: boolean;
    jobs?: boolean;
}

export interface GetInstance {}

export interface FleetSpotOption {
    allocation_strategy?: FleetAllocationStrategy;
    instance_pools_to_use_count?: number;
    max_total_price?: number;
}

export interface FleetOnDemandOption {
    allocation_strategy?: FleetAllocationStrategy;
    use_capacity_reservations_first?: boolean;
    max_total_price?: number;
}

export interface FleetLaunchTemplateOverride {
    availability_zone: string;
    instance_type: string;
    max_price?: number;
    priority?: number;
}

export interface InstancePoolFleetAttributes {
    fleet_spot_option?: FleetSpotOption;
    fleet_on_demand_option?: FleetOnDemandOption;
    launch_template_overrides?: Array<FleetLaunchTemplateOverride>;
}

export interface Policy {}

export interface TerminationReason {
    code?: TerminationCode;
    type?: TerminationType;
    parameters?: Array<ParameterPair>;
}

export interface ParameterPair {
    key?: TerminationParameter;
    value?: string;
}

export interface InstancePoolAndStats {
    instance_pool_name?: string;
    min_idle_instances?: number;
    max_capacity?: number;
    aws_attributes?: InstancePoolAwsAttributes;
    node_type_id?: string;
    custom_tags?: Array<ClusterTag>;
    idle_instance_autotermination_minutes?: number;
    enable_elastic_disk?: boolean;
    disk_spec?: DiskSpec;
    preloaded_docker_images?: Array<DockerImage>;
    preloaded_spark_versions?: Array<string>;
    azure_attributes?: InstancePoolAzureAttributes;
    instance_pool_id?: string;
    default_tags?: Array<ClusterTag>;
    state?: InstancePoolState;
    stats?: InstancePoolStats;
    status?: InstancePoolStatus;
}

export interface ClusterEvent {
    cluster_id: string;
    timestamp?: number;
    type?: ClusterEventType;
    details?: EventDetails;
    data_plane_event_details?: any;
}

export interface EventDetails {
    current_num_workers?: number;
    target_num_workers?: number;
    previous_attributes?: ClusterAttributes;
    attributes?: ClusterAttributes;
    previous_cluster_size?: ClusterSize;
    cluster_size?: ClusterSize;
    cause?: ResizeCause;
    reason?: TerminationReason;
    user?: string;
    previous_disk_size?: number;
    disk_size?: number;
    free_space?: number;
    instance_id?: string;
    did_not_expand_reason?: string;
    driver_state_message?: string;
    job_run_name?: string;
    enable_termination_for_node_blocklisted?: boolean;
    current_num_vcpus?: number;
    target_num_vcpus?: number;
}

export interface EbsVolume {}

export interface AzureDiskVolume {}

export interface NodeType {
    node_type_id: string;
    memory_mb: number;
    num_cores: number;
    description: string;
    instance_type_id: string;
    is_deprecated?: boolean;
    is_encrypted_in_transit?: boolean;
}

export interface DiskSpec {
    disk_type?: DiskType;
    disk_count?: number;
    disk_size?: number;
    disk_iops?: number;
    disk_throughput?: number;
}

export interface DiskType {
    ebs_volume_type?: EbsVolumeType;
    azure_disk_volume_type?: AzureDiskVolumeType;
}

export interface DockerImage {
    basic_auth?: DockerBasicAuth;
    url?: string;
}

export interface DockerBasicAuth {
    username?: string;
    password?: string;
}

export interface InstancePool {}

export interface InstancePoolAwsAttributes {
    availability?: AwsAvailability;
    zone_id?: string;
    spot_bid_price_percent?: number;
}

export interface InstancePoolAzureAttributes {
    availability?: AzureAvailability;
    spot_bid_max_price?: number;
}

export interface InstancePoolStats {
    used_count?: number;
    idle_count?: number;
    pending_used_count?: number;
    pending_idle_count?: number;
}

export interface InstancePoolStatus {
    pending_instance_errors?: Array<PendingInstanceError>;
}

export interface PendingInstanceError {
    instance_id?: string;
    message?: string;
}

//
// Request/response types.
//

export interface ListClustersRequest {
    can_use_client?: ClusterClientRestriction;
}

export interface ListClustersResponse {
    clusters?: Array<ClusterInfo>;
}

export interface CreateClusterRequest {
    num_workers?: number;
    autoscale?: AutoScale;
    cluster_name?: string;
    spark_version?: string;
    spark_conf?: Array<SparkConfPair>;
    aws_attributes?: AwsAttributes;
    azure_attributes?: AzureAttributes;
    gcp_attributes?: GcpAttributes;
    node_type_id?: string;
    driver_node_type_id?: string;
    ssh_public_keys?: Array<string>;
    custom_tags?: Array<ClusterTag>;
    cluster_log_conf?: ClusterLogConf;
    spark_env_vars?: Array<SparkEnvPair>;
    autotermination_minutes?: number;
    enable_elastic_disk?: boolean;
    cluster_source?: ClusterSource;
    instance_pool_id?: string;
    policy_id?: string;
    enable_local_disk_encryption?: boolean;
    driver_instance_pool_id?: string;
    workload_type?: WorkloadType;
    runtime_engine?: RuntimeEngine;
    effective_spark_version?: string;
    apply_policy_default_values?: boolean;
}

export interface CreateClusterResponse {
    cluster_id?: string;
}

export interface StartClusterRequest {
    cluster_id: string;
}

export interface StartClusterResponse {}

export interface GetSparkVersionsRequest {}

export interface GetSparkVersionsResponse {
    versions?: Array<SparkVersion>;
}

export interface DeleteClusterRequest {
    cluster_id: string;
}

export interface DeleteClusterResponse {}

export interface PermanentDeleteClusterRequest {
    cluster_id: string;
}

export interface PermanentDeleteClusterResponse {}

export interface RestartClusterRequest {
    cluster_id: string;
    restart_user?: string;
}

export interface RestartClusterResponse {}

export interface ResizeClusterRequest {
    num_workers?: number;
    autoscale?: AutoScale;
    cluster_id: string;
}

export interface ResizeClusterResponse {}

export interface EditClusterRequest {
    num_workers?: number;
    autoscale?: AutoScale;
    cluster_id: string;
    cluster_name?: string;
    spark_version?: string;
    spark_conf?: Array<SparkConfPair>;
    aws_attributes?: AwsAttributes;
    azure_attributes?: AzureAttributes;
    gcp_attributes?: GcpAttributes;
    node_type_id?: string;
    driver_node_type_id?: string;
    ssh_public_keys?: Array<string>;
    custom_tags?: Array<ClusterTag>;
    cluster_log_conf?: ClusterLogConf;
    spark_env_vars?: Array<SparkEnvPair>;
    autotermination_minutes?: number;
    enable_elastic_disk?: boolean;
    cluster_source?: ClusterSource;
    instance_pool_id?: string;
    policy_id?: string;
    enable_local_disk_encryption?: boolean;
    driver_instance_pool_id?: string;
    workload_type?: WorkloadType;
    runtime_engine?: RuntimeEngine;
    effective_spark_version?: string;
    apply_policy_default_values?: boolean;
}

export interface EditClusterResponse {}

export interface ChangeClusterOwnerRequest {
    cluster_id: string;
    owner_username?: string;
}

export interface ChangeClusterOwnerResponse {}

export interface GetClusterRequest {
    cluster_id: string;
}

export interface GetClusterResponse {
    num_workers?: number;
    autoscale?: AutoScale;
    cluster_id?: string;
    creator_user_name?: string;
    driver?: SparkNode;
    executors?: Array<SparkNode>;
    spark_context_id?: number;
    jdbc_port?: number;
    cluster_name?: string;
    spark_version?: string;
    spark_conf?: Array<SparkConfPair>;
    aws_attributes?: AwsAttributes;
    azure_attributes?: AzureAttributes;
    gcp_attributes?: GcpAttributes;
    node_type_id?: string;
    driver_node_type_id?: string;
    ssh_public_keys?: Array<string>;
    custom_tags?: Array<ClusterTag>;
    cluster_log_conf?: ClusterLogConf;
    spark_env_vars?: Array<SparkEnvPair>;
    autotermination_minutes?: number;
    enable_elastic_disk?: boolean;
    cluster_source?: ClusterSource;
    instance_pool_id?: string;
    policy_id?: string;
    enable_local_disk_encryption?: boolean;
    driver_instance_pool_id?: string;
    workload_type?: WorkloadType;
    runtime_engine?: RuntimeEngine;
    effective_spark_version?: string;
    state?: ClusterState;
    state_message?: string;
    start_time?: number;
    terminated_time?: number;
    last_state_loss_time?: number;
    last_restarted_time?: number;
    cluster_memory_mb?: number;
    cluster_cores?: number;
    default_tags?: Array<ClusterTag>;
    cluster_log_status?: LogSyncStatus;
    termination_reason?: TerminationReason;
}

export interface PinClusterRequest {
    cluster_id: string;
}

export interface PinClusterResponse {}

export interface UnpinClusterRequest {
    cluster_id: string;
}

export interface UnpinClusterResponse {}

export interface ListNodeTypesRequest {}

export interface ListNodeTypesResponse {
    success?: delegate.CpalSuccessResponse;
    failure?: delegate.CpalFailureResponse;
    node_types?: Array<NodeType>;
}

export interface ListAvailableZonesRequest {}

export interface ListAvailableZonesResponse {
    zones?: Array<string>;
    default_zone?: string;
}

export interface GetEventsRequest {
    cluster_id: string;
    start_time?: number;
    end_time?: number;
    order?: ListOrder;
    event_types?: Array<ClusterEventType>;
    offset?: number;
    limit?: number;
}

export interface GetEventsResponse {
    events?: Array<ClusterEvent>;
    next_page?: GetEventsRequest;
    total_count?: number;
}

export class ClusterService {
    readonly client: ApiClient;

    constructor(client: ApiClient) {
        this.client = client;
    }

    async listClusters(
        request: ListClustersRequest
    ): Promise<ListClustersResponse> {
        return (await this.client.request(
            "/api/2.0/clusters/list",
            "GET",
            request
        )) as ListClustersResponse;
    }

    async create(
        request: CreateClusterRequest
    ): Promise<CreateClusterResponse> {
        return (await this.client.request(
            "/api/2.0/clusters/create",
            "POST",
            request
        )) as CreateClusterResponse;
    }

    async start(request: StartClusterRequest): Promise<StartClusterResponse> {
        return (await this.client.request(
            "/api/2.0/clusters/start",
            "POST",
            request
        )) as StartClusterResponse;
    }

    async listSparkVersions(
        request: GetSparkVersionsRequest
    ): Promise<GetSparkVersionsResponse> {
        return (await this.client.request(
            "/api/2.0/clusters/spark-versions",
            "GET",
            request
        )) as GetSparkVersionsResponse;
    }

    async delete(
        request: DeleteClusterRequest
    ): Promise<DeleteClusterResponse> {
        return (await this.client.request(
            "/api/2.0/clusters/delete",
            "POST",
            request
        )) as DeleteClusterResponse;
    }

    async permanentDelete(
        request: PermanentDeleteClusterRequest
    ): Promise<PermanentDeleteClusterResponse> {
        return (await this.client.request(
            "/api/2.0/clusters/permanent-delete",
            "POST",
            request
        )) as PermanentDeleteClusterResponse;
    }

    async restart(
        request: RestartClusterRequest
    ): Promise<RestartClusterResponse> {
        return (await this.client.request(
            "/api/2.0/clusters/restart",
            "POST",
            request
        )) as RestartClusterResponse;
    }

    async resize(
        request: ResizeClusterRequest
    ): Promise<ResizeClusterResponse> {
        return (await this.client.request(
            "/api/2.0/clusters/resize",
            "POST",
            request
        )) as ResizeClusterResponse;
    }

    async edit(request: EditClusterRequest): Promise<EditClusterResponse> {
        return (await this.client.request(
            "/api/2.0/clusters/edit",
            "POST",
            request
        )) as EditClusterResponse;
    }

    async changeClusterOwner(
        request: ChangeClusterOwnerRequest
    ): Promise<ChangeClusterOwnerResponse> {
        return (await this.client.request(
            "/api/2.0/clusters/change-owner",
            "POST",
            request
        )) as ChangeClusterOwnerResponse;
    }

    async get(request: GetClusterRequest): Promise<GetClusterResponse> {
        return (await this.client.request(
            "/api/2.0/clusters/get",
            "GET",
            request
        )) as GetClusterResponse;
    }

    async pin(request: PinClusterRequest): Promise<PinClusterResponse> {
        return (await this.client.request(
            "/api/2.0/clusters/pin",
            "POST",
            request
        )) as PinClusterResponse;
    }

    async unpin(request: UnpinClusterRequest): Promise<UnpinClusterResponse> {
        return (await this.client.request(
            "/api/2.0/clusters/unpin",
            "POST",
            request
        )) as UnpinClusterResponse;
    }

    async listNodeTypes(
        request: ListNodeTypesRequest
    ): Promise<ListNodeTypesResponse> {
        return (await this.client.request(
            "/api/2.0/clusters/list-node-types",
            "GET",
            request
        )) as ListNodeTypesResponse;
    }

    async listAvailableZones(
        request: ListAvailableZonesRequest
    ): Promise<ListAvailableZonesResponse> {
        return (await this.client.request(
            "/api/2.0/clusters/list-zones",
            "GET",
            request
        )) as ListAvailableZonesResponse;
    }

    async getEvents(request: GetEventsRequest): Promise<GetEventsResponse> {
        return (await this.client.request(
            "/api/2.0/clusters/events",
            "POST",
            request
        )) as GetEventsResponse;
    }
}
