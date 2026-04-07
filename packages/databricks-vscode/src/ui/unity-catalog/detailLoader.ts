/* eslint-disable @typescript-eslint/naming-convention */
import {ApiError} from "@databricks/sdk-experimental";
import {ConnectionManager} from "../../configuration/ConnectionManager";
import {UnityCatalogTreeNode} from "./types";
import {drainAsyncIterable} from "./utils";

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

export interface NodeEnrichments {
    tags?: Array<{key: string; value?: string}>;
    permissions?: Array<{principal: string; privileges: string[]}>;
    monitor?: MonitorSummary | null;
    constraints?: ConstraintSummary[];
    customProperties?: Record<string, string>;
    rowFilter?: {functionName: string; usingColumns: string[]};
    pipelineId?: string;
}

const SECURABLE_TYPE: Partial<Record<string, string>> = {
    catalog: "CATALOG",
    schema: "SCHEMA",
    table: "TABLE",
    volume: "VOLUME",
    function: "FUNCTION",
    registeredModel: "FUNCTION",
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
        {kind: "error" | "empty" | "column" | "modelVersion"}
    >
): Promise<NodeEnrichments> {
    const tagEntityType = TAG_ENTITY_TYPE[node.kind];
    const securableType = SECURABLE_TYPE[node.kind];

    const [tagsResult, permissionsResult, tableDetailResult, monitorResult] =
        await Promise.allSettled([
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

    return enrichments;
}
