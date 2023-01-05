/* eslint-disable @typescript-eslint/naming-convention */

// Code generated from OpenAPI specs by Databricks SDK Generator. DO NOT EDIT.

// all definitions in this file are in alphabetical order
/**
 * The delta sharing authentication type.
 */
export type AuthenticationType = "DATABRICKS" | "TOKEN" | "UNKNOWN";

export interface AwsIamRole {
    /**
     * The external ID used in role assumption to prevent confused deputy
     * problem..
     */
    external_id?: string;
    /**
     * The Amazon Resource Name (ARN) of the AWS IAM role for S3 data access.
     */
    role_arn: string;
    /**
     * The Amazon Resource Name (ARN) of the AWS IAM user managed by Databricks.
     * This is the identity that is going to assume the AWS IAM role.
     */
    unity_catalog_iam_arn?: string;
}

export interface AzureServicePrincipal {
    /**
     * The application ID of the application registration within the referenced
     * AAD tenant.
     */
    application_id: string;
    /**
     * The client secret generated for the above app ID in AAD.
     */
    client_secret: string;
    /**
     * The directory ID corresponding to the Azure Active Directory (AAD) tenant
     * of the application.
     */
    directory_id: string;
}

export interface CatalogInfo {
    /**
     * The type of the catalog.
     */
    catalog_type?: CatalogType;
    /**
     * User-provided free-form text description.
     */
    comment?: string;
    /**
     * Time at which this Catalog was created, in epoch milliseconds.
     */
    created_at?: number;
    /**
     * Username of Catalog creator.
     */
    created_by?: string;
    /**
     * Unique identifier of parent Metastore.
     */
    metastore_id?: string;
    /**
     * Name of Catalog.
     */
    name?: string;
    /**
     * Username of current owner of Catalog.
     */
    owner?: string;
    properties?: Record<string, string>;
    /**
     * The name of delta sharing provider.
     *
     * A Delta Sharing Catalog is a catalog that is based on a Delta share on a
     * remote sharing server.
     */
    provider_name?: string;
    /**
     * The name of the share under the share provider.
     */
    share_name?: string;
    /**
     * Storage Location URL (full path) for managed tables within Catalog.
     */
    storage_location?: string;
    /**
     * Storage root URL for managed tables within Catalog.
     */
    storage_root?: string;
    /**
     * Time at which this Catalog was last modified, in epoch milliseconds.
     */
    updated_at?: number;
    /**
     * Username of user who last modified Catalog.
     */
    updated_by?: string;
}

/**
 * The type of the catalog.
 */
export type CatalogType =
    | "DELTASHARING_CATALOG"
    | "MANAGED_CATALOG"
    | "SYSTEM_CATALOG";

export interface ColumnInfo {
    /**
     * [Create,Update:OPT] User-provided free-form text description.
     */
    comment?: string;
    /**
     * [Create:REQ Update:OPT] Name of Column.
     */
    name?: string;
    /**
     * [Create,Update:OPT] Whether field may be Null (default: True).
     */
    nullable?: boolean;
    /**
     * [Create,Update:OPT] Partition index for column.
     */
    partition_index?: number;
    /**
     * [Create:REQ Update:OPT] Ordinal position of column (starting at position
     * 0).
     */
    position?: number;
    /**
     * [Create: OPT, Update: OPT] Format of IntervalType.
     */
    type_interval_type?: string;
    /**
     * [Create:OPT Update:OPT] Full data type spec, JSON-serialized.
     */
    type_json?: string;
    /**
     * [Create: REQ Update: OPT] Name of type (INT, STRUCT, MAP, etc.)
     */
    type_name?: ColumnInfoTypeName;
    /**
     * [Create: OPT, Update: OPT] Digits of precision; required on Create for
     * DecimalTypes.
     */
    type_precision?: number;
    /**
     * [Create: OPT, Update: OPT] Digits to right of decimal; Required on Create
     * for DecimalTypes.
     */
    type_scale?: number;
    /**
     * [Create:REQ Update:OPT] Full data type spec, SQL/catalogString text.
     */
    type_text?: string;
}

/**
 * [Create: REQ Update: OPT] Name of type (INT, STRUCT, MAP, etc.)
 */
export type ColumnInfoTypeName =
    | "ARRAY"
    | "BINARY"
    | "BOOLEAN"
    | "BYTE"
    | "CHAR"
    | "DATE"
    | "DECIMAL"
    | "DOUBLE"
    | "FLOAT"
    | "INT"
    | "INTERVAL"
    | "LONG"
    | "MAP"
    | "NULL"
    | "SHORT"
    | "STRING"
    | "STRUCT"
    | "TIMESTAMP"
    | "USER_DEFINED_TYPE";

export interface CreateCatalog {
    /**
     * User-provided free-form text description.
     */
    comment?: string;
    /**
     * Name of Catalog.
     */
    name: string;
    properties?: Record<string, string>;
    /**
     * The name of delta sharing provider.
     *
     * A Delta Sharing Catalog is a catalog that is based on a Delta share on a
     * remote sharing server.
     */
    provider_name?: string;
    /**
     * The name of the share under the share provider.
     */
    share_name?: string;
    /**
     * Storage root URL for managed tables within Catalog.
     */
    storage_root?: string;
}

