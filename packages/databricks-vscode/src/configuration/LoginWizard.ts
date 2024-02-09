import {
    commands,
    QuickPickItem,
    QuickPickItemKind,
    window,
    ProgressLocation,
} from "vscode";
import {
    InputFlowAction,
    InputStep,
    MultiStepInput,
    ValidationMessageType,
} from "../ui/MultiStepInputWizard";
import {CliWrapper, ConfigEntry} from "../cli/CliWrapper";
import {workspaceConfigs} from "../vscode-objs/WorkspaceConfigs";
import {
    AuthProvider,
    AuthType,
    AzureCliAuthProvider,
    DatabricksCliAuthProvider,
    PersonalAccessTokenAuthProvider,
    ProfileAuthProvider,
} from "./auth/AuthProvider";
import {UrlUtils} from "../utils";
import {
    loadConfigFile,
    AuthType as SdkAuthType,
} from "@databricks/databricks-sdk";
import {randomUUID} from "crypto";
import ini from "ini";
import {appendFile, copyFile} from "fs/promises";
import path from "path";
import os from "os";

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
    private _profiles: Array<ConfigEntry> = [];
    async getProfiles() {
        if (this._profiles.length === 0) {
            this._profiles = await listProfiles(this.cliWrapper);
        }
        return this._profiles;
    }
    constructor(
        private readonly cliWrapper: CliWrapper,
        private readonly target?: string
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

        items.push(
            ...(await this.getProfiles()).map((profile) => {
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
        input: MultiStepInput
    ): Promise<InputStep | undefined> {
        //Hide the input and let the check show it's own messages and UI.
        input.hide();
        if (await authProvider.check()) {
            input.show();
            return;
        }

        const choice = await window.showErrorMessage(
            `Authentication using ${authProvider.describe()} failed.`,
            "Select a different auth method",
            "Cancel"
        );
        if (choice === "Select a different auth method") {
            //Show input again with the select auth step.
            input.show();
            return this.selectAuthMethod.bind(this);
        }
        throw InputFlowAction.cancel;
    }

    private async selectAuthMethod(
        input: MultiStepInput
    ): Promise<InputStep | void> {
        const items: Array<AuthTypeQuickPickItem> = [];
        items.push({
            label: "Create new Databricks CLI profile",
            kind: QuickPickItemKind.Separator,
        });
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
                        const profiles = (await this.getProfiles())
                            .filter((profile) => {
                                return (
                                    profile.host?.hostname ===
                                    this.state.host!.hostname
                                );
                            })
                            .map((profile) => {
                                const humanisedAuthType = humaniseSdkAuthType(
                                    profile.authType
                                );
                                const detail = humanisedAuthType
                                    ? `Authenticate using ${humaniseSdkAuthType(
                                          profile.authType
                                      )}`
                                    : `Authenticate using profile ${profile.name}`;

                                return {
                                    label: profile.name,
                                    detail,
                                    authType: profile.authType as SdkAuthType,
                                    profile: profile.name,
                                };
                            });

                        items.push({
                            label: "Personal Access Token",
                            detail: "Create a profile and authenticate using a Personal Access Token",
                            authType: "pat",
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
            const authProvider = await ProfileAuthProvider.from(pick.profile);
            const nextStep = await this.checkAuthProvider(authProvider, input);
            if (nextStep) {
                return nextStep;
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
        let initialValue = this.target ?? "";

        // If the initialValue profile already exists, then create a unique name.
        const profiles = await this.getProfiles();
        if (profiles.find((profile) => profile.name === initialValue)) {
            const suffix = randomUUID().slice(0, 8);
            initialValue = `${this.target ?? "dev"}-${suffix}`;
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

        let authProvider:
            | AzureCliAuthProvider
            | DatabricksCliAuthProvider
            | PersonalAccessTokenAuthProvider;
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

            case "pat":
                {
                    const token = await collectTokenForPatAuth(
                        this.state.host!,
                        input,
                        4,
                        4
                    );
                    if (token === undefined) {
                        // Token can never be undefined unless the users cancels the whole process.
                        // Therefore, we can safely return here.
                        return;
                    }
                    authProvider = new PersonalAccessTokenAuthProvider(
                        this.state.host!,
                        token
                    );
                }
                break;
            default:
                throw new Error(
                    `Unknown auth type: ${pick.authType} for profile creation`
                );
        }

        const checkResult = await this.checkAuthProvider(authProvider, input);
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
        target?: string,
        host?: URL
    ): Promise<AuthProvider | undefined> {
        const wizard = new LoginWizard(cliWrapper, target);
        if (host) {
            wizard.state.host = host;
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

    const {path: configFilePath} = await loadConfigFile(
        workspaceConfigs.databrickscfgLocation
    );

    const profile: any = {};
    profile[profileName] = Object.fromEntries(
        Object.entries(iniData).filter((kv) => kv[1] !== undefined)
    );
    const iniStr = ini.stringify(profile);
    const finalStr = `${os.EOL};This profile is autogenerated by the Databricks Extension for VS Code${os.EOL}${iniStr}`;
    // Create a backup for .databrickscfg
    const backup = path.join(
        path.dirname(configFilePath),
        `.databrickscfg.${new Date().toISOString()}.bak`
    );
    await copyFile(configFilePath, backup);
    window.showInformationMessage(
        `Created a backup for .databrickscfg at ${backup}`
    );

    // Write the new profile to .databrickscfg
    await appendFile(configFilePath, finalStr);

    return await ProfileAuthProvider.from(profileName, true);
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
    return await window.withProgress(
        {
            location: ProgressLocation.Notification,
            title: "Loading Databricks profiles",
        },
        async () => {
            const profiles = (
                await cliWrapper.listProfiles(
                    workspaceConfigs.databrickscfgLocation
                )
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
    );
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

async function collectTokenForPatAuth(
    host: URL,
    input: MultiStepInput,
    step: number,
    totalSteps: number
) {
    const token = await input.showQuickAutoComplete({
        title: "Enter Personal Access Token",
        step,
        totalSteps,
        validate: async (value) => {
            if (value.length === 0) {
                return {
                    message: "Token cannot be empty",
                    type: "error",
                };
            }
        },
        placeholder: "Enter Personal Access Token",
        ignoreFocusOut: true,
        shouldResume: async () => false,
        items: [
            {
                label: "Create a new Personal Access Token",
                detail: "Open the Databricks UI to create a new Personal Access Token",
                alwaysShow: true,
            },
        ],
    });

    if (token === undefined) {
        return;
    }

    if (token === "Create a new Personal Access Token") {
        commands.executeCommand("databricks.utils.openExternal", {
            url: `${host.toString()}settings/user/developer/access-tokens`,
        });
        return collectTokenForPatAuth(host, input, step, totalSteps);
    }

    return token;
}
