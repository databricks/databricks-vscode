import {env, extensions} from "vscode";
import assert from "assert";
import {
    getHostCliCommand,
    getHostSshExtension,
    getSshExtensionStatus,
    isCursor,
    isHostCliOnPath,
} from "./hostUtils";
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
        // A resolved profile env; the probe passes this to `execFile` as PATH.
        // eslint-disable-next-line @typescript-eslint/naming-convention
        const loadShellEnv = async () => async () => ({PATH: "/usr/bin"});

        it("is true when the probe succeeds", async () => {
            const exec = (async () => ({
                stdout: "1.0.0",
                stderr: "",
            })) as unknown as typeof cancellableExecFile;
            assert.strictEqual(await isHostCliOnPath(exec, loadShellEnv), true);
        });

        it("is false only when the command is definitively not found", async () => {
            const notFound = Object.assign(new Error("spawn ENOENT"), {
                code: "ENOENT",
            });
            const exec = (async () => {
                throw notFound;
            }) as unknown as typeof cancellableExecFile;
            assert.strictEqual(
                await isHostCliOnPath(exec, loadShellEnv),
                false
            );
        });

        it("is true (advisory) when the probe fails for another reason", async () => {
            const exec = (async () => {
                throw Object.assign(new Error("permission denied"), {
                    code: "EACCES",
                });
            }) as unknown as typeof cancellableExecFile;
            assert.strictEqual(await isHostCliOnPath(exec, loadShellEnv), true);
        });

        it("probes with the profile PATH on POSIX", async function () {
            if (process.platform === "win32") {
                this.skip();
            }
            let seenEnv: Record<string, string> | undefined;
            const exec = (async (
                _cmd: string,
                _args: string[],
                opts: {env?: Record<string, string>}
            ) => {
                seenEnv = opts.env;
                return {stdout: "1.0.0", stderr: ""};
            }) as unknown as typeof cancellableExecFile;
            assert.strictEqual(await isHostCliOnPath(exec, loadShellEnv), true);
            assert.strictEqual(seenEnv?.PATH, "/usr/bin");
        });

        it("is true (advisory) when the shell profile fails to resolve", async function () {
            // Windows never loads shell-env, so this branch is POSIX-only.
            if (process.platform === "win32") {
                this.skip();
            }
            const exec = (async () => ({
                stdout: "1.0.0",
                stderr: "",
            })) as unknown as typeof cancellableExecFile;
            const failingShellEnv = async () => async () => {
                throw new Error("profile blew up");
            };
            assert.strictEqual(
                await isHostCliOnPath(exec, failingShellEnv),
                true
            );
        });
    });

    describe("getSshExtensionStatus", () => {
        let originalGetExtension: typeof extensions.getExtension;

        // Stands in for the one field getSshExtensionStatus reads off an extension.
        function stubInstalled(version: string | undefined) {
            (extensions as any).getExtension = () =>
                version === undefined
                    ? undefined
                    : {packageJSON: {version}};
        }

        beforeEach(() => {
            originalGetExtension = extensions.getExtension;
            stubUriScheme("vscode");
        });

        afterEach(() => {
            (extensions as any).getExtension = originalGetExtension;
        });

        it("resolves the extension id per host", () => {
            stubUriScheme("cursor");
            assert.strictEqual(
                getHostSshExtension().id,
                "anysphere.remote-ssh"
            );
            stubUriScheme("vscode");
            assert.strictEqual(
                getHostSshExtension().id,
                "ms-vscode-remote.remote-ssh"
            );
        });

        it("is missing when the extension is not in the registry", () => {
            stubInstalled(undefined);
            assert.deepStrictEqual(getSshExtensionStatus(), {kind: "missing"});
        });

        it("is ok at and above the minimum version", () => {
            stubInstalled("0.120.0");
            assert.deepStrictEqual(getSshExtensionStatus(), {kind: "ok"});
            stubInstalled("0.130.1");
            assert.deepStrictEqual(getSshExtensionStatus(), {kind: "ok"});
        });

        it("is outdated below the minimum version, and reports it", () => {
            stubInstalled("0.100.0");
            assert.deepStrictEqual(getSshExtensionStatus(), {
                kind: "outdated",
                installed: "0.100.0",
            });
        });

        it("treats an unparseable version as outdated, like the CLI does", () => {
            stubInstalled("not-a-version");
            assert.deepStrictEqual(getSshExtensionStatus(), {
                kind: "outdated",
                installed: "not-a-version",
            });
        });

        it("applies the Cursor floor in Cursor", () => {
            stubUriScheme("cursor");
            // Below Cursor's 1.0.32 floor but far above VS Code's 0.120.0 one.
            stubInstalled("1.0.10");
            assert.deepStrictEqual(getSshExtensionStatus(), {
                kind: "outdated",
                installed: "1.0.10",
            });
        });
    });
});

