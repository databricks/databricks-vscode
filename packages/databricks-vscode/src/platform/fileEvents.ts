/**
 * Watches files under `base` that match the glob `pattern` (relative to
 * `base`), and reports the path of every created, changed or deleted file.
 */
export interface FileEvents {
    watch(base: string, pattern: string, onEvent: (file: string) => void): { dispose(): void };
}

/** Watches nothing: for tests and windows without folders. */
export const noFileEvents: FileEvents = { watch: () => ({ dispose: () => {} }) };
