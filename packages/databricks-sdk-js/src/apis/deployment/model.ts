/* eslint-disable @typescript-eslint/naming-convention */

// Code generated from OpenAPI specs by Databricks SDK Generator. DO NOT EDIT.

// all definitions in this file are in alphabetical order
export interface AwsCredentials {
    sts_role?: StsRole;
}

export interface AwsKeyInfo {
    /**
     * The AWS KMS key alias.
     */
    key_alias?: string;
    /**
     * The AWS KMS key's Amazon Resource Name (ARN).
     */
    key_arn: string;
    /**
     * The AWS KMS key region.
     */
    key_region: string;
    /**
     * This field applies only if the `use_cases` property includes `STORAGE`. If
     * this is set to `true` or omitted, the key is also used to encrypt cluster
     * EBS volumes. If you do not want to use this key for encrypting EBS
     * volumes, set to `false`.
     */
    reuse_key_for_cluster_volumes?: boolean;
}

/**
 * The general workspace configurations that are specific to cloud providers.
 */
export interface CloudResourceContainer {
    /**
     * The general workspace configurations that are specific to Google Cloud.
     */
    gcp?: CustomerFacingGcpCloudResourceContainer;
}

export interface CreateAwsKeyInfo {
    /**
     * The AWS KMS key alias.
     */
    key_alias?: string;
    /**
     * The AWS KMS key's Amazon Resource Name (ARN). Note that the key's AWS
     * region is inferred from the ARN.
     */
    key_arn: string;
    /**
     * This field applies only if the `use_cases` property includes `STORAGE`. If
     * this is set to `true` or omitted, the key is also used to encrypt cluster
     * EBS volumes. To not use this key also for encrypting EBS volumes, set this
     * to `false`.
     */
    reuse_key_for_cluster_volumes?: boolean;
}

export interface CreateCredentialAwsCredentials {
    sts_role?: CreateCredentialStsRole;
}

export interface CreateCredentialRequest {
    aws_credentials: CreateCredentialAwsCredentials;
    /**
     * The human-readable name of the credential configuration object.
     */
    credentials_name: string;
}

export interface CreateCredentialStsRole {
    /**
     * The Amazon Resource Name (ARN) of the cross account role.
     */
    role_arn?: string;
}

export interface CreateCustomerManagedKeyRequest {
    aws_key_info: CreateAwsKeyInfo;
    /**
     * The cases that the key can be used for.
     */
    use_cases: Array<KeyUseCase>;
}

export interface CreateNetworkRequest {
    /**
     * The Google Cloud specific information for this network (for example, the
     * VPC ID, subnet ID, and secondary IP ranges).
     */
    gcp_network_info?: GcpNetworkInfo;
    /**
     * The human-readable name of the network configuration.
     */
    network_name: string;
    /**
     * IDs of one to five security groups associated with this network. Security
     * group IDs **cannot** be used in multiple network configurations.
     */
    security_group_ids?: Array<string>;
    /**
     * IDs of at least two subnets associated with this network. Subnet IDs
     * **cannot** be used in multiple network configurations.
     */
    subnet_ids?: Array<string>;
    /**
     * If specified, contains the VPC endpoints used to allow cluster
     * communication from this VPC over [AWS PrivateLink].
     *
     * [AWS PrivateLink]: https://aws.amazon.com/privatelink/
     */
    vpc_endpoints?: NetworkVpcEndpoints;
    /**
     * The ID of the VPC associated with this network. VPC IDs can be used in
     * multiple network configurations.
     */
    vpc_id?: string;
}

export interface CreateStorageConfigurationRequest {
    /**
     * Root S3 bucket information.
     */
    root_bucket_info: RootBucketInfo;
    /**
     * The human-readable name of the storage configuration.
     */
    storage_configuration_name: string;
}

export interface CreateVpcEndpointRequest {
    /**
     * The ID of the VPC endpoint object in AWS.
     */
    aws_vpc_endpoint_id: string;
    /**
     * The AWS region in which this VPC endpoint object exists.
     */
    region: string;
    /**
     * The human-readable name of the storage configuration.
     */
    vpc_endpoint_name: string;
}

