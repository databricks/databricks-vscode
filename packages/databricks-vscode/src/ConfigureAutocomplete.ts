import path from "path";
import {
    ExtensionContext,
    extensions,
    Uri,
    window,
    Event,
    Disposable,
    workspace,
    ProgressLocation,
    ConfigurationTarget,
} from "vscode";

export type Resource = Uri | undefined;

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

export class ConfigureAutocomplete implements Disposable {
    private disposables: Disposable[] = [];
    constructor(readonly context: ExtensionContext) {}

    dispose() {
        this.disposables.forEach((i) => i.dispose());
    }
    async configureAutocomplete() {
        const pythonExtension = extensions.getExtension("ms-python.python");
        if (pythonExtension === undefined) {
            window.showWarningMessage(
                "VSCode Extension for Databricks requires Microsoft Python extension for providing autocompletion. Autocompletion will be disabled now."
            );
            return;
        }
        if (!pythonExtension.isActive) {
            await pythonExtension.activate();
            this.disposables.push(
                pythonExtension.exports.settings.onDidChangeExecutionDetails(
                    this.configureAutocomplete
                )
            );
        }

        const pythonExtensionExports =
            pythonExtension.exports as IPythonExtension;

        const choice = await window.showInformationMessage(
            [
                "To allow autocompletion for Databricks specific globals (like dbutils), we need to",
                "1. install pyspark",
                "2. add (or modify) __builtins__.pyi file to your project",
            ].join("\n"),
            "Continue",
            "Cancel"
        );

        if (choice === "Cancel" || choice === undefined) {
            return;
        }

        const steps = [
            async () =>
                await this.installPyspark(
                    pythonExtension.exports as IPythonExtension
                ),
            this.updateExtraPaths,
        ];

        for (const step of steps) {
            if ((await step()) === "Cancel") {
                return;
            }
        }
    }

    async installPyspark(pythonExtension: IPythonExtension) {
        const execCommandParts = pythonExtension.settings.getExecutionDetails(
            workspace.workspaceFolders?.[0].uri
        ).execCommand;

        if (execCommandParts === undefined) {
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

    async updateExtraPaths() {
        const extraPaths =
            workspace
                .getConfiguration("python")
                .get<Array<string>>("analysis.extraPaths") ?? [];
        const stubPath = this.context.asAbsolutePath(
            path.join("python", "stubs")
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

    async addBuiltinsFile() {
        const choice = await window.showInformationMessage(
            `Install pyspark in local env?`,
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
    }
}
