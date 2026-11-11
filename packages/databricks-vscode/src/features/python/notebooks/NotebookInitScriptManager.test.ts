import { describe, expect, it, vi } from "vitest";
import { UserFacingError } from "../../../platform/errors";
import { fakeLog } from "../../../test-support/fakes";
import type { InitScriptRun, InitScripts } from "./InitScripts";
import {
    INSTALL_AND_TRY_AGAIN,
    NotebookInitScriptManager,
    OPEN_OUTPUT_WINDOW,
    VERIFICATION_FAILED_MESSAGE,
} from "./NotebookInitScriptManager";

const settle = () => new Promise((r) => setTimeout(r, 10));
/** `settle`, then `check`, until it passes: the verify runs and reports on timers the Windows runner can wake late. */
const settleUntil = (check: () => void) =>
    vi.waitFor(async () => {
        await settle();
        check();
    });

function manager(
    options: {
        usable?: boolean;
        inNotebook?: boolean;
        executable?: string;
        ipython?: boolean;
        run?: Partial<InitScriptRun>;
        choice?: string;
        installError?: string;
        /** ms-python is missing or disabled. */
        noPython?: boolean;
    } = {},
) {
    const state = {
        usable: options.usable ?? true,
        inNotebook: options.inNotebook ?? true,
        executable: "executable" in options ? options.executable : "/venv/bin/python",
        ipython: options.ipython ?? true,
        run: {
            file: "/ipython/startup/00-databricks-init-abc.py",
            errors: [],
            ...options.run,
        } as InitScriptRun,
    };
    const log: string[] = [];
    const errors: { message: string; items: string[] }[] = [];
    const infos: string[] = [];
    const warnings: string[] = [];
    const channel = { text: "", shown: 0 };
    const scripts = {
        install: async () => {
            if (options.installError !== undefined) {
                throw new Error(options.installError);
            }
            log.push("install");
        },
        run: async (executable: string, runOptions: { cwd: string }) => {
            log.push(`run ${executable} in ${runOptions.cwd}`);
            return state.run;
        },
    } as unknown as InitScripts;
    const m = new NotebookInitScriptManager({
        scripts,
        root: "/project",
        usable: () => state.usable,
        inNotebook: () => state.inNotebook,
        requireExtension: (extension, what) => {
            if (options.noPython) {
                throw new UserFacingError("EXTENSION_MISSING", `${what} needs ${extension.id}`);
            }
        },
        executable: async () => state.executable,
        environmentName: async () => ".venv",
        hasIpython: async () => state.ipython,
        installIpython: async (executable) => {
            log.push(`install ipython in ${executable}`);
            state.ipython = true;
        },
        selectInterpreter: async () => void log.push("select interpreter"),
        // As the registered command does: it runs the verify again.
        verifyAgain: async () => {
            log.push("verify again");
            await m.verifyCommand();
        },
        env: async () => ({ DATABRICKS_PROJECT_ROOT: "/project" }),
        channel: () => ({
            appendLine: (text) => void (channel.text += `${text}\n`),
            show: () => void channel.shown++,
        }),
        ui: {
            // As the registry shows it: the message and its actions, then the chosen one runs.
            showError: async (error) => {
                errors.push({
                    message: error.userMessage,
                    items: error.actions.map((a) => a.title),
                });
                await error.actions.find((a) => a.title === options.choice)?.run();
            },
            showInformationMessage: async (message) => void infos.push(message),
            showWarningMessage: async (message) => void warnings.push(message),
            withProgress: async (message, task) => {
                log.push(`progress: ${message}`);
                return task();
            },
        },
        log: fakeLog(),
    });
    return { m, state, log, errors, infos, warnings, channel };
}