export interface CreateExternalLocation {
    /**
     * User-provided free-form text description.
     */
    comment?: string;
    /**
     * Current name of the Storage Credential this location uses.
     */
    credential_name: string;
    /**
     * Name of the External Location.
     */
    name: string;
    /**
     * Indicates whether the external location is read-only.
     */
    read_only?: boolean;
    /**
     * Skips validation of the storage credential associated with the external
     * location.
     */
    skip_validation?: boolean;
    /**
     * Path URL of the External Location.
     */
    url: string;
}

export interface CreateMetastore {
    /**
     * Name of Metastore.
     */
    name: string;
    /**
     * Storage root URL for Metastore
     */
    storage_root: string;
}

export interface CreateMetastoreAssignment {
    /**
     * The name of the default catalog in the Metastore.
     */
    default_catalog_name: string;
    /**
     * The ID of the Metastore.
     */
    metastore_id: string;
    /**
     * A workspace ID.
     */
    workspace_id: number;
}

export interface CreateProvider {
    /**
     * The delta sharing authentication type.
     */
    authentication_type: AuthenticationType;
    /**
     * Description about the provider.
     */
    comment?: string;
    /**
     * The name of the Provider.
     */
    name: string;
    /**
     * Username of Provider owner.
     */
    owner?: string;
    /**
     * This field is required when the authentication_type is `TOKEN` or not
     * provided.
     */
    recipient_profile_str?: string;
}

export interface CreateRecipient {
    /**
     * The delta sharing authentication type.
     */
    authentication_type: AuthenticationType;
    /**
     * Description about the recipient.
     */
    comment?: string;
    /**
     * The global Unity Catalog metastore id provided by the data recipient.\n
     * This field is only present when the authentication type is `DATABRICKS`.\n
     * The identifier is of format <cloud>:<region>:<metastore-uuid>.
     */
    data_recipient_global_metastore_id?: any /* MISSING TYPE */;
    /**
     * IP Access List
     */
    ip_access_list?: IpAccessList;
    /**
     * Name of Recipient.
     */
    name: string;
    /**
     * The one-time sharing code provided by the data recipient. This field is
     * only present when the authentication type is `DATABRICKS`.
     */
    sharing_code?: string;
}

export interface CreateSchema {
    /**
     * Name of parent Catalog.
     */
    catalog_name: string;
    /**
     * User-provided free-form text description.
     */
    comment?: string;
    /**
     * Name of Schema, relative to parent Catalog.
     */
    name: string;
    properties?: Record<string, string>;
}

export interface CreateShare {
    /**
     * User-provided free-form text description.
     */
    comment?: string;
    /**
     * Name of the Share.
     */
    name: string;
}

export interface CreateStorageCredential {
    /**
     * The AWS IAM role configuration.
     */
    aws_iam_role?: AwsIamRole;
    /**
     * The Azure service principal configuration.
     */
    azure_service_principal?: AzureServicePrincipal;
    /**
     * Comment associated with the credential.
     */
    comment?: string;
    /**
     * The GCP service account key configuration.
     */
    gcp_service_account_key?: GcpServiceAccountKey;
    /**
     * The credential name. The name MUST be unique within the Metastore.
     */
    name: string;
    /**
     * Optional. Supplying true to this argument skips validation of the created
     * set of credentials.
     */
    skip_validation?: boolean;
}

/**
 * Data source format
 */
export type DataSourceFormat =
    | "AVRO"
    | "CSV"
    | "DELTA"
    | "DELTASHARING"
    | "JSON"
    | "ORC"
    | "PARQUET"
    | "TEXT"
    | "UNITY_CATALOG";

/**
 * Delete a catalog
 */
export interface DeleteCatalogRequest {
    /**
     * Force deletion even if the catalog is notempty.
     */
    force?: boolean;
    /**
     * Required. The name of the catalog.
     */
    name: string;
}

/**
 * Delete an external location
 */
export interface DeleteExternalLocationRequest {
    /**
     * Force deletion even if there are dependent external tables or mounts.
     */
    force?: boolean;
    /**
     * Required. Name of the storage credential.
     */
    name: string;
}

/**
 * Delete a Metastore
 */
export interface DeleteMetastoreRequest {
    /**
     * Force deletion even if the metastore is not empty. Default is false.
     */
    force?: boolean;
    /**
     * Required. Unique ID of the Metastore (from URL).
     */
    id: string;
}

/**
 * Delete a provider
 */
export interface DeleteProviderRequest {
    /**
     * Required. Name of the provider.
     */
    name: string;
}

/**
 * Delete a share recipient
 */
export interface DeleteRecipientRequest {
    /**
     * Required. Name of the recipient.
     */
    name: string;
}

/**
 * Delete a schema
 */
export interface DeleteSchemaRequest {
    /**
     * Required. Full name of the schema (from URL).
     */
    full_name: string;
}

/**
 * Delete a share
 */
export interface DeleteShareRequest {
    /**
     * The name of the share.
     */
    name: string;
}

/**
 * Delete a credential
 */
export interface DeleteStorageCredentialRequest {
    /**
     * Force deletion even if there are dependent external locations or external
     * tables.
     */
    force?: boolean;
    /**
     * Required. Name of the storage credential.
     */
    name: string;
}

/**
 * Delete a table
 */
export interface DeleteTableRequest {
    /**
     * Required. Full name of the Table (from URL).
     */
    full_name: string;
}

