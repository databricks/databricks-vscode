import path from "node:path";

/**
 * The Python interpreter path inside a `.venv`, OS-aware: `Scripts\python.exe`
 * on Windows, `bin/python` elsewhere. The CLI reports the venv directory
 * (`venvPath`); the extension needs the concrete interpreter to hand to the MS
 * Python extension. `platform` is injectable so the behaviour is deterministic
 * in tests regardless of host OS.
 */
export function venvInterpreterPath(
    venvDir: string,
    platform: NodeJS.Platform = process.platform
): string {
    if (platform === "win32") {
        return path.win32.join(venvDir, "Scripts", "python.exe");
    }
    return path.posix.join(venvDir, "bin", "python");
}