export interface CreateWorkspaceRequest {
    /**
     * The AWS region of the workspace's data plane.
     */
    aws_region?: string;
    /**
     * The cloud provider which the workspace uses. For Google Cloud workspaces,
     * always set this field to `gcp`.
     */
    cloud?: string;
    /**
     * The general workspace configurations that are specific to cloud providers.
     */
    cloud_resource_container?: CloudResourceContainer;
    /**
     * ID of the workspace's credential configuration object.
     */
    credentials_id?: string;
    /**
     * The deployment name defines part of the subdomain for the workspace. The
     * workspace URL for web application and REST APIs is
     * `<workspace-deployment-name>.cloud.databricks.com`. For example, if the
     * deployment name is `abcsales`, your workspace URL will be
     * `https://abcsales.cloud.databricks.com`. Hyphens are allowed. This
     * property supports only the set of characters that are allowed in a
     * subdomain.
     *
     * If your account has a non-empty deployment name prefix at workspace
     * creation time, the workspace deployment name changes so that the beginning
     * has the account prefix and a hyphen. For example, if your account's
     * deployment prefix is `acme` and the workspace deployment name is
     * `workspace-1`, the `deployment_name` field becomes `acme-workspace-1` and
     * that is the value that is returned in JSON responses for the
     * `deployment_name` field. The workspace URL is
     * `acme-workspace-1.cloud.databricks.com`.
     *
     * If your account has a non-empty deployment name prefix and you set
     * `deployment_name` to the reserved keyword `EMPTY`, `deployment_name` is
     * just the account prefix only. For example, if your account's deployment
     * prefix is `acme` and the workspace deployment name is `EMPTY`,
     * `deployment_name` becomes `acme` only and the workspace URL is
     * `acme.cloud.databricks.com`.
     *
     * Contact your Databricks representatives to add an account deployment name
     * prefix to your account. If you do not have a deployment name prefix, the
     * special deployment name value `EMPTY` is invalid.
     *
     * This value must be unique across all non-deleted deployments across all
     * AWS regions.
     *
     * If a new workspace omits this property, the server generates a unique
     * deployment name for you with the pattern `dbc-xxxxxxxx-xxxx`.
     */
    deployment_name?: string;
    /**
     * The Google Cloud region of the workspace data plane in your Google
     * account. For example, `us-east4`.
     */
    location?: string;
    /**
     * The ID of the workspace's managed services encryption key configuration
     * object. This is used to encrypt the workspace's notebook and secret data
     * in the control plane, in addition to Databricks SQL queries and query
     * history. The provided key configuration object property `use_cases` must
     * contain `MANAGED_SERVICES`.
     */
    managed_services_customer_managed_key_id?: string;
    network_id?: string;
    /**
     * The pricing tier of the workspace. For pricing tier information, see [AWS
     * Pricing].
     *
     * [AWS Pricing]: https://databricks.com/product/aws-pricing
     */
    pricing_tier?: PricingTier;
    /**
     * ID of the workspace's private access settings object. Only used for
     * PrivateLink. This ID must be specified for customers using [AWS
     * PrivateLink] for either front-end (user-to-workspace connection), back-end
     * (data plane to control plane connection), or both connection types.
     *
     * Before configuring PrivateLink, read the [Databricks article about
     * PrivateLink].
     *
     * [AWS PrivateLink]: https://aws.amazon.com/privatelink/
     * [Databricks article about PrivateLink]: https://docs.databricks.com/administration-guide/cloud-configurations/aws/privatelink.html
     */
    private_access_settings_id?: string;
    /**
     * The ID of the workspace's storage configuration object.
     */
    storage_configuration_id?: string;
    /**
     * The ID of the workspace's storage encryption key configuration object.
     * This is used to encrypt the workspace's root S3 bucket (root DBFS and
     * system data) and, optionally, cluster EBS volumes. The provided key
     * configuration object property `use_cases` must contain `STORAGE`.
     */
    storage_customer_managed_key_id?: string;
    /**
     * The workspace's human-readable name.
     */
    workspace_name: string;
}

export interface Credential {
    /**
     * The Databricks account ID that hosts the credential.
     */
    account_id?: string;
    aws_credentials?: AwsCredentials;
    /**
     * Time in epoch milliseconds when the credential was created.
     */
    creation_time?: number;
    /**
     * Databricks credential configuration ID.
     */
    credentials_id?: string;
    /**
     * The human-readable name of the credential configuration object.
     */
    credentials_name?: string;
}

/**
 * The general workspace configurations that are specific to Google Cloud.
 */
export interface CustomerFacingGcpCloudResourceContainer {
    /**
     * The Google Cloud project ID, which the workspace uses to instantiate cloud
     * resources for your workspace.
     */
    project_id?: string;
}