export interface ExternalLocationInfo {
    /**
     * User-provided free-form text description.
     */
    comment?: string;
    /**
     * Time at which this External Location was created, in epoch milliseconds.
     */
    created_at?: number;
    /**
     * Username of External Location creator.
     */
    created_by?: string;
    /**
     * Unique ID of the location's Storage Credential.
     */
    credential_id?: string;
    /**
     * Current name of the Storage Credential this location uses.
     */
    credential_name?: string;
    /**
     * Unique identifier of Metastore hosting the External Location.
     */
    metastore_id?: string;
    /**
     * Name of the External Location.
     */
    name?: string;
    /**
     * The owner of the External Location.
     */
    owner?: string;
    /**
     * Indicates whether the external location is read-only.
     */
    read_only?: boolean;
    /**
     * Time at which External Location this was last modified, in epoch
     * milliseconds.
     */
    updated_at?: number;
    /**
     * Username of user who last modified the External Location.
     */
    updated_by?: string;
    /**
     * Path URL of the External Location.
     */
    url?: string;
}

export interface GcpServiceAccountKey {
    /**
     * The email of the service account.
     */
    email: string;
    /**
     * The service account's RSA private key.
     */
    private_key: string;
    /**
     * The ID of the service account's private key.
     */
    private_key_id: string;
}

/**
 * Get a share activation URL
 */
export interface GetActivationUrlInfoRequest {
    /**
     * Required. The one time activation url. It also accepts activation token.
     */
    activation_url: string;
}

/**
 * Get a catalog
 */
export interface GetCatalogRequest {
    /**
     * Required. The name of the catalog.
     */
    name: string;
}

/**
 * Get an external location
 */
export interface GetExternalLocationRequest {
    /**
     * Required. Name of the storage credential.
     */
    name: string;
}

/**
 * Get permissions
 */
export interface GetGrantRequest {
    /**
     * Required. Unique identifier (full name) of Securable (from URL).
     */
    full_name: string;
    /**
     * Optional. List permissions granted to this principal.
     */
    principal?: string;
    /**
     * Required. Type of Securable (from URL).
     */
    securable_type: string;
}

/**
 * Get a Metastore
 */
export interface GetMetastoreRequest {
    /**
     * Required. Unique ID of the Metastore (from URL).
     */
    id: string;
}

export interface GetMetastoreSummaryResponse {
    /**
     * Cloud vendor of the Metastore home shard (e.g., `aws`, `azure`, `gcp`).
     */
    cloud?: string;
    /**
     * Time at which this Metastore was created, in epoch milliseconds.
     */
    created_at?: number;
    /**
     * Username of Metastore creator.
     */
    created_by?: string;
    /**
     * Unique identifier of the Metastore's (Default) Data Access Configuration.
     */
    default_data_access_config_id?: string;
    /**
     * The organization name of a Delta Sharing entity, to be used in
     * Databricks-to-Databricks Delta Sharing as the official name.
     */
    delta_sharing_organization_name?: string;
    /**
     * The lifetime of delta sharing recipient token in seconds.
     */
    delta_sharing_recipient_token_lifetime_in_seconds?: number;
    /**
     * The scope of Delta Sharing enabled for the Metastore
     */
    delta_sharing_scope?: GetMetastoreSummaryResponseDeltaSharingScope;
    /**
     * Globally unique metastore ID across clouds and regions, of the form
     * `cloud:region:metastore_id`.
     */
    global_metastore_id?: string;
    /**
     * The unique ID (UUID) of the Metastore.
     */
    metastore_id?: string;
    /**
     * The user-specified name of the Metastore.
     */
    name?: string;
    /**
     * The owner of the metastore.
     */
    owner?: string;
    /**
     * Privilege model version of the metastore, of the form `major.minor` (e.g.,
     * `1.0`)
     */
    privilege_model_version?: string;
    /**
     * Cloud region of the Metastore home shard (e.g., `us-west-2`, `westus`).
     */
    region?: string;
    /**
     * The storage root URL for the Metastore.
     */
    storage_root?: string;
    /**
     * UUID of storage credential to access the metastore storage_root.
     */
    storage_root_credential_id?: string;
    /**
     * Name of the storage credential to access the metastore storage_root.
     */
    storage_root_credential_name?: string;
    /**
     * Time at which this Metastore was last modified, in epoch milliseconds.
     */
    updated_at?: number;
    /**
     * Username of user who last modified the External Location.
     */
    updated_by?: string;
}

/**
 * The scope of Delta Sharing enabled for the Metastore
 */
export type GetMetastoreSummaryResponseDeltaSharingScope =
    | "INTERNAL"
    | "INTERNAL_AND_EXTERNAL";

export interface GetPermissionsResponse {
    privilege_assignments?: Array<PrivilegeAssignment>;
}

/**
 * Get a provider
 */
export interface GetProviderRequest {
    /**
     * Required. Name of the provider.
     */
    name: string;
}

/**
 * Get a share recipient
 */
export interface GetRecipientRequest {
    /**
     * Required. Name of the recipient.
     */
    name: string;
}

export interface GetRecipientSharePermissionsResponse {
    /**
     * An array of data share permissions for a recipient.
     */
    permissions_out?: Array<ShareToPrivilegeAssignment>;
}

/**
 * Get a schema
 */
