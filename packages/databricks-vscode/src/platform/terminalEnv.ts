/** The subset of `vscode.EnvironmentVariableCollection` the extension writes. */
export interface TerminalEnvCollection {
    persistent: boolean;
    /** A string or a `MarkdownString`. */
    description: string | object | undefined;
    clear(): void;
    append(name: string, value: string): void;
    replace(name: string, value: string): void;
}

/** A collection that keeps its variables in memory, for windows and tests without a real one. */
export function memoryTerminalEnv(): TerminalEnvCollection & {
    readonly variables: Map<string, { kind: "append" | "replace"; value: string }>;
} {
    const variables = new Map<string, { kind: "append" | "replace"; value: string }>();
    return {
        variables,
        persistent: true,
        description: undefined,
        clear: () => variables.clear(),
        append: (name, value) => void variables.set(name, { kind: "append", value }),
        replace: (name, value) => void variables.set(name, { kind: "replace", value }),
    };
}