export interface CustomerManagedKey {
    /**
     * The Databricks account ID that holds the customer-managed key.
     */
    account_id?: string;
    aws_key_info?: AwsKeyInfo;
    /**
     * Time in epoch milliseconds when the customer key was created.
     */
    creation_time?: number;
    /**
     * ID of the encryption key configuration object.
     */
    customer_managed_key_id?: string;
    /**
     * The cases that the key can be used for.
     */
    use_cases?: Array<KeyUseCase>;
}

/**
 * Delete credential configuration
 */
export interface DeleteCredentialRequest {
    /**
     * Databricks Account API credential configuration ID
     */
    credentials_id: string;
}

/**
 * Delete encryption key configuration
 */
export interface DeleteEncryptionKeyRequest {
    /**
     * Databricks encryption key configuration ID.
     */
    customer_managed_key_id: string;
}

/**
 * Delete a network configuration
 */
export interface DeleteNetworkRequest {
    /**
     * Databricks Account API network configuration ID.
     */
    network_id: string;
}

/**
 * Delete a private access settings object
 */
export interface DeletePrivateAccesRequest {
    /**
     * Databricks Account API private access settings ID.
     */
    private_access_settings_id: string;
}

/**
 * Delete storage configuration
 */
export interface DeleteStorageRequest {
    /**
     * Databricks Account API storage configuration ID.
     */
    storage_configuration_id: string;
}

/**
 * Delete VPC endpoint configuration
 */
export interface DeleteVpcEndpointRequest {
    /**
     * Databricks VPC endpoint ID.
     */
    vpc_endpoint_id: string;
}

/**
 * Delete a workspace
 */
export interface DeleteWorkspaceRequest {
    /**
     * Workspace ID.
     */
    workspace_id: number;
}

/**
 * This enumeration represents the type of Databricks VPC [endpoint service] that
 * was used when creating this VPC endpoint.
 *
 * If the VPC endpoint connects to the Databricks control plane for either the
 * front-end connection or the back-end REST API connection, the value is
 * `WORKSPACE_ACCESS`.
 *
 * If the VPC endpoint connects to the Databricks workspace for the back-end
 * [secure cluster connectivity] relay, the value is `DATAPLANE_RELAY_ACCESS`.
 *
 * [endpoint service]: https://docs.aws.amazon.com/vpc/latest/privatelink/endpoint-service.html
 * [secure cluster connectivity]: https://docs.databricks.com/security/secure-cluster-connectivity.html
 */
export type EndpointUseCase = "DATAPLANE_RELAY_ACCESS" | "WORKSPACE_ACCESS";

/**
 * The AWS resource associated with this error: credentials, VPC, subnet,
 * security group, or network ACL.
 */
export type ErrorType =
    | "credentials"
    | "networkAcl"
    | "securityGroup"
    | "subnet"
    | "vpc";

/**
 * The network settings for the workspace. The configurations are only for
 * Databricks-managed VPCs. It is ignored if you specify a customer-managed VPC
 * in the `network_id` field.", All the IP range configurations must be mutually
 * exclusive. An attempt to create a workspace fails if Databricks detects an IP
 * range overlap.
 *
 * Specify custom IP ranges in CIDR format. The IP ranges for these fields must
 * not overlap, and all IP addresses must be entirely within the following
 * ranges: `10.0.0.0/8`, `100.64.0.0/10`, `172.16.0.0/12`, `192.168.0.0/16`, and
 * `240.0.0.0/4`.
 *
 * The sizes of these IP ranges affect the maximum number of nodes for the
 * workspace.
 *
 * **Important**: Confirm the IP ranges used by your Databricks workspace before
 * creating the workspace. You cannot change them after your workspace is
 * deployed. If the IP address ranges for your Databricks are too small, IP
 * exhaustion can occur, causing your Databricks jobs to fail. To determine the
 * address range sizes that you need, Databricks provides a calculator as a
 * Microsoft Excel spreadsheet. See [calculate subnet sizes for a new workspace].
 *
 * [calculate subnet sizes for a new workspace]: https://docs.gcp.databricks.com/administration-guide/cloud-configurations/gcp/network-sizing.html
 */
export interface GcpManagedNetworkConfig {
    /**
     * The IP range from which to allocate GKE cluster pods. No bigger than `/9`
     * and no smaller than `/21`.
     */
    gke_cluster_pod_ip_range?: string;
    /**
     * The IP range from which to allocate GKE cluster services. No bigger than
     * `/16` and no smaller than `/27`.
     */
    gke_cluster_service_ip_range?: string;
    /**
     * The IP range from which to allocate GKE cluster nodes. No bigger than `/9`
     * and no smaller than `/29`.
     */
    subnet_cidr?: string;
}

