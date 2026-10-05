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
import {BundleFileSet, BundleWatcher} from "../../bundle";
import {logging} from "@databricks/sdk-experimental";
import {Loggers} from "../../logger";

/**
 * The Configuration view in Remote SSH mode: the bundle folder and, when the
 * bundle defines targets, its target. Empty when the folder has no bundle file,
 * so the view's welcome content links the folder picker.
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
    private readonly bundleTargetComponent: BundleTargetComponent;
    private readonly components: BaseComponent[];

    constructor(
        private readonly configModel: ConfigModel,
        workspaceFolderManager: WorkspaceFolderManager,
        private readonly bundleFileSet: BundleFileSet,
        bundleWatcher: BundleWatcher,
        hostMismatchProvider: HostMismatchProvider
    ) {
        this.bundleTargetComponent = new BundleTargetComponent(
            configModel,
            hostMismatchProvider
        );
        this.components = [
            new WorkspaceFolderComponent(workspaceFolderManager, "Bundle"),
            this.bundleTargetComponent,
        ];
        this.disposables.push(
            ...this.components,
            ...this.components.map((c) =>
                c.onDidChange(() => {
                    this._onDidChangeTreeData.fire();
                })
            ),
            this.configModel.onDidChange(async () => {
                this._onDidChangeTreeData.fire();
            }),
            // With no target, configModel.onDidChange doesn't fire for bundle
            // edits, e.g. a databricks.yml appearing or gaining targets.
            bundleWatcher.onDidChange(() => {
                if (this.configModel.target === undefined) {
                    this._onDidChangeTreeData.fire();
                }
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
        if (!(await this.hasBundleFile())) {
            return [];
        }
        // Resolve the gate up front: Array.prototype.filter can't await.
        const showTarget = await this.hasTargets();
        const children = this.components
            .filter((c) => c !== this.bundleTargetComponent || showTarget)
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

    private async hasBundleFile(): Promise<boolean> {
        // activeProjectUri (which getRootFile reads) throws when no folder is
        // active.
        try {
            return (await this.bundleFileSet.getRootFile()) !== undefined;
        } catch {
            return false;
        }
    }

    // False for a bundle with no targets, and for one that can't be parsed: the
    // Bundle row still shows, but there's nothing to pick.
    private async hasTargets(): Promise<boolean> {
        try {
            const targets = await this.configModel.targets;
            return Object.keys(targets ?? {}).length > 0;
        } catch {
            return false;
        }
    }

    dispose() {
        this.disposables.forEach((d) => d.dispose());
    }
}
