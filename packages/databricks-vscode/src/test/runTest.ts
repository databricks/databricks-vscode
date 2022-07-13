import * as path from "path";
import os = require("os");

import {runTests} from "@vscode/test-electron";

async function main() {
    try {
        // The folder containing the Extension Manifest package.json
        // Passed to `--extensionDevelopmentPath`
        const extensionDevelopmentPath = path.resolve(__dirname, "../../");

        // The path to test runner
        // Passed to --extensionTestsPath
        const extensionTestsPath = path.resolve(__dirname, "./suite");

        // Download VS Code, unzip it and run the integration test
        await runTests({
            extensionDevelopmentPath,
            extensionTestsPath,
            launchArgs: ["--user-data-dir", `${os.tmpdir()}`],
        });
    } catch (err) {
        console.error("Failed to run tests");
        process.exit(1);
    }
}

main();
