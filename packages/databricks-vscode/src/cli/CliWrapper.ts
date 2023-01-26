import {spawn} from "child_process";
import {ExtensionContext} from "vscode";
import {SyncDestination} from "../configuration/SyncDestination";
import {workspaceConfigs} from "../WorkspaceConfigs";

export interface Command {
    command: string;
    args: string[];
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

    getGenerateSchemaCommand(schemaPath: string) {
        return {
            command: this.context.asAbsolutePath("./bin/bricks"),
            args: ["bundle", "schema", ">", schemaPath],
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
