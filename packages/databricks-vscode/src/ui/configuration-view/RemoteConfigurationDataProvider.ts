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
 * The BundleTargetComponent's "no target" row links to a command
 * (databricks.connection.bundle.selectTarget) that isn't registered in remote
 * mode, so its rows are suppressed until a target is resolved; the truly-empty
 * state is handled by a viewsWelcome entry that points at the folder picker.
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
        workspaceFolderManager: WorkspaceFolderManager
    ) {
        this.workspaceFolderComponent = new WorkspaceFolderComponent(
            workspaceFolderManager
        );
        this.bundleTargetComponent = new BundleTargetComponent(
            this.configModel
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
            // BundleTargetComponent's empty state links to a command that isn't
            // registered in remote mode, so only show it once a target resolves.
            // The no-project case is covered by the view's welcome content.
            .filter(
                (c) =>
                    c !== this.bundleTargetComponent ||
                    this.configModel.target !== undefined
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

    dispose() {
        this.disposables.forEach((d) => d.dispose());
    }
}
