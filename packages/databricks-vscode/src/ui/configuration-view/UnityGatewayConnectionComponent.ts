import {ThemeColor, ThemeIcon, TreeItemCollapsibleState} from "vscode";
import type {Event} from "vscode";
import type {UnityGatewayConnectionManager} from "../../lm-chat/UnityGatewayConnectionManager";
import {LabelUtils} from "../utils";
import {BaseComponent} from "./BaseComponent";
import type {ConfigurationTreeItem} from "./types";

export const UNITY_GATEWAY_CONNECTION_ID = "UNITY-GATEWAY";

function getContextValue(key: "signedOut" | "disconnected" | "connected") {
    return `databricks.configuration.unityGateway.${key}`;
}

/** The Unity Gateway sign-in, shown next to the bundle's own connection. */
export class UnityGatewayConnectionComponent extends BaseComponent {
    constructor(
        private readonly connectionManager: UnityGatewayConnectionManager,
        private readonly isEnabled: () => boolean,
        onDidChangeEnabled: Event<void>
    ) {
        super();
        this.disposables.push(
            this.connectionManager.onDidChange(() =>
                this.onDidChangeEmitter.fire()
            ),
            onDidChangeEnabled(() => this.onDidChangeEmitter.fire())
        );
    }

    private getRoot(): ConfigurationTreeItem[] {
        if (this.connectionManager.state === "CONNECTING") {
            return [
                {
                    label: "Connecting to Unity Gateway",
                    iconPath: new ThemeIcon("sync~spin"),
                },
            ];
        }

        const authProvider =
            this.connectionManager.databricksWorkspace?.authProvider;
        if (
            this.connectionManager.state !== "CONNECTED" ||
            authProvider === undefined
        ) {
            // A saved profile that isn't connected, e.g. because restoring it
            // failed, isn't shown as signed in.
            const saved = this.connectionManager.hasSavedProfile;
            return [
                {
                    label: LabelUtils.highlightedLabel(
                        saved
                            ? "Unity Gateway isn't connected. Click to sign in."
                            : "Connect to Unity Gateway for model access"
                    ),
                    iconPath: new ThemeIcon(
                        "account",
                        new ThemeColor("notificationsErrorIcon.foreground")
                    ),
                    contextValue: getContextValue(
                        saved ? "disconnected" : "signedOut"
                    ),
                    command: {
                        title: "Sign in to Unity Gateway",
                        command: "databricks.unityGateway.signIn",
                    },
                },
            ];
        }

        return [
            {
                label: "Gateway Connection",
                iconPath: new ThemeIcon(
                    "account",
                    new ThemeColor("debugIcon.startForeground")
                ),
                // As on the bundle's connection row; the host is under it.
                description: authProvider.describe(),
                contextValue: getContextValue("connected"),
                id: UNITY_GATEWAY_CONNECTION_ID,
                collapsibleState: TreeItemCollapsibleState.Collapsed,
            },
        ];
    }

    private getHost(): ConfigurationTreeItem[] {
        const authProvider =
            this.connectionManager.databricksWorkspace?.authProvider;
        if (authProvider === undefined) {
            return [];
        }
        return [
            {
                label: "Host",
                id: `${UNITY_GATEWAY_CONNECTION_ID}.host`,
                // The full URL, as on the bundle's Host row, so Copy Host
                // copies the same form from both.
                description: authProvider.host.toString(),
            },
        ];
    }

    public async getChildren(
        parent?: ConfigurationTreeItem
    ): Promise<ConfigurationTreeItem[]> {
        if (!this.isEnabled()) {
            return [];
        }
        if (parent === undefined) {
            return this.getRoot();
        }
        if (parent.id === UNITY_GATEWAY_CONNECTION_ID) {
            return this.getHost();
        }
        return [];
    }
}
