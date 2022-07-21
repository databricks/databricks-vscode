/* eslint-disable @typescript-eslint/naming-convention */
import {spawn} from "child_process";
import * as assert from "assert";
import * as fs from "fs/promises";
import * as path from "path";
import * as tmp from "tmp-promise";

/**
 * Create a temporary directory for the test and populate the Databricks config file
 * with values taken from environment variables
 */
async function main(args: string[]) {
    assert(
        process.env["DATABRICKS_HOST"],
        "Environment variable DATABRICKS_HOST must be set"
    );
    assert(
        process.env["DATABRICKS_TOKEN"],
        "Environment variable DATABRICKS_TOKEN must be set"
    );
    assert(
        process.env["DATABRICKS_CLUSTER_ID"],
        "Environment variable DATABRICKS_CLUSTER_ID must be set"
    );

    const {path: projectDir, cleanup} = await tmp.dir();
    try {
        await fs.writeFile(
            path.join(projectDir, ".databrickscfg"),
            `[DEFAULT]
host = ${process.env["DATABRICKS_HOST"]}
token = ${process.env["DATABRICKS_TOKEN"]}`
        );

        const child = spawn("extest", ["run-tests", ...args], {
            env: {
                DATABRICKS_CLUSTER_ID: process.env["DATABRICKS_CLUSTER_ID"],
                PROJECT_DIR: projectDir,
                DATABRICKS_CONFIG_FILE: path.join(projectDir, ".databrickscfg"),
                PATH: process.env["PATH"],
            },
            stdio: "inherit",
            shell: true,
        });

        const code: number = await new Promise((resolve) =>
            child.on("exit", resolve)
        );

        process.exit(code);
    } finally {
        cleanup();
    }
}

main(process.argv.slice(2));
