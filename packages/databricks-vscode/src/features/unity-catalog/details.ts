import { DataQualityClient } from "@databricks/sdk-dataquality/v1";
import { EntityTagAssignmentsClient } from "@databricks/sdk-uc-entitytagassignments/v1";
import { GrantsClient } from "@databricks/sdk-uc-grants/v1";
import { TablesClient, type TableInfo } from "@databricks/sdk-uc-tables/v1";
import { calls, isNotFound, pathValue } from "../../kernel/connection";
import { mapColumn } from "./mappers";
import type { DetailableNode, NodeOfKind, UnityCatalogTreeNode } from "./types";
import { listAll, type UnityCatalogModel } from "./UnityCatalogModel";

export interface MonitorSummary {
    status: string;
    dashboardId?: string;
    schedule?: string;
    driftMetricsTable?: string;
    profileMetricsTable?: string;
    failureMsg?: string;
}

interface ConstraintSummary {
    type: "pk" | "fk";
    name?: string;
    columns: string[];
    parentTable?: string;
    parentColumns?: string[];
}

interface ChildItem {
    label: string;
    subLabel?: string;
    owner?: string;
    status?: string;
    createdBy?: string;
    createdAt?: number;
    /** A model version: its row links to its own detail. */
    nodeData?: NodeOfKind<"modelVersion">;
}

/** What the detail panel adds once the node is shown (UC-02): the same fields as before. */
export interface NodeEnrichments {
    tags?: Array<{ key: string; value?: string }>;
    permissions?: Array<{ principal: string; privileges: string[] }>;
    /** `null`: the table has no monitor. */
    monitor?: MonitorSummary | null;
    constraints?: ConstraintSummary[];
    customProperties?: Record<string, string>;
    rowFilter?: { functionName: string; usingColumns: string[] };
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

const SECURABLE_TYPE: Partial<Record<UnityCatalogTreeNode["kind"], string>> = {
    catalog: "CATALOG",
    schema: "SCHEMA",
    table: "TABLE",
    volume: "VOLUME",
    function: "FUNCTION",
};

const TAG_ENTITY_TYPE: Partial<Record<UnityCatalogTreeNode["kind"], string>> = {
    catalog: "catalogs",
    schema: "schemas",
    table: "tables",
    volume: "volumes",
};

const notApplicable = () => Promise.reject(new Error("not applicable"));

/**
 * Tags, effective permissions, a table's details and quality monitor, and
 * the children list, each loaded on its own: one that fails leaves its
 * section out. The children reuse what the tree loaded.
 */
export async function loadNodeEnrichments(
    model: UnityCatalogModel,
    node: Exclude<DetailableNode, { kind: "modelVersion" }>,
): Promise<NodeEnrichments> {
    const api = model.connection.api;
    const tagEntityType = TAG_ENTITY_TYPE[node.kind];
    const securableType = SECURABLE_TYPE[node.kind];

    const tableDetail: Promise<TableInfo> =
        node.kind === "table"
            ? api
                  .get(TablesClient)
                  .getTable({ fullNameArg: pathValue(node.fullName) }, calls.read())
            : notApplicable();
    const [tagsResult, permissionsResult, tableDetailResult, monitorResult, childrenResult] =
        await Promise.allSettled([
            tagEntityType
                ? listAll(
                      (pageToken) =>
                          api.get(EntityTagAssignmentsClient).listEntityTagAssignments(
                              {
                                  entityType: tagEntityType,
                                  entityName: pathValue(node.fullName),
                                  pageToken,
                              },
                              calls.read(),
                          ),
                      (r) => r.tagAssignments,
                  )
                : notApplicable(),
            securableType
                ? api
                      .get(GrantsClient)
                      .getEffectivePermissions(
                          { securableType, securableFullName: pathValue(node.fullName) },
                          calls.read(),
                      )
                : notApplicable(),
            tableDetail,
            node.kind === "table"
                ? tableDetail.then((t) => loadMonitor(model, t))
                : notApplicable(),
            loadChildren(model, node),
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
            key: t.tagKey ?? "",
            value: t.tagValue,
        }));
    }

    if (permissionsResult.status === "fulfilled") {
        enrichments.permissions = (permissionsResult.value.privilegeAssignments ?? []).map((a) => ({
            principal: a.principal ?? "",
            privileges: (a.privileges ?? []).map((p) => p.privilege ?? "").filter(Boolean),
        }));
    }

    if (tableDetailResult.status === "fulfilled" && node.kind === "table") {
        const t = tableDetailResult.value;
        if (!node.columns?.length && t.columns?.length) {
            enrichments.columns = t.columns
                .filter((c) => c.name)
                .map(mapColumn)
                .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
        }
        const constraints = (t.tableConstraints ?? []).flatMap((c): ConstraintSummary[] => {
            const constraint = c.constraint;
            if (constraint?.$case === "primaryKeyConstraint") {
                const pk = constraint.primaryKeyConstraint;
                return [{ type: "pk", name: pk.name, columns: pk.childColumns ?? [] }];
            }
            if (constraint?.$case === "foreignKeyConstraint") {
                const fk = constraint.foreignKeyConstraint;
                return [
                    {
                        type: "fk",
                        name: fk.name,
                        columns: fk.childColumns ?? [],
                        parentTable: fk.parentTable,
                        parentColumns: fk.parentColumns,
                    },
                ];
            }
            return [];
        });
        if (constraints.length > 0) {
            enrichments.constraints = constraints;
        }
        if (t.rowFilter?.functionName) {
            enrichments.rowFilter = {
                functionName: t.rowFilter.functionName,
                usingColumns: t.rowFilter.inputColumnNames ?? [],
            };
        }
        if (t.pipelineId) {
            enrichments.pipelineId = t.pipelineId;
        }
    }

    if (monitorResult.status === "fulfilled") {
        enrichments.monitor = monitorResult.value;
    }

    if (childrenResult.status === "fulfilled" && childrenResult.value) {
        enrichments.childrenTitle = childrenResult.value.title;
        enrichments.children = childrenResult.value.items;
    }

    return enrichments;
}

