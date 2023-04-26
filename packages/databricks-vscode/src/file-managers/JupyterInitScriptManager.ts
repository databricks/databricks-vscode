import {Disposable, ExtensionContext} from "vscode";
import {FeatureManager} from "../feature-manager/FeatureManager";
import path from "path";
import {workspaceConfigs} from "../vscode-objs/WorkspaceConfigs";
import {copyFile, mkdir} from "fs/promises";
import {rm} from "fs/promises";

export class JupyterInitScriptManager implements Disposable {
    private disposables: Disposable[] = [];

    constructor(
        private readonly featureManager: FeatureManager,
        private readonly extensionContext: ExtensionContext
    ) {
        this.disposables.push(
            this.featureManager.onDidChangeState(
                "debugging.dbconnect",
                (state) => {
                    state.avaliable ? this.writeFile() : this.deleteFile();
                }
            )
        );
        this.featureManager.isEnabled("debugging.dbconnect").then((state) => {
            state.avaliable ? this.writeFile() : this.deleteFile();
        });
    }

    private async getDestDir() {
        const destDir = path.join(
            workspaceConfigs.jupyterDefaultProfilePath,
            "startup"
        );
        await mkdir(destDir, {recursive: true});
        return destDir;
    }

    async writeFile() {
        const sourcePath = this.extensionContext.asAbsolutePath(
            path.resolve("resources", "python", "00-databricks-startup.py")
        );

        await copyFile(
            sourcePath,
            path.join(await this.getDestDir(), "00-databricks-startup.py")
        );
    }

    async deleteFile() {
        await rm(
            path.join(await this.getDestDir(), "00-databricks-startup.py"),
            {
                force: true,
            }
        );
    }

    dispose() {
        this.disposables.forEach((i) => i.dispose());
    }
}
