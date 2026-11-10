import {
    StatusBarAlignment,
    window,
    type Command,
    type Disposable,
    type StatusBarItem,
} from "vscode";
import { CONFIGURE_LOGIN } from "../../kernel/connection/commands";
import type { ConnectionState } from "../../kernel/connection/ConnectionService";
import { describeSource } from "../../kernel/connection/resolveConnection";
import type { State } from "../../platform/reactive";
import { humaniseAuthType } from "./authTypes";

export const SHOW_CONNECTION_MENU = "databricks.connection.showConnectionMenu";

/** The sign-in the status bar starts when signed out. Its argument is the telemetry source of the sign-in. */
const SIGN_IN_FROM_STATUS_BAR: Command = {
    command: CONFIGURE_LOGIN,
    title: "Sign in to Databricks",
    arguments: ["statusBar"],
};

/** What to do when a session's token is rejected: the window can't renew it. */
export const RESTART_SESSION =
    "The session's token may have expired. Close this window and start the SSH tunnel again from a local window.";

/** What the item shows for a state: a pure function, unit-tested. */
export function statusBarContent(state: ConnectionState): { text: string; tooltip: string } {
    switch (state.status) {
        case "connected": {
            const c = state.connection;
            const name = c.profile ?? "session";
            return {
                text: `Databricks: ${name}`,
                tooltip: [
                    `Host: ${c.host}`,
                    ...(c.workspaceId !== undefined ? [`Workspace: ${c.workspaceId}`] : []),
                    `User: ${c.userName}`,
                    `Auth type: ${humaniseAuthType(c.authType)}`,
                    c.profile !== undefined
                        ? `Profile: ${c.profile}, chosen by ${describeSource(c.source)}`
                        : "Credentials from the SSH tunnel's session",
                ].join("\n"),
            };
        }
        case "connecting":
            return {
                text: `$(sync~spin) Databricks: ${state.profile ?? "connecting"}`,
                tooltip: state.host ? `Connecting to ${state.host}` : "Connecting to Databricks",
            };
        case "signedOut":
            return {
                text: "$(account) Databricks: Sign in",
                tooltip: `Not signed in. ${state.reason}`,
            };
        case "error":
            return {
                text: `$(warning) Databricks: ${state.profile ?? "error"}`,
                tooltip: [
                    state.host ? `Can't connect to ${state.host}` : "Can't connect",
                    state.error.message,
                    ...(state.remedy === "restartSession" ? [RESTART_SESSION] : []),
                ].join("\n"),
            };
    }
}

/**
 * The connection, shown whenever the extension is active.
 * Without a project this is the only place the connection is visible.
 * Clicking it opens the connection menu.
 */
export class ConnectionStatusBarItem implements Disposable {
    private readonly item: StatusBarItem;
    private readonly subscription: Disposable;

    constructor(state: State<ConnectionState>) {
        this.item = window.createStatusBarItem(
            "databricks.connection",
            StatusBarAlignment.Left,
            100,
        );
        this.item.name = "Databricks Connection";
        this.item.command = SHOW_CONNECTION_MENU;
        this.render(state.value);
        this.subscription = state.onDidChange((s) => this.render(s));
        this.item.show();
    }

    private render(state: ConnectionState) {
        const { text, tooltip } = statusBarContent(state);
        this.item.text = text;
        this.item.tooltip = tooltip;
        // Signed out, the click is the sign-in itself; the menu's first item is the same thing.
        this.item.command =
            state.status === "signedOut" ? SIGN_IN_FROM_STATUS_BAR : SHOW_CONNECTION_MENU;
        // Without the icons, which screen readers would spell out.
        this.item.accessibilityInformation = { label: text.replace(/\$\([^)]*\)\s*/g, "") };
    }

    dispose() {
        this.subscription.dispose();
        this.item.dispose();
    }
}
