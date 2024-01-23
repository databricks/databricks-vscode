import {
    QuickPickItem,
    QuickPickItemKind,
    Disposable,
    Uri,
    window,
    commands,
    TerminalLocation,
} from "vscode";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {ConfigModel} from "../configuration/models/ConfigModel";
import {BundleFileSet} from "./BundleFileSet";
import {logging} from "@databricks/databricks-sdk";
import {Loggers} from "../logger";
import {CachedValue} from "../locking/CachedValue";
import {CustomWhenContext} from "../vscode-objs/CustomWhenContext";
import {CliWrapper} from "../cli/CliWrapper";
import {LoginWizard} from "../configuration/LoginWizard";
import {Mutex} from "../locking";

export class BundleProjectManager {
    private logger = logging.NamedLogger.getOrCreate(Loggers.Extension);
    private disposables: Disposable[] = [];

    private _isBundleProject = new CachedValue<boolean>(async () => {
        const rootBundleFile = await this.bundleFileSet.getRootFile();
        return rootBundleFile !== undefined;
    });

    public onDidChangeStatus = this._isBundleProject.onDidChange;

    private _isLegacyProject = new CachedValue<boolean>(async () => {
        // TODO
        return false;
    });

    private _subProjects = new CachedValue<{absolute: Uri; relative: Uri}[]>(
        async () => {
            const projects = await this.bundleFileSet.getSubProjects();
            this.logger.debug(
                `Detected ${projects.length} sub folders with bundle projects`
            );
            this.customWhenContext.setSubProjectsAvailable(projects.length > 0);
            return projects;
        }
    );

    private projectServicesReady = false;
    private projectServicesMutex = new Mutex();

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
                    await this._isBundleProject.refresh();
                } catch (error) {
                    this.logger.error(
                        "Failed to refresh isBundleProject var",
                        error
                    );
                }
            }),
            this._isBundleProject.onDidChange(async () => {
                try {
                    await this.configureBundleProject();
                } catch (error) {
                    this.logger.error(
                        "Failed to configure bundle project after isBundleProject change",
                        error
                    );
                }
            })
        );
    }

    public async isBundleProject(): Promise<boolean> {
        return await this._isBundleProject.value;
    }

    public async configureWorkspace(): Promise<void> {
        // We listen to _isBundleProject changes and call configureBundleProject
        if (await this.isBundleProject()) {
            return;
        }

        // The cached value updates subProjectsAvailabe context.
        // We have a configurationView that shows "open project" button if the context value is true.
        await this._subProjects.refresh();

        const isLegacyProject = await this._isLegacyProject.value;
        if (isLegacyProject) {
            this.logger.debug(
                "Detected a legacy project.json, starting automatic migration"
            );
            await this.migrateProjectJsonToBundle();
        }
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

    public async openSubProjects() {
        const projects = await this._subProjects.value;
        if (projects.length === 0) {
            return;
        }
        return this.promptToOpenSubProjects(projects);
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
            title: "We've detected several Databricks projects, select the one you want to open",
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

    private async migrateProjectJsonToBundle() {
        // TODO
    }

    public async initNewProject() {
        const authProvider = await LoginWizard.run(this.cli, this.configModel);
        if (!authProvider || !(await authProvider.check())) {
            return;
        }
        const parentFolder = await this.promptForParentFolder();
        if (!parentFolder) {
            this.logger.debug("No parent folder provided");
            return;
        }
        await this.bundleInitInTerminal(parentFolder, authProvider.toEnv());
        this.logger.debug(
            "Finished bundle init wizard, detecting projects to initialize or open"
        );
        await this._isBundleProject.refresh();
        const projects = await this.bundleFileSet.getSubProjects(parentFolder);
        if (projects.length > 0) {
            this.logger.debug(
                `Detected ${projects.length} sub projects after the init wizard, prompting to open one`
            );
            await this.promptToOpenSubProjects(projects);
        } else {
            this.logger.debug(
                `No projects detect after the init wizard, showing notification to open a folder manually`
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

    private async bundleInitInTerminal(
        parentFolder: Uri,
        env: Record<string, string>
    ) {
        const terminal = window.createTerminal({
            name: "Databricks Project Init",
            isTransient: true,
            location: TerminalLocation.Editor,
            env: {...env, ...this.cli.getLogginEnvVars()},
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
