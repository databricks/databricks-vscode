import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { FakeFileEvents } from "../../test-support/fakeFiles";
import { useTempDirs } from "../../test-support/tempDir";
import {
    BundleFiles,
    externalWatchTargets,
    findRootFile,
    readBundleFiles,
    splitGlobBase,
} from "./BundleFiles";

const tempDir = useTempDirs();

describe("findRootFile", () => {
    it("finds the one root bundle file", async () => {
        const t = tempDir();
        t.write("databricks.yml", "bundle: {name: a}");
        t.write("sub/bundle.yml");
        expect(await findRootFile(t.dir)).toBe(t.path("databricks.yml"));
    });

    it.each(["databricks.yaml", "bundle.yml", "bundle.yaml"])("accepts %s", async (name) => {
        const t = tempDir();
        t.write(name);
        expect(await findRootFile(t.dir)).toBe(t.path(name));
    });

    it("finds none when there are two, as the CLI refuses that too", async () => {
        const t = tempDir();
        t.write("databricks.yml");
        t.write("bundle.yml");
        expect(await findRootFile(t.dir)).toBeUndefined();
    });

    it("finds none in a missing folder", async () => {
        expect(await findRootFile("/nonexistent/folder")).toBeUndefined();
    });
});

describe("readBundleFiles", () => {
    it("reads the root and the included files, in the order of the patterns", async () => {
        const t = tempDir();
        t.write("databricks.yml", "include: [resources/*.yml, extra.yml, resources/b.yml]");
        t.write("resources/b.yml", "b: 1");
        t.write("resources/a.yml", "a: 1");
        t.write("extra.yml", "extra: 1");
        const snapshot = await readBundleFiles(t.dir);
        expect(snapshot.files).toEqual([
            t.path("databricks.yml"),
            t.path("resources/a.yml"),
            t.path("resources/b.yml"),
            t.path("extra.yml"),
        ]);
        expect(snapshot.documents.slice(1)).toEqual([{ a: 1 }, { b: 1 }, { extra: 1 }]);
    });

    it("follows includes outside the project root", async () => {
        const t = tempDir();
        t.write("project/databricks.yml", "include: [../shared/*.yml]");
        t.write("shared/common.yml", "common: true");
        const snapshot = await readBundleFiles(t.path("project"));
        expect(snapshot.files).toEqual([
            t.path("project/databricks.yml"),
            t.path("shared/common.yml"),
        ]);
    });

    it("reports a file that doesn't parse, and still reads the others", async () => {
        const t = tempDir();
        t.write("databricks.yml", "include: [bad.yml, good.yml]");
        t.write("bad.yml", "a: [unclosed");
        t.write("good.yml", "good: true");
        const snapshot = await readBundleFiles(t.dir);
        expect(snapshot.errors.map((e) => e.file)).toEqual([t.path("bad.yml")]);
        expect(snapshot.documents).toEqual([
            { include: ["bad.yml", "good.yml"] },
            undefined,
            { good: true },
        ]);
    });

    it("allows more than 100 aliases (#1706)", async () => {
        const t = tempDir();
        const aliases = Array.from({ length: 150 }, (_, i) => `  k${i}: *a`).join("\n");
        t.write("databricks.yml", `anchor: &a {x: 1}\nrefs:\n${aliases}\n`);
        const snapshot = await readBundleFiles(t.dir);
        expect(snapshot.errors).toEqual([]);
    });

    it("has no files without a root file", async () => {
        const t = tempDir();
        t.write("other.yml");
        expect(await readBundleFiles(t.dir)).toEqual({
            root: t.dir,
            files: [],
            documents: [],
            errors: [],
        });
    });
});

describe("splitGlobBase", () => {
    it("splits at the first segment with glob characters", () => {
        expect(splitGlobBase(path.join("/a", "b", "sub", "**", "*.yml"))).toEqual({
            base: path.join("/a", "b", "sub"),
            pattern: "**/*.yml",
        });
    });

    it("treats a path without glob characters as a file", () => {
        expect(splitGlobBase(path.join("/a", "b", "file.yml"))).toEqual({
            base: path.join("/a", "b"),
            pattern: "file.yml",
        });
    });
});

describe("externalWatchTargets", () => {
    it("returns only the bases outside the root, once each", () => {
        const root = path.join("/w", "project");
        expect(
            externalWatchTargets(root, [
                "resources/*.yml",
                "../shared/*.yml",
                "../shared/*.yml",
                "../../other/x.yml",
            ]),
        ).toEqual([
            // Resolved, as the watcher gets them: on Windows with the drive.
            { base: path.resolve(root, "..", "shared"), pattern: "*.yml" },
            { base: path.resolve(root, "..", "..", "other"), pattern: "x.yml" },
        ]);
    });
});

describe("BundleFiles", () => {
    it("watches YAML under the root and at external include locations", async () => {
        const t = tempDir();
        t.write("project/databricks.yml", "include: [../shared/*.yml]");
        const files = new FakeFileEvents();
        const bundle = new BundleFiles(t.path("project"), files, 10);
        await bundle.read();
        expect(files.watched()).toEqual([
            `${t.path("project")} **/*.{yaml,yml}`,
            `${t.path("shared")} *.yml`,
        ]);
        bundle.dispose();
        expect(files.watched()).toEqual([]);
    });

    it("rewatches when the includes change", async () => {
        const t = tempDir();
        t.write("project/databricks.yml", "include: [../a/*.yml]");
        const files = new FakeFileEvents();
        const bundle = new BundleFiles(t.path("project"), files, 10);
        await bundle.read();
        t.write("project/databricks.yml", "include: [../b/*.yml]");
        await bundle.read();
        expect(files.watched()).toEqual([
            `${t.path("b")} *.yml`,
            `${t.path("project")} **/*.{yaml,yml}`,
        ]);
        bundle.dispose();
    });

    it("fires once per burst of events", async () => {
        vi.useFakeTimers();
        try {
            const files = new FakeFileEvents();
            const bundle = new BundleFiles("/w", files, 500);
            const fired = vi.fn();
            bundle.onDidChange(fired);
            files.touch("/w/databricks.yml");
            vi.advanceTimersByTime(300);
            files.touch("/w/resources/job.yml");
            vi.advanceTimersByTime(499);
            expect(fired).not.toHaveBeenCalled();
            vi.advanceTimersByTime(1);
            expect(fired).toHaveBeenCalledTimes(1);
            bundle.dispose();
        } finally {
            vi.useRealTimers();
        }
    });
});
