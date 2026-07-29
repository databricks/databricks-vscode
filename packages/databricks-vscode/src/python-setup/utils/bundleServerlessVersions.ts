import {VersionObservation} from "./serverlessVersionScoring";

/**
 * Collect serverless environment versions declared in a parsed bundle, as
 * scoring observations (source `bundleYaml`).
 *
 * Serverless environment specs carry an `environment_version` field -- "a
 * string consisting of an integer" (e.g. "5"), the same bare form the CLI's
 * `--serverless-version` flag takes. That field is specific to serverless
 * environment specs, so rather than hard-code the (deep, and every-level
 * `object | string`) job/pipeline/task nesting, we defensively walk the whole
 * parsed object and pick up every `environment_version` we find. This tolerates
 * unresolved `${var...}` string nodes and schema shape changes without
 * throwing. Versions are de-duplicated, preserving first-seen order.
 */
export function collectBundleServerlessVersions(
    bundle: unknown
): VersionObservation[] {
    const versions: string[] = [];
    const seen = new Set<string>();

    const visit = (node: unknown) => {
        if (node === null || typeof node !== "object") {
            return;
        }
        if (Array.isArray(node)) {
            for (const item of node) {
                visit(item);
            }
            return;
        }
        for (const [key, value] of Object.entries(node)) {
            if (key === "environment_version") {
                const version = normalizeVersion(value);
                if (version !== undefined && !seen.has(version)) {
                    seen.add(version);
                    versions.push(version);
                }
            } else {
                visit(value);
            }
        }
    };

    visit(bundle);

    return versions.map((version) => ({version, source: "bundleYaml"}));
}

/**
 * Accept a scalar `environment_version` (string or number, since unquoted YAML
 * parses as a number) and return its bare-string form; reject empty strings and
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
