import {Location, Position, Uri} from "vscode";
import {getSourceLocation} from "./SourceLocationUtils";
import {BundleRemoteState} from "../../../bundle/models/BundleRemoteStateModel";
import * as assert from "assert";

describe("getSourceLocation", () => {
    const projectRoot = Uri.file("/project/root");
    const resourceKey = "test-resource";

    it("should return undefined when locations is undefined", () => {
        const locations = undefined;

        const result = getSourceLocation(locations, projectRoot, resourceKey);

        assert.strictEqual(result, undefined);
    });

    it("should return undefined when locations.version is not 1", () => {
        const locations = {
            version: 2,
            locations: {},
            files: [],
        } as unknown as BundleRemoteState["__locations"];

        const result = getSourceLocation(locations, projectRoot, resourceKey);

        assert.strictEqual(result, undefined);
    });

    it("should return undefined when locations.locations is undefined", () => {
        const locations = {
            version: 1,
            files: [],
        } as unknown as BundleRemoteState["__locations"];

        const result = getSourceLocation(locations, projectRoot, resourceKey);

        assert.strictEqual(result, undefined);
    });

    it("should return undefined when locations.files is undefined", () => {
        const locations = {
            version: 1,
            locations: {},
        } as unknown as BundleRemoteState["__locations"];

        const result = getSourceLocation(locations, projectRoot, resourceKey);

        assert.strictEqual(result, undefined);
    });

    it("should return undefined when resource key is not found", () => {
        const locations = {
            version: 1,
            locations: {
                uknownResource: [[0, 1, 1]],
            },
            files: ["path/to/file.py"],
        } as unknown as BundleRemoteState["__locations"];

        const result = getSourceLocation(locations, projectRoot, resourceKey);

        assert.strictEqual(result, undefined);
    });

    it("should return undefined when location is not an array of exactly 3 elements", () => {
        const locations = {
            version: 1,
            locations: {
                [`resources.${resourceKey}`]: [[0, 1]], // Missing the third element
            },
            files: ["path/to/file.py"],
        } as unknown as BundleRemoteState["__locations"];

        const result = getSourceLocation(locations, projectRoot, resourceKey);

        assert.strictEqual(result, undefined);
    });

    it("should return undefined when file is not found in files array", () => {
        const locations = {
            version: 1,
            locations: {
                [`resources.${resourceKey}`]: [[1, 10, 20]],
            },
            files: ["path/to/file.py"], // No entry at index 1
        } as unknown as BundleRemoteState["__locations"];

        const result = getSourceLocation(locations, projectRoot, resourceKey);

        assert.strictEqual(result, undefined);
    });

    it("should return a valid Location when all conditions are met", () => {
        const filePath = "path/to/file.py";
        const lineNumber = 10;
        const columnNumber = 20;

        const locations = {
            version: 1,
            locations: {
                [`resources.${resourceKey}`]: [[0, lineNumber, columnNumber]],
            },
            files: [filePath],
        } as unknown as BundleRemoteState["__locations"];

        const result = getSourceLocation(locations, projectRoot, resourceKey);

        const expectedUri = Uri.joinPath(projectRoot, filePath);
        const expectedPosition = new Position(lineNumber - 1, columnNumber - 1);
        const expectedLocation = new Location(expectedUri, expectedPosition);

        assert.deepStrictEqual(result, expectedLocation);
    });
});
