/* eslint-disable @typescript-eslint/naming-convention */

// Code generated from OpenAPI specs by Databricks SDK Generator. DO NOT EDIT.

// all definitions in this file are in alphabetical order
export interface AccountsCreateMetastore {
    metastore_info?: CreateMetastore;
}

export interface AccountsCreateMetastoreAssignment {
    metastore_assignment?: CreateMetastoreAssignment;
    /**
     * Unity Catalog metastore ID
     */
    metastore_id: string;
    /**
     * Workspace ID.
     */
    workspace_id: number;
}

export interface AccountsCreateStorageCredential {
    credential_info?: CreateStorageCredential;
    /**
     * Unity Catalog metastore ID
     */
    metastore_id: string;
}

export interface AccountsMetastoreAssignment {
    metastore_assignment?: MetastoreAssignment;
}

export interface AccountsMetastoreInfo {
    metastore_info?: MetastoreInfo;
}

export interface AccountsUpdateMetastore {
    /**
     * Unity Catalog metastore ID
     */
    metastore_id: string;
    metastore_info?: UpdateMetastore;
}

export interface AccountsUpdateMetastoreAssignment {
    metastore_assignment?: UpdateMetastoreAssignment;
    /**
     * Unity Catalog metastore ID
     */
    metastore_id: string;
    /**
     * Workspace ID.
     */
    workspace_id: number;
}

export interface AccountsUpdateStorageCredential {
    credential_info?: UpdateStorageCredential;
    /**
     * Unity Catalog metastore ID
     */
    metastore_id: string;
    /**
     * Name of the storage credential.
     */
    name: string;
}

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

