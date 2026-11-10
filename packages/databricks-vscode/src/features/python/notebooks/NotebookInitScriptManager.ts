import path from "node:path";
import { errorMessage, UserFacingError } from "../../../platform/errors";
import type { Logger } from "../../../platform/log";
import { PYTHON } from "../../../kernel/extensionDependencies";
import type { ExtensionDependencies } from "../../../platform/extensions";
import type { InitScriptRun, InitScripts } from "./InitScripts";

export const NOTEBOOKS_CHANNEL = "Databricks Notebooks";

export const VERIFICATION_FAILED_MESSAGE =
    "There were errors when running the notebook init script. See the Databricks Notebook output window for more details.";
export const OPEN_OUTPUT_WINDOW = "Open Output Window";
export const INSTALL_AND_TRY_AGAIN = "Install and try again";
const CHANGE_ENVIRONMENT = "Change environment";
const SELECT_PYTHON_INTERPRETER = "Select Python Interpreter";

/** The "Databricks Notebooks" channel. */
interface NotebooksChannel {
    appendLine(text: string): void;
    show(): void;
}

interface NotebookInitScriptUi {
    /** `ctx.commands.showError`: the prompts don't end the command, and most run outside one. */
    showError(error: UserFacingError): Promise<void>;
    showInformationMessage(message: string): Thenable<unknown>;
    showWarningMessage(message: string): Thenable<unknown>;
    /** A notification with `message` while `task` runs. */
    withProgress<R>(message: string, task: () => Promise<R>): Promise<R>;
}

export interface NotebookInitScriptDeps {
    readonly scripts: InitScripts;
    /** The project root: the kernel's working folder, where the script finds the env file. */
    readonly root: string;
    /**
     * Whether the session's Python environment can run Databricks Connect:
     * readiness is `ready` or `drifted`. The old manager asked the
     * legacy checklist the same question.
     */
    usable(): boolean;
    /** A Jupyter notebook, a notebook cell, or a Databricks `.py` notebook is in front. */
    inNotebook(): boolean;
    /** Throws when ms-python, which finds the interpreter, is missing or disabled. */
    readonly requireExtension: ExtensionDependencies["require"];
    /** ms-python's interpreter for the project. */
    executable(): Promise<string | undefined>;
    environmentName(): Promise<string | undefined>;
    hasIpython(executable: string): Promise<boolean>;
    installIpython(executable: string): Promise<void>;
    selectInterpreter(): Promise<void>;
    /**
     * Runs `databricks.notebookInitScript.verify` again, as a command: after
     * "Install and try again", a failure then shows like the first run's.
     */
    verifyAgain(): Promise<void>;
    /** The script's environment: the child environment with the env file applied, written first. */
    env(): Promise<NodeJS.ProcessEnv>;
    channel(): NotebooksChannel;
    readonly ui: NotebookInitScriptUi;
    readonly log: Logger;
}

/**
 * Installs the IPython startup script and checks that it loads in the
 * project's interpreter (RUN-08). Ports the old `NotebookInitScriptManager`,
 * per project session, over readiness instead of the `FeatureManager`.
 *
 * The script is run once per interpreter: again only when the interpreter or
 * readiness changes, or from `databricks.notebookInitScript.verify`. A
 * failure is reported again, without re-running, until then, so users have
 * time to fix it.
 *
 * Fixed: the old check for "a notebook is in front" never held (an
 * un-awaited promise), so every trigger verified; a missing IPython was
 * reported and then run anyway; a missing interpreter was checked after
 * IPython.
 */
export class NotebookInitScriptManager {
    private verified = false;
    /**
     * The interpreter last verified, or tried. `null` before any, or after a
     * change; `undefined` when none was selected.
     */
    private currentExecutable: string | undefined | null = null;
    private queue: Promise<void> = Promise.resolve();
    private failurePromptShown = false;

    constructor(private readonly deps: NotebookInitScriptDeps) {}

    /**
     * Copies the script into the startup folder, removing outdated copies.
     * Runs when the environment first becomes usable; a failure is a warning,
     * as before, since notebooks then lack the Databricks globals.
     */
    install(): Promise<void> {
        return this.enqueue(async () => {
            try {
                await this.deps.scripts.install();
            } catch (e) {
                this.deps.log.error("Failed to update init script", e);
                void this.deps.ui.showWarningMessage(
                    `Failed to update databricks notebook init script. Some databricks notebook features may not work. ${errorMessage(e)}`,
                );
            }
        });
    }

    /** A notebook opened or came to the front: verify, unless this interpreter was. */
    async onNotebook(): Promise<void> {
        if (await this.isKnownEnvironment()) {
            return;
        }
        return this.verify(false);
    }

    /** The interpreter or readiness changed: forget the last result and verify again. */
    reset(): Promise<void> {
        this.verified = false;
        this.currentExecutable = null;
        return this.verify(false);
    }

    /** `databricks.notebookInitScript.verify`. */
    verifyCommand(): Promise<void> {
        this.verified = false;
        this.currentExecutable = null;
        return this.verify(true);
    }

    private async isKnownEnvironment(): Promise<boolean> {
        return this.currentExecutable === (await this.deps.executable());
    }

    private verify(fromCommand: boolean): Promise<void> {
        return this.enqueue(() => this.doVerify(fromCommand));
    }

