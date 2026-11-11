import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * The per-target choices in `.databricks/bundle/<target>/vscode.overrides.json`.
 * The format is the old `OverrideableConfigModel`'s, so either
 * extension can read what the other wrote. Keys this version doesn't know are
 * kept when it writes.
 */
export interface Overrides {
    /** The profile chosen for the target. */
    readonly authProfile?: string;
    /**
     * The user signed out of the target. New in this version; the old
     * extension ignores it and keeps it when it writes.
     */
    readonly signedOut?: boolean;
    /** The attached cluster (COMP-04). */
    readonly clusterId?: string;
    /** Serverless was chosen (`true`), or turned off by attaching a cluster (`false`). */
    readonly serverless?: boolean;
    /** The serverless environment version, bare (`"5"`), as `--serverless-version` takes it (COMP-02). */
    readonly serverlessVersion?: string;
    /** "Override Jobs cluster in bundle" (COMP-06). */
    readonly useClusterOverride?: boolean;
    readonly [key: string]: unknown;
}

/** The glob, relative to the project root, that matches every overrides file. */
export const OVERRIDES_GLOB = ".databricks/bundle/*/vscode.overrides.json";

/**
 * The values the user assigned to bundle variables for one target, in
 * `.databricks/bundle/<target>/vscode.bundlevars.json` (BNDL-13). Bundle CLI
 * calls receive each one as `BUNDLE_VAR_<name>`.
 */
export type VariableOverrides = Readonly<Record<string, string>>;

/** The glob, relative to the project root, that matches every variables file. */
export const VARIABLES_GLOB = ".databricks/bundle/*/vscode.bundlevars.json";

/**
 * Reads and writes one project's target files. The old root-level
 * `.databricks/bundle/vscode.overrides.json` isn't migrated.
 * Writes run one at a time, so read-modify-write can't lose an update.
 */
export class TargetFiles {
    private queue: Promise<void> = Promise.resolve();

    constructor(readonly root: string) {}

    overridesFile(target: string): string {
        return path.join(this.root, ".databricks", "bundle", target, "vscode.overrides.json");
    }

    variablesFile(target: string): string {
        return path.join(this.root, ".databricks", "bundle", target, "vscode.bundlevars.json");
    }

    /** `{}` when the file doesn't exist. Throws when it isn't a JSON object. */
    async readOverrides(target: string): Promise<Overrides> {
        return readJsonObject(this.overridesFile(target));
    }

    /**
     * The target's variable overrides; `{}` when the file doesn't exist.
     * Empty values are unset, as in the old `BundleVariableModel`; numbers
     * and booleans become strings, and other values are skipped. Throws when
     * the file isn't a JSON object.
     */
    async readVariables(target: string): Promise<VariableOverrides> {
        const data = await readJsonObject(this.variablesFile(target));
        const result: Record<string, string> = {};
        for (const [name, value] of Object.entries(data)) {
            if (typeof value === "string" && value.length > 0) {
                result[name] = value;
            } else if (typeof value === "number" || typeof value === "boolean") {
                result[name] = String(value);
            }
        }
        return result;
    }

    /**
     * Creates the target's variables file, holding `{}`, unless it exists.
     * An existing file is never rewritten, so the user's formatting and
     * values stay as they wrote them. Returns its path.
     */
    ensureVariablesFile(target: string): Promise<string> {
        return this.enqueue(async () => {
            const file = this.variablesFile(target);
            await mkdir(path.dirname(file), { recursive: true });
            try {
                await writeFile(file, JSON.stringify({}, null, 4), { flag: "wx" });
            } catch (e) {
                if ((e as NodeJS.ErrnoException).code !== "EEXIST") {
                    throw e;
                }
            }
            return file;
        });
    }

    /** Deletes the target's variables file, so every variable takes its bundle value again. */
    deleteVariables(target: string): Promise<void> {
        return this.enqueue(() => rm(this.variablesFile(target), { force: true }));
    }

    /** Sets one key, or removes it when `value` is undefined, keeping the others. */
    writeOverride<K extends keyof Overrides & string>(
        target: string,
        key: K,
        value: Overrides[K] | undefined,
    ): Promise<void> {
        return this.writeOverrides(target, { [key]: value } as Partial<Overrides>);
    }

    /** Sets several keys in one write; an undefined value removes its key. The others are kept. */
    writeOverrides(target: string, patch: Partial<Overrides>): Promise<void> {
        return this.enqueue(async () => {
            const data: Record<string, unknown> = { ...(await this.readOverrides(target)) };
            for (const [key, value] of Object.entries(patch)) {
                if (value === undefined) {
                    delete data[key];
                } else {
                    data[key] = value;
                }
            }
            const file = this.overridesFile(target);
            await mkdir(path.dirname(file), { recursive: true });
            await writeFile(file, JSON.stringify(data, null, 2));
        });
    }

    private enqueue<T>(write: () => Promise<T>): Promise<T> {
        const result = this.queue.then(write);
        this.queue = result.then(
            () => {},
            () => {},
        );
        return result;
    }
}

/** `{}` when the file doesn't exist or is empty. Throws when it isn't a JSON object. */
async function readJsonObject(file: string): Promise<Record<string, unknown>> {
    let content: string;
    try {
        content = await readFile(file, "utf-8");
    } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") {
            return {};
        }
        throw e;
    }
    if (content.trim() === "") {
        return {};
    }
    const data: unknown = JSON.parse(content);
    if (typeof data !== "object" || data === null || Array.isArray(data)) {
        throw new Error(`${file} doesn't hold a JSON object`);
    }
    return data as Record<string, unknown>;
}
