import type { ConfigurationChangeEvent, ConfigurationTarget, Disposable, Event } from "vscode";

/**
 * A VS Code setting. Settings are declared next to the code that owns them,
 * keep their old names, and are contributed in
 * `package.json` under the same `section.key`.
 */
export interface Setting<T> {
    readonly section: string;
    readonly key: string;
    readonly defaultValue: T;
}

export function setting<T>(section: string, key: string, defaultValue: T): Setting<T> {
    return { section, key, defaultValue };
}

export function settingId(s: Setting<unknown>): string {
    return `${s.section}.${s.key}`;
}

/** The subset of the `vscode.workspace` API that settings need. */
export interface ConfigurationApi {
    getConfiguration(section: string): {
        get(key: string): unknown;
        inspect(key: string):
            | {
                  readonly globalValue?: unknown;
                  readonly workspaceValue?: unknown;
                  readonly workspaceFolderValue?: unknown;
              }
            | undefined;
        update(key: string, value: unknown, target?: ConfigurationTarget): Thenable<void>;
    };
    onDidChangeConfiguration: Event<ConfigurationChangeEvent>;
}

/** Typed settings; the successor of `workspaceConfigs`. */
export class Settings {
    constructor(private readonly api: ConfigurationApi) {}

    get<T>(s: Setting<T>): T {
        return (this.api.getConfiguration(s.section).get(s.key) as T | undefined) ?? s.defaultValue;
    }

    /**
     * Whether the user set `s` at user, workspace or folder scope to a value
     * other than null or "". `inspect` reports only what was set, so a default
     * doesn't count.
     */
    isSetByUser(s: Setting<unknown>): boolean {
        const inspected = this.api.getConfiguration(s.section).inspect(s.key);
        return [
            inspected?.globalValue,
            inspected?.workspaceValue,
            inspected?.workspaceFolderValue,
        ].some((value) => value !== undefined && value !== null && value !== "");
    }

    update<T>(s: Setting<T>, value: T | undefined, target: ConfigurationTarget): Thenable<void> {
        return this.api.getConfiguration(s.section).update(s.key, value, target);
    }

    /** Fires when `s` changes; the caller owns the returned disposable. */
    onDidChange(s: Setting<unknown>, listener: () => void): Disposable {
        const id = settingId(s);
        return this.api.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration(id)) {
                listener();
            }
        });
    }
}

/**
 * Resolves `${workspaceFolder}`, `${workspaceRoot}` and `${cwd}` in a setting
 * value against `workspacePath`. Unknown variables are left as they are.
 */
export function resolveSystemVariables(value: string, workspacePath: string): string {
    const known = new Set(["cwd", "workspaceRoot", "workspaceFolder"]);
    return value.replace(/\$\{(.*?)\}/g, (match, name: string) =>
        known.has(name) ? workspacePath : match,
    );
}
