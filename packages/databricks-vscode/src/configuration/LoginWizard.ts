import {commands, QuickPickItem, QuickPickItemKind, window} from "vscode";
import {
    InputFlowAction,
    InputStep,
    MultiStepInput,
    ValidationMessageType,
} from "../ui/MultiStepInputWizard";
import {CliWrapper} from "../cli/CliWrapper";
import {workspaceConfigs} from "../vscode-objs/WorkspaceConfigs";
import {
    AuthProvider,
    AuthType,
    AzureCliAuthProvider,
    DatabricksCliAuthProvider,
    ProfileAuthProvider,
} from "./auth/AuthProvider";
import {UrlUtils} from "../utils";
import {
    loadConfigFile,
    AuthType as SdkAuthType,
} from "@databricks/databricks-sdk";
import {ConfigModel} from "./models/ConfigModel";
import {randomUUID} from "crypto";
import ini from "ini";
import {copyFile, writeFile} from "fs/promises";
import path from "path";

interface AuthTypeQuickPickItem extends QuickPickItem {
    authType?: SdkAuthType;
    profile?: string;
    openDatabricksConfigFile?: boolean;
}

interface State {
    host: URL;
    authProvider?: AuthProvider;
}

export class LoginWizard {
    private state = {} as Partial<State>;
    private readonly title = "Configure Databricks Workspace";
    constructor(
        private readonly cliWrapper: CliWrapper,
        private readonly configModel?: ConfigModel
    ) {}

    private async inputHost(input: MultiStepInput) {
        const items: Array<QuickPickItem> = [];

        if (this.state.host) {
            return this.selectAuthMethod.bind(this);
        }

        if (process.env.DATABRICKS_HOST) {
            items.push({
                label: process.env.DATABRICKS_HOST,
                detail: "DATABRICKS_HOST environment variable",
            });
        }

        const profiles = await listProfiles(this.cliWrapper);
        items.push(
            ...profiles.map((profile) => {
                return {
                    label: profile.host!.toString(),
                    detail: `Profile: ${profile.name}`,
                };
            })
        );

        const host = await input.showQuickAutoComplete({
            title: this.title,
            step: 1,
            totalSteps: 2,
            placeholder: "Databricks Host (should begin with https://)",
            validate: validateDatabricksHost,
            shouldResume: async () => {
                return false;
            },
            items,
            ignoreFocusOut: true,
        });

        this.state.host = UrlUtils.normalizeHost(host);
        return this.selectAuthMethod.bind(this);
    }

    private async checkAuthProvider(
        authProvider: AuthProvider,
        authDescription: string
    ): Promise<InputStep | undefined> {
        if (await authProvider.check()) {
            return;
        }
        const choice = await window.showErrorMessage(
            `Authentication using ${authDescription} failed. Select another authentication method?`,
            "Yes",
            "No"
        );
        if (choice === "Yes") {
            return this.selectAuthMethod.bind(this);
        }
        throw InputFlowAction.cancel;
    }

    private async selectAuthMethod(
        input: MultiStepInput
    ): Promise<InputStep | void> {
        const items: Array<AuthTypeQuickPickItem> = [];

        for (const authMethod of authMethodsForHostname(this.state.host!)) {
            switch (authMethod) {
                case "azure-cli":
                    items.push({
                        label: "Azure CLI",
                        detail: "Create a profile and authenticate using the 'az' command line tool",
                        authType: "azure-cli",
                    });
                    break;

                case "databricks-cli":
                    items.push({
                        label: "OAuth (user to machine)",
                        detail: "Create a profile and authenticate using OAuth",
                        authType: "databricks-cli",
                    });
                    break;

                case "profile":
                    {
                        const profiles = (await listProfiles(this.cliWrapper))
                            .filter((profile) => {
                                return (
                                    profile.host?.hostname ===
                                    this.state.host!.hostname
                                );
                            })
                            .map((profile) => {
                                return {
                                    label: profile.name,
                                    detail: `Authenticate using ${humaniseSdkAuthType(
                                        profile.authType
                                    )} from ${profile.name} profile`,
                                    authType: profile.authType as SdkAuthType,
                                    profile: profile.name,
                                };
                            });

                        if (profiles.length !== 0) {
                            items.push(
                                {
                                    label: "Existing Databricks CLI Profiles",
                                    kind: QuickPickItemKind.Separator,
                                },
                                ...profiles
                            );
                        }

                        items.push({
                            label: "",
                            kind: QuickPickItemKind.Separator,
                        });

                        items.push({
                            label: "Edit Databricks profiles",
                            detail: "Open ~/.databrickscfg to create or edit profiles",
                            openDatabricksConfigFile: true,
                        });
                    }

                    break;

                default:
                    break;
            }
        }

        const pick: AuthTypeQuickPickItem = await input.showQuickPick({
            title: this.title,
            step: 2,
            totalSteps: 2,
            placeholder: "Select authentication method",
            items,
            ignoreFocusOut: true,
            shouldResume: async () => {
                return false;
            },
        });

        if (pick.openDatabricksConfigFile) {
            await commands.executeCommand(
                "databricks.connection.openDatabricksConfigFile"
            );
            return;
        }

        if (pick.profile !== undefined) {
            // We assume that the profile is setup correctly (even for the auth types that have a deeper integration with vscode such as azure-cli).
            // To fix errors, users can create a new profile.
            const authProvider = new ProfileAuthProvider(
                this.state.host!,
                pick.profile
            );
            const checkResult = await this.checkAuthProvider(
                authProvider,
                `profile '${pick.profile}'`
            );
            if (checkResult) {
                return checkResult;
            }
            this.state.authProvider = authProvider;
            return;
        }

        return (input: MultiStepInput) => this.createNewProfile(input, pick);
    }

