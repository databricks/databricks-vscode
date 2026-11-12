import {env, extensions} from "vscode";
import assert from "assert";
import {reset, spy, when} from "ts-mockito";
import path from "path";
import os from "os";
import {mkdir, mkdtemp, rm, writeFile} from "fs/promises";
import {
    getCopilotShimDir,
    getHostCliCommand,
    getHostCliPath,
    isCopilotShimOnTerminalPath,
    isCursor,
    isHostCliOnPath,
    isRemoteSshMode,
    withCopilotShimOnPath,
} from "./hostUtils";
import {cancellableExecFile} from "../cli/CliWrapper";
import {workspaceConfigs} from "../vscode-objs/WorkspaceConfigs";

type WorkspaceConfigs = typeof workspaceConfigs;

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

    describe("isRemoteSshMode", () => {
        let originalEnv: NodeJS.ProcessEnv;

        beforeEach(() => {
            originalEnv = process.env;
            process.env = {...originalEnv};
            delete process.env.DATABRICKS_REMOTE_ENV;
            delete process.env.DATABRICKS_VIRTUAL_ENV;
        });

        afterEach(() => {
            process.env = originalEnv;
        });

        it("is true when the remote environment sets both variables", () => {
            process.env.DATABRICKS_REMOTE_ENV = "1";
            process.env.DATABRICKS_VIRTUAL_ENV = "/tmp/venv";
            assert.strictEqual(isRemoteSshMode(), true);
        });

        it("is false without the virtual environment", () => {
            process.env.DATABRICKS_REMOTE_ENV = "1";
            assert.strictEqual(isRemoteSshMode(), false);
        });

        it("is false outside a remote session", () => {
            assert.strictEqual(isRemoteSshMode(), false);
        });
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

    describe("getHostCliPath", () => {
        let root: string;

        beforeEach(async () => {
            root = await mkdtemp(path.join(os.tmpdir(), "host-cli-"));
        });

        afterEach(async () => {
            await rm(root, {recursive: true, force: true});
        });

        async function touch(...segments: string[]) {
            const file = path.join(root, ...segments);
            await mkdir(path.dirname(file), {recursive: true});
            await writeFile(file, "");
            return file;
        }

        it("finds the macOS layout under appRoot", async () => {
            stubUriScheme("vscode");
            const cli = await touch("app", "bin", "code");
            assert.strictEqual(
                await getHostCliPath(path.join(root, "app"), "darwin"),
                cli
            );
        });

        it("finds the Linux layout above resources/app", async () => {
            stubUriScheme("cursor");
            const cli = await touch("bin", "cursor");
            assert.strictEqual(
                await getHostCliPath(
                    path.join(root, "resources", "app"),
                    "linux"
                ),
                cli
            );
        });

        it("finds the versioned Windows layout", async () => {
            stubUriScheme("vscode");
            const cli = await touch("bin", "code.cmd");
            assert.strictEqual(
                await getHostCliPath(
                    path.join(root, "abc123", "resources", "app"),
                    "win32"
                ),
                cli
            );
        });

        it("finds Cursor's Windows layout under appRoot", async () => {
            stubUriScheme("cursor");
            const cli = await touch("resources", "app", "bin", "cursor.cmd");
            assert.strictEqual(
                await getHostCliPath(
                    path.join(root, "resources", "app"),
                    "win32"
                ),
                cli
            );
        });

        it("is undefined when no candidate exists", async () => {
            stubUriScheme("vscode");
            await mkdir(path.join(root, "bin", "code"), {recursive: true});
            assert.strictEqual(
                await getHostCliPath(
                    path.join(root, "resources", "app"),
                    "linux"
                ),
                undefined
            );
        });
    });

    describe("getCopilotShimDir", () => {
        it("is under appRoot on macOS", () => {
            assert.strictEqual(
                getCopilotShimDir(
                    "/Applications/Code.app/Contents/Resources/app",
                    "/Applications/Code.app/Contents/Frameworks/Code Helper (Plugin).app/Contents/MacOS/Code Helper (Plugin)",
                    "darwin"
                ),
                "/Applications/Code.app/Contents/Resources/app/bin/copilot-shim"
            );
        });

        it("is next to the executable on Linux", () => {
            assert.strictEqual(
                getCopilotShimDir(
                    "/usr/share/code/resources/app",
                    "/usr/share/code/code",
                    "linux"
                ),
                "/usr/share/code/bin/copilot-shim"
            );
        });

        it("is next to the executable on Windows", () => {
            assert.strictEqual(
                getCopilotShimDir(
                    "C:\\Code\\abc123\\resources\\app",
                    "C:\\Code\\Code.exe",
                    "win32"
                ),
                "C:\\Code\\bin\\copilot-shim"
            );
        });
    });

    describe("isCopilotShimOnTerminalPath", () => {
        const originalGetExtension = extensions.getExtension;
        let configsSpy: WorkspaceConfigs;

        function stub({
            setting = true,
            aiDisabled = false,
            chatExtension = true,
        } = {}) {
            when(configsSpy.copilotCliCommandEnabled).thenReturn(setting);
            when(configsSpy.aiFeaturesDisabled).thenReturn(aiDisabled);
            (extensions as any).getExtension = (id: string) =>
                id === "GitHub.copilot-chat" && chatExtension ? {} : undefined;
        }

        beforeEach(() => {
            configsSpy = spy(workspaceConfigs);
        });
        afterEach(() => {
            reset(configsSpy);
            (extensions as any).getExtension = originalGetExtension;
        });

        it("is true with Copilot Chat and the defaults", () => {
            stub();
            assert.strictEqual(isCopilotShimOnTerminalPath(), true);
        });

        it("is false when chat.copilotCliCommand.enabled is off", () => {
            stub({setting: false});
            assert.strictEqual(isCopilotShimOnTerminalPath(), false);
        });

        it("is false when AI features are disabled", () => {
            stub({aiDisabled: true});
            assert.strictEqual(isCopilotShimOnTerminalPath(), false);
        });

        it("is false without the Copilot Chat extension", () => {
            stub({chatExtension: false});
            assert.strictEqual(isCopilotShimOnTerminalPath(), false);
        });
    });

    describe("withCopilotShimOnPath", () => {
        it("appends the shim dir so an existing copilot wins", () => {
            assert.strictEqual(
                withCopilotShimOnPath("/usr/bin:/bin", "/shim", true, "darwin"),
                "/usr/bin:/bin:/shim"
            );
        });

        it("leaves PATH alone when VS Code doesn't add the shim", () => {
            assert.strictEqual(
                withCopilotShimOnPath("/usr/bin", "/shim", false, "darwin"),
                "/usr/bin"
            );
        });

        it("does not add the shim dir twice", () => {
            assert.strictEqual(
                withCopilotShimOnPath("/shim:/usr/bin", "/shim", true, "linux"),
                "/shim:/usr/bin"
            );
        });

        it("matches the shim dir case-insensitively on Windows", () => {
            const pathEnv = "c:\\code\\bin\\COPILOT-SHIM\\;C:\\Windows";
            assert.strictEqual(
                withCopilotShimOnPath(
                    pathEnv,
                    "C:\\Code\\bin\\copilot-shim",
                    true,
                    "win32"
                ),
                pathEnv
            );
        });

        it("handles an empty PATH", () => {
            assert.strictEqual(
                withCopilotShimOnPath("", "/shim", true, "darwin"),
                "/shim"
            );
        });
    });
});