export interface GetSchemaRequest {
    /**
     * Required. Full name of the schema (from URL).
     */
    full_name: string;
}

export interface GetSharePermissionsResponse {
    /**
     * Note to self (acain): Unfortunately, neither json_inline nor json_map work
     * here.
     */
    privilege_assignments?: Array<PrivilegeAssignment>;
}

/**
 * Get a share
 */
export interface GetShareRequest {
    /**
     * Query for data to include in the share.
     */
    include_shared_data?: boolean;
    /**
     * The name of the share.
     */
    name: string;
}

/**
 * Get a credential
 */
export interface GetStorageCredentialRequest {
    /**
     * Required. Name of the storage credential.
     */
    name: string;
}

/**
 * Get a table
 */
export interface GetTableRequest {
    /**
     * Required. Full name of the Table (from URL).
     */
    full_name: string;
}

export interface IpAccessList {
    /**
     * Allowed IP Addresses in CIDR notation. Limit of 100.
     */
    allowed_ip_addresses?: Array<string>;
}

export interface ListCatalogsResponse {
    /**
     * An array of catalog information objects.
     */
    catalogs?: Array<CatalogInfo>;
}

export interface ListExternalLocationsResponse {
    /**
     * An array of external locations.
     */
    external_locations?: Array<ExternalLocationInfo>;
}

export interface ListMetastoresResponse {
    /**
     * An array of Metastore information objects.
     */
    metastores?: Array<MetastoreInfo>;
}

export interface ListProviderSharesResponse {
    /**
     * An array of provider shares.
     */
    shares?: Array<ProviderShare>;
}

/**
 * List providers
 */
export interface ListProvidersRequest {
    /**
     * If not provided, all providers will be returned. If no providers exist
     * with this ID, no results will be returned.
     */
    data_provider_global_metastore_id?: string;
}

export interface ListProvidersResponse {
    /**
     * An array of provider information objects.
     */
    providers?: Array<ProviderInfo>;
}

/**
 * List share recipients
 */
export interface ListRecipientsRequest {
    /**
     * If not provided, all recipients will be returned. If no recipients exist
     * with this ID, no results will be returned.
     */
    data_recipient_global_metastore_id?: string;
}

export interface ListRecipientsResponse {
    /**
     * An array of recipient information objects.
     */
    recipients?: Array<RecipientInfo>;
}

/**
 * List schemas
 */
export interface ListSchemasRequest {
    /**
     * Optional. Parent catalog for schemas of interest.
     */
    catalog_name?: string;
}

export interface ListSchemasResponse {
    /**
     * An array of schema information objects.
     */
    schemas?: Array<SchemaInfo>;
}

/**
 * List shares
 */
export interface ListSharesRequest {
    /**
     * Required. Name of the provider in which to list shares.
     */
    name: string;
}

export interface ListSharesResponse {
    /**
     * An array of data share information objects.
     */
    shares?: Array<ShareInfo>;
}

export interface ListStorageCredentialsResponse {
    storage_credentials?: Array<StorageCredentialInfo>;
}

export interface ListTableSummariesResponse {
    /**
     * Optional. Opaque token for pagination. Empty if there's no more page.
     */
    next_page_token?: string;
    /**
     * Only name, catalog_name, schema_name, full_name and table_type will be
     * set.
     */
    tables?: Array<TableSummary>;
}

/**
 * List tables
 */
export interface ListTablesRequest {
    /**
     * Required. Name of parent catalog for tables of interest.
     */
    catalog_name?: string;
    /**
     * Required (for now -- may be optional for wildcard search in future).
     * Parent schema of tables.
     */
    schema_name?: string;
}

export interface ListTablesResponse {
    /**
     * An array of table information objects.
     */
    tables?: Array<TableInfo>;
}

export interface MetastoreInfo {
    /**
     * Time at which this Metastore was created, in epoch milliseconds.
     */
    created_at?: number;
    /**
     * Username of Metastore creator.
     */
    created_by?: string;
    /**
     * Unique identifier of (Default) Data Access Configuration
     */
    default_data_access_config_id?: string;
    /**
     * Whether Delta Sharing is enabled on this metastore.
     */
    delta_sharing_enabled?: boolean;
    /**
     * The lifetime of delta sharing recipient token in seconds
     */
    delta_sharing_recipient_token_lifetime_in_seconds?: number;
    /**
     * Unique identifier of Metastore.
     */
    metastore_id?: string;
    /**
     * Name of Metastore.
     */
    name?: string;
    /**
     * The owner of the metastore.
     */
    owner?: string;
    /**
     * The region this metastore has an afinity to. This is used by
     * accounts-manager. Ignored by Unity Catalog.
     */
    region?: string;
    /**
     * Storage root URL for Metastore
     */
    storage_root?: string;
    /**
     * UUID of storage credential to access storage_root
     */
    storage_root_credential_id?: string;
    /**
     * Time at which the Metastore was last modified, in epoch milliseconds.
     */
    updated_at?: number;
    /**
     * Username of user who last modified the Metastore.
     */
    updated_by?: string;
}

export interface Partition {
    /**
     * An array of partition values.
     */
    values?: Array<PartitionValue>;
}

