import {execFile as execFileCb, spawn} from "child_process";
import {ExtensionContext, window, commands} from "vscode";
import {SyncDestinationMapper} from "../sync/SyncDestination";
import {workspaceConfigs} from "../vscode-objs/WorkspaceConfigs";
import {promisify} from "node:util";
import {logging} from "@databricks/databricks-sdk";
import {Loggers} from "../logger";
import {Context, context} from "@databricks/databricks-sdk/dist/context";
import {Cloud} from "../utils/constants";

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

function getValidHost(host: string) {
    if (host.match(/^(?:(?:https?):\/\/)?(.(?!:\/\/))+$/) !== null) {
        return new URL(host);
    } else {
        throw new TypeError("Invalid type for host");
    }
}
/**
 * Entrypoint for all wrapped CLI commands
 *
 * Righ now this is a placeholder for a future implementation
 * of the databricks CLI
 */
export class CliWrapper {
    constructor(
        private extensionContext: ExtensionContext,
        private logFilePath?: string
    ) {}

    get cliPath(): string {
        return this.extensionContext.asAbsolutePath("./bin/databricks");
    }

    get loggingArguments(): string[] {
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
            ...this.loggingArguments,
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
                ...this.loggingArguments,
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
                    /*  eslint-disable @typescript-eslint/naming-convention */
                    HOME: process.env.HOME,
                    DATABRICKS_CONFIG_FILE:
                        configfilePath || process.env.DATABRICKS_CONFIG_FILE,
                    DATABRICKS_OUTPUT_FORMAT: "json",
                    /*  eslint-enable @typescript-eslint/naming-convention */
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

        let profiles = JSON.parse(res.stdout).profiles || [];

        // filter out account profiles
        profiles = profiles.filter((p: any) => !p.account_id);

        const result = [];

        for (const profile of profiles) {
            try {
                result.push({
                    name: profile.name,
                    host: getValidHost(profile.host),
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
        const execFile = promisify(execFileCb);
        const {stdout} = await execFile(this.cliPath, ["bundle", "schema"]);
        return stdout;
    }

    getAddProfileCommand(profile: string, host: URL): Command {
        return {
            command: this.cliPath,
            args: [
                "configure",
                "--no-interactive",
                "--profile",
                profile,
                "--host",
                host.href,
                "--token",
            ],
        };
    }

    async addProfile(
        name: string,
        host: URL,
        token: string
    ): Promise<{stdout: string; stderr: string}> {
        return new Promise((resolve, reject) => {
            const {command, args} = this.getAddProfileCommand(name, host);
            const child = spawn(command, args, {
                stdio: ["pipe", 0, 0],
            });

            child.stdin!.write(`${token}\n`);
            child.stdin!.end();

            child.on("error", reject);
            child.on("exit", resolve);
        });
    }
}
