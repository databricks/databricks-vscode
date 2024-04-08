import {
    ChildProcessWithoutNullStreams,
    SpawnOptionsWithoutStdio,
    execFile as execFileCb,
    spawn,
} from "child_process";
import {ExtensionContext, window, Uri, commands} from "vscode";
import {SyncDestinationMapper} from "../sync/SyncDestination";
import {workspaceConfigs} from "../vscode-objs/WorkspaceConfigs";
import {promisify} from "node:util";
import {logging} from "@databricks/databricks-sdk";
import {LoggerManager, Loggers} from "../logger";
import {Context, context} from "@databricks/databricks-sdk/dist/context";
import {Cloud} from "../utils/constants";
import {EnvVarGenerators, FileUtils, UrlUtils} from "../utils";
import {AuthProvider} from "../configuration/auth/AuthProvider";
import {removeUndefinedKeys} from "../utils/envVarGenerators";
import {quote} from "shell-quote";
import {MsPythonExtensionWrapper} from "../language/MsPythonExtensionWrapper";
import path from "path";

const withLogContext = logging.withLogContext;
const execFile = promisify(execFileCb);

export interface Command {
    command: string;
    args: string[];
}

export interface ConfigEntry {
    name: string;
    host?: URL;
    accountId?: string;
    cloud: Cloud;
    authType: string;
    valid: boolean;
}

export type SyncType = "full" | "incremental";
export class ProcessError extends Error {
    constructor(
        message: string,
        public code: number | null
    ) {
        super(message);
    }

    showErrorMessage(prefix?: string) {
        window
            .showErrorMessage(
                (prefix?.trimEnd().concat(" ") ?? "") +
                    `Error executing Databricks CLI command.`,
                "Show Logs"
            )
            .then((choice) => {
                if (choice === "Show Logs") {
                    commands.executeCommand("databricks.bundle.showLogs");
                }
            });
    }
}

async function waitForProcess(
    p: ChildProcessWithoutNullStreams,
    onStdOut?: (data: string) => void,
    onStdError?: (data: string) => void
) {
    const output: string[] = [];
    p.stdout.on("data", (data) => {
        output.push(data.toString());
        if (onStdOut) {
            onStdOut(data.toString());
        }
    });

    const stderr: string[] = [];
    p.stderr.on("data", (data) => {
        stderr.push(data.toString());
        output.push(data.toString());
        if (onStdError) {
            onStdError(data.toString());
        }
    });

    await new Promise((resolve, reject) => {
        p.on("close", (code) => {
            if (code === 0) {
                resolve(output.join(""));
            } else {
                reject(new ProcessError(stderr.join("\n"), code));
            }
        });
        p.on("error", (e) => new ProcessError(e.message, null));
    });

    return output.join("");
}
/**
 * Entrypoint for all wrapped CLI commands
 *
 * Righ now this is a placeholder for a future implementation
 * of the databricks CLI
 */
export class CliWrapper {
    private clusterId?: string;

    constructor(
        private extensionContext: ExtensionContext,
        private loggerManager: LoggerManager,
        private logFilePath?: string
    ) {}

    public setClusterId(clusterId?: string) {
        this.clusterId = clusterId;
    }

    get cliPath(): string {
        return this.extensionContext.asAbsolutePath("./bin/databricks");
    }

    getLoggingArguments(): string[] {
        if (!workspaceConfigs.loggingEnabled) {
            return [];
        }
        return [
            "--log-level",
            "debug",
            "--log-file",
            this.logFilePath ?? "stderr",
            "--log-format",
            "json",
        ];
    }

    getLogginEnvVars(): Record<string, string> {
        if (!workspaceConfigs.loggingEnabled) {
            return {};
        }
        return {
            /* eslint-disable @typescript-eslint/naming-convention */
            DATABRICKS_LOG_LEVEL: "debug",
            DATABRICKS_LOG_FILE: this.logFilePath ?? "stderr",
            DATABRICKS_LOG_FORMAT: "json",
            /* eslint-enable @typescript-eslint/naming-convention */
        };
    }

    escapePathArgument(arg: string): string {
        return `"${arg.replaceAll('"', '\\"')}"`;
    }

    /**
     * Constructs the databricks sync command
     */
    getSyncCommand(
        syncDestination: SyncDestinationMapper,
        syncType: SyncType
    ): Command {
        const args = [
            "sync",
            ".",
            syncDestination.remoteUri.path,
            "--watch",
            "--output",
            "json",
            ...this.getLoggingArguments(),
        ];
        if (syncType === "full") {
            args.push("--full");
        }
        return {command: this.cliPath, args};
    }

    private getListProfilesCommand(): Command {
        return {
            command: this.cliPath,
            args: [
                "auth",
                "profiles",
                "--skip-validate",
                ...this.getLoggingArguments(),
            ],
        };
    }

