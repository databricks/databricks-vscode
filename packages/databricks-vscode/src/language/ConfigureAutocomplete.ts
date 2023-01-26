import {NamedLogger} from "@databricks/databricks-sdk/dist/logging";
import {appendFile, mkdir, readdir, readFile} from "fs/promises";
import path from "path";
import {
    ExtensionContext,
    extensions,
    Uri,
    window,
    Event,
    Disposable,
    workspace,
    ConfigurationTarget,
} from "vscode";
import {Loggers} from "../logger";

type Resource = Uri | undefined;

// Refer https://github.com/microsoft/vscode-python/blob/main/src/client/apiTypes.ts
interface IPythonExtension {
    /**
     * Return internal settings within the extension which are stored in VSCode storage
     */
    settings: {
        /**
         * An event that is emitted when execution details (for a resource) change. For instance, when interpreter configuration changes.
         */
        readonly onDidChangeExecutionDetails: Event<Uri | undefined>;
        /**
         * Returns all the details the consumer needs to execute code within the selected environment,
         * corresponding to the specified resource taking into account any workspace-specific settings
         * for the workspace to which this resource belongs.
         * @param {Resource} [resource] A resource for which the setting is asked for.
         * * When no resource is provided, the setting scoped to the first workspace folder is returned.
         * * If no folder is present, it returns the global setting.
         * @returns {({ execCommand: string[] | undefined })}
         */
        getExecutionDetails(resource?: Resource): {
            /**
             * E.g of execution commands returned could be,
             * * `['<path to the interpreter set in settings>']`
             * * `['<path to the interpreter selected by the extension when setting is not set>']`
             * * `['conda', 'run', 'python']` which is used to run from within Conda environments.
             * or something similar for some other Python environments.
             *
             * @type {(string[] | undefined)} When return value is `undefined`, it means no interpreter is set.
             * Otherwise, join the items returned using space to construct the full execution command.
             */
            execCommand: string[] | undefined;
        };
    };
}

const importString = "from databricks.sdk.runtime import *";

type StepResult = "Skip" | "Cancel" | "Error" | "Silent" | undefined;

interface Step {
    fn: (dryRun: boolean) => Promise<StepResult>;
    required?: boolean;
}

export class ConfigureAutocomplete implements Disposable {
    private disposables: Disposable[] = [];
    private _onPythonChangeEventListenerAdded = false;

    constructor(
        private readonly context: ExtensionContext,
        private readonly workspaceFolder: string
    ) {
        this.configure();
    }

    dispose() {
        this.disposables.forEach((i) => i.dispose());
    }

    private async tryStep(fn: () => Promise<StepResult>) {
        try {
            return await fn();
        } catch (e) {
            NamedLogger.getOrCreate(Loggers.Extension).error(
                "Error configuring autocomplete",
                e
            );

            if (e instanceof Error) {
                window.showErrorMessage(
                    `Error configuring autocomplete: ${e.message}`
                );
            }
            return "Error";
        }
    }

    /*
        Skip run if all the required steps return "Skip". 
    */
    private async shouldSkipRun(steps: Step[]) {
        for (const {fn, required} of steps) {
            const result = await this.tryStep(() => fn(true));
            if (result === "Error") {
                return true;
            }
            if (result !== "Skip" && required) {
                return false;
            }
        }
        return true;
    }

    async configureCommand() {
        return this.configure(true);
    }

