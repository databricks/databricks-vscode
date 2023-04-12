import {Cluster} from "@databricks/databricks-sdk";
import {window, ExtensionContext} from "vscode";
import * as path from "node:path";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {MultiStepAccessVerifier} from "../feature-manager/MultiStepAccessVerfier";
import {WorkspaceStateManager} from "../vscode-objs/WorkspaceState";
import {MsPythonExtensionWrapper} from "./MsPythonExtensionWrapper";

export class DbConnectAccessVerifier extends MultiStepAccessVerifier {
    constructor(
        private readonly connectionManager: ConnectionManager,
        private readonly pythonExtension: MsPythonExtensionWrapper,
        private readonly workspaceState: WorkspaceStateManager,
        private readonly context: ExtensionContext
    ) {
        super(["checkCluster", "checkWorkspaceHasUc", "checkDbConnectInstall"]);
        this.disposables.push(
            this.connectionManager.onDidChangeCluster((cluster) => {
                if (this.connectionManager.state !== "CONNECTED") {
                    return;
                }
                const steps = {
                    checkCluster: () => this.checkCluster(cluster),
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

    async checkCluster(cluster?: Cluster) {
        if (cluster === undefined) {
            return this.rejectStep("checkCluster", "no cluster attached");
        }
        await this.connectionManager.waitForConnect();

        const dbrVersionParts = cluster?.dbrVersion;
        if (
            !dbrVersionParts ||
            (dbrVersionParts[0] !== "x" && dbrVersionParts[0] < 13)
        ) {
            return this.rejectStep(
                "checkCluster",
                `cluster dbr is less than 13.0.0`
            );
        }
        if (!cluster.isUc()) {
            return this.rejectStep(
                "checkCluster",
                `cluster doesn't have UC enabled (access mode should be "Single User" or "Shared")`
            );
        }
        return this.acceptStep("checkCluster");
    }

    async checkClusterHasUc(cluster?: Cluster) {
        if (cluster === undefined) {
            return this.rejectStep(
                "checkClusterHasUc",
                "no cluster is attached"
            );
        }
        this.connectionManager.waitForConnect();
    }

    async checkWorkspaceHasUc() {
        this.connectionManager.waitForConnect();
        try {
            const catalogList =
                await this.connectionManager.workspaceClient?.catalogs.list();
            if (!catalogList?.catalogs?.length) {
                return this.rejectStep(
                    "checkWorkspaceHasUc",
                    "no catalogues with read permission were found"
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

        const wheelPath = this.context.asAbsolutePath(
            path.join(
                "resources",
                "python",
                "databricks_connect-13.0.0-py2.py3-none-any.whl"
            )
        );

        const choice = await window.showInformationMessage(
            "Do you want to install databricks-connect in the current environment?",
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
                        wheelPath
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
                "no python executable found."
            );
        }
        try {
            const exists = await this.pythonExtension.findPackageInEnvironment(
                "databricks-connect"
            );
            if (exists) {
                return this.acceptStep("checkDbConnectInstall");
            }
            return this.rejectStep(
                "checkDbConnectInstall",
                "databricks-connect package is not installed in the current environment",
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
            checkCluster: () =>
                this.checkCluster(this.connectionManager.cluster),
            checkWorkspaceHasUc: () => this.checkWorkspaceHasUc(),
            checkDbConnectInstall: () => this.checkDbConnectInstall(),
        };
        await this.runSteps(steps);
    }
}
