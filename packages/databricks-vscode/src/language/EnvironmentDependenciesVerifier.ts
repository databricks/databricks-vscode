import {logging} from "@databricks/databricks-sdk";
import {Cluster} from "../sdk-extensions";
import {window, commands} from "vscode";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {MultiStepAccessVerifier} from "../feature-manager/MultiStepAccessVerfier";
import {MsPythonExtensionWrapper} from "./MsPythonExtensionWrapper";
import {Loggers} from "../logger";
import {Context, context} from "@databricks/databricks-sdk/dist/context";
import {EnvironmentDependenciesInstallPrompt} from "./EnvironmentDependenciesInstallPrompt";
import {FeatureState} from "../feature-manager/FeatureManager";
import {DATABRICKS_CONNECT_VERSION} from "../utils/constants";

export class EnvironmentDependenciesVerifier extends MultiStepAccessVerifier {
    constructor(
        private readonly connectionManager: ConnectionManager,
        private readonly pythonExtension: MsPythonExtensionWrapper,
        private readonly installPrompt: EnvironmentDependenciesInstallPrompt
    ) {
        super(["checkCluster", "checkWorkspaceHasUc", "checkLocalEnvironment"]);
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
                const check = await this.checkLocalEnvironment();
                if (
                    typeof check !== "boolean" &&
                    check.message?.includes(
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
                "Attach a cluster",
                `Databricks Connect requires cluster DBR >= 13.0.0`,
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
                "Attach a cluster with DBR >= 13.0.0",
                `Databricks Connect requires a cluster with DBR >= 13.0.0`,
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
                `Attach a cluster with Unity Catalog`,
                "Databricks Connect requires a cluster with UC enabled",
                this.promptForAttachingCluster(
                    `Databricks Connect requires a Unity Catalog enabled cluster with Access Mode "Single User" or "Shared". Currently it is ${
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
                    "The workspace should have Unity Catalog enabled",
                    "No catalogues with read permission were found"
                );
            }
        } catch (e: unknown) {
            if (e instanceof Error) {
                ctx?.logger?.error("Error while searching for catalogues", e);
                return this.rejectStep(
                    "checkWorkspaceHasUc",
                    "Failed to check workspace permissions",
                    e.message
                );
            }
        }
        return this.acceptStep("checkWorkspaceHasUc");
    }

    async checkLocalEnvironment(): Promise<boolean | FeatureState> {
        const executable = await this.pythonExtension.getPythonExecutable();
        if (!executable) {
            return this.rejectStep(
                "checkLocalEnvironment",
                "Select Python Interpreter",
                "No python executable found",
                async () => {
                    await this.pythonExtension.selectPythonInterpreter();
                }
            );
        }
        const env = await this.pythonExtension.pythonEnvironment;
        if (
            env?.version &&
            !(
                env.version.major > 3 ||
                (env.version.major === 3 && env.version.minor >= 10)
            )
        ) {
            return this.rejectStep(
                "checkLocalEnvironment",
                "Select Python Interpreter",
                `Databricks Connect requires python >= 3.10.0. Current version is ${[
                    env.version.major,
                    env.version.minor,
                    env.version.micro,
                ].join(".")}.`,
                async () => {
                    await this.pythonExtension.selectPythonInterpreter();
                }
            );
        }
        if (!env?.environment) {
            return this.rejectStep(
                "checkLocalEnvironment",
                "Activate a virtual environment",
                "No active virtual environment",
                async () => {
                    await this.pythonExtension.createPythonEnvironment();
                }
            );
        }
        try {
            const exists = await this.pythonExtension.findPackageInEnvironment(
                "databricks-connect",
                DATABRICKS_CONNECT_VERSION
            );
            if (exists) {
                return this.acceptStep("checkLocalEnvironment");
            }
            return this.rejectStep(
                "checkLocalEnvironment",
                "Install databricks-connect",
                "databricks-connect package is not installed in the current environment",
                async (advertisement = false) =>
                    await this.installPrompt.show(advertisement, () =>
                        this.checkLocalEnvironment()
                    )
            );
        } catch (e: unknown) {
            if (e instanceof Error) {
                window.showErrorMessage(e.message);
                return this.rejectStep(
                    "checkLocalEnvironment",
                    "Failed to check dependencies",
                    e.message
                );
            }
            return this.rejectStep(
                "checkLocalEnvironment",
                "Failed to check dependencies",
                e as string
            );
        }
    }

    override async check() {
        await this.connectionManager.waitForConnect();
        this.checkCluster(this.connectionManager.cluster);
        this.checkWorkspaceHasUc();
        this.checkLocalEnvironment();
    }
}
