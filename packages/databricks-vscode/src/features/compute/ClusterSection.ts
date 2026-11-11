import {
    ThemeColor,
    ThemeIcon,
    TreeItemCheckboxState,
    TreeItemCollapsibleState,
    type Event,
    type TreeItemLabel,
} from "vscode";
import {
    clusterUrl,
    dbrVersion,
    isSingleUser,
    type ClusterDetails,
} from "../../kernel/compute/clusters";
import { ATTACH_CLUSTER_QUICK_PICK } from "../../kernel/compute/commands";
import type { AttachedCluster } from "../../kernel/compute/ComputeService";
import type { Compute } from "../../kernel/compute/effectiveCompute";
import {
    SECTION_ORDER,
    type ConfigurationItem,
    type ConfigurationSection,
} from "../../platform/ui/sections";

const ROW_ID = "CLUSTER";
export const CLUSTER_OVERRIDE_CHECKBOX_ID = "OVERRIDE_CLUSTER";

/** The menus match `databricks.configuration.cluster.<state>`: start a terminated cluster, stop a running or pending one. */
const CLUSTER_CONTEXT = "databricks.configuration.cluster";

const OVERRIDE_LABEL = "Override Jobs cluster in bundle";
const OVERRIDE_TOOLTIP = "Use the selected cluster for all jobs in the bundle";

/** What the section shows: read when it renders, never fetched then. */
export interface ClusterSectionInputs {
    /** Connected, with a development target: only then is there an interactive cluster to show. */
    visible(): boolean;
    effective(): Compute | undefined;
    attached(): AttachedCluster | undefined;
    useClusterOverride(): boolean;
    host(): string | undefined;
    /** "Override Jobs cluster in bundle" was checked or unchecked. */
    setUseClusterOverride(checked: boolean): unknown;
}

function highlighted(label: string): TreeItemLabel {
    return { label, highlights: [[0, label.length]] };
}

/** The old `ClusterComponent`'s icon and `contextValue` suffix for a state. */
function stateLook(state: string | undefined): { icon: ThemeIcon; context: string } {
    switch (state) {
        case "RESIZING":
        case "RUNNING":
            return { icon: new ThemeIcon("debug-start"), context: "running" };
        case "RESTARTING":
        case "PENDING":
            return {
                icon: new ThemeIcon("sync~spin", new ThemeColor("debugIcon.startForeground")),
                context: "pending",
            };
        case "TERMINATING":
            return {
                icon: new ThemeIcon(
                    "sync~spin",
                    new ThemeColor("notificationsErrorIcon.foreground"),
                ),
                context: "terminating",
            };
        case "TERMINATED":
            return {
                icon: new ThemeIcon(
                    "stop-circle",
                    new ThemeColor("notificationsErrorIcon.foreground"),
                ),
                context: "terminated",
            };
        case "ERROR":
            return {
                icon: new ThemeIcon(
                    "testing-error-icon",
                    new ThemeColor("notificationsErrorIcon.foreground"),
                ),
                context: "error",
            };
        default:
            return { icon: new ThemeIcon("question"), context: "unknown" };
    }
}

/**
 * The "Cluster" row (COMP-06), with its details below it and the "Override
 * Jobs cluster in bundle" checkbox beside it; or the "Serverless" row; or a
 * highlighted "Select compute" that opens the picker. Ported from the old
 * `ClusterComponent` and `ConfigurationTreeViewManager`. The cluster's
 * state comes from `ComputeService.attachedCluster`, which the feature
 * observes while this section exists.
 */
export class ClusterSection implements ConfigurationSection {
    readonly id = "compute.cluster";
    readonly order = SECTION_ORDER.compute;

    constructor(
        private readonly inputs: ClusterSectionInputs,
        readonly onDidChange?: Event<void>,
    ) {}

    getChildren(parent?: ConfigurationItem): ConfigurationItem[] {
        if (!this.inputs.visible()) {
            return [];
        }
        if (parent === undefined) {
            return this.roots();
        }
        const details = this.inputs.attached()?.details;
        if (
            parent.id !== ROW_ID ||
            details === undefined ||
            this.inputs.effective()?.kind !== "cluster"
        ) {
            return [];
        }
        return this.details(details);
    }

