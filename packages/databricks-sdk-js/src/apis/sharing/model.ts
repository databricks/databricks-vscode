/* eslint-disable @typescript-eslint/naming-convention */

// Code generated from OpenAPI specs by Databricks SDK Generator. DO NOT EDIT.

// all definitions in this file are in alphabetical order
/**
 * The delta sharing authentication type.
 */
export type AuthenticationType = "DATABRICKS" | "TOKEN";

export interface CentralCleanRoomInfo {
    /**
     * All assets from all collaborators that are available in the clean room.
     * Only one of table_info or notebook_info will be filled in.
     */
    clean_room_assets?: Array<CleanRoomAssetInfo>;
    /**
     * All collaborators who are in the clean room.
     */
    collaborators?: Array<CleanRoomCollaboratorInfo>;
    /**
     * The collaborator who created the clean room.
     */
    creator?: CleanRoomCollaboratorInfo;
    /**
     * The cloud where clean room tasks will be run.
     */
    station_cloud?: string;
    /**
     * The region where clean room tasks will be run.
     */
    station_region?: string;
}

export interface CleanRoomAssetInfo {
    /**
     * Time at which this asset was added, in epoch milliseconds.
     */
    added_at?: number;
    /**
     * Details about the notebook asset.
     */
    notebook_info?: CleanRoomNotebookInfo;
    /**
     * The collaborator who owns the asset.
     */
    owner?: CleanRoomCollaboratorInfo;
    /**
     * Details about the table asset.
     */
    table_info?: CleanRoomTableInfo;
    /**
     * Time at which this asset was updated, in epoch milliseconds.
     */
    updated_at?: number;
}

export interface CleanRoomCatalog {
    /**
     * Name of the catalog in the clean room station. Empty for notebooks.
     */
    catalog_name?: string;
    /**
     * The details of the shared notebook files.
     */
    notebook_files?: Array<SharedDataObject>;
    /**
     * The details of the shared tables.
     */
    tables?: Array<SharedDataObject>;
}

export interface CleanRoomCatalogUpdate {
    /**
     * The name of the catalog to update assets.
     */
    catalog_name?: string;
    /**
     * The updates to the assets in the catalog.
     */
    updates?: SharedDataObjectUpdate;
}

export interface CleanRoomCollaboratorInfo {
    /**
     * The global Unity Catalog metastore id of the collaborator. Also known as
     * the sharing identifier. The identifier is of format
     * __cloud__:__region__:__metastore-uuid__.
     */
    global_metastore_id?: string;
    /**
     * The organization name of the collaborator. This is configured in the
     * metastore for Delta Sharing and is used to identify the organization to
     * other collaborators.
     */
    organization_name?: string;
}

export interface CleanRoomInfo {
    /**
     * User-provided free-form text description.
     */
    comment?: string;
    /**
     * Time at which this clean room was created, in epoch milliseconds.
     */
    created_at?: number;
    /**
     * Username of clean room creator.
     */
    created_by?: string;
    /**
     * Catalog aliases shared by the current collaborator with asset details.
     */
    local_catalogs?: Array<CleanRoomCatalog>;
    /**
     * Name of the clean room.
     */
    name?: string;
    /**
     * Username of current owner of clean room.
     */
    owner?: string;
    /**
     * Central clean room details.
     */
    remote_detailed_info?: CentralCleanRoomInfo;
    /**
     * Time at which this clean room was updated, in epoch milliseconds.
     */
    updated_at?: number;
    /**
     * Username of clean room updater.
     */
    updated_by?: string;
}

export interface CleanRoomNotebookInfo {
    /**
     * The base64 representation of the notebook content in HTML.
     */
    notebook_content?: string;
    /**
     * The name of the notebook.
     */
    notebook_name?: string;
}

export interface CleanRoomTableInfo {
    /**
     * Name of parent catalog.
     */
    catalog_name?: string;
    /**
     * The array of __ColumnInfo__ definitions of the table's columns.
     */
    columns?: Array<ColumnInfo>;
    /**
     * Full name of table, in form of
     * __catalog_name__.__schema_name__.__table_name__
     */
    full_name?: string;
    /**
     * Name of table, relative to parent schema.
     */
    name?: string;
    /**
     * Name of parent schema relative to its parent catalog.
     */
    schema_name?: string;
}

