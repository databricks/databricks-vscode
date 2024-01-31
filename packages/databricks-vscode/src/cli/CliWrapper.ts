import {
    ChildProcessWithoutNullStreams,
    SpawnOptionsWithoutStdio,
    execFile as execFileCb,
    spawn,
} from "child_process";
import {ExtensionContext, window, commands, Uri} from "vscode";
import {SyncDestinationMapper} from "../sync/SyncDestination";
import {workspaceConfigs} from "../vscode-objs/WorkspaceConfigs";
import {promisify} from "node:util";
import {logging} from "@databricks/databricks-sdk";
import {Loggers} from "../logger";
import {Context, context} from "@databricks/databricks-sdk/dist/context";
import {Cloud} from "../utils/constants";
import {EnvVarGenerators, UrlUtils} from "../utils";
import {AuthProvider} from "../configuration/auth/AuthProvider";
import {removeUndefinedKeys} from "../utils/envVarGenerators";

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
                reject(stderr.join(""));
            }
        });
        p.on("error", reject);
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
                    ...EnvVarGenerators.getEnvVarsForCli(configfilePath),
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
            this.showConfigFileWarning(msg);
            return [];
        }

        const profiles = JSON.parse(res.stdout).profiles || [];
        const result = [];

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
                this.showConfigFileWarning(msg);
            }
        }
        return result;
    }

    private async showConfigFileWarning(msg: string) {
        const openAction = "Open Databricks Config File";
        const choice = await window.showWarningMessage(
            msg,
            openAction,
            "Ignore"
        );
        if (choice === openAction) {
            commands.executeCommand(
                "databricks.connection.openDatabricksConfigFile"
            );
        }
    }

    public async getBundleSchema(): Promise<string> {
        const {stdout} = await execFile(this.cliPath, ["bundle", "schema"]);
        return stdout;
    }

    async bundleValidate(
        target: string,
        authProvider: AuthProvider,
        workspaceFolder: Uri,
        configfilePath?: string
    ) {
        const {stdout} = await execFile(
            this.cliPath,
            ["bundle", "validate", "--target", target],
            {
                cwd: workspaceFolder.fsPath,
                env: {
                    ...EnvVarGenerators.getEnvVarsForCli(configfilePath),
                    ...EnvVarGenerators.getProxyEnvVars(),
                    ...authProvider.toEnv(),
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    DATABRICKS_CLUSTER_ID: this.clusterId,
                },
                shell: true,
            }
        );

        return stdout;
    }

    async bundleSummarise(
        target: string,
        authProvider: AuthProvider,
        workspaceFolder: Uri,
        configfilePath?: string
    ) {
        const {stdout, stderr} = await execFile(
            this.cliPath,
            ["bundle", "summary", "--target", target],
            {
                cwd: workspaceFolder.fsPath,
                env: {
                    ...EnvVarGenerators.getEnvVarsForCli(configfilePath),
                    ...EnvVarGenerators.getProxyEnvVars(),
                    ...authProvider.toEnv(),
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    DATABRICKS_CLUSTER_ID: this.clusterId,
                },
                shell: true,
            }
        );

        if (stderr !== "") {
            throw new Error(stderr);
        }
        return stdout;
    }
    async bundleDeploy(
        target: string,
        authProvider: AuthProvider,
        workspaceFolder: Uri,
        configfilePath?: string,
        onStdOut?: (data: string) => void,
        onStdError?: (data: string) => void
    ) {
        if (onStdError) {
            onStdError(`Deploying the bundle for target ${target}...\n\n`);
            onStdError(`${this.cliPath} bundle deploy --target ${target}\n`);
            if (this.clusterId) {
                onStdError(`DATABRICKS_CLUSTER_ID=${this.clusterId}\n\n`);
            }
        }
        const p = spawn(
            this.cliPath,
            ["bundle", "deploy", "--target", target],
            {
                cwd: workspaceFolder.fsPath,
                env: {
                    ...EnvVarGenerators.getEnvVarsForCli(configfilePath),
                    ...EnvVarGenerators.getProxyEnvVars(),
                    ...authProvider.toEnv(),
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    DATABRICKS_CLUSTER_ID: this.clusterId,
                },
                shell: true,
            }
        );

        return await waitForProcess(p, onStdOut, onStdError);
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
            ...EnvVarGenerators.getEnvVarsForCli(configfilePath),
            ...EnvVarGenerators.getProxyEnvVars(),
            ...authProvider.toEnv(),
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