    setChecked(item: ConfigurationItem, checked: boolean): void {
        if (item.id === CLUSTER_OVERRIDE_CHECKBOX_ID) {
            void this.inputs.setUseClusterOverride(checked);
        }
    }

    private roots(): ConfigurationItem[] {
        const effective = this.inputs.effective();
        if (effective?.kind === "serverless") {
            return [
                {
                    label: "Serverless",
                    id: ROW_ID,
                    collapsibleState: TreeItemCollapsibleState.None,
                    contextValue: `${CLUSTER_CONTEXT}.serverless`,
                    iconPath: new ThemeIcon("cloud", new ThemeColor("debugIcon.startForeground")),
                },
            ];
        }
        if (effective === undefined) {
            return [
                {
                    label: highlighted("Select compute"),
                    id: ROW_ID,
                    collapsibleState: TreeItemCollapsibleState.None,
                    contextValue: `${CLUSTER_CONTEXT}.none`,
                    // Not an error: a deploy or a bundle run doesn't need compute.
                    iconPath: new ThemeIcon("server"),
                    command: { title: "Select compute", command: ATTACH_CLUSTER_QUICK_PICK.id },
                },
            ];
        }
        const attached = this.inputs.attached();
        const details = attached?.clusterId === effective.clusterId ? attached.details : undefined;
        const error = attached?.clusterId === effective.clusterId ? attached.error : undefined;
        const { icon, context } =
            details !== undefined
                ? stateLook(details.state)
                : error !== undefined
                  ? stateLook("ERROR")
                  : stateLook(undefined);
        const host = this.inputs.host();
        const url = host === undefined ? undefined : clusterUrl(host, effective.clusterId);
        const useOverride = this.inputs.useClusterOverride();
        return [
            {
                label: "Cluster",
                id: ROW_ID,
                // The name once it is read; the ID until then, or when it can't be.
                description: details?.name || effective.clusterId,
                tooltip:
                    error !== undefined && details === undefined
                        ? `Can't read cluster ${effective.clusterId}: ${error.message}`
                        : undefined,
                collapsibleState:
                    details !== undefined
                        ? TreeItemCollapsibleState.Collapsed
                        : TreeItemCollapsibleState.None,
                contextValue: `${CLUSTER_CONTEXT}.${context}${url ? ".has-url" : ""}`,
                iconPath: icon,
                url,
            },
            {
                label: useOverride ? highlighted(OVERRIDE_LABEL) : OVERRIDE_LABEL,
                id: CLUSTER_OVERRIDE_CHECKBOX_ID,
                checkboxState: {
                    state: useOverride
                        ? TreeItemCheckboxState.Checked
                        : TreeItemCheckboxState.Unchecked,
                    tooltip: OVERRIDE_TOOLTIP,
                },
                tooltip: OVERRIDE_TOOLTIP,
                collapsibleState: TreeItemCollapsibleState.None,
            },
        ];
    }

    private details(cluster: ClusterDetails): ConfigurationItem[] {
        const none = TreeItemCollapsibleState.None;
        const rows: ConfigurationItem[] = [
            {
                label: "Cluster ID",
                id: `${ROW_ID}.id`,
                description: cluster.id,
                collapsibleState: none,
            },
            {
                label: "Databricks Runtime",
                id: `${ROW_ID}.runtime`,
                description: dbrVersion(cluster.sparkVersion).join("."),
                collapsibleState: none,
            },
            {
                label: "Creator",
                id: `${ROW_ID}.creator`,
                description: cluster.creator,
                collapsibleState: none,
            },
        ];
        if (cluster.stateMessage && cluster.state !== "RUNNING") {
            rows.push({
                label: "State",
                id: `${ROW_ID}.state`,
                description: `${cluster.state} - ${cluster.stateMessage}`,
                collapsibleState: none,
            });
        }
        if (cluster.accessMode) {
            rows.push({
                label: "Access Mode",
                id: `${ROW_ID}.accessMode`,
                description: isSingleUser(cluster)
                    ? `${cluster.accessMode} - ${cluster.singleUserName}`
                    : cluster.accessMode,
                collapsibleState: none,
            });
        }
        return rows;
    }
}
