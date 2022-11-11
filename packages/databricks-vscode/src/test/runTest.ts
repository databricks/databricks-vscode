import path from "path";
import os from "os";

import {downloadAndUnzipVSCode, runTests} from "@vscode/test-electron";

async function main() {
    try {
        // The folder containing the Extension Manifest package.json
        // Passed to `--extensionDevelopmentPath`
        const extensionDevelopmentPath = path.resolve(__dirname, "../../");

        // The path to test runner
        // Passed to --extensionTestsPath
        const extensionTestsPath = path.resolve(__dirname, "./suite");

        const vscodeExecutablePath = await downloadAndUnzipVSCode(
            process.env.VSCODE_TEST_VERSION || "stable"
        );

        // Download VS Code, unzip it and run the integration test
        await runTests({
            vscodeExecutablePath,
            extensionDevelopmentPath,
            extensionTestsPath,
            launchArgs: ["--user-data-dir", `${os.tmpdir()}`],
        });
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error("Failed to run tests");
        process.exit(1);
    }
}

main();