export interface PartitionValue {
    /**
     * The name of the partition column.
     */
    name?: string;
    /**
     * The operator to apply for the value.
     */
    op?: PartitionValueOp;
    /**
     * The key of a Delta Sharing recipient's property. For example
     * `databricks-account-id`. When this field is set, field `value` can not be
     * set.
     */
    recipient_property_key?: string;
    /**
     * The value of the partition column. When this value is not set, it means
     * `null` value. When this field is set, field `recipient_property_key` can
     * not be set.
     */
    value?: string;
}

/**
 * The operator to apply for the value.
 */
export type PartitionValueOp = "EQUAL" | "LIKE";

export interface PermissionsChange {
    /**
     * The set of privileges to add.
     */
    add?: Array<Privilege>;
    /**
     * The principal whose privileges we are changing.
     */
    principal?: string;
    /**
     * The set of privileges to remove.
     */
    remove?: Array<Privilege>;
}

export type Privilege =
    | "ALL_PRIVILEGES"
    | "CREATE"
    | "CREATE_CATALOG"
    | "CREATE_EXTERNAL_LOCATION"
    | "CREATE_EXTERNAL_TABLE"
    | "CREATE_FUNCTION"
    | "CREATE_MANAGED_STORAGE"
    | "CREATE_MATERIALIZED_VIEW"
    | "CREATE_PROVIDER"
    | "CREATE_RECIPIENT"
    | "CREATE_SCHEMA"
    | "CREATE_SHARE"
    | "CREATE_STORAGE_CREDENTIAL"
    | "CREATE_TABLE"
    | "CREATE_VIEW"
    | "EXECUTE"
    | "MODIFY"
    | "READ_FILES"
    | "READ_PRIVATE_FILES"
    | "REFRESH"
    | "SELECT"
    | "SET_SHARE_PERMISSION"
    | "USAGE"
    | "USE_CATALOG"
    | "USE_PROVIDER"
    | "USE_RECIPIENT"
    | "USE_SCHEMA"
    | "USE_SHARE"
    | "WRITE_FILES"
    | "WRITE_PRIVATE_FILES";

export interface PrivilegeAssignment {
    /**
     * The principal (user email address or group name).
     */
    principal?: string;
    /**
     * The privileges assigned to the principal.
     */
    privileges?: Array<Privilege>;
}

export interface ProviderInfo {
    /**
     * The delta sharing authentication type.
     */
    authentication_type?: AuthenticationType;
    /**
     * Cloud vendor of the provider's UC Metastore. This field is only present
     * when the authentication_type is `DATABRICKS`.
     */
    cloud?: string;
    /**
     * Description about the provider.
     */
    comment?: string;
    /**
     * Time at which this Provider was created, in epoch milliseconds.
     */
    created_at?: number;
    /**
     * Username of Provider creator.
     */
    created_by?: string;
    /**
     * The global UC metastore id of the data provider. This field is only
     * present when the authentication type is `DATABRICKS`. The identifier is of
     * format <cloud>:<region>:<metastore-uuid>.
     */
    data_provider_global_metastore_id?: string;
    /**
     * UUID of the provider's UC Metastore. This field is only present when the
     * authentication type is `DATABRICKS`.
     */
    metastore_id?: string;
    /**
     * The name of the Provider.
     */
    name?: string;
    /**
     * Username of Provider owner.
     */
    owner?: string;
    /**
     * The recipient profile. This field is only present when the
     * authentication_type is `TOKEN`.
     */
    recipient_profile?: RecipientProfile;
    /**
     * This field is required when the authentication_type is `TOKEN` or not
     * provided.
     */
    recipient_profile_str?: string;
    /**
     * Cloud region of the provider's UC Metastore. This field is only present
     * when the authentication type is `DATABRICKS`.
     */
    region?: string;
    /**
     * Time at which this Provider was created, in epoch milliseconds.
     */
    updated_at?: number;
    /**
     * Username of user who last modified Share.
     */
    updated_by?: string;
}

export interface ProviderShare {
    /**
     * The name of the Provider Share.
     */
    name?: string;
}

export interface RecipientInfo {
    /**
     * A boolean status field showing whether the Recipient's activation URL has
     * been exercised or not.
     */
    activated?: boolean;
    /**
     * Full activation url to retrieve the access token. It will be empty if the
     * token is already retrieved.
     */
    activation_url?: string;
    /**
     * The delta sharing authentication type.
     */
    authentication_type?: AuthenticationType;
    /**
     * Cloud vendor of the recipient's Unity Catalog Metstore. This field is only
     * present when the authentication type is `DATABRICKS`.
     */
    cloud?: string;
    /**
     * Description about the recipient.
     */
    comment?: string;
    /**
     * Time at which this recipient was created, in epoch milliseconds.
     */
    created_at?: number;
    /**
     * Username of recipient creator.
     */
    created_by?: string;
    /**
     * The global Unity Catalog metastore id provided by the data recipient.\n
     * This field is only present when the authentication type is `DATABRICKS`.\n
     * The identifier is of format <cloud>:<region>:<metastore-uuid>.
     */
    data_recipient_global_metastore_id?: any /* MISSING TYPE */;
    /**
     * IP Access List
     */
    ip_access_list?: IpAccessList;
    /**
     * Unique identifier of recipient's Unity Catalog Metastore. This field is
     * only present when the authentication type is `DATABRICKS`
     */
    metastore_id?: string;
    /**
     * Name of Recipient.
     */
    name?: string;
    /**
     * Cloud region of the recipient's Unity Catalog Metstore. This field is only
     * present when the authentication type is `DATABRICKS`.
     */
    region?: string;
    /**
     * The one-time sharing code provided by the data recipient. This field is
     * only present when the authentication type is `DATABRICKS`.
     */
    sharing_code?: string;
    /**
     * This field is only present when the authentication type is `TOKEN`.
     */
    tokens?: Array<RecipientTokenInfo>;
    /**
     * Time at which the recipient was updated, in epoch milliseconds.
     */
    updated_at?: number;
    /**
     * Username of recipient updater.
     */
    updated_by?: string;
}

