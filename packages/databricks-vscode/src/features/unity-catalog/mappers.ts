import type { CatalogInfo } from "@databricks/sdk-uc-catalogs/v1";
import type { FunctionInfo } from "@databricks/sdk-uc-functions/v1";
import type { ModelVersionInfo, RegisteredModelInfo } from "@databricks/sdk-uc-registeredmodels/v1";
import type { SchemaInfo } from "@databricks/sdk-uc-schemas/v1";
import type { ColumnInfo, TableInfo } from "@databricks/sdk-uc-tables/v1";
import type { VolumeInfo } from "@databricks/sdk-uc-volumes/v1";
import type { ColumnData, NodeOfKind } from "./types";

/*
 * The modular SDK's models, as the old tree's nodes. The SDK decodes
 * timestamps and versions as `bigint`; the nodes keep numbers, as before,
 * because they go to the webview as JSON.
 */

function num(value: bigint | number | undefined): number | undefined {
    return value === undefined ? undefined : Number(value);
}

/** The old `isOwnedByUser`: the owner is the user's name. Group ownership isn't checked, as before. */
function isOwnedBy(owner: string | undefined, userName: string | undefined): boolean {
    return owner !== undefined && owner !== "" && owner === userName;
}

export function mapColumn(c: ColumnInfo): ColumnData {
    return {
        name: c.name!,
        typeName: c.typeName ? String(c.typeName) : undefined,
        typeText: c.typeText,
        comment: c.comment,
        nullable: c.nullable,
        position: c.position,
    };
}

export function mapCatalog(c: CatalogInfo, userName: string | undefined): NodeOfKind<"catalog"> {
    return {
        kind: "catalog",
        name: c.name!,
        fullName: c.name!,
        comment: c.comment,
        owner: c.owner,
        owned: isOwnedBy(c.owner, userName),
        catalogType: c.catalogType,
        isolationMode: c.isolationMode,
        storageLocation: c.storageLocation,
        createdAt: num(c.createdAt),
        createdBy: c.createdBy,
        updatedAt: num(c.updatedAt),
        updatedBy: c.updatedBy,
        connectionName: c.connectionName,
        providerName: c.providerName,
        shareName: c.shareName,
    };
}

export function mapSchema(
    s: SchemaInfo,
    catalogName: string,
    userName: string | undefined,
): NodeOfKind<"schema"> {
    return {
        kind: "schema",
        catalogName,
        name: s.name!,
        fullName: s.fullName ?? `${catalogName}.${s.name}`,
        comment: s.comment,
        owner: s.owner,
        owned: isOwnedBy(s.owner, userName),
        storageLocation: s.storageLocation,
        createdAt: num(s.createdAt),
        createdBy: s.createdBy,
        updatedAt: num(s.updatedAt),
        updatedBy: s.updatedBy,
    };
}

export function mapTable(
    t: TableInfo,
    catalogName: string,
    schemaName: string,
): NodeOfKind<"table"> {
    return {
        kind: "table",
        catalogName,
        schemaName,
        name: t.name!,
        fullName: t.fullName ?? `${catalogName}.${schemaName}.${t.name}`,
        tableType: t.tableType,
        comment: t.comment,
        dataSourceFormat: t.dataSourceFormat,
        storageLocation: t.storageLocation,
        viewDefinition: t.viewDefinition,
        owner: t.owner,
        createdBy: t.createdBy,
        createdAt: num(t.createdAt),
        updatedAt: num(t.updatedAt),
        updatedBy: t.updatedBy,
        columns: t.columns?.filter((c) => c.name).map(mapColumn),
        customProperties: t.properties,
    };
}

export function mapVolume(
    v: VolumeInfo,
    catalogName: string,
    schemaName: string,
): NodeOfKind<"volume"> {
    return {
        kind: "volume",
        catalogName,
        schemaName,
        name: v.name!,
        fullName: v.fullName ?? `${catalogName}.${schemaName}.${v.name}`,
        volumeType: v.volumeType,
        storageLocation: v.storageLocation,
        comment: v.comment,
        owner: v.owner,
        createdAt: num(v.createdAt),
        createdBy: v.createdBy,
        updatedAt: num(v.updatedAt),
        updatedBy: v.updatedBy,
    };
}

export function mapFunction(
    f: FunctionInfo,
    catalogName: string,
    schemaName: string,
): NodeOfKind<"function"> {
    return {
        kind: "function",
        catalogName,
        schemaName,
        name: f.name!,
        fullName: `${catalogName}.${schemaName}.${f.name}`,
        comment: f.comment,
        owner: f.owner,
        routineBody: f.routineBody,
        routineDefinition: f.routineDefinition,
        fullDataType: f.fullDataType,
        externalLanguage: f.externalLanguage,
        isDeterministic: f.isDeterministic,
        inputParams: (f.inputParams?.parameters ?? []).map((p) => ({
            name: p.name!,
            typeName: p.typeName ? String(p.typeName) : undefined,
            typeText: p.typeText,
            comment: p.comment,
            parameterDefault: p.parameterDefault,
        })),
        createdAt: num(f.createdAt),
        createdBy: f.createdBy,
        updatedAt: num(f.updatedAt),
        updatedBy: f.updatedBy,
    };
}

export function mapRegisteredModel(
    m: RegisteredModelInfo,
    catalogName: string,
    schemaName: string,
): NodeOfKind<"registeredModel"> {
    return {
        kind: "registeredModel",
        catalogName,
        schemaName,
        name: m.name!,
        fullName: m.fullName ?? `${catalogName}.${schemaName}.${m.name}`,
        comment: m.comment,
        owner: m.owner,
        storageLocation: m.storageLocation,
        aliases: m.aliases?.map((a) => ({ aliasName: a.aliasName, versionNum: num(a.versionNum) })),
        createdAt: num(m.createdAt),
        updatedAt: num(m.updatedAt),
    };
}

export function mapModelVersion(
    v: ModelVersionInfo,
    catalogName: string,
    schemaName: string,
    modelName: string,
    fullName: string,
): NodeOfKind<"modelVersion"> {
    return {
        kind: "modelVersion",
        catalogName,
        schemaName,
        modelName,
        fullName,
        version: num(v.version)!,
        comment: v.comment,
        status: v.status,
        storageLocation: v.storageLocation,
        createdAt: num(v.createdAt),
        createdBy: v.createdBy,
    };
}