/**
 * The Google Cloud specific information for this network (for example, the VPC
 * ID, subnet ID, and secondary IP ranges).
 */
export interface GcpNetworkInfo {
    /**
     * The Google Cloud project ID of the VPC network.
     */
    network_project_id: string;
    /**
     * The name of the secondary IP range for pods. A Databricks-managed GKE
     * cluster uses this IP range for its pods. This secondary IP range can be
     * used by only one workspace.
     */
    pod_ip_range_name: string;
    /**
     * The name of the secondary IP range for services. A Databricks-managed GKE
     * cluster uses this IP range for its services. This secondary IP range can
     * be used by only one workspace.
     */
    service_ip_range_name: string;
    /**
     * The ID of the subnet associated with this network.
     */
    subnet_id: string;
    /**
     * The Google Cloud region of the workspace data plane (for example,
     * `us-east4`).
     */
    subnet_region: string;
    /**
     * The ID of the VPC associated with this network. VPC IDs can be used in
     * multiple network configurations.
     */
    vpc_id: string;
}

/**
 * Get credential configuration
 */
export interface GetCredentialRequest {
    /**
     * Databricks Account API credential configuration ID
     */
    credentials_id: string;
}

/**
 * Get encryption key configuration
 */
export interface GetEncryptionKeyRequest {
    /**
     * Databricks encryption key configuration ID.
     */
    customer_managed_key_id: string;
}

/**
 * Get a network configuration
 */
export interface GetNetworkRequest {
    /**
     * Databricks Account API network configuration ID.
     */
    network_id: string;
}

/**
 * Get a private access settings object
 */
export interface GetPrivateAccesRequest {
    /**
     * Databricks Account API private access settings ID.
     */
    private_access_settings_id: string;
}

/**
 * Get storage configuration
 */
export interface GetStorageRequest {
    /**
     * Databricks Account API storage configuration ID.
     */
    storage_configuration_id: string;
}

/**
 * Get a VPC endpoint configuration
 */
export interface GetVpcEndpointRequest {
    /**
     * Databricks VPC endpoint ID.
     */
    vpc_endpoint_id: string;
}

/**
 * Get a workspace
 */
export interface GetWorkspaceRequest {
    /**
     * Workspace ID.
     */
    workspace_id: number;
}

/**
 * The configurations for the GKE cluster of a Databricks workspace.
 */
export interface GkeConfig {
    /**
     * Specifies the network connectivity types for the GKE nodes and the GKE
     * master network.
     *
     * Set to `PRIVATE_NODE_PUBLIC_MASTER` for a private GKE cluster for the
     * workspace. The GKE nodes will not have public IPs.
     *
     * Set to `PUBLIC_NODE_PUBLIC_MASTER` for a public GKE cluster. The nodes of
     * a public GKE cluster have public IP addresses.
     */
    connectivity_type?: GkeConfigConnectivityType;
    /**
     * The IP range from which to allocate GKE cluster master resources. This
     * field will be ignored if GKE private cluster is not enabled.
     *
     * It must be exactly as big as `/28`.
     */
    master_ip_range?: string;
}

/**
 * Specifies the network connectivity types for the GKE nodes and the GKE master
 * network.
 *
 * Set to `PRIVATE_NODE_PUBLIC_MASTER` for a private GKE cluster for the
 * workspace. The GKE nodes will not have public IPs.
 *
 * Set to `PUBLIC_NODE_PUBLIC_MASTER` for a public GKE cluster. The nodes of a
 * public GKE cluster have public IP addresses.
 */
export type GkeConfigConnectivityType =
    | "PRIVATE_NODE_PUBLIC_MASTER"
    | "PUBLIC_NODE_PUBLIC_MASTER";

/**
 * This describes an enum
 */
export type KeyUseCase =
    /**
     * Encrypts notebook and secret data in the control plane
     */
    | "MANAGED_SERVICES"
    /**
     * Encrypts the workspace's root S3 bucket (root DBFS and system data) and,
     * optionally, cluster EBS volumes.
     */
    | "STORAGE";

