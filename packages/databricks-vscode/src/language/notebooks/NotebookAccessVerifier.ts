import {window} from "vscode";
import {FeatureManager} from "../../feature-manager/FeatureManager";
import {MultiStepAccessVerifier} from "../../feature-manager/MultiStepAccessVerfier";
import {MsPythonExtensionWrapper} from "../MsPythonExtensionWrapper";
import {WorkspaceStateManager} from "../../vscode-objs/WorkspaceState";

export class NotebookAccessVerifier extends MultiStepAccessVerifier {
    constructor(
        private readonly featureManager: FeatureManager,
        private readonly pythonExtension: MsPythonExtensionWrapper,
        private readonly workspaceState: WorkspaceStateManager
    ) {
        super(["isPythonSdkInstalled", "isDbConnectEnabled"]);

        this.disposables.push(
            this.featureManager.onDidChangeState(
                "debugging.dbconnect",
                this.isDbConnectEnabled,
                this
            ),
            this.pythonExtension.onDidChangePythonExecutable(
                this.isPythonSdkInstalled,
                this
            )
        );
    }

    async showSdkInstallPrompt() {
        const mainMessagePart =
            "Databricks SDK for python enables you to run databricks notebooks locally. Would you like to install it in the";

        const env = await this.pythonExtension.pythonEnvironment;
        const envMessagePart = env?.environment?.name
            ? `environment ${env.environment.name}`
            : `current environment`;

        const sdkDetails =
            await this.pythonExtension.getPackageDetailsFromEnvironment(
                "databricks-sdk"
            );
        const sdkUpdateMessagePart = sdkDetails
            ? `(databricks-sdk will be updated to the latest version: ${
                  sdkDetails.version
              } -> ${await this.pythonExtension.getLatestPackageVersion(
                  "databricks-sdk"
              )})`
            : "";

        const message = `${mainMessagePart} ${envMessagePart}? ${sdkUpdateMessagePart}`;
        const result = await window.showInformationMessage(
            message,
            "Install",
            "Change environment",
            "Never for this environment"
        );
        switch (result) {
            case "Install":
                this.pythonExtension.installPackageInEnvironment(
                    "databricks-sdk",
                    "latest"
                );
                await this.isPythonSdkInstalled();
                break;

            case "Change environment":
                await this.pythonExtension.selectPythonInterpreter();
                break;

            case "Never for this environment":
                if (env?.path) {
                    this.workspaceState.skipDatabricksSdkInstallForEnv(
                        env?.path
                    );
                }
        }
    }
    async isPythonSdkInstalled() {
        try {
            const databricksSdkExists =
                await this.pythonExtension.findPackageInEnvironment(
                    "databricks-sdk",
                    "latest"
                );
            if (databricksSdkExists) {
                return this.acceptStep("isPythonSdkInstalled");
            }
            return this.rejectStep(
                "isPythonSdkInstalled",
                "Python SDK is not installed",
                async () => {
                    try {
                        await this.showSdkInstallPrompt();
                    } catch (e) {
                        if (e instanceof Error) {
                            window.showErrorMessage(e.message);
                        }
                    }
                }
            );
        } catch (e) {
            if (e instanceof Error) {
                return this.rejectStep("isPythonSdkInstalled", e.message);
            }
        }
    }

    async isDbConnectEnabled() {
        const dbconnectFeature = await this.featureManager.isEnabled(
            "debugging.dbconnect"
        );
        if (dbconnectFeature.avaliable) {
            return this.acceptStep("isDbConnectEnabled");
        }
        return this.rejectStep(
            "isDbConnectEnabled",
            "DbConnect is not enabled"
        );
    }

    async check() {
        this.isPythonSdkInstalled();
        this.isDbConnectEnabled();
    }
}
