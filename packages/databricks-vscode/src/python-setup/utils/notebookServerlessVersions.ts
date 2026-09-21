import {VersionObservation} from "./serverlessVersionScoring";

/** The `.ipynb` top-level metadata key Databricks stores its notebook data under. */
const DATABRICKS_NOTEBOOK_METADATA_KEY =
    "application/vnd.databricks.v1+notebook";

/**
 * Collect serverless environment versions declared in a project's `.ipynb`
 * notebooks, as scoring observations (source `notebook`).
 *
 * A Databricks notebook records its serverless environment version at
 * `metadata["application/vnd.databricks.v1+notebook"].environmentMetadata
 * .environment_version` — the same bare-integer form (e.g. "5") the CLI's
 * `--serverless-version` flag takes. Note the mixed casing is intentional and
 * matches the exported `.ipynb` shape: the parent block `environmentMetadata`
 * is camelCase (like its `notebookName`/`notebookMetadata` siblings), while the
 * leaf `environment_version` (alongside `base_environment`, `dependencies`) is
 * snake_case. Do not "normalize" the leaf to camelCase — that would harvest
 * nothing. We look only inside that Databricks
 * metadata block (a plain Jupyter notebook has no such key and contributes
 * nothing), and defensively walk it for `environment_version` so a slightly
 * different nesting still resolves. Input is the already-parsed notebook JSON
 * (the caller reads and JSON-parses the files), so this stays pure and
 * unit-testable. Versions are de-duplicated, preserving first-seen order.
 */
export function collectNotebookServerlessVersions(
    notebooks: unknown[]
): VersionObservation[] {
    const versions: string[] = [];
    const seen = new Set<string>();

    for (const notebook of notebooks) {
        const dbMetadata = getDatabricksMetadata(notebook);
        const version = findEnvironmentVersion(dbMetadata);
        if (version !== undefined && !seen.has(version)) {
            seen.add(version);
            versions.push(version);
        }
    }

    return versions.map((version) => ({version, source: "notebook"}));
}

/** The Databricks notebook metadata block, or undefined if this isn't one. */
function getDatabricksMetadata(notebook: unknown): unknown {
    if (notebook === null || typeof notebook !== "object") {
        return undefined;
    }
    const metadata = (notebook as {metadata?: unknown}).metadata;
    if (metadata === null || typeof metadata !== "object") {
        return undefined;
    }
    return (metadata as Record<string, unknown>)[
        DATABRICKS_NOTEBOOK_METADATA_KEY
    ];
}

/**
 * Find the first `environment_version` anywhere under `node`, normalized to a
 * bare string. Defensive walk (the field normally sits under
 * `environmentMetadata`) that tolerates missing keys and string/`null` nodes.
 */
function findEnvironmentVersion(node: unknown): string | undefined {
    if (node === null || typeof node !== "object") {
        return undefined;
    }
    if (Array.isArray(node)) {
        for (const item of node) {
            const found = findEnvironmentVersion(item);
            if (found !== undefined) {
                return found;
            }
        }
        return undefined;
    }
    for (const [key, value] of Object.entries(node)) {
        if (key === "environment_version") {
            const version = normalizeVersion(value);
            if (version !== undefined) {
                return version;
            }
        } else {
            const found = findEnvironmentVersion(value);
            if (found !== undefined) {
                return found;
            }
        }
    }
    return undefined;
}

/**
 * Accept a scalar `environment_version` (string, or number since JSON may store
 * it unquoted) and return its bare-string form; reject empty strings and
 * non-scalar values.
 */
function normalizeVersion(value: unknown): string | undefined {
    if (typeof value === "number" && Number.isFinite(value)) {
        return String(value);
    }
    if (typeof value === "string" && value.trim().length > 0) {
        return value.trim();
    }
    return undefined;
}
