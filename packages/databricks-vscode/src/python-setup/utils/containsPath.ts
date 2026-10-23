import path from "node:path";

/** Whether `child` is `parent` or a path inside it, compared by text. */
export function containsPath(parent: string, child: string): boolean {
    const rel = path.relative(parent, child);
    return (
        rel !== ".." &&
        !rel.startsWith(".." + path.sep) &&
        !path.isAbsolute(rel)
    );
}
