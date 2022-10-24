import {
    ConfigFileError,
    isConfigFileParsingError,
    loadConfigFile,
    Profiles,
    resolveConfigFilePath,
} from "@databricks/databricks-sdk";
import {copyFile, stat, unlink} from "fs/promises";
import path from "path";
import {
    commands,
    QuickPickItem,
    QuickPickItemKind,
    Uri,
    window,
    workspace,
} from "vscode";
import {CliWrapper} from "../cli/CliWrapper";
import {MultiStepInput} from "../ui/wizard";

export async function selectProfile(
    cli: CliWrapper
): Promise<string | undefined> {
    interface State {
        title: string;
        step: number;
        totalSteps: number;
        profile: string;
        host?: string;
        token?: string;
    }

    async function collectInputs() {
        const state = {} as Partial<State>;
        await MultiStepInput.run((input) => pickProfile(input, state));
        return state as State;
    }

    const title = "Select Databricks Profile";

    async function pickProfile(input: MultiStepInput, state: Partial<State>) {
        let profiles: Profiles = {};
        try {
            profiles = await loadConfigFile();
        } catch (e) {
            if (!(e instanceof ConfigFileError)) {
                throw e;
            }
            const confPath = resolveConfigFilePath();
            let stats;
            try {
                stats = await stat(confPath);
            } catch (e) {
                /*file doesn't exist*/
            }
            if (stats?.isFile()) {
                const option = await window.showErrorMessage(
                    `Can't parse config file`,
                    {
                        detail: (e as ConfigFileError).message,
                    },
                    "Open Config File",
                    "Backup and Overwrite Config File"
                );
                if (option === undefined) {
                    return;
                }
                if (option === "Open Config File") {
                    await commands.executeCommand(
                        "databricks.connection.openDatabricksConfigFile"
                    );
                    return;
                }
                const backupPath = path.join(
                    path.dirname(confPath),
                    `${path.basename(confPath)}.${Date.now()}.bak`
                );
                await copyFile(confPath, backupPath);

                const openBackup = await window.showErrorMessage(
                    `Config file backed up at "${backupPath}"`,
                    "Open Backup File",
                    "Continue Without Opening"
                );
                if (openBackup === "Open Backup File") {
                    const doc = await workspace.openTextDocument(
                        Uri.file(backupPath)
                    );
                    await window.showTextDocument(doc);
                }
                await unlink(confPath);
            }
        }

        let items: Array<QuickPickItem> = Object.keys(profiles)
            .filter((label) => !isConfigFileParsingError(profiles[label]))
            .map((label) => ({label}));

        Object.keys(profiles)
            .filter((label) => isConfigFileParsingError(profiles[label]))
            .forEach((label) => {
                const details = profiles[label];
                if (isConfigFileParsingError(details)) {
                    window.showWarningMessage(
                        `Can't parse profile "${label}": ${details.name}: ${details.message}`
                    );
                }
            });

        if (items.length) {
            items = [
                {label: "Create new profile"},
                {label: "", kind: QuickPickItemKind.Separator},
                ...items,
            ];
        } else {
            items = [{label: "Create new profile"}];
        }

        const pick = await input.showQuickPick({
            title,
            step: 1,
            totalSteps: 1,
            placeholder: "Pick a profile",
            items,
            activeItem:
                typeof state.profile !== "string" ? state.profile : undefined,
            shouldResume: async () => {
                return false;
            },
        });
        if (pick.label === "Create new profile") {
            return (input: MultiStepInput) => inputProfileName(input, state);
        }
        state.profile = pick.label;
    }

    async function inputProfileName(
        input: MultiStepInput,
        state: Partial<State>
    ) {
        state.profile = await input.showInputBox({
            title,
            step: 2,
            totalSteps: 4,
            value: typeof state.profile === "string" ? state.profile : "",
            prompt: "Choose a unique name for the profile",
            validate: async (s) => {
                if (!s.length) {
                    return "Invalid profile name";
                }
            },
            shouldResume: shouldResume,
        });
        return (input: MultiStepInput) => inputHost(input, state);
    }

    async function inputHost(input: MultiStepInput, state: Partial<State>) {
        state.host = await input.showInputBox({
            title,
            step: 3,
            totalSteps: 4,
            value: typeof state.host === "string" ? state.host : "",
            prompt: "Databricks Host (should begin with https://)",
            validate: async (s) => {
                let url;
                try {
                    url = new URL(s);
                } catch (e) {
                    return "invalid host name";
                }
                if (url.protocol !== "https:") {
                    return "Invalid host name";
                }
            },
            shouldResume: shouldResume,
        });
        return (input: MultiStepInput) => inputToken(input, state);
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

    if (state.host && state.profile && state.token) {
        await cli.addProfile(state.profile, new URL(state.host), state.token);
    }

    return state.profile;
}
