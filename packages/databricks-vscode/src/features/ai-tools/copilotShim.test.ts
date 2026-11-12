import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { fakeSettings } from "../../test-support/fakes";
import { FakeProcessRunner } from "../../test-support/fakeCli";
import { useTempDirs } from "../../test-support/tempDir";
import {
    copilotShimDir,
    getCopilotCliStatus,
    isCopilotShim,
    pathWithShimDir,
    probeCopilotCli,
    shimOnTerminalPath,
    withShimOnPath,
} from "./copilotShim";

const newDir = useTempDirs();
const noLinks = async (p: string) => p;
const SHIM = "/code/bin/copilot-shim/copilot";

describe("copilotShimDir", () => {
    it("is under appRoot on macOS", () => {
        expect(
            copilotShimDir(
                "/Applications/Code.app/Contents/Resources/app",
                "/Applications/Code.app/Contents/Frameworks/Code Helper (Plugin).app/Contents/MacOS/Code Helper (Plugin)",
                "darwin",
            ),
        ).toBe("/Applications/Code.app/Contents/Resources/app/bin/copilot-shim");
    });

    it("is next to the executable on Linux", () => {
        expect(
            copilotShimDir("/usr/share/code/resources/app", "/usr/share/code/code", "linux"),
        ).toBe("/usr/share/code/bin/copilot-shim");
    });

    it("is next to the executable on Windows", () => {
        expect(
            copilotShimDir("C:\\Code\\abc123\\resources\\app", "C:\\Code\\Code.exe", "win32"),
        ).toBe("C:\\Code\\bin\\copilot-shim");
    });
});

describe("shimOnTerminalPath", () => {
    const settings = (values: Record<string, unknown> = {}) => fakeSettings(values);

    it("is true with Copilot Chat and the defaults", () => {
        expect(shimOnTerminalPath(settings(), true)).toBe(true);
    });

    it("is false when chat.copilotCliCommand.enabled is off", () => {
        expect(
            shimOnTerminalPath(settings({ "chat.copilotCliCommand.enabled": false }), true),
        ).toBe(false);
    });

    it("is false when AI features are disabled", () => {
        expect(shimOnTerminalPath(settings({ "chat.disableAIFeatures": true }), true)).toBe(false);
    });

    it("is false without the Copilot Chat extension", () => {
        expect(shimOnTerminalPath(settings(), false)).toBe(false);
    });
});

describe("isCopilotShim", () => {
    it("matches any editor's bin/copilot-shim", async () => {
        for (const binary of [
            "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/copilot-shim/copilot",
            "/usr/share/code-insiders/bin/copilot-shim/copilot",
        ]) {
            expect(await isCopilotShim(binary, "linux", noLinks), binary).toBe(true);
        }
    });

    it("does not match a copilot elsewhere", async () => {
        for (const binary of [
            "/opt/homebrew/bin/copilot",
            "/usr/share/code/bin/copilot",
            "/home/me/copilot-shim/copilot",
        ]) {
            expect(await isCopilotShim(binary, "linux", noLinks), binary).toBe(false);
        }
    });

    it("ignores case on Windows", async () => {
        expect(
            await isCopilotShim(
                "c:\\Program Files\\Microsoft VS Code\\Bin\\Copilot-Shim\\copilot.EXE",
                "win32",
                noLinks,
            ),
        ).toBe(true);
    });

    it("checks a link's target, e.g. /usr/bin/copilot", async () => {
        const target = "/usr/share/code/bin/copilot-shim/copilot";
        expect(await isCopilotShim("/usr/bin/copilot", "linux", async () => target)).toBe(true);
    });

    it("falls back to the path itself when it can't be resolved", async () => {
        expect(
            await isCopilotShim("/x/bin/copilot-shim/copilot", "linux", async () => {
                throw new Error("ENOENT");
            }),
        ).toBe(true);
    });
});

describe("pathWithShimDir and withShimOnPath", () => {
    it("appends the shim dir so an existing copilot wins", () => {
        expect(pathWithShimDir("/usr/bin:/bin", "/shim", "linux")).toBe("/usr/bin:/bin:/shim");
    });

    it("does not add the shim dir twice", () => {
        expect(pathWithShimDir("/shim:/usr/bin", "/shim", "linux")).toBe("/shim:/usr/bin");
    });

    it("matches the shim dir case-insensitively on Windows", () => {
        const pathEnv = "c:\\code\\bin\\COPILOT-SHIM\\;C:\\Windows";
        expect(pathWithShimDir(pathEnv, "C:\\Code\\bin\\copilot-shim", "win32")).toBe(pathEnv);
    });

    it("handles an empty PATH", () => {
        expect(pathWithShimDir(undefined, "/shim", "linux")).toBe("/shim");
        expect(pathWithShimDir("", "/shim", "linux")).toBe("/shim");
    });

    it("keeps the spelling of PATH the environment already has on Windows", () => {
        expect(withShimOnPath({ Path: "C:\\Windows", Other: "x" }, "C:\\shim", "win32")).toEqual({
            Path: "C:\\Windows;C:\\shim",
            Other: "x",
        });
    });
});