    @withLogContext(Loggers.Extension)
    public async listProfiles(
        configfilePath?: string,
        @context ctx?: Context
    ): Promise<Array<ConfigEntry>> {
        const cmd = this.getListProfilesCommand();

        let res;
        try {
            res = await execFile(cmd.command, cmd.args, {
                env: {
                    ...EnvVarGenerators.getEnvVarsForCli(
                        this.extensionContext,
                        configfilePath
                    ),
                    ...EnvVarGenerators.getProxyEnvVars(),
                },
            });
        } catch (e) {
            let msg = "Failed to load Databricks Config File";
            if (e instanceof Error) {
                if (e.message.includes("cannot parse config file")) {
                    msg =
                        "Failed to parse Databricks Config File, please make sure it's in the correct ini format";
                } else if (e.message.includes("spawn UNKNOWN")) {
                    msg = `Failed to parse Databricks Config File using databricks CLI, please make sure you have permissions to execute this binary: "${this.cliPath}"`;
                }
            }
            ctx?.logger?.error(msg, e);
            window
                .showWarningMessage(msg, "Open Databricks Config File")
                .then(async (choice) => {
                    if (choice === "Open Databricks Config File") {
                        await FileUtils.openDatabricksConfigFile();
                    }
                });
            return [];
        }

        let profiles = JSON.parse(res.stdout).profiles || [];

        // filter out account profiles
        profiles = profiles.filter((p: any) => !p.account_id);

        const result = [];
        let hasError = false;
        for (const profile of profiles) {
            try {
                result.push({
                    name: profile.name,
                    host: UrlUtils.normalizeHost(profile.host),
                    accountId: profile.account_id,
                    cloud: profile.cloud,
                    authType: profile.auth_type,
                    valid: profile.valid,
                });
            } catch (e: unknown) {
                let msg: string;
                if (e instanceof TypeError) {
                    msg = `Can't parse host for profile ${profile.name}`;
                } else {
                    msg = `Error parsing profile ${profile.name}`;
                }
                ctx?.logger?.error(msg, e);
                hasError = true;
            }
        }

        if (hasError) {
            window
                .showWarningMessage(
                    "There were errors in parsing some profiles",
                    "Open Databricks Config File",
                    "Show Error Logs"
                )
                .then(async (choice) => {
                    if (choice === "Open Databricks Config File") {
                        await FileUtils.openDatabricksConfigFile();
                    }
                    if (choice === "Show Error Logs") {
                        this.loggerManager.showOutputChannel("Databricks Logs");
                    }
                });
        }
        return result;
    }

    public async getBundleSchema(): Promise<string> {
        const {stdout} = await execFile(this.cliPath, [
            "bundle",
            "schema",
            ...this.getLoggingArguments(),
        ]);
        return stdout;
    }

    async bundleValidate(
        target: string,
        authProvider: AuthProvider,
        workspaceFolder: Uri,
        configfilePath?: string,
        logger?: logging.NamedLogger
    ) {
        const cmd = [this.cliPath, "bundle", "validate", "--target", target];

        logger?.info(
            `Reading local bundle configuration for target ${target}...`,
            {bundleOpName: "validate"}
        );
        logger?.debug(quote(cmd));

        try {
            const {stdout, stderr} = await execFile(cmd[0], cmd.slice(1), {
                cwd: workspaceFolder.fsPath,
                env: {
                    ...EnvVarGenerators.getEnvVarsForCli(
                        this.extensionContext,
                        configfilePath
                    ),
                    ...EnvVarGenerators.getProxyEnvVars(),
                    ...authProvider.toEnv(),
                    ...this.getLogginEnvVars(),
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    DATABRICKS_CLUSTER_ID: this.clusterId,
                },
                shell: true,
            });
            logger?.info("Finished reading local bundle configuration.", {
                bundleOpName: "validate",
            });
            logger?.debug(stdout + stderr);
            return stdout;
        } catch (e: any) {
            logger?.error(
                `Failed to read local bundle configuration. ${e.message ?? ""}`,
                {
                    ...e,
                    bundleOpName: "validate",
                }
            );
            throw new ProcessError(e.message, e.code);
        }
    }

    async bundleSummarise(
        target: string,
        authProvider: AuthProvider,
        workspaceFolder: Uri,
        configfilePath?: string,
        logger?: logging.NamedLogger
    ) {
        const cmd = [this.cliPath, "bundle", "summary", "--target", target];

        logger?.info(
            `Refreshing bundle configuration for target ${target}...`,
            {bundleOpName: "summarize"}
        );
        logger?.debug(quote(cmd));

        try {
            const {stdout, stderr} = await execFile(cmd[0], cmd.slice(1), {
                cwd: workspaceFolder.fsPath,
                env: {
                    ...EnvVarGenerators.getEnvVarsForCli(
                        this.extensionContext,
                        configfilePath
                    ),
                    ...EnvVarGenerators.getProxyEnvVars(),
                    ...authProvider.toEnv(),
                    ...this.getLogginEnvVars(),
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    DATABRICKS_CLUSTER_ID: this.clusterId,
                },
                shell: true,
            });
            logger?.info("Bundle configuration refreshed.", {
                bundleOpName: "summarize",
            });
            logger?.debug(stdout + stderr);
            return stdout;
        } catch (e: any) {
            logger?.error(
                `Failed to refresh bundle configuration. ${e.message ?? ""}`,
                {
                    ...e,
                    bundleOpName: "summarize",
                }
            );
            throw new ProcessError(e.message, e.code);
        }
    }

