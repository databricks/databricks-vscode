import {
    QuickPickItem,
    QuickPickItemKind,
    Disposable,
    Uri,
    window,
    commands,
    TerminalLocation,
} from "vscode";
import fs from "node:fs/promises";
import path from "path";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {ConfigModel} from "../configuration/models/ConfigModel";
import {BundleFileSet} from "./BundleFileSet";
import {logging} from "@databricks/databricks-sdk";
import {Loggers} from "../logger";
import {CachedValue} from "../locking/CachedValue";
import {CustomWhenContext} from "../vscode-objs/CustomWhenContext";
import {CliWrapper} from "../cli/CliWrapper";
import {LoginWizard, saveNewProfile} from "../configuration/LoginWizard";
import {Mutex} from "../locking";
import {
    AuthProvider,
    ProfileAuthProvider,
} from "../configuration/auth/AuthProvider";
import {ProjectConfigFile} from "../file-managers/ProjectConfigFile";
import {randomUUID} from "crypto";
import {onError} from "../utils/onErrorDecorator";

export class BundleProjectManager {
    private logger = logging.NamedLogger.getOrCreate(Loggers.Extension);
    private disposables: Disposable[] = [];

    private isBundleProjectCache = new CachedValue<boolean>(async () => {
        const rootBundleFile = await this.bundleFileSet.getRootFile();
        return rootBundleFile !== undefined;
    });

    public onDidChangeStatus = this.isBundleProjectCache.onDidChange;

    private projectServicesReady = false;
    private projectServicesMutex = new Mutex();

    private subProjects?: {relative: Uri; absolute: Uri}[];
    private legacyProjectConfig?: ProjectConfigFile;

    constructor(
        private cli: CliWrapper,
        private customWhenContext: CustomWhenContext,
        private connectionManager: ConnectionManager,
        private configModel: ConfigModel,
        private bundleFileSet: BundleFileSet,
        private workspaceUri: Uri
    ) {
        this.disposables.push(
            this.bundleFileSet.bundleDataCache.onDidChange(async () => {
                try {
                    await this.isBundleProjectCache.refresh();
                } catch (error) {
                    this.logger.error(
                        "Failed to refresh isBundleProjectCache",
                        error
                    );
                }
            }),
            this.isBundleProjectCache.onDidChange(async () => {
                try {
                    await this.configureBundleProject();
                } catch (error) {
                    this.logger.error(
                        "Failed to configure bundle project after isBundleProject change",
                        error
                    );
                    const message =
                        (error as Error)?.message ?? "Unknown Error";
                    window.showErrorMessage(
                        `Failed to configure Databricks project: ${message}`
                    );
                }
            })
        );
    }

    public async isBundleProject(): Promise<boolean> {
        return await this.isBundleProjectCache.value;
    }

    public async configureWorkspace(): Promise<void> {
        // We listen to _isBundleProject changes and call configureBundleProject
        if (await this.isBundleProject()) {
            return;
        }

        await Promise.all([
            // This method updates subProjectsAvailabe context.
            // We have a configurationView that shows "openSubProjects" button if the context value is true.
            await this.detectSubProjects(),
            // This method will try to automatically create bundle config if there's existing valid project.json config.
            // In the case project.json auth doesn't work, it sets pendingManualMigration context to enable
            // configurationView with the configureManualMigration button.
            await this.detectLegacyProjectConfig(),
        ]);
    }

    private async configureBundleProject() {
        if (await this.isBundleProject()) {
            this.logger.debug(
                "Detected an existing bundle project, initializing project services"
            );
            return this.initProjectServices();
        } else {
            this.logger.debug(
                "No bundle config detected, disposing project services"
            );
            await this.disposeProjectServices();
        }
    }

    @Mutex.synchronise("projectServicesMutex")
    private async initProjectServices() {
        if (this.projectServicesReady) {
            this.logger.debug("Project services have already been initialized");
            return;
        }
        await this.configModel.init();
        await this.connectionManager.init();
        this.projectServicesReady = true;
    }

    private async disposeProjectServices() {
        // TODO
    }

    private async detectSubProjects() {
        this.subProjects = await this.bundleFileSet.getSubProjects();
        this.logger.debug(
            `Detected ${this.subProjects?.length} sub folders with bundle projects`
        );
        this.customWhenContext.setSubProjectsAvailable(
            this.subProjects?.length > 0
        );
    }

    public async openSubProjects() {
        if (this.subProjects && this.subProjects.length > 0) {
            return this.promptToOpenSubProjects(this.subProjects);
        }
    }

    private async promptToOpenSubProjects(
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
        const item = await window.showQuickPick<OpenProjectItem>(
            items,
            options
        );
        if (!item) {
            return;
        }
        await commands.executeCommand("vscode.openFolder", item.uri);
    }

    private async detectLegacyProjectConfig() {
        this.legacyProjectConfig = await this.loadLegacyProjectConfig();
        if (!this.legacyProjectConfig) {
            return;
        }
        this.logger.debug(
            "Detected a legacy project.json, starting automatic migration"
        );
        try {
            await this.startAutomaticMigration(this.legacyProjectConfig);
        } catch (error) {
            this.logger.error("Failed to perform automatic migration:", error);
            this.customWhenContext.setPendingManualMigration(true);
        }
    }

