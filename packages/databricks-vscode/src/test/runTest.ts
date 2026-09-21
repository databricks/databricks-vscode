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

        let vscodeExecutablePath = await downloadAndUnzipVSCode({
            version: process.env.VSCODE_TEST_VERSION || "stable",
            cachePath,
            timeout: 60000,
        });

        // @vscode/test-electron@3.0.0 hardcodes the macOS executable name as
        // "Electron", but recent VS Code stable builds renamed it to "Code".
        // If the returned path doesn't exist, fall back to the "Code" binary.
        // Symlinking Electron -> Code is not an option: it breaks the app's
        // code signature and macOS kills the process with SIGKILL.
        try {
            await fs.access(vscodeExecutablePath);
        } catch {
            const renamed = path.join(
                path.dirname(vscodeExecutablePath),
                "Code"
            );
            await fs.access(renamed);
            vscodeExecutablePath = renamed;
        }

        const tmpDir = os.tmpdir();

        // Download VS Code, unzip it and run the integration test
        await runTests({
            vscodeExecutablePath,
            extensionDevelopmentPath,
            extensionTestsPath,
            launchArgs: [tmpDir, "--user-data-dir", tmpDir],
            extensionTestsEnv: {
                [EXTENSION_DEVELOPMENT]: "true",
                MOCHA_GREP: process.env.MOCHA_GREP,
            },
        });
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error(err);
        process.exit(1);
    }
}

main();