export interface Network {
    /**
     * The Databricks account ID associated with this network configuration.
     */
    account_id?: string;
    /**
     * Time in epoch milliseconds when the network was created.
     */
    creation_time?: number;
    /**
     * Array of error messages about the network configuration.
     */
    error_messages?: Array<NetworkHealth>;
    /**
     * The Google Cloud specific information for this network (for example, the
     * VPC ID, subnet ID, and secondary IP ranges).
     */
    gcp_network_info?: GcpNetworkInfo;
    /**
     * The Databricks network configuration ID.
     */
    network_id?: string;
    /**
     * The human-readable name of the network configuration.
     */
    network_name?: string;
    security_group_ids?: Array<string>;
    subnet_ids?: Array<string>;
    /**
     * If specified, contains the VPC endpoints used to allow cluster
     * communication from this VPC over [AWS PrivateLink].
     *
     * [AWS PrivateLink]: https://aws.amazon.com/privatelink/
     */
    vpc_endpoints?: NetworkVpcEndpoints;
    /**
     * The ID of the VPC associated with this network configuration. VPC IDs can
     * be used in multiple networks.
     */
    vpc_id?: string;
    /**
     * This describes an enum
     */
    vpc_status?: VpcStatus;
    /**
     * Array of warning messages about the network configuration.
     */
    warning_messages?: Array<NetworkWarning>;
    /**
     * Workspace ID associated with this network configuration.
     */
    workspace_id?: number;
}

export interface NetworkHealth {
    /**
     * Details of the error.
     */
    error_message?: string;
    /**
     * The AWS resource associated with this error: credentials, VPC, subnet,
     * security group, or network ACL.
     */
    error_type?: ErrorType;
}

/**
 * If specified, contains the VPC endpoints used to allow cluster communication
 * from this VPC over [AWS PrivateLink].
 *
 * [AWS PrivateLink]: https://aws.amazon.com/privatelink/
 */
export interface NetworkVpcEndpoints {
    /**
     * The VPC endpoint ID used by this network to access the Databricks secure
     * cluster connectivity relay. See [Secure Cluster Connectivity].
     *
     * This is a list type for future compatibility, but currently only one VPC
     * endpoint ID should be supplied.
     *
     * **Note**: This is the Databricks-specific ID of the VPC endpoint object in
     * the Account API, not the AWS VPC endpoint ID that you see for your
     * endpoint in the AWS Console.
     *
     * [Secure Cluster Connectivity]: https://docs.databricks.com/security/secure-cluster-connectivity.html
     */
    dataplane_relay: Array<string>;
    /**
     * The VPC endpoint ID used by this network to access the Databricks REST
     * API. Databricks clusters make calls to our REST API as part of cluster
     * creation, mlflow tracking, and many other features. Thus, this is required
     * even if your workspace allows public access to the REST API.
     *
     * This is a list type for future compatibility, but currently only one VPC
     * endpoint ID should be supplied.
     *
     * **Note**: This is the Databricks-specific ID of the VPC endpoint object in
     * the Account API, not the AWS VPC endpoint ID that you see for your
     * endpoint in the AWS Console.
     */
    rest_api: Array<string>;
}

export interface NetworkWarning {
    /**
     * Details of the warning.
     */
    warning_message?: string;
    /**
     * The AWS resource associated with this warning: a subnet or a security
     * group.
     */
    warning_type?: WarningType;
}

/**
 * The pricing tier of the workspace. For pricing tier information, see [AWS
 * Pricing].
 *
 * [AWS Pricing]: https://databricks.com/product/aws-pricing
 */
export type PricingTier =
    | "COMMUNITY_EDITION"
    | "DEDICATED"
    | "ENTERPRISE"
    | "PREMIUM"
    | "STANDARD"
    | "UNKNOWN";

/**
 * The private access level controls which VPC endpoints can connect to the UI or
 * API of any workspace that attaches this private access settings object. *
 * `ACCOUNT` level access (the default) allows only VPC endpoints that are
 * registered in your Databricks account connect to your workspace. * `ENDPOINT`
 * level access allows only specified VPC endpoints connect to your workspace.
 * For details, see `allowed_vpc_endpoint_ids`.
 */
export type PrivateAccessLevel = "ACCOUNT" | "ENDPOINT";

