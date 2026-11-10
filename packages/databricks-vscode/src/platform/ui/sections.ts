import type { Disposable, Event, TreeItem } from "vscode";
import { Emitter } from "../event";

/** A row in the CONFIGURATION view. */
export interface ConfigurationItem extends TreeItem {
    /** Opened by the row's "Open link" action. */
    url?: string;
    /** Copied by the row's "Copy" action. */
    copyText?: string;
    /** On a group row: VS Code's open or closed state for the group is remembered under this ID. */
    groupId?: string;
}

/**
 * The frozen order of the sections in the configuration view.
 * Gaps leave room for sections that don't exist yet.
 */
export const SECTION_ORDER = {
    localFolder: 10,
    target: 30,
    compute: 50,
    remoteFolder: 60,
    pythonEnvironment: 70,
    resources: 80,
    variables: 90,
} as const;

/** The order of the sections in the Models & AI tools view. */
export const MODELS_SECTION_ORDER = {
    unityGateway: 10,
    aiTools: 20,
} as const;

/** The order of the sections in the Connection view (id `signInView`). */
export const SIGN_IN_SECTION_ORDER = {
    workspace: 10,
    unityGateway: 20,
    sessionCompute: 30,
} as const;

/** The sidebar views that render sections. */
export type SidebarView = "signIn" | "configuration" | "modelsAndAiTools";

/**
 * A contribution to the configuration view, or to another sidebar view. A
 * section that belongs to a scope is added when the scope starts and
 * disposed when it ends, so the view is empty, and shows its welcome
 * content, when no scope is active.
 */
export interface ConfigurationSection {
    readonly id: string;
    readonly order: number;
    /** The view the section's rows go in; the configuration view when unset. */
    readonly view?: SidebarView;
    /** `parent` is undefined for the section's top-level rows. */
    getChildren(parent?: ConfigurationItem): ConfigurationItem[] | Promise<ConfigurationItem[]>;
    readonly onDidChange?: Event<void>;
    /** The user checked or unchecked one of the section's rows that has a `checkboxState`. */
    setChecked?(item: ConfigurationItem, checked: boolean): void;
    /** A line of text above the view's rows, such as what setting the section up gives. */
    message?(): string | undefined;
}

export class ConfigurationSections {
    private readonly sections = new Map<string, ConfigurationSection>();
    private readonly changed = new Emitter<void>();
    /** Fires when a section is added, removed, or reports a change. */
    readonly onDidChange: Event<void> = this.changed.event;

    add(section: ConfigurationSection): Disposable {
        if (this.sections.has(section.id)) {
            throw new Error(`Section ${section.id} is already added`);
        }
        this.sections.set(section.id, section);
        const subscription = section.onDidChange?.(() => this.changed.fire());
        this.changed.fire();
        return {
            dispose: () => {
                subscription?.dispose();
                if (this.sections.get(section.id) === section) {
                    this.sections.delete(section.id);
                    this.changed.fire();
                }
            },
        };
    }

    /** The sections of a view, in display order. */
    list(view: SidebarView = "configuration"): ConfigurationSection[] {
        return [...this.sections.values()]
            .filter((s) => (s.view ?? "configuration") === view)
            .sort((a, b) => a.order - b.order);
    }

    dispose() {
        this.sections.clear();
        this.changed.dispose();
    }
}
