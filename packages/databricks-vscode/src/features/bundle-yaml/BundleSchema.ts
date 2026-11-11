import fs from "node:fs/promises";
import path from "node:path";
import type { Logger } from "../../platform/log";

/** The schema's URI scheme, and the URI every bundle file is mapped to (the old ones). */
const SCHEMA_SCHEME = "dabs";
export const ROOT_SCHEMA_URI = `${SCHEMA_SCHEME}:///declarative-automation-bundles.json`;

/** The part of `redhat.vscode-yaml`'s exported API used here. */
export interface YamlExtensionApi {
    registerContributor(
        schema: string,
        requestSchema: (resource: string) => string | undefined,
        requestSchemaContent: (uri: string) => string | undefined,
    ): boolean;
}

export interface BundleSchemaDeps {
    /** The running CLI's version; undefined when it can't be read. */
    readonly cliVersion: () => Promise<string | undefined>;
    /** `databricks bundle schema`. */
    readonly generate: () => Promise<string>;
    /** Where schemas are cached, one file per CLI version. */
    readonly cacheDir: string;
    readonly log: Logger;
}

/**
 * The bundle JSON schema (BNDL-04). `bundle schema` prints about 1 MB and
 * depends only on the CLI, so the output is cached per CLI version and the
 * CLI runs once per version, not at every activation. A version that
 * isn't a release (a dev build) isn't cached.
 */
export async function loadBundleSchema(deps: BundleSchemaDeps): Promise<string> {
    const version = await deps.cliVersion();
    const cacheable = version !== undefined && /^\d+\.\d+\.\d+$/.test(version);
    const file = path.join(deps.cacheDir, `bundle-schema-${version}.json`);
    if (cacheable) {
        try {
            const cached = await fs.readFile(file, "utf-8");
            JSON.parse(cached);
            return cached;
        } catch {
            // Missing or damaged: generate it again.
        }
    }
    const schema = await deps.generate();
    if (cacheable) {
        try {
            await fs.mkdir(deps.cacheDir, { recursive: true });
            await removeOtherVersions(deps.cacheDir, path.basename(file));
            await fs.writeFile(file, schema, "utf-8");
        } catch (e) {
            deps.log.warn("Can't cache the bundle schema", e);
        }
    }
    return schema;
}

/** Keeps one cached schema: older CLIs' are never read again. */
async function removeOtherVersions(dir: string, keep: string): Promise<void> {
    for (const name of await fs.readdir(dir)) {
        if (name !== keep && /^bundle-schema-.*\.json$/.test(name)) {
            await fs.rm(path.join(dir, name), { force: true });
        }
    }
}

/**
 * Maps the active project's bundle files to the schema. The files are read
 * at each request, so files included later are covered without re-registering
 * (the YAML extension has no way to unregister a contributor).
 */
export function registerSchemaContributor(
    api: YamlExtensionApi,
    bundleFiles: () => readonly string[],
    schema: string,
    toFsPath: (uri: string) => string | undefined,
): boolean {
    return api.registerContributor(
        SCHEMA_SCHEME,
        (resource) => {
            const file = toFsPath(resource);
            return file !== undefined && bundleFiles().some((f) => samePath(f, file))
                ? ROOT_SCHEMA_URI
                : undefined;
        },
        (uri) => (uri.startsWith(`${SCHEMA_SCHEME}:`) ? schema : undefined),
    );
}

function samePath(a: string, b: string): boolean {
    const [x, y] = [path.normalize(a), path.normalize(b)];
    return process.platform === "win32" ? x.toLowerCase() === y.toLowerCase() : x === y;
}