describe("NotebookInitScriptManager", () => {
    it("verifies when a notebook comes to the front, once per interpreter", async () => {
        const { m, log } = manager();
        await m.onNotebook();
        await m.onNotebook();
        expect(log).toEqual(["install", "run /venv/bin/python in /project"]);
    });

    it("does nothing while no notebook is in front, or the environment isn't usable", async () => {
        const away = manager({ inNotebook: false });
        await away.m.onNotebook();
        await away.m.reset();
        expect(away.log).toEqual([]);

        const unusable = manager({ usable: false });
        await unusable.m.onNotebook();
        expect(unusable.log).toEqual([]);
    });

    it("verifies again after a reset: the interpreter or readiness changed", async () => {
        const { m, log } = manager();
        await m.onNotebook();
        await m.reset();
        expect(log.filter((l) => l.startsWith("run"))).toHaveLength(2);
    });

    it("verifies from the command wherever it runs, with progress and a success message", async () => {
        const { m, log, infos } = manager({ inNotebook: false });
        await m.verifyCommand();
        expect(log).toEqual([
            "install",
            "progress: Verifying databricks notebook init scripts...",
            "run /venv/bin/python in /project",
        ]);
        expect(infos).toEqual(["Successfully verified Databricks notebook init scripts"]);
    });

    it("refuses the command while the environment isn't usable", async () => {
        const { m } = manager({ usable: false });
        await expect(m.verifyCommand()).rejects.toBeInstanceOf(UserFacingError);
    });

    it("says the command needs the Python extension, which finds the interpreter, and stays quiet for a notebook", async () => {
        const { m, log, errors } = manager({
            noPython: true,
            usable: false,
            executable: undefined,
        });
        await expect(m.verifyCommand()).rejects.toThrow(
            "Verifying the notebook init script needs ms-python.python",
        );
        await m.onNotebook();
        expect(log).toEqual([]);
        expect(errors).toEqual([]);
    });

    it("writes the errors to the channel in the old format, and offers to open it", async () => {
        const { m, errors, channel } = manager({
            run: {
                errors: [
                    {
                        functionName: "create_and_register_databricks_globals",
                        errorType: "ModuleNotFoundError",
                        message: "No module named 'databricks'",
                    },
                ],
            },
            choice: OPEN_OUTPUT_WINDOW,
        });
        await m.onNotebook();
        await settleUntil(() =>
            expect(channel.text).toBe(
                `${"=".repeat(30)}\nErrors in 00-databricks-init-abc.py:\n \ncreate_and_register_databricks_globals - ModuleNotFoundError: No module named 'databricks'\n\n\n\n`,
            ),
        );
        expect(errors).toEqual([
            { message: VERIFICATION_FAILED_MESSAGE, items: [OPEN_OUTPUT_WINDOW] },
        ]);
        expect(channel.shown).toBe(1);
    });

    it("doesn't re-run a failed interpreter for another notebook, only after a reset", async () => {
        const { m, log, errors, channel } = manager({
            run: { errors: [], failure: "No module named IPython" },
        });
        await m.onNotebook();
        await settleUntil(() => expect(channel.text).toContain("No module named IPython"));
        // The user has time to fix it.
        await m.onNotebook();
        expect(log.filter((l) => l.startsWith("run"))).toHaveLength(1);
        await m.reset();
        await settleUntil(() => expect(log.filter((l) => l.startsWith("run"))).toHaveLength(2));
        expect(errors).toHaveLength(2);
    });

    it("stays quiet about a missing IPython in the background, and offers the install from the command", async () => {
        const background = manager({ ipython: false });
        await background.m.onNotebook();
        expect(background.errors).toEqual([]);
        expect(background.log).toEqual([]);

        const command = manager({ ipython: false, choice: INSTALL_AND_TRY_AGAIN });
        await command.m.verifyCommand();
        await settleUntil(() =>
            expect(command.errors[0]).toEqual({
                message:
                    "Cannot verify databricks notebook init script. IPython is not installed in the current environment: .venv",
                items: ["Install and try again", "Change environment"],
            }),
        );
        expect(command.log).toEqual([
            "install ipython in /venv/bin/python",
            "verify again",
            "install",
            "progress: Verifying databricks notebook init scripts...",
            "run /venv/bin/python in /project",
        ]);
    });

    it("asks for an interpreter from the command when none is selected", async () => {
        const { m, errors, log } = manager({
            executable: undefined,
            choice: "Select Python Interpreter",
        });
        await m.verifyCommand();
        await settleUntil(() =>
            expect(errors).toEqual([
                {
                    message:
                        "Cannot verify databricks notebook init script. No python interpreter selected.",
                    items: ["Select Python Interpreter"],
                },
            ]),
        );
        expect(log).toEqual(["select interpreter"]);
    });

    it("fails the command with the reason when the script can't be installed, and stays quiet for a notebook", async () => {
        const background = manager({
            installError: "ENOTDIR: not a directory, mkdir '/ipython/profile_default/startup'",
        });
        await background.m.onNotebook();
        expect(background.errors).toEqual([]);
        expect(background.channel.text).toContain("ENOTDIR");

        const command = manager({
            installError: "ENOTDIR: not a directory, mkdir '/ipython/profile_default/startup'",
        });
        const failure = await command.m.verifyCommand().then(
            () => undefined,
            (e: unknown) => e,
        );
        expect(failure).toBeInstanceOf(UserFacingError);
        const error = failure instanceof UserFacingError ? failure : undefined;
        expect(error?.userMessage).toBe(
            "Failed to verify databricks notebook init scripts: ENOTDIR: not a directory, mkdir '/ipython/profile_default/startup'",
        );
        expect(error?.actions.map((a) => a.title)).toEqual([OPEN_OUTPUT_WINDOW]);
        error?.actions[0]?.run();
        expect(command.channel.shown).toBe(1);
        expect(command.log).toEqual([]);
    });

    it("warns when the script can't be installed", async () => {
        const { m, warnings } = manager();
        (m as unknown as { deps: { scripts: { install(): Promise<void> } } }).deps.scripts.install =
            async () => {
                throw new Error("EACCES");
            };
        await m.install();
        expect(warnings).toEqual([
            "Failed to update databricks notebook init script. Some databricks notebook features may not work. EACCES",
        ]);
    });
});
