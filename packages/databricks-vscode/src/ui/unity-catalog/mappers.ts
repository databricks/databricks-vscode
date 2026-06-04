/* eslint-disable @typescript-eslint/naming-convention */
import {type iam} from "@databricks/sdk-experimental";
import {ColumnData, UnityCatalogTreeNode} from "./types";
import {isOwnedByUser} from "./utils";

export function mapColumn(c: {
    name?: string;
    type_name?: unknown;
    type_text?: string;
    comment?: string;
    nullable?: boolean;
    position?: number;
}): ColumnData {
    return {
        name: c.name!,
        typeName: c.type_name ? String(c.type_name) : undefined,
        typeText: c.type_text,
        comment: c.comment,
        nullable: c.nullable,
        position: c.position,
    };
}

export function mapCatalog(
    c: {
        name?: string;
        full_name?: string;
        comment?: string;
        owner?: string;
        catalog_type?: string;
        isolation_mode?: string;
        storage_location?: string;
        created_at?: number;
        created_by?: string;
        updated_at?: number;
        updated_by?: string;
        connection_name?: string;
        provider_name?: string;
        share_name?: string;
    },
    currentUser: iam.User | undefined
): Extract<UnityCatalogTreeNode, {kind: "catalog"}> {
    return {
        kind: "catalog",
        name: c.name!,
        fullName: c.full_name ?? c.name!,
        comment: c.comment,
        owner: c.owner,
        owned: isOwnedByUser(c.owner, currentUser),
        catalogType: c.catalog_type,
        isolationMode: c.isolation_mode,
        storageLocation: c.storage_location,
        createdAt: c.created_at,
        createdBy: c.created_by,
        updatedAt: c.updated_at,
        updatedBy: c.updated_by,
        connectionName: c.connection_name,
        providerName: c.provider_name,
        shareName: c.share_name,
    };
}

export function mapSchema(
    s: {
        name?: string;
        full_name?: string;
        comment?: string;
        owner?: string;
        storage_location?: string;
        created_at?: number;
        created_by?: string;
        updated_at?: number;
        updated_by?: string;
    },
    catalogName: string,
    currentUser: iam.User | undefined
): Extract<UnityCatalogTreeNode, {kind: "schema"}> {
    return {
        kind: "schema",
        catalogName,
        name: s.name!,
        fullName: s.full_name ?? `${catalogName}.${s.name}`,
        comment: s.comment,
        owner: s.owner,
        owned: isOwnedByUser(s.owner, currentUser),
        storageLocation: s.storage_location,
        createdAt: s.created_at,
        createdBy: s.created_by,
        updatedAt: s.updated_at,
        updatedBy: s.updated_by,
    };
}

export function mapTable(
    t: {
        name?: string;
        full_name?: string;
        table_type?: string;
        comment?: string;
        data_source_format?: string;
        storage_location?: string;
        view_definition?: string;
        owner?: string;
        created_by?: string;
        created_at?: number;
        updated_at?: number;
        updated_by?: string;
        columns?: {
            name?: string;
            type_name?: unknown;
            type_text?: string;
            comment?: string;
            nullable?: boolean;
            position?: number;
        }[];
        properties?: Record<string, string>;
    },
    catalogName: string,
    schemaName: string
): Extract<UnityCatalogTreeNode, {kind: "table"}> {
    return {
        kind: "table",
        catalogName,
        schemaName,
        name: t.name!,
        fullName: t.full_name ?? `${catalogName}.${schemaName}.${t.name}`,
        tableType: t.table_type,
        comment: t.comment,
        dataSourceFormat: t.data_source_format,
        storageLocation: t.storage_location,
        viewDefinition: t.view_definition,
        owner: t.owner,
        createdBy: t.created_by,
        createdAt: t.created_at,
        updatedAt: t.updated_at,
        updatedBy: t.updated_by,
        columns: t.columns?.map(mapColumn),
        customProperties: t.properties,
    };
}

