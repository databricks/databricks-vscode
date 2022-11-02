/**
 * This is a nasty hack to get around an issue in the vscode-extension-tester package
 * https://github.com/redhat-developer/vscode-extension-tester/issues/524
 *
 * Instead of using the download funtionality from the package we perform the download ourselves
 */

import * as fs from "fs-extra";
import {ConsoleReporter, downloadAndUnzipVSCode} from "@vscode/test-electron";
import path from "node:path";

class Reporter extends ConsoleReporter {
    public downloadedPath?: string;

    report(report: any) {
        if (report.downloadedPath) {
            this.downloadedPath = report.downloadedPath;
        }
        super.report(report);
    }
}

async function main(args: string[]) {
    const codeVersion = args[0];
    if (!codeVersion) {
        throw new Error("No code version specified");
    }

    const downloadFolder = args[1];
    if (!downloadFolder) {
        throw new Error("No download folder specified");
    }

    try {
        const reporter = new Reporter(true);

        fs.mkdirpSync(downloadFolder);

        const codeFolder = path.join(
            downloadFolder,
            process.platform === "darwin"
                ? "Visual Studio Code.app"
                : `VSCode-${getPlatform()}`
        );

        await downloadAndUnzipVSCode({
            version: codeVersion,
            cachePath: downloadFolder,
            reporter: reporter,
        });

        const target = reporter.downloadedPath!;
        let rootDir = target;
        const files = await fs.readdir(target);

        if (files.length === 1) {
            rootDir = path.join(target, files[0]);
        }
        await fs.move(rootDir, codeFolder, {overwrite: true});
        await fs.remove(target);
    } catch (err) {
        console.error("Failed to download VSCode", err);
        process.exit(1);
    }
}

function getPlatform(): string {
    let platform: string = process.platform;
    const arch = process.arch;

    if (platform === "linux") {
        platform += arch === "x64" ? `-${arch}` : `-ia32`;
    } else if (platform === "win32") {
        platform += arch === "x64" ? `-${arch}` : "";
        platform += "-archive";
    }

    return platform;
}

main(process.argv.slice(2));
