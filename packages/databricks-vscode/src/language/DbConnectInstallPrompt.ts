import {window, commands} from "vscode";

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
            executable &&
            this.workspaceState.skippedEnvsForDbConnect.includes(executable)
        ) {
            return;
        }

        const hasPyspark = await this.pythonExtension.findPackageInEnvironment(
            "pyspark"
        );
        const hasDbConnect =
            !hasPyspark &&
            (await this.pythonExtension.findPackageInEnvironment(
                "databricks-connect"
            ));

        let message = advertisement
            ? "Interactive debugging in PySpark is now available. Start using it by installing Databricks Connect in the"
            : "For interactive debugging and autocompletion you need Databricks Connect. Would you like to install it in the";

        const env = (await this.pythonExtension.pythonEnvironment)?.environment;
        message = `${message} ${
            env ? "environment " + env.name : "current environment"
        }. ${
            hasPyspark
                ? "(pyspark will be uninstalled)"
                : hasDbConnect
                ? "(databricks-connect will be updated to the latest version)"
                : ""
        }`;

        const choice = await window.showInformationMessage(
            message,
            "Install",
            "Change environment",
            "Never for this environment"
        );

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
                commands.executeCommand("python.setInterpreter");
                break;
        }
    }
}
