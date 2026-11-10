import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FakeProcessRunner } from "../../../test-support/fakeCli";
import { useTempDirs } from "../../../test-support/tempDir";
import { initScriptErrors, initScriptName, InitScripts, ipythonDir } from "./InitScripts";

const tempDir = useTempDirs();

function scripts(content = "print('hello')\n") {
    const t = tempDir();
    const sourcePath = t.write("extension/00-databricks-init.py", content);
    const runner = new FakeProcessRunner();
    const s = new InitScripts({
        sourcePath,
        ipythonDir: () => t.path("ipython"),
        processes: runner,
    });
    return {
        t,
        s,
        runner,
        startup: t.path("ipython", "profile_default", "startup"),
        name: initScriptName(content),
    };
}

describe("ipythonDir", () => {
    it("is the setting, else IPYTHONDIR, else ~/.ipython", () => {
        expect(ipythonDir("/configured", { IPYTHONDIR: "/env" }, "/home/me")).toBe("/configured");
        expect(ipythonDir("", { IPYTHONDIR: "/env" }, "/home/me")).toBe("/env");
        expect(ipythonDir(undefined, {}, "/home/me")).toBe(path.join("/home/me", ".ipython"));
    });
});

describe("initScriptName", () => {
    it("is the generated name of the old build: the content's md5", () => {
        const content = "x = 1\n";
        expect(initScriptName(content)).toBe(
            `00-databricks-init-${createHash("md5").update(content).digest("hex")}.py`,
        );
    });
});

describe("initScriptErrors", () => {
    it("reads the script's name:type:message lines, keeping colons in the message", () => {
        expect(
            initScriptErrors("noise\nsetup:KeyError:a: b\r\nTraceback (most recent call last)\n"),
        ).toEqual([{ functionName: "setup", errorType: "KeyError", message: "a: b" }]);
    });
});

describe("InitScripts", () => {
    it("copies the script into the default profile's startup folder, creating it", async () => {
        const { s, startup, name } = scripts();
        expect(await s.install()).toBe(path.join(startup, name));
        expect(fs.readFileSync(path.join(startup, name), "utf-8")).toBe("print('hello')\n");
    });

    it("removes outdated copies of ours, and leaves the user's own scripts", async () => {
        const { t, s, startup, name } = scripts();
        t.write("ipython/profile_default/startup/00-databricks-init-0123.py", "old");
        t.write("ipython/profile_default/startup/10-mine.py", "mine");
        await s.install();
        expect(fs.readdirSync(startup).sort()).toEqual([name, "10-mine.py"]);
    });

    it("leaves a current copy as it is", async () => {
        const { s, startup, name } = scripts();
        await s.install();
        const old = new Date(2000, 0, 1);
        fs.utimesSync(path.join(startup, name), old, old);
        await s.install();
        expect(fs.statSync(path.join(startup, name)).mtime.getTime()).toBe(old.getTime());
    });

    it("runs the installed script with IPython, and reads its errors", async () => {
        const { s, runner, startup, name } = scripts();
        runner.on(["-m", "IPython"], {
            stderr: "register_magics:NameError:name 'x' is not defined\n",
        });
        await s.install();
        const run = await s.run("/venv/bin/python", { env: { A: "1" }, cwd: "/project" });
        expect(runner.calls[0]).toMatchObject({
            command: "/venv/bin/python",
            args: ["-m", "IPython", path.join(startup, name)],
            options: { cwd: "/project", env: { A: "1" } },
        });
        expect(run).toEqual({
            file: path.join(startup, name),
            errors: [
                {
                    functionName: "register_magics",
                    errorType: "NameError",
                    message: "name 'x' is not defined",
                },
            ],
            failure: undefined,
        });
    });

    it("reports IPython failing without one of the script's errors", async () => {
        const { s, runner } = scripts();
        runner.on(["-m", "IPython"], {
            exitCode: 1,
            stderr: "/venv/bin/python: No module named IPython\n",
        });
        expect((await s.run("/venv/bin/python", { env: {}, cwd: "/project" })).failure).toBe(
            "/venv/bin/python: No module named IPython",
        );
    });
});
