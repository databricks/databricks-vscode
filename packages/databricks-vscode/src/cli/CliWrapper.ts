import {
    ChildProcessWithoutNullStreams,
    SpawnOptionsWithoutStdio,
    execFile as execFileCb,
    spawn,
} from "child_process";
import {
    ExtensionContext,
    window,
    Uri,
    commands,
    CancellationToken,
} from "vscode";
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
import {BundleVariableModel} from "../bundle/models/BundleVariableModel";
import {MsPythonExtensionWrapper} from "../language/MsPythonExtensionWrapper";
import path from "path";
import {isPowershell} from "../utils/shellUtils";

const withLogContext = logging.withLogContext;
function getEscapedCommandAndAgrs(
    cmd: string,
    args: string[],
    options: SpawnOptionsWithoutStdio
) {
    if (process.platform === "win32") {
        args = [
            "/d", //Disables execution of AutoRun commands, which are like .bashrc commands.
            "/c", //Carries out the command specified by <string> and then exits the command processor.
            `""${cmd}" ${args.map((a) => `"${a}"`).join(" ")}"`,
        ];
        cmd = "cmd.exe";
        options = {...options, windowsVerbatimArguments: true};
    }
    return {cmd, args, options};
}

export async function cancellableExecFile(
    file: string,
    args: string[],
    options: Omit<SpawnOptionsWithoutStdio, "signal"> = {},
    cancellationToken?: CancellationToken
): Promise<{
    stdout: string;
    stderr: string;
}> {
    const abortController = new AbortController();
    cancellationToken?.onCancellationRequested(() => abortController.abort());
    const signal = abortController.signal;

    const res = await promisify(execFileCb)(file, args, {
        ...options,
        signal,
    });
    return {stdout: res.stdout.toString(), stderr: res.stderr.toString()};
}

export const execFile = async (
    file: string,
    args: string[],
    options: Omit<SpawnOptionsWithoutStdio, "signal"> = {},
    cancellationToken?: CancellationToken
): Promise<{
    stdout: string;
    stderr: string;
}> => {
    const {
        cmd,
        args: escapedArgs,
        options: escapedOptions,
    } = getEscapedCommandAndAgrs(file, args, options);

    return await cancellableExecFile(
        cmd,
        escapedArgs,
        escapedOptions,
        cancellationToken
    );
};

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
        if (this.message.includes("no value assigned to required variable")) {
            window
                .showErrorMessage(
                    (prefix?.trimEnd().concat(" ") ?? "") +
                        `No value assigned to required variables.`,
                    "Assign Values"
                )
                .then((choice) => {
                    if (choice === "Assign Values") {
                        commands.executeCommand("databricks.bundle.showLogs");
                        commands.executeCommand("dabsVariableView.focus");
                        commands.executeCommand(
                            "databricks.bundle.variable.openFile"
                        );
                    }
                });
            return;
        }

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

export class CancellationError extends Error {
    constructor() {
        super("Cancelled");
    }
}

export async function waitForProcess(
    p: ChildProcessWithoutNullStreams,
    onStdOut?: (data: string) => void,
    onStdError?: (data: string) => void
) {
    const stdout: string[] = [];
    p.stdout.on("data", (data) => {
        stdout.push(data.toString());
        if (onStdOut) {
            onStdOut(data.toString());
        }
    });

    const stderr: string[] = [];
    p.stderr.on("data", (data) => {
        stderr.push(data.toString());
        if (onStdError) {
            onStdError(data.toString());
        }
    });

    await new Promise<void>((resolve, reject) => {
        p.on("close", (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new ProcessError(stderr.join(""), code));
            }
        });
        p.on("error", (e) => new ProcessError(e.message, null));
    });

    return {stdout: stdout.join(""), stderr: stderr.join("")};
}