    private async loadLegacyProjectConfig(): Promise<
        ProjectConfigFile | undefined
    > {
        try {
            return await ProjectConfigFile.load(
                this.workspaceUri.fsPath,
                this.cli.cliPath
            );
        } catch (error) {
            this.logger.error("Failed to load legacy project config:", error);
            return undefined;
        }
    }

    private async startAutomaticMigration(
        legacyProjectConfig: ProjectConfigFile
    ) {
        let authProvider = legacyProjectConfig.authProvider;
        if (!(await authProvider.check())) {
            this.logger.debug(
                "Legacy project auth was not successful, showing 'configure' welcome screen"
            );
            this.customWhenContext.setPendingManualMigration(true);
            return;
        }
        if (!(authProvider instanceof ProfileAuthProvider)) {
            const rnd = randomUUID().slice(0, 8);
            const profileName = `${authProvider.authType}-${rnd}`;
            this.logger.debug(
                "Creating new profile before bundle migration",
                profileName
            );
            authProvider = await saveNewProfile(profileName, authProvider);
        }
        await this.migrateProjectJsonToBundle(
            legacyProjectConfig,
            authProvider as ProfileAuthProvider
        );
    }

    @onError({
        popup: {
            prefix: "Failed to migrate the project to Databricks Asset Bundles",
        },
    })
    public async startManualMigration() {
        if (!this.legacyProjectConfig) {
            throw new Error("Can't migrate without project configuration");
        }
        const authProvider = await LoginWizard.run(this.cli, this.configModel);
        if (
            authProvider instanceof ProfileAuthProvider &&
            (await authProvider.check())
        ) {
            return this.migrateProjectJsonToBundle(
                this.legacyProjectConfig!,
                authProvider
            );
        } else {
            this.logger.debug("Incorrect auth for the project.json migration");
        }
    }

    private async migrateProjectJsonToBundle(
        legacyProjectConfig: ProjectConfigFile,
        authProvider: ProfileAuthProvider
    ) {
        const configVars = {
            /* eslint-disable @typescript-eslint/naming-convention */
            project_name: path.basename(this.workspaceUri.fsPath),
            compute_id: legacyProjectConfig.clusterId,
            root_path: legacyProjectConfig.workspacePath?.path,
            /* eslint-enable @typescript-eslint/naming-convention */
        };
        this.logger.debug("Starting bundle migration, config:", configVars);
        const configFilePath = path.join(
            this.workspaceUri.fsPath,
            ".databricks",
            "migration-config.json"
        );
        await fs.writeFile(configFilePath, JSON.stringify(configVars, null, 4));
        const templateDirPath = path.join(__dirname, "migration-template");
        await this.cli.bundleInit(
            templateDirPath,
            this.workspaceUri.fsPath,
            configFilePath,
            authProvider
        );
    }

    public async initNewProject() {
        const authProvider = await this.configureAuthForBundleInit();
        if (!authProvider) {
            this.logger.debug(
                "No valid auth providers, can't proceed with bundle init wizard"
            );
            return;
        }
        const parentFolder = await this.promptForParentFolder();
        if (!parentFolder) {
            this.logger.debug("No parent folder provided");
            return;
        }
        await this.bundleInitInTerminal(parentFolder, authProvider);
        this.logger.debug(
            "Finished bundle init wizard, detecting projects to initialize or open"
        );
        await this.isBundleProjectCache.refresh();
        const projects = await this.bundleFileSet.getSubProjects(parentFolder);
        if (projects.length > 0) {
            this.logger.debug(
                `Detected ${projects.length} sub projects after the init wizard, prompting to open one`
            );
            await this.promptToOpenSubProjects(projects);
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
    }

    private async configureAuthForBundleInit(): Promise<
        AuthProvider | undefined
    > {
        let authProvider =
            this.connectionManager.databricksWorkspace?.authProvider;
        if (authProvider) {
            const response = await this.promptToUseExistingAuth(authProvider);
            if (response.cancelled) {
                return undefined;
            } else if (!response.approved) {
                authProvider = undefined;
            }
        }
        if (!authProvider) {
            authProvider = await LoginWizard.run(this.cli, this.configModel);
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
        const finalPrompt = `echo "Press any key to close the terminal and continue ..."; read; exit`;
        terminal.sendText(
            `${this.cli.cliPath} ${args.join(" ")}; ${finalPrompt}`
        );
        return new Promise<void>((resolve) => {
            const closeEvent = window.onDidCloseTerminal(async (t) => {
                if (t !== terminal) {
                    return;
                }
                closeEvent.dispose();
                resolve();
            });
            this.disposables.push(closeEvent);
        });
    }

    private async promptForParentFolder(): Promise<Uri | undefined> {
        const parentPath = await window.showInputBox({
            title: "Provide a path to a folder where you would want your new project to be",
            value: this.workspaceUri.fsPath,
        });
        if (!parentPath) {
            return undefined;
        }
        return Uri.file(parentPath);
    }

    dispose() {
        this.disposables.forEach((d) => d.dispose());
    }
}
