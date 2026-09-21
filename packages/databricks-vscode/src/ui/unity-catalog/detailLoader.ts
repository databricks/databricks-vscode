/* eslint-disable @typescript-eslint/naming-convention */
import {ApiError} from "@databricks/sdk-experimental";
import {ConnectionManager} from "../../configuration/ConnectionManager";
import {mapColumn} from "./mappers";
import {UnityCatalogTreeNode} from "./types";
import {drainAsyncIterable} from "./utils";
import {loadSchemas, loadSchemaChildren, loadModelVersions} from "./loaders";

type Client = NonNullable<ConnectionManager["workspaceClient"]>;

export interface MonitorSummary {
    status: string;
    dashboardId?: string;
    schedule?: string;
    driftMetricsTable?: string;
    profileMetricsTable?: string;
    failureMsg?: string;
}

export interface ConstraintSummary {
    type: "pk" | "fk";
    name?: string;
    columns: string[];
    parentTable?: string;
    parentColumns?: string[];
}

export interface ChildItem {
    label: string;
    subLabel?: string;
    owner?: string;
    status?: string;
    createdBy?: string;
    createdAt?: number;
    nodeData?: Extract<UnityCatalogTreeNode, {kind: "modelVersion"}>;
}

export interface NodeEnrichments {
    tags?: Array<{key: string; value?: string}>;
    permissions?: Array<{principal: string; privileges: string[]}>;
    monitor?: MonitorSummary | null;
    constraints?: ConstraintSummary[];
    customProperties?: Record<string, string>;
    rowFilter?: {functionName: string; usingColumns: string[]};
    pipelineId?: string;
    children?: ChildItem[];
    childrenTitle?: string;
    columns?: Array<{
        name: string;
        typeName?: string;
        typeText?: string;
        comment?: string;
        nullable?: boolean;
        position?: number;
    }>;
}

async function loadChildrenForNode(
    client: Client,
    node: Exclude<
        UnityCatalogTreeNode,
        {kind: "error" | "empty" | "column" | "modelVersion" | "favorites"}
    >,
    cachedChildren?: UnityCatalogTreeNode[]
): Promise<{title: string; items: ChildItem[]} | null> {
    if (node.kind === "catalog") {
        const children =
            cachedChildren ?? (await loadSchemas(client, node.name, undefined));
        return {
            title: "Schemas",
            items: children
                .filter(
                    (n): n is Extract<UnityCatalogTreeNode, {kind: "schema"}> =>
                        n.kind === "schema"
                )
                .map((n) => ({
                    label: n.name,
                    owner: n.owner,
                    createdAt: n.createdAt,
                }))
                .sort((a, b) => a.label.localeCompare(b.label)),
        };
    }
    if (node.kind === "schema") {
        type SchemaChild = Extract<
            UnityCatalogTreeNode,
            {kind: "table" | "volume" | "function" | "registeredModel"}
        >;
        const subLabelByKind: Partial<Record<SchemaChild["kind"], string>> = {
            volume: "VOLUME",
            function: "FUNCTION",
            registeredModel: "MODEL",
        };
        const children =
            cachedChildren ??
            (await loadSchemaChildren(client, node.catalogName, node.name));
        const items: ChildItem[] = children
            .filter(
                (n): n is SchemaChild =>
                    n.kind === "table" ||
                    n.kind === "volume" ||
                    n.kind === "function" ||
                    n.kind === "registeredModel"
            )
            .map(
                (n): ChildItem => ({
                    label: n.name,
                    subLabel:
                        n.kind === "table"
                            ? n.tableType ?? "TABLE"
                            : subLabelByKind[n.kind],
                    owner: n.owner,
                    createdAt: n.createdAt,
                })
            )
            .sort((a, b) => a.label.localeCompare(b.label));
        return {title: "Contents", items};
    }
    if (node.kind === "registeredModel") {
        const children =
            cachedChildren ?? (await loadModelVersions(client, node));
        return {
            title: "Versions",
            items: children
                .filter(
                    (
                        n
                    ): n is Extract<
                        UnityCatalogTreeNode,
                        {kind: "modelVersion"}
                    > => n.kind === "modelVersion"
                )
                .map((n) => ({
                    label: `v${n.version}`,
                    status: n.status,
                    createdBy: n.createdBy,
                    createdAt: n.createdAt,
                    nodeData: n,
                }))
                .sort((a, b) => b.nodeData!.version - a.nodeData!.version),
        };
    }
    return null;
}

const SECURABLE_TYPE: Partial<Record<string, string>> = {
    catalog: "CATALOG",
    schema: "SCHEMA",
    table: "TABLE",
    volume: "VOLUME",
    function: "FUNCTION",
};

