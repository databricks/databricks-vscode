/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable no-console */
import path from "node:path";
import {readFileSync} from "node:fs";
import {execFile as execFileCb} from "node:child_process";
import {promisify} from "node:util";

/**
 * User settings for every editor the WebdriverIO configs launch, so the CI
 * suite and agent sessions see the same workbench.
 */
export const E2E_USER_SETTINGS = {
    "editor.fontSize": 14,
    "files.simpleDialog.enable": true,
    "workbench.editor.enablePreview": true,
    "window.newWindowDimensions": "default",
    "window.openFoldersInNewWindow": "off",
    "extensions.autoCheckUpdates": false,
    "extensions.autoUpdate": false,
    // ms-python.python is a hard extensionDependency, so its
    // language server always loads. In the headless CI display
    // the Jedi server repeatedly fails to connect and crashes,
    // and its "Python Jedi server crashed" toasts overlay UI
    // targets (e.g. the Output-channel <select title="Tasks">),
    // intercepting clicks. We don't need language features in
    // e2e, so disable the server (and experiments) at the source.
    "python.languageServer": "None",
    "python.experiments.enabled": false,
};

/**
 * WebdriverIO v9 loads TypeScript by injecting `--import <tsx loader>` into
 * NODE_OPTIONS for every worker process. wdio-vscode-service installs the
 * Databricks extension by spawning the VS Code (Electron) `code` CLI, which
 * inherits that NODE_OPTIONS — and Electron hard-rejects `--import` in
 * NODE_OPTIONS ("Code.exe: --import is not allowed in NODE_OPTIONS"). The
 * extension install then fails and every spec dies with `Can't find view
 * control "CONFIGURATION"`. By the time a config module loads, tsx has
 * already registered its loader in-process, so we can strip `--import` from
 * the environment that child processes inherit without breaking transpilation.
 * Only do this in workers (WDIO_WORKER_ID is set): the launcher must keep
 * `--import` in NODE_OPTIONS so the workers it spawns still get tsx.
 */
export function stripTsxImportInWorker() {
    if (
        process.env.WDIO_WORKER_ID &&
        process.env.NODE_OPTIONS?.includes("--import")
    ) {
        process.env.NODE_OPTIONS = process.env.NODE_OPTIONS.replace(
            /\s*--import(?:=|\s+)\S+/g,
            ""
        ).trim();
    }
}

/** The version of a downloaded VS Code, from its bundled package.json. */
export function vscodeVersionForBinary(binary: string): string | undefined {
    const appDir =
        process.platform === "darwin"
            ? path.resolve(binary, "..", "..", "Resources", "app")
            : path.resolve(binary, "..", "resources", "app");
    try {
        return JSON.parse(
            readFileSync(path.join(appDir, "package.json"), "utf-8")
        ).version;
    } catch {
        return undefined;
    }
}

/**
 * Whether an extension's `engines.vscode` range admits `version`. Only the
 * lower bound matters for the `^x.y.z` / `>=x.y.z` ranges extensions use.
 */
export function engineAllows(range: string, version: string): boolean {
    const min = range.match(/(\d+)\.(\d+)\.(\d+)/);
    const have = version.match(/(\d+)\.(\d+)\.(\d+)/);
    if (!min || !have) {
        return range.trim() === "*";
    }
    for (let i = 1; i <= 3; i++) {
        if (Number(have[i]) !== Number(min[i])) {
            return Number(have[i]) > Number(min[i]);
        }
    }
    return true;
}

/** The `code` CLI that ships next to a downloaded VS Code binary. */
export function codeCliForBinary(binary: string): string {
    switch (process.platform) {
        case "darwin":
            return path.resolve(binary, "..", "..", "Resources/app/bin/code");
        default:
            return path.resolve(binary, "..", "bin", "code");
    }
}

const metaCharsRegExp = /([()\][%!^"`<>&|;, *?])/g;

export function escapeCommand(arg: string): string {
    // Escape meta chars
    arg = `"${arg}"`.replace(metaCharsRegExp, "^$1");
    return arg;
}

export function escapeArgument(arg: string): string {
    // Convert to string
    arg = `${arg}`;

    // Algorithm below is based on https://qntm.org/cmd

    // Sequence of backslashes followed by a double quote:
    // double up all the backslashes and escape the double quote
    arg = arg.replace(/(\\*)"/g, '$1$1\\"');

    // Sequence of backslashes followed by the end of the string
    // (which will become a double quote later):
    // double up all the backslashes
    arg = arg.replace(/(\\*)$/, "$1$1");

    // All other backslashes occur literally

    // Quote the whole thing:
    arg = `"${arg}"`;

    // Escape meta chars
    arg = arg.replace(metaCharsRegExp, "^$1");

    return arg;
}

/** `execFile` that can run the Windows `code.cmd` shim, which needs cmd.exe. */
export const execFile = async (
    file: string,
    args: string[],
    options: any = {}
): Promise<{
    stdout: string;
    stderr: string;
}> => {
    if (process.platform === "win32") {
        const realArgs = [escapeCommand(file)]
            .concat(args.map(escapeArgument).join(" "))
            .join(" ");

        file = "cmd.exe";
        args = ["/d", "/s", "/c", `"${realArgs}"`];
        console.log("execFile", file, args);
        options = {...options, windowsVerbatimArguments: true};
    }
    const res = await promisify(execFileCb)(file, args, options);
    return {stdout: res.stdout.toString(), stderr: res.stderr.toString()};
};

/**
 * Install extensions into `extensionsDir` with the `code` CLI. wdio only logs a
 * beforeSession rejection, so the CLI's own output is the only explanation of
 * an install failure that reaches the job log.
 */
export async function installExtensions(
    cli: string,
    extensionsDir: string,
    args: string[]
) {
    try {
        const res = await execFile(cli, [
            "--extensions-dir",
            extensionsDir,
            ...args,
            "--force",
        ]);
        console.log(res.stdout, res.stderr);
    } catch (e) {
        const {stdout, stderr} = e as {
            stdout?: string;
            stderr?: string;
        };
        console.log(stdout ?? "", stderr ?? "");
        throw e;
    }
}