    getBundleInitEnvVars(authProvider: AuthProvider) {
        return removeUndefinedKeys({
            ...EnvVarGenerators.getEnvVarsForCli(
                this.extensionContext,
                workspaceConfigs.databrickscfgLocation
            ),
            ...EnvVarGenerators.getProxyEnvVars(),
            ...this.getLogginEnvVars(),
            ...authProvider.toEnv(),
            // eslint-disable-next-line @typescript-eslint/naming-convention
            DATABRICKS_OUTPUT_FORMAT: "text",
        });
    }

    async bundleInit(
        templateDirPath: string,
        outputDirPath: string,
        initConfigFilePath: string,
        authProvider: AuthProvider
    ) {
        return await execFile(
            this.cliPath,
            [
                "bundle",
                "init",
                templateDirPath,
                "--output-dir",
                outputDirPath,
                "--config-file",
                initConfigFilePath,
            ],
            {env: this.getBundleInitEnvVars(authProvider)}
        );
    }

    async bundleDeploy(
        target: string,
        authProvider: AuthProvider,
        workspaceFolder: Uri,
        pythonExtension: MsPythonExtensionWrapper,
        configfilePath?: string,
        logger?: logging.NamedLogger
    ) {
        const cmd = [this.cliPath, "bundle", "deploy", "--target", target];

        await commands.executeCommand("databricks.bundle.showLogs");
        logger?.info(`Deploying the bundle for target ${target}...`, {
            bundleOpName: "deploy",
        });
        if (this.clusterId) {
            logger?.info(`DATABRICKS_CLUSTER_ID=${this.clusterId}`, {
                bundleOpName: "deploy",
            });
        }
        logger?.info(quote(cmd), {
            bundleOpName: "deploy",
        });

        // Add python executable to PATH
        const executable = await pythonExtension.getPythonExecutable();
        const cliEnvVars = EnvVarGenerators.getEnvVarsForCli(
            this.extensionContext,
            configfilePath
        );
        let shellPath = cliEnvVars.PATH;
        if (executable) {
            shellPath = `${path.dirname(executable)}${
                path.delimiter
            }${shellPath}`;
        }
        const p = spawn(cmd[0], cmd.slice(1), {
            cwd: workspaceFolder.fsPath,
            env: {
                ...cliEnvVars,
                ...EnvVarGenerators.getProxyEnvVars(),
                ...authProvider.toEnv(),
                ...this.getLogginEnvVars(),
                /* eslint-disable @typescript-eslint/naming-convention */
                PATH: shellPath,
                DATABRICKS_CLUSTER_ID: this.clusterId,
                /* eslint-enable @typescript-eslint/naming-convention */
            },
            shell: true,
        });

        try {
            const output = await waitForProcess(
                p,
                (message) => {
                    logger?.info(message, {
                        outputStream: "stdout",
                        bundleOpName: "deploy",
                    });
                },
                (message) => {
                    logger?.info(message, {
                        outputStream: "stderr",
                        bundleOpName: "deploy",
                    });
                }
            );
            logger?.info("Bundle deployed successfully", {
                bundleOpName: "deploy",
            });
            logger?.debug(output, {
                bundleOpName: "deploy",
            });
            return output;
        } catch (e: any) {
            logger?.error("Failed to deploy the bundle", {
                ...e,
                bundleOpName: "deploy",
            });
            throw e;
        }
    }

    getBundleRunCommand(
        target: string,
        authProvider: AuthProvider,
        resourceKey: string,
        workspaceFolder: Uri,
        configfilePath?: string
    ): {
        cmd: string;
        args: string[];
        options: SpawnOptionsWithoutStdio;
    } {
        const env: Record<string, string> = removeUndefinedKeys({
            ...EnvVarGenerators.getEnvVarsForCli(
                this.extensionContext,
                configfilePath
            ),
            ...EnvVarGenerators.getProxyEnvVars(),
            ...authProvider.toEnv(),
            ...this.getLogginEnvVars(),
            // eslint-disable-next-line @typescript-eslint/naming-convention
            DATABRICKS_CLUSTER_ID: this.clusterId,
        });

        return {
            cmd: this.cliPath,
            args: ["bundle", "run", "--target", target, resourceKey],
            options: {
                cwd: workspaceFolder.fsPath,
                env,
                shell: true,
            },
        };
    }
}
