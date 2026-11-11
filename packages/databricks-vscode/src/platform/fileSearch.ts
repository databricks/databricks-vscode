/**
 * Finds the files under `base` that match the glob `pattern` (relative to
 * `base`) and not the glob `exclude`, and returns their paths.
 */
export interface FileSearch {
    find(base: string, pattern: string, exclude: string): Promise<string[]>;
}

/** Finds nothing: for tests and hosts without a search. */
export const noFileSearch: FileSearch = { find: async () => [] };
