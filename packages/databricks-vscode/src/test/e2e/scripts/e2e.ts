/* eslint-disable @typescript-eslint/naming-convention */
import {spawn} from "child_process";
import assert from "assert";
import fs from "fs/promises";
import tmp from "tmp-promise";

/**
 * Create a temporary Databricks config file with values taken from environment variables
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
        process.env["TEST_DEFAULT_CLUSTER_ID"],
        "Environment variable TEST_DEFAULT_CLUSTER_ID must be set"
    );

    const {path: configFile, cleanup} = await tmp.file();
    let host = process.env["DATABRICKS_HOST"];
    if (!host.startsWith("http")) {
        host = `https://${host}`;
    }
    try {
        await fs.writeFile(
            configFile,
            `[DEFAULT]
host = ${host}
token = ${process.env["DATABRICKS_TOKEN"]}`
        );

        const child = spawn("extest", ["run-tests", ...args], {
            env: {
                TEST_DEFAULT_CLUSTER_ID: process.env["TEST_DEFAULT_CLUSTER_ID"],
                DATABRICKS_CONFIG_FILE: configFile,
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
