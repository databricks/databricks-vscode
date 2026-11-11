import { QuickPickItemKind, type QuickPick, type QuickPickItem } from "vscode";
import type { SshConnectCompute } from "../../kernel/cli/commands/ssh";
import {
    formatClusterState,
    formatQuickPickClusterDetails,
    isSingleUserOf,
    sortClusters,
    type ClusterDetails,
} from "../../kernel/compute/clusters";
import type { ComputeService } from "../../kernel/compute/ComputeService";
import type { Compute } from "../../kernel/compute/effectiveCompute";
import type { Logger } from "../../platform/log";

/** Verbatim: `ssh_connection.ucws` types "Serverless" and picks this item. */
export const SERVERLESS_LABEL = "$(cloud) Serverless";

interface ServerlessItem extends QuickPickItem {
    readonly accelerator?: string;
}

interface ClusterItem extends QuickPickItem {
    readonly cluster: ClusterDetails;
}

type Item = ServerlessItem | ClusterItem;

function isClusterItem(item: QuickPickItem): item is ClusterItem {
    return (item as Partial<ClusterItem>).cluster !== undefined;
}

/** Plain serverless, then the serverless GPU accelerators the CLI supports. Always shown, whatever is typed. */
const SERVERLESS_ITEMS: readonly ServerlessItem[] = [
    { label: SERVERLESS_LABEL, alwaysShow: true },
    { label: "$(cloud) Serverless GPU 1xA10", alwaysShow: true, accelerator: "GPU_1xA10" },
    { label: "$(cloud) Serverless GPU 8xH100", alwaysShow: true, accelerator: "GPU_8xH100" },
];

export interface SshComputePickerDeps {
    readonly compute: Pick<ComputeService, "clusters" | "refreshClusters" | "effective">;
    /** The signed-in user: only their single-user clusters can host a tunnel. */
    readonly userName: string;
    readonly createQuickPick: <T extends QuickPickItem>() => QuickPick<T>;
    readonly log: Logger;
    /** When the list stops counting as loading, if it hasn't finished. */
    readonly loadingTimeoutMs?: number;
}

/**
 * The tunnel's compute picker (SSH-01), ported from the old
 * `SshCommands.pickCompute`: the serverless items at once, then a separator
 * that reads "Loading clusters…" until the list is complete (or for 10
 * seconds at most), then the user's single-user clusters from the
 * workspace's whole list, running ones first. A stopped cluster is
 * offered too: `ssh connect` starts it. The current compute is
 * preselected once, when its item first shows.
 *
 * Resolves to the chosen compute, or undefined when dismissed. Nothing is
 * saved: the tunnel's compute isn't the project's.
 */
export async function pickSshCompute(
    deps: SshComputePickerDeps,
): Promise<SshConnectCompute | undefined> {
    const { compute } = deps;
    const quickPick = deps.createQuickPick<Item>();
    quickPick.title = "Select compute for SSH tunnel";
    quickPick.placeholder = "Loading dedicated clusters…";
    quickPick.keepScrollPosition = true;
    quickPick.canSelectMany = false;
    quickPick.busy = true;

    let loading = true;
    let preselected = false;
    const current = compute.effective.value;
    const render = () => {
        const clusters = sortClusters(
            compute.clusters.value.clusters.filter((c) => isSingleUserOf(c, deps.userName)),
        );
        const items: Item[] = [
            ...SERVERLESS_ITEMS,
            {
                label: loading
                    ? "Loading clusters…"
                    : clusters.length > 0
                      ? "Dedicated clusters"
                      : "No dedicated clusters found",
                kind: QuickPickItemKind.Separator,
            },
            ...clusters.map((cluster): ClusterItem => ({
                label: `$(server) ${cluster.name} (${cluster.id})`,
                detail: `${formatClusterState(cluster.state)} | ${formatQuickPickClusterDetails(cluster)}`,
                cluster,
            })),
        ];
        quickPick.items = items;
        // Once: re-applying it on every repaint would pull the highlight
        // back while the user moves through the list.
        if (!preselected) {
            const match = preselection(items, current);
            if (match !== undefined) {
                preselected = true;
                quickPick.activeItems = [match];
            }
        }
    };
    const stopLoading = () => {
        if (loading) {
            loading = false;
            quickPick.busy = false;
            quickPick.placeholder = undefined;
            render();
        }
    };

    const subscription = compute.clusters.onDidChange(render);
    // The previous list, if any, shows until the new one arrives.
    render();
    let open = true;
    void compute
        .refreshClusters()
        .catch((e: unknown) => deps.log.warn("Can't list clusters for the SSH tunnel", e))
        .finally(() => {
            if (open) {
                stopLoading();
            }
        });
    // A listing that hangs mustn't keep the spinner going.
    const timeout = setTimeout(stopLoading, deps.loadingTimeoutMs ?? 10_000);

    const choice = await new Promise<Item | undefined>((resolve) => {
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
    open = false;
    clearTimeout(timeout);
    subscription.dispose();
    quickPick.dispose();

    if (choice === undefined) {
        return undefined;
    }
    if (isClusterItem(choice)) {
        return { kind: "cluster", clusterId: choice.cluster.id };
    }
    return {
        kind: "serverless",
        ...(choice.accelerator !== undefined ? { accelerator: choice.accelerator } : {}),
    };
}

/**
 * The attached cluster if it is listed, else Serverless when that is the current compute. The
 * serverless default is not a choice, so it isn't pre-selected: Enter must not start a session.
 */
function preselection(items: readonly Item[], current: Compute | undefined): Item | undefined {
    switch (current?.kind) {
        case "cluster":
            return items.find((i) => isClusterItem(i) && i.cluster.id === current.clusterId);
        case "serverless":
            return current.source === "default"
                ? undefined
                : items.find((i) => i.label === SERVERLESS_LABEL);
        default:
            return undefined;
    }
}
