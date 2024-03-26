import {ConfigModel} from "../models/ConfigModel";
import {ConnectionManager} from "../ConnectionManager";
import {BaseComponent} from "./BaseComponent";
import {ConfigurationTreeItem} from "./types";
import {ThemeIcon, ThemeColor} from "vscode";
import {getProfilesForHost} from "../LoginWizard";
import {CliWrapper} from "../../cli/CliWrapper";

export const AUTH_TYPE_SWITCH_ID = "AUTH-TYPE";
export const AUTH_TYPE_LOGIN_ID = "LOGIN";

function getContextValue(key: string) {
    return `databricks.configuration.authType.${key}`;
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
                    label: "Connecting to the workspace",
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
                    label: {label},
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
                label: "Auth Type",
                iconPath: new ThemeIcon(
                    "account",
                    new ThemeColor("debugIcon.startForeground")
                ),
                description: authProvider.describe(),
                contextValue: getContextValue(authProvider.authType),
                id: AUTH_TYPE_SWITCH_ID,
            },
        ];
    }
    public async getChildren(
        parent?: ConfigurationTreeItem
    ): Promise<ConfigurationTreeItem[]> {
        if (parent === undefined) {
            return this.getRoot();
        }

        return [];
    }
}
