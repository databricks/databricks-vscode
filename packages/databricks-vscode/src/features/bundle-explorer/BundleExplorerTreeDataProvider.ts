import type { Disposable } from "vscode";
import type { DeployedBundle } from "../../kernel/bundle/BundleService";
import type { Logger } from "../../platform/log";
import type { Resource } from "../../platform/reactive";
import { NodeTreeDataProvider } from "../../platform/ui/tree";
import { explorerRoots, type ExplorerContext, type ExplorerNode } from "./nodes";

/**
 * The bundle's resources: the last `bundle summary` of the active
 * target. While a refresh runs it keeps showing the previous one. An empty
 * bundle has no rows at all, not a placeholder.
 */
export class BundleExplorerTreeDataProvider extends NodeTreeDataProvider<ExplorerNode> {
    private readonly subscription: Disposable;

    constructor(
        deployed: Resource<DeployedBundle>,
        asAbsolutePath: (p: string) => string,
        log: Logger,
        session: Pick<ExplorerContext, "runs" | "datasets"> = {},
    ) {
        super(() => {
            const bundle = deployed.latest;
            if (bundle === undefined) {
                return [];
            }
            return explorerRoots(bundle.summary, {
                host: bundle.host,
                root: bundle.root,
                locations: bundle.summary.__locations,
                asAbsolutePath,
                ...session,
            });
        }, log);
        this.subscription = deployed.onDidChange((s) => {
            if (s.status !== "loading") {
                this.refresh();
            }
        });
    }

    override dispose() {
        this.subscription.dispose();
        super.dispose();
    }
}