export interface RecipientProfile {
    /**
     * The token used to authorize the recipient.
     */
    bearer_token?: string;
    /**
     * The endpoint for the share to be used by the recipient.
     */
    endpoint?: string;
    /**
     * The version number of the recipient's credentials on a share.
     */
    share_credentials_version?: number;
}

export interface RecipientTokenInfo {
    /**
     * Full activation URL to retrieve the access token. It will be empty if the
     * token is already retrieved.
     */
    activation_url?: string;
    /**
     * Time at which this recipient Token was created, in epoch milliseconds.
     */
    created_at?: number;
    /**
     * Username of recipient token creator.
     */
    created_by?: string;
    /**
     * Expiration timestamp of the token in epoch milliseconds.
     */
    expiration_time?: number;
    /**
     * Unique ID of the recipient token.
     */
    id?: string;
    /**
     * Time at which this recipient Token was updated, in epoch milliseconds.
     */
    updated_at?: number;
    /**
     * Username of recipient Token updater.
     */
    updated_by?: string;
}

/**
 * Get an access token
 */
export interface RetrieveTokenRequest {
    /**
     * Required. The one time activation url. It also accepts activation token.
     */
    activation_url: string;
}

export interface RetrieveTokenResponse {
    /**
     * The token used to authorize the recipient.
     */
    bearerToken?: string;
    /**
     * The endpoint for the share to be used by the recipient.
     */
    endpoint?: string;
    /**
     * Expiration timestamp of the token in epoch milliseconds.
     */
    expirationTime?: string;
    /**
     * These field names must follow the delta sharing protocol.
     */
    shareCredentialsVersion?: number;
}

export interface RotateRecipientToken {
    /**
     * Required. This will set the expiration_time of existing token only to a
     * smaller timestamp, it cannot extend the expiration_time. Use 0 to expire
     * the existing token immediately, negative number will return an error.
     */
    existing_token_expire_in_seconds?: number;
    /**
     * Required. The name of the recipient.
     */
    name: string;
}

export interface SchemaInfo {
    /**
     * Name of parent Catalog.
     */
    catalog_name?: string;
    /**
     * User-provided free-form text description.
     */
    comment?: string;
    /**
     * Time at which this Schema was created, in epoch milliseconds.
     */
    created_at?: number;
    /**
     * Username of Schema creator.
     */
    created_by?: string;
    /**
     * Full name of Schema, in form of <catalog_name>.<schema_name>.
     */
    full_name?: string;
    /**
     * Unique identifier of parent Metastore.
     */
    metastore_id?: string;
    /**
     * Name of Schema, relative to parent Catalog.
     */
    name?: string;
    /**
     * Username of current owner of Schema.
     */
    owner?: string;
    properties?: Record<string, string>;
    /**
     * Storage location for managed tables within schema.
     */
    storage_location?: string;
    /**
     * Storage root URL for managed tables within schema.
     */
    storage_root?: string;
    /**
     * Time at which this Schema was created, in epoch milliseconds.
     */
    updated_at?: number;
    /**
     * Username of user who last modified Schema.
     */
    updated_by?: string;
}

export interface ShareInfo {
    /**
     * User-provided free-form text description.
     */
    comment?: string;
    /**
     * Time at which this Share was created, in epoch milliseconds.
     */
    created_at?: number;
    /**
     * Username of Share creator.
     */
    created_by?: string;
    /**
     * Name of the Share.
     */
    name?: string;
    /**
     * A list of shared data objects within the Share.
     */
    objects?: Array<SharedDataObject>;
    /**
     * Username of current owner of Share.
     */
    owner?: string;
    /**
     * Array of shared data object updates.
     */
    updates?: Array<SharedDataObjectUpdate>;
}

/**
 * Get share permissions
 */
export interface SharePermissionsRequest {
    /**
     * Required. The name of the Recipient.
     */
    name: string;
}

export interface ShareToPrivilegeAssignment {
    /**
     * The privileges assigned to the principal.
     */
    privilege_assignments?: Array<PrivilegeAssignment>;
    /**
     * The share name.
     */
    share_name?: string;
}

