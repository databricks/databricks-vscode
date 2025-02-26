import {Cluster} from "../sdk-extensions";
import {commands, window} from "vscode";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {MultiStepAccessVerifier} from "../feature-manager/MultiStepAccessVerfier";
import {MsPythonExtensionWrapper} from "./MsPythonExtensionWrapper";
import {Loggers} from "../logger";
import {EnvironmentDependenciesInstaller} from "./EnvironmentDependenciesInstaller";
import {FeatureStepState} from "../feature-manager/FeatureManager";
import {ResolvedEnvironment} from "./MsPythonExtensionApi";
import {NamedLogger} from "@databricks/databricks-sdk/dist/logging";
import {ConfigureAutocomplete} from "./ConfigureAutocomplete";

export class EnvironmentDependenciesVerifier extends MultiStepAccessVerifier {
    private readonly logger = NamedLogger.getOrCreate(Loggers.Extension);

    constructor(
        private readonly connectionManager: ConnectionManager,
        private readonly pythonExtension: MsPythonExtensionWrapper,
        private readonly installer: EnvironmentDependenciesInstaller,
        private readonly configureAutocomplete: ConfigureAutocomplete
    ) {
        super([
            "checkCluster",
            "checkWorkspaceHasUc",
            "checkPythonEnvironment",
            "checkEnvironmentDependencies",
            "checkBuiltins",
        ]);
        this.disposables.push(
            this.connectionManager.onDidChangeCluster(async (cluster) => {
                await Promise.all([
                    this.checkCluster(cluster),
                    this.checkPythonEnvironment(),
                ]);
                await this.checkEnvironmentDependencies();
                await this.checkBuiltins();
            }, this),
            this.connectionManager.onDidChangeState(async (e) => {
                if (e === "CONNECTED") {
                    await this.checkWorkspaceHasUc();
                }
            }, this),
            this.pythonExtension.onDidChangePythonExecutable(async () => {
                await this.checkPythonEnvironment();
                const depsCheck = await this.checkEnvironmentDependencies();
                if (!depsCheck.available && depsCheck.action) {
                    await depsCheck.action(true);
                }
                await this.checkBuiltins();
            }, this),
            this.installer.onDidTryInstallation(async () => {
                await this.checkEnvironmentDependencies();
                await this.checkBuiltins();
            }, this),
            this.configureAutocomplete.onDidUpdate(async () => {
                await this.checkBuiltins();
            })
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
        if (this.connectionManager.serverless) {
            return this.acceptStep("checkCluster");
        }

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

    async checkWorkspaceHasUc() {
        try {
            const catalogList =
                this.connectionManager.workspaceClient?.catalogs.list({});
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
            let title = "Failed to check workspace permissions";
            this.logger.error(title, e);
            let message = e instanceof Error ? e.message : (e as string) || "";
            if (message.includes("METASTORE_DOES_NOT_EXIST")) {
                title = "The workspace should have Unity Catalog enabled";
                message = "No catalogues with read permission were found";
            } else {
                window.showErrorMessage(`${title}: "${message}".`);
            }
            return this.rejectStep("checkWorkspaceHasUc", title, message);
        }
        return this.acceptStep("checkWorkspaceHasUc");
    }

    private matchEnvironmentVersion(
        env: ResolvedEnvironment | undefined,
        major: number,
        minor: number
    ): boolean {
        if (!env || !env.version || !env.environment) {
            return false;
        }
        return env.version.major === major && env.version.minor === minor;
    }

    private getCurrentPythonVersionMessage(env?: ResolvedEnvironment): string {
        return env?.version && env.environment
            ? `Current version is ${env.version.major}.${env.version.minor}.${env.version.micro}.`
            : "No active environments found.";
    }

    private getExpectedPythonVersionMessage(dbrVersionParts: (number | "x")[]) {
        if (dbrVersionParts[0] === 13 || dbrVersionParts[0] === 14) {
            return "3.10";
        }
        if (dbrVersionParts[0] === 15) {
            return "3.11";
        }
        if (dbrVersionParts[0] === 16) {
            return "3.12";
        }
        if (dbrVersionParts[0] !== "x" && dbrVersionParts[0] > 16) {
            return "3.12 or greater";
        }
        return "3.10 or greater";
    }

    private getVersionMismatchWarning(
        dbrMajor: "x" | number,
        env: ResolvedEnvironment,
        currentPythonVersionMessage: string
    ): string | undefined {
        if (
            (dbrMajor === 13 || dbrMajor === 14) &&
            !this.matchEnvironmentVersion(env, 3, 10)
        ) {
            return `Use python 3.10 to match DBR ${dbrMajor} requirements. ${currentPythonVersionMessage}`;
        }
        if (dbrMajor === 15 && !this.matchEnvironmentVersion(env, 3, 11)) {
            return `Use python 3.11 to match DBR ${dbrMajor} requirements. ${currentPythonVersionMessage}`;
        }
        if (dbrMajor === 16 && !this.matchEnvironmentVersion(env, 3, 12)) {
            return `Use python 3.12 to match DBR ${dbrMajor} requirements. ${currentPythonVersionMessage}`;
        }
        return undefined;
    }

    async checkPythonEnvironment(): Promise<FeatureStepState> {
        try {
            const dbrVersionParts =
                this.connectionManager.cluster?.dbrVersion || [];
            const expectedPythonVersion =
                this.getExpectedPythonVersionMessage(dbrVersionParts);
            const env = await this.pythonExtension.pythonEnvironment;
            const envVersionTooLow =
                env?.version &&
                (env.version.major !== 3 || env.version.minor < 10);
            const noEnvironment = !env?.environment;
            const currentPythonVersionMessage =
                this.getCurrentPythonVersionMessage(env);
            if (noEnvironment || envVersionTooLow) {
                return this.rejectStep(
                    "checkPythonEnvironment",
                    `Activate an environment with Python ${expectedPythonVersion}`,
                    `Databricks Connect requires ${expectedPythonVersion}. ${currentPythonVersionMessage}`,
                    this.selectPythonInterpreter.bind(this)
                );
            }
            const executable = await this.pythonExtension.getPythonExecutable();
            if (!executable) {
                return this.rejectStep(
                    "checkPythonEnvironment",
                    `Activate an environment with Python ${expectedPythonVersion}`,
                    "No python executable found",
                    this.selectPythonInterpreter.bind(this)
                );
            }
            const warning = this.getVersionMismatchWarning(
                dbrVersionParts[0],
                env,
                currentPythonVersionMessage
            );
            return this.acceptStep(
                "checkPythonEnvironment",
                `Active Environment: ${env.environment.name}`,
                env.executable.uri?.fsPath,
                warning
            );
        } catch (e) {
            const title = "Failed to check python environment";
            const message = e instanceof Error ? e.message : (e as string);
            this.logger.error(title, e);
            window.showErrorMessage(`${title}: "${message}".`);
            return this.rejectStep(
                "checkPythonEnvironment",
                title,
                message,
                this.selectPythonInterpreter.bind(this)
            );
        }
    }

    checkDatabricksConnectVersion(version: string) {
        const dbconnectcVersionParts = version.split(".");
        const dbconnectMajor = parseInt(dbconnectcVersionParts[0], 10);
        const dbconnectMinor = parseInt(dbconnectcVersionParts[1], 10);
        if (
            this.connectionManager.serverless &&
            (dbconnectMajor < 15 ||
                (dbconnectMajor === 15 && dbconnectMinor < 1))
        ) {
            return this.rejectStep(
                "checkEnvironmentDependencies",
                "Update databricks-connect",
                `Databricks Connect ${version} doesn't support serverless, please update to 15.1.0 or higher.`,
                this.reinstallDbConnect.bind(this)
            );
        }
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
            const dbconnectIsHigher =
                dbconnectMajor > dbrMajor ||
                (dbconnectMajor === dbrMajor &&
                    dbrMinor !== "x" &&
                    dbconnectMinor > dbrMinor);
            if (dbconnectIsHigher) {
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
            const title = "Failed to check python environment dependencies";
            const message = e instanceof Error ? e.message : (e as string);
            this.logger.error(title, e);
            window.showErrorMessage(`${title}: "${message}".`);
            return this.rejectStep(
                "checkEnvironmentDependencies",
                "Failed to check dependencies",
                message,
                async () => void (await this.checkEnvironmentDependencies())
            );
        }
    }

    async checkBuiltins() {
        if (!this.state.steps.get("checkEnvironmentDependencies")?.available) {
            return this.acceptStep("checkBuiltins");
        }
        try {
            const setupRequired =
                await this.configureAutocomplete.shouldSetupBuiltins();
            if (setupRequired) {
                return this.rejectStep(
                    "checkBuiltins",
                    "Setup Databricks builtins for autocompletion",
                    "Optional: create a __builtins__.pyi file to enable autocompletion for Databricks builtins.",
                    async () =>
                        void (await this.configureAutocomplete.configureCommand()),
                    undefined,
                    true
                );
            } else {
                return this.acceptStep("checkBuiltins");
            }
        } catch (e: unknown) {
            const title = "Failed to check Databricks builtins definition";
            const message = e instanceof Error ? e.message : (e as string);
            this.logger.error(title, e);
            window.showErrorMessage(`${title}: "${message}".`);
            return this.rejectStep(
                "checkBuiltins",
                title,
                message,
                async () => void (await this.checkBuiltins()),
                undefined,
                true
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
        await this.checkBuiltins();
    }
}
