import {
    TreeItemCollapsibleState,
    type Disposable,
    type Event,
    type TreeDataProvider,
    type TreeItem,
} from "vscode";
import { Emitter } from "../../platform/event";
import type { Logger } from "../../platform/log";
import type {
    ConfigurationItem,
    ConfigurationSection,
    ConfigurationSections,
    SidebarView,
} from "../../platform/ui/sections";
import { stampCopyKind } from "./copyActions";
import type { OpenGroups } from "./OpenGroups";

export const SIGN_IN_VIEW = "signInView";
export const CONFIGURATION_VIEW = "configurationView";
export const MODELS_VIEW = "modelsAndAiToolsView";

/**
 * Renders one view's sections in their frozen order. With no sections it
 * returns no rows, which is what lets the view's welcome content show.
 */
export class ConfigurationTreeDataProvider implements TreeDataProvider<ConfigurationItem> {
    private readonly changed = new Emitter<ConfigurationItem | undefined>();
    readonly onDidChangeTreeData: Event<ConfigurationItem | undefined> = this.changed.event;
    /** Which section produced a row, so its children are asked of it alone. */
    private readonly owners = new WeakMap<ConfigurationItem, ConfigurationSection>();
    private readonly subscription: Disposable;

    constructor(
        private readonly sections: ConfigurationSections,
        private readonly log: Logger,
        private readonly view: SidebarView = "configuration",
        private readonly groups?: Pick<OpenGroups, "isOpen">,
    ) {
        this.subscription = sections.onDidChange(() => this.changed.fire(undefined));
    }

    getTreeItem(item: ConfigurationItem): TreeItem {
        stampCopyKind(item);
        const open = item.groupId === undefined ? undefined : this.groups?.isOpen(item.groupId);
        if (open !== undefined) {
            item.collapsibleState = open
                ? TreeItemCollapsibleState.Expanded
                : TreeItemCollapsibleState.Collapsed;
        }
        return item;
    }

    async getChildren(parent?: ConfigurationItem): Promise<ConfigurationItem[]> {
        if (parent !== undefined) {
            const owner = this.owners.get(parent);
            return owner ? this.childrenOf(owner, parent) : [];
        }
        const rows = await Promise.all(
            this.sections.list(this.view).map((section) => this.childrenOf(section)),
        );
        return rows.flat();
    }

    /** The sections' lines of text, for the top of the view. */
    message(): string | undefined {
        const lines = this.sections
            .list(this.view)
            .map((section) => section.message?.())
            .filter((line) => line !== undefined && line !== "");
        return lines.length > 0 ? lines.join(" ") : undefined;
    }

    /** Hands a checkbox change to the section that rendered the row. */
    setChecked(item: ConfigurationItem, checked: boolean): void {
        const owner = this.owners.get(item);
        try {
            owner?.setChecked?.(item, checked);
        } catch (e) {
            this.log.error(`Section ${owner?.id} failed to handle a checkbox`, e);
        }
    }

    private async childrenOf(
        section: ConfigurationSection,
        parent?: ConfigurationItem,
    ): Promise<ConfigurationItem[]> {
        try {
            const items = await section.getChildren(parent);
            for (const item of items) {
                this.owners.set(item, section);
            }
            return items;
        } catch (e) {
            this.log.error(`Section ${section.id} failed to list its rows`, e);
            return [];
        }
    }

    dispose() {
        this.subscription.dispose();
        this.changed.dispose();
    }
}
