/* eslint-disable @typescript-eslint/naming-convention */

// Code generated from OpenAPI specs by Databricks SDK Generator. DO NOT EDIT.

// all definitions in this file are in alphabetical order
/**
 * The delta sharing authentication type.
 */
export type AuthenticationType = "DATABRICKS" | "TOKEN";

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
     * Time at which this catalog was created, in epoch milliseconds.
     */
    created_at?: number;
    /**
     * Username of catalog creator.
     */
    created_by?: string;
    effective_auto_maintenance_flag?: EffectiveAutoMaintenanceFlag;
    /**
     * Whether auto maintenance should be enabled for this object and objects
     * under it.
     */
    enable_auto_maintenance?: EnableAutoMaintenance;
    /**
     * Unique identifier of parent metastore.
     */
    metastore_id?: string;
    /**
     * Name of catalog.
     */
    name?: string;
    /**
     * Username of current owner of catalog.
     */
    owner?: string;
    /**
     * A map of key-value properties attached to the securable.
     */
    properties?: Record<string, string>;
    /**
     * The name of delta sharing provider.
     *
     * A Delta Sharing catalog is a catalog that is based on a Delta share on a
     * remote sharing server.
     */
    provider_name?: string;
    /**
     * The name of the share under the share provider.
     */
    share_name?: string;
    /**
     * Storage Location URL (full path) for managed tables within catalog.
     */
    storage_location?: string;
    /**
     * Storage root URL for managed tables within catalog.
     */
    storage_root?: string;
    /**
     * Time at which this catalog was last modified, in epoch milliseconds.
     */
    updated_at?: number;
    /**
     * Username of user who last modified catalog.
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
     * The full name of the column maks SQL UDF.
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
    | "USER_DEFINED_TYPE";

export interface CreateCatalog {
    /**
     * User-provided free-form text description.
     */
    comment?: string;
    /**
     * Name of catalog.
     */
    name: string;
    /**
     * A map of key-value properties attached to the securable.
     */
    properties?: Record<string, string>;
    /**
     * The name of delta sharing provider.
     *
     * A Delta Sharing catalog is a catalog that is based on a Delta share on a
     * remote sharing server.
     */
    provider_name?: string;
    /**
     * The name of the share under the share provider.
     */
    share_name?: string;
    /**
     * Storage root URL for managed tables within catalog.
     */
    storage_root?: string;
}

export interface CreateExternalLocation {
    /**
     * User-provided free-form text description.
     */
    comment?: string;
    /**
     * Name of the storage credential used with this location.
     */
    credential_name: string;
    /**
     * Name of the external location.
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
     * Path URL of the external location.
     */
    url: string;
}

export interface CreateFunction {
    /**
     * Name of parent catalog.
     */
    catalog_name: string;
    /**
     * User-provided free-form text description.
     */
    comment?: string;
    /**
     * Scalar function return data type.
     */
    data_type: ColumnTypeName;
    /**
     * External function language.
     */
    external_language?: string;
    /**
     * External function name.
     */
    external_name?: string;
    /**
     * Pretty printed function data type.
     */
    full_data_type: string;
    /**
     * The array of __FunctionParameterInfo__ definitions of the function's
     * parameters.
     */
    input_params: Array<FunctionParameterInfo>;
    /**
     * Whether the function is deterministic.
     */
    is_deterministic: boolean;
    /**
     * Function null call.
     */
    is_null_call: boolean;
    /**
     * Name of function, relative to parent schema.
     */
    name: string;
    /**
     * Function parameter style. **S** is the value for SQL.
     */
    parameter_style: CreateFunctionParameterStyle;
    /**
     * A map of key-value properties attached to the securable.
     */
    properties?: Record<string, string>;
    /**
     * Table function return parameters.
     */
    return_params: Array<FunctionParameterInfo>;
    /**
     * Function language. When **EXTERNAL** is used, the language of the routine
     * function should be specified in the __external_language__ field, and the
     * __return_params__ of the function cannot be used (as **TABLE** return type
     * is not supported), and the __sql_data_access__ field must be **NO_SQL**.
     */
    routine_body: CreateFunctionRoutineBody;
    /**
     * Function body.
     */
    routine_definition: string;
    /**
     * Function dependencies.
     */
    routine_dependencies: Array<Dependency>;
    /**
     * Name of parent schema relative to its parent catalog.
     */
    schema_name: string;
    /**
     * Function security type.
     */
    security_type: CreateFunctionSecurityType;
    /**
     * Specific name of the function; Reserved for future use.
     */
    specific_name: string;
    /**
     * Function SQL data access.
     */
    sql_data_access: CreateFunctionSqlDataAccess;
    /**
     * List of schemes whose objects can be referenced without qualification.
     */
    sql_path?: string;
}

/**
 * Function parameter style. **S** is the value for SQL.
 */
export type CreateFunctionParameterStyle = "S";

