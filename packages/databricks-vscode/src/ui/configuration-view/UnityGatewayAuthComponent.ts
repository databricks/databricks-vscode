import {ThemeColor, ThemeIcon, TreeItemCollapsibleState} from "vscode";
import {LanguageModelChatConnectionManager} from "../../lm-chat/LanguageModelChatConnectionManager";
import {getAuthDetailItem} from "./AuthTypeComponent";
import {BaseComponent} from "./BaseComponent";
import {ConfigurationTreeItem} from "./types";

export const UNITY_GATEWAY_AUTH_ID = "UNITY-GATEWAY-AUTH";

function getContextValue(state: string) {
    return `databricks.configuration.unityGatewayAuth.${state}`;
}

export class UnityGatewayAuthComponent extends BaseComponent {
    constructor(
        private readonly connection: LanguageModelChatConnectionManager
    ) {
        super();
        this.disposables.push(
            this.connection.onDidChangeState(() =>
                this.onDidChangeEmitter.fire()
            )
        );
    }

    public async getChildren(
        parent?: ConfigurationTreeItem
    ): Promise<ConfigurationTreeItem[]> {
        const authProvider = this.connection.databricksWorkspace?.authProvider;
        if (parent !== undefined) {
            if (
                parent.id !== UNITY_GATEWAY_AUTH_ID ||
                authProvider === undefined
            ) {
                return [];
            }
            return [getAuthDetailItem(authProvider, UNITY_GATEWAY_AUTH_ID)];
        }

        if (this.connection.state === "CONNECTING") {
            return [
                {
                    id: UNITY_GATEWAY_AUTH_ID,
                    label: "Gateway Connection",
                    description: "Connecting",
                    iconPath: new ThemeIcon("sync~spin"),
                    contextValue: getContextValue("connecting"),
                },
            ];
        }

        if (authProvider === undefined) {
            return [
                {
                    id: UNITY_GATEWAY_AUTH_ID,
                    label: "Gateway Connection",
                    description: "Sign in",
                    iconPath: new ThemeIcon(
                        "account",
                        new ThemeColor("notificationsErrorIcon.foreground")
                    ),
                    contextValue: getContextValue("disconnected"),
                    command: {
                        title: "Configure Unity Gateway authentication",
                        command: "databricks.lmChat.configure",
                    },
                },
            ];
        }

        return [
            {
                id: UNITY_GATEWAY_AUTH_ID,
                label: "Gateway Connection",
                description: authProvider.host.hostname,
                iconPath: new ThemeIcon(
                    "account",
                    new ThemeColor("debugIcon.startForeground")
                ),
                contextValue: getContextValue("connected"),
                collapsibleState: TreeItemCollapsibleState.Collapsed,
            },
        ];
    }
}
