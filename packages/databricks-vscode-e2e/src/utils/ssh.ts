import fs from "node:fs/promises";
import path from "node:path";

/*
 * Ported from the old suite's `sshE2eUtils.ts`, for `ssh_connection.ucws`.
 * The harness calls it from `beforeSession`, in the worker, so the
 * environment it sets reaches the VS Code it starts and the spec.
 */

/** The folders the SSH spec's editor uses. */
export interface SshEditorPaths {
    /** The downloaded VS Code's CLI. */
    readonly code: string;
    readonly extensionsDir: string;
    /** The capability's `storagePath`: the service puts the user data in `settings/` below it. */
    readonly storageDir: string;
    /** Holds `ssh-test-probe`. */
    readonly resourcesDir: string;
    /** The home folder the tunnel's CLI and Remote-SSH write into. Emptied first. */
    readonly home: string;
}

/**
 * Routes the CLI's real `code` invocation back to the test editor: a `code`
 * on PATH that runs the downloaded VS Code with the test's user data and
 * extensions, and the probe extension, which reports from the remote
 * window. The CLI updates the editor's user settings in the home folder,
 * which is linked to the test editor's. Returns the SSH config file the CLI
 * writes, for `remote.SSH.configFile`.
 */
export async function prepareSshEditor(paths: SshEditorPaths): Promise<string> {
    const { code, extensionsDir, storageDir, resourcesDir, home } = paths;
    await fs.rm(home, { recursive: true, force: true });
    const bin = path.join(home, "bin");
    await fs.mkdir(bin, { recursive: true });
    const appData = path.join(home, "AppData", "Roaming");
    const settingsParent =
        process.platform === "darwin"
            ? path.join(home, "Library", "Application Support", "Code")
            : process.platform === "win32"
              ? path.join(appData, "Code")
              : path.join(home, ".config", "Code");
    const settings = path.join(storageDir, "settings", "User");
    await fs.mkdir(settings, { recursive: true });
    await fs.mkdir(settingsParent, { recursive: true });
    // Let the CLI update the actual test editor's settings through its normal path.
    await fs.symlink(
        settings,
        path.join(settingsParent, "User"),
        process.platform === "win32" ? "junction" : "dir",
    );
    const args = [
        code,
        "--user-data-dir",
        path.join(storageDir, "settings"),
        "--extensions-dir",
        extensionsDir,
        "--extensionDevelopmentPath",
        path.join(resourcesDir, "ssh-test-probe"),
    ];
    if (process.platform === "win32") {
        // Unexercised: the spec runs on POSIX, and the harness pins a default
        // terminal profile only for Linux and macOS. Kept for when Windows is enabled.
        const command = args.map((arg) => `"${arg}"`).join(" ");
        await fs.writeFile(
            path.join(bin, "code.cmd"),
            `@echo off\r\nif "%~1"=="--remote" (\r\ncall ${command} %* --folder-uri "vscode-remote://%~2/tmp"\r\nexit /b\r\n)\r\ncall ${command} %*\r\n`,
        );
    } else {
        const quote = (arg: string) => `'${arg.replaceAll("'", "'\\''")}'`;
        const command = args.map(quote).join(" ");
        // Development windows need an explicit folder URI; use a writable remote scratch directory.
        await fs.writeFile(
            path.join(bin, "code"),
            `#!/bin/sh\nif [ "$1" = "--remote" ]; then\nexec ${command} "$@" --folder-uri "vscode-remote://$2/tmp"\nfi\nexec ${command} "$@"\n`,
            { mode: 0o755 },
        );
    }
    process.env.PATH = `${bin}${path.delimiter}${process.env.PATH}`;
    process.env.HOME = home;
    process.env.USERPROFILE = home;
    process.env.APPDATA = appData;
    process.env.TEST_SSH_RESULT_PATH = path.join(home, "ssh-result.json");
    return path.join(home, ".ssh", "config");
}