export interface AzureManagedIdentity {
    /**
     * The Azure resource ID of the Azure Databricks Access Connector. Use the
     * format
     * /subscriptions/{guid}/resourceGroups/{rg-name}/providers/Microsoft.Databricks/accessConnectors/{connector-name}.
     */
    access_connector_id: string;
    /**
     * The Databricks internal ID that represents this managed identity.
     */
    credential_id?: string;
    /**
     * The Azure resource ID of the managed identity. Use the format
     * /subscriptions/{guid}/resourceGroups/{rg-name}/providers/Microsoft.ManagedIdentity/userAssignedIdentities/{identity-name}.
     * This is only available for user-assgined identities. For system-assigned
     * identities, the access_connector_id is used to identify the identity. If
     * this field is not provided, then we assume the AzureManagedIdentity is for
     * a system-assigned identity.
     */
    managed_identity_id?: string;
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
     * The name of the connection to an external data source.
     */
    connection_name?: string;
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
     * Whether the current securable is accessible from all workspaces or a
     * specific set of workspaces.
     */
    isolation_mode?: IsolationMode;
    /**
     * Unique identifier of parent metastore.
     */
    metastore_id?: string;
    /**
     * Name of catalog.
     */
    name?: string;
    /**
     * A map of key-value properties attached to the securable.
     */
    options?: Record<string, string>;
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

export interface ConnectionInfo {
    /**
     * User-provided free-form text description.
     */
    comment?: string;
    /**
     * Unique identifier of the Connection.
     */
    connection_id?: string;
    /**
     * The type of connection.
     */
    connection_type?: ConnectionType;
    /**
     * Time at which this connection was created, in epoch milliseconds.
     */
    created_at?: number;
    /**
     * Username of connection creator.
     */
    created_by?: string;
    /**
     * The type of credential.
     */
    credential_type?: CredentialType;
    /**
     * Full name of connection.
     */
    full_name?: string;
    /**
     * Unique identifier of parent metastore.
     */
    metastore_id?: string;
    /**
     * Name of the connection.
     */
    name?: string;
    /**
     * A map of key-value properties attached to the securable.
     */
    options_kvpairs?: Record<string, string>;
    /**
     * Username of current owner of the connection.
     */
    owner?: string;
    /**
     * An object containing map of key-value properties attached to the
     * connection.
     */
    properties_kvpairs?: Record<string, string>;
    /**
     * If the connection is read only.
     */
    read_only?: boolean;
    /**
     * Time at which this connection was updated, in epoch milliseconds.
     */
    updated_at?: number;
    /**
     * Username of user who last modified connection.
     */
    updated_by?: string;
    /**
     * URL of the remote data source, extracted from options_kvpairs.
     */
    url?: string;
}

/**
 * The type of connection.
 */
export type ConnectionType =
    | "DATABRICKS"
    | "MYSQL"
    | "POSTGRESQL"
    | "REDSHIFT"
    | "SNOWFLAKE"
    | "SQLDW"
    | "SQLSERVER";

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

export interface CreateConnection {
    /**
     * User-provided free-form text description.
     */
    comment?: string;
    /**
     * The type of connection.
     */
    connection_type: ConnectionType;
    /**
     * Name of the connection.
     */
    name: string;
    /**
     * A map of key-value properties attached to the securable.
     */
    options_kvpairs: Record<string, string>;
    /**
     * Username of current owner of the connection.
     */
    owner?: string;
    /**
     * An object containing map of key-value properties attached to the
     * connection.
     */
    properties_kvpairs?: Record<string, string>;
    /**
     * If the connection is read only.
     */
    read_only?: boolean;
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
     * A workspace ID.
     */
    workspace_id: number;
}

export interface CreateMetastoreAssignmentsResponseItem {
    /**
     * A human-readable message describing the outcome of the creation
     */
    message?: string;
    metastore_assignment?: MetastoreAssignment;
    /**
     * The returned HTTP status code for an individual creation in the batch
     */
    status_code?: number;
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

export interface CreateStorageCredential {
    /**
     * The AWS IAM role configuration.
     */
    aws_iam_role?: AwsIamRole;
    /**
     * The Azure managed identity configuration.
     */
    azure_managed_identity?: AzureManagedIdentity;
    /**
     * The Azure service principal configuration.
     */
    azure_service_principal?: AzureServicePrincipal;
    /**
     * Comment associated with the credential.
     */
    comment?: string;
    /**
     * The <Databricks> managed GCP service account configuration.
     */
    databricks_gcp_service_account?: any /* MISSING TYPE */;
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

export interface CreateVolumeRequestContent {
    /**
     * The name of the catalog where the schema and the volume are
     */
    catalog_name: string;
    /**
     * The comment attached to the volume
     */
    comment?: string;
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
    volume_type: VolumeType;
}

/**
 * The type of credential.
 */
export type CredentialType = "USERNAME_PASSWORD";

/**
 * Currently assigned workspaces
 */
export interface CurrentWorkspaceBindings {
    /**
     * A list of workspace IDs.
     */
    workspaces?: Array<number>;
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

export interface DatabricksGcpServiceAccountResponse {
    /**
     * The Databricks internal ID that represents this service account. This is
     * an output-only field.
     */
    credential_id?: string;
    /**
     * The email of the service account. This is an output-only field.
     */
    email?: string;
}

/**
 * Delete a metastore assignment
 */
export interface DeleteAccountMetastoreAssignmentRequest {
    /**
     * Unity Catalog metastore ID
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
     * Unity Catalog metastore ID
     */
    metastore_id: string;
}

/**
 * Delete a storage credential
 */
export interface DeleteAccountStorageCredentialRequest {
    /**
     * Unity Catalog metastore ID
     */
    metastore_id: string;
    /**
     * Name of the storage credential.
     */
    name: string;
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
 * Delete a connection
 */
export interface DeleteConnectionRequest {
    /**
     * The name of the connection to be deleted.
     */
    name_arg: string;
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
 * Delete a schema
 */
export interface DeleteSchemaRequest {
    /**
     * Full name of the schema.
     */
    full_name: string;
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
     * If true, try deleting all child constraints of the current constraint. If
     * false, reject this operation if the current constraint has any child
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
 * Delete a Volume
 */
export interface DeleteVolumeRequest {
    /**
     * The three-level (fully qualified) name of the volume
     */
    full_name_arg: string;
}

/**
 * Properties pertaining to the current state of the delta table as given by the
 * commit server. This does not contain **delta.*** (input) properties in
 * __TableInfo.properties__.
 */
export interface DeltaRuntimePropertiesKvPairs {
    /**
     * A map of key-value properties attached to the securable.
     */
    delta_runtime_properties: Record<string, string>;
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

/**
 * Disable a system schema
 */
export interface DisableRequest {
    /**
     * The metastore ID under which the system schema lives.
     */
    metastore_id: string;
    /**
     * Full name of the system schema.
     */
    schema_name: DisableSchemaName;
}

export type DisableSchemaName =
    | "access"
    | "billing"
    | "lineage"
    | "operational_data";

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
     * This field is omitted when privilege is not inherited (it's assigned to
     * the securable itself).
     */
    inherited_from_name?: string;
    /**
     * The type of the object that conveys this privilege via inheritance. This
     * field is omitted when privilege is not inherited (it's assigned to the
     * securable itself).
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

/**
 * Enable a system schema
 */
export interface EnableRequest {
    /**
     * The metastore ID under which the system schema lives.
     */
    metastore_id: string;
    /**
     * Full name of the system schema.
     */
    schema_name: EnableSchemaName;
}

export type EnableSchemaName =
    | "access"
    | "billing"
    | "lineage"
    | "operational_data";

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
     * Unity Catalog metastore ID
     */
    metastore_id: string;
}

/**
 * Gets the named storage credential
 */
export interface GetAccountStorageCredentialRequest {
    /**
     * Unity Catalog metastore ID
     */
    metastore_id: string;
    /**
     * Name of the storage credential.
     */
    name: string;
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
 * Get a connection
 */
export interface GetConnectionRequest {
    /**
     * Name of the connection.
     */
    name_arg: string;
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
 * Get a schema
 */
export interface GetSchemaRequest {
    /**
     * Full name of the schema.
     */
    full_name: string;
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

/**
 * Get catalog workspace bindings
 */
export interface GetWorkspaceBindingRequest {
    /**
     * The name of the catalog.
     */
    name: string;
}

/**
 * Whether the current securable is accessible from all workspaces or a specific
 * set of workspaces.
 */
export type IsolationMode = "ISOLATED" | "OPEN";

/**
 * Get all workspaces assigned to a metastore
 */
export interface ListAccountMetastoreAssignmentsRequest {
    /**
     * Unity Catalog metastore ID
     */
    metastore_id: string;
}

/**
 * Get all storage credentials assigned to a metastore
 */
export interface ListAccountStorageCredentialsRequest {
    /**
     * Unity Catalog metastore ID
     */
    metastore_id: string;
}

export interface ListCatalogsResponse {
    /**
     * An array of catalog information objects.
     */
    catalogs?: Array<CatalogInfo>;
}

export interface ListConnectionsResponse {
    /**
     * An array of connection information objects.
     */
    connections?: Array<ConnectionInfo>;
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
    functions?: Array<FunctionInfo>;
}

export interface ListMetastoresResponse {
    /**
     * An array of metastore information objects.
     */
    metastores?: Array<MetastoreInfo>;
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

export interface ListStorageCredentialsResponse {
    storage_credentials?: Array<StorageCredentialInfo>;
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

/**
 * List system schemas
 */
export interface ListSystemSchemasRequest {
    /**
     * The ID for the metastore in which the system schema resides.
     */
    metastore_id: string;
}

export interface ListSystemSchemasResponse {
    /**
     * An array of system schema information objects.
     */
    schemas?: Array<SystemSchemaInfo>;
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
     * Maximum number of tables to return (page length). If not set, all
     * accessible tables in the schema are returned. If set to:
     *
     * * greater than 0, page length is the minimum of this value and a server
     * configured value. * equal to 0, page length is set to a server configured
     * value. * lesser than 0, invalid parameter error.
     */
    max_results?: number;
    /**
     * Opaque token to send for the next page of results (pagination).
     */
    page_token?: string;
    /**
     * Parent schema of tables.
     */
    schema_name: string;
}

export interface ListTablesResponse {
    /**
     * Opaque token for pagination. Omitted if there are no more results.
     * page_token should be set to this value for fetching the next page.
     */
    next_page_token?: string;
    /**
     * An array of table information objects.
     */
    tables?: Array<TableInfo>;
}

/**
 * List Volumes
 */
export interface ListVolumesRequest {
    /**
     * The identifier of the catalog
     */
    catalog_name: string;
    /**
     * The identifier of the schema
     */
    schema_name: string;
}

export interface ListVolumesResponseContent {
    volumes?: Array<VolumeInfo>;
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
    workspace_id: number;
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

/**
 * An object containing map of key-value properties attached to the connection.
 */
export type PropertiesKvPairs = Record<string, string>;

/**
 * Get a Volume
 */
export interface ReadVolumeRequest {
    /**
     * The three-level (fully qualified) name of the volume
     */
    full_name_arg: string;
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
export type SecurableOptionsMap = Record<string, string>;

/**
 * A map of key-value properties attached to the securable.
 */
export type SecurablePropertiesMap = Record<string, string>;

/**
 * The type of Unity Catalog securable
 */
export type SecurableType =
    | "catalog"
    | "external_location"
    | "function"
    | "metastore"
    | "pipeline"
    | "provider"
    | "recipient"
    | "schema"
    | "share"
    | "storage_credential"
    | "table";

export interface StorageCredentialInfo {
    /**
     * The AWS IAM role configuration.
     */
    aws_iam_role?: AwsIamRole;
    /**
     * The Azure managed identity configuration.
     */
    azure_managed_identity?: AzureManagedIdentity;
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
     * The <Databricks> managed GCP service account configuration.
     */
    databricks_gcp_service_account?: DatabricksGcpServiceAccountResponse;
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

export interface SystemSchemaInfo {
    /**
     * Name of the system schema.
     */
    schema?: string;
    /**
     * The current state of enablement for the system schema. An empty string
     * means the system schema is available and ready for opt-in.
     */
    state?: SystemSchemaInfoState;
}

/**
 * The current state of enablement for the system schema. An empty string means
 * the system schema is available and ready for opt-in.
 */
export type SystemSchemaInfoState =
    | "AVAILABLE"
    | "DISABLE_INITIALIZED"
    | "ENABLE_COMPLETED"
    | "ENABLE_INITIALIZED"
    | "UNAVAILABLE";

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
    delta_runtime_properties_kvpairs?: DeltaRuntimePropertiesKvPairs;
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

export interface UpdateAutoMaintenance {
    /**
     * Whether to enable auto maintenance on the metastore.
     */
    enable: boolean;
    /**
     * Unique identifier of metastore.
     */
    metastore_id: string;
}

export interface UpdateAutoMaintenanceResponse {
    /**
     * Whether auto maintenance is enabled on the metastore.
     */
    state?: boolean;
    /**
     * Id of the auto maintenance service principal. This will be the user used
     * to run maintenance tasks.
     */
    user_id?: number;
    /**
     * Name of the auto maintenance service principal.
     */
    username?: string;
}

export interface UpdateCatalog {
    /**
     * User-provided free-form text description.
     */
    comment?: string;
    /**
     * Whether the current securable is accessible from all workspaces or a
     * specific set of workspaces.
     */
    isolation_mode?: IsolationMode;
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

export interface UpdateConnection {
    /**
     * Name of the connection.
     */
    name: string;
    /**
     * Name of the connection.
     */
    name_arg: string;
    /**
     * A map of key-value properties attached to the securable.
     */
    options_kvpairs: Record<string, string>;
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
     * A workspace ID.
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

export interface UpdateStorageCredential {
    /**
     * The AWS IAM role configuration.
     */
    aws_iam_role?: AwsIamRole;
    /**
     * The Azure managed identity configuration.
     */
    azure_managed_identity?: AzureManagedIdentity;
    /**
     * The Azure service principal configuration.
     */
    azure_service_principal?: AzureServicePrincipal;
    /**
     * Comment associated with the credential.
     */
    comment?: string;
    /**
     * The <Databricks> managed GCP service account configuration.
     */
    databricks_gcp_service_account?: any /* MISSING TYPE */;
    /**
     * Force update even if there are dependent external locations or external
     * tables.
     */
    force?: boolean;
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

/**
 * Update a table owner.
 */
export interface UpdateTableRequest {
    /**
     * Full name of the table.
     */
    full_name: string;
    owner?: string;
}

export interface UpdateVolumeRequestContent {
    /**
     * The comment attached to the volume
     */
    comment?: string;
    /**
     * The three-level (fully qualified) name of the volume
     */
    full_name_arg: string;
    /**
     * The name of the volume
     */
    name?: string;
    /**
     * The identifier of the user who owns the volume
     */
    owner?: string;
}

export interface UpdateWorkspaceBindings {
    /**
     * A list of workspace IDs.
     */
    assign_workspaces?: Array<number>;
    /**
     * The name of the catalog.
     */
    name: string;
    /**
     * A list of workspace IDs.
     */
    unassign_workspaces?: Array<number>;
}

export interface ValidateStorageCredential {
    /**
     * The AWS IAM role configuration.
     */
    aws_iam_role?: AwsIamRole;
    /**
     * The Azure managed identity configuration.
     */
    azure_managed_identity?: AzureManagedIdentity;
    /**
     * The Azure service principal configuration.
     */
    azure_service_principal?: AzureServicePrincipal;
    /**
     * The Databricks created GCP service account configuration.
     */
    databricks_gcp_service_account?: any /* MISSING TYPE */;
    /**
     * The name of an existing external location to validate.
     */
    external_location_name?: string;
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

export interface VolumeInfo {
    /**
     * The name of the catalog where the schema and the volume are
     */
    catalog_name?: string;
    /**
     * The comment attached to the volume
     */
    comment?: string;
    created_at?: number;
    /**
     * The identifier of the user who created the volume
     */
    created_by?: string;
    /**
     * The three-level (fully qualified) name of the volume
     */
    full_name?: string;
    /**
     * The unique identifier of the metastore
     */
    metastore_id?: string;
    /**
     * The name of the volume
     */
    name?: string;
    /**
     * The identifier of the user who owns the volume
     */
    owner?: string;
    /**
     * The name of the schema where the volume is
     */
    schema_name?: string;
    /**
     * The storage location on the cloud
     */
    storage_location?: string;
    updated_at?: number;
    /**
     * The identifier of the user who updated the volume last time
     */
    updated_by?: string;
    /**
     * The unique identifier of the volume
     */
    volume_id?: string;
    volume_type?: VolumeType;
}

export type VolumeType = "EXTERNAL" | "MANAGED";
