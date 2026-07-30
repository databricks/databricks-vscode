import {env} from "vscode";
import assert from "assert";
import {isCursor} from "./hostUtils";

describe(__filename, () => {
    let originalAppName: PropertyDescriptor | undefined;

    function stubAppName(value: string) {
        Object.defineProperty(env, "appName", {
            value,
            configurable: true,
        });
    }

    beforeEach(() => {
        originalAppName = Object.getOwnPropertyDescriptor(env, "appName");
    });

    afterEach(() => {
        if (originalAppName) {
            Object.defineProperty(env, "appName", originalAppName);
        }
    });

    it("is true when the app name is Cursor", () => {
        stubAppName("Cursor");
        assert.strictEqual(isCursor(), true);
    });

    it("matches case-insensitively and as a substring", () => {
        stubAppName("cursor nightly");
        assert.strictEqual(isCursor(), true);
    });

    it("is false for plain VS Code", () => {
        stubAppName("Visual Studio Code");
        assert.strictEqual(isCursor(), false);
    });
});