const TAG_ENTITY_TYPE: Partial<Record<string, string>> = {
    catalog: "catalogs",
    schema: "schemas",
    table: "tables",
    volume: "volumes",
};

export async function loadNodeEnrichments(
    client: Client,
    node: Exclude<
        UnityCatalogTreeNode,
        {
            kind:
                | "error"
                | "empty"
                | "column"
                | "modelVersion"
                | "favorites"
                | "group";
        }
    >,
    cachedChildren?: UnityCatalogTreeNode[]
): Promise<NodeEnrichments> {
    const tagEntityType = TAG_ENTITY_TYPE[node.kind];
    const securableType = SECURABLE_TYPE[node.kind];

    const [
        tagsResult,
        permissionsResult,
        tableDetailResult,
        monitorResult,
        childrenResult,
    ] = await Promise.allSettled([
        tagEntityType
            ? drainAsyncIterable(
                  client.entityTagAssignments.list({
                      entity_name: node.fullName,
                      entity_type: tagEntityType,
                  })
              )
            : Promise.reject(new Error("not applicable")),
        securableType
            ? client.grants.getEffective({
                  full_name: node.fullName,
                  securable_type: securableType,
              })
            : Promise.reject(new Error("not applicable")),
        node.kind === "table"
            ? client.tables.get({full_name: node.fullName})
            : Promise.reject(new Error("not applicable")),
        node.kind === "table"
            ? client.qualityMonitors.get({table_name: node.fullName})
            : Promise.reject(new Error("not applicable")),
        loadChildrenForNode(client, node, cachedChildren),
    ]);

    const enrichments: NodeEnrichments = {};

    if (
        node.kind === "table" &&
        node.customProperties &&
        Object.keys(node.customProperties).length > 0
    ) {
        enrichments.customProperties = node.customProperties;
    }

    if (tagsResult.status === "fulfilled") {
        enrichments.tags = tagsResult.value.map((t) => ({
            key: t.tag_key,
            value: t.tag_value,
        }));
    }

    if (permissionsResult.status === "fulfilled") {
        enrichments.permissions = (
            permissionsResult.value.privilege_assignments ?? []
        ).map((a) => ({
            principal: a.principal ?? "",
            privileges: (a.privileges ?? [])
                .map((p) => p.privilege ?? "")
                .filter(Boolean),
        }));
    }

    if (tableDetailResult.status === "fulfilled") {
        const t = tableDetailResult.value;
        if (
            node.kind === "table" &&
            !node.columns?.length &&
            t.columns?.length
        ) {
            enrichments.columns = t.columns
                .filter((c) => c.name)
                .map(mapColumn)
                .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
        }
        if (t.table_constraints && t.table_constraints.length > 0) {
            enrichments.constraints = t.table_constraints
                .map((c): ConstraintSummary | null => {
                    if (c.primary_key_constraint) {
                        return {
                            type: "pk",
                            name: c.primary_key_constraint.name,
                            columns: c.primary_key_constraint.child_columns,
                        };
                    }
                    if (c.foreign_key_constraint) {
                        return {
                            type: "fk",
                            name: c.foreign_key_constraint.name,
                            columns: c.foreign_key_constraint.child_columns,
                            parentTable: c.foreign_key_constraint.parent_table,
                            parentColumns:
                                c.foreign_key_constraint.parent_columns,
                        };
                    }
                    return null;
                })
                .filter((c): c is ConstraintSummary => c !== null);
        }
        if (t.row_filter) {
            enrichments.rowFilter = {
                functionName: t.row_filter.function_name,
                usingColumns: t.row_filter.input_column_names,
            };
        }
        if (t.pipeline_id) {
            enrichments.pipelineId = t.pipeline_id;
        }
    }

    if (monitorResult.status === "fulfilled") {
        const m = monitorResult.value;
        enrichments.monitor = {
            status: m.status,
            dashboardId: m.dashboard_id,
            schedule: m.schedule?.quartz_cron_expression,
            driftMetricsTable: m.drift_metrics_table_name,
            profileMetricsTable: m.profile_metrics_table_name,
            failureMsg: m.latest_monitor_failure_msg,
        };
    } else if (
        monitorResult.status === "rejected" &&
        monitorResult.reason instanceof ApiError &&
        monitorResult.reason.statusCode === 404
    ) {
        enrichments.monitor = null;
    }

    if (childrenResult.status === "fulfilled" && childrenResult.value) {
        enrichments.childrenTitle = childrenResult.value.title;
        enrichments.children = childrenResult.value.items;
    }

    return enrichments;
}
