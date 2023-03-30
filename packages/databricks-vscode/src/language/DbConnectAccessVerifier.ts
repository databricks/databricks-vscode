import {Cluster} from "@databricks/databricks-sdk";
import {window} from "vscode";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {MultiStepAccessVerifier} from "../feature-manager/MultiStepAccessVerfier";
import {WorkspaceStateManager} from "../vscode-objs/WorkspaceState";
import {MsPythonExtensionWrapper} from "./MsPythonExtensionWrapper";

export class DbConnectAccessVerifier extends MultiStepAccessVerifier {
    constructor(
        private readonly connectionManager: ConnectionManager,
        private readonly pythonExtension: MsPythonExtensionWrapper,
        private readonly workspaceState: WorkspaceStateManager
    ) {
        super([
            "checkClusterVersion",
            "checkClusterHasUc",
            "checkWorkspaceHasUc",
            "checkDbConnectInstall",
        ]);
        this.disposables.push(
            this.connectionManager.onDidChangeCluster((cluster) => {
                if (this.connectionManager.state !== "CONNECTED") {
                    return;
                }
                const steps = {
                    checkClusterVersion: () =>
                        this.checkClusterVersion(cluster),
                    checkClusterHasUc: () => this.checkClusterHasUc(cluster),
                };
                this.runSteps(steps);
            }, this),
            this.connectionManager.onDidChangeState((e) => {
                if (e !== "CONNECTED") {
                    return;
                }
                this.runSteps({
                    checkWorkspaceHasUc: () => this.checkWorkspaceHasUc(),
                });
            }, this),
            this.pythonExtension.onDidChangePythonExecutable(() => {
                this.runSteps({
                    checkDbConnectInstall: () => this.checkDbConnectInstall(),
                });
            }, this)
        );
    }

    async checkClusterVersion(cluster?: Cluster) {
        if (cluster === undefined) {
            return this.rejectStep(
                "checkClusterVersion",
                "No cluster attached"
            );
        }
        await this.connectionManager.waitForConnect();

        const dbrVersionParts = cluster?.dbrVersion;
        if (
            dbrVersionParts &&
            (dbrVersionParts[0] === "x" || dbrVersionParts[0] >= 13)
        ) {
            return this.acceptStep("checkClusterVersion");
        }
        return this.rejectStep(
            "checkClusterVersion",
            `Cluster dbr is less than 13.0.0`
        );
    }

    async checkClusterHasUc(cluster?: Cluster) {
        if (cluster === undefined) {
            return this.rejectStep("checkClusterHasUc", "No cluster attached");
        }
        this.connectionManager.waitForConnect();

        if (cluster.isUc()) {
            return this.rejectStep(
                "checkClusterHasUc",
                `Cluster doesn't have UC enabled (access mode should be "Single User" or "Shared")`
            );
        }
        return this.acceptStep("checkClusterHasUc");
    }

    async checkWorkspaceHasUc() {
        this.connectionManager.waitForConnect();
        try {
            const catalogList =
                await this.connectionManager.workspaceClient?.catalogs.list();
            if (!catalogList?.catalogs?.length) {
                return this.rejectStep(
                    "checkWorkspaceHasUc",
                    "Can't find any catalogs with read permissions"
                );
            }
        } catch (e: unknown) {
            if (e instanceof Error) {
                return this.rejectStep("checkWorkspaceHasUc", e.message);
            }
        }
        return this.acceptStep("checkWorkspaceHasUc");
    }

    async showDbConnectInstallPrompt() {
        const executable = await this.pythonExtension.getPythonExecutable();
        if (
            this.workspaceState.skipDbConnectInstall ||
            (executable &&
                this.workspaceState.skippedEnvsForDbConnect.includes(
                    executable
                ))
        ) {
            return;
        }

        const choice = await window.showInformationMessage(
            "Do you want to install dbconnectV2 in the current environment?",
            "Yes",
            "Ignore",
            "Ignore for environment",
            "Ignore for workspace"
        );

        switch (choice) {
            case "Yes":
                try {
                    await this.pythonExtension.uninstallPackageFromEnvironment(
                        "pyspark"
                    );
                    await this.pythonExtension.installPackageInEnvironment(
                        "pyspark"
                    );
                    this.checkDbConnectInstall();
                } catch (e: unknown) {
                    if (e instanceof Error) {
                        window.showErrorMessage(e.message);
                    }
                }
                break;

            case "Ignore for environment":
                if (executable) {
                    this.workspaceState.skipDbConnectInstallForEnv(executable);
                }
                break;

            case "Ignore for workspace":
                this.workspaceState.skipDbConnectInstall = true;
                break;
        }
    }

    async checkDbConnectInstall() {
        const executable = await this.pythonExtension.getPythonExecutable();
        if (!executable) {
            return this.rejectStep(
                "checkDbConnectInstall",
                "No python executable found"
            );
        }
        try {
            const exists = await this.pythonExtension.findPackageInEnvironment(
                "pyspark"
            );
            if (exists) {
                return this.acceptStep("checkDbConnectInstall");
            }
            return this.rejectStep(
                "checkDbConnectInstall",
                "Dbconnect package not installed in the current environment",
                () => this.showDbConnectInstallPrompt()
            );
        } catch (e: unknown) {
            if (e instanceof Error) {
                window.showErrorMessage(e.message);
                return this.rejectStep("checkDbConnectInstall", e.message);
            }
            return this.rejectStep("checkDbConnectInstall", e as string);
        }
    }

    override async check() {
        await this.connectionManager.waitForConnect();
        const steps = {
            checkClusterVersion: () =>
                this.checkClusterVersion(this.connectionManager.cluster),
            checkClusterHasUc: () =>
                this.checkClusterHasUc(this.connectionManager.cluster),
            checkWorkspaceHasUc: () => this.checkWorkspaceHasUc(),
            checkDbConnectInstall: () => this.checkDbConnectInstall(),
        };
        await this.runSteps(steps);
    }
}
