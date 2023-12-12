import {
    Disposable,
    Event,
    EventEmitter,
    TreeDataProvider,
    TreeItem,
    ThemeIcon,
    ThemeColor,
} from "vscode";

import {ConnectionManager} from "../ConnectionManager";
import {ConfigModel} from "../ConfigModel";
import {BaseComponent} from "./BaseComponent";
import {ConfigurationTreeItem} from "./types";
import {BundleTargetComponent} from "./BundleTargetComponent";
import {AuthTypeComponent} from "./AuthTypeComponent";
import {ClusterComponent} from "./ClusterComponent";
import {WorkspaceComponent} from "./WorkspaceComponent";
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
            new WorkspaceComponent(
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

        const configSourceTooltip = {
            bundle: "This configuration is loaded from a Databricks Asset Bundle.",
            override: "This configuration is a workspace only override.",
        };

        return (
            await Promise.all(this.components.map((c) => c.getChildren(parent)))
        )
            .map((items) => {
                // Add config source item to expanded view, if the parent config is not a default
                if (
                    parent?.source === undefined ||
                    parent.source === "default" ||
                    items.length === 0
                ) {
                    return items;
                }

                const tooltip = configSourceTooltip[parent.source];
                return [
                    {
                        label: "Source",
                        description: parent.source,
                        iconPath: new ThemeIcon("info", new ThemeColor("info")),
                        tooltip,
                    },
                    ...items,
                ];
            })
            .flat()
            .map((item) => {
                // Add config source tooltip to the config root item, if the  config is not a default
                // and parent is undefined.
                if (item.source === undefined || item.source === "default") {
                    return item;
                }
                const tooltip = configSourceTooltip[item.source];
                return {
                    ...item,
                    tooltip,
                };
            });
    }
}
