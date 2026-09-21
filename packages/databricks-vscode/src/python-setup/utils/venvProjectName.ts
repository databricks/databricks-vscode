import {readFile} from "node:fs/promises";
import path from "node:path";

/**
 * Pull the human-readable environment name out of a venv's `pyvenv.cfg`
 * `prompt` line. uv sets `prompt` to pyproject's `[project].name`, falling back
 * to the project folder name — the same label a shell shows on activation and a
 * friendlier handle than the bare `.venv` folder. Returns undefined when there
 * is no usable `prompt`, so callers fall back to the plain folder name.
 */
export function parsePyvenvPrompt(contents: string): string | undefined {
    for (const line of contents.split(/\r?\n/)) {
        const match = /^\s*prompt\s*=\s*(.*)$/.exec(line);
        if (match) {
            const value = match[1].trim();
            return value.length > 0 ? value : undefined;
        }
    }
    return undefined;
}

/**
 * Best-effort read of the venv's project name from `<venvDir>/pyvenv.cfg`. The
 * name only enriches the success summary, so this never throws: a missing or
 * unreadable file, or one without a `prompt`, yields undefined and the caller
 * shows the bare `.venv` folder name instead.
 */
export async function readVenvProjectName(
    venvDir: string
): Promise<string | undefined> {
    try {
        const contents = await readFile(
            path.join(venvDir, "pyvenv.cfg"),
            "utf-8"
        );
        return parsePyvenvPrompt(contents);
    } catch {
        return undefined;
    }
}
