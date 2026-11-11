import assert from "assert";
import path from "path";
import os from "os";
import {chmod, mkdir, mkdtemp, rm, symlink, writeFile} from "fs/promises";
import {getCopilotCliStatus, isCopilotShim} from "./copilotShim";

describe(__filename, () => {
    describe("isCopilotShim", () => {
        const noLinks = async (p: string) => p;

        it("matches any editor's bin/copilot-shim", async () => {
            for (const binary of [
                "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/copilot-shim/copilot",
                "/usr/share/code-insiders/bin/copilot-shim/copilot",
            ]) {
                assert.strictEqual(
                    await isCopilotShim(binary, "linux", noLinks),
                    true,
                    binary
                );
            }
        });

        it("does not match a copilot elsewhere", async () => {
            for (const binary of [
                "/opt/homebrew/bin/copilot",
                "/usr/share/code/bin/copilot",
                "/home/me/copilot-shim/copilot",
            ]) {
                assert.strictEqual(
                    await isCopilotShim(binary, "linux", noLinks),
                    false,
                    binary
                );
            }
        });

        it("ignores case on Windows", async () => {
            assert.strictEqual(
                await isCopilotShim(
                    "c:\\Program Files\\Microsoft VS Code\\Bin\\Copilot-Shim\\copilot.EXE",
                    "win32",
                    noLinks
                ),
                true
            );
        });

        it("checks a link's target, e.g. /usr/bin/copilot", async () => {
            const target = "/usr/share/code/bin/copilot-shim/copilot";
            assert.strictEqual(
                await isCopilotShim(
                    "/usr/bin/copilot",
                    "linux",
                    async () => target
                ),
                true
            );
        });

        it("falls back to the path itself when it can't be resolved", async () => {
            assert.strictEqual(
                await isCopilotShim(
                    "/x/bin/copilot-shim/copilot",
                    "linux",
                    async () => {
                        throw new Error("ENOENT");
                    }
                ),
                true
            );
        });
    });

    describe("getCopilotCliStatus", () => {
        const SHIM = "/code/bin/copilot-shim/copilot";

        function status(
            binary: string | null,
            {shim, probe}: {shim: boolean; probe: boolean}
        ) {
            const probed: string[] = [];
            const result = getCopilotCliStatus(
                // eslint-disable-next-line @typescript-eslint/naming-convention
                {PATH: "/usr/bin"},
                {
                    lookup: async () => binary,
                    isShim: async () => shim,
                    probe: async (b) => {
                        probed.push(b);
                        return probe;
                    },
                }
            );
            return {result, probed};
        }

        it("is missing when copilot isn't on PATH", async () => {
            const {result} = status(null, {shim: false, probe: false});
            assert.strictEqual(await result, "missing");
        });

        it("is installed, without probing, for a real Copilot CLI", async () => {
            const {result, probed} = status("/opt/homebrew/bin/copilot", {
                shim: false,
                probe: false,
            });
            assert.strictEqual(await result, "installed");
            assert.deepStrictEqual(probed, []);
        });

        it("is installed when the shim forwards to a Copilot CLI", async () => {
            const {result, probed} = status(SHIM, {shim: true, probe: true});
            assert.strictEqual(await result, "installed");
            assert.deepStrictEqual(probed, [SHIM]);
        });

        it("reports the shim when it has no Copilot CLI to run", async () => {
            const {result} = status(SHIM, {shim: true, probe: false});
            assert.deepStrictEqual(await result, {shim: SHIM});
        });
    });

    // The real `which`, symlink resolution and probe, against fake binaries.
    // POSIX only: the fakes are shell scripts.
    describe("on disk", function () {
        if (process.platform === "win32") {
            return;
        }
        let root: string;

        beforeEach(async () => {
            root = await mkdtemp(path.join(os.tmpdir(), "copilot-shim-"));
        });

        afterEach(async () => {
            await rm(root, {recursive: true, force: true});
        });

        async function addCopilot(dir: string, exitCode: number) {
            const file = path.join(root, dir, "copilot");
            await mkdir(path.dirname(file), {recursive: true});
            await writeFile(file, `#!/bin/sh\nexit ${exitCode}\n`);
            await chmod(file, 0o755);
            return file;
        }

        const env = (...dirs: string[]) => ({
            // eslint-disable-next-line @typescript-eslint/naming-convention
            PATH: dirs.map((d) => path.join(root, d)).join(path.delimiter),
        });

        const shimDir = path.join("code", "bin", "copilot-shim");

        it("reports a shim that fails the probe", async () => {
            const shim = await addCopilot(shimDir, 127);
            assert.deepStrictEqual(await getCopilotCliStatus(env(shimDir)), {
                shim,
            });
        });

        it("treats a shim that passes the probe as installed", async () => {
            await addCopilot(shimDir, 0);
            assert.strictEqual(
                await getCopilotCliStatus(env(shimDir)),
                "installed"
            );
        });

        it("recognises a shim through a symlink", async () => {
            const shim = await addCopilot(shimDir, 127);
            await mkdir(path.join(root, "links"));
            const link = path.join(root, "links", "copilot");
            await symlink(shim, link);
            assert.deepStrictEqual(await getCopilotCliStatus(env("links")), {
                shim: link,
            });
        });

        it("prefers a real Copilot CLI earlier on PATH", async () => {
            await addCopilot(shimDir, 127);
            await addCopilot("usr", 1);
            assert.strictEqual(
                await getCopilotCliStatus(env("usr", shimDir)),
                "installed"
            );
        });

        it("is missing when copilot isn't on PATH", async () => {
            assert.strictEqual(
                await getCopilotCliStatus(env("empty")),
                "missing"
            );
        });
    });
});
