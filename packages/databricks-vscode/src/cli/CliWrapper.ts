import {execFile as execFileCb, spawn} from "child_process";
import {ExtensionContext} from "vscode";
import {SyncDestination} from "../configuration/SyncDestination";
import {workspaceConfigs} from "../WorkspaceConfigs";
import {promisify} from "node:util";

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
/**
 * Entrypoint for all wrapped CLI commands
 *
 * Righ now this is a placeholder for a future implementation
 * of the bricks CLI
 */
export class CliWrapper {
    constructor(private context: ExtensionContext) {}

    getTestBricksCommand(): Command {
        return {
            command: this.context.asAbsolutePath("./bin/bricks"),
            args: [],
        };
    }

    /**
     * Constructs the bricks sync command
     */
    getSyncCommand(
        syncDestination: SyncDestination,
        syncType: SyncType
    ): Command {
        const command = this.context.asAbsolutePath("./bin/bricks");
        const args = [
            "sync",
            "--remote-path",
            syncDestination.relativeWsfsDirPath,
            "--watch",
        ];
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
            command: this.context.asAbsolutePath("./bin/bricks"),
            args: ["auth", "profiles", "--skip-validate"],
        };
    }

    public async listProfiles(
        configfilePath?: string
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
            result.push({
                name: profile.name,
                host: new URL(profile.host),
                accountId: profile.account_id,
                cloud: profile.cloud,
                authType: profile.auth_type,
                valid: profile.valid,
            });
        }
        return result;
    }

    public async getBundleSchema(): Promise<string> {
        const execFile = promisify(execFileCb);
        const {stdout} = await execFile(
            this.context.asAbsolutePath("./bin/bricks"),
            ["bundle", "schema"]
        );
        return stdout;
    }

    getAddProfileCommand(profile: string, host: URL): Command {
        return {
            command: this.context.asAbsolutePath("./bin/bricks"),
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
