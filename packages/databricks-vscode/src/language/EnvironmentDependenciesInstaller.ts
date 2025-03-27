import {commands, EventEmitter, OutputChannel, window} from "vscode";

import {Disposable} from "vscode";
import {MsPythonExtensionWrapper} from "./MsPythonExtensionWrapper";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {DATABRICKS_CONNECT_VERSION as DATABRICKS_CONNECT_MINIMAL_VERSION} from "../utils/constants";

export class EnvironmentDependenciesInstaller implements Disposable {
    private disposables: Disposable[] = [];
    private onDidInstallAttemptEmitter = new EventEmitter<void>();
    public onDidTryInstallation = this.onDidInstallAttemptEmitter.event;

    private _outputChannel?: OutputChannel;

    constructor(
        private readonly connectionManager: ConnectionManager,
        private readonly pythonExtension: MsPythonExtensionWrapper
    ) {}

    get outputChannel() {
        if (!this._outputChannel) {
            this._outputChannel =
                window.createOutputChannel("Databricks Connect");
            this.disposables.push(this._outputChannel);
        }
        return this._outputChannel;
    }

    dispose() {
        this.disposables.forEach((i) => i.dispose());
    }

    async install(version?: string) {
        if (!version) {
            version = await this.getSuggestedVersion();
        }
        try {
            this.outputChannel.clear();
            this.outputChannel.show();
            await this.pythonExtension.uninstallPackageFromEnvironment(
                "pyspark",
                this.outputChannel
            );
            await this.pythonExtension.uninstallPackageFromEnvironment(
                "databricks-connect",
                this.outputChannel
            );
            await this.pythonExtension.installPackageInEnvironment(
                "databricks-connect",
                version,
                this.outputChannel
            );
            // Required for executing notebooks with %run magic
            await this.pythonExtension.installPackageInEnvironment(
                "nbformat",
                undefined,
                this.outputChannel
            );
        } catch (e: unknown) {
            if (e instanceof Error) {
                window.showErrorMessage(e.message);
            }
            this.outputChannel.show();
        }
        this.onDidInstallAttemptEmitter.fire();
    }

    async getSuggestedVersion() {
        if (this.connectionManager.serverless) {
            return "15.1.*";
        }
        const dbrVersionParts =
            this.connectionManager.cluster?.dbrVersion || [];
        if (dbrVersionParts.length < 2 || dbrVersionParts[0] === "x") {
            return DATABRICKS_CONNECT_MINIMAL_VERSION;
        }
        const major = dbrVersionParts[0];
        const minor = dbrVersionParts[1] === "x" ? "*" : dbrVersionParts[1];
        const rest = minor === "*" ? "" : ".*";
        return `${major}.${minor + rest}`;
    }

    async installWithVersionPrompt(suggestedVersion?: string) {
        const version = await window.showInputBox({
            prompt: "Enter a version of the Databricks Connect",
            value: suggestedVersion || (await this.getSuggestedVersion()),
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
        const suggestedVersion = await this.getSuggestedVersion();
        const pkgUpdateMessagePart = hasPyspark
            ? "(pyspark will be uninstalled)"
            : hasDbConnect
              ? `(databricks-connect will be changed from ${dbConnectDetails.version} to ${suggestedVersion})`
              : "";
        const message = `${mainMessagePart} ${envMessagePart}. ${pkgUpdateMessagePart}`;
        const choices = ["Install", "Change environment", "Change version"];

        const choice = await window.showInformationMessage(message, ...choices);
        switch (choice) {
            case "Install":
                return this.install(suggestedVersion);
            case "Change version":
                return this.installWithVersionPrompt(suggestedVersion);
            case "Change environment":
                await commands.executeCommand(
                    "databricks.environment.selectPythonInterpreter"
                );
                return;
        }
    }
}