export interface ColumnInfo {
    /**
     * User-provided free-form text description.
     */
    comment?: string;
    mask?: ColumnMask;
    /**
     * Name of Column.
     */
    name?: string;
    /**
     * Whether field may be Null (default: true).
     */
    nullable?: boolean;
    /**
     * Partition index for column.
     */
    partition_index?: number;
    /**
     * Ordinal position of column (starting at position 0).
     */
    position?: number;
    /**
     * Format of IntervalType.
     */
    type_interval_type?: string;
    /**
     * Full data type specification, JSON-serialized.
     */
    type_json?: string;
    /**
     * Name of type (INT, STRUCT, MAP, etc.).
     */
    type_name?: ColumnTypeName;
    /**
     * Digits of precision; required for DecimalTypes.
     */
    type_precision?: number;
    /**
     * Digits to right of decimal; Required for DecimalTypes.
     */
    type_scale?: number;
    /**
     * Full data type specification as SQL/catalogString text.
     */
    type_text?: string;
}

export interface ColumnMask {
    /**
     * The full name of the column mask SQL UDF.
     */
    function_name?: string;
    /**
     * The list of additional table columns to be passed as input to the column
     * mask function. The first arg of the mask function should be of the type of
     * the column being masked and the types of the rest of the args should match
     * the types of columns in 'using_column_names'.
     */
    using_column_names?: Array<string>;
}

/**
 * Name of type (INT, STRUCT, MAP, etc.).
 */
export type ColumnTypeName =
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
    | "TABLE_TYPE"
    | "TIMESTAMP"
    | "TIMESTAMP_NTZ"
    | "USER_DEFINED_TYPE";

export interface CreateCleanRoom {
    /**
     * User-provided free-form text description.
     */
    comment?: string;
    /**
     * Name of the clean room.
     */
    name: string;
    /**
     * Central clean room details.
     */
    remote_detailed_info: CentralCleanRoomInfo;
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
     * This field is required when the __authentication_type__ is **TOKEN** or
     * not provided.
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
     * The global Unity Catalog metastore id provided by the data recipient. This
     * field is required when the __authentication_type__ is **DATABRICKS**. The
     * identifier is of format __cloud__:__region__:__metastore-uuid__.
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
     * Username of the recipient owner.
     */
    owner?: string;
    /**
     * Recipient properties as map of string key-value pairs.
     */
    properties_kvpairs?: SecurablePropertiesKvPairs;
    /**
     * The one-time sharing code provided by the data recipient. This field is
     * required when the __authentication_type__ is **DATABRICKS**.
     */
    sharing_code?: string;
}

export interface CreateShare {
    /**
     * User-provided free-form text description.
     */
    comment?: string;
    /**
     * Name of the share.
     */
    name: string;
}

/**
 * Delete a clean room
 */
export interface DeleteCleanRoomRequest {
    /**
     * The name of the clean room.
     */
    name_arg: string;
}

/**
 * Delete a provider
 */
export interface DeleteProviderRequest {
    /**
     * Name of the provider.
     */
    name: string;
}

/**
 * Delete a share recipient
 */
