import {
    Disposable,
    Event,
    EventEmitter,
    TreeDataProvider,
    TreeItem,
} from "vscode";

import {ConfigModel} from "../../configuration/models/ConfigModel";
import {BaseComponent} from "./BaseComponent";
import {ConfigurationTreeItem} from "./types";
import {stampCopyKind} from "./copyActions";
import {
    BundleTargetComponent,
    HostMismatchProvider,
} from "./BundleTargetComponent";
import {WorkspaceFolderComponent} from "./WorkspaceFolderComponent";
import {WorkspaceFolderManager} from "../../vscode-objs/WorkspaceFolderManager";
import {logging} from "@databricks/sdk-experimental";
import {Loggers} from "../../logger";

/**
 * Slimmed-down variant of {@link ConfigurationDataProvider} for the Configuration
 * view in Databricks Remote SSH mode. It shows just enough to answer "which
 * project folder is selected" and "which workspace/host will a deploy target":
 * the active project folder (clickable to switch) and, once resolved, the bundle
 * target with its Host and Mode children.
 *
 * Unlike the normal-mode provider it has no BundleProjectManager (there is no
 * login flow in remote mode), so it drops the isBundleProject gate and the
 * five components that depend on login/cluster/sync/environment machinery -
 * none of which exists in remote mode.
 *
 * BundleTargetComponent (its "Select a bundle target" prompt and the picker it
 * opens) is suppressed unless the active folder actually exposes bundle targets:
 * with no folder there is nothing to read, and with a non-bundle folder (or a
 * bundle that defines no targets) there is nothing to pick. Both no-target states
 * are covered by a viewsWelcome entry that points at the folder picker.
 */
export class RemoteConfigurationDataProvider
    implements TreeDataProvider<ConfigurationTreeItem>, Disposable
{
    private readonly _onDidChangeTreeData = new EventEmitter<
        ConfigurationTreeItem | undefined | void
    >();
    readonly onDidChangeTreeData: Event<
        ConfigurationTreeItem | undefined | void
    > = this._onDidChangeTreeData.event;

    private readonly disposables: Disposable[] = [];
    private readonly workspaceFolderComponent: WorkspaceFolderComponent;
    private readonly bundleTargetComponent: BundleTargetComponent;
    private readonly components: BaseComponent[];

    constructor(
        private readonly configModel: ConfigModel,
        private readonly workspaceFolderManager: WorkspaceFolderManager,
        hostMismatchProvider: HostMismatchProvider
    ) {
        this.workspaceFolderComponent = new WorkspaceFolderComponent(
            workspaceFolderManager
        );
        this.bundleTargetComponent = new BundleTargetComponent(
            configModel,
            hostMismatchProvider
        );
        this.components = [
            this.workspaceFolderComponent,
            this.bundleTargetComponent,
        ];
        this.disposables.push(
            ...this.components,
            ...this.components.map((c) =>
                c.onDidChange(() => {
                    this._onDidChangeTreeData.fire();
                })
            ),
            // A bundle-file change can add or remove targets without changing the
            // resolved target (so onDidChangeTarget wouldn't fire); refresh here
            // to re-evaluate whether the target row should show.
            this.configModel.onDidChange(async () => {
                this._onDidChangeTreeData.fire();
            })
        );
    }

    getTreeItem(element: ConfigurationTreeItem): TreeItem | Thenable<TreeItem> {
        stampCopyKind(element);
        return element;
    }

    async getChildren(
        parent?: ConfigurationTreeItem
    ): Promise<ConfigurationTreeItem[]> {
        // Resolve the gate up front: Array.prototype.filter can't await, and a
        // returned Promise is always truthy.
        const showBundleTarget = await this.shouldShowBundleTarget();
        const children = this.components
            // Only show BundleTargetComponent's "Select a bundle target" prompt
            // when the folder actually exposes targets to pick; the empty state
            // is covered by the view's welcome content.
            .filter((c) => c !== this.bundleTargetComponent || showBundleTarget)
            .map((c) =>
                c.getChildren(parent).catch((e) => {
                    logging.NamedLogger.getOrCreate(Loggers.Extension).error(
                        `Error getting children for ${c.constructor.name}`,
                        e
                    );
                    return [];
                })
            );
        return (await Promise.all(children)).flat();
    }

    private async shouldShowBundleTarget(): Promise<boolean> {
        if (!this.hasProjectFolder()) {
            return false;
        }
        try {
            const targets = await this.configModel.targets;
            return Object.keys(targets ?? {}).length > 0;
        } catch {
            // A folderless window or an unparseable bundle: nothing to pick.
            return false;
        }
    }

    private hasProjectFolder(): boolean {
        // activeProjectUri throws when no folder is active; treat that as
        // "no project folder" rather than propagating.
        try {
            return this.workspaceFolderManager.activeProjectUri !== undefined;
        } catch {
            return false;
        }
    }

    dispose() {
        this.disposables.forEach((d) => d.dispose());
    }
}
