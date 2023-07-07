import {
    Disposable,
    Uri,
    ExtensionContext,
    window,
    OutputChannel,
    workspace,
    ProgressLocation,
    TextEditor,
} from "vscode";
import path from "path";
import {mkdir, cp, rm, readdir} from "fs/promises";
import {glob} from "glob";
import {ConnectionManager} from "../../configuration/ConnectionManager";
import {FeatureManager} from "../../feature-manager/FeatureManager";
import {withLogContext} from "@databricks/databricks-sdk/dist/logging";
import {Loggers} from "../../logger";
import {Context, context} from "@databricks/databricks-sdk/dist/context";
import {Mutex} from "../../locking";
import {MsPythonExtensionWrapper} from "../MsPythonExtensionWrapper";
import {execFile as ef} from "child_process";
import {promisify} from "util";
import {EnvVarGenerators, FileUtils} from "../../utils";
import {workspaceConfigs} from "../../vscode-objs/WorkspaceConfigs";
import {SystemVariables} from "../../vscode-objs/SystemVariables";
import {LocalUri} from "../../sync/SyncDestination";
const execFile = promisify(ef);

async function isDbnbTextEditor(editor?: TextEditor) {
    return (
        editor?.document.languageId === "python" &&
        (await FileUtils.isNotebook(new LocalUri(editor.document.uri))) ===
            "PY_DBNB"
    );
}

export class NotebookInitScriptManager implements Disposable {
    private disposables: Disposable[] = [];
    private readonly verifyInitScriptMutex: Mutex = new Mutex();
    private readonly verificationErrorMessageMutex: Mutex = new Mutex();
    readonly outputWindow: OutputChannel = window.createOutputChannel(
        "Databricks Notebooks"
    );
    private initScriptSuccessfullyVerified = false;
    // current env can be undefined when no python interpreter is selected,
    // so we have an additional null state to represent the case when we have
    // not yet seen a python interpreter
    private currentEnvPath?: string | null = null;

    constructor(
        private readonly workspacePath: Uri,
        private readonly extensionContext: ExtensionContext,
        private readonly connectionManager: ConnectionManager,
        private readonly featureManager: FeatureManager,
        private readonly pythonExtension: MsPythonExtensionWrapper
    ) {
        this.disposables.push(
            this.outputWindow,
            this.connectionManager.onDidChangeState(async (e) => {
                if (e !== "CONNECTED" || (await this.isKnowEnvironment())) {
                    return;
                }
                this.initScriptSuccessfullyVerified = false;
                this.verifyInitScript();
            }),
            this.pythonExtension.onDidChangePythonExecutable(() => {
                this.initScriptSuccessfullyVerified = false;
                this.verifyInitScript();
            }),
            this.featureManager.onDidChangeState("notebooks.dbconnect", () => {
                this.initScriptSuccessfullyVerified = false;
                this.verifyInitScript();
            }),
            workspace.onDidOpenNotebookDocument(async () => {
                if (await this.isKnowEnvironment()) {
                    return;
                }
                this.verifyInitScript();
            }),
            window.onDidChangeActiveNotebookEditor(async (activeNotebook) => {
                if ((await this.isKnowEnvironment()) || !activeNotebook) {
                    return;
                }
                this.verifyInitScript();
            }),
            window.onDidChangeActiveTextEditor(async (activeTextEditor) => {
                if (
                    activeTextEditor?.document.languageId !== "python" ||
                    (await this.isKnowEnvironment())
                ) {
                    return;
                }
                const localUri = new LocalUri(activeTextEditor?.document.uri);
                if (await FileUtils.isNotebook(localUri)) {
                    this.verifyInitScript();
                }
            })
        );
    }

    get ipythonDir(): string {
        return path.join(this.workspacePath.fsPath, ".databricks", "ipython");
    }

    get startupDir(): string {
        return path.join(this.ipythonDir, "profile_default", "startup");
    }

    get generatedDir(): string {
        return this.extensionContext.asAbsolutePath(
            path.join(
                "resources",
                "python",
                "generated",
                "databricks-init-scripts"
            )
        );
    }

    get sourceFiles(): Promise<string[]> {
        return readdir(this.generatedDir);
    }

    async isKnowEnvironment() {
        return (
            this.currentEnvPath ===
            (await this.pythonExtension.getPythonExecutable())
        );
    }

    private async copyInitScript() {
        await mkdir(this.startupDir, {recursive: true});
        const filesInDest = await readdir(this.startupDir);
        for (const file of await this.sourceFiles) {
            if (!filesInDest.includes(file)) {
                await cp(
                    path.join(this.generatedDir, file),
                    path.join(this.startupDir, file)
                );
            }
        }
    }

    private async deleteOutdatedInitScripts() {
        const startupDir = path.join(
            this.ipythonDir,
            "profile_default",
            "startup"
        );

        const sourceFiles = await this.sourceFiles;
        for (const file of await glob(
            path.join(startupDir, "00-databricks-init-*.py")
        )) {
            if (!sourceFiles.includes(path.basename(file))) {
                await rm(file);
            }
        }
    }

