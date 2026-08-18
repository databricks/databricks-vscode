import {env} from "vscode";
import assert from "assert";
import {getHostCliCommand, isCursor} from "./hostUtils";

describe(__filename, () => {
    let originalAppName: PropertyDescriptor | undefined;

    function stubUriScheme(value: string) {
        Object.defineProperty(env, "uriScheme", {
            value,
            configurable: true,
        });
    }

    beforeEach(() => {
        originalAppName = Object.getOwnPropertyDescriptor(env, "uriScheme");
    });

    afterEach(() => {
        if (originalAppName) {
            Object.defineProperty(env, "uriScheme", originalAppName);
        }
    });

    it("is true for Cursor", () => {
        stubUriScheme("cursor");
        assert.strictEqual(isCursor(), true);
    });

    it("is false for VS Code", () => {
        stubUriScheme("vscode");
        assert.strictEqual(isCursor(), false);
    });

    it("resolves the host CLI command to cursor in Cursor", () => {
        stubUriScheme("cursor");
        assert.strictEqual(getHostCliCommand(), "cursor");
    });

    it("resolves the host CLI command to code in VS Code", () => {
        stubUriScheme("vscode");
        assert.strictEqual(getHostCliCommand(), "code");
    });
});
