import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * The part of the `tmp` package the old tests use, so their bodies are
 * ported unchanged: a temporary directory and the callback that removes it.
 */
export function dirSync(_options: { unsafeCleanup?: boolean } = {}): {
    name: string;
    removeCallback: () => void;
} {
    const name = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "databricks-vscode-")));
    return { name, removeCallback: () => fs.rmSync(name, { recursive: true, force: true }) };
}