async function runBundleCommand(
    bundleOpName: string,
    cmd: string,
    args: string[] = [],
    workspaceFolder: Uri,
    displayLogs: {
        start: string | string[];
        end: string;
        error: string;
    },
    env: Record<string, string | undefined> = {},
    logger?: logging.NamedLogger,
    outputHandlers: {
        onStdOut?: (data: string) => void;
        onStdError?: (data: string) => void;
    } = {},
    cancellationToken?: CancellationToken
) {
    const defaultOutputHandlers = {
        onStdOut: (data: string) => {
            logger?.info(data, {bundleOpName});
        },
        onStdError: (data: string) => {
            logger?.info(data, {bundleOpName});
        },
    };
    const {onStdOut, onStdError} = {
        ...defaultOutputHandlers,
        ...outputHandlers,
    };
    const startLogs =
        typeof displayLogs.start === "string"
            ? [displayLogs.start]
            : displayLogs.start;

    startLogs.forEach((msg) => {
        logger?.info(msg, {bundleOpName});
    });

    logger?.debug(quote([cmd, ...args]), {bundleOpName});
    const abortController = new AbortController();
    let options: SpawnOptionsWithoutStdio = {
        cwd: workspaceFolder.fsPath,
        env: removeUndefinedKeys(env),
        signal: abortController.signal,
    };

    ({cmd, args, options} = getEscapedCommandAndAgrs(cmd, args, options));
    try {
        const p = spawn(cmd, args, options);
        cancellationToken?.onCancellationRequested(() => {
            if (process.platform === "win32" && p.pid) {
                // On windows aborting the signal doesn't kill the CLI.
                // Use taskkill here with the "force" and "tree" flags (to kill sub-processes too)
                spawn("taskkill", ["/pid", String(p.pid), "/T", "/F"]);
            } else {
                abortController.abort();
            }
        });
        const {stdout, stderr} = await waitForProcess(p, onStdOut, onStdError);
        logger?.info(displayLogs.end, {
            bundleOpName,
        });
        logger?.debug("output", {stdout, stderr, bundleOpName});
        return {stdout, stderr};
    } catch (e: any) {
        if (cancellationToken?.isCancellationRequested) {
            logger?.warn(`${displayLogs.error} Reason: Cancelled`, {
                bundleOpName,
            });
            throw new CancellationError();
        } else {
            logger?.error(`${displayLogs.error} ${e.message ?? ""}`, {
                ...e,
                bundleOpName,
            });
            throw new ProcessError(e.message, e.code);
        }
    }
}
/**
 * Entrypoint for all wrapped CLI commands
 *
 * Righ now this is a placeholder for a future implementation
 * of the databricks CLI
 */
export class CliWrapper {
    private clusterId?: string;
    private _bundleVariableModel?: BundleVariableModel;
    private pythonExtension?: MsPythonExtensionWrapper;

    constructor(
        private extensionContext: ExtensionContext,
        private loggerManager: LoggerManager,
        private logFilePath?: string
    ) {}

    public set bundleVariableModel(model: BundleVariableModel) {
        this._bundleVariableModel = model;
    }

    public setPythonExtension(pythonExtension: MsPythonExtensionWrapper) {
        this.pythonExtension = pythonExtension;
    }

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

