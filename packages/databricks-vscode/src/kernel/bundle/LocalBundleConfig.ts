/**
 * What the extension reads from the bundle's YAML in-process, before the CLI
 * validates it ("Local bundle config"): the targets, with their
 * host, mode, `workspace.profile` and `default` flag. Ported from the old
 * `BundlePreValidateModel`. Everything else comes from `bundle validate`.
 */

type TargetMode = "development" | "staging" | "production";

export interface LocalTarget {
    readonly name: string;
    /** `workspace.host`, merged with the top-level `workspace`, as written. */
    readonly host?: string;
    /** `workspace.profile`, merged the same way. */
    readonly profile?: string;
    readonly mode?: TargetMode;
    readonly default: boolean;
}

/** A top-level `variables` definition, as written. */
export interface LocalVariable {
    readonly description?: string;
    readonly type?: string;
    readonly default?: unknown;
}

export interface LocalBundleConfig {
    /** `bundle.name`. */
    readonly name?: string;
    /** The top-level variable definitions, before a target overrides them. */
    readonly variables: Readonly<Record<string, LocalVariable>>;
    /** In the order the YAML declares them. */
    readonly targets: readonly LocalTarget[];
    /** The target marked `default: true`, if any. */
    readonly defaultTarget?: string;
}

type YamlObject = Record<string, unknown>;

const isObject = (v: unknown): v is YamlObject =>
    typeof v === "object" && v !== null && !Array.isArray(v);

const asString = (v: unknown): string | undefined =>
    typeof v === "string" && v.trim() !== "" ? v : undefined;

/**
 * Deep-merges the root file and the included files, in order. Objects merge
 * key by key and later files win, as `lodash.merge` did in the old
 * `BundleFileSet`. Arrays and scalars are replaced.
 */
export function mergeBundleDocuments(documents: readonly unknown[]): YamlObject {
    const merge = (into: YamlObject, from: YamlObject): YamlObject => {
        for (const [key, value] of Object.entries(from)) {
            const existing = into[key];
            into[key] =
                isObject(existing) && isObject(value) ? merge({ ...existing }, value) : value;
        }
        return into;
    };
    return documents.filter(isObject).reduce<YamlObject>((acc, doc) => merge(acc, doc), {});
}

/** The local config of a bundle, from its parsed files (root first). */
export function localBundleConfig(documents: readonly unknown[]): LocalBundleConfig {
    const bundle = mergeBundleDocuments(documents);
    const topWorkspace = isObject(bundle.workspace) ? bundle.workspace : {};
    const targets: LocalTarget[] = [];
    for (const [name, raw] of Object.entries(isObject(bundle.targets) ? bundle.targets : {})) {
        // `targets: {dev: }` parses as null: a target with no settings.
        const target = isObject(raw) ? raw : {};
        const workspace = {
            ...topWorkspace,
            ...(isObject(target.workspace) ? target.workspace : {}),
        };
        const mode = asString(target.mode);
        targets.push({
            name,
            host: asString(workspace.host),
            profile: asString(workspace.profile),
            mode:
                mode === "development" || mode === "staging" || mode === "production"
                    ? mode
                    : undefined,
            default: target.default === true,
        });
    }
    const variables: Record<string, LocalVariable> = {};
    for (const [name, raw] of Object.entries(isObject(bundle.variables) ? bundle.variables : {})) {
        // The short form, `name: value`, is a default.
        const definition = isObject(raw) ? raw : { default: raw };
        variables[name] = {
            description: asString(definition.description),
            type: asString(definition.type),
            default: definition.default ?? undefined,
        };
    }
    return {
        name: isObject(bundle.bundle) ? asString(bundle.bundle.name) : undefined,
        variables,
        targets,
        defaultTarget: targets.find((t) => t.default)?.name,
    };
}

/** The include patterns of the root file, as written. */
export function includePatterns(root: unknown): string[] {
    if (!isObject(root) || !Array.isArray(root.include)) {
        return [];
    }
    return root.include.filter((p): p is string => typeof p === "string" && p.trim() !== "");
}
