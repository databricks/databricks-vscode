import { glob } from "tinyglobby";
import type { FileSearch } from "../platform/fileSearch";

/**
 * `FileSearch` under Node, searching as `workspace.findFiles` does: files
 * only, so a folder named like a match doesn't count, nor what it holds; dot
 * files included; linked folders followed; case-sensitive. It doesn't read
 * `files.exclude` or `search.followSymlinks`; the e2e suite checks those
 * against VS Code.
 */
export const globFileSearch: FileSearch = {
    find: (base, pattern, exclude) =>
        glob(pattern, {
            cwd: base,
            absolute: true,
            onlyFiles: true,
            expandDirectories: false,
            dot: true,
            followSymbolicLinks: true,
            caseSensitiveMatch: true,
            ignore: [exclude],
        }),
};
