import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach } from "vitest";

/**
 * A temporary directory, removed after the test. `write` creates files
 * relative to it, with their parent folders.
 */
export function useTempDirs() {
    const dirs: string[] = [];
    afterEach(() => {
        for (const dir of dirs.splice(0)) {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });
    return () => {
        // `.native`, as the extension's `realpath` is: on Windows it also expands 8.3 short
        // names (a runner's TEMP is `C:\Users\RUNNER~1\...`), which the JS one keeps.
        const dir = fs.realpathSync.native(
            fs.mkdtempSync(path.join(os.tmpdir(), "databricks-vscode-")),
        );
        dirs.push(dir);
        return {
            dir,
            path: (...segments: string[]) => path.join(dir, ...segments),
            write(relative: string, content = "") {
                const file = path.join(dir, relative);
                fs.mkdirSync(path.dirname(file), { recursive: true });
                fs.writeFileSync(file, content);
                return file;
            },
        };
    };
}
