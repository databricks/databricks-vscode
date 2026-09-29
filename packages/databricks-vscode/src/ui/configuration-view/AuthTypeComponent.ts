import {ConfigModel} from "../../configuration/models/ConfigModel";
import {ConnectionManager} from "../../configuration/ConnectionManager";
import {BaseComponent} from "./BaseComponent";
import {ConfigurationTreeItem} from "./types";
import {ThemeIcon, ThemeColor, TreeItemCollapsibleState} from "vscode";
import {getProfilesForHost} from "../../configuration/LoginWizard";
import {CliWrapper} from "../../cli/CliWrapper";
import {
    AuthProvider,
    ProfileAuthProvider,
} from "../../configuration/auth/AuthProvider";

export const AUTH_TYPE_SWITCH_ID = "AUTH-TYPE";
export const AUTH_TYPE_LOGIN_ID = "LOGIN";

function getContextValue(key: string) {
    return `databricks.configuration.authType.${key}`;
}

/** A connection's profile, or its auth type when it has no profile. */
export function getAuthDetailItem(
    authProvider: AuthProvider,
    parentId: string
): ConfigurationTreeItem {
    const isProfile = authProvider instanceof ProfileAuthProvider;
    return {
        label: isProfile ? "Profile" : "Auth Type",
        id: `${parentId}.auth`,
        description: isProfile ? authProvider.profile : authProvider.describe(),
        collapsibleState: TreeItemCollapsibleState.None,
    };
}

export class AuthTypeComponent extends BaseComponent {
    constructor(
        private readonly connectionManager: ConnectionManager,
        private readonly configModel: ConfigModel,
        private readonly cli: CliWrapper
    ) {
        super();
        this.disposables.push(
            this.connectionManager.onDidChangeState(() => {
                this.onDidChangeEmitter.fire();
            }),
            this.configModel.onDidChangeTarget(() => {
                this.onDidChangeEmitter.fire();
            })
        );
    }

    private async getRoot(): Promise<ConfigurationTreeItem[]> {
        if (this.configModel.target === undefined) {
            return [];
        }

        const authProvider =
            this.connectionManager.databricksWorkspace?.authProvider;

        if (this.connectionManager.state === "CONNECTING") {
            return [
                {
                    label: "Bundle Connection",
                    description: "Connecting",
                    iconPath: new ThemeIcon("sync~spin"),
                },
            ];
        }

        if (authProvider === undefined) {
            const host = await this.configModel.get("host");
            if (host === undefined) {
                return [];
            }

            const profiles = await getProfilesForHost(host, this.cli);
            let label = "Login to Databricks";
            if (profiles.length > 1) {
                label =
                    "Multiple login profiles available. Click to select a profile.";
            }
            return [
                {
                    label: "Bundle Connection",
                    description: label,
                    iconPath: new ThemeIcon(
                        "account",
                        new ThemeColor("notificationsErrorIcon.foreground")
                    ),
                    contextValue: getContextValue("none"),
                    id: AUTH_TYPE_SWITCH_ID,
                    command: {
                        title: "Sign in to Databricks",
                        command: "databricks.connection.configureLogin",
                        arguments: [{id: AUTH_TYPE_LOGIN_ID}],
                    },
                },
            ];
        }

        const config =
            (await this.configModel.get("authProfile")) ??
            (await this.configModel.get("authParams"));
        if (config === undefined) {
            // This case can never happen. This is just to make ts happy.
            return [];
        }

        return [
            {
                label: "Bundle Connection",
                iconPath: new ThemeIcon(
                    "account",
                    new ThemeColor("debugIcon.startForeground")
                ),
                description: authProvider.host.hostname,
                contextValue: getContextValue(authProvider.authType),
                id: AUTH_TYPE_SWITCH_ID,
                collapsibleState: TreeItemCollapsibleState.Collapsed,
            },
        ];
    }
    public async getChildren(
        parent?: ConfigurationTreeItem
    ): Promise<ConfigurationTreeItem[]> {
        if (parent === undefined) {
            return this.getRoot();
        }

        const authProvider =
            this.connectionManager.databricksWorkspace?.authProvider;
        if (parent.id !== AUTH_TYPE_SWITCH_ID || authProvider === undefined) {
            return [];
        }
        return [getAuthDetailItem(authProvider, AUTH_TYPE_SWITCH_ID)];
    }
}