export interface SharedDataObject {
    /**
     * The time when this data object is added to the Share, in epoch
     * milliseconds.
     */
    added_at?: number;
    /**
     * Username of the sharer.
     */
    added_by?: string;
    /**
     * Whether to enable cdf or indicate if cdf is enabled on the shared object.
     */
    cdf_enabled?: boolean;
    /**
     * A user-provided comment when adding the data object to the share.
     * [Update:OPT]
     */
    comment?: string;
    /**
     * The type of the data object.
     */
    data_object_type?: string;
    /**
     * A fully qualified name that uniquely identifies a data object.
     *
     * For example, a table's fully qualified name is in the format of
     * `<catalog>.<schema>.<table>`.
     */
    name: string;
    /**
     * Array of partitions for the shared data.
     */
    partitions?: Array<Partition>;
    /**
     * A user-provided new name for the data object within the share. If this new
     * name is not not provided, the object's original name will be used as the
     * `shared_as` name. The `shared_as` name must be unique within a Share. For
     * tables, the new name must follow the format of `<schema>.<table>`.
     */
    shared_as?: string;
    /**
     * The start version associated with the object. This allows data providers
     * to control the lowest object version that is accessible by clients. If
     * specified, clients can query snapshots or changes for versions >=
     * start_version. If not specified, clients can only query starting from the
     * version of the object at the time it was added to the share.
     *
     * NOTE: The start_version should be <= the `current` version of the object.
     */
    start_version?: number;
    /**
     * One of: **ACTIVE**, **PERMISSION_DENIED**.
     */
    status?: SharedDataObjectStatus;
}

/**
 * One of: **ACTIVE**, **PERMISSION_DENIED**.
 */
export type SharedDataObjectStatus = "ACTIVE" | "PERMISSION_DENIED";

export interface SharedDataObjectUpdate {
    /**
     * One of: **ADD**, **REMOVE**, **UPDATE**.
     */
    action?: SharedDataObjectUpdateAction;
    /**
     * The data object that is being added, removed, or updated.
     */
    data_object?: SharedDataObject;
}

/**
 * One of: **ADD**, **REMOVE**, **UPDATE**.
 */
export type SharedDataObjectUpdateAction = "ADD" | "REMOVE" | "UPDATE";

export interface StorageCredentialInfo {
    /**
     * The AWS IAM role configuration.
     */
    aws_iam_role?: AwsIamRole;
    /**
     * The Azure service principal configuration.
     */
    azure_service_principal?: AzureServicePrincipal;
    /**
     * Comment associated with the credential.
     */
    comment?: string;
    /**
     * Time at which this Credential was created, in epoch milliseconds.
     */
    created_at?: number;
    /**
     * Username of credential creator.
     */
    created_by?: string;
    /**
     * The GCP service account key configuration.
     */
    gcp_service_account_key?: GcpServiceAccountKey;
    /**
     * The unique identifier of the credential.
     */
    id?: string;
    /**
     * Unique identifier of parent Metastore.
     */
    metastore_id?: string;
    /**
     * The credential name. The name MUST be unique within the Metastore.
     */
    name?: string;
    /**
     * Optional. Supplying true to this argument skips validation of the created
     * set of credentials.
     */
    skip_validation?: boolean;
    /**
     * Time at which this credential was last modified, in epoch milliseconds.
     */
    updated_at?: number;
    /**
     * Username of user who last modified the credential.
     */
    updated_by?: string;
}

export interface TableInfo {
    /**
     * Name of parent Catalog.
     */
    catalog_name?: string;
    /**
     * This name ('columns') is what the client actually sees as the field name
     * in messages that include PropertiesKVPairs using 'json_inline' (e.g.,
     * TableInfo).
     */
    columns?: Array<ColumnInfo>;
    /**
     * User-provided free-form text description.
     */
    comment?: string;
    /**
     * Time at which this Table was created, in epoch milliseconds.
     */
    created_at?: number;
    /**
     * Username of Table creator.
     */
    created_by?: string;
    /**
     * Unique ID of the data_access_configuration to use.
     */
    data_access_configuration_id?: string;
    /**
     * Data source format
     */
    data_source_format?: DataSourceFormat;
    /**
     * Full name of Table, in form of <catalog_name>.<schema_name>.<table_name>
     */
    full_name?: string;
    /**
     * Unique identifier of parent Metastore.
     */
    metastore_id?: string;
    /**
     * Name of Table, relative to parent Schema.
     */
    name?: string;
    /**
     * Username of current owner of Table.
     */
    owner?: string;
    properties?: Record<string, string>;
    /**
     * Name of parent Schema relative to its parent Catalog.
     */
    schema_name?: string;
    /**
     * List of schemes whose objects can be referenced without qualification.
     */
    sql_path?: string;
    /**
     * Name of the storage credential this table used
     */
    storage_credential_name?: string;
    /**
     * Storage root URL for table (for MANAGED, EXTERNAL tables)
     */
    storage_location?: string;
    /**
     * Name of Table, relative to parent Schema.
     */
    table_id?: string;
    table_type?: TableType;
    /**
     * Time at which this Table was last modified, in epoch milliseconds.
     */
    updated_at?: number;
    /**
     * Username of user who last modified the Table.
     */
    updated_by?: string;
    /**
     * View definition SQL (when table_type == "VIEW")
     */
    view_definition?: string;
}

/**
 * List table summaries
 */
export interface TableSummariesRequest {
    /**
     * Required. Name of parent catalog for tables of interest.
     */
    catalog_name?: string;
    /**
     * Optional. Maximum number of tables to return (page length). Defaults to
     * 10000.
     */
    max_results?: number;
    /**
     * Optional. Opaque token to send for the next page of results (pagination).
     */
    page_token?: string;
    /**
     * Optional. A sql LIKE pattern (% and _) for schema names. All schemas will
     * be returned if not set or empty.
     */
    schema_name_pattern?: string;
    /**
     * Optional. A sql LIKE pattern (% and _) for table names. All tables will be
     * returned if not set or empty.
     */
    table_name_pattern?: string;
}

