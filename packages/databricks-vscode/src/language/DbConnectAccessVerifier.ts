import {Cluster, logging} from "@databricks/databricks-sdk";
import {window, ExtensionContext, commands} from "vscode";
import * as path from "node:path";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {MultiStepAccessVerifier} from "../feature-manager/MultiStepAccessVerfier";
import {WorkspaceStateManager} from "../vscode-objs/WorkspaceState";
import {MsPythonExtensionWrapper} from "./MsPythonExtensionWrapper";
import {Loggers} from "../logger";
import {Context, context} from "@databricks/databricks-sdk/dist/context";

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

    promptForAttachingCluster(msg: string) {
        return async () => {
            const choice = await window.showInformationMessage(
                msg,
                "Attach Cluster",
                "Ignore"
            );
            switch (choice) {
                case "Attach Cluster":
                    commands.executeCommand(
                        "databricks.connection.attachClusterQuickPick"
                    );
            }
        };
    }

    async checkCluster(cluster?: Cluster) {
        if (cluster === undefined) {
            return this.rejectStep(
                "checkCluster",
                "No cluster attached",
                this.promptForAttachingCluster(
                    "No cluster is attached. Please attach a cluster."
                )
            );
        }
        await this.connectionManager.waitForConnect();

        const dbrVersionParts = cluster?.dbrVersion;
        if (
            !dbrVersionParts ||
            (dbrVersionParts[0] !== "x" && dbrVersionParts[0] < 13)
        ) {
            return this.rejectStep(
                "checkCluster",
                `DB Connect V2 requires cluster DBR >= 13.0.0.`,
                this.promptForAttachingCluster(
                    `DB Connect V2 requires cluster DBR >= 13.0.0. Currently it is ${dbrVersionParts.join(
                        "."
                    )}. Please attach a new cluster.`
                )
            );
        }
        if (!cluster.isUc()) {
            return this.rejectStep(
                "checkCluster",
                `Cluster doesn't have UC enabled. Access mode should be "Single User" or "Shared"). Currently it is ${cluster.accessMode}`
            );
        }
        return this.acceptStep("checkCluster");
    }

    @logging.withLogContext(Loggers.Extension)
    async checkWorkspaceHasUc(@context ctx?: Context) {
        this.connectionManager.waitForConnect();
        try {
            const catalogList =
                await this.connectionManager.workspaceClient?.catalogs.list();
            if (!catalogList?.catalogs?.length) {
                return this.rejectStep(
                    "checkWorkspaceHasUc",
                    "No catalogues with read permission were found. Please enable UC for the workspace."
                );
            }
        } catch (e: unknown) {
            if (e instanceof Error) {
                ctx?.logger?.error("Error while searching for catalogues", e);
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
                "No python executable found."
            );
        }
        const env = await this.pythonExtension.pythonEnvironment;
        if (
            env &&
            env.version &&
            !(
                env.version.major > 3 ||
                (env.version.major === 3 && env.version.minor >= 9)
            )
        ) {
            return this.rejectStep(
                "checkDbConnectInstall",
                `DB Connect V2 requires python >= 3.9.0. Current version is ${[
                    env.version.major,
                    env.version.minor,
                    env.version.micro,
                ].join(".")}`
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
