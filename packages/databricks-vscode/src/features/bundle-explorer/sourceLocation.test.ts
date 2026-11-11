import path from "node:path";
import { describe, expect, it } from "vitest";
import type { BundleLocations } from "../../kernel/cli/commands/bundle";
import { getSourceLocation } from "./sourceLocation";

/** Ported from the old `SourceLocationUtils.test.ts`. */
describe("getSourceLocation", () => {
    const root = "/project/root";
    const key = "test-resource";
    const locations = (value: unknown) => value as BundleLocations;

    it("is undefined without locations", () => {
        expect(getSourceLocation(undefined, root, key)).toBeUndefined();
    });

    it("is undefined for another version", () => {
        expect(
            getSourceLocation(locations({ version: 2, locations: {}, files: [] }), root, key),
        ).toBeUndefined();
    });

    it("is undefined without the locations or the files", () => {
        expect(getSourceLocation(locations({ version: 1, files: [] }), root, key)).toBeUndefined();
        expect(
            getSourceLocation(locations({ version: 1, locations: {} }), root, key),
        ).toBeUndefined();
    });

    it("is undefined when the resource isn't listed", () => {
        expect(
            getSourceLocation(
                locations({ version: 1, locations: { unknown: [[0, 1, 1]] }, files: ["a.yml"] }),
                root,
                key,
            ),
        ).toBeUndefined();
    });

    it("is undefined when the location isn't three numbers", () => {
        expect(
            getSourceLocation(
                locations({
                    version: 1,
                    locations: { [`resources.${key}`]: [[0, 1]] },
                    files: ["a.yml"],
                }),
                root,
                key,
            ),
        ).toBeUndefined();
    });

    it("is undefined when the file index is out of range", () => {
        expect(
            getSourceLocation(
                locations({
                    version: 1,
                    locations: { [`resources.${key}`]: [[1, 10, 20]] },
                    files: ["a.yml"],
                }),
                root,
                key,
            ),
        ).toBeUndefined();
    });

    it("points at the file, line and column, zero-based", () => {
        const location = getSourceLocation(
            locations({
                version: 1,
                locations: { [`resources.${key}`]: [[0, 10, 20]] },
                files: ["path/to/file.py"],
            }),
            root,
            key,
        );
        expect(location?.uri.fsPath).toBe(path.join(root, "path/to/file.py"));
        expect(location?.range.start).toEqual({ line: 9, character: 19 });
    });
});