    /** One at a time, as the old mutex did, so two copies or runs can't interleave. */
    private enqueue(task: () => Promise<void>): Promise<void> {
        const next = this.queue.then(task);
        this.queue = next.catch(() => {});
        return next;
    }

    private async doVerify(fromCommand: boolean): Promise<void> {
        const { deps } = this;
        if (fromCommand) {
            // Without it the environment is never usable, and the next check would say only that.
            deps.requireExtension(PYTHON, "Verifying the notebook init script");
        }
        if (!deps.usable()) {
            if (fromCommand) {
                throw new UserFacingError(
                    "PYTHON_ENVIRONMENT_NOT_READY",
                    "Cannot verify databricks notebook init script. Set up the Python environment for Databricks Connect first.",
                );
            }
            return;
        }
        // Only notebooks run the script; the command checks wherever it runs.
        if (!fromCommand && !deps.inNotebook()) {
            return;
        }
        if (this.verified) {
            return;
        }
        const executable = await deps.executable();
        if (executable === undefined) {
            if (fromCommand) {
                void deps.ui.showError(
                    new UserFacingError(
                        "NO_PYTHON_INTERPRETER",
                        "Cannot verify databricks notebook init script. No python interpreter selected.",
                        {
                            actions: [
                                {
                                    title: SELECT_PYTHON_INTERPRETER,
                                    run: () => deps.selectInterpreter(),
                                },
                            ],
                        },
                    ),
                );
            }
            return;
        }
        if (this.currentExecutable === executable) {
            // Already tried with this interpreter: say so again, but give the user time to fix it.
            this.showVerificationFailMessage();
            return;
        }
        try {
            if (!(await deps.hasIpython(executable))) {
                if (fromCommand) {
                    this.offerIpythonInstall(executable);
                }
                return;
            }
            this.currentExecutable = executable;
            await deps.scripts.install();
            const run = async () =>
                this.report(
                    await deps.scripts.run(executable, { env: await deps.env(), cwd: deps.root }),
                );
            this.verified = fromCommand
                ? await deps.ui.withProgress(
                      "Verifying databricks notebook init scripts...",
                      async () => {
                          const success = await run();
                          if (success) {
                              void deps.ui.showInformationMessage(
                                  "Successfully verified Databricks notebook init scripts",
                              );
                          }
                          return success;
                      },
                  )
                : await run();
        } catch (e) {
            const channel = deps.channel();
            channel.appendLine("=".repeat(30));
            channel.appendLine(errorMessage(e));
            deps.log.error("Notebook Init Script Error", e);
            // A notebook coming to the front stays quiet; the command was asked for an answer.
            if (fromCommand) {
                throw new UserFacingError(
                    "NOTEBOOK_INIT_SCRIPT_FAILED",
                    `Failed to verify databricks notebook init scripts: ${errorMessage(e)}`,
                    {
                        cause: e,
                        actions: [{ title: OPEN_OUTPUT_WINDOW, run: () => deps.channel().show() }],
                    },
                );
            }
        }
    }

    private offerIpythonInstall(executable: string): void {
        const { deps } = this;
        const installAndRetry = async () => {
            try {
                await deps.installIpython(executable);
            } catch (e) {
                void deps.ui.showError(
                    new UserFacingError(
                        "IPYTHON_INSTALL_FAILED",
                        `Failed to install IPython: ${errorMessage(e)}`,
                        { cause: e },
                    ),
                );
                return;
            }
            await deps.verifyAgain();
        };
        void deps
            .environmentName()
            .then((name) =>
                deps.ui.showError(
                    new UserFacingError(
                        "IPYTHON_MISSING",
                        `Cannot verify databricks notebook init script. IPython is not installed in the current environment: ${name ?? executable}`,
                        {
                            actions: [
                                { title: INSTALL_AND_TRY_AGAIN, run: installAndRetry },
                                { title: CHANGE_ENVIRONMENT, run: () => deps.selectInterpreter() },
                            ],
                        },
                    ),
                ),
            )
            .catch((e: unknown) =>
                deps.log.error("Failed to install IPython and verify the notebook init script", e),
            );
    }

    /** Writes the errors to the channel, in the old format. Resolves with whether the script loaded cleanly. */
    private report(run: InitScriptRun): boolean {
        const channel = this.deps.channel();
        const lines = run.errors.map((e) => `${e.functionName} - ${e.errorType}: ${e.message}`);
        if (run.failure !== undefined) {
            lines.push(run.failure);
        }
        if (lines.length === 0) {
            return true;
        }
        channel.appendLine("=".repeat(30));
        channel.appendLine(`Errors in ${path.basename(run.file)}:`);
        channel.appendLine(" ");
        lines.forEach((line) => channel.appendLine(line));
        channel.appendLine("\n\n");
        this.deps.log.error("Notebook Init Script Error", lines.join("\n"));
        this.showVerificationFailMessage();
        return false;
    }

    /** At most one at a time. */
    private showVerificationFailMessage(): void {
        if (this.failurePromptShown) {
            return;
        }
        this.failurePromptShown = true;
        void this.deps.ui
            .showError(
                new UserFacingError("NOTEBOOK_INIT_SCRIPT_FAILED", VERIFICATION_FAILED_MESSAGE, {
                    actions: [{ title: OPEN_OUTPUT_WINDOW, run: () => this.deps.channel().show() }],
                }),
            )
            .then(
                () => (this.failurePromptShown = false),
                () => (this.failurePromptShown = false),
            );
    }
}
