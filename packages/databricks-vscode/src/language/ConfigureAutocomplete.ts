import {NamedLogger} from "@databricks/databricks-sdk/dist/logging";
import {appendFile, mkdir, readdir, readFile} from "fs/promises";
import path from "path";
import {
    ExtensionContext,
    window,
    Disposable,
    workspace,
    ConfigurationTarget,
} from "vscode";
import {Loggers} from "../logger";
import {WorkspaceStateManager} from "../vscode-objs/WorkspaceState";
import {MsPythonExtensionWrapper} from "./MsPythonExtensionWrapper";
import {DbConnectAccessVerifier} from "./DbConnectAccessVerifier";
import {DbConnectInstallPrompt} from "./DbConnectInstallPrompt";

const importString = "from databricks.sdk.runtime import *";

type StepResult = "Skip" | "Cancel" | "Error" | "Silent" | undefined;

interface Step {
    fn: (dryRun: boolean) => Promise<StepResult>;
    required?: boolean;
}

export class ConfigureAutocomplete implements Disposable {
    private disposables: Disposable[] = [];

    constructor(
        private readonly context: ExtensionContext,
        private readonly workspaceState: WorkspaceStateManager,
        private readonly workspaceFolder: string,
        private readonly pythonExtension: MsPythonExtensionWrapper,
        private readonly dbConnectInstallPrompt: DbConnectInstallPrompt
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
        this.workspaceState.skipAutocompleteConfigure = false;
        return this.configure(true);
    }

    private async configure(force = false) {
        if (!force || this.workspaceState.skipAutocompleteConfigure) {
            return;
        }

        const steps = [
            {
                fn: async (dryRun = false) => await this.installPyspark(dryRun),
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
            "Cancel",
            "Never for this workspace"
        );

        if (choice === "Cancel" || choice === undefined) {
            return;
        }

        if (choice === "Never for this workspace") {
            this.workspaceState.skipAutocompleteConfigure = true;
            return;
        }

        for (const {fn} of steps) {
            const result = await this.tryStep(() => fn(false));
            if (result === "Error" || result === "Cancel") {
                return;
            }
        }
    }

    private async installPyspark(dryRun = false): Promise<StepResult> {
        const executable = await this.pythonExtension.getPythonExecutable();

        if (executable === undefined) {
            return "Skip";
        }

        if (dryRun) {
            return;
        }
        this.dbConnectInstallPrompt.show(true);
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
