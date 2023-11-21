import path from "path";
import os from "os";
import fs from "fs/promises";

import {EXTENSION_DEVELOPMENT} from "../utils/developmentUtils";
import {downloadAndUnzipVSCode, runTests} from "@vscode/test-electron";

async function main() {
    try {
        // The folder containing the Extension Manifest package.json
        // Passed to `--extensionDevelopmentPath`
        const extensionDevelopmentPath = path.resolve(__dirname, "../../");

        // The path to test runner
        // Passed to --extensionTestsPath
        const extensionTestsPath = path.resolve(__dirname, "./suite");

        const cachePath = "/tmp/vscode-test-databricks";
        await fs.mkdir(cachePath, {recursive: true});

        const vscodeExecutablePath = await downloadAndUnzipVSCode({
            version: process.env.VSCODE_TEST_VERSION || "stable",
            cachePath,
        });

        // Download VS Code, unzip it and run the integration test
        await runTests({
            vscodeExecutablePath,
            extensionDevelopmentPath,
            extensionTestsPath,
            launchArgs: ["--user-data-dir", `${os.tmpdir()}`],
            extensionTestsEnv: {
                [EXTENSION_DEVELOPMENT]: "true",
            },
        });
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error("Failed to run tests");
        process.exit(1);
    }
}

main();
