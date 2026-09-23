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
import {BundleTargetComponent} from "./BundleTargetComponent";
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
 * opens) reads the active project folder, which throws when none is open, so it
 * is suppressed until a folder is active; the no-folder state is handled by a
 * viewsWelcome entry that points at the folder picker.
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
        configModel: ConfigModel,
        private readonly workspaceFolderManager: WorkspaceFolderManager
    ) {
        this.workspaceFolderComponent = new WorkspaceFolderComponent(
            workspaceFolderManager
        );
        this.bundleTargetComponent = new BundleTargetComponent(configModel);
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
            )
        );
    }

    getTreeItem(element: ConfigurationTreeItem): TreeItem | Thenable<TreeItem> {
        stampCopyKind(element);
        return element;
    }

    async getChildren(
        parent?: ConfigurationTreeItem
    ): Promise<ConfigurationTreeItem[]> {
        const children = this.components
            // BundleTargetComponent reads the active project folder (throws when
            // none is open) - and its "Select a bundle target" prompt is only
            // useful once a folder is chosen. The no-folder case is covered by
            // the view's welcome content.
            .filter(
                (c) =>
                    c !== this.bundleTargetComponent || this.hasProjectFolder()
            )
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
