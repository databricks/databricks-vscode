import {EventEmitter, window} from "vscode";

import {Disposable} from "vscode";
import {MsPythonExtensionWrapper} from "./MsPythonExtensionWrapper";
import {DATABRICKS_CONNECT_VERSION} from "../utils/constants";

export class EnvironmentDependenciesInstaller implements Disposable {
    private disposables: Disposable[] = [];
    private onDidInstallAttemptEmitter = new EventEmitter<void>();
    public onDidTryInstallation = this.onDidInstallAttemptEmitter.event;

    constructor(private readonly pythonExtension: MsPythonExtensionWrapper) {}

    dispose() {
        this.disposables.forEach((i) => i.dispose());
    }

    async install(version?: string) {
        version = version ?? DATABRICKS_CONNECT_VERSION;
        try {
            await this.pythonExtension.uninstallPackageFromEnvironment(
                "pyspark"
            );
            await this.pythonExtension.uninstallPackageFromEnvironment(
                "databricks-connect"
            );
            await this.pythonExtension.installPackageInEnvironment(
                "databricks-connect",
                version
            );
        } catch (e: unknown) {
            if (e instanceof Error) {
                window.showErrorMessage(e.message);
            }
        }
        this.onDidInstallAttemptEmitter.fire();
    }

    async installWithVersionPrompt(suggestedVersion?: string) {
        const version = await window.showInputBox({
            prompt: "Enter a version of the Databricks Connect",
            value: suggestedVersion || DATABRICKS_CONNECT_VERSION,
        });
        if (version) {
            await this.install(version);
        }
    }

    async show(advertisement = false) {
        const hasPyspark =
            await this.pythonExtension.findPackageInEnvironment("pyspark");

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
              ? `(databricks-connect will be changed from ${dbConnectDetails.version} to ${DATABRICKS_CONNECT_VERSION})`
              : "";
        const message = `${mainMessagePart} ${envMessagePart}. ${pkgUpdateMessagePart}`;
        const choices = ["Install", "Change environment", "Change version"];

        const choice = await window.showInformationMessage(message, ...choices);
        switch (choice) {
            case "Install":
                return this.install();
            case "Change version":
                return this.installWithVersionPrompt();
            case "Change environment":
                return this.pythonExtension.selectPythonInterpreter();
        }
    }
}
