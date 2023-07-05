import {OutputChannel, window, workspace} from "vscode";
import {FeatureManager} from "../../feature-manager/FeatureManager";
import {MultiStepAccessVerifier} from "../../feature-manager/MultiStepAccessVerfier";
import {MsPythonExtensionWrapper} from "../MsPythonExtensionWrapper";
import {WorkspaceStateManager} from "../../vscode-objs/WorkspaceState";
import {NotebookInitScriptManager} from "./NotebookInitScriptManager";
import {execFile as ef} from "child_process";
import {promisify} from "util";
import {DatabricksEnvFileManager} from "../../file-managers/DatabricksEnvFileManager";
import {withLogContext} from "@databricks/databricks-sdk/dist/logging";
import {Loggers} from "../../logger";
import {Context, context} from "@databricks/databricks-sdk/dist/context";
import {Mutex} from "../../locking";
import path from "path";
import {LocalUri} from "../../sync/SyncDestination";
import {FileUtils} from "../../utils";
const execFile = promisify(ef);

export class NotebookAccessVerifier extends MultiStepAccessVerifier {
    private outputWindow: OutputChannel = window.createOutputChannel(
        "Databricks Notebooks"
    );
    private initScriptWorksMutex = new Mutex();

    constructor(
        private readonly featureManager: FeatureManager,
        private readonly pythonExtension: MsPythonExtensionWrapper,
        private readonly workspaceState: WorkspaceStateManager,
        private readonly notebookInitScriptManager: NotebookInitScriptManager,
        private readonly databricksEnvFileManager: DatabricksEnvFileManager
    ) {
        super([
            "isPythonSdkInstalled",
            "isDbConnectEnabled",
            "initScriptWorks",
        ]);

        this.disposables.push(
            this.featureManager.onDidChangeState(
                "debugging.dbconnect",
                this.isDbConnectEnabled,
                this
            ),
            this.pythonExtension.onDidChangePythonExecutable(
                this.isPythonSdkInstalled,
                this
            ),
            workspace.onDidOpenNotebookDocument(() => {
                this.check();
            }),
            window.onDidChangeActiveNotebookEditor((activeNotebook) => {
                if (activeNotebook) {
                    this.check();
                }
            }),
            window.onDidChangeActiveTextEditor(async (activeTextEditor) => {
                if (activeTextEditor?.document.languageId !== "python") {
                    return;
                }
                const localUri = new LocalUri(activeTextEditor?.document.uri);
                if (await FileUtils.isNotebook(localUri)) {
                    this.check();
                }
            }),
            this.outputWindow
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

    @withLogContext(Loggers.Extension)
    async initScriptWorks(@context ctx?: Context) {
        await this.waitForStep("isPythonSdkInstalled");
        await this.waitForStep("isDbConnectEnabled");

        await this.initScriptWorksMutex.wait();
        try {
            const executable = await this.pythonExtension.getPythonExecutable();
            if (!executable) {
                return this.rejectStep(
                    "initScriptWorks",
                    "Python executable not found"
                );
            }

            if (
                !(await this.pythonExtension.findPackageInEnvironment(
                    "ipython"
                ))
            ) {
                return this.rejectStep(
                    "initScriptWorks",
                    "IPython is not installed in the current environment"
                );
            }

            let someScriptFailed = false;

            for (const fileBaseName of await this.notebookInitScriptManager
                .sourceFiles) {
                const file = path.join(
                    this.notebookInitScriptManager.startupDir,
                    fileBaseName
                );
                const {stderr} = await execFile(
                    executable,
                    ["-m", "IPython", file],
                    {
                        shell: false,
                        env: {
                            ...((await this.databricksEnvFileManager.getDatabrickseEnvVars()) ??
                                {}),
                            ...((await this.databricksEnvFileManager.getIdeEnvVars()) ??
                                {}),
                            ...((await this.databricksEnvFileManager.getUserEnvVars()) ??
                                {}),
                        },
                    }
                );
                const correctlyFormatttedErrors = stderr
                    .split(/\r?\n/)
                    .filter((line) => line.split(":").length > 2);
                if (correctlyFormatttedErrors.length > 0) {
                    someScriptFailed = true;
                    this.outputWindow.appendLine("=".repeat(30));
                    this.outputWindow.appendLine(`Errors in ${file}:`);
                    this.outputWindow.appendLine(" ");
                }
                correctlyFormatttedErrors.forEach((line) => {
                    const parts = line.split(":");
                    const [funcName, errorType, ...rest] = parts;
                    this.outputWindow.appendLine(
                        `${funcName} - ${errorType}: ${rest.join(":")}`
                    );
                });

                if (stderr.length > 0) {
                    ctx?.logger?.error("Notebook Init Script Error", {
                        stderr: stderr,
                    });
                }
            }

            if (someScriptFailed) {
                this.outputWindow.appendLine("\n\n");
                return this.rejectStep(
                    "initScriptWorks",
                    "Notebook init script failed",
                    async () => {
                        window.showErrorMessage(
                            "Init script for Databricks Notebook failed. See output window for details."
                        );
                        this.outputWindow.show();
                    },
                    undefined
                );
            }
        } catch (e) {
            ctx?.logger?.error("Notebook Init Script Error", e);
            if (e instanceof Error) {
                return this.rejectStep(
                    "initScriptWorks",
                    "Unknown error when running the notebook init script. Reason: " +
                        e.message
                );
            }
        } finally {
            this.initScriptWorksMutex.signal();
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

    @withLogContext(Loggers.Extension)
    async check(@context ctx?: Context) {
        this.isPythonSdkInstalled();
        this.isDbConnectEnabled();
        this.initScriptWorks(ctx);
    }
}
