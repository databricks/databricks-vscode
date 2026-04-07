import {TreeItem} from "vscode";

export interface ColumnData {
    name: string;
    typeName?: string;
    typeText?: string;
    comment?: string;
    nullable?: boolean;
    position?: number;
}

export interface FunctionParameterInfo {
    name: string;
    typeName?: string;
    typeText?: string;
    comment?: string;
    parameterDefault?: string;
}

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
          pinned?: boolean;
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
          aliases?: Array<{alias_name?: string; version_num?: number}>;
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
    | {kind: "error"; message: string}
    | {kind: "empty"; message: string};

export interface UnityCatalogTreeItem extends TreeItem {
    url?: string;
    copyText?: string;
    storageLocation?: string;
    viewDefinition?: string;
}