    async updateInitScript() {
        if (
            !(await this.featureManager.isEnabled("notebooks.dbconnect"))
                .avaliable
        ) {
            return;
        }
        await this.connectionManager.waitForConnect();
        await this.deleteOutdatedInitScripts();
        await this.copyInitScript();
    }

    private async getUserEnvVars() {
        if (workspaceConfigs.userEnvFile === undefined) {
            return;
        }
        const userEnvFile = new SystemVariables(this.workspacePath).resolve(
            workspaceConfigs.userEnvFile
        );
        return EnvVarGenerators.getUserEnvVars(Uri.file(userEnvFile));
    }

    private async showVerificationFailMessage() {
        if (this.verificationErrorMessageMutex.locked) {
            return;
        }
        await this.verificationErrorMessageMutex.wait();
        try {
            const choice = await window.showErrorMessage(
                "There were errors when running the notebook init script. " +
                    "See the Databricks Notebook output window for more details.",
                "Open Output Window"
            );
            if (choice === "Open Output Window") {
                this.outputWindow.show();
            }
        } finally {
            this.verificationErrorMessageMutex.signal();
        }
    }

    async verifyInitScriptCommand() {
        this.currentEnvPath = null;
        this.verifyInitScript();
    }

    @withLogContext(Loggers.Extension)
    private async verifyInitScript(@context ctx?: Context) {
        // If we are not in a jupyter notebook or a databricks notebook,
        // then we don't need to verify the init script
        if (
            !isDbnbTextEditor(window.activeTextEditor) &&
            window.activeNotebookEditor === undefined
        ) {
            return;
        }

        await FileUtils.waitForDatabricksProject(
            this.workspacePath,
            this.connectionManager
        );

        if (
            !(await this.featureManager.isEnabled("notebooks.dbconnect"))
                .avaliable
        ) {
            return;
        }

        await this.verifyInitScriptMutex.wait();
        try {
            if (this.initScriptSuccessfullyVerified) {
                return true;
            }
            const executable = await this.pythonExtension.getPythonExecutable();
            if (this.currentEnvPath === executable) {
                // We do not want to keep rerunning the init script verification
                // for the same python environment. We need to give users time to
                // fix the issue before we try again. The retry only happens when
                // users explicitly run the "Verify Init Script" command
                this.showVerificationFailMessage();
                return;
            }
            this.currentEnvPath = executable;
            if (!executable) {
                window
                    .showErrorMessage(
                        "Cannot verify databricks notebook init script. No python interpretter selected.",
                        "Select Python Interpretter"
                    )
                    .then((choice) => {
                        if (choice === "Select Python Interpretter") {
                            this.pythonExtension.selectPythonInterpreter();
                        }
                    });
                return;
            }

            if (
                !(await this.pythonExtension.findPackageInEnvironment(
                    "ipython"
                ))
            ) {
                window
                    .showErrorMessage(
                        `Cannot verify databricks notebook init script. IPython is not installed in the current environment: ${
                            (await this.pythonExtension.pythonEnvironment)
                                ?.environment?.name
                        }`,
                        "Install and try again",
                        "Change environment"
                    )
                    .then((choice) => {
                        switch (choice) {
                            case "Install and try again":
                                this.pythonExtension
                                    .installPackageInEnvironment("ipython")
                                    .then(() => {
                                        this.verifyInitScript();
                                    });
                                return;
                            case "Change environment":
                                this.pythonExtension.selectPythonInterpreter();
                                return;
                        }
                    });
            }

            await this.updateInitScript();
            this.initScriptSuccessfullyVerified = await window.withProgress(
                {location: ProgressLocation.Notification},
                async (progress) => {
                    progress.report({
                        message:
                            "Verifying databricks notebook init scripts...",
                    });
                    let someScriptFailed = false;
                    for (const fileBaseName of await this.sourceFiles) {
                        const file = path.join(this.startupDir, fileBaseName);
                        const env = {
                            ...((await EnvVarGenerators.getDatabrickseEnvVars(
                                this.connectionManager,
                                this.workspacePath
                            )) ?? {}),
                            ...((await EnvVarGenerators.getIdeEnvVars()) ?? {}),
                            ...((await this.getUserEnvVars()) ?? {}),
                        };
                        const {stderr} = await execFile(
                            executable,
                            ["-m", "IPython", file],
                            {
                                //required for azure-cli auth to work
                                //TODO: remove this when using metadata-service-auth
                                shell: true,
                                env,
                            }
                        );
                        const correctlyFormatttedErrors = stderr
                            .split(/\r?\n/)
                            .filter((line) => line.split(":").length > 2);
                        if (correctlyFormatttedErrors.length > 0) {
                            someScriptFailed = true;
                            this.outputWindow.appendLine("=".repeat(30));
                            this.outputWindow.appendLine(
                                `Errors in ${path.basename(file)}:`
                            );
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
                        this.showVerificationFailMessage();
                        return false;
                    }
                    window.showInformationMessage(
                        "Successfully verified Databricks notebook init scripts"
                    );
                    return true;
                }
            );
        } catch (e) {
            ctx?.logger?.error("Notebook Init Script Error", e);
        } finally {
            this.verifyInitScriptMutex.signal();
        }
    }

    dispose() {
        this.disposables.forEach((i) => i.dispose());
    }
}