    get escapedCliPath(): string {
        return isPowershell()
            ? `& "${this.cliPath.replace('"', '\\"')}"`
            : `'${this.cliPath.replaceAll("'", "\\'")}'`;
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
                } else {
                    msg += e.message;
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

    async getBundleCommandEnvVars(
        authProvider: AuthProvider,
        configfilePath?: string
    ) {
        // Add python executable to PATH
        const executable = await this.pythonExtension?.getPythonExecutable();
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

        return removeUndefinedKeys({
            ...cliEnvVars,
            ...EnvVarGenerators.getProxyEnvVars(),
            ...authProvider.toEnv(),
            ...this.getLogginEnvVars(),
            ...((await this._bundleVariableModel?.getEnvVariables()) ?? {}),
            /* eslint-disable @typescript-eslint/naming-convention */
            DATABRICKS_CLUSTER_ID: this.clusterId,
            PATH: shellPath,
            /* eslint-enable @typescript-eslint/naming-convention */
        });
    }

    async bundleValidate(
        target: string,
        authProvider: AuthProvider,
        workspaceFolder: Uri,
        configfilePath?: string,
        logger?: logging.NamedLogger
    ) {
        return await runBundleCommand(
            "validate",
            this.cliPath,
            ["bundle", "validate", "--target", target],
            workspaceFolder,
            {
                start: `Reading local bundle configuration for target ${target}...`,
                end: "Finished reading local bundle configuration.",
                error: "Failed to read local bundle configuration.",
            },
            await this.getBundleCommandEnvVars(authProvider, configfilePath),
            logger,
            {
                onStdOut: (data) => logger?.debug(data, {target}),
                onStdError: (data) => logger?.debug(data, {target}),
            }
        );
    }

    async bundleSummarise(
        target: string,
        authProvider: AuthProvider,
        workspaceFolder: Uri,
        configfilePath?: string,
        logger?: logging.NamedLogger
    ) {
        return await runBundleCommand(
            "summarize",
            this.cliPath,
            [
                "bundle",
                "summary",
                "--target",
                target,
                // Forces the CLI to regenerate local terraform state and pull the remote state.
                // Regenerating terraform state is useful when we want to ensure that the provider version
                // used in the local state matches the bundled version we supply with the extension.
                "--force-pull",
            ],
            workspaceFolder,
            {
                start: `Refreshing bundle configuration for target ${target}...`,
                end: "Bundle configuration refreshed.",
                error: "Failed to refresh bundle configuration.",
            },
            await this.getBundleCommandEnvVars(authProvider, configfilePath),
            logger,
            {
                onStdOut: (data) => logger?.debug(data, {target}),
                onStdError: (data) => logger?.debug(data, {target}),
            }
        );
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
            {
                env: this.getBundleInitEnvVars(authProvider),
            }
        );
    }

    async bundleDeploy(
        target: string,
        authProvider: AuthProvider,
        workspaceFolder: Uri,
        configfilePath?: string,
        logger?: logging.NamedLogger,
        force = false,
        token?: CancellationToken
    ) {
        await commands.executeCommand("databricks.bundle.showLogs");
        return await runBundleCommand(
            "deploy",
            this.cliPath,
            [
                "bundle",
                "deploy",
                "--target",
                target,
                "--verbose",
                ...(force ? ["--force-lock"] : []),
            ],
            workspaceFolder,
            {
                start: [`Deploying the bundle for target ${target}...`].concat(
                    this.clusterId
                        ? [`DATABRICKS_CLUSTER_ID=${this.clusterId}`]
                        : []
                ),
                end: "Bundle deployed successfully.",
                error: "Failed to deploy the bundle.",
            },
            await this.getBundleCommandEnvVars(authProvider, configfilePath),
            logger,
            {},
            token
        );
    }

    async bundleDestroy(
        target: string,
        authProvider: AuthProvider,
        workspaceFolder: Uri,
        configfilePath?: string,
        logger?: logging.NamedLogger,
        force = false,
        token?: CancellationToken
    ) {
        await commands.executeCommand("databricks.bundle.showLogs");
        return await runBundleCommand(
            "destroy",
            this.cliPath,
            [
                "bundle",
                "destroy",
                "--target",
                target,
                "--auto-approve",
                ...(force ? ["--force-lock"] : []),
            ],
            workspaceFolder,
            {
                start: `Destroying the bundle for target ${target}...`,
                end: "Bundle destroyed successfully.",
                error: "Failed to destroy the bundle.",
            },
            await this.getBundleCommandEnvVars(authProvider, configfilePath),
            logger,
            {},
            token
        );
    }

    async getBundleRunCommand(
        target: string,
        authProvider: AuthProvider,
        resourceKey: string,
        workspaceFolder: Uri,
        configfilePath?: string
    ): Promise<{
        cmd: string;
        args: string[];
        options: SpawnOptionsWithoutStdio;
    }> {
        const env: Record<string, string> = removeUndefinedKeys({
            ...EnvVarGenerators.getEnvVarsForCli(
                this.extensionContext,
                configfilePath
            ),
            ...EnvVarGenerators.getProxyEnvVars(),
            ...authProvider.toEnv(),
            ...((await this._bundleVariableModel?.getEnvVariables()) ?? {}),
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
            },
        };
    }
}
