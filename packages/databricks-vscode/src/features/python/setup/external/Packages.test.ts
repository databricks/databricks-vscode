import { describe, expect, it } from "vitest";
import { FakeProcessRunner } from "../../../../test-support/fakeCli";
import { useTempDirs } from "../../../../test-support/tempDir";
import { Packages } from "./Packages";

const tempDir = useTempDirs();
const PYTHON = "/project/.venv/bin/python";

function packages(options: { uvLock?: boolean; uvRuns?: boolean } = {}) {
    const t = tempDir();
    if (options.uvLock) {
        t.write("project/uv.lock", "version = 1\n");
    } else {
        t.write("project/.keep", "");
    }
    const runner = new FakeProcessRunner();
    runner.on(["--version"], { exitCode: options.uvRuns === false ? 1 : 0 });
    const output: string[] = [];
    const p = new Packages({
        processes: runner,
        root: t.path("project"),
        env: () => ({ PATH: "/bin", HTTPS_PROXY: "http://proxy" }),
    });
    return {
        p,
        runner,
        output,
        sink: {
            append: (s: string) => output.push(s),
            appendLine: (s: string) => output.push(`${s}\n`),
        },
    };
}

describe("Packages", () => {
    it("lists through pip, with the child environment", async () => {
        const { p, runner } = packages();
        runner.on(["-m", "pip", "list"], {
            stdout: JSON.stringify([
                { name: "databricks-connect", version: "17.3.1" },
                { name: "pyspark", version: "3.5.0" },
            ]),
        });
        expect(await p.list(PYTHON)).toEqual([
            { name: "databricks-connect", version: "17.3.1" },
            { name: "pyspark", version: "3.5.0" },
        ]);
        expect(await p.find(PYTHON, "pyspark")).toEqual({ name: "pyspark", version: "3.5.0" });
        expect(await p.find(PYTHON, "nbformat")).toBe(undefined);
        const [call] = runner.calls;
        expect(call).toMatchObject({
            command: PYTHON,
            args: ["-m", "pip", "list", "--format", "json", "--disable-pip-version-check"],
        });
        expect(call!.options.env).toEqual({ PATH: "/bin", HTTPS_PROXY: "http://proxy" });
    });

    it("lists with uv when asked, even without a uv.lock: a uv-made venv has no pip", async () => {
        const { p, runner } = packages();
        runner.on(["pip", "list"], {
            stdout: JSON.stringify([{ name: "databricks-connect", version: "17.3.1" }]),
        });
        expect(await p.find(PYTHON, "databricks-connect", undefined, { uv: true })).toEqual({
            name: "databricks-connect",
            version: "17.3.1",
        });
        expect(runner.calls.at(-1)).toMatchObject({
            command: "uv",
            args: ["pip", "list", "--format", "json", "--python", PYTHON],
        });
    });

    it("throws when pip fails", async () => {
        const { p, runner } = packages();
        runner.on(["-m", "pip", "list"], { exitCode: 1, stderr: "No module named pip\n" });
        await expect(p.list(PYTHON)).rejects.toThrow("No module named pip");
    });

    it("installs with a pinned version, streaming the output", async () => {
        const { p, runner, output, sink } = packages();
        runner.on(["-m", "pip", "install"], (_args, options) => {
            options.onStdout?.("Successfully installed databricks-connect-17.3.1\n");
            return {};
        });
        await p.install(PYTHON, "databricks-connect", "17.3.*", sink);
        expect(runner.argv.at(-1)).toEqual([
            "-m",
            "pip",
            "install",
            "databricks-connect==17.3.*",
            "--disable-pip-version-check",
        ]);
        expect(output.join("")).toBe(
            `Running: ${PYTHON} -m pip install databricks-connect==17.3.* --disable-pip-version-check\nSuccessfully installed databricks-connect-17.3.1\n`,
        );
        await p.install(PYTHON, "nbformat", undefined, sink);
        expect(runner.argv.at(-1)).toEqual([
            "-m",
            "pip",
            "install",
            "nbformat",
            "--disable-pip-version-check",
        ]);
    });

    it("throws on a failed install", async () => {
        const { p, runner, sink } = packages();
        runner.on(["-m", "pip", "install"], { exitCode: 2 });
        await expect(p.install(PYTHON, "databricks-connect", "17.3.*", sink)).rejects.toThrow(
            "Command exited with code 2",
        );
    });

    it("uninstalls only what is installed, without prompting", async () => {
        const { p, runner, sink } = packages();
        runner.on(["-m", "pip", "list"], {
            stdout: JSON.stringify([{ name: "pyspark", version: "3.5.0" }]),
        });
        await p.uninstall(PYTHON, "databricks-connect", sink);
        expect(runner.argv.some((a) => a.includes("uninstall"))).toBe(false);
        await p.uninstall(PYTHON, "pyspark", sink);
        expect(runner.argv.at(-1)).toEqual([
            "-m",
            "pip",
            "uninstall",
            "pyspark",
            "-y",
            "--disable-pip-version-check",
        ]);
    });

    it("uses uv pip for a uv-locked project when uv runs", async () => {
        const { p, runner } = packages({ uvLock: true });
        runner.on(["pip", "list"], { stdout: "[]" });
        await p.list(PYTHON);
        expect(runner.calls.at(-1)).toMatchObject({
            command: "uv",
            args: ["pip", "list", "--format", "json", "--python", PYTHON],
        });
    });

    it("falls back to pip when uv doesn't run, or without a uv.lock", async () => {
        const noUv = packages({ uvLock: true, uvRuns: false });
        noUv.runner.on(["-m", "pip", "list"], { stdout: "[]" });
        await noUv.p.list(PYTHON);
        expect(noUv.runner.calls.at(-1)?.command).toBe(PYTHON);

        const noLock = packages();
        noLock.runner.on(["-m", "pip", "list"], { stdout: "[]" });
        await noLock.p.list(PYTHON);
        // Without a lockfile uv isn't even asked.
        expect(noLock.runner.calls.map((c) => c.command)).toEqual([PYTHON]);
    });
});
