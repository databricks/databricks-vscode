import {spawn} from "child_process";
import {PathMapper} from "../configuration/PathMapper";

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

    /**
     * Constructs the dbx sync command
     */
    getSyncCommand(
        profile: string,
        me: string,
        pathMapper: PathMapper,
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
            pathMapper.remoteWorkspaceName,
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
