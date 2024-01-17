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
import {CodeSynchronizer} from "../../sync";

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
    private components: Array<BaseComponent> = [];
    constructor(
        private readonly connectionManager: ConnectionManager,
        private readonly codeSynchronizer: CodeSynchronizer,
        private readonly configModel: ConfigModel
    ) {
        this.components.push(
            new BundleTargetComponent(this.configModel),
            new AuthTypeComponent(this.connectionManager, this.configModel),
            new ClusterComponent(this.connectionManager, this.configModel),
            new SyncDestinationComponent(
                this.codeSynchronizer,
                this.connectionManager,
                this.configModel
            )
        );

        this.disposables.push(
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
        switch (this.connectionManager.state) {
            case "DISCONNECTED":
            case "CONNECTED":
                break;
            case "CONNECTING":
                await this.connectionManager.waitForConnect();
                break;
        }

        return (
            await Promise.all(this.components.map((c) => c.getChildren(parent)))
        ).flat();
    }
}
