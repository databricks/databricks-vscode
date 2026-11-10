import { stateKey } from "../../platform/state";
import type { StateStore } from "../../platform/state";

/** Whether the user last opened or closed each group row, by its `groupId`. */
export const OPEN_GROUPS = stateKey<Record<string, boolean>>(
    "databricks.configuration.openGroups",
    "workspace",
    {},
);

/**
 * VS Code forgets which groups were open when the window reloads, so the
 * views remember them. A group the user never opened or closed has no entry.
 */
export class OpenGroups {
    constructor(private readonly state: StateStore) {}

    isOpen(groupId: string): boolean | undefined {
        return this.state.get(OPEN_GROUPS)[groupId];
    }

    remember(groupId: string, open: boolean): Promise<void> {
        return this.state.set(OPEN_GROUPS, { ...this.state.get(OPEN_GROUPS), [groupId]: open });
    }
}
