import {execFile as execFileCb, spawn} from "child_process";
import {ExtensionContext, window, commands} from "vscode";
import {SyncDestinationMapper} from "../sync/SyncDestination";
import {workspaceConfigs} from "../vscode-objs/WorkspaceConfigs";
import {promisify} from "node:util";
import {logging} from "@databricks/databricks-sdk";
import {Loggers} from "../logger";
import {Context, context} from "@databricks/databricks-sdk/dist/context";
import {Cloud} from "../utils/constants";
import {UrlUtils} from "../utils";

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

/**
 * Entrypoint for all wrapped CLI commands
 *
 * Righ now this is a placeholder for a future implementation
 * of the databricks CLI
 */
export class CliWrapper {
    constructor(private extensionContext: ExtensionContext) {}

    get cliPath(): string {
        return this.extensionContext.asAbsolutePath("./bin/databricks");
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
        ];
        if (syncType === "full") {
            args.push("--full");
        }
        if (workspaceConfigs.cliVerboseMode) {
            args.push("--log-level", "debug", "--log-file", "stderr");
        }
        return {command: this.cliPath, args};
    }

    private getListProfilesCommand(): Command {
        return {
            command: this.cliPath,
            args: ["auth", "profiles", "--skip-validate"],
        };
    }

    @withLogContext(Loggers.Extension)
    public async listProfiles(
        configfilePath?: string,
        @context ctx?: Context
    ): Promise<Array<ConfigEntry>> {
        const cmd = await this.getListProfilesCommand();
        const res = await execFile(cmd.command, cmd.args, {
            env: {
                /*  eslint-disable @typescript-eslint/naming-convention */
                HOME: process.env.HOME,
                DATABRICKS_CONFIG_FILE:
                    configfilePath || process.env.DATABRICKS_CONFIG_FILE,
                DATABRICKS_OUTPUT_FORMAT: "json",
                /*  eslint-enable @typescript-eslint/naming-convention */
            },
            shell: true,
        });
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
                window
                    .showWarningMessage(
                        msg,
                        "Open Databricks Config File",
                        "Ignore"
                    )
                    .then((choice) => {
                        if (choice === "Open Databricks Config File") {
                            commands.executeCommand(
                                "databricks.connection.openDatabricksConfigFile"
                            );
                        }
                    });
            }
        }
        return result;
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