export interface TableSummary {
    /**
     * The full name of the table.
     */
    full_name?: string;
    table_type?: TableType;
}

export type TableType =
    | "EXTERNAL"
    | "MANAGED"
    | "MATERIALIZED_VIEW"
    | "STREAMING_TABLE"
    | "VIEW";

/**
 * Delete an assignment
 */
export interface UnassignRequest {
    /**
     * Query for the ID of the Metastore to delete.
     */
    metastore_id: string;
    /**
     * A workspace ID.
     */
    workspace_id: number;
}

export interface UpdateCatalog {
    /**
     * User-provided free-form text description.
     */
    comment?: string;
    /**
     * Name of Catalog.
     */
    name?: string;
    /**
     * Username of current owner of Catalog.
     */
    owner?: string;
    properties?: Record<string, string>;
}

export interface UpdateExternalLocation {
    /**
     * User-provided free-form text description.
     */
    comment?: string;
    /**
     * Current name of the Storage Credential this location uses.
     */
    credential_name?: string;
    /**
     * Force update even if changing url invalidates dependent external tables or
     * mounts.
     */
    force?: boolean;
    /**
     * Name of the External Location.
     */
    name?: string;
    /**
     * The owner of the External Location.
     */
    owner?: string;
    /**
     * Indicates whether the external location is read-only.
     */
    read_only?: boolean;
    /**
     * Skips validation of the storage credential associated with the external
     * location.
     */
    skip_validation?: boolean;
    /**
     * Path URL of the External Location.
     */
    url?: string;
}

export interface UpdateMetastore {
    /**
     * Unique identifier of (Default) Data Access Configuration
     */
    default_data_access_config_id?: string;
    /**
     * Whether Delta Sharing is enabled on this metastore.
     */
    delta_sharing_enabled?: boolean;
    /**
     * The lifetime of delta sharing recipient token in seconds
     */
    delta_sharing_recipient_token_lifetime_in_seconds?: number;
    /**
     * Required. Unique ID of the Metastore (from URL).
     */
    id: string;
    /**
     * Name of Metastore.
     */
    name?: string;
    /**
     * The owner of the metastore.
     */
    owner?: string;
    /**
     * UUID of storage credential to access storage_root
     */
    storage_root_credential_id?: string;
}

export interface UpdateMetastoreAssignment {
    /**
     * The name of the default catalog for the Metastore.
     */
    default_catalog_name?: string;
    /**
     * The unique ID of the Metastore.
     */
    metastore_id?: string;
    /**
     * A workspace ID.
     */
    workspace_id: number;
}

export interface UpdatePermissions {
    /**
     * Array of permissions change objects.
     */
    changes?: Array<PermissionsChange>;
    /**
     * Required. Unique identifier (full name) of Securable (from URL).
     */
    full_name: string;
    /**
     * Optional. List permissions granted to this principal.
     */
    principal?: string;
    /**
     * Required. Type of Securable (from URL).
     */
    securable_type: string;
}

export interface UpdateProvider {
    /**
     * Description about the provider.
     */
    comment?: string;
    /**
     * The name of the Provider.
     */
    name?: string;
    /**
     * Username of Provider owner.
     */
    owner?: string;
    /**
     * This field is required when the authentication_type is `TOKEN` or not
     * provided.
     */
    recipient_profile_str?: string;
}

export interface UpdateRecipient {
    /**
     * Description about the recipient.
     */
    comment?: string;
    /**
     * IP Access List
     */
    ip_access_list?: IpAccessList;
    /**
     * Name of Recipient.
     */
    name?: string;
}

export interface UpdateSchema {
    /**
     * Name of parent Catalog.
     */
    catalog_name?: string;
    /**
     * User-provided free-form text description.
     */
    comment?: string;
    /**
     * Required. Full name of the schema (from URL).
     */
    full_name: string;
    /**
     * Name of Schema, relative to parent Catalog.
     */
    name?: string;
    /**
     * Username of current owner of Schema.
     */
    owner?: string;
    properties?: Record<string, string>;
    /**
     * Storage root URL for managed tables within schema.
     */
    storage_root?: string;
}

export interface UpdateShare {
    /**
     * User-provided free-form text description.
     */
    comment?: string;
    /**
     * Name of the Share.
     */
    name?: string;
    /**
     * Username of current owner of Share.
     */
    owner?: string;
    /**
     * Array of shared data object updates.
     */
    updates?: Array<SharedDataObjectUpdate>;
}

export interface UpdateSharePermissions {
    /**
     * Array of permission changes.
     */
    changes?: Array<PermissionsChange>;
    /**
     * Required. The name of the share.
     */
    name: string;
}

export interface UpdateStorageCredential {
    /**
     * The AWS IAM role configuration.
     */
    aws_iam_role?: AwsIamRole;
    /**
     * The Azure service principal configuration.
     */
    azure_service_principal?: AzureServicePrincipal;
    /**
     * Comment associated with the credential.
     */
    comment?: string;
    /**
     * The GCP service account key configuration.
     */
    gcp_service_account_key?: GcpServiceAccountKey;
    /**
     * The credential name. The name MUST be unique within the Metastore.
     */
    name?: string;
    /**
     * Username of current owner of credential.
     */
    owner?: string;
}

export interface EmptyResponse {}
