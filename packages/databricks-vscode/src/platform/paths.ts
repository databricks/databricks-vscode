import path from "node:path";

/** A path as this platform compares paths: normalised, and caseless on Windows. */
export function pathKey(p: string): string {
    const normalized = path.normalize(p);
    return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

/** Whether two paths name the same place on this platform. */
export function samePath(a: string, b: string): boolean {
    return pathKey(a) === pathKey(b);
}
