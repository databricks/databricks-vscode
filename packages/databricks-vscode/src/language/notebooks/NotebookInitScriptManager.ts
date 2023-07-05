import {Disposable, Uri, ExtensionContext} from "vscode";
import path from "path";
import {mkdir, cp, rm, readdir} from "fs/promises";
import {glob} from "glob";
import {ConnectionManager} from "../../configuration/ConnectionManager";
import {FeatureManager} from "../../feature-manager/FeatureManager";
export class NotebookInitScriptManager implements Disposable {
    private disposables: Disposable[] = [];

    constructor(
        private readonly workspacePath: Uri,
        private readonly extensionContext: ExtensionContext,
        private readonly connectionManager: ConnectionManager,
        private readonly featureManager: FeatureManager
    ) {}

    get ipythonDir(): string {
        return path.join(this.workspacePath.fsPath, ".databricks", "ipython");
    }

    get startupDir(): string {
        return path.join(this.ipythonDir, "profile_default", "startup");
    }

    get generatedDir(): string {
        return this.extensionContext.asAbsolutePath(
            path.join(
                "resources",
                "python",
                "generated",
                "databricks-init-scripts"
            )
        );
    }

    get sourceFiles(): Promise<string[]> {
        return readdir(this.generatedDir);
    }

    private async copyInitScript() {
        await mkdir(this.startupDir, {recursive: true});
        for (const file of await this.sourceFiles) {
            await cp(
                path.join(this.generatedDir, file),
                path.join(this.startupDir, file)
            );
        }
    }

    async deleteOutdatedInitScripts() {
        const startupDir = path.join(
            this.ipythonDir,
            "profile_default",
            "startup"
        );

        const sourceFiles = await this.sourceFiles;
        for (const file of await glob(
            path.join(startupDir, "00-databricks-init-*.py")
        )) {
            if (!sourceFiles.includes(path.basename(file))) {
                await rm(file);
            }
        }
    }

    async updateInitScript() {
        if (
            !(await this.featureManager.isEnabled("notebooks.dbconnect"))
                .avaliable
        ) {
            return;
        }
        await this.connectionManager.waitForConnect();
        await this.deleteOutdatedInitScripts();
        await this.copyInitScript();
    }

    dispose() {
        this.disposables.forEach((i) => i.dispose());
    }
}
