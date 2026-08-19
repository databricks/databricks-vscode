import {env} from "vscode";
import assert from "assert";
import {getHostCliCommand, isCursor, isHostCliOnPath} from "./hostUtils";
import {cancellableExecFile} from "../cli/CliWrapper";

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

    it("resolves the host CLI command to code in Insiders (the CLI has no Insiders descriptor)", () => {
        stubUriScheme("vscode-insiders");
        assert.strictEqual(getHostCliCommand(), "code");
    });

    describe("isHostCliOnPath", () => {
        it("is true when the probe succeeds", async () => {
            const exec = (async () => ({
                stdout: "1.0.0",
                stderr: "",
            })) as unknown as typeof cancellableExecFile;
            assert.strictEqual(await isHostCliOnPath(exec), true);
        });

        it("is false only when the command is definitively not found", async () => {
            const notFound = Object.assign(new Error("spawn ENOENT"), {
                code: "ENOENT",
            });
            const exec = (async () => {
                throw notFound;
            }) as unknown as typeof cancellableExecFile;
            assert.strictEqual(await isHostCliOnPath(exec), false);
        });

        it("is true (advisory) when the probe fails for another reason", async () => {
            const exec = (async () => {
                throw Object.assign(new Error("permission denied"), {
                    code: "EACCES",
                });
            }) as unknown as typeof cancellableExecFile;
            assert.strictEqual(await isHostCliOnPath(exec), true);
        });
    });
});