// Lookup, symlinks and the shim check against real files. POSIX only: the fakes are shell scripts.
describe("on disk", function () {
    if (process.platform === "win32") {
        return;
    }
    const shimDir = path.join("code", "bin", "copilot-shim");
    const addCopilot = (root: string, dir: string, exitCode: number) => {
        const file = path.join(root, dir, "copilot");
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, `#!/bin/sh\nexit ${exitCode}\n`);
        fs.chmodSync(file, 0o755);
        return file;
    };
    const envOf = (root: string, ...dirs: string[]) => ({
        PATH: dirs.map((d) => path.join(root, d)).join(path.delimiter),
    });
    const neverProbed = async () => {
        throw new Error("the probe should not run");
    };

    it("reports a shim that the probe rejects", async () => {
        const tmp = newDir();
        const shim = addCopilot(tmp.dir, shimDir, 127);
        const status = await getCopilotCliStatus({
            env: envOf(tmp.dir, shimDir),
            probe: async () => false,
        });
        expect(status).toEqual({ shim });
    });

    it("treats a shim that the probe accepts as installed", async () => {
        const tmp = newDir();
        addCopilot(tmp.dir, shimDir, 0);
        expect(
            await getCopilotCliStatus({ env: envOf(tmp.dir, shimDir), probe: async () => true }),
        ).toBe("installed");
    });

    it("recognises a shim through a symlink", async () => {
        const tmp = newDir();
        const shim = addCopilot(tmp.dir, shimDir, 127);
        fs.mkdirSync(path.join(tmp.dir, "links"));
        const link = path.join(tmp.dir, "links", "copilot");
        fs.symlinkSync(shim, link);
        expect(
            await getCopilotCliStatus({ env: envOf(tmp.dir, "links"), probe: async () => false }),
        ).toEqual({ shim: link });
    });

    it("prefers a real Copilot CLI earlier on PATH, without probing", async () => {
        const tmp = newDir();
        addCopilot(tmp.dir, shimDir, 127);
        addCopilot(tmp.dir, "usr", 1);
        expect(
            await getCopilotCliStatus({
                env: envOf(tmp.dir, "usr", shimDir),
                probe: neverProbed,
            }),
        ).toBe("installed");
    });

    it("skips a file on PATH that isn't executable", async () => {
        const tmp = newDir();
        tmp.write(path.join("usr", "copilot"), "not executable");
        expect(await getCopilotCliStatus({ env: envOf(tmp.dir, "usr"), probe: neverProbed })).toBe(
            "missing",
        );
    });

    it("is missing when copilot isn't on PATH", async () => {
        const tmp = newDir();
        expect(
            await getCopilotCliStatus({ env: envOf(tmp.dir, "empty"), probe: neverProbed }),
        ).toBe("missing");
    });
});

describe("probeCopilotCli", () => {
    it("passes when the CLI's own check exits 0, with stdin closed", async () => {
        const runner = new FakeProcessRunner();
        runner.on(["plugin", "--help"], { exitCode: 0 });
        expect(await probeCopilotCli(runner, SHIM, { PATH: "/usr/bin" })).toBe(true);
        expect(runner.calls[0]!.command).toBe(SHIM);
        expect(runner.calls[0]!.options).toMatchObject({
            env: { PATH: "/usr/bin" },
            closeStdin: true,
        });
    });

    it("fails on a non-zero exit, a cancelled run, or a process that can't start", async () => {
        const failing = new FakeProcessRunner();
        failing.on(["plugin", "--help"], { exitCode: 127 });
        expect(await probeCopilotCli(failing, SHIM, {})).toBe(false);

        const cancelled = new FakeProcessRunner();
        cancelled.on(["plugin", "--help"], { exitCode: null, cancelled: true });
        expect(await probeCopilotCli(cancelled, SHIM, {})).toBe(false);

        const missing = new FakeProcessRunner();
        missing.run = async () => {
            throw new Error("ENOENT");
        };
        expect(await probeCopilotCli(missing, SHIM, {})).toBe(false);
    });
});
