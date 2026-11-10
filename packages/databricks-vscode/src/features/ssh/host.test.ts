import { describe, expect, it } from "vitest";
import { FakeProcessRunner } from "../../test-support/fakeCli";
import { fakeLog } from "../../test-support/fakes";
import { useTempDirs } from "../../test-support/tempDir";
import {
    findHostCliInInstall,
    hostCliCommand,
    hostIde,
    isHostCliOnPath,
    remoteSshExtension,
} from "./host";

const log = fakeLog();

describe("the host editor", () => {
    it("is Cursor only in Cursor; Insiders runs `code` as the CLI does", () => {
        expect(["cursor", "vscode", "vscode-insiders"].map(hostIde)).toEqual([
            "cursor",
            "vscode",
            "vscode",
        ]);
        expect(hostCliCommand("vscode")).toBe("code");
        expect(hostCliCommand("cursor")).toBe("cursor");
        expect(remoteSshExtension("vscode")).toEqual({
            id: "ms-vscode-remote.remote-ssh",
            name: "Remote - SSH",
            inPack: false,
            minVersion: "0.120.0",
        });
        expect(remoteSshExtension("cursor")).toEqual({
            id: "anysphere.remote-ssh",
            name: "Remote - SSH",
            inPack: false,
        });
    });
});

describe("the PATH probe", () => {
    it("asks the user's login shell on POSIX, which sees the PATH the terminal will", async () => {
        const runner = new FakeProcessRunner();
        expect(
            await isHostCliOnPath("code", {
                processes: runner,
                env: { SHELL: "/bin/zsh", PATH: "/usr/bin" },
                platform: "darwin",
                log,
            }),
        ).toBe(true);
        expect(runner.calls[0]).toMatchObject({
            command: "/bin/zsh",
            args: ["-ilc", "command -v code"],
        });
        expect(runner.calls[0]!.options.env).toMatchObject({
            PATH: "/usr/bin",
            DISABLE_AUTO_UPDATE: "true",
        });
        expect(runner.calls[0]!.options.closeStdin).toBe(true);
    });

    it("falls back to /bin/sh without $SHELL", async () => {
        const runner = new FakeProcessRunner();
        await isHostCliOnPath("cursor", { processes: runner, env: {}, platform: "linux", log });
        expect(runner.calls[0]).toMatchObject({
            command: "/bin/sh",
            args: ["-ilc", "command -v cursor"],
        });
    });

    it("uses `where` on Windows", async () => {
        const runner = new FakeProcessRunner().on(["code"], { exitCode: 1 });
        expect(
            await isHostCliOnPath("code", { processes: runner, env: {}, platform: "win32", log }),
        ).toBe(false);
        expect(runner.calls[0]).toMatchObject({ command: "where", args: ["code"] });
    });

    it("reports a command that isn't found", async () => {
        const runner = new FakeProcessRunner().on(["-ilc"], { exitCode: 1 });
        expect(
            await isHostCliOnPath("code", { processes: runner, env: {}, platform: "linux", log }),
        ).toBe(false);
    });

    it("assumes the command is there when the shell can't start, or takes too long", async () => {
        const failing = new FakeProcessRunner().on(["-ilc"], () =>
            Promise.reject(new Error("spawn ENOENT")),
        );
        expect(
            await isHostCliOnPath("code", { processes: failing, env: {}, platform: "linux", log }),
        ).toBe(true);

        const slow = new FakeProcessRunner().on(
            ["-ilc"],
            (_args, options) =>
                new Promise((resolve) =>
                    options.signal?.addEventListener("abort", () =>
                        resolve({ exitCode: null, cancelled: true }),
                    ),
                ),
        );
        expect(
            await isHostCliOnPath("code", {
                processes: slow,
                env: {},
                platform: "linux",
                log,
                timeoutMs: 5,
            }),
        ).toBe(true);
    });
});

describe("the editor's command in its install folder", () => {
    const tempDir = useTempDirs();

    it("finds the macOS layout under appRoot", async () => {
        const t = tempDir();
        const cli = t.write("app/bin/code");
        expect(await findHostCliInInstall("vscode", t.path("app"), "darwin")).toBe(cli);
    });

    it("finds the Linux layout above resources/app", async () => {
        const t = tempDir();
        const cli = t.write("bin/cursor");
        expect(await findHostCliInInstall("cursor", t.path("resources", "app"), "linux")).toBe(cli);
    });

    it("finds the versioned Windows layout", async () => {
        const t = tempDir();
        const cli = t.write("bin/code.cmd");
        expect(
            await findHostCliInInstall("vscode", t.path("abc123", "resources", "app"), "win32"),
        ).toBe(cli);
    });

    it("finds Cursor's Windows layout under appRoot", async () => {
        const t = tempDir();
        const cli = t.write("resources/app/bin/cursor.cmd");
        expect(await findHostCliInInstall("cursor", t.path("resources", "app"), "win32")).toBe(cli);
    });

    it("looks for the .cmd name only on Windows", async () => {
        const t = tempDir();
        t.write("bin/code.cmd");
        expect(await findHostCliInInstall("vscode", t.path("resources", "app"), "linux")).toBe(
            undefined,
        );
    });

    it("is undefined when nothing is found, and ignores a folder with the command's name", async () => {
        const t = tempDir();
        t.write("bin/code/placeholder");
        expect(await findHostCliInInstall("vscode", t.path("resources", "app"), "linux")).toBe(
            undefined,
        );
    });
});
