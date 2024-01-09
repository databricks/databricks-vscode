import {commands, QuickPickItem, QuickPickItemKind, window} from "vscode";
import {CliWrapper, ConfigEntry} from "../cli/CliWrapper";
import {InputStep, MultiStepInput, ValidationMessageType} from "../ui/wizard";
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

export class ConfigureWorkspaceWizard {
    private state = {} as Partial<State>;
    private readonly title = "Configure Databricks Workspace";
    constructor(
        private readonly cliWrapper: CliWrapper,
        private readonly configModel: ConfigModel
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
        if (!(await authProvider.check())) {
            const choice = await window.showErrorMessage(
                `Authentication using ${authDescription} failed. Select another authentication method?`,
                "Yes",
                "No"
            );
            if (choice === "Yes") {
                return this.selectAuthMethod.bind(this);
            }
        }
    }

    private async selectAuthMethod(
        input: MultiStepInput
    ): Promise<InputStep | void> {
        const items: Array<AuthTypeQuickPickItem> = [];
        let profiles: Array<ConfigEntry> = [];

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
                    items.push({
                        label: "Existing Databricks CLI Profiles",
                        kind: QuickPickItemKind.Separator,
                    });

                    profiles = await listProfiles(this.cliWrapper);

                    items.push(
                        ...profiles
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
                            })
                    );

                    items.push({
                        label: "",
                        kind: QuickPickItemKind.Separator,
                    });

                    items.push({
                        label: "Edit Databricks profiles",
                        detail: "Open ~/.databrickscfg to create or edit profiles",
                        openDatabricksConfigFile: true,
                    });

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
            // TODO: If the profile has an auth type with deeper support in the Extension, (azure-cli, databricks-cli),
            // then run the necessary checks to validate the profile and help user fix any errors.
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
        let initialValue = this.configModel.target ?? "";

        // If the initialValue profile already exists, then create a unique name.
        const profiles = await listProfiles(this.cliWrapper);
        if (profiles.find((profile) => profile.name === initialValue)) {
            const suffix = randomUUID().slice(0, 8);
            initialValue = `${this.configModel.target}-${suffix}`;
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

            default:
                // This is the only other case possible right now. We are not explicitly checking for databricks-cli
                // to make typescript happy.
                authProvider = new DatabricksCliAuthProvider(
                    this.state.host!,
                    this.cliWrapper.cliPath
                );
        }

        const checkResult = await this.checkAuthProvider(
            authProvider,
            authProvider.describe()
        );
        if (checkResult) {
            return checkResult;
        }

        // Create a new profile
        const {path: configFilePath, iniFile} = await loadConfigFile(
            workspaceConfigs.databrickscfgLocation
        );
        iniFile[profileName] = Object.fromEntries(
            Object.entries(authProvider.toIni()).filter(
                (kv) => kv[1] !== undefined
            )
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

        this.state.authProvider = new ProfileAuthProvider(
            this.state.host!,
            profileName,
            true
        );
    }

    static async run(
        cliWrapper: CliWrapper,
        configModel: ConfigModel
    ): Promise<AuthProvider | undefined> {
        const wizard = new ConfigureWorkspaceWizard(cliWrapper, configModel);
        const hostStr = await configModel.get("host");
        wizard.state.host = hostStr
            ? UrlUtils.normalizeHost(hostStr)
            : undefined;
        await MultiStepInput.run(wizard.inputHost.bind(wizard));
        if (!wizard.state.host || !wizard.state.authProvider) {
            return;
        }

        return wizard.state.authProvider;
    }
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

async function listProfiles(cliWrapper: CliWrapper) {
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
