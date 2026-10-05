import {ThemeIcon, ThemeColor} from "vscode";
import type {Event} from "vscode";
import {ConfigModel} from "../../configuration/models/ConfigModel";
import {ConnectionManager} from "../../configuration/ConnectionManager";
import {BaseComponent} from "./BaseComponent";
import {ConfigurationTreeItem} from "./types";
import {getProfilesForHost} from "../../configuration/LoginWizard";
import {CliWrapper} from "../../cli/CliWrapper";
import {LabelUtils} from "../utils";
import {isLanguageModelChatEnabled} from "../../lm-chat/languageModelChatExperiment";
import {workspaceConfigs} from "../../vscode-objs/WorkspaceConfigs";
import {connectedRow, profileRows} from "./connectionRows";

export const AUTH_TYPE_SWITCH_ID = "AUTH-TYPE";
export const AUTH_TYPE_LOGIN_ID = "LOGIN";

function getContextValue(key: string) {
    return `databricks.configuration.authType.${key}`;
}

export class AuthTypeComponent extends BaseComponent {
    constructor(
        private readonly connectionManager: ConnectionManager,
        private readonly configModel: ConfigModel,
        private readonly cli: CliWrapper,
        // With Unity Gateway Chat on, the row matches the Gateway Connection
        // row next to it.
        private readonly isUnityGatewayEnabled = isLanguageModelChatEnabled,
        onDidChangeUnityGatewayEnabled: Event<void> = workspaceConfigs.onDidChangeExperimentsOptInto
    ) {
        super();
        this.disposables.push(
            this.connectionManager.onDidChangeState(() => {
                this.onDidChangeEmitter.fire();
            }),
            this.configModel.onDidChangeTarget(() => {
                this.onDidChangeEmitter.fire();
            }),
            onDidChangeUnityGatewayEnabled(() => {
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
                    label: LabelUtils.highlightedLabel(label),
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

        const contextValue = getContextValue(authProvider.authType);
        if (this.isUnityGatewayEnabled()) {
            return [
                connectedRow(
                    "Bundle Connection",
                    AUTH_TYPE_SWITCH_ID,
                    authProvider,
                    contextValue
                ),
            ];
        }
        return [
            {
                label: "Auth Type",
                iconPath: new ThemeIcon(
                    "account",
                    new ThemeColor("debugIcon.startForeground")
                ),
                description: authProvider.describe(),
                contextValue,
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

        if (
            parent.id !== AUTH_TYPE_SWITCH_ID ||
            !this.isUnityGatewayEnabled()
        ) {
            return [];
        }
        return profileRows(
            AUTH_TYPE_SWITCH_ID,
            this.connectionManager.databricksWorkspace?.authProvider
        );
    }
}