/**
 * The table's data-profiling monitor, through `@databricks/sdk-dataquality`
 * (the legacy `qualityMonitors.get` isn't in the modular SDK). Statuses
 * read as the legacy ones (`MONITOR_STATUS_ACTIVE`), which the panel
 * shortens. `null` when the table has none; a failure rejects.
 */
export async function loadMonitor(
    model: UnityCatalogModel,
    table: TableInfo,
): Promise<MonitorSummary | null> {
    if (!table.tableId) {
        return null;
    }
    try {
        const monitor = await model.connection.api
            .get(DataQualityClient)
            .getMonitor({ objectType: "table", objectId: table.tableId }, calls.read());
        const profiling = monitor.dataProfilingConfig;
        if (profiling === undefined) {
            return null;
        }
        return {
            status: (profiling.status ?? "").replace(/^DATA_PROFILING_STATUS_/, "MONITOR_STATUS_"),
            dashboardId: profiling.dashboardId,
            schedule: profiling.schedule?.quartzCronExpression,
            driftMetricsTable: profiling.driftMetricsTableName,
            profileMetricsTable: profiling.profileMetricsTableName,
            failureMsg: profiling.latestMonitorFailureMessage,
        };
    } catch (e) {
        if (isNotFound(e)) {
            return null;
        }
        throw e;
    }
}

async function loadChildren(
    model: UnityCatalogModel,
    node: Exclude<DetailableNode, { kind: "modelVersion" }>,
): Promise<{ title: string; items: ChildItem[] } | null> {
    const children = async (load: () => Promise<UnityCatalogTreeNode[]>) =>
        (await model.loadedChildren(node)) ?? (await load());
    if (node.kind === "catalog") {
        const nodes = await children(() => model.schemas(node));
        return {
            title: "Schemas",
            items: nodes
                .filter((n): n is NodeOfKind<"schema"> => n.kind === "schema")
                .map((n) => ({ label: n.name, owner: n.owner, createdAt: n.createdAt }))
                .sort((a, b) => a.label.localeCompare(b.label)),
        };
    }
    if (node.kind === "schema") {
        const subLabelByKind: Record<string, string> = {
            volume: "VOLUME",
            function: "FUNCTION",
            registeredModel: "MODEL",
        };
        const nodes = await children(() => model.schemaContents(node));
        return {
            title: "Contents",
            items: nodes
                .filter((n): n is NodeOfKind<"table" | "volume" | "function" | "registeredModel"> =>
                    ["table", "volume", "function", "registeredModel"].includes(n.kind),
                )
                .map((n): ChildItem => ({
                    label: n.name,
                    subLabel:
                        n.kind === "table" ? (n.tableType ?? "TABLE") : subLabelByKind[n.kind],
                    owner: n.owner,
                    createdAt: n.createdAt,
                }))
                .sort((a, b) => a.label.localeCompare(b.label)),
        };
    }
    if (node.kind === "registeredModel") {
        const nodes = await children(() => model.modelVersions(node));
        return {
            title: "Versions",
            items: nodes
                .filter((n): n is NodeOfKind<"modelVersion"> => n.kind === "modelVersion")
                .sort((a, b) => b.version - a.version)
                .map((n) => ({
                    label: `v${n.version}`,
                    status: n.status,
                    createdBy: n.createdBy,
                    createdAt: n.createdAt,
                    nodeData: n,
                })),
        };
    }
    return null;
}
