import {
    QuickPickItem,
    QuickPickItemKind,
    Uri,
    window,
    TerminalLocation,
    commands,
} from "vscode";
import {logging} from "@databricks/databricks-sdk";
import {Loggers} from "../logger";
import {AuthProvider} from "../configuration/auth/AuthProvider";
import {LoginWizard} from "../configuration/LoginWizard";
import {CliWrapper} from "../cli/CliWrapper";
import {ConfigModel} from "../configuration/models/ConfigModel";
import {getSubProjects} from "./BundleFileSet";

export async function promptToOpenSubProjects(
    projects: {absolute: Uri; relative: Uri}[]
) {
    type OpenProjectItem = QuickPickItem & {uri?: Uri};
    const items: OpenProjectItem[] = projects.map((project) => {
        return {
            uri: project.absolute,
            label: project.relative.fsPath,
            detail: project.absolute.fsPath,
        };
    });
    items.push(
        {label: "", kind: QuickPickItemKind.Separator},
        {label: "Choose another folder"}
    );
    const options = {
        title: "Select the project you want to open",
    };
    const item = await window.showQuickPick<OpenProjectItem>(items, options);
    if (!item) {
        return;
    }
    await commands.executeCommand("vscode.openFolder", item.uri);
}

export class BundleInitWizard {
    private logger = logging.NamedLogger.getOrCreate(Loggers.Extension);

    constructor(private cli: CliWrapper) {}

    public async initNewProject(
        workspaceUri?: Uri,
        existingAuthProvider?: AuthProvider,
        configModel?: ConfigModel
    ) {
        const authProvider = await this.configureAuthForBundleInit(
            existingAuthProvider,
            configModel
        );
        if (!authProvider) {
            this.logger.debug(
                "No valid auth providers, can't proceed with bundle init wizard"
            );
            return;
        }
        const parentFolder = await this.promptForParentFolder(workspaceUri);
        if (!parentFolder) {
            this.logger.debug("No parent folder provided");
            return;
        }
        await this.bundleInitInTerminal(parentFolder, authProvider);
        this.logger.debug(
            "Finished bundle init wizard, detecting projects to initialize or open"
        );
        const projects = await getSubProjects(parentFolder);
        if (projects.length > 0) {
            this.logger.debug(
                `Detected ${projects.length} sub projects after the init wizard, prompting to open one`
            );
            await promptToOpenSubProjects(projects);
        } else {
            this.logger.debug(
                `No projects detected after the init wizard, showing notification to open a folder manually`
            );
            const choice = await window.showInformationMessage(
                `We haven't detected any Databricks projects in "${parentFolder.fsPath}". If you initialized your project somewhere else, please open the folder manually.`,
                "Open Folder"
            );
            if (choice === "Open Folder") {
                await commands.executeCommand("vscode.openFolder");
            }
        }
        return parentFolder;
    }

    private async configureAuthForBundleInit(
        authProvider?: AuthProvider,
        configModel?: ConfigModel
    ): Promise<AuthProvider | undefined> {
        if (authProvider) {
            const response = await this.promptToUseExistingAuth(authProvider);
            if (response.cancelled) {
                return undefined;
            } else if (!response.approved) {
                authProvider = undefined;
            }
        }
        if (!authProvider) {
            authProvider = await LoginWizard.run(this.cli, configModel);
        }
        if (authProvider && (await authProvider.check())) {
            return authProvider;
        } else {
            return undefined;
        }
    }

    private async promptToUseExistingAuth(authProvider: AuthProvider) {
        type AuthSelectionItem = QuickPickItem & {approved: boolean};
        const items: AuthSelectionItem[] = [
            {
                label: "Use current auth",
                detail: `Host: ${authProvider.host.hostname}`,
                approved: true,
            },
            {
                label: "Setup new auth",
                approved: false,
            },
        ];
        const options = {
            title: "What auth do you want to use for the new project?",
        };
        const item = await window.showQuickPick<AuthSelectionItem>(
            items,
            options
        );
        return {
            cancelled: item === undefined,
            approved: item?.approved ?? false,
        };
    }

    private async bundleInitInTerminal(
        parentFolder: Uri,
        authProvider: AuthProvider
    ) {
        const terminal = window.createTerminal({
            name: "Databricks Project Init",
            isTransient: true,
            location: TerminalLocation.Editor,
            env: this.cli.getBundleInitEnvVars(authProvider),
        });
        const args = [
            "bundle",
            "init",
            "--output-dir",
            this.cli.escapePathArgument(parentFolder.fsPath),
        ];
        const initialPrompt = `clear; echo "Executing: databricks ${args.join(
            " "
        )}\nFollow the steps below to create your new Databricks project.\n"`;
        const finalPrompt = `echo "Press any key to close the terminal and continue ..."; read; exit`;
        terminal.sendText(
            `${initialPrompt}; ${this.cli.cliPath} ${args.join(
                " "
            )}; ${finalPrompt}`
        );
        return new Promise<void>((resolve) => {
            const closeEvent = window.onDidCloseTerminal(async (t) => {
                if (t !== terminal) {
                    return;
                }
                closeEvent.dispose();
                resolve();
            });
        });
    }

    private async promptForParentFolder(
        workspaceUri?: Uri
    ): Promise<Uri | undefined> {
        const quickPick = window.createQuickPick();
        const openFolderLabel = "Open folder selection dialog";
        quickPick.value = workspaceUri?.fsPath ?? "";
        quickPick.title =
            "Provide a path to a folder where you would want your new project to be";
        quickPick.items = [
            {label: quickPick.value, alwaysShow: true},
            {label: "", kind: QuickPickItemKind.Separator, alwaysShow: true},
            {label: openFolderLabel, alwaysShow: true},
        ];
        quickPick.show();
        const disposables = [
            quickPick.onDidChangeValue(() => {
                quickPick.items = [
                    {label: quickPick.value, alwaysShow: true},
                    ...quickPick.items.slice(1),
                ];
            }),
        ];
        const choice = await new Promise<QuickPickItem | undefined>(
            (resolve) => {
                disposables.push(
                    quickPick.onDidAccept(() =>
                        resolve(quickPick.selectedItems[0])
                    ),
                    quickPick.onDidHide(() => resolve(undefined))
                );
            }
        );
        disposables.forEach((d) => d.dispose());
        quickPick.hide();
        if (!choice) {
            return;
        }
        if (choice.label !== openFolderLabel) {
            return Uri.file(choice.label);
        }
        const choices = await window.showOpenDialog({
            title: "Chose a folder where you would want your new project to be",
            openLabel: "Select folder",
            defaultUri: workspaceUri,
            canSelectFolders: true,
            canSelectFiles: false,
            canSelectMany: false,
        });
        return choices ? choices[0] : undefined;
    }
}