export interface PrivateAccessSettings {
    /**
     * The Databricks account ID that hosts the credential.
     */
    account_id?: string;
    /**
     * An array of Databricks VPC endpoint IDs. This is the Databricks ID
     * returned when registering the VPC endpoint configuration in your
     * Databricks account. This is _not_ the ID of the VPC endpoint in AWS.
     *
     * Only used when `private_access_level` is set to `ENDPOINT`. This is an
     * allow list of VPC endpoints registered in your Databricks account that can
     * connect to your workspace over AWS PrivateLink.
     *
     * **Note**: If hybrid access to your workspace is enabled by setting
     * `public_access_enabled` to `true`, this control only works for PrivateLink
     * connections. To control how your workspace is accessed via public
     * internet, see [IP access lists].
     *
     * [IP access lists]: https://docs.databricks.com/security/network/ip-access-list.html
     */
    allowed_vpc_endpoint_ids?: Array<string>;
    /**
     * The private access level controls which VPC endpoints can connect to the
     * UI or API of any workspace that attaches this private access settings
     * object. * `ACCOUNT` level access (the default) allows only VPC endpoints
     * that are registered in your Databricks account connect to your workspace.
     * * `ENDPOINT` level access allows only specified VPC endpoints connect to
     * your workspace. For details, see `allowed_vpc_endpoint_ids`.
     */
    private_access_level?: PrivateAccessLevel;
    /**
     * Databricks private access settings ID.
     */
    private_access_settings_id?: string;
    /**
     * The human-readable name of the private access settings object.
     */
    private_access_settings_name?: string;
    /**
     * Determines if the workspace can be accessed over public internet. For
     * fully private workspaces, you can optionally specify `false`, but only if
     * you implement both the front-end and the back-end PrivateLink connections.
     * Otherwise, specify `true`, which means that public access is enabled.
     */
    public_access_enabled?: boolean;
    /**
     * The AWS region for workspaces attached to this private access settings
     * object.
     */
    region?: string;
}

/**
 * Root S3 bucket information.
 */
export interface RootBucketInfo {
    /**
     * The name of the S3 bucket.
     */
    bucket_name?: string;
}

export interface StorageConfiguration {
    /**
     * The Databricks account ID that hosts the credential.
     */
    account_id?: string;
    /**
     * Time in epoch milliseconds when the storage configuration was created.
     */
    creation_time?: number;
    /**
     * Root S3 bucket information.
     */
    root_bucket_info?: RootBucketInfo;
    /**
     * Databricks storage configuration ID.
     */
    storage_configuration_id?: string;
    /**
     * The human-readable name of the storage configuration.
     */
    storage_configuration_name?: string;
}

export interface StsRole {
    /**
     * The external ID that needs to be trusted by the cross-account role. This
     * is always your Databricks account ID.
     */
    external_id?: string;
    /**
     * The Amazon Resource Name (ARN) of the cross account role.
     */
    role_arn?: string;
}

export interface UpdateWorkspaceRequest {
    /**
     * The AWS region of the workspace's data plane (for example, `us-west-2`).
     * This parameter is available only for updating failed workspaces.
     */
    aws_region?: string;
    /**
     * ID of the workspace's credential configuration object. This parameter is
     * available for updating both failed and running workspaces.
     */
    credentials_id?: string;
    /**
     * The ID of the workspace's managed services encryption key configuration
     * object. This parameter is available only for updating failed workspaces.
     */
    managed_services_customer_managed_key_id?: string;
    /**
     * The ID of the workspace's network configuration object. Used only if you
     * already use a customer-managed VPC. For failed workspaces only, you can
     * switch from a Databricks-managed VPC to a customer-managed VPC by updating
     * the workspace to add a network configuration ID.
     */
    network_id?: string;
    /**
     * The ID of the workspace's storage configuration object. This parameter is
     * available only for updating failed workspaces.
     */
    storage_configuration_id?: string;
    /**
     * The ID of the key configuration object for workspace storage. This
     * parameter is available for updating both failed and running workspaces.
     */
    storage_customer_managed_key_id?: string;
    /**
     * Workspace ID.
     */
    workspace_id: number;
}

