import {execFile, ExecFileException, spawn} from "child_process";

/**
 * Entrypoint for all wrapped CLI commands
 */
export class CliWrapper {
    constructor() {}

    async addProfile(
        name: string,
        host: URL,
        token: string
    ): Promise<{stdout: string; stderr: string}> {
        return new Promise((resolve, reject) => {
            let child = spawn(
                "databricks",
                [
                    "configure",
                    "--profile",
                    name,
                    "--host",
                    host.href,
                    "--token",
                ],
                {
                    stdio: ["pipe", 0, 0],
                }
            );

            child.stdin!.write(token);
            child.stdin!.end();

            child.on("error", reject);
            child.on("exit", resolve);
        });
    }
}