export interface DeleteRecipientRequest {
    /**
     * Name of the recipient.
     */
    name: string;
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
 * Get a share activation URL
 */
export interface GetActivationUrlInfoRequest {
    /**
     * The one time activation url. It also accepts activation token.
     */
    activation_url: string;
}

/**
 * Get a clean room
 */
export interface GetCleanRoomRequest {
    /**
     * Whether to include remote details (central) on the clean room.
     */
    include_remote_details?: boolean;
    /**
     * The name of the clean room.
     */
    name_arg: string;
}

/**
 * Get a provider
 */
export interface GetProviderRequest {
    /**
     * Name of the provider.
     */
    name: string;
}

/**
 * Get a share recipient
 */
export interface GetRecipientRequest {
    /**
     * Name of the recipient.
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

export interface IpAccessList {
    /**
     * Allowed IP Addresses in CIDR notation. Limit of 100.
     */
    allowed_ip_addresses?: Array<string>;
}

export interface ListCleanRoomsResponse {
    /**
     * An array of clean rooms. Remote details (central) are not included.
     */
    clean_rooms?: Array<CleanRoomInfo>;
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
 * List shares by Provider
 */
export interface ListSharesRequest {
    /**
     * Name of the provider in which to list shares.
     */
    name: string;
}

export interface ListSharesResponse {
    /**
     * An array of data share information objects.
     */
    shares?: Array<ShareInfo>;
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
    | "USE_MARKETPLACE_ASSETS"
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
     * Cloud vendor of the provider's UC metastore. This field is only present
     * when the __authentication_type__ is **DATABRICKS**.
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
     * present when the __authentication_type__ is **DATABRICKS**. The identifier
     * is of format <cloud>:<region>:<metastore-uuid>.
     */
    data_provider_global_metastore_id?: string;
    /**
     * UUID of the provider's UC metastore. This field is only present when the
     * __authentication_type__ is **DATABRICKS**.
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
     * This field is only present when the authentication_type is `TOKEN` or not
     * provided.
     */
    recipient_profile_str?: string;
    /**
     * Cloud region of the provider's UC metastore. This field is only present
     * when the __authentication_type__ is **DATABRICKS**.
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
     * present when the __authentication_type__ is **DATABRICKS**`.
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
     * The global Unity Catalog metastore id provided by the data recipient. This
     * field is only present when the __authentication_type__ is **DATABRICKS**.
     * The identifier is of format __cloud__:__region__:__metastore-uuid__.
     */
    data_recipient_global_metastore_id?: any /* MISSING TYPE */;
    /**
     * IP Access List
     */
    ip_access_list?: IpAccessList;
    /**
     * Unique identifier of recipient's Unity Catalog metastore. This field is
     * only present when the __authentication_type__ is **DATABRICKS**
     */
    metastore_id?: string;
    /**
     * Name of Recipient.
     */
    name?: string;
    /**
     * Username of the recipient owner.
     */
    owner?: string;
    /**
     * Recipient properties as map of string key-value pairs.
     */
    properties_kvpairs?: SecurablePropertiesKvPairs;
    /**
     * Cloud region of the recipient's Unity Catalog Metstore. This field is only
     * present when the __authentication_type__ is **DATABRICKS**.
     */
    region?: string;
    /**
     * The one-time sharing code provided by the data recipient. This field is
     * only present when the __authentication_type__ is **DATABRICKS**.
     */
    sharing_code?: string;
    /**
     * This field is only present when the __authentication_type__ is **TOKEN**.
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
     * The one time activation url. It also accepts activation token.
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
     * The expiration time of the bearer token in ISO 8601 format. This will set
     * the expiration_time of existing token only to a smaller timestamp, it
     * cannot extend the expiration_time. Use 0 to expire the existing token
     * immediately, negative number will return an error.
     */
    existing_token_expire_in_seconds: number;
    /**
     * The name of the recipient.
     */
    name: string;
}

/**
 * An object with __properties__ containing map of key-value properties attached
 * to the securable.
 */
export interface SecurablePropertiesKvPairs {
    /**
     * A map of key-value properties attached to the securable.
     */
    properties: Record<string, string>;
}

/**
 * A map of key-value properties attached to the securable.
 */
export type SecurablePropertiesMap = Record<string, string>;

export interface ShareInfo {
    /**
     * User-provided free-form text description.
     */
    comment?: string;
    /**
     * Time at which this share was created, in epoch milliseconds.
     */
    created_at?: number;
    /**
     * Username of share creator.
     */
    created_by?: string;
    /**
     * Name of the share.
     */
    name?: string;
    /**
     * A list of shared data objects within the share.
     */
    objects?: Array<SharedDataObject>;
    /**
     * Username of current owner of share.
     */
    owner?: string;
    /**
     * Time at which this share was updated, in epoch milliseconds.
     */
    updated_at?: number;
    /**
     * Username of share updater.
     */
    updated_by?: string;
}

/**
 * Get recipient share permissions
 */
export interface SharePermissionsRequest {
    /**
     * The name of the Recipient.
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
     * The time when this data object is added to the share, in epoch
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
     * Whether to enable or disable sharing of data history. If not specified,
     * the default is **DISABLED**.
     */
    history_data_sharing_status?: SharedDataObjectHistoryDataSharingStatus;
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
     * name is not provided, the object's original name will be used as the
     * `shared_as` name. The `shared_as` name must be unique within a share. For
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
 * Whether to enable or disable sharing of data history. If not specified, the
 * default is **DISABLED**.
 */
export type SharedDataObjectHistoryDataSharingStatus = "DISABLED" | "ENABLED";

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

export interface UpdateCleanRoom {
    /**
     * Array of shared data object updates.
     */
    catalog_updates?: Array<CleanRoomCatalogUpdate>;
    /**
     * User-provided free-form text description.
     */
    comment?: string;
    /**
     * Name of the clean room.
     */
    name?: string;
    /**
     * The name of the clean room.
     */
    name_arg: string;
    /**
     * Username of current owner of clean room.
     */
    owner?: string;
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
     * This field is required when the __authentication_type__ is **TOKEN** or
     * not provided.
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
    /**
     * Username of the recipient owner.
     */
    owner?: string;
    /**
     * Recipient properties as map of string key-value pairs. When provided in
     * update request, the specified properties will override the existing
     * properties. To add and remove properties, one would need to perform a
     * read-modify-write.
     */
    properties_kvpairs?: SecurablePropertiesKvPairs;
}

export interface UpdateShare {
    /**
     * User-provided free-form text description.
     */
    comment?: string;
    /**
     * Name of the share.
     */
    name?: string;
    /**
     * Username of current owner of share.
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
    changes?: Array<any /* MISSING TYPE */>;
    /**
     * The name of the share.
     */
    name: string;
}