/**
 * Function language. When **EXTERNAL** is used, the language of the routine
 * function should be specified in the __external_language__ field, and the
 * __return_params__ of the function cannot be used (as **TABLE** return type is
 * not supported), and the __sql_data_access__ field must be **NO_SQL**.
 */
export type CreateFunctionRoutineBody = "EXTERNAL" | "SQL";

/**
 * Function security type.
 */
export type CreateFunctionSecurityType = "DEFINER";

/**
 * Function SQL data access.
 */
export type CreateFunctionSqlDataAccess =
    | "CONTAINS_SQL"
    | "NO_SQL"
    | "READS_SQL_DATA";

export interface CreateMetastore {
    /**
     * The user-specified name of the metastore.
     */
    name: string;
    /**
     * Cloud region which the metastore serves (e.g., `us-west-2`, `westus`). If
     * this field is omitted, the region of the workspace receiving the request
     * will be used.
     */
    region?: string;
    /**
     * The storage root URL for metastore
     */
    storage_root: string;
}

export interface CreateMetastoreAssignment {
    /**
     * The name of the default catalog in the metastore.
     */
    default_catalog_name: string;
    /**
     * The unique ID of the metastore.
     */
    metastore_id: string;
    /**
     * Workspace ID.
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
     * The global Unity Catalog metastore id provided by the data recipient.
     *
     * This field is required when the __authentication_type__ is **DATABRICKS**.
     *
     * The identifier is of format __cloud__:__region__:__metastore-uuid__.
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
    properties_kvpairs?: any /* MISSING TYPE */;
    /**
     * The one-time sharing code provided by the data recipient. This field is
     * required when the __authentication_type__ is **DATABRICKS**.
     */
    sharing_code?: string;
}

export interface CreateSchema {
    /**
     * Name of parent catalog.
     */
    catalog_name: string;
    /**
     * User-provided free-form text description.
     */
    comment?: string;
    /**
     * Name of schema, relative to parent catalog.
     */
    name: string;
    /**
     * A map of key-value properties attached to the securable.
     */
    properties?: Record<string, string>;
    /**
     * Storage root URL for managed tables within schema.
     */
    storage_root?: string;
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
     * Databricks Unity Catalog metastore ID
     */
    metastore_id: string;
    /**
     * The credential name. The name must be unique within the metastore.
     */
    name: string;
    /**
     * Whether the storage credential is only usable for read operations.
     */
    read_only?: boolean;
    /**
     * Supplying true to this argument skips validation of the created
     * credential.
     */
    skip_validation?: boolean;
}

