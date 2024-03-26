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
import {getSubProjects} from "./BundleFileSet";
import {tmpdir} from "os";
import {ShellUtils} from "../utils";
import {Events, Telemetry} from "../telemetry";
import {OverrideableConfigModel} from "../configuration/models/OverrideableConfigModel";
import {writeFile, mkdir} from "fs/promises";
import path from "path";

export async function promptToOpenSubProjects(
    projects: {absolute: Uri; relative: string}[],
    authProvider?: AuthProvider
) {
    type OpenProjectItem = QuickPickItem & {uri?: Uri};
    const items: OpenProjectItem[] = projects.map((project) => {
        return {
            uri: project.absolute,
            label: project.relative,
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
    if (!item?.uri) {
        return;
    }

    if (authProvider?.authType === "profile") {
        const rootOverrideFilePath =
            OverrideableConfigModel.getRootOverrideFile(item.uri);
        await mkdir(path.dirname(rootOverrideFilePath.fsPath), {
            recursive: true,
        });
        await writeFile(
            rootOverrideFilePath.fsPath,
            JSON.stringify({authProfile: authProvider.toJSON().profile})
        );
    }
    await commands.executeCommand("vscode.openFolder", item.uri);
}

export class BundleInitWizard {
    private logger = logging.NamedLogger.getOrCreate(Loggers.Extension);

    constructor(
        private cli: CliWrapper,
        private telemetry: Telemetry
    ) {}

    public async initNewProject(
        workspaceUri?: Uri,
        existingAuthProvider?: AuthProvider
    ) {
        const recordEvent = this.telemetry.start(Events.BUNDLE_INIT);
        try {
            const authProvider =
                await this.configureAuthForBundleInit(existingAuthProvider);
            if (!authProvider) {
                this.logger.debug(
                    "No valid auth providers, can't proceed with bundle init wizard"
                );
                recordEvent({success: false});
                return;
            }
            const parentFolder = await this.promptForParentFolder(workspaceUri);
            if (!parentFolder) {
                this.logger.debug("No parent folder provided");
                recordEvent({success: false});
                return;
            }
            await this.bundleInitInTerminal(parentFolder, authProvider);
            this.logger.debug(
                "Finished bundle init wizard, detecting projects to initialize or open"
            );
            const projects = await getSubProjects(parentFolder);
            recordEvent({success: projects.length > 0});
            if (projects.length > 0) {
                this.logger.debug(
                    `Detected ${projects.length} sub projects after the init wizard, prompting to open one`
                );
                await promptToOpenSubProjects(projects, authProvider);
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
        } catch (e) {
            recordEvent({success: false});
            throw e;
        }
    }

    private async configureAuthForBundleInit(
        authProvider?: AuthProvider
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
            authProvider = await LoginWizard.run(this.cli);
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
            env: {
                // Without supplying full environment and with `strictEnv: true` PowerShell will fail to start.
                // On unix-like systems we don't require full environment, but it doesn't hurt.
                ...process.env,
                ...this.cli.getBundleInitEnvVars(authProvider),
            },
            // Without strict env we will inherit our environmentVariableCollection
            // which will override auth env vars we provide in this call.
            strictEnv: true,
            // Setting CWD avoids a possibility of the CLI picking up unrelated bundle configuration
            // in the current workspace root or while traversing up the folder structure.
            cwd: tmpdir(),
        });
        const args = [
            "bundle",
            "init",
            "--output-dir",
            this.cli.escapePathArgument(parentFolder.fsPath),
        ].join(" ");
        const initialPrompt = `clear; echo "Executing: databricks ${args}\nFollow the steps below to create your new Databricks project.\n"`;
        const finalPrompt = `echo "\nPress any key to close the terminal and continue ..."; ${ShellUtils.readCmd()}; exit`;
        terminal.sendText(
            `${initialPrompt}; ${this.cli.cliPath} ${args}; ${finalPrompt}`
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
        const initialValue = workspaceUri?.fsPath || process.env.HOME;
        if (initialValue) {
            quickPick.value = initialValue;
        }
        quickPick.title =
            "Provide a path to a folder where you would want your new project to be";
        quickPick.items = createParentFolderQuickPickItems(
            quickPick.value,
            openFolderLabel
        );
        quickPick.show();
        const disposables = [
            quickPick.onDidChangeValue(() => {
                quickPick.items = createParentFolderQuickPickItems(
                    quickPick.value,
                    openFolderLabel
                );
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
            title: "Choose a folder where you would want your new project to be",
            openLabel: "Select folder",
            defaultUri: workspaceUri,
            canSelectFolders: true,
            canSelectFiles: false,
            canSelectMany: false,
        });
        return choices ? choices[0] : undefined;
    }
}

function createParentFolderQuickPickItems(
    value: string | undefined,
    openFolderLabel: string
) {
    const items: QuickPickItem[] = value
        ? [{label: value, alwaysShow: true}]
        : [];
    items.push(
        {label: "", kind: QuickPickItemKind.Separator, alwaysShow: true},
        {label: openFolderLabel, alwaysShow: true}
    );
    return items;
}
