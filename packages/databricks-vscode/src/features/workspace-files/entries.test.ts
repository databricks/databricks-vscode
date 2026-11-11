import { posix } from "node:path";
import { describe, expect, it } from "vitest";
import {
    childPath,
    entryUrl,
    isDirectory,
    isFile,
    isNotebook,
    isRepo,
    notebookPath,
    sortEntries,
    toEntry,
    type WorkspaceEntry,
} from "./entries";

const entry = (path: string, type: WorkspaceEntry["type"]): WorkspaceEntry => ({
    path,
    type,
    id: 12345,
});

describe("entries", () => {
    // Ported from sdk-extensions/wsfs/utils.test.ts.
    it("discriminates files", () => {
        const file = entry("/file", "FILE");
        expect([isFile(file), isNotebook(file), isDirectory(file), isRepo(file)]).toEqual([
            true,
            false,
            false,
            false,
        ]);
    });

    it("discriminates notebooks", () => {
        const notebook = entry("/notebook", "NOTEBOOK");
        expect([
            isFile(notebook),
            isNotebook(notebook),
            isDirectory(notebook),
            isRepo(notebook),
        ]).toEqual([true, true, false, false]);
    });

    it("discriminates directories", () => {
        const dir = entry("/dir", "DIRECTORY");
        expect([isFile(dir), isNotebook(dir), isDirectory(dir), isRepo(dir)]).toEqual([
            false,
            false,
            true,
            false,
        ]);
    });

    it("discriminates repos", () => {
        const repo = entry("/repo", "REPO");
        expect([isFile(repo), isNotebook(repo), isDirectory(repo), isRepo(repo)]).toEqual([
            false,
            false,
            true,
            true,
        ]);
    });

    // Ported from sdk-extensions/wsfs/WorkspaceFsDir.test.ts.
    it("resolves child paths only at or below the root", () => {
        const root = "/root/a/b";
        expect(childPath(root, root)).toBe(root);
        expect(childPath(root, posix.resolve(root, "..", ".."))).toBeUndefined();
        expect(childPath(root, posix.resolve(root, ".."))).toBeUndefined();
        expect(childPath(root, posix.resolve(root, "c", "..", ".."))).toBeUndefined();
        expect(childPath(root, posix.resolve(root, "c", "d"))).toBe(posix.resolve(root, "c", "d"));
        expect(childPath(root, "c")).toBe("/root/a/b/c");
        expect(childPath(root, "../x")).toBeUndefined();
    });

    it("skips objects without a path, an ID, or a type the explorer shows", () => {
        expect(
            toEntry({
                path: "/a",
                objectType: "FILE",
                objectId: 1234123412341234n,
                language: undefined,
                size: 3n,
                createdAt: 1700000000000n,
                modifiedAt: 1700000000133n,
            }),
        ).toEqual({
            path: "/a",
            type: "FILE",
            id: 1234123412341234,
            size: 3,
            createdAt: 1700000000000,
            modifiedAt: 1700000000133,
        });
        const partial = {
            language: undefined,
            size: undefined,
            createdAt: undefined,
            modifiedAt: undefined,
        };
        expect(toEntry({ ...partial, path: "/d", objectType: "DIRECTORY", objectId: 5n })).toEqual({
            path: "/d",
            type: "DIRECTORY",
            id: 5,
        });
        expect(
            toEntry({ ...partial, path: "/a", objectType: "LIBRARY", objectId: 1n }),
        ).toBeUndefined();
        expect(
            toEntry({ ...partial, path: "/a", objectType: "FILE", objectId: undefined }),
        ).toBeUndefined();
        expect(
            toEntry({ ...partial, path: undefined, objectType: "FILE", objectId: 1n }),
        ).toBeUndefined();
    });

    it("builds the old links, from the host's origin", () => {
        const host = "https://a.cloud.databricks.com/?o=123";
        expect(entryUrl(host, entry("/d", "DIRECTORY"))).toBe(
            "https://a.cloud.databricks.com/browse/folders/12345",
        );
        expect(entryUrl(host, entry("/r", "REPO"))).toBe(
            "https://a.cloud.databricks.com/browse/folders/12345",
        );
        expect(entryUrl(host, entry("/f", "FILE"))).toBe(
            "https://a.cloud.databricks.com/editor/files/12345",
        );
        expect(entryUrl(host, entry("/n", "NOTEBOOK"))).toBe(
            "https://a.cloud.databricks.com/editor/notebooks/12345",
        );
    });

    it("sorts the well-known folders first, then directories, then by path", () => {
        const sorted = sortEntries(
            [
                entry("/z.py", "FILE"),
                entry("/Repos/me", "DIRECTORY"),
                entry("/b", "DIRECTORY"),
                entry("/Shared", "DIRECTORY"),
                entry("/a.py", "FILE"),
                entry("/Users", "DIRECTORY"),
                entry("/a", "DIRECTORY"),
                entry("/Repos", "DIRECTORY"),
                entry("/Users/me", "DIRECTORY"),
                entry("/nb", "NOTEBOOK"),
            ],
            "me",
        );
        expect(sorted.map((e) => e.path)).toEqual([
            "/Users",
            "/Shared",
            "/Repos",
            "/Users/me",
            "/Repos/me",
            "/a",
            "/b",
            "/a.py",
            "/nb",
            "/z.py",
        ]);
    });

    // Ported from the old WorkspaceFsDataProvider.test.ts (databricks/databricks-vscode#2233).
    it("sorts directories alphabetically", () => {
        const sorted = sortEntries(
            [
                entry("/root/reports", "DIRECTORY"),
                entry("/root/alpha", "DIRECTORY"),
                entry("/root/.hidden", "DIRECTORY"),
                entry("/root/beta", "DIRECTORY"),
            ],
            "me",
        );
        expect(sorted.map((e) => e.path)).toEqual([
            "/root/.hidden",
            "/root/alpha",
            "/root/beta",
            "/root/reports",
        ]);
    });

    it("groups directories and repos before files, each alphabetical", () => {
        const sorted = sortEntries(
            [
                entry("/root/file.py", "FILE"),
                entry("/root/zeta", "DIRECTORY"),
                entry("/root/data.csv", "NOTEBOOK"),
                entry("/root/myrepo", "REPO"),
                entry("/root/alpha", "DIRECTORY"),
            ],
            "me",
        );
        expect(sorted.map((e) => e.path)).toEqual([
            "/root/alpha",
            "/root/myrepo",
            "/root/zeta",
            "/root/data.csv",
            "/root/file.py",
        ]);
    });

    it("strips a notebook's extension, as import stores it", () => {
        expect(notebookPath("/Users/me/nb.ipynb")).toBe("/Users/me/nb");
        expect(notebookPath("/Users/me/NB.IPYNB")).toBe("/Users/me/NB");
        expect(notebookPath("/Users/me/a.py")).toBe("/Users/me/a");
        expect(notebookPath("/Users/me/a.txt")).toBe("/Users/me/a.txt");
    });
});
