import {Cluster} from "@databricks/databricks-sdk";
import {window} from "vscode";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {MultiStepAccessVerifier} from "../feature-manager/MultiStepAccessVerfier";
import {MsPythonExtensionWrapper} from "./MsPythonExtensionWrapper";

export class DbConnectAccessVerifier extends MultiStepAccessVerifier {
    constructor(
        private readonly connectionManager: ConnectionManager,
        private readonly pythonExtension: MsPythonExtensionWrapper
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
            }),
            this.connectionManager.onDidChangeState((e) => {
                if (e !== "CONNECTED") {
                    return;
                }
                this.runSteps({
                    checkWorkspaceHasUc: () => this.checkWorkspaceHasUc(),
                });
            }),
            this.pythonExtension.onDidChangePythonExecutable(() => {
                this.runSteps({
                    checkDbConnectInstall: () => this.checkDbConnectInstall(),
                });
            }),
            window.onDidChangeActiveTextEditor((e) => {
                if (e?.document.languageId !== "python") {
                    return;
                }
                this.runSteps({
                    checkDbConnectInstall: () => this.checkDbConnectInstall(),
                });
            })
        );
    }

    async checkClusterVersion(cluster?: Cluster) {
        if (cluster === undefined) {
            return this.reject("No cluster attached");
        }
        await this.connectionManager.waitForConnect();

        const dbrVersionParts = cluster?.dbrVersion;
        if (
            dbrVersionParts &&
            (dbrVersionParts[0] === "x" || dbrVersionParts[0] >= 13)
        ) {
            return true;
        }
        return this.reject(`Cluster dbr is less than 13.0.0`);
    }

    async checkClusterHasUc(cluster?: Cluster) {
        if (cluster === undefined) {
            return this.reject("No cluster attached");
        }
        this.connectionManager.waitForConnect();

        if (cluster.isUc()) {
            return this.reject(
                `Cluster doesn't have UC enabled (access mode should be "Single User" or "Shared")`
            );
        }
        return true;
    }

    async checkWorkspaceHasUc() {
        this.connectionManager.waitForConnect();
        try {
            const catalogList =
                await this.connectionManager.workspaceClient?.catalogs.list();
            if (!catalogList?.catalogs?.length) {
                return this.reject(
                    "Can't find any catalogs with read permissions"
                );
            }
        } catch (e: unknown) {
            if (e instanceof Error) {
                return this.reject(e.message);
            }
        }
        return true;
    }

    async checkDbConnectInstall() {
        const executable = await this.pythonExtension.getPythonExecutable();
        if (!executable) {
            return this.reject("No python executable found");
        }
        try {
            const exists = await this.pythonExtension.findPackageInEnvironment(
                "pyspark"
            );
            if (exists) {
                return true;
            }
            return this.reject(
                "Dbconnect package not installed in the current environment",
                async () => {
                    const choice = await window.showInformationMessage(
                        "Do you want to install dbconnectV2 in the current environment?",
                        "Yes",
                        "Ignore",
                        "Ignore for environment",
                        "Ignore for workspace"
                    );

                    //TODO: Handle other choices
                    switch (choice) {
                        case "Yes":
                            try {
                                await this.pythonExtension.uninstallPackageFromEnvironment(
                                    "pyspark"
                                );
                                await this.pythonExtension.installPackageInEnvironment(
                                    "pyspark"
                                );
                            } catch (e: unknown) {
                                if (e instanceof Error) {
                                    window.showErrorMessage(e.message);
                                }
                            }
                    }
                }
            );
        } catch (e: unknown) {
            if (e instanceof Error) {
                window.showErrorMessage(e.message);
            }
            return false;
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
