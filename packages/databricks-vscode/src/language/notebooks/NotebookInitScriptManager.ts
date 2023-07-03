import {Disposable, Uri, ExtensionContext} from "vscode";
import path from "path";
import {PackageJsonUtils} from "../../utils";
import {exists} from "fs-extra";
import {mkdir, cp, rm} from "fs/promises";
import {glob} from "glob";
import {ConnectionManager} from "../../configuration/ConnectionManager";
export class NotebookInitScriptManager implements Disposable {
    private disposables: Disposable[] = [];
    private _jupyterInitScriptVersion: string | undefined | null = null;

    constructor(
        private readonly workspacePath: Uri,
        private readonly extensionContext: ExtensionContext,
        private readonly connectionManager: ConnectionManager
    ) {}

    get ipythonDir(): string {
        return path.join(this.workspacePath.fsPath, ".databricks", "ipython");
    }

    get startupDir(): string {
        return path.join(this.ipythonDir, "profile_default", "startup");
    }

    get jupyterInitScriptVersion(): Promise<string | undefined> {
        if (this._jupyterInitScriptVersion !== null) {
            return Promise.resolve(this._jupyterInitScriptVersion);
        }

        return PackageJsonUtils.getMetadata(this.extensionContext).then(
            (metadata) => {
                this._jupyterInitScriptVersion =
                    metadata.jupyterInitScriptVersion;
                return this._jupyterInitScriptVersion;
            }
        );
    }

    get sourceFile(): Promise<string> {
        return this.jupyterInitScriptVersion.then((version) => {
            return this.extensionContext.asAbsolutePath(
                path.join(
                    "resources",
                    "python",
                    "generated",
                    `00-databricks-init-${version}.py`
                )
            );
        });
    }

    get destFile(): Promise<string> {
        return this.jupyterInitScriptVersion.then((version) => {
            return path.join(
                this.startupDir,
                `00-databricks-init-${version}.py`
            );
        });
    }

    private async copyInitScript() {
        if (
            this.jupyterInitScriptVersion === undefined ||
            (await exists(await this.destFile))
        ) {
            return;
        }

        await mkdir(this.startupDir, {recursive: true});
        await cp(await this.sourceFile, await this.destFile);
    }

    async deleteOutdatedInitScripts() {
        const startupDir = path.join(
            this.ipythonDir,
            "profile_default",
            "startup"
        );

        for (const file of await glob(
            path.join(startupDir, "00-databricks-init-*.py")
        )) {
            if (file !== (await this.destFile)) {
                await rm(file, {force: true});
            }
        }
    }

    async updateInitScript() {
        await this.connectionManager.waitForConnect();
        await this.deleteOutdatedInitScripts();
        await this.copyInitScript();
    }

    dispose() {
        this.disposables.forEach((i) => i.dispose());
    }
}
