import {readFile} from "fs/promises";
import path from "path";
import {VersionObservation} from "./serverlessVersionScoring";

/**
 * The table the environments team writes the serverless environment version
 * into, and the key it holds:
 *
 *   [tool.databricks.environment]
 *   environment_version = "4"
 *
 * This is an explicit user declaration -- the CLI writes it during a serverless
 * setup-local run -- so it is the strongest scoring signal (see WEIGHTS in
 * {@link ./serverlessVersionScoring}), stronger than the heuristics gathered
 * from bundle YAML or notebook metadata.
 */
const TABLE_HEADER = /^\[\s*tool\s*\.\s*databricks\s*\.\s*environment\s*\]$/;
const ENVIRONMENT_VERSION_KEY = /^environment_version\s*=\s*(.*)$/;

/**
 * Collect the serverless environment version declared in a `pyproject.toml`, as
 * a scoring observation (source `pyproject`).
 *
 * Deliberately a bounded, comment-aware line scan rather than a full TOML parse
 * (the same approach as {@link ../../language/packageManagerDetection}, so no
 * TOML dependency is pulled in): it reads `environment_version` only from the
 * canonical `[tool.databricks.environment]` table the CLI writes. A key of the
 * same name in another table, or a dotted-key / inline-table spelling, is not
 * harvested -- acceptable because the paired CLI work writes the canonical block
 * form. The value's range validity is not checked here; the scorer drops
 * anything the `--serverless-version` flag would reject.
 *
 * Pure over the file contents; returns [] for undefined input or when the table
 * or key is absent.
 */
export function collectPyprojectServerlessVersion(
    contents: string | undefined
): VersionObservation[] {
    if (contents === undefined) {
        return [];
    }

    let inTargetTable = false;
    for (const rawLine of contents.split(/\r?\n/)) {
        // Strip a trailing comment, matching the sibling pyproject scans. A `#`
        // inside a quoted value would be mishandled, but the version value is a
        // bare integer string, so this never arises in practice.
        const line = rawLine.split("#", 1)[0].trim();
        if (line.length === 0) {
            continue;
        }
        // Any table header ends the target section; only the exact canonical
        // header (re)enters it, so a subtable like
        // `[tool.databricks.environment.extra]` is treated as a different table.
        if (line.startsWith("[")) {
            inTargetTable = TABLE_HEADER.test(line);
            continue;
        }
        if (!inTargetTable) {
            continue;
        }
        const match = ENVIRONMENT_VERSION_KEY.exec(line);
        if (match !== null) {
            const version = normalizeVersion(match[1]);
            return version === undefined
                ? []
                : [{version, source: "pyproject"}];
        }
    }
    return [];
}

/**
 * Read a project's root `pyproject.toml` and collect its serverless environment
 * version. Thin I/O wrapper over {@link collectPyprojectServerlessVersion}: a
 * missing or unreadable file contributes nothing rather than throwing into the
 * flow that asked.
 */
export async function collectProjectPyprojectVersion(
    projectRoot: string
): Promise<VersionObservation[]> {
    let contents: string;
    try {
        contents = await readFile(
            path.join(projectRoot, "pyproject.toml"),
            "utf-8"
        );
    } catch {
        return [];
    }
    return collectPyprojectServerlessVersion(contents);
}

/**
 * Strip an optional pair of matching quotes from a raw TOML value and return its
 * bare-string form; reject empty values. Accepts an unquoted (numeric) value
 * too, mirroring the tolerance of the bundle/notebook collectors.
 */
function normalizeVersion(rawValue: string): string | undefined {
    let value = rawValue.trim();
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.endsWith(quote)) {
        value = value.slice(1, -1);
    }
    return value.length > 0 ? value : undefined;
}
