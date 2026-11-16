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

/** A search that answers, with what `globFileSearch` finds then, only once the test calls `release`. */
export function heldFileSearch() {
    const held: (() => void)[] = [];
    const search: FileSearch = {
        find: (base, pattern, exclude) =>
            new Promise((resolve, reject) =>
                held.push(
                    () => void globFileSearch.find(base, pattern, exclude).then(resolve, reject),
                ),
            ),
    };
    return {
        search,
        /** How many searches wait to be released. */
        held: () => held.length,
        release: () => held.splice(0).forEach((answer) => answer()),
    };
}
