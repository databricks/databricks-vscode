import {Uri, FileSystemWatcher, workspace, window} from "vscode";
import {BaseModelWithStateCache} from "../../configuration/models/BaseModelWithStateCache";
import {ConfigModel} from "../../configuration/models/ConfigModel";
import {Mutex} from "../../locking";
import {BundleSchema} from "../types";
import {readFile} from "fs/promises";
import {NamedLogger} from "@databricks/databricks-sdk/dist/logging";
import {Loggers} from "../../logger";
import {onError} from "../../utils/onErrorDecorator";
import {BundleValidateModel} from "./BundleValidateModel";
import {WorkspaceFolderManager} from "../../vscode-objs/WorkspaceFolderManager";

export type BundleVariable = Required<BundleSchema>["variables"][string] & {
    valueInTarget?: string;
    vscodeOverrideValue?: string;
};

export type BundleVariableModelState = {
    variables?: Record<string, BundleVariable>;
};

export class BundleVariableModel extends BaseModelWithStateCache<BundleVariableModelState> {
    protected mutex: Mutex = new Mutex();
    private target: string | undefined;
    private overrideFileWatcher: FileSystemWatcher | undefined;

    get projectRoot() {
        return this.workspaceFolderManager.activeProjectUri;
    }

    constructor(
        private readonly configModel: ConfigModel,
        private readonly bundleValidateModel: BundleValidateModel,
        private readonly workspaceFolderManager: WorkspaceFolderManager
    ) {
        super();
        this.disposables.push(
            this.configModel.onDidChangeKey("validateConfig")(async () => {
                await this.stateCache.refresh();
            }),
            this.configModel.onDidChangeKey("preValidateConfig")(async () => {
                await this.stateCache.refresh();
            }),
            this.configModel.onDidChangeTarget(async () => {
                this.setTarget(this.configModel.target);
            }),
            this.onDidChangeKey("variables")(async () => {
                await this.writeFile();
            })
        );
    }

    public async writeFile() {
        if (this.bundleVariableFilePath === undefined) {
            return;
        }

        await workspace.fs.writeFile(
            this.bundleVariableFilePath,
            Buffer.from(await this.getFileContent(), "utf8")
        );
    }
    public resetCache(): void {
        this.stateCache.set({variables: {}});
    }
    setTarget(target: string | undefined) {
        if (this.target === target) {
            return;
        }

        this.target = target;
        this.resetCache();

        if (this.target === undefined) {
            this.overrideFileWatcher?.dispose();
            this.overrideFileWatcher = undefined;
            return;
        }

        this.overrideFileWatcher = workspace.createFileSystemWatcher(
            this.bundleVariableFilePath!.fsPath
        );

        this.disposables.push(
            this.overrideFileWatcher,
            this.overrideFileWatcher.onDidChange(async () => {
                await this.bundleValidateModel.refresh();
                await this.stateCache.refresh();
            }),
            this.overrideFileWatcher.onDidCreate(async () => {
                await this.bundleValidateModel.refresh();
                await this.stateCache.refresh();
            }),
            this.overrideFileWatcher.onDidDelete(async () => {
                await this.bundleValidateModel.refresh();
                await this.stateCache.refresh();
            })
        );
    }

    get bundleVariableFilePath() {
        const target = this.configModel.target;
        if (target === undefined) {
            return undefined;
        }

        return Uri.joinPath(
            this.projectRoot,
            ".databricks",
            "bundle",
            target,
            "vscode.bundlevars.json"
        ).with({scheme: "file"});
    }

    private async getVariableOverrides(): Promise<
        Record<string, string | undefined>
    > {
        if (this.bundleVariableFilePath === undefined) {
            return {};
        }

        try {
            const rawData: Record<string, string> = JSON.parse(
                await readFile(this.bundleVariableFilePath.fsPath, "utf-8")
            );

            return Object.fromEntries(
                Object.entries(rawData)
                    .map(([key, value]) => {
                        if (value.length === 0) {
                            return [key, undefined];
                        }
                        return [key, value];
                    })
                    .filter((v) => v[1] !== undefined)
            );
        } catch (e: any) {
            NamedLogger.getOrCreate(Loggers.Extension).debug(
                "No bundle variable overrides found.",
                e
            );
            return {};
        }
    }

    protected async readState(): Promise<BundleVariableModelState> {
        const preValidateConfig =
            await this.configModel.get("preValidateConfig");

        // If no global variables are defined, return an empty map
        if (preValidateConfig === undefined) {
            return {};
        }

        const globalVariableDefinitions =
            preValidateConfig.preValidateBundleSchema?.variables ?? {};
        const inTargetVariables = preValidateConfig.variables ?? {};
        const overrides = await this.getVariableOverrides();
        const inTargetPostValidateVariables =
            (await this.configModel.get("validateConfig"))?.variables ?? {};

        const variables: Record<string, BundleVariable> = {};

        for (const key of Object.keys(globalVariableDefinitions)) {
            let definition = globalVariableDefinitions[key];
            if (typeof definition === "string") {
                definition = {default: definition};
            }
            const inTargetVariable = inTargetVariables[key];

            // We check heuristically if the vairable is required, because bundle validate does not work if
            // a required variable is not set.
            const isRequired =
                (inTargetVariable ??
                    definition.lookup ??
                    definition.default) === undefined;

            variables[key] = {
                ...definition,
                lookup:
                    typeof inTargetVariable?.lookup === "object"
                        ? inTargetVariable.lookup
                        : definition.lookup,

                // If the value is not required based on our heuristic check, we use the value from the validate
                // command.
                valueInTarget:
                    typeof inTargetVariable === "string"
                        ? inTargetVariable
                        : isRequired
                          ? undefined
                          : inTargetPostValidateVariables[key]?.value ??
                            definition.default,
                vscodeOverrideValue: overrides[key],
            };
        }

        return {variables: variables};
    }

    async getEnvVariables(): Promise<Record<string, string>> {
        const overrides = await this.getVariableOverrides();
        return Object.fromEntries(
            Object.entries(overrides)
                .filter(([key]) => overrides[key] !== undefined)
                .map(([key, value]) => [`BUNDLE_VAR_${key}`, value])
        ) as Record<string, string>;
    }

    async getFileContent() {
        const variables = await this.getVariableOverrides();
        return JSON.stringify(
            Object.fromEntries(
                Object.entries(variables)
                    .filter((v) => v[1] !== undefined)
                    .map(([key, value]) => [key, value ?? ""])
            ),
            null,
            4
        );
    }

    async openBundleVariableFile() {
        if (this.bundleVariableFilePath === undefined) {
            window.showErrorMessage(
                "Unable to open bundle variable file. No target selected."
            );
            return;
        }

        await this.writeFile();
        const doc = await workspace.openTextDocument(
            this.bundleVariableFilePath
        );
        await window.showTextDocument(doc);
    }

    @onError({
        log: true,
        popup: {prefix: "Error deleting bundle variable file."},
    })
    async deleteBundleVariableFile() {
        if (this.bundleVariableFilePath === undefined) {
            return;
        }

        try {
            await workspace.fs.delete(this.bundleVariableFilePath);
        } catch (e: any) {
            if (e.code !== "ENOENT" && e.code !== "FileNotFound") {
                throw e;
            }
        }
    }
}