export interface UpsertPrivateAccessSettingsRequest {
    /**
     * An array of Databricks VPC endpoint IDs. This is the Databricks ID that is
     * returned when registering the VPC endpoint configuration in your
     * Databricks account. This is not the ID of the VPC endpoint in AWS.
     *
     * Only used when `private_access_level` is set to `ENDPOINT`. This is an
     * allow list of VPC endpoints that in your account that can connect to your
     * workspace over AWS PrivateLink.
     *
     * If hybrid access to your workspace is enabled by setting
     * `public_access_enabled` to `true`, this control only works for PrivateLink
     * connections. To control how your workspace is accessed via public
     * internet, see [IP access lists].
     *
     * [IP access lists]: https://docs.databricks.com/security/network/ip-access-list.html
     */
    allowed_vpc_endpoint_ids?: Array<string>;
    /**
     * The private access level controls which VPC endpoints can connect to the
     * UI or API of any workspace that attaches this private access settings
     * object. * `ACCOUNT` level access (the default) allows only VPC endpoints
     * that are registered in your Databricks account connect to your workspace.
     * * `ENDPOINT` level access allows only specified VPC endpoints connect to
     * your workspace. For details, see `allowed_vpc_endpoint_ids`.
     */
    private_access_level?: PrivateAccessLevel;
    /**
     * Databricks Account API private access settings ID.
     */
    private_access_settings_id: string;
    /**
     * The human-readable name of the private access settings object.
     */
    private_access_settings_name: string;
    /**
     * Determines if the workspace can be accessed over public internet. For
     * fully private workspaces, you can optionally specify `false`, but only if
     * you implement both the front-end and the back-end PrivateLink connections.
     * Otherwise, specify `true`, which means that public access is enabled.
     */
    public_access_enabled?: boolean;
    /**
     * The AWS region for workspaces associated with this private access settings
     * object. This must be a [region that Databricks supports for PrivateLink].
     *
     * [region that Databricks supports for PrivateLink]: https://docs.databricks.com/administration-guide/cloud-configurations/aws/regions.html
     */
    region: string;
}

export interface VpcEndpoint {
    /**
     * The Databricks account ID that hosts the VPC endpoint configuration.
     */
    account_id?: string;
    /**
     * The AWS Account in which the VPC endpoint object exists.
     */
    aws_account_id?: string;
    /**
     * The ID of the Databricks [endpoint service] that this VPC endpoint is
     * connected to. For a list of endpoint service IDs for each supported AWS
     * region, see the [Databricks PrivateLink documentation].
     *
     * [Databricks PrivateLink documentation]: https://docs.databricks.com/administration-guide/cloud-configurations/aws/privatelink.html
     * [endpoint service]: https://docs.aws.amazon.com/vpc/latest/privatelink/endpoint-service.html
     */
    aws_endpoint_service_id?: string;
    /**
     * The ID of the VPC endpoint object in AWS.
     */
    aws_vpc_endpoint_id?: string;
    /**
     * The AWS region in which this VPC endpoint object exists.
     */
    region?: string;
    /**
     * The current state (such as `available` or `rejected`) of the VPC endpoint.
     * Derived from AWS. For the full set of values, see [AWS DescribeVpcEndpoint
     * documentation].
     *
     * [AWS DescribeVpcEndpoint documentation]: https://docs.aws.amazon.com/cli/latest/reference/ec2/describe-vpc-endpoints.html
     */
    state?: string;
    /**
     * This enumeration represents the type of Databricks VPC [endpoint service]
     * that was used when creating this VPC endpoint.
     *
     * If the VPC endpoint connects to the Databricks control plane for either
     * the front-end connection or the back-end REST API connection, the value is
     * `WORKSPACE_ACCESS`.
     *
     * If the VPC endpoint connects to the Databricks workspace for the back-end
     * [secure cluster connectivity] relay, the value is
     * `DATAPLANE_RELAY_ACCESS`.
     *
     * [endpoint service]: https://docs.aws.amazon.com/vpc/latest/privatelink/endpoint-service.html
     * [secure cluster connectivity]: https://docs.databricks.com/security/secure-cluster-connectivity.html
     */
    use_case?: EndpointUseCase;
    /**
     * Databricks VPC endpoint ID. This is the Databricks-specific name of the
     * VPC endpoint. Do not confuse this with the `aws_vpc_endpoint_id`, which is
     * the ID within AWS of the VPC endpoint.
     */
    vpc_endpoint_id?: string;
    /**
     * The human-readable name of the storage configuration.
     */
    vpc_endpoint_name?: string;
}

/**
 * This describes an enum
 */
export type VpcStatus =
    /**
     * Broken.
     */
    | "BROKEN"
    /**
     * Unattached.
     */
    | "UNATTACHED"
    /**
     * Valid.
     */
    | "VALID"
    /**
     * Warned.
     */
    | "WARNED";

/**
 * The AWS resource associated with this warning: a subnet or a security group.
 */
export type WarningType = "securityGroup" | "subnet";

