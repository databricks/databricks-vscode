/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/naming-convention */
import {spawn} from "child_process";
import assert from "assert";
import fs from "fs/promises";
import tmp from "tmp-promise";
import {
    ApiClient,
    Cluster,
    CurrentUserService,
    Repo,
} from "@databricks/databricks-sdk";

const REPO_NAME = "vscode-integ-test";

function getApiClient(host: string, token: string) {
    const apiClient = new ApiClient("integration-tests", "0.0.1", async () => {
        return {
            host: new URL(host),
            token,
        };
    });

    return apiClient;
}

/**
 * Create a repo for the integration tests to use
 */
async function createRepo(apiClient: ApiClient): Promise<string> {
    const meService = new CurrentUserService(apiClient);
    const me = (await meService.me()).userName!;
    const repoPath = `/Repos/${me}/${REPO_NAME}`;

    console.log(`Creating test Repo: ${repoPath}`);

    let repo: Repo;
    try {
        repo = await Repo.fromPath(apiClient, repoPath);
    } catch (e) {
        repo = await Repo.create(apiClient, {
            path: repoPath,
            url: "https://github.com/fjakobs/empty-repo.git",
            provider: "github",
        });
    }

    return repo.path;
}

async function startCluster(apiClient: ApiClient, clusterId: string) {
    console.log(`Starting cluster: ${clusterId}`);
    const cluster = await Cluster.fromClusterId(apiClient, clusterId);
    await cluster.start(undefined, (state) =>
        console.log(`Cluster state: ${state}`)
    );
    console.log(`Cluster started`);
}

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

    const apiClient = getApiClient(host, process.env["DATABRICKS_TOKEN"]);
    const repoPath = await createRepo(apiClient);
    await startCluster(apiClient, process.env["TEST_DEFAULT_CLUSTER_ID"]);

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
                TEST_REPO_PATH: repoPath,
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
