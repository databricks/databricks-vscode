import {logging} from "@databricks/databricks-sdk";
import {Cluster} from "../sdk-extensions";
import {window, commands} from "vscode";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {MultiStepAccessVerifier} from "../feature-manager/MultiStepAccessVerfier";
import {MsPythonExtensionWrapper} from "./MsPythonExtensionWrapper";
import {Loggers} from "../logger";
import {Context, context} from "@databricks/databricks-sdk/dist/context";
import {DbConnectInstallPrompt} from "./DbConnectInstallPrompt";
import {FeatureState} from "../feature-manager/FeatureManager";

export class DbConnectAccessVerifier extends MultiStepAccessVerifier {
    constructor(
        private readonly connectionManager: ConnectionManager,
        private readonly pythonExtension: MsPythonExtensionWrapper,
        private readonly dbConnectInstallPrompt: DbConnectInstallPrompt
    ) {
        super(["checkCluster", "checkWorkspaceHasUc", "checkDbConnectInstall"]);
        this.disposables.push(
            this.connectionManager.onDidChangeCluster((cluster) => {
                if (this.connectionManager.state !== "CONNECTED") {
                    return;
                }
                this.checkCluster(cluster);
            }, this),
            this.connectionManager.onDidChangeState((e) => {
                if (e !== "CONNECTED") {
                    return;
                }
                this.checkWorkspaceHasUc();
            }, this),
            this.pythonExtension.onDidChangePythonExecutable(async () => {
                const check = await this.checkDbConnectInstall();
                if (
                    typeof check !== "boolean" &&
                    check.reason?.includes(
                        "databricks-connect package is not installed"
                    ) &&
                    check.action
                ) {
                    check.action(true);
                }
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
                    "Please attach a cluster to use Databricks Connect."
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
                `Databricks Connect requires cluster DBR >= 13.0.0.`,
                this.promptForAttachingCluster(
                    `Databricks Connect requires cluster DBR >= 13.0.0. Currently it is ${dbrVersionParts.join(
                        "."
                    )}. Please attach a new cluster.`
                )
            );
        }
        if (!cluster.isUc()) {
            return this.rejectStep(
                "checkCluster",
                `Cluster doesn't have UC enabled.`,
                this.promptForAttachingCluster(
                    `Databricks Connect requires Access Mode to be "Single User" or "Shared"). Currently it is ${
                        cluster.accessMode ?? "custom"
                    }. Please attach a new cluster.`
                )
            );
        }
        return this.acceptStep("checkCluster");
    }

    @logging.withLogContext(Loggers.Extension)
    async checkWorkspaceHasUc(@context ctx?: Context) {
        this.connectionManager.waitForConnect();
        try {
            const catalogList =
                this.connectionManager.workspaceClient?.catalogs.list();
            const catalogListIter = catalogList
                ? catalogList[Symbol.asyncIterator]()
                : undefined;

            if (!(await catalogListIter?.next())) {
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

    async checkDbConnectInstall(): Promise<boolean | FeatureState> {
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
                (env.version.major === 3 && env.version.minor >= 10)
            )
        ) {
            return this.rejectStep(
                "checkDbConnectInstall",
                `Databricks Connect requires python >= 3.10.0. Current version is ${[
                    env.version.major,
                    env.version.minor,
                    env.version.micro,
                ].join(".")}.`
            );
        }
        try {
            const exists = await this.pythonExtension.findPackageInEnvironment(
                "databricks-connect",
                "latest"
            );
            if (exists) {
                return this.acceptStep("checkDbConnectInstall");
            }
            return this.rejectStep(
                "checkDbConnectInstall",
                "databricks-connect package is not installed in the current environment",
                (advertisement = false) =>
                    this.dbConnectInstallPrompt.show(advertisement, () =>
                        this.checkDbConnectInstall()
                    )
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
        this.checkCluster(this.connectionManager.cluster);
        this.checkWorkspaceHasUc();
        this.checkDbConnectInstall();
    }
}
