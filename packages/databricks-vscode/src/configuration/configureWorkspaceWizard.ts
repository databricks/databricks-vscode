import {commands, QuickPickItem, QuickPickItemKind} from "vscode";
import {CliWrapper, ConfigEntry} from "../cli/CliWrapper";
import {MultiStepInput} from "../ui/wizard";
import {
    isAwsHost,
    isAzureHost,
    isGcpHost,
    normalizeHost,
} from "../utils/urlUtils";
import {workspaceConfigs} from "../vscode-objs/WorkspaceConfigs";
import {AuthProvider, AuthType} from "./auth/AuthProvider";
import {ProjectConfig} from "../file-managers/ProjectConfigFile";

interface AuthTypeQuickPickItem extends QuickPickItem {
    authType: AuthType | "new-profile" | "none";
    profile?: string;
}

interface State {
    host: URL;
    authType: AuthType;
    profile?: string;
    token?: string;
    databricksPath?: string;
}

export async function configureWorkspaceWizard(
    cliWrapper: CliWrapper,
    host?: string
): Promise<ProjectConfig | undefined> {
    const title = "Configure Databricks Workspace";

    async function collectInputs(): Promise<State> {
        const state = {
            host,
        } as Partial<State>;
        await MultiStepInput.run((input) => inputHost(input, state));
        return state as State;
    }

    async function inputHost(input: MultiStepInput, state: Partial<State>) {
        const items: Array<QuickPickItem> = [];

        if (state.host) {
            items.push({
                label: state.host.toString(),
                detail: "Currently selected host",
            });
        }

        if (process.env.DATABRICKS_HOST) {
            items.push({
                label: process.env.DATABRICKS_HOST,
                detail: "DATABRICKS_HOST environment variable",
            });
        }

        const profiles = await listProfiles(cliWrapper);
        items.push(
            ...profiles.map((profile) => {
                return {
                    label: profile.host!.toString(),
                    detail: `Profile: ${profile.name}`,
                };
            })
        );

        const host = await input.showQuickAutoComplete({
            title,
            step: 1,
            totalSteps: 2,
            prompt: "Databricks Host (should begin with https://)",
            validate: validateDatabricksHost,
            shouldResume: async () => {
                return false;
            },
            items,
        });

        state.host = normalizeHost(host);
        return (input: MultiStepInput) => selectAuthMethod(input, state);
    }

    async function selectAuthMethod(
        input: MultiStepInput,
        state: Partial<State>
    ) {
        const items: Array<AuthTypeQuickPickItem> = [];
        let profiles: Array<ConfigEntry> = [];

        for (const authMethod of authMethodsForHostname(state.host!)) {
            switch (authMethod) {
                case "azure-cli":
                    items.push({
                        label: "Azure CLI",
                        detail: "Authenticate using the 'az' command line tool",
                        authType: "azure-cli",
                    });
                    break;

                case "databricks-cli":
                    items.push({
                        label: "OAuth (user to machine)",
                        detail: "Authenticate using OAuth",
                        authType: "databricks-cli",
                    });
                    break;

                case "profile":
                    items.push({
                        label: "Databricks CLI Profiles",
                        kind: QuickPickItemKind.Separator,
                        authType: "none",
                    });

                    profiles = await listProfiles(cliWrapper);

                    items.push(
                        ...profiles
                            .filter((profile) => {
                                return (
                                    profile.host?.hostname ===
                                    state.host!.hostname
                                );
                            })
                            .map((profile) => {
                                return {
                                    label: profile.name,
                                    detail: `Authenticate using the ${profile.name} profile`,
                                    authType: "profile" as const,
                                    profile: profile.name,
                                };
                            })
                    );

                    items.push({
                        label: "",
                        kind: QuickPickItemKind.Separator,
                        authType: "none",
                    });

                    items.push({
                        label: "Edit Databricks profiles",
                        detail: "Open ~/.databrickscfg to create a new profile",
                        authType: "new-profile",
                    });

                    break;

                default:
                    break;
            }
        }

        const pick: AuthTypeQuickPickItem = await input.showQuickPick({
            title,
            step: 2,
            totalSteps: 2,
            placeholder: "Select authentication method",
            items,
            shouldResume: async () => {
                return false;
            },
        });

        switch (pick.authType) {
            case "azure-cli":
                state.authType = pick.authType;
                break;

            case "databricks-cli":
                state.authType = pick.authType;
                state.databricksPath = cliWrapper.cliPath;
                break;

            case "profile":
                state.authType = pick.authType;
                state.profile = pick.profile;
                break;

            case "new-profile":
                await commands.executeCommand(
                    "databricks.connection.openDatabricksConfigFile"
                );
        }
    }

    const state = await collectInputs();
    if (!state.host || !state.authType) {
        return;
    }

    return {
        authProvider: AuthProvider.fromJSON(state, cliWrapper.cliPath),
    };
}

async function listProfiles(cliWrapper: CliWrapper) {
    const profiles = (
        await cliWrapper.listProfiles(workspaceConfigs.databrickscfgLocation)
    ).filter((profile) => {
        try {
            normalizeHost(profile.host!.toString());
            return true;
        } catch (e) {
            return false;
        }
    });

    return profiles.filter((profile) => {
        return [
            "pat",
            "basic",
            "azure-cli",
            "oauth-m2m",
            "azure-client-secret",
        ].includes(profile.authType);
    });
}

async function validateDatabricksHost(
    host: string
): Promise<string | undefined> {
    try {
        normalizeHost(host);
    } catch (e: any) {
        return e.message;
    }
}

function authMethodsForHostname(host: URL): Array<AuthType> {
    if (isAzureHost(host)) {
        return ["azure-cli", "profile"];
    }

    if (isGcpHost(host)) {
        return ["google-id", "profile"];
    }

    if (isAwsHost(host)) {
        return ["databricks-cli", "profile"];
    }

    return ["profile"];
}