export interface CreateTableConstraint {
    /**
     * A table constraint, as defined by *one* of the following fields being set:
     * __primary_key_constraint__, __foreign_key_constraint__,
     * __named_table_constraint__.
     */
    constraint: TableConstraint;
    /**
     * The full name of the table referenced by the constraint.
     */
    full_name_arg: string;
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
 * Delete a metastore assignment
 */
export interface DeleteAccountMetastoreAssignmentRequest {
    /**
     * Databricks Unity Catalog metastore ID
     */
    metastore_id: string;
    /**
     * Workspace ID.
     */
    workspace_id: number;
}

/**
 * Delete a metastore
 */
export interface DeleteAccountMetastoreRequest {
    /**
     * Databricks Unity Catalog metastore ID
     */
    metastore_id: string;
}

/**
 * Delete a catalog
 */
export interface DeleteCatalogRequest {
    /**
     * Force deletion even if the catalog is not empty.
     */
    force?: boolean;
    /**
     * The name of the catalog.
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
     * Name of the external location.
     */
    name: string;
}

/**
 * Delete a function
 */
export interface DeleteFunctionRequest {
    /**
     * Force deletion even if the function is notempty.
     */
    force?: boolean;
    /**
     * The fully-qualified name of the function (of the form
     * __catalog_name__.__schema_name__.__function__name__).
     */
    name: string;
}

/**
 * Delete a metastore
 */
export interface DeleteMetastoreRequest {
    /**
     * Force deletion even if the metastore is not empty. Default is false.
     */
    force?: boolean;
    /**
     * Unique ID of the metastore.
     */
    id: string;
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
 * Delete a schema
 */
export interface DeleteSchemaRequest {
    /**
     * Full name of the schema.
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
     * Name of the storage credential.
     */
    name: string;
}

/**
 * Delete a table constraint
 */
export interface DeleteTableConstraintRequest {
    /**
     * If true, try deleting all child constraints of the current constraint.
     *
     * If false, reject this operation if the current constraint has any child
     * constraints.
     */
    cascade: boolean;
    /**
     * The name of the constraint to delete.
     */
    constraint_name: string;
    /**
     * Full name of the table referenced by the constraint.
     */
    full_name: string;
}

/**
 * Delete a table
 */
export interface DeleteTableRequest {
    /**
     * Full name of the table.
     */
    full_name: string;
}

/**
 * A dependency of a SQL object. Either the __table__ field or the __function__
 * field must be defined.
 */
export interface Dependency {
    /**
     * A function that is dependent on a SQL object.
     */
    function?: FunctionDependency;
    /**
     * A table that is dependent on a SQL object.
     */
    table?: TableDependency;
}

export interface EffectiveAutoMaintenanceFlag {
    /**
     * The name of the object from which the flag was inherited. If there was no
     * inheritance, this field is left blank.
     */
    inherited_from_name?: string;
    /**
     * The type of the object from which the flag was inherited. If there was no
     * inheritance, this field is left blank.
     */
    inherited_from_type?: EffectiveAutoMaintenanceFlagInheritedFromType;
    /**
     * Whether auto maintenance should be enabled for this object and objects
     * under it.
     */
    value: EnableAutoMaintenance;
}

/**
 * The type of the object from which the flag was inherited. If there was no
 * inheritance, this field is left blank.
 */
export type EffectiveAutoMaintenanceFlagInheritedFromType =
    | "CATALOG"
    | "SCHEMA";

export interface EffectivePermissionsList {
    /**
     * The privileges conveyed to each principal (either directly or via
     * inheritance)
     */
    privilege_assignments?: Array<EffectivePrivilegeAssignment>;
}

export interface EffectivePrivilege {
    /**
     * The full name of the object that conveys this privilege via inheritance.
     *
     * This field is omitted when privilege is not inherited (it's assigned to
     * the securable itself).
     */
    inherited_from_name?: string;
    /**
     * The type of the object that conveys this privilege via inheritance.
     *
     * This field is omitted when privilege is not inherited (it's assigned to
     * the securable itself).
     */
    inherited_from_type?: SecurableType;
    /**
     * The privilege assigned to the principal.
     */
    privilege?: Privilege;
}

export interface EffectivePrivilegeAssignment {
    /**
     * The principal (user email address or group name).
     */
    principal?: string;
    /**
     * The privileges conveyed to the principal (either directly or via
     * inheritance).
     */
    privileges?: Array<EffectivePrivilege>;
}

/**
 * Whether auto maintenance should be enabled for this object and objects under
 * it.
 */
export type EnableAutoMaintenance = "DISABLE" | "ENABLE" | "INHERIT";

export interface ExternalLocationInfo {
    /**
     * User-provided free-form text description.
     */
    comment?: string;
    /**
     * Time at which this external location was created, in epoch milliseconds.
     */
    created_at?: number;
    /**
     * Username of external location creator.
     */
    created_by?: string;
    /**
     * Unique ID of the location's storage credential.
     */
    credential_id?: string;
    /**
     * Name of the storage credential used with this location.
     */
    credential_name?: string;
    /**
     * Unique identifier of metastore hosting the external location.
     */
    metastore_id?: string;
    /**
     * Name of the external location.
     */
    name?: string;
    /**
     * The owner of the external location.
     */
    owner?: string;
    /**
     * Indicates whether the external location is read-only.
     */
    read_only?: boolean;
    /**
     * Time at which external location this was last modified, in epoch
     * milliseconds.
     */
    updated_at?: number;
    /**
     * Username of user who last modified the external location.
     */
    updated_by?: string;
    /**
     * Path URL of the external location.
     */
    url?: string;
}

export interface ForeignKeyConstraint {
    /**
     * Column names for this constraint.
     */
    child_columns: Array<string>;
    /**
     * The name of the constraint.
     */
    name: string;
    /**
     * Column names for this constraint.
     */
    parent_columns: Array<string>;
    /**
     * The full name of the parent constraint.
     */
    parent_table: string;
}

/**
 * A function that is dependent on a SQL object.
 */
export interface FunctionDependency {
    /**
     * Full name of the dependent function, in the form of
     * __catalog_name__.__schema_name__.__function_name__.
     */
    function_full_name: string;
}

export interface FunctionInfo {
    /**
     * Name of parent catalog.
     */
    catalog_name?: string;
    /**
     * User-provided free-form text description.
     */
    comment?: string;
    /**
     * Time at which this function was created, in epoch milliseconds.
     */
    created_at?: number;
    /**
     * Username of function creator.
     */
    created_by?: string;
    /**
     * Scalar function return data type.
     */
    data_type?: ColumnTypeName;
    /**
     * External function language.
     */
    external_language?: string;
    /**
     * External function name.
     */
    external_name?: string;
    /**
     * Pretty printed function data type.
     */
    full_data_type?: string;
    /**
     * Full name of function, in form of
     * __catalog_name__.__schema_name__.__function__name__
     */
    full_name?: string;
    /**
     * Id of Function, relative to parent schema.
     */
    function_id?: string;
    /**
     * The array of __FunctionParameterInfo__ definitions of the function's
     * parameters.
     */
    input_params?: Array<FunctionParameterInfo>;
    /**
     * Whether the function is deterministic.
     */
    is_deterministic?: boolean;
    /**
     * Function null call.
     */
    is_null_call?: boolean;
    /**
     * Unique identifier of parent metastore.
     */
    metastore_id?: string;
    /**
     * Name of function, relative to parent schema.
     */
    name?: string;
    /**
     * Username of current owner of function.
     */
    owner?: string;
    /**
     * Function parameter style. **S** is the value for SQL.
     */
    parameter_style?: FunctionInfoParameterStyle;
    /**
     * A map of key-value properties attached to the securable.
     */
    properties?: Record<string, string>;
    /**
     * Table function return parameters.
     */
    return_params?: Array<FunctionParameterInfo>;
    /**
     * Function language. When **EXTERNAL** is used, the language of the routine
     * function should be specified in the __external_language__ field, and the
     * __return_params__ of the function cannot be used (as **TABLE** return type
     * is not supported), and the __sql_data_access__ field must be **NO_SQL**.
     */
    routine_body?: FunctionInfoRoutineBody;
    /**
     * Function body.
     */
    routine_definition?: string;
    /**
     * Function dependencies.
     */
    routine_dependencies?: Array<Dependency>;
    /**
     * Name of parent schema relative to its parent catalog.
     */
    schema_name?: string;
    /**
     * Function security type.
     */
    security_type?: FunctionInfoSecurityType;
    /**
     * Specific name of the function; Reserved for future use.
     */
    specific_name?: string;
    /**
     * Function SQL data access.
     */
    sql_data_access?: FunctionInfoSqlDataAccess;
    /**
     * List of schemes whose objects can be referenced without qualification.
     */
    sql_path?: string;
    /**
     * Time at which this function was created, in epoch milliseconds.
     */
    updated_at?: number;
    /**
     * Username of user who last modified function.
     */
    updated_by?: string;
}

/**
 * Function parameter style. **S** is the value for SQL.
 */
export type FunctionInfoParameterStyle = "S";

/**
 * Function language. When **EXTERNAL** is used, the language of the routine
 * function should be specified in the __external_language__ field, and the
 * __return_params__ of the function cannot be used (as **TABLE** return type is
 * not supported), and the __sql_data_access__ field must be **NO_SQL**.
 */
export type FunctionInfoRoutineBody = "EXTERNAL" | "SQL";

/**
 * Function security type.
 */
export type FunctionInfoSecurityType = "DEFINER";

/**
 * Function SQL data access.
 */
export type FunctionInfoSqlDataAccess =
    | "CONTAINS_SQL"
    | "NO_SQL"
    | "READS_SQL_DATA";

export interface FunctionParameterInfo {
    /**
     * User-provided free-form text description.
     */
    comment?: string;
    /**
     * Name of parameter.
     */
    name: string;
    /**
     * Default value of the parameter.
     */
    parameter_default?: string;
    /**
     * The mode of the function parameter.
     */
    parameter_mode?: FunctionParameterMode;
    /**
     * The type of function parameter.
     */
    parameter_type?: FunctionParameterType;
    /**
     * Ordinal position of column (starting at position 0).
     */
    position: number;
    /**
     * Format of IntervalType.
     */
    type_interval_type?: string;
    /**
     * Full data type spec, JSON-serialized.
     */
    type_json?: string;
    /**
     * Name of type (INT, STRUCT, MAP, etc.).
     */
    type_name: ColumnTypeName;
    /**
     * Digits of precision; required on Create for DecimalTypes.
     */
    type_precision?: number;
    /**
     * Digits to right of decimal; Required on Create for DecimalTypes.
     */
    type_scale?: number;
    /**
     * Full data type spec, SQL/catalogString text.
     */
    type_text: string;
}

/**
 * The mode of the function parameter.
 */
export type FunctionParameterMode = "IN";

/**
 * The type of function parameter.
 */
export type FunctionParameterType = "COLUMN" | "PARAM";

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
 * Gets the metastore assignment for a workspace
 */
export interface GetAccountMetastoreAssignmentRequest {
    /**
     * Workspace ID.
     */
    workspace_id: number;
}

/**
 * Get a metastore
 */
export interface GetAccountMetastoreRequest {
    /**
     * Databricks Unity Catalog metastore ID
     */
    metastore_id: string;
}

/**
 * Gets the named storage credential
 */
export interface GetAccountStorageCredentialRequest {
    /**
     * Databricks Unity Catalog metastore ID
     */
    metastore_id: string;
    /**
     * Name of the storage credential.
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
 * Get a catalog
 */
export interface GetCatalogRequest {
    /**
     * The name of the catalog.
     */
    name: string;
}

/**
 * Get effective permissions
 */
export interface GetEffectiveRequest {
    /**
     * Full name of securable.
     */
    full_name: string;
    /**
     * If provided, only the effective permissions for the specified principal
     * (user or group) are returned.
     */
    principal?: string;
    /**
     * Type of securable.
     */
    securable_type: SecurableType;
}

/**
 * Get an external location
 */
export interface GetExternalLocationRequest {
    /**
     * Name of the external location.
     */
    name: string;
}

/**
 * Get a function
 */
export interface GetFunctionRequest {
    /**
     * The fully-qualified name of the function (of the form
     * __catalog_name__.__schema_name__.__function__name__).
     */
    name: string;
}

/**
 * Get permissions
 */
export interface GetGrantRequest {
    /**
     * Full name of securable.
     */
    full_name: string;
    /**
     * If provided, only the permissions for the specified principal (user or
     * group) are returned.
     */
    principal?: string;
    /**
     * Type of securable.
     */
    securable_type: SecurableType;
}

/**
 * Get a metastore
 */
export interface GetMetastoreRequest {
    /**
     * Unique ID of the metastore.
     */
    id: string;
}

export interface GetMetastoreSummaryResponse {
    /**
     * Cloud vendor of the metastore home shard (e.g., `aws`, `azure`, `gcp`).
     */
    cloud?: string;
    /**
     * Time at which this metastore was created, in epoch milliseconds.
     */
    created_at?: number;
    /**
     * Username of metastore creator.
     */
    created_by?: string;
    /**
     * Unique identifier of the metastore's (Default) Data Access Configuration.
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
     * The scope of Delta Sharing enabled for the metastore.
     */
    delta_sharing_scope?: GetMetastoreSummaryResponseDeltaSharingScope;
    /**
     * Globally unique metastore ID across clouds and regions, of the form
     * `cloud:region:metastore_id`.
     */
    global_metastore_id?: string;
    /**
     * Unique identifier of metastore.
     */
    metastore_id?: string;
    /**
     * The user-specified name of the metastore.
     */
    name?: string;
    /**
     * The owner of the metastore.
     */
    owner?: string;
    /**
     * Privilege model version of the metastore, of the form `major.minor` (e.g.,
     * `1.0`).
     */
    privilege_model_version?: string;
    /**
     * Cloud region which the metastore serves (e.g., `us-west-2`, `westus`).
     */
    region?: string;
    /**
     * The storage root URL for metastore
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
     * Time at which the metastore was last modified, in epoch milliseconds.
     */
    updated_at?: number;
    /**
     * Username of user who last modified the metastore.
     */
    updated_by?: string;
}

/**
 * The scope of Delta Sharing enabled for the metastore.
 */
export type GetMetastoreSummaryResponseDeltaSharingScope =
    | "INTERNAL"
    | "INTERNAL_AND_EXTERNAL";

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
 * Get a schema
 */
export interface GetSchemaRequest {
    /**
     * Full name of the schema.
     */
    full_name: string;
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
     * Name of the storage credential.
     */
    name: string;
}

/**
 * Get a table
 */
export interface GetTableRequest {
    /**
     * Full name of the table.
     */
    full_name: string;
    /**
     * Whether delta metadata should be included in the response.
     */
    include_delta_metadata?: boolean;
}

export interface IpAccessList {
    /**
     * Allowed IP Addresses in CIDR notation. Limit of 100.
     */
    allowed_ip_addresses?: Array<string>;
}

/**
 * Get all workspaces assigned to a metastore
 */
export interface ListAccountMetastoreAssignmentsRequest {
    /**
     * Databricks Unity Catalog metastore ID
     */
    metastore_id: string;
}

/**
 * Get all storage credentials assigned to a metastore
 */
export interface ListAccountStorageCredentialsRequest {
    /**
     * Databricks Unity Catalog metastore ID
     */
    metastore_id: string;
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

/**
 * List functions
 */
export interface ListFunctionsRequest {
    /**
     * Name of parent catalog for functions of interest.
     */
    catalog_name: string;
    /**
     * Parent schema of functions.
     */
    schema_name: string;
}

export interface ListFunctionsResponse {
    /**
     * An array of function information objects.
     */
    schemas?: Array<FunctionInfo>;
}

export interface ListMetastoresResponse {
    /**
     * An array of metastore information objects.
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
     * Parent catalog for schemas of interest.
     */
    catalog_name: string;
}

export interface ListSchemasResponse {
    /**
     * An array of schema information objects.
     */
    schemas?: Array<SchemaInfo>;
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

/**
 * List table summaries
 */
export interface ListSummariesRequest {
    /**
     * Name of parent catalog for tables of interest.
     */
    catalog_name: string;
    /**
     * Maximum number of tables to return (page length). Defaults to 10000.
     */
    max_results?: number;
    /**
     * Opaque token to send for the next page of results (pagination).
     */
    page_token?: string;
    /**
     * A sql LIKE pattern (% and _) for schema names. All schemas will be
     * returned if not set or empty.
     */
    schema_name_pattern?: string;
    /**
     * A sql LIKE pattern (% and _) for table names. All tables will be returned
     * if not set or empty.
     */
    table_name_pattern?: string;
}

export interface ListTableSummariesResponse {
    /**
     * Opaque token for pagination. Omitted if there are no more results.
     */
    next_page_token?: string;
    /**
     * List of table summaries.
     */
    tables?: Array<TableSummary>;
}

/**
 * List tables
 */
export interface ListTablesRequest {
    /**
     * Name of parent catalog for tables of interest.
     */
    catalog_name: string;
    /**
     * Whether delta metadata should be included in the response.
     */
    include_delta_metadata?: boolean;
    /**
     * Parent schema of tables.
     */
    schema_name: string;
}

export interface ListTablesResponse {
    /**
     * An array of table information objects.
     */
    tables?: Array<TableInfo>;
}

export interface MetastoreAssignment {
    /**
     * The name of the default catalog in the metastore.
     */
    default_catalog_name?: string;
    /**
     * The unique ID of the metastore.
     */
    metastore_id: string;
    /**
     * The unique ID of the Databricks workspace.
     */
    workspace_id: string;
}

export interface MetastoreInfo {
    /**
     * Cloud vendor of the metastore home shard (e.g., `aws`, `azure`, `gcp`).
     */
    cloud?: string;
    /**
     * Time at which this metastore was created, in epoch milliseconds.
     */
    created_at?: number;
    /**
     * Username of metastore creator.
     */
    created_by?: string;
    /**
     * Unique identifier of the metastore's (Default) Data Access Configuration.
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
     * The scope of Delta Sharing enabled for the metastore.
     */
    delta_sharing_scope?: MetastoreInfoDeltaSharingScope;
    /**
     * Globally unique metastore ID across clouds and regions, of the form
     * `cloud:region:metastore_id`.
     */
    global_metastore_id?: string;
    /**
     * Unique identifier of metastore.
     */
    metastore_id?: string;
    /**
     * The user-specified name of the metastore.
     */
    name?: string;
    /**
     * The owner of the metastore.
     */
    owner?: string;
    /**
     * Privilege model version of the metastore, of the form `major.minor` (e.g.,
     * `1.0`).
     */
    privilege_model_version?: string;
    /**
     * Cloud region which the metastore serves (e.g., `us-west-2`, `westus`).
     */
    region?: string;
    /**
     * The storage root URL for metastore
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
     * Time at which the metastore was last modified, in epoch milliseconds.
     */
    updated_at?: number;
    /**
     * Username of user who last modified the metastore.
     */
    updated_by?: string;
}

/**
 * The scope of Delta Sharing enabled for the metastore.
 */
export type MetastoreInfoDeltaSharingScope =
    | "INTERNAL"
    | "INTERNAL_AND_EXTERNAL";

export interface NamedTableConstraint {
    /**
     * The name of the constraint.
     */
    name: string;
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

export interface PermissionsList {
    /**
     * The privileges assigned to each principal
     */
    privilege_assignments?: Array<PrivilegeAssignment>;
}

export interface PrimaryKeyConstraint {
    /**
     * Column names for this constraint.
     */
    child_columns: Array<string>;
    /**
     * The name of the constraint.
     */
    name: string;
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
     * The global Unity Catalog metastore id provided by the data recipient.
     *
     * This field is only present when the __authentication_type__ is
     * **DATABRICKS**.
     *
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
    properties_kvpairs?: any /* MISSING TYPE */;
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

export interface SchemaInfo {
    /**
     * Name of parent catalog.
     */
    catalog_name?: string;
    /**
     * The type of the parent catalog.
     */
    catalog_type?: string;
    /**
     * User-provided free-form text description.
     */
    comment?: string;
    /**
     * Time at which this schema was created, in epoch milliseconds.
     */
    created_at?: number;
    /**
     * Username of schema creator.
     */
    created_by?: string;
    effective_auto_maintenance_flag?: EffectiveAutoMaintenanceFlag;
    /**
     * Whether auto maintenance should be enabled for this object and objects
     * under it.
     */
    enable_auto_maintenance?: EnableAutoMaintenance;
    /**
     * Full name of schema, in form of __catalog_name__.__schema_name__.
     */
    full_name?: string;
    /**
     * Unique identifier of parent metastore.
     */
    metastore_id?: string;
    /**
     * Name of schema, relative to parent catalog.
     */
    name?: string;
    /**
     * Username of current owner of schema.
     */
    owner?: string;
    /**
     * A map of key-value properties attached to the securable.
     */
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
     * Time at which this schema was created, in epoch milliseconds.
     */
    updated_at?: number;
    /**
     * Username of user who last modified schema.
     */
    updated_by?: string;
}

/**
 * A map of key-value properties attached to the securable.
 */
export type SecurablePropertiesMap = Record<string, string>;

/**
 * The type of Unity Catalog securable
 */
export type SecurableType =
    | "CATALOG"
    | "EXTERNAL_LOCATION"
    | "FUNCTION"
    | "METASTORE"
    | "PROVIDER"
    | "RECIPIENT"
    | "SCHEMA"
    | "SHARE"
    | "STORAGE_CREDENTIAL"
    | "TABLE";

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
     * Unique identifier of parent metastore.
     */
    metastore_id?: string;
    /**
     * The credential name. The name must be unique within the metastore.
     */
    name?: string;
    /**
     * Username of current owner of credential.
     */
    owner?: string;
    /**
     * Whether the storage credential is only usable for read operations.
     */
    read_only?: boolean;
    /**
     * Time at which this credential was last modified, in epoch milliseconds.
     */
    updated_at?: number;
    /**
     * Username of user who last modified the credential.
     */
    updated_by?: string;
    /**
     * Whether this credential is the current metastore's root storage
     * credential.
     */
    used_for_managed_storage?: boolean;
}

/**
 * A table constraint, as defined by *one* of the following fields being set:
 * __primary_key_constraint__, __foreign_key_constraint__,
 * __named_table_constraint__.
 */
export interface TableConstraint {
    foreign_key_constraint?: ForeignKeyConstraint;
    named_table_constraint?: NamedTableConstraint;
    primary_key_constraint?: PrimaryKeyConstraint;
}

export interface TableConstraintList {
    /**
     * List of table constraints.
     */
    table_constraints?: Array<TableConstraint>;
}

/**
 * A table that is dependent on a SQL object.
 */
export interface TableDependency {
    /**
     * Full name of the dependent table, in the form of
     * __catalog_name__.__schema_name__.__table_name__.
     */
    table_full_name: string;
}

export interface TableInfo {
    /**
     * Name of parent catalog.
     */
    catalog_name?: string;
    /**
     * The array of __ColumnInfo__ definitions of the table's columns.
     */
    columns?: Array<ColumnInfo>;
    /**
     * User-provided free-form text description.
     */
    comment?: string;
    /**
     * Time at which this table was created, in epoch milliseconds.
     */
    created_at?: number;
    /**
     * Username of table creator.
     */
    created_by?: string;
    /**
     * Unique ID of the Data Access Configuration to use with the table data.
     */
    data_access_configuration_id?: string;
    /**
     * Data source format
     */
    data_source_format?: DataSourceFormat;
    /**
     * Time at which this table was deleted, in epoch milliseconds. Field is
     * omitted if table is not deleted.
     */
    deleted_at?: number;
    /**
     * Information pertaining to current state of the delta table.
     */
    delta_runtime_properties_kvpairs?: any /* MISSING TYPE */;
    effective_auto_maintenance_flag?: EffectiveAutoMaintenanceFlag;
    /**
     * Whether auto maintenance should be enabled for this object and objects
     * under it.
     */
    enable_auto_maintenance?: EnableAutoMaintenance;
    /**
     * Full name of table, in form of
     * __catalog_name__.__schema_name__.__table_name__
     */
    full_name?: string;
    /**
     * Unique identifier of parent metastore.
     */
    metastore_id?: string;
    /**
     * Name of table, relative to parent schema.
     */
    name?: string;
    /**
     * Username of current owner of table.
     */
    owner?: string;
    /**
     * A map of key-value properties attached to the securable.
     */
    properties?: Record<string, string>;
    row_filter?: TableRowFilter;
    /**
     * Name of parent schema relative to its parent catalog.
     */
    schema_name?: string;
    /**
     * List of schemes whose objects can be referenced without qualification.
     */
    sql_path?: string;
    /**
     * Name of the storage credential, when a storage credential is configured
     * for use with this table.
     */
    storage_credential_name?: string;
    /**
     * Storage root URL for table (for **MANAGED**, **EXTERNAL** tables)
     */
    storage_location?: string;
    table_constraints?: TableConstraintList;
    /**
     * Name of table, relative to parent schema.
     */
    table_id?: string;
    table_type?: TableType;
    /**
     * Time at which this table was last modified, in epoch milliseconds.
     */
    updated_at?: number;
    /**
     * Username of user who last modified the table.
     */
    updated_by?: string;
    /**
     * View definition SQL (when __table_type__ is **VIEW**,
     * **MATERIALIZED_VIEW**, or **STREAMING_TABLE**)
     */
    view_definition?: string;
    /**
     * View dependencies (when table_type == **VIEW** or **MATERIALIZED_VIEW**,
     * **STREAMING_TABLE**) - when DependencyList is None, the dependency is not
     * provided; - when DependencyList is an empty list, the dependency is
     * provided but is empty; - when DependencyList is not an empty list,
     * dependencies are provided and recorded.
     */
    view_dependencies?: Array<Dependency>;
}

export interface TableRowFilter {
    /**
     * The list of table columns to be passed as input to the row filter
     * function. The column types should match the types of the filter function
     * arguments.
     */
    input_column_names: Array<string>;
    /**
     * The full name of the row filter SQL UDF.
     */
    name: string;
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
     * Query for the ID of the metastore to delete.
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
     * Name of catalog.
     */
    name?: string;
    /**
     * Username of current owner of catalog.
     */
    owner?: string;
    /**
     * A map of key-value properties attached to the securable.
     */
    properties?: Record<string, string>;
}

export interface UpdateExternalLocation {
    /**
     * User-provided free-form text description.
     */
    comment?: string;
    /**
     * Name of the storage credential used with this location.
     */
    credential_name?: string;
    /**
     * Force update even if changing url invalidates dependent external tables or
     * mounts.
     */
    force?: boolean;
    /**
     * Name of the external location.
     */
    name?: string;
    /**
     * The owner of the external location.
     */
    owner?: string;
    /**
     * Indicates whether the external location is read-only.
     */
    read_only?: boolean;
    /**
     * Path URL of the external location.
     */
    url?: string;
}

export interface UpdateFunction {
    /**
     * The fully-qualified name of the function (of the form
     * __catalog_name__.__schema_name__.__function__name__).
     */
    name: string;
    /**
     * Username of current owner of function.
     */
    owner?: string;
}

export interface UpdateMetastore {
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
     * The scope of Delta Sharing enabled for the metastore.
     */
    delta_sharing_scope?: UpdateMetastoreDeltaSharingScope;
    /**
     * Unique ID of the metastore.
     */
    id: string;
    /**
     * Databricks Unity Catalog metastore ID
     */
    metastore_id: string;
    /**
     * The user-specified name of the metastore.
     */
    name?: string;
    /**
     * The owner of the metastore.
     */
    owner?: string;
    /**
     * Privilege model version of the metastore, of the form `major.minor` (e.g.,
     * `1.0`).
     */
    privilege_model_version?: string;
    /**
     * UUID of storage credential to access the metastore storage_root.
     */
    storage_root_credential_id?: string;
}

export interface UpdateMetastoreAssignment {
    /**
     * The name of the default catalog for the metastore.
     */
    default_catalog_name?: string;
    /**
     * The unique ID of the metastore.
     */
    metastore_id?: string;
    /**
     * Workspace ID.
     */
    workspace_id: number;
}

/**
 * The scope of Delta Sharing enabled for the metastore.
 */
export type UpdateMetastoreDeltaSharingScope =
    | "INTERNAL"
    | "INTERNAL_AND_EXTERNAL";

export interface UpdatePermissions {
    /**
     * Array of permissions change objects.
     */
    changes?: Array<PermissionsChange>;
    /**
     * Full name of securable.
     */
    full_name: string;
    /**
     * Type of securable.
     */
    securable_type: SecurableType;
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
     * Recipient properties as map of string key-value pairs.
     *
     * When provided in update request, the specified properties will override
     * the existing properties. To add and remove properties, one would need to
     * perform a read-modify-write.
     */
    properties_kvpairs?: any /* MISSING TYPE */;
}

export interface UpdateSchema {
    /**
     * User-provided free-form text description.
     */
    comment?: string;
    /**
     * Full name of the schema.
     */
    full_name: string;
    /**
     * Name of schema, relative to parent catalog.
     */
    name?: string;
    /**
     * Username of current owner of schema.
     */
    owner?: string;
    /**
     * A map of key-value properties attached to the securable.
     */
    properties?: Record<string, string>;
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
    changes?: Array<PermissionsChange>;
    /**
     * The name of the share.
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
     * Force update even if there are dependent external locations or external
     * tables.
     */
    force?: boolean;
    /**
     * The GCP service account key configuration.
     */
    gcp_service_account_key?: GcpServiceAccountKey;
    /**
     * The credential name. The name must be unique within the metastore.
     */
    name?: string;
    /**
     * Username of current owner of credential.
     */
    owner?: string;
    /**
     * Whether the storage credential is only usable for read operations.
     */
    read_only?: boolean;
    /**
     * Supplying true to this argument skips validation of the updated
     * credential.
     */
    skip_validation?: boolean;
}

export interface ValidateStorageCredential {
    /**
     * The AWS IAM role configuration.
     */
    aws_iam_role?: AwsIamRole;
    /**
     * The Azure service principal configuration.
     */
    azure_service_principal?: AzureServicePrincipal;
    /**
     * The name of an existing external location to validate.
     */
    external_location_name?: string;
    /**
     * The GCP service account key configuration.
     */
    gcp_service_account_key?: GcpServiceAccountKey;
    /**
     * Whether the storage credential is only usable for read operations.
     */
    read_only?: boolean;
    /**
     * The name of the storage credential to validate.
     */
    storage_credential_name?: any /* MISSING TYPE */;
    /**
     * The external location url to validate.
     */
    url?: string;
}

export interface ValidateStorageCredentialResponse {
    /**
     * Whether the tested location is a directory in cloud storage.
     */
    isDir?: boolean;
    /**
     * The results of the validation check.
     */
    results?: Array<ValidationResult>;
}

export interface ValidationResult {
    /**
     * Error message would exist when the result does not equal to **PASS**.
     */
    message?: string;
    /**
     * The operation tested.
     */
    operation?: ValidationResultOperation;
    /**
     * The results of the tested operation.
     */
    result?: ValidationResultResult;
}

/**
 * The operation tested.
 */
export type ValidationResultOperation = "DELETE" | "LIST" | "READ" | "WRITE";

/**
 * The results of the tested operation.
 */
export type ValidationResultResult = "FAIL" | "PASS" | "SKIP";

export interface EmptyResponse {}
