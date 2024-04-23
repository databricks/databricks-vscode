import {logging} from "@databricks/databricks-sdk";
import {Cluster} from "../sdk-extensions";
import {commands, window} from "vscode";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {MultiStepAccessVerifier} from "../feature-manager/MultiStepAccessVerfier";
import {MsPythonExtensionWrapper} from "./MsPythonExtensionWrapper";
import {Loggers} from "../logger";
import {Context, context} from "@databricks/databricks-sdk/dist/context";
import {EnvironmentDependenciesInstaller} from "./EnvironmentDependenciesInstaller";
import {FeatureStepState} from "../feature-manager/FeatureManager";
import {Telemetry} from "../telemetry";

export class EnvironmentDependenciesVerifier extends MultiStepAccessVerifier {
    constructor(
        private readonly connectionManager: ConnectionManager,
        private readonly pythonExtension: MsPythonExtensionWrapper,
        private readonly installer: EnvironmentDependenciesInstaller,
        private readonly telemetry: Telemetry
    ) {
        super([
            "checkCluster",
            "checkWorkspaceHasUc",
            "checkPythonEnvironment",
            "checkEnvironmentDependencies",
        ]);
        this.disposables.push(
            this.connectionManager.onDidChangeCluster((cluster) => {
                if (this.connectionManager.state !== "CONNECTED") {
                    return;
                }
                this.checkCluster(cluster);
                if (cluster) {
                    this.checkEnvironmentDependencies();
                }
            }, this),
            this.connectionManager.onDidChangeState((e) => {
                if (e !== "CONNECTED") {
                    return;
                }
                this.checkWorkspaceHasUc();
            }, this),
            this.pythonExtension.onDidChangePythonExecutable(async () => {
                await this.checkPythonEnvironment();
                const depsCheck = await this.checkEnvironmentDependencies();
                if (!depsCheck.available && depsCheck.action) {
                    await depsCheck.action(true);
                }
            }, this),
            this.installer.onDidTryInstallation(() =>
                this.checkEnvironmentDependencies()
            )
        );
    }

    promptForAttachingCluster(msg: string) {
        return async () => {
            await commands.executeCommand(
                "databricks.connection.attachClusterQuickPick",
                msg
            );
        };
    }

    async selectPythonInterpreter() {
        await commands.executeCommand(
            "databricks.environment.selectPythonInterpreter"
        );
    }

    async reinstallDbConnect() {
        await commands.executeCommand(
            "databricks.environment.reinstallDBConnect"
        );
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

    async checkPythonEnvironment(): Promise<FeatureStepState> {
        const executable = await this.pythonExtension.getPythonExecutable();
        if (!executable) {
            return this.rejectStep(
                "checkPythonEnvironment",
                "Select Python Interpreter",
                "No python executable found",
                this.selectPythonInterpreter.bind(this)
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
                "checkPythonEnvironment",
                "Select Python >= 3.10.0",
                `Databricks Connect requires python >= 3.10.0. Current version is ${[
                    env.version.major,
                    env.version.minor,
                    env.version.micro,
                ].join(".")}.`,
                this.selectPythonInterpreter.bind(this)
            );
        }
        if (!env?.environment) {
            return this.rejectStep(
                "checkPythonEnvironment",
                "Activate virtual environment",
                "No active virtual environment",
                this.selectPythonInterpreter.bind(this)
            );
        }
        return this.acceptStep(
            "checkPythonEnvironment",
            `Active Environment: ${env.environment.name}`,
            env.executable.uri?.fsPath
        );
    }

    checkDatabricksConnectVersion(version: string) {
        const dbconnectcVersionParts = version.split(".");
        const dbconnectMajor = parseInt(dbconnectcVersionParts[0], 10);
        const dbconnectMinor = parseInt(dbconnectcVersionParts[1], 10);
        if (dbconnectMajor < 13) {
            return this.rejectStep(
                "checkEnvironmentDependencies",
                "Update databricks-connect",
                `Databricks Connect ${version} is outdated, please update to 13.0.0 or higher.`,
                this.reinstallDbConnect.bind(this)
            );
        }
        const dbrVersionParts = this.connectionManager.cluster?.dbrVersion;
        if (dbrVersionParts && dbrVersionParts[0] !== "x") {
            const dbrMajor = dbrVersionParts[0];
            const dbrMinor = dbrVersionParts[1];
            const dbconnectIsLower =
                dbconnectMajor <= dbrMajor &&
                (dbrMinor === "x" || dbconnectMinor <= dbrMinor);
            if (!dbconnectIsLower) {
                return this.rejectStep(
                    "checkEnvironmentDependencies",
                    "Reinstall databricks-connect",
                    `Databricks Connect version (${version}) should be equal or lower than the cluster DBR version (${dbrMajor}.${dbrMinor}).`,
                    this.reinstallDbConnect.bind(this)
                );
            }
        }
        return this.acceptStep(
            "checkEnvironmentDependencies",
            `Databricks Connect: ${version}`
        );
    }

    async checkEnvironmentDependencies(): Promise<FeatureStepState> {
        const envAvailable = this.state.steps.get("checkPythonEnvironment")
            ?.available;
        if (!envAvailable) {
            return this.rejectStep(
                "checkEnvironmentDependencies",
                "Can't install databricks-connect without an active python environment"
            );
        }
        try {
            const dbconnect =
                await this.pythonExtension.getPackageDetailsFromEnvironment(
                    "databricks-connect"
                );
            if (dbconnect) {
                return this.checkDatabricksConnectVersion(dbconnect.version);
            } else {
                return this.rejectStep(
                    "checkEnvironmentDependencies",
                    "Install databricks-connect",
                    "databricks-connect package is not installed in the current environment",
                    async (advertisement = false) =>
                        this.installer.show(advertisement)
                );
            }
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : (e as string);
            return this.rejectStep(
                "checkEnvironmentDependencies",
                "Failed to check dependencies",
                message,
                async () => void (await this.checkEnvironmentDependencies())
            );
        }
    }

    override async check() {
        await this.connectionManager.waitForConnect();
        await Promise.all([
            this.checkCluster(this.connectionManager.cluster),
            this.checkWorkspaceHasUc(),
            this.checkPythonEnvironment(),
        ]);
        await this.checkEnvironmentDependencies();
    }
}
