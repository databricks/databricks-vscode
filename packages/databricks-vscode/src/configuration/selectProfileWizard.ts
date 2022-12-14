import {
    ConfigFileError,
    isConfigFileParsingError,
    loadConfigFile,
    Profile,
    Profiles,
} from "@databricks/databricks-sdk";
import {commands, QuickPickItem, QuickPickItemKind} from "vscode";
import {MultiStepInput} from "../ui/wizard";
import {AuthProvider, AuthType} from "./AuthProvider";
import {ProjectConfig} from "./ProjectConfigFile";

interface AuthTypeQuickPickItem extends QuickPickItem {
    authType: AuthType | "new-profile" | "none";
    profile?: string;
}

interface State {
    host: string;
    authType: AuthType;
    profile?: string;
    token?: string;
}

export async function configureWorkspaceWizard(
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
        const host = await input.showInputBox({
            title,
            step: 1,
            totalSteps: 2,
            value: typeof state.host === "string" ? state.host : "",
            prompt: "Databricks Host (should begin with https://)",
            validate: validateDatabricksHost,
            shouldResume: async () => {
                return false;
            },
        });

        state.host = host;
        return (input: MultiStepInput) => selectAuthMethod(input, state);
    }

    async function selectAuthMethod(
        input: MultiStepInput,
        state: Partial<State>
    ) {
        const items: Array<AuthTypeQuickPickItem> = [];
        let profiles: Profiles = {};

        for (const authMethod of authMethodsForHostname(new URL(state.host!))) {
            switch (authMethod) {
                case "azure-cli":
                    items.push({
                        label: "Azure CLI",
                        detail: "Authenticate using the 'az' command line tool",
                        authType: "azure-cli",
                    });
                    break;

                // Disabled PAT until we can figure out how we want to deal with the secret on disk
                // case "pat":
                //     items.push({
                //         label: "PAT",
                //         kind: QuickPickItemKind.Separator,
                //         authType: "none",
                //     });

                //     items.push({
                //         label: "Personal Access Token",
                //         detail: "Authenticate using a personal access token",
                //         authType: "pat",
                //     });
                //     break;

                case "profile":
                    items.push({
                        label: "Databricks CLI Profiles",
                        kind: QuickPickItemKind.Separator,
                        authType: "none",
                    });

                    try {
                        profiles = await loadConfigFile();
                    } catch (e) {
                        if (!(e instanceof ConfigFileError)) {
                            throw e;
                        }
                    }

                    items.push(
                        ...Object.keys(profiles)
                            .filter(
                                (label) =>
                                    !isConfigFileParsingError(profiles[label])
                            )
                            .filter(
                                (label) =>
                                    (
                                        profiles[label] as Profile
                                    ).host.toString() === state.host!.toString()
                            )
                            .map((label) => ({
                                label,
                                detail: `Authenticate using the ${label} profile`,
                                authType: "profile" as const,
                                profile: label,
                            }))
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

            case "pat":
                state.authType = pick.authType;
                return (input: MultiStepInput) => inputToken(input, state);

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

    async function inputToken(input: MultiStepInput, state: Partial<State>) {
        state.token = await input.showInputBox({
            title,
            step: 4,
            totalSteps: 4,
            value: typeof state.token === "string" ? state.token : "",
            prompt: "Databricks personal access token (PAT)",
            validate: async (s) => {
                if (!s.length) {
                    return "Invalid access token";
                }
            },
            shouldResume: shouldResume,
        });
    }
    async function shouldResume(): Promise<boolean> {
        // Could show a notification with the option to resume.
        return true;
    }

    const state = await collectInputs();
    if (!state.host || !state.authType) {
        return;
    }

    state.host = `https://${new URL(state.host).hostname}`;

    return {
        authProvider: AuthProvider.fromJSON(state),
    };
}

async function validateDatabricksHost(
    host: string
): Promise<string | undefined> {
    let url;
    try {
        url = new URL(host);
    } catch (e) {
        return "Invalid host name";
    }
    if (url.protocol !== "https:") {
        return "Invalid protocol";
    }
    if (
        !url.hostname.match(
            /(\.azuredatabricks\.net|\.gcp\.databricks\.com|\.cloud\.databricks\.com)$/
        )
    ) {
        return "Not a Databricks host";
    }
}

function authMethodsForHostname(host: URL): Array<AuthType> {
    if (host.hostname.endsWith(".azuredatabricks.net")) {
        return ["azure-cli", "oauth", "pat", "profile"];
    }

    if (host.hostname.endsWith(".gcp.databricks.com")) {
        return ["gcloud-cli", "oauth", "pat", "profile"];
    }

    if (host.hostname.endsWith(".cloud.databricks.com")) {
        return ["oauth", "pat", "profile"];
    }

    return ["pat", "profile"];
}
