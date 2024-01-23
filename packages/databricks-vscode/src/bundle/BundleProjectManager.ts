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
            const subProjects = await this.bundleFileSet.getSubProjects();
            this.customWhenContext.setSubProjectsAvailable(
                subProjects?.length > 0
            );
            return subProjects;
        }
    );

    constructor(
        private cli: CliWrapper,
        private customWhenContext: CustomWhenContext,
        private connectionManager: ConnectionManager,
        private configModel: ConfigModel,
        private bundleFileSet: BundleFileSet,
        private workspaceUri: Uri
    ) {}

    public async isBundleProject(): Promise<boolean> {
        return await this._isBundleProject.value;
    }

    public async configureWorkspace(): Promise<void> {
        if (await this.isBundleProject()) {
            this.logger.debug("Detected an existing bundle project");
            return this.initExistingProject();
        }
        const isLegacyProject = await this._isLegacyProject.value;
        if (isLegacyProject) {
            this.logger.debug(
                "Detected a legacy project.json, starting automatic migration"
            );
            await this.migrateProjectJsonToBundle();
            await this._isBundleProject.refresh();
            return this.initExistingProject();
        }
        const subProjects = await this._subProjects.value;
        if (subProjects.length > 0) {
            this.logger.debug(
                "Detected multiple sub folders with bundle projects"
            );
        } else {
            this.logger.debug(
                "No bundle or legacy configs detected, waiting for the user to configure auth manually"
            );
        }
    }

    private async initExistingProject() {
        await this.configModel.init();
        await this.connectionManager.init();
    }

    public async openSubProjects() {
        const projects = await this._subProjects.value;
        if (projects.length === 0) {
            return;
        }
        return this.promptToOpenSubProjects(projects);
    }

    private async promptToOpenSubProjects(projects: {absolute: Uri, relative: Uri}[]) {
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
        await this._isBundleProject.refresh();
        const projects = await this.bundleFileSet.getSubProjects(parentFolder);
        if (projects.length > 0) {
            await this.promptToOpenSubProjects(projects);
        } else {
            // notify that we don't know what to open
        }
    }

    private async bundleInitInTerminal(parentFolder: Uri, env: Record<string, string>) {
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
        terminal.sendText(`${this.cli.cliPath} ${args.join(" ")}; ${finalPrompt}`);
        return new Promise<void>((resolve) => {
            const closeEvent = window.onDidCloseTerminal(async (t) => {
                if (t !== terminal) return;
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
