import path from "node:path";

/**
 * `p` resolved, as VS Code's `Uri.fsPath` spells it: on Windows with a lower-case drive letter
 * (`c:\…`), where Node and the environment give `C:\…`.
 */
export function vscodePath(p: string): string {
    const resolved = path.resolve(p);
    return process.platform === "win32"
        ? resolved.replace(/^[A-Z]:/, (drive) => drive.toLowerCase())
        : resolved;
}

/** Whether `a` and `b` are the same path, whichever case their drive letters have. */
export function samePath(a: string, b: string): boolean {
    return vscodePath(a) === vscodePath(b);
}
