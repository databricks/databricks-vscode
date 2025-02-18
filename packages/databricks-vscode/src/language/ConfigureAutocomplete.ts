import {appendFile, mkdir, stat, readFile} from "fs/promises";
import path from "path";
import {
    ExtensionContext,
    window,
    Disposable,
    workspace,
    ConfigurationTarget,
    EventEmitter,
} from "vscode";
import {StateStorage} from "../vscode-objs/StateStorage";
import {WorkspaceFolderManager} from "../vscode-objs/WorkspaceFolderManager";

async function getImportString(context: ExtensionContext) {
    try {
        return await readFile(
            context.asAbsolutePath(
                path.join("resources", "python", "stubs", "__builtins__.pyi")
            ),
            "utf-8"
        );
    } catch (e: unknown) {
        if (e instanceof Error) {
            window.showErrorMessage(
                `Can't read internal type stubs for autocompletion. ${e.message}`
            );
        }
    }
}

export class ConfigureAutocomplete implements Disposable {
    private disposables: Disposable[] = [];
    private _onDidUpdateEmitter = new EventEmitter<void>();
    public onDidUpdate = this._onDidUpdateEmitter.event;

    constructor(
        private readonly context: ExtensionContext,
        private readonly stateStorage: StateStorage,
        private readonly workspaceFolderManager: WorkspaceFolderManager
    ) {
        // Remove any type stubs that users already have. We will now start using the python SDK (installed with databricks-connect)
        let extraPaths =
            workspace
                .getConfiguration("python")
                .get<Array<string>>("analysis.extraPaths") ?? [];
        extraPaths = extraPaths.filter(
            (value) =>
                !value.endsWith(path.join("resources", "python", "stubs"))
        );
        workspace
            .getConfiguration("python")
            .update(
                "analysis.extraPaths",
                extraPaths,
                ConfigurationTarget.Global
            );
    }

    dispose() {
        this.disposables.forEach((i) => i.dispose());
    }

    private get projectRootPath() {
        return this.workspaceFolderManager.activeWorkspaceFolder.uri.fsPath;
    }

    private get builtinsPath() {
        const stubPath = workspace
            .getConfiguration("python")
            .get<string>("analysis.stubPath");

        const builtinsDir = stubPath
            ? path.join(this.projectRootPath, stubPath)
            : this.projectRootPath;

        return path.join(builtinsDir, "__builtins__.pyi");
    }

    public async configureCommand() {
        await this.stateStorage.set(
            "databricks.autocompletion.skipConfigure",
            false
        );
        return this.setupBuiltins();
    }

    public async shouldSetupBuiltins(): Promise<boolean> {
        if (this.stateStorage.get("databricks.autocompletion.skipConfigure")) {
            return false;
        }

        const builtinsPath = this.builtinsPath;

        let builtinsFileExists = false;
        try {
            const stats = await stat(builtinsPath);
            builtinsFileExists = stats.isFile();
        } catch (e) {
            builtinsFileExists = false;
        }

        const importString = await getImportString(this.context);
        if (importString === undefined) {
            return false;
        }

        if (
            builtinsFileExists &&
            (await readFile(builtinsPath, "utf-8")).includes(importString)
        ) {
            return false;
        }

        return true;
    }

    private async setupBuiltins(): Promise<void> {
        if (!(await this.shouldSetupBuiltins())) {
            return;
        }

        const importString = await getImportString(this.context);
        if (!importString) {
            return;
        }

        const builtinsPath = this.builtinsPath;
        const messageString = `Create ${builtinsPath}?`;
        const choice = await window.showInformationMessage(
            messageString,
            "Continue",
            "Cancel",
            "Never for this workspace"
        );

        if (choice === "Never for this workspace") {
            await this.stateStorage.set(
                "databricks.autocompletion.skipConfigure",
                true
            );
            this._onDidUpdateEmitter.fire();
        } else if (choice === "Continue") {
            await mkdir(path.dirname(builtinsPath), {recursive: true});
            await appendFile(builtinsPath, `\n${importString}\n`);
            this._onDidUpdateEmitter.fire();
        }
    }
}