export interface Workspace {
    /**
     * Databricks account ID.
     */
    account_id?: string;
    /**
     * The AWS region of the workspace data plane (for example, `us-west-2`).
     */
    aws_region?: string;
    /**
     * The cloud name. This field always has the value `gcp`.
     */
    cloud?: string;
    /**
     * The general workspace configurations that are specific to cloud providers.
     */
    cloud_resource_container?: CloudResourceContainer;
    /**
     * Time in epoch milliseconds when the workspace was created.
     */
    creation_time?: number;
    /**
     * ID of the workspace's credential configuration object.
     */
    credentials_id?: string;
    /**
     * The deployment name defines part of the subdomain for the workspace. The
     * workspace URL for web application and REST APIs is
     * `<deployment-name>.cloud.databricks.com`.
     *
     * This value must be unique across all non-deleted deployments across all
     * AWS regions.
     */
    deployment_name?: string;
    /**
     * The network settings for the workspace. The configurations are only for
     * Databricks-managed VPCs. It is ignored if you specify a customer-managed
     * VPC in the `network_id` field.", All the IP range configurations must be
     * mutually exclusive. An attempt to create a workspace fails if Databricks
     * detects an IP range overlap.
     *
     * Specify custom IP ranges in CIDR format. The IP ranges for these fields
     * must not overlap, and all IP addresses must be entirely within the
     * following ranges: `10.0.0.0/8`, `100.64.0.0/10`, `172.16.0.0/12`,
     * `192.168.0.0/16`, and `240.0.0.0/4`.
     *
     * The sizes of these IP ranges affect the maximum number of nodes for the
     * workspace.
     *
     * **Important**: Confirm the IP ranges used by your Databricks workspace
     * before creating the workspace. You cannot change them after your workspace
     * is deployed. If the IP address ranges for your Databricks are too small,
     * IP exhaustion can occur, causing your Databricks jobs to fail. To
     * determine the address range sizes that you need, Databricks provides a
     * calculator as a Microsoft Excel spreadsheet. See [calculate subnet sizes
     * for a new workspace].
     *
     * [calculate subnet sizes for a new workspace]: https://docs.gcp.databricks.com/administration-guide/cloud-configurations/gcp/network-sizing.html
     */
    gcp_managed_network_config?: GcpManagedNetworkConfig;
    /**
     * The configurations for the GKE cluster of a Databricks workspace.
     */
    gke_config?: GkeConfig;
    /**
     * The Google Cloud region of the workspace data plane in your Google account
     * (for example, `us-east4`).
     */
    location?: string;
    /**
     * ID of the key configuration for encrypting managed services.
     */
    managed_services_customer_managed_key_id?: string;
    /**
     * The network configuration ID that is attached to the workspace. This field
     * is available only if the network is a customer-managed network.
     */
    network_id?: string;
    /**
     * The pricing tier of the workspace. For pricing tier information, see [AWS
     * Pricing].
     *
     * [AWS Pricing]: https://databricks.com/product/aws-pricing
     */
    pricing_tier?: PricingTier;
    /**
     * ID of the workspace's private access settings object. Only used for
     * PrivateLink. You must specify this ID if you are using [AWS PrivateLink]
     * for either front-end (user-to-workspace connection), back-end (data plane
     * to control plane connection), or both connection types.
     *
     * Before configuring PrivateLink, read the [Databricks article about
     * PrivateLink].
     *
     * [AWS PrivateLink]: https://aws.amazon.com/privatelink/
     * [Databricks article about PrivateLink]: https://docs.databricks.com/administration-guide/cloud-configurations/aws/privatelink.html
     */
    private_access_settings_id?: string;
    /**
     * ID of the workspace's storage configuration object.
     */
    storage_configuration_id?: string;
    /**
     * ID of the key configuration for encrypting workspace storage.
     */
    storage_customer_managed_key_id?: string;
    /**
     * A unique integer ID for the workspace
     */
    workspace_id?: number;
    /**
     * The human-readable name of the workspace.
     */
    workspace_name?: string;
    /**
     * The status of the workspace. For workspace creation, usually it is set to
     * `PROVISIONING` initially. Continue to check the status until the status is
     * `RUNNING`.
     */
    workspace_status?: WorkspaceStatus;
    /**
     * Message describing the current workspace status.
     */
    workspace_status_message?: string;
}

/**
 * The status of the workspace. For workspace creation, usually it is set to
 * `PROVISIONING` initially. Continue to check the status until the status is
 * `RUNNING`.
 */
export type WorkspaceStatus =
    | "BANNED"
    | "CANCELLING"
    | "FAILED"
    | "NOT_PROVISIONED"
    | "PROVISIONING"
    | "RUNNING";

export interface EmptyResponse {}
