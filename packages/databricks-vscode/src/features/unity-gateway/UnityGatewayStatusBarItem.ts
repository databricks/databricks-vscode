import { StatusBarAlignment, window, type Disposable, type StatusBarItem } from "vscode";
import type { ConnectionState } from "../../kernel/connection/ConnectionService";
import type { State } from "../../platform/reactive";

export const SHOW_MENU = "databricks.unityGateway.showMenu";

/**
 * What the item shows for a state; undefined hides it. Only an error shows:
 * the connection's item is the one sign-in status, and the Connection view
 * shows Unity Gateway's profile.
 */
export function unityGatewayStatus(
    state: ConnectionState,
): { text: string; tooltip: string } | undefined {
    if (state.status !== "error") {
        return undefined;
    }
    return {
        text: `$(warning) Unity Gateway: ${state.profile}`,
        tooltip: [`Unity Gateway isn't connected`, state.error.message].join("\n"),
    };
}

/**
 * A Unity Gateway sign-in that isn't connected, next to the connection's
 * item. Clicking it opens its menu, which can reconnect.
 */
export class UnityGatewayStatusBarItem implements Disposable {
    private readonly item: StatusBarItem;
    private readonly subscription: Disposable;

    constructor(state: State<ConnectionState>) {
        // Right of the connection's item (100).
        this.item = window.createStatusBarItem(
            "databricks.unityGateway",
            StatusBarAlignment.Left,
            99,
        );
        this.item.name = "Databricks Unity Gateway";
        this.item.command = SHOW_MENU;
        this.render(state.value);
        this.subscription = state.onDidChange((s) => this.render(s));
    }

    private render(state: ConnectionState) {
        const status = unityGatewayStatus(state);
        if (status === undefined) {
            this.item.hide();
            return;
        }
        this.item.text = status.text;
        this.item.tooltip = status.tooltip;
        this.item.accessibilityInformation = { label: status.text.replace(/\$\([^)]*\)\s*/g, "") };
        this.item.show();
    }

    dispose() {
        this.subscription.dispose();
        this.item.dispose();
    }
}
