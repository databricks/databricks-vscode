import { beforeEach, describe, expect, it } from "vitest";
import { UserFacingError } from "../../platform/errors";
import type { ShellKind } from "../../platform/shell";
import { host as vscode, window, type FakeTerminal } from "../../test-support/vscode";
import { DbConnectRunner, TERMINAL_NAME, type DbConnectRunnerDeps } from "./DbConnectRunner";
import type { Readiness } from "./setup/readiness";

const readiness = (status: Readiness["status"]): Readiness => ({
    strategy: "uv",
    status,
    checks: [],
});

function runner(
    options: {
        statuses?: Readiness["status"][];
        executable?: string | undefined;
        shell?: ShellKind;
        bootstrapPath?: string;
        debugStarts?: boolean;
        /** The extension pack's members that aren't installed. */
        missing?: string[];
    } = {},
) {
    const statuses = [...(options.statuses ?? ["ready"])];
    const log: string[] = [];
    const debugged: Record<string, unknown>[] = [];
    const deps: DbConnectRunnerDeps = {
        root: "/work/project",
        readiness: async () => {
            log.push("readiness");
            const status = statuses.length > 1 ? statuses.shift()! : statuses[0]!;
            return readiness(status);
        },
        setup: async () => {
            log.push("setup");
        },
        requireExtension: (extension, what) => {
            if (options.missing?.includes(extension.id)) {
                throw new UserFacingError("EXTENSION_MISSING", `${what} needs ${extension.id}`);
            }
        },
        executable: async () =>
            "executable" in options ? options.executable : "/work/project/.venv/bin/python",
        writeEnvFile: async () => {
            log.push("envFile");
        },
        bootstrapPath:
            options.bootstrapPath ?? "/extension/resources/python/dbconnect-bootstrap.py",
        terminals: {
            createTerminal: (o) => {
                log.push("createTerminal");
                return window.createTerminal(o as FakeTerminal["creationOptions"]) as never;
            },
            onDidCloseTerminal: window.onDidCloseTerminal as never,
        },
        shellKind: () => options.shell ?? "posix",
        startDebugging: async (configuration) => {
            log.push("startDebugging");
            debugged.push(configuration);
            return options.debugStarts ?? true;
        },
        onRun: (launchType) => log.push(`onRun:${launchType}`),
    };
    return { r: new DbConnectRunner(deps), log, debugged };
}

