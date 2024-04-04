import {
    Disposable,
    Event,
    EventEmitter,
    TreeDataProvider,
    TreeItem,
} from "vscode";

import {ConnectionManager} from "../ConnectionManager";
import {ConfigModel} from "../models/ConfigModel";
import {BaseComponent} from "./BaseComponent";
import {ConfigurationTreeItem} from "./types";
import {BundleTargetComponent} from "./BundleTargetComponent";
import {AuthTypeComponent} from "./AuthTypeComponent";
import {ClusterComponent} from "./ClusterComponent";
import {SyncDestinationComponent} from "./SyncDestinationComponent";
import {BundleProjectManager} from "../../bundle/BundleProjectManager";
import {CliWrapper} from "../../cli/CliWrapper";
import {logging} from "@databricks/databricks-sdk";
import {Loggers} from "../../logger";
import {FeatureManager} from "../../feature-manager/FeatureManager";
import {EnvironmentComponent} from "./EnvironmentComponent";
import {MsPythonExtensionWrapper} from "../../language/MsPythonExtensionWrapper";

/**
 * Data provider for the cluster tree view
 */
export class ConfigurationDataProvider
    implements TreeDataProvider<ConfigurationTreeItem>, Disposable
{
    private _onDidChangeTreeData: EventEmitter<
        ConfigurationTreeItem | undefined | void
    > = new EventEmitter<ConfigurationTreeItem | undefined | void>();
    readonly onDidChangeTreeData: Event<
        ConfigurationTreeItem | undefined | void
    > = this._onDidChangeTreeData.event;

    private disposables: Array<Disposable> = [];
    private components: Array<BaseComponent> = [
        new EnvironmentComponent(this.pythonExtension, this.featureManager),
        new BundleTargetComponent(this.configModel),
        new AuthTypeComponent(
            this.connectionManager,
            this.configModel,
            this.cli
        ),
        new ClusterComponent(this.connectionManager, this.configModel),
        new SyncDestinationComponent(this.connectionManager, this.configModel),
    ];
    constructor(
        private readonly connectionManager: ConnectionManager,
        private readonly bundleProjectManager: BundleProjectManager,
        private readonly configModel: ConfigModel,
        private readonly cli: CliWrapper,
        private readonly pythonExtension: MsPythonExtensionWrapper,
        private readonly featureManager: FeatureManager
    ) {
        this.disposables.push(
            this.bundleProjectManager.onDidChangeStatus(async () => {
                this._onDidChangeTreeData.fire();
            }),
            ...this.components,
            ...this.components.map((c) =>
                c.onDidChange(() => {
                    this._onDidChangeTreeData.fire();
                })
            )
        );
    }

    dispose() {
        this.disposables.forEach((d) => d.dispose());
    }

    getTreeItem(element: ConfigurationTreeItem): TreeItem | Thenable<TreeItem> {
        return element;
    }

    async getChildren(
        parent?: ConfigurationTreeItem | undefined
    ): Promise<Array<ConfigurationTreeItem>> {
        const isInBundleProject =
            await this.bundleProjectManager.isBundleProject();
        if (!isInBundleProject) {
            return [];
        }
        const children = this.components.map((c) =>
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
}