export function mapVolume(
    v: {
        name?: string;
        full_name?: string;
        volume_type?: string;
        storage_location?: string;
        comment?: string;
        owner?: string;
        created_at?: number;
        created_by?: string;
        updated_at?: number;
        updated_by?: string;
    },
    catalogName: string,
    schemaName: string
): Extract<UnityCatalogTreeNode, {kind: "volume"}> {
    return {
        kind: "volume",
        catalogName,
        schemaName,
        name: v.name!,
        fullName: v.full_name ?? `${catalogName}.${schemaName}.${v.name}`,
        volumeType: v.volume_type,
        storageLocation: v.storage_location,
        comment: v.comment,
        owner: v.owner,
        createdAt: v.created_at,
        createdBy: v.created_by,
        updatedAt: v.updated_at,
        updatedBy: v.updated_by,
    };
}

export function mapFunction(
    f: {
        name?: string;
        comment?: string;
        owner?: string;
        routine_body?: string;
        routine_definition?: string;
        full_data_type?: string;
        external_language?: string;
        is_deterministic?: boolean;
        input_params?: {
            parameters?: {
                name?: string;
                type_name?: unknown;
                type_text?: string;
                comment?: string;
                parameter_default?: string;
            }[];
        };
        created_at?: number;
        created_by?: string;
        updated_at?: number;
        updated_by?: string;
    },
    catalogName: string,
    schemaName: string
): Extract<UnityCatalogTreeNode, {kind: "function"}> {
    return {
        kind: "function",
        catalogName,
        schemaName,
        name: f.name!,
        fullName: `${catalogName}.${schemaName}.${f.name}`,
        comment: f.comment,
        owner: f.owner,
        routineBody: f.routine_body,
        routineDefinition: f.routine_definition,
        fullDataType: f.full_data_type,
        externalLanguage: f.external_language,
        isDeterministic: f.is_deterministic,
        inputParams: (f.input_params?.parameters ?? []).map((p) => ({
            name: p.name!,
            typeName: p.type_name ? String(p.type_name) : undefined,
            typeText: p.type_text,
            comment: p.comment,
            parameterDefault: p.parameter_default,
        })),
        createdAt: f.created_at,
        createdBy: f.created_by,
        updatedAt: f.updated_at,
        updatedBy: f.updated_by,
    };
}

export function mapRegisteredModel(
    m: {
        name?: string;
        full_name?: string;
        comment?: string;
        owner?: string;
        storage_location?: string;
        aliases?: {alias_name?: string; version_num?: number}[];
        created_at?: number;
        updated_at?: number;
    },
    catalogName: string,
    schemaName: string
): Extract<UnityCatalogTreeNode, {kind: "registeredModel"}> {
    return {
        kind: "registeredModel",
        catalogName,
        schemaName,
        name: m.name!,
        fullName: m.full_name ?? `${catalogName}.${schemaName}.${m.name}`,
        comment: m.comment,
        owner: m.owner,
        storageLocation: m.storage_location,
        aliases: m.aliases?.map((a) => ({
            aliasName: a.alias_name,
            versionNum: a.version_num,
        })),
        createdAt: m.created_at,
        updatedAt: m.updated_at,
    };
}

export function mapModelVersion(
    v: {
        version?: number;
        comment?: string;
        status?: string;
        storage_location?: string;
        created_at?: number;
        created_by?: string;
    },
    catalogName: string,
    schemaName: string,
    modelName: string,
    fullName: string
): Extract<UnityCatalogTreeNode, {kind: "modelVersion"}> {
    return {
        kind: "modelVersion",
        catalogName,
        schemaName,
        modelName,
        fullName,
        version: v.version!,
        comment: v.comment,
        status: v.status,
        storageLocation: v.storage_location,
        createdAt: v.created_at,
        createdBy: v.created_by,
    };
}