    private async createNewProfile(
        input: MultiStepInput,
        pick: AuthTypeQuickPickItem
    ) {
        let initialValue = this.configModel?.target ?? "";

        // If the initialValue profile already exists, then create a unique name.
        const profiles = await listProfiles(this.cliWrapper);
        if (profiles.find((profile) => profile.name === initialValue)) {
            const suffix = randomUUID().slice(0, 8);
            initialValue = `${this.configModel?.target ?? "dev"}-${suffix}`;
        }

        const profileName = await input.showInputBox({
            title: "Enter a name for the new profile",
            step: 3,
            totalSteps: 3,
            placeholder: "Enter a name for the new profile",
            initialValue,
            validate: async (value) => {
                if (value.length === 0) {
                    return {
                        message: "Profile name cannot be empty",
                        type: "error",
                    };
                }
                const profiles = await listProfiles(this.cliWrapper);
                if (profiles.find((profile) => profile.name === value)) {
                    return {
                        message: `Profile ${value} already exists`,
                        type: "error",
                    };
                }
            },
            ignoreFocusOut: true,
        });

        if (profileName === undefined) {
            return;
        }

        let authProvider: AzureCliAuthProvider | DatabricksCliAuthProvider;
        switch (pick.authType) {
            case "azure-cli":
                authProvider = new AzureCliAuthProvider(this.state.host!);
                break;

            case "databricks-cli":
                authProvider = new DatabricksCliAuthProvider(
                    this.state.host!,
                    this.cliWrapper.cliPath
                );
                break;

            default:
                throw new Error(
                    `Unknown auth type: ${pick.authType} for profile creation`
                );
        }

        const checkResult = await this.checkAuthProvider(
            authProvider,
            authProvider.describe()
        );
        if (checkResult) {
            return checkResult;
        }

        this.state.authProvider = await saveNewProfile(
            profileName,
            authProvider
        );
    }

    static async run(
        cliWrapper: CliWrapper,
        configModel?: ConfigModel
    ): Promise<AuthProvider | undefined> {
        const wizard = new LoginWizard(cliWrapper, configModel);
        if (configModel) {
            wizard.state.host = await configModel.get("host");
        }
        await MultiStepInput.run(wizard.inputHost.bind(wizard));
        if (!wizard.state.host || !wizard.state.authProvider) {
            return;
        }

        return wizard.state.authProvider;
    }
}

export async function saveNewProfile(
    profileName: string,
    authProvider: AuthProvider
) {
    const iniData = authProvider.toIni();
    if (!iniData) {
        throw new Error("Can't save empty auth provider to a profile");
    }
    const {path: configFilePath, iniFile} = await loadConfigFile(
        workspaceConfigs.databrickscfgLocation
    );
    iniFile[profileName] = Object.fromEntries(
        Object.entries(iniData).filter((kv) => kv[1] !== undefined)
    );

    // Create a backup for .databrickscfg
    const backup = path.join(
        path.dirname(configFilePath),
        ".databrickscfg.bak"
    );
    await copyFile(configFilePath, backup);
    window.showInformationMessage(
        `Created a backup for .databrickscfg at ${backup}`
    );

    // Write the new profile to .databrickscfg
    await writeFile(configFilePath, ini.stringify(iniFile));

    return new ProfileAuthProvider(authProvider.host, profileName, true);
}

function humaniseSdkAuthType(sdkAuthType: string) {
    switch (sdkAuthType) {
        case "pat":
            return "Personal Access Token";
        case "basic":
            return "Username and Password";
        case "azure-cli":
            return "Azure CLI";
        case "azure-client-secret":
            return "Azure Client Secret";
        case "google-id":
            return "Google Service Account";
        case "databricks-cli":
            return "OAuth (User to Machine)";
        case "oauth-m2m":
            return "OAuth (Machine to Machine)";
        default:
            return sdkAuthType;
    }
}

export async function listProfiles(cliWrapper: CliWrapper) {
    const profiles = (
        await cliWrapper.listProfiles(workspaceConfigs.databrickscfgLocation)
    ).filter((profile) => {
        try {
            UrlUtils.normalizeHost(profile.host!.toString());
            return true;
        } catch (e) {
            return false;
        }
    });

    return profiles;
}

async function validateDatabricksHost(
    host: string
): Promise<string | undefined | ValidationMessageType> {
    try {
        const url = UrlUtils.normalizeHost(host);
        if (
            !url.hostname.match(
                /(\.databricks\.azure\.us|\.databricks\.azure\.cn|\.azuredatabricks\.net|\.gcp\.databricks\.com|\.cloud\.databricks\.com|\.dev\.databricks\.com)$/
            )
        ) {
            return {
                message:
                    "This is not a standard Databricks URL. Some features may not work as expected.",
                type: "warning",
            };
        }
    } catch (e: any) {
        return e.message;
    }
}

function authMethodsForHostname(host: URL): Array<AuthType> {
    if (UrlUtils.isAzureHost(host)) {
        return ["azure-cli", "profile"];
    }

    if (UrlUtils.isGcpHost(host)) {
        return ["profile"];
    }

    if (UrlUtils.isAwsHost(host)) {
        return ["databricks-cli", "profile"];
    }

    return ["profile"];
}
