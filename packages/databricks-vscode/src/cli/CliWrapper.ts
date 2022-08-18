import {spawn} from "child_process";
import {ExtensionContext} from "vscode";
import {SyncDestination} from "../configuration/SyncDestination";

interface Command {
    command: string;
    args: string[];
}

/**
 * Entrypoint for all wrapped CLI commands
 *
 * Righ now this is a placeholder for a future implementation
 * of the bricks CLI
 */
export class CliWrapper {
    constructor() {}

    getTestBricksCommand(context: ExtensionContext): Command {
        return {
            command: context.asAbsolutePath("./bin/bricks"),
            args: [],
        };
    }

    /**
     * Constructs the dbx sync command
     */
    getSyncCommand(
        profile: string,
        me: string,
        syncDestination: SyncDestination,
        syncType: "full" | "incremental"
    ): Command {
        const command = "dbx";
        const args = [
            "sync",
            "repo",
            "--profile",
            profile,
            "--user",
            me,
            "--dest-repo",
            syncDestination.name,
        ];

        if (syncType === "full") {
            args.push("--full-sync");
        }

        return {command, args};
    }

    getAddProfileCommand(profile: string, host: URL): Command {
        return {
            command: "databricks",
            args: [
                "configure",
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
            let child = spawn(command, args, {
                stdio: ["pipe", 0, 0],
            });

            child.stdin!.write(token);
            child.stdin!.end();

            child.on("error", reject);
            child.on("exit", resolve);
        });
    }
}
