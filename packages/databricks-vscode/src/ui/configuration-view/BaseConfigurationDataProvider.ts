import {
    Disposable,
    Event,
    EventEmitter,
    TreeDataProvider,
    TreeItem,
} from "vscode";
import {logging} from "@databricks/sdk-experimental";
import {Loggers} from "../../logger";
import {BaseComponent} from "./BaseComponent";
import {ConfigurationTreeItem} from "./types";
import {stampCopyKind} from "./copyActions";

/**
 * Shared plumbing for the Configuration view's tree providers. Subclasses pick
 * the components and, via {@link visibleComponents}, when they show; a
 * component that fails to load is logged and left out rather than emptying the
 * view.
 */
export abstract class BaseConfigurationDataProvider
    implements TreeDataProvider<ConfigurationTreeItem>, Disposable
{
    private readonly _onDidChangeTreeData = new EventEmitter<
        ConfigurationTreeItem | undefined | void
    >();
    readonly onDidChangeTreeData: Event<
        ConfigurationTreeItem | undefined | void
    > = this._onDidChangeTreeData.event;

    protected readonly disposables: Disposable[] = [];

    constructor(protected readonly components: BaseComponent[]) {
        this.disposables.push(
            this._onDidChangeTreeData,
            ...components,
            ...components.map((c) => c.onDidChange(() => this.refresh()))
        );
    }

    /** Re-render the whole tree. */
    protected refresh() {
        this._onDidChangeTreeData.fire();
    }

    /** The components to render, or `[]` so the view's welcome content shows. */
    protected abstract visibleComponents(): Promise<BaseComponent[]>;

    getTreeItem(element: ConfigurationTreeItem): TreeItem | Thenable<TreeItem> {
        stampCopyKind(element);
        return element;
    }

    async getChildren(
        parent?: ConfigurationTreeItem
    ): Promise<ConfigurationTreeItem[]> {
        const children = (await this.visibleComponents()).map((c) =>
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
