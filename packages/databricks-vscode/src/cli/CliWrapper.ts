import {execFile as execFileCb, spawn} from "child_process";
import {ExtensionContext, window, commands, workspace} from "vscode";
import {SyncDestinationMapper} from "../configuration/SyncDestination";
import {workspaceConfigs} from "../vscode-objs/WorkspaceConfigs";
import {promisify} from "node:util";
import {withLogContext} from "@databricks/databricks-sdk/dist/logging";
import {Loggers} from "../logger";
import {Context, context} from "@databricks/databricks-sdk/dist/context";

const execFile = promisify(execFileCb);

export interface Command {
    command: string;
    args: string[];
}

export interface ConfigEntry {
    name: string;
    host?: URL;
    accountId?: string;
    cloud: "aws" | "azure" | "gcp";
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
 * of the bricks CLI
 */
export class CliWrapper {
    constructor(private extensionContext: ExtensionContext) {}

    getTestBricksCommand(): Command {
        return {
            command: this.extensionContext.asAbsolutePath("./bin/bricks"),
            args: [],
        };
    }

    /**
     * Constructs the bricks sync command
     */
    getSyncCommand(
        syncDestination: SyncDestinationMapper,
        syncType: SyncType
    ): Command {
        const command = this.extensionContext.asAbsolutePath("./bin/bricks");
        const args = ["sync", ".", syncDestination.remoteUri.path, "--watch"];

        if (syncType === "full") {
            args.push("--full");
        }
        if (workspaceConfigs.bricksVerboseMode) {
            args.push("-v");
        }
        return {command, args};
    }

    private getListProfilesCommand(): Command {
        return {
            command: this.extensionContext.asAbsolutePath("./bin/bricks"),
            args: ["auth", "profiles", "--skip-validate"],
        };
    }

    private getBundleValidateCommand(): Command {
        return {
            command: this.extensionContext.asAbsolutePath("./bin/bricks"),
            args: ["bundle", "validate"],
        };
    }

    public async validateBundle(): Promise<Record<string, any>> {
        const cmd = this.getBundleValidateCommand();
        // TODO: handle errors
        const res = await execFile(cmd.command, cmd.args, {
            cwd: workspace.workspaceFolders?.[0].uri.fsPath,
        });
        return JSON.parse(res.stdout);
    }

    @withLogContext(Loggers.Extension)
    public async listProfiles(
        configfilePath?: string,
        @context ctx?: Context
    ): Promise<Array<ConfigEntry>> {
        const cmd = await this.getListProfilesCommand();
        const res = await execFile(cmd.command, cmd.args, {
            env: {
                // eslint-disable-next-line @typescript-eslint/naming-convention
                HOME: process.env.HOME,
                // eslint-disable-next-line @typescript-eslint/naming-convention
                DATABRICKS_CONFIG_FILE:
                    configfilePath || process.env.DATABRICKS_CONFIG_FILE,
            },
        });
        const profiles = JSON.parse(res.stdout).profiles || [];
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
        const {stdout} = await execFile(
            this.extensionContext.asAbsolutePath("./bin/bricks"),
            ["bundle", "schema"]
        );
        return stdout;
    }

    getAddProfileCommand(profile: string, host: URL): Command {
        return {
            command: this.extensionContext.asAbsolutePath("./bin/bricks"),
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
