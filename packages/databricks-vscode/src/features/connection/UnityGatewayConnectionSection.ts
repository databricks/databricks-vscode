import type { ConnectionState } from "../../kernel/connection/ConnectionService";
import { disposeAll, type Event } from "../../platform/event";
import type { State } from "../../platform/reactive";
import {
    SIGN_IN_SECTION_ORDER,
    type ConfigurationItem,
    type ConfigurationSection,
} from "../../platform/ui/sections";
import { connectionChildren, connectionRow, type ConnectionRowKind } from "./connectionRows";

/** The menus match `databricks.connection.unityGateway.<status>`; the commands are the unity-gateway feature's. */
const UNITY_GATEWAY: ConnectionRowKind = {
    label: "Unity Gateway connection",
    id: "CONNECTION.unityGateway",
    context: "databricks.connection.unityGateway",
    menu: { title: "Manage Unity Gateway connection", command: "databricks.unityGateway.showMenu" },
    signIn: {
        title: "Sign in to Unity Gateway",
        command: "databricks.unityGateway.signIn",
        tooltip: "Sign in to use Databricks models in VS Code Chat",
    },
};

/**
 * The row for the Unity Gateway connection, beside the workspace's. None
 * while both are signed out outside a project, as `workspaceConnectionRows`
 * has none then: the view's sign-in welcome shows, and a row would hide it.
 * In a project, `target` is its target, and both rows show.
 */
export function unityGatewayConnectionRows(
    gateway: ConnectionState,
    workspace: ConnectionState,
    target?: string,
): ConfigurationItem[] {
    if (
        gateway.status === "signedOut" &&
        workspace.status === "signedOut" &&
        target === undefined
    ) {
        return [];
    }
    return [connectionRow(gateway, UNITY_GATEWAY)];
}

/** The Unity Gateway connection in the Connection view, in window scope. */
export class UnityGatewayConnectionSection implements ConfigurationSection {
    readonly id = "unityGatewayConnection";
    readonly view = "signIn";
    readonly order = SIGN_IN_SECTION_ORDER.unityGateway;
    readonly onDidChange: Event<void>;

    constructor(
        private readonly gateway: State<ConnectionState>,
        private readonly workspace: State<ConnectionState>,
        private readonly project: () => { readonly target?: string } | undefined = () => undefined,
    ) {
        this.onDidChange = (listener) => {
            const subscriptions = [
                gateway.onDidChange(() => listener()),
                workspace.onDidChange(() => listener()),
            ];
            return { dispose: () => disposeAll(subscriptions) };
        };
    }

    getChildren(parent?: ConfigurationItem): ConfigurationItem[] {
        return parent === undefined
            ? unityGatewayConnectionRows(
                  this.gateway.value,
                  this.workspace.value,
                  this.project()?.target,
              )
            : connectionChildren(this.gateway.value, UNITY_GATEWAY, parent);
    }
}
