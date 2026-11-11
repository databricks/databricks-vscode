import { CONFIGURE_LOGIN } from "../../kernel/connection/commands";
import type { ConnectionState } from "../../kernel/connection/ConnectionService";
import type { ConnectionSource } from "../../kernel/connection/resolveConnection";
import { disposeAll, type Event } from "../../platform/event";
import type { State } from "../../platform/reactive";
import {
    SIGN_IN_SECTION_ORDER,
    type ConfigurationItem,
    type ConfigurationSection,
} from "../../platform/ui/sections";
import {
    connectionChildren,
    connectionDetails,
    connectionRow,
    type ConnectionRowKind,
} from "./connectionRows";
import { SHOW_CONNECTION_MENU } from "./ConnectionStatusBarItem";

const WORKSPACE: ConnectionRowKind = {
    label: "Workspace connection",
    id: "CONNECTION",
    context: "databricks.connection",
    menu: { title: "Manage the Databricks connection", command: SHOW_CONNECTION_MENU },
    signIn: {
        title: "Sign in to Databricks",
        command: CONFIGURE_LOGIN,
        tooltip: "Sign in to a Databricks workspace",
    },
};

/** The connection was chosen for a bundle project's target. */
export function fromTarget(source: ConnectionSource): boolean {
    return (
        source.kind === "savedForTarget" ||
        source.kind === "workspaceProfile" ||
        source.kind === "onlyProfileForHost"
    );
}

/**
 * The row for the window's connection state. `target` is the project's, if
 * one is open. Signed out, it says why under it, and shows only in a project,
 * whose target's sign-in needs the reason, or `beside` another connection's
 * row; otherwise the view's sign-in welcome shows. The menus match
 * `databricks.connection.<status>` for the switch, sign-out and
 * sign-in-again actions, with `.target` in a project, where the target
 * decides the workspace and the switch only changes the profile.
 */
export function workspaceConnectionRows(
    state: ConnectionState,
    target?: string,
    beside = false,
): ConfigurationItem[] {
    if (state.status === "signedOut" && !beside && target === undefined) {
        return [];
    }
    return [
        connectionRow(state, WORKSPACE, {
            ...(target !== undefined &&
            state.status === "connected" &&
            fromTarget(state.connection.source)
                ? { detail: `for target ${target}` }
                : {}),
            notes:
                target !== undefined
                    ? [
                          `Target ${target} decides the workspace: select another target to use another one.`,
                      ]
                    : [],
            contextSuffix: target !== undefined ? ".target" : "",
            reason: true,
        }),
    ];
}

/** The rows under the connected row, or the reason under one that can't connect or is signed out. */
export function workspaceConnectionDetails(state: ConnectionState): ConfigurationItem[] {
    return connectionDetails(state, WORKSPACE);
}

/** The window's connection in the Connection view, in window scope. */
export class WorkspaceConnectionSection implements ConfigurationSection {
    readonly id = "workspaceConnection";
    readonly view = "signIn";
    readonly order = SIGN_IN_SECTION_ORDER.workspace;
    readonly onDidChange: Event<void>;

    constructor(
        private readonly state: State<ConnectionState>,
        private readonly project: () => { readonly target?: string } | undefined = () => undefined,
        /** Unity Gateway's connection, whose row shows beside this one; none where it's off. */
        private readonly gateway?: State<ConnectionState>,
        /** The project's target, which the row names: its change re-reads the rows. */
        projectTarget?: State<string | undefined>,
    ) {
        this.onDidChange = (listener) => {
            const subscriptions = [
                state.onDidChange(() => listener()),
                ...(gateway ? [gateway.onDidChange(() => listener())] : []),
                ...(projectTarget ? [projectTarget.onDidChange(() => listener())] : []),
            ];
            return { dispose: () => disposeAll(subscriptions) };
        };
    }

    getChildren(parent?: ConfigurationItem): ConfigurationItem[] {
        if (parent === undefined) {
            const beside = this.gateway !== undefined && this.gateway.value.status !== "signedOut";
            return workspaceConnectionRows(this.state.value, this.project()?.target, beside);
        }
        return connectionChildren(this.state.value, WORKSPACE, parent);
    }
}
