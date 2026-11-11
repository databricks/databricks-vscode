import { QuickPickItemKind, type QuickPick, type QuickPickItem } from "vscode";
import {
    formatQuickPickClusterDetails,
    sortClusters,
    type ClusterDetails,
} from "../../kernel/compute/clusters";
import type { SelectedCompute } from "../../kernel/compute/commands";
import type { ComputeService } from "../../kernel/compute/ComputeService";
import type { Logger } from "../../platform/log";
import { clusterStateIcon } from "./clusterItems";

/** The static items, verbatim: the e2e specs pick "Serverless" by label. */
export const SERVERLESS_LABEL = "$(cloud) Serverless";
export const CREATE_CLUSTER_LABEL = "$(repo-create) Create New Cluster";

interface ClusterItem extends QuickPickItem {
    readonly cluster: ClusterDetails;
}

function isClusterItem(item: QuickPickItem): item is ClusterItem {
    return (item as Partial<ClusterItem>).cluster !== undefined;
}

export interface ComputePickerDeps {
    readonly compute: Pick<
        ComputeService,
        "clusters" | "refreshClusters" | "select" | "serverlessVersionRequired"
    >;
    /** The connection's host, for "Create New Cluster". */
    readonly host: string;
    /** The serverless version picker; undefined means it was dismissed. */
    readonly pickServerlessVersion: () => Promise<string | undefined>;
    readonly openExternal: (url: string) => Thenable<unknown>;
    readonly createQuickPick: <T extends QuickPickItem>() => QuickPick<T>;
    readonly log: Logger;
}

/**
 * "Configure compute" (COMP-01), ported from the old
 * `attachClusterQuickPickCommand`. "Serverless" and "Create New Cluster"
 * come first and can be picked at once; the clusters follow as they arrive,
 * running ones first. The picker is busy until the list is complete, and
 * then not. It lists every cluster, whatever the Compute view's
 * filter.
 *
 * Resolves to what was chosen and saved, or undefined when dismissed, when
 * "Create New Cluster" opened the browser, or when the version picker was
 * dismissed (then nothing changes). A failed save throws.
 */
export async function pickCompute(
    deps: ComputePickerDeps,
    title?: string,
): Promise<SelectedCompute | undefined> {
    const { compute } = deps;
    const quickPick = deps.createQuickPick<ClusterItem | QuickPickItem>();
    quickPick.title = title ?? "Select Compute";
    quickPick.keepScrollPosition = true;
    quickPick.canSelectMany = false;
    quickPick.busy = true;
    const staticItems: QuickPickItem[] = [
        {
            label: SERVERLESS_LABEL,
            detail: "Run files as Workflows or use Databricks Connect without a dedicated cluster",
            alwaysShow: false,
        },
        {
            label: CREATE_CLUSTER_LABEL,
            detail: "Open Databricks in the browser and create a new cluster",
            alwaysShow: false,
        },
        { label: "", kind: QuickPickItemKind.Separator },
    ];
    const render = () => {
        quickPick.items = [
            ...staticItems,
            ...sortClusters(compute.clusters.value.clusters).map((cluster): ClusterItem => ({
                label: `$(${clusterStateIcon(cluster.state).id}) ${cluster.name} (${cluster.id})`,
                detail: formatQuickPickClusterDetails(cluster),
                cluster,
            })),
        ];
    };
    const subscription = compute.clusters.onDidChange(render);
    const loading = compute.refreshClusters();
    render();
    let open = true;
    void loading
        .catch((e: unknown) => deps.log.warn("Can't list clusters", e))
        .finally(() => {
            if (open) {
                quickPick.busy = false;
            }
        });

    const close = () => {
        open = false;
        subscription.dispose();
        quickPick.dispose();
    };
    const choice = await new Promise<ClusterItem | QuickPickItem | undefined>((resolve) => {
        // The first selection wins; a repeated Enter is ignored.
        let settled = false;
        quickPick.onDidChangeSelection((selected) => {
            if (!settled && selected[0] !== undefined) {
                settled = true;
                resolve(selected[0]);
            }
        });
        quickPick.onDidHide(() => {
            if (!settled) {
                settled = true;
                resolve(undefined);
            }
        });
        quickPick.show();
    });
    // Closed before a version picker opens, so the two don't stack.
    close();

    if (choice === undefined) {
        return undefined;
    }
    if (isClusterItem(choice)) {
        await compute.select({ kind: "cluster", clusterId: choice.cluster.id });
        return { kind: "cluster", clusterId: choice.cluster.id };
    }
    if (choice.label === SERVERLESS_LABEL) {
        if (!compute.serverlessVersionRequired.value) {
            await compute.select({ kind: "serverless" });
            return { kind: "serverless" };
        }
        const version = await deps.pickServerlessVersion();
        if (version === undefined) {
            return undefined;
        }
        await compute.select({ kind: "serverless", version });
        return { kind: "serverless", version };
    }
    await deps.openExternal(`${deps.host.replace(/\/+$/, "")}/#create/cluster`);
    return undefined;
}
