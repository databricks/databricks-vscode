import fs from "node:fs/promises";
import path from "node:path";

/** Route the CLI's real `code` invocation back to the isolated test editor. */
export async function prepareSshEditor(
    code: string,
    extensionsDir: string,
    storageDir: string,
    resourcesDir: string
) {
    const root = process.env.WORKSPACE_PATH!;
    const home = path.join(root, "ssh-home");
    const bin = path.join(home, "bin");
    await fs.mkdir(bin, {recursive: true});
    const appData = path.join(home, "AppData", "Roaming");
    const settingsParent =
        process.platform === "darwin"
            ? path.join(home, "Library", "Application Support", "Code")
            : process.platform === "win32"
              ? path.join(appData, "Code")
              : path.join(home, ".config", "Code");
    const settings = path.join(storageDir, "settings", "User");
    await fs.mkdir(settings, {recursive: true});
    await fs.mkdir(settingsParent, {recursive: true});
    // Let the CLI update the actual test editor's settings through its normal path.
    await fs.symlink(
        settings,
        path.join(settingsParent, "User"),
        process.platform === "win32" ? "junction" : "dir"
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
        const command = args.map((arg) => `"${arg}"`).join(" ");
        await fs.writeFile(
            path.join(bin, "code.cmd"),
            `@echo off\r\nif "%~1"=="--remote" (\r\ncall ${command} %* --folder-uri "vscode-remote://%~2/tmp"\r\nexit /b\r\n)\r\ncall ${command} %*\r\n`
        );
    } else {
        const quote = (arg: string) => `'${arg.replaceAll("'", "'\\''")}'`;
        const command = args.map(quote).join(" ");
        // Development windows need an explicit folder URI; use a writable remote scratch directory.
        await fs.writeFile(
            path.join(bin, "code"),
            `#!/bin/sh\nif [ "$1" = "--remote" ]; then\nexec ${command} "$@" --folder-uri "vscode-remote://$2/tmp"\nfi\nexec ${command} "$@"\n`,
            {mode: 0o755}
        );
    }
    process.env.PATH = `${bin}${path.delimiter}${process.env.PATH}`;
    process.env.HOME = home;
    process.env.USERPROFILE = home;
    process.env.APPDATA = appData;
    process.env.TEST_SSH_RESULT_PATH = path.join(root, "ssh-result.json");
    return path.join(home, ".ssh", "config");
}
