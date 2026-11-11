/**
 * A when-clause context key. Each key is declared by the module that owns it
 * and listed in its feature's `contextKeys`, which the manifest contract test
 * checks against every `databricks.*` identifier in `package.json`.
 */
export interface ContextKey<T extends ContextValue> {
    readonly name: string;
    /** Only for type inference. */
    readonly _type?: T;
}

export type ContextValue = boolean | string | number | readonly string[];

export function contextKey<T extends ContextValue>(name: string): ContextKey<T> {
    return { name };
}

export type SetContext = (name: string, value: unknown) => Thenable<unknown>;

/** The only caller of `setContext`. */
export class ContextKeys {
    private readonly values = new Map<string, unknown>();

    constructor(private readonly setContext: SetContext) {}

    /** Skips the round trip to the workbench when the value is unchanged. */
    async set<T extends ContextValue>(key: ContextKey<T>, value: T): Promise<void> {
        if (this.values.has(key.name) && this.values.get(key.name) === value) {
            return;
        }
        this.values.set(key.name, value);
        await this.setContext(key.name, value);
    }

    get<T extends ContextValue>(key: ContextKey<T>): T | undefined {
        return this.values.get(key.name) as T | undefined;
    }
}