    private async configure(force = false) {
        const pythonExtension = extensions.getExtension("ms-python.python");
        if (pythonExtension === undefined) {
            window.showWarningMessage(
                "VSCode Extension for Databricks requires Microsoft Python extension for providing autocompletion. Autocompletion will be disabled now."
            );
            return;
        }
        if (!pythonExtension.isActive) {
            await pythonExtension.activate();
        }
        /* 
            We hook into the python extension, so that whenever user changes python interpreter (or environment),
            we prompt them to go through the configuration steps again. For now this only involves installing pyspark. 
            In future, we would want them to install databricks sdk in the new environment. 
        */
        if (!this._onPythonChangeEventListenerAdded) {
            this.disposables.push(
                pythonExtension.exports.settings.onDidChangeExecutionDetails(
                    () => this.configure(true),
                    this
                )
            );
            this._onPythonChangeEventListenerAdded = true;
        }

        const steps = [
            {
                fn: async (dryRun = false) =>
                    await this.installPyspark(
                        pythonExtension.exports as IPythonExtension,
                        dryRun
                    ),
            },
            {
                fn: async () => this.updateExtraPaths(),
            },
            {
                fn: async (dryRun = false) => this.addBuiltinsFile(dryRun),
                required: true,
            },
        ];

        // Force is only set when running from command pallet and we do a fresh configure if it is set.
        if (!force && (await this.shouldSkipRun(steps))) {
            return;
        }

        const choice = await window.showInformationMessage(
            "Do you want to configure autocompletion for Databricks specific globals (dbutils etc)?",
            "Configure",
            "Cancel"
        );

        if (choice === "Cancel" || choice === undefined) {
            return;
        }

        for (const {fn} of steps) {
            const result = await this.tryStep(() => fn(false));
            if (result === "Error" || result === "Cancel") {
                return;
            }
        }
    }

    private async installPyspark(
        pythonExtension: IPythonExtension,
        dryRun = false
    ): Promise<StepResult> {
        const execCommandParts = pythonExtension.settings.getExecutionDetails(
            workspace.workspaceFolders?.[0].uri
        ).execCommand;

        if (execCommandParts === undefined) {
            return "Skip";
        }

        if (dryRun) {
            return;
        }
        const choice = await window.showInformationMessage(
            ["Install pyspark in local env?"].join("\n"),
            "Install PySpark",
            "Continue without PySpark",
            "Cancel"
        );

        if (choice === "Cancel" || choice === undefined) {
            return "Cancel";
        }
        if (choice === "Continue without PySpark") {
            return "Skip";
        }

        //TODO: Make sure that pyspark is not updated if it is already installed
        const execCommand = execCommandParts
            .concat(["-m", "pip", "install", "pyspark"])
            .join(" ");

        const terminal = window.createTerminal("pip");
        this.disposables.push(terminal);
        terminal.sendText(execCommand);
        terminal.show();
    }

    private async updateExtraPaths(): Promise<StepResult> {
        let extraPaths =
            workspace
                .getConfiguration("python")
                .get<Array<string>>("analysis.extraPaths") ?? [];
        const stubPath = this.context.asAbsolutePath(
            path.join("resources", "python", "stubs")
        );
        if (extraPaths.includes(stubPath)) {
            return;
        }
        extraPaths = extraPaths.filter(
            (value) =>
                !value.endsWith(path.join("resources", "python", "stubs")) &&
                value.includes("databricks")
        );
        extraPaths.push(stubPath);
        workspace
            .getConfiguration("python")
            .update(
                "analysis.extraPaths",
                extraPaths,
                ConfigurationTarget.Global
            );
    }

    private async addBuiltinsFile(dryRun = false): Promise<StepResult> {
        const stubPath = workspace
            .getConfiguration("python")
            .get<string>("analysis.stubPath");

        const builtinsDir = stubPath
            ? path.join(this.workspaceFolder, stubPath)
            : this.workspaceFolder;

        let builtinsFileExists = false;
        try {
            builtinsFileExists = (await readdir(builtinsDir)).includes(
                "__builtins__.pyi"
            );
        } catch (e) {}

        const builtinsPath = path.join(builtinsDir, "__builtins__.pyi");

        if (
            builtinsFileExists &&
            (await readFile(builtinsPath, "utf-8")).includes(importString)
        ) {
            return "Skip";
        }

        if (dryRun) {
            return;
        }

        const messageString = `${
            builtinsFileExists ? "Update" : "Create"
        } ${builtinsPath} ?`;
        const choice = await window.showInformationMessage(
            messageString,
            "Continue",
            "Cancel"
        );

        if (choice === "Cancel" || choice === undefined) {
            return "Cancel";
        }

        await mkdir(path.dirname(builtinsPath), {recursive: true});
        await appendFile(builtinsPath, `\n${importString}\n`);
    }
}
