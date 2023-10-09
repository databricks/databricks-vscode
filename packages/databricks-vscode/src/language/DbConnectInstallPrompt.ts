import {window} from "vscode";

import {Disposable} from "vscode";
import {WorkspaceStateManager} from "../vscode-objs/WorkspaceState";
import {MsPythonExtensionWrapper} from "./MsPythonExtensionWrapper";

export class DbConnectInstallPrompt implements Disposable {
    private disposables: Disposable[] = [];

    constructor(
        private readonly workspaceState: WorkspaceStateManager,
        private readonly pythonExtension: MsPythonExtensionWrapper
    ) {}

    dispose() {
        this.disposables.forEach((i) => i.dispose());
    }
    async show(advertisement = false, cb: () => void = () => {}) {
        const executable = await this.pythonExtension.getPythonExecutable();
        if (
            advertisement &&
            executable &&
            this.workspaceState.skippedEnvsForDbConnect.includes(executable)
        ) {
            return;
        }

        const hasPyspark = await this.pythonExtension.findPackageInEnvironment(
            "pyspark"
        );

        const dbConnectDetails =
            await this.pythonExtension.getPackageDetailsFromEnvironment(
                "databricks-connect"
            );

        const hasDbConnect = !hasPyspark && dbConnectDetails !== undefined;
        const env = (await this.pythonExtension.pythonEnvironment)?.environment;

        const mainMessagePart = advertisement
            ? "Interactive debugging in PySpark is now available. Start using it by installing Databricks Connect in the"
            : "For interactive debugging and autocompletion you need Databricks Connect. Would you like to install it in the";
        const envMessagePart = env
            ? "environment " + env.name
            : "current environment";
        const pkgUpdateMessagePart = hasPyspark
            ? "(pyspark will be uninstalled)"
            : hasDbConnect
            ? `(databricks-connect will be updated to the latest version: ${
                  dbConnectDetails.version
              } -> ${await this.pythonExtension.getLatestPackageVersion(
                  "databricks-connect"
              )} )`
            : "";
        const message = `${mainMessagePart} ${envMessagePart}. ${pkgUpdateMessagePart}`;

        const choices = [
            "Install",
            "Change environment",
            advertisement ? "Never for this environment" : undefined,
        ].filter((value) => value !== undefined) as string[];

        const choice = await window.showInformationMessage(message, ...choices);

        switch (choice) {
            case "Install":
                try {
                    await this.pythonExtension.uninstallPackageFromEnvironment(
                        "pyspark"
                    );
                    await this.pythonExtension.uninstallPackageFromEnvironment(
                        "databricks-connect"
                    );
                    await this.pythonExtension.installPackageInEnvironment(
                        "databricks-connect",
                        "latest"
                    );
                    cb();
                } catch (e: unknown) {
                    if (e instanceof Error) {
                        window.showErrorMessage(e.message);
                    }
                }
                break;

            case "Never for this environment":
                if (executable) {
                    this.workspaceState.skipDbConnectInstallForEnv(executable);
                }
                break;

            case "Change environment":
                await this.pythonExtension.selectPythonInterpreter();
                break;
        }
    }
}
