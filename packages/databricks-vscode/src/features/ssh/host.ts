import { stat } from "node:fs/promises";
import path from "node:path";
import type { SshIde } from "../../kernel/cli/commands/ssh";
import { REMOTE_SSH_CURSOR, REMOTE_SSH_VSCODE } from "../../kernel/extensionDependencies";
import type { ExtensionDependency } from "../../platform/extensions";
import type { Logger } from "../../platform/log";
import type { ProcessRunner } from "../../platform/process";

/*
 * The editor the tunnel opens its remote window in, and the two things that
 * window needs on this machine: the editor's shell command (`code` or
 * `cursor`), which `databricks ssh connect` runs, and its Remote-SSH
 * extension. Ported from the old `utils/hostUtils.ts`.
 */

/** The host editor, from `vscode.env.uriScheme`: `cursor` in Cursor, VS Code otherwise. */
export function hostIde(uriScheme: string): SshIde {
    return uriScheme === "cursor" ? "cursor" : "vscode";
}

/**
 * The editor's shell command, as the CLI resolves `--ide`. VS Code Insiders
 * ships `code-insiders`, but the CLI always runs `code`, so `code` is what
 * is probed there too.
 */
export function hostCliCommand(ide: SshIde): "code" | "cursor" {
    return ide === "cursor" ? "cursor" : "code";
}

/**
 * The editor's shell command inside its install folder, or undefined. The
 * CLI is passed it as DATABRICKS_SSH_IDE_COMMAND, so the tunnel opens its
 * window without the command on PATH, which is often missing: users skip
 * "Install shell command" or "Add to PATH" when they install the editor.
 * `appRoot` is `env.appRoot` (`<install>/resources/app`, or the app bundle's
 * `Contents/Resources/app` on macOS).
 */
export async function findHostCliInInstall(
    ide: SshIde,
    appRoot: string,
    platform: NodeJS.Platform,
): Promise<string | undefined> {
    const name = hostCliCommand(ide) + (platform === "win32" ? ".cmd" : "");
    const candidates = [
        // bin/ under the app: the macOS app bundle, and Windows and Linux builds that ship it there.
        path.join(appRoot, "bin", name),
        // ../../bin: the Linux and Windows install folder.
        path.join(appRoot, "..", "..", "bin", name),
        // ../../../bin: Windows builds with versioned updates, which nest the app one folder deeper.
        path.join(appRoot, "..", "..", "..", "bin", name),
    ];
    for (const candidate of candidates) {
        if (await isFile(candidate)) {
            return candidate;
        }
    }
    return undefined;
}

async function isFile(file: string): Promise<boolean> {
    try {
        return (await stat(file)).isFile();
    } catch {
        return false;
    }
}

/** The Remote-SSH extension the CLI configures and opens the window with, per editor. */
export function remoteSshExtension(ide: SshIde): ExtensionDependency {
    return ide === "cursor" ? REMOTE_SSH_CURSOR : REMOTE_SSH_VSCODE;
}

/** Where to read how to put the shell command on PATH. */
export function pathSetupDocs(ide: SshIde): string {
    return ide === "cursor"
        ? "https://docs.cursor.com/en/cli/installation"
        : "https://code.visualstudio.com/docs/setup/setup-overview";
}

export interface HostCliProbe {
    readonly processes: ProcessRunner;
    readonly env: Readonly<Record<string, string | undefined>>;
    readonly platform: NodeJS.Platform;
    readonly log: Logger;
    /** How long the login shell may take. */
    readonly timeoutMs?: number;
}

/**
 * Whether the shell command is definitely missing from PATH. Advisory: only
 * a clear "not found" says false; a slow or broken shell profile, or a
 * spawn error, is logged and says true, so the tunnel isn't blamed on it.
 *
 * The terminal that runs `ssh connect` sources the user's shell profile,
 * and the extension host doesn't, so on POSIX the probe asks a login,
 * interactive shell (`$SHELL -ilc 'command -v code'`), as the old
 * `shell-env` probe did. On Windows there is no profile; `where` searches
 * PATH and PATHEXT.
 */
export async function isHostCliOnPath(command: string, probe: HostCliProbe): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), probe.timeoutMs ?? 10_000);
    try {
        const result =
            probe.platform === "win32"
                ? await probe.processes.run("where", [command], {
                      env: { ...probe.env },
                      signal: controller.signal,
                      closeStdin: true,
                  })
                : await probe.processes.run(
                      probe.env.SHELL || "/bin/sh",
                      ["-ilc", `command -v ${command}`],
                      {
                          // oh-my-zsh would otherwise offer to update itself and wait.
                          env: { ...probe.env, DISABLE_AUTO_UPDATE: "true" },
                          signal: controller.signal,
                          closeStdin: true,
                      },
                  );
        if (result.cancelled) {
            probe.log.warn(`Probing for "${command}" on PATH timed out`);
            return true;
        }
        return result.exitCode === 0;
    } catch (e) {
        probe.log.error(`Failed to probe for "${command}" on PATH`, e);
        return true;
    } finally {
        clearTimeout(timer);
    }
}