describe("DbConnectRunner", () => {
    beforeEach(() => vscode.reset());

    it("runs the file through the bootstrap in a terminal rooted at the project", async () => {
        const { r, log } = runner();
        expect(await r.run("/work/project/hello.py")).toBe(true);
        expect(vscode.terminals).toHaveLength(1);
        const [terminal] = vscode.terminals;
        expect(terminal!.creationOptions).toMatchObject({
            name: TERMINAL_NAME,
            cwd: "/work/project",
        });
        expect(terminal!.name).toBe("Databricks Connect");
        expect(terminal!.shown).toBe(1);
        expect(terminal!.sent).toEqual([
            "'/work/project/.venv/bin/python' '/extension/resources/python/dbconnect-bootstrap.py' '/work/project/hello.py'",
        ]);
        // The env file is current before the line is sent; the run is reported after.
        expect(log).toEqual(["readiness", "envFile", "createTerminal", "onRun:run"]);
    });

    it("reuses its terminal, and creates another once it is closed", async () => {
        const { r } = runner();
        await r.run("/work/project/a.py");
        await r.run("/work/project/b.py");
        expect(vscode.terminals).toHaveLength(1);
        expect(vscode.terminals[0]!.sent).toHaveLength(2);
        vscode.terminals[0]!.close();
        await r.run("/work/project/c.py");
        expect(vscode.terminals).toHaveLength(2);
        r.dispose();
        // Disposing leaves the user's terminal open.
        expect(vscode.terminals[1]!.closed).toBe(false);
    });

    it("runs the setup when not ready, then checks again", async () => {
        const { r, log } = runner({ statuses: ["notReady", "ready"] });
        expect(await r.run("/work/project/hello.py")).toBe(true);
        expect(log.slice(0, 3)).toEqual(["readiness", "setup", "readiness"]);
        expect(vscode.terminals).toHaveLength(1);
    });

    it("stops quietly when the setup didn't make it ready", async () => {
        const { r, log } = runner({ statuses: ["notReady"] });
        expect(await r.run("/work/project/hello.py")).toBe(false);
        expect(log).toEqual(["readiness", "setup", "readiness"]);
        expect(vscode.terminals).toHaveLength(0);
    });

    it("runs a drifted environment: the row already says it is out of sync", async () => {
        const { r, log } = runner({ statuses: ["drifted"] });
        expect(await r.run("/work/project/hello.py")).toBe(true);
        expect(log).not.toContain("setup");
    });

    it("needs a file", async () => {
        const { r } = runner();
        await expect(r.run(undefined)).rejects.toThrow(
            new UserFacingError("NO_FILE", "Open a file to run on Databricks"),
        );
        expect(vscode.terminals).toHaveLength(0);
    });

    it("needs an interpreter", async () => {
        const { r } = runner({ executable: undefined });
        await expect(r.run("/work/project/hello.py")).rejects.toThrow("No python executable found");
        expect(vscode.terminals).toHaveLength(0);
    });

    it("quotes for PowerShell", async () => {
        const { r } = runner({
            shell: "powershell",
            executable: "C:\\work\\my project\\.venv\\Scripts\\python.exe",
        });
        await r.run("C:\\work\\my project\\it's.py");
        const [line] = vscode.terminals[0]!.sent;
        expect(line).toMatch(/^& /);
        expect(line).toContain("my project");
        expect(line).toContain("it''s.py");
    });

    it("refuses paths cmd would expand", async () => {
        const { r } = runner({ shell: "cmd", executable: "C:\\py\\python.exe" });
        const error = await r.run("C:\\work\\100%\\hello.py").catch((e: unknown) => e);
        expect(error).toBeInstanceOf(UserFacingError);
        expect((error as UserFacingError).code).toBe("UNSAFE_PATH");
        expect(vscode.terminals).toHaveLength(0);
    });

    describe("debug (RUN-05)", () => {
        it("starts a debugpy session with databricks: true, the gate's interpreter and the project root, and no host environment", async () => {
            const { r, log, debugged } = runner();
            expect(await r.debug("/work/project/hello.py")).toBe(true);
            expect(debugged).toEqual([
                {
                    type: "debugpy",
                    name: "Databricks Connect",
                    request: "launch",
                    databricks: true,
                    program: "/work/project/hello.py",
                    console: "integratedTerminal",
                    cwd: "/work/project",
                    python: "/work/project/.venv/bin/python",
                },
            ]);
            expect(debugged[0]).not.toHaveProperty("env");
            expect(log).toEqual(["readiness", "envFile", "startDebugging", "onRun:debug"]);
            // Debugging needs no terminal of ours.
            expect(vscode.terminals).toEqual([]);
        });

        it("shares the run's gate: not ready runs the setup, and stops quietly if it still isn't", async () => {
            const { r, log } = runner({ statuses: ["notReady"] });
            expect(await r.debug("/work/project/hello.py")).toBe(false);
            expect(log).toEqual(["readiness", "setup", "readiness"]);
        });

        it("doesn't report a session that didn't start", async () => {
            const { r, log } = runner({ debugStarts: false });
            expect(await r.debug("/work/project/hello.py")).toBe(false);
            expect(log).not.toContain("onRun:debug");
        });

        it("keeps the run's errors", async () => {
            await expect(runner().r.debug(undefined)).rejects.toThrow(
                "Open a file to run on Databricks",
            );
            await expect(
                runner({ executable: undefined }).r.debug("/work/project/a.py"),
            ).rejects.toThrow("No python executable found");
        });

        it("needs the Python Debugger extension, before the gate can run the setup", async () => {
            const { r, log } = runner({ statuses: ["notReady"], missing: ["ms-python.debugpy"] });
            await expect(r.debug("/work/project/hello.py")).rejects.toThrow(
                "Debugging a file with Databricks Connect needs ms-python.debugpy",
            );
            expect(log).toEqual([]);
        });
    });

    it("needs the Python extension, before the gate can run the setup", async () => {
        for (const run of [
            (r: DbConnectRunner) => r.run("/work/project/hello.py"),
            (r: DbConnectRunner) => r.debug("/work/project/hello.py"),
        ]) {
            const { r, log } = runner({ statuses: ["notReady"], missing: ["ms-python.python"] });
            await expect(run(r)).rejects.toMatchObject({ code: "EXTENSION_MISSING" });
            expect(log).toEqual([]);
        }
    });
});
