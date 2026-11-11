import { ThemeColor, ThemeIcon, TreeItemCollapsibleState } from "vscode";
import type { LocalTarget } from "../../kernel/bundle/LocalBundleConfig";
import type { ProjectSession } from "../../kernel/feature";
import { SELECT_TARGET } from "../../kernel/project/commands";
import type { TargetAccess } from "../../kernel/project/targetAccess";
import type { TargetAccessState } from "../../kernel/project/TargetGuard";
import type { Event } from "../../platform/event";
import {
    SECTION_ORDER,
    type ConfigurationItem,
    type ConfigurationSection,
} from "../../platform/ui/sections";

export { SELECT_TARGET };

/** The menus match `databricks.configuration.target.*` for the inline "Select target" action. */
const TARGET_CONTEXT = "databricks.configuration.target";

const ROW_ID = "TARGET";

/** `development` → `Development`. */
function humaniseMode(mode?: string): string {
    return mode === undefined ? "" : mode.charAt(0).toUpperCase() + mode.slice(1);
}

/**
 * The "Target" row (SHELL-06), with Host and Mode below it. Without a
 * target, a highlighted "Select a bundle target" row opens the picker.
 * Ported from the old `BundleTargetComponent`. The host is the one the YAML
 * names; a target that names only `workspace.profile` shows the host the
 * connection resolved, through `host()`.
 */
export class TargetSection implements ConfigurationSection {
    readonly id = "project.target";
    readonly order = SECTION_ORDER.target;

    constructor(
        private readonly session: ProjectSession,
        private readonly host: () => string | undefined = () => undefined,
        /** Whether this target's bundle commands may run in this window (`kernel.targetAccess`). */
        private readonly access: () => TargetAccessState = () => ({ status: "open" }),
        readonly onDidChange?: Event<void>,
    ) {}

    private get target(): LocalTarget | undefined {
        return this.session.project.config.targets.find((t) => t.name === this.session.target);
    }

    /** The target's paused access, when the target guard pauses it. */
    private get paused(): Extract<TargetAccess, { usable: false }> | undefined {
        const s = this.access();
        return s.status === "decided" &&
            s.root === this.session.project.root &&
            s.target === this.session.target &&
            !s.access.usable
            ? s.access
            : undefined;
    }

    getChildren(parent?: ConfigurationItem): ConfigurationItem[] {
        const target = this.target;
        if (parent === undefined) {
            return [this.root(target)];
        }
        if (parent.id !== ROW_ID || target === undefined) {
            return [];
        }
        const host = target.host ?? this.host();
        const paused = this.paused;
        return [
            ...(paused !== undefined
                ? [
                      {
                          label: "Bundle commands",
                          id: `${ROW_ID}.paused`,
                          description: "Paused",
                          tooltip: `${paused.reason}\n${paused.remedy}`,
                          iconPath: new ThemeIcon(
                              "warning",
                              new ThemeColor("notificationsWarningIcon.foreground"),
                          ),
                          collapsibleState: TreeItemCollapsibleState.None,
                      },
                  ]
                : []),
            {
                label: "Host",
                id: `${ROW_ID}.host`,
                description: host,
                collapsibleState: TreeItemCollapsibleState.None,
                url: host,
            },
            {
                label: "Mode",
                id: `${ROW_ID}.mode`,
                description: humaniseMode(target.mode),
                collapsibleState: TreeItemCollapsibleState.None,
            },
        ];
    }

    private root(target: LocalTarget | undefined): ConfigurationItem {
        if (target === undefined) {
            const label = "Select a bundle target";
            return {
                label: { label, highlights: [[0, label.length]] },
                id: ROW_ID,
                iconPath: new ThemeIcon(
                    "plug",
                    new ThemeColor("notificationsErrorIcon.foreground"),
                ),
                contextValue: `${TARGET_CONTEXT}.none`,
                collapsibleState: TreeItemCollapsibleState.None,
                command: { title: label, command: SELECT_TARGET },
            };
        }
        const paused = this.paused;
        return {
            label: "Target",
            id: ROW_ID,
            iconPath:
                paused === undefined
                    ? new ThemeIcon("target", new ThemeColor("debugIcon.startForeground"))
                    : new ThemeIcon(
                          "warning",
                          new ThemeColor("notificationsWarningIcon.foreground"),
                      ),
            description: paused === undefined ? target.name : `${target.name} (paused)`,
            ...(paused !== undefined ? { tooltip: `${paused.reason}\n${paused.remedy}` } : {}),
            contextValue: `${TARGET_CONTEXT}.${target.mode ?? "default"}`,
            collapsibleState: TreeItemCollapsibleState.Collapsed,
        };
    }
}
