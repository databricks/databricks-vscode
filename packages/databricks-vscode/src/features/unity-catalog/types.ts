export interface ColumnData {
    name: string;
    typeName?: string;
    typeText?: string;
    comment?: string;
    nullable?: boolean;
    position?: number;
}

interface FunctionParameterInfo {
    name: string;
    typeName?: string;
    typeText?: string;
    comment?: string;
    parameterDefault?: string;
}

/** One row of the Unity Catalog tree, as plain data. Timestamps are epoch milliseconds. */
export type UnityCatalogTreeNode =
    | {
          kind: "catalog";
          name: string;
          fullName: string;
          comment?: string;
          owner?: string;
          owned?: boolean;
          catalogType?: string;
          isolationMode?: string;
          storageLocation?: string;
          createdAt?: number;
          createdBy?: string;
          updatedAt?: number;
          updatedBy?: string;
          connectionName?: string;
          providerName?: string;
          shareName?: string;
      }
    | {
          kind: "schema";
          catalogName: string;
          name: string;
          fullName: string;
          comment?: string;
          owner?: string;
          owned?: boolean;
          storageLocation?: string;
          createdAt?: number;
          createdBy?: string;
          updatedAt?: number;
          updatedBy?: string;
      }
    | {
          kind: "table";
          catalogName: string;
          schemaName: string;
          name: string;
          fullName: string;
          tableType?: string;
          comment?: string;
          dataSourceFormat?: string;
          storageLocation?: string;
          viewDefinition?: string;
          owner?: string;
          createdBy?: string;
          createdAt?: number;
          updatedAt?: number;
          updatedBy?: string;
          columns?: ColumnData[];
          customProperties?: Record<string, string>;
      }
    | {
          kind: "volume";
          catalogName: string;
          schemaName: string;
          name: string;
          fullName: string;
          volumeType?: string;
          storageLocation?: string;
          comment?: string;
          owner?: string;
          createdAt?: number;
          createdBy?: string;
          updatedAt?: number;
          updatedBy?: string;
      }
    | {
          kind: "function";
          catalogName: string;
          schemaName: string;
          name: string;
          fullName: string;
          comment?: string;
          owner?: string;
          routineBody?: string;
          routineDefinition?: string;
          fullDataType?: string;
          externalLanguage?: string;
          isDeterministic?: boolean;
          inputParams?: FunctionParameterInfo[];
          createdAt?: number;
          createdBy?: string;
          updatedAt?: number;
          updatedBy?: string;
      }
    | {
          kind: "registeredModel";
          catalogName: string;
          schemaName: string;
          name: string;
          fullName: string;
          comment?: string;
          owner?: string;
          storageLocation?: string;
          aliases?: Array<{ aliasName?: string; versionNum?: number }>;
          createdAt?: number;
          updatedAt?: number;
      }
    | {
          kind: "modelVersion";
          catalogName: string;
          schemaName: string;
          modelName: string;
          fullName: string;
          version: number;
          comment?: string;
          status?: string;
          storageLocation?: string;
          createdAt?: number;
          createdBy?: string;
      }
    | {
          kind: "column";
          tableFullName: string;
          name: string;
          typeName?: string;
          typeText?: string;
          comment?: string;
          nullable?: boolean;
          position?: number;
      }
    | {
          kind: "group";
          groupType: GroupType;
          catalogName: string;
          schemaName: string;
          schemaFullName: string;
          count: number;
      }
    | { kind: "error"; message: string }
    | { kind: "empty"; message: string }
    | { kind: "favorites" };

export type NodeOfKind<K extends UnityCatalogTreeNode["kind"]> = Extract<
    UnityCatalogTreeNode,
    { kind: K }
>;

export type GroupType = "tables" | "volumes" | "functions" | "models";

type PinnableNodeKind =
    | "catalog"
    | "schema"
    | "table"
    | "volume"
    | "function"
    | "registeredModel"
    | "modelVersion";

export type PinnableNode = NodeOfKind<PinnableNodeKind>;

/** The nodes the detail panel shows. */
export type DetailableNode = PinnableNode;

export type StoredFavoriteRef =
    | { kind: Exclude<PinnableNodeKind, "modelVersion">; fullName: string }
    | { kind: "modelVersion"; fullName: string; version: number };

const PINNABLE: ReadonlySet<string> = new Set<PinnableNodeKind>([
    "catalog",
    "schema",
    "table",
    "volume",
    "function",
    "registeredModel",
    "modelVersion",
]);

export function isPinnable(node: UnityCatalogTreeNode | undefined): node is PinnableNode {
    return node !== undefined && PINNABLE.has(node.kind);
}

export function favoriteRef(node: PinnableNode): StoredFavoriteRef {
    return node.kind === "modelVersion"
        ? { kind: "modelVersion", fullName: node.fullName, version: node.version }
        : { kind: node.kind, fullName: node.fullName };
}

export function favoriteKey(ref: StoredFavoriteRef): string {
    return ref.kind === "modelVersion" ? `${ref.fullName}@v${ref.version}` : ref.fullName;
}
