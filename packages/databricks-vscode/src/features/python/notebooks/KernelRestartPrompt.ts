import type { Logger } from "../../../platform/log";

export const RESTART_PROMPT =
    "Environment variables have changed. Restart all jupyter kernels to pickup the latest environment variables.";
export const RESTART_ALL = "Restart All Jupyter Kernels";

/** Jupyter's restart command; given a notebook's URI it restarts that notebook's kernel, if it has one. */
export const JUPYTER_RESTART_KERNEL = "jupyter.restartkernel";

/** The notebook types whose kernels Jupyter runs: notebooks, and the Interactive Window. */
const JUPYTER_NOTEBOOK_TYPES = new Set(["jupyter-notebook", "interactive"]);

export interface OpenNotebook {
    readonly uri: unknown;
    readonly notebookType: string;
    readonly isClosed: boolean;
}

export interface KernelRestartDeps {
    /** Whether Jupyter, which runs the kernels and the restart command, is installed and enabled. */
    jupyterInstalled(): boolean;
    notebooks(): readonly OpenNotebook[];
    showInformationMessage(message: string, ...items: string[]): Thenable<string | undefined>;
    executeCommand(command: string, ...args: unknown[]): Thenable<unknown>;
    readonly log: Logger;
}

/**
 * When the env file changes while notebooks are open, offers to restart
 * their kernels, so the startup script reads the new variables (RUN-07).
 * Ports the old `showRestartNotebookDialogue`, with a fix: the old loop
 * stopped at the first closed document, and "restarted" by closing and
 * reopening each notebook, which lost the Interactive Window. Each kernel is
 * now restarted through Jupyter, in place; Jupyter may ask to confirm, per
 * `jupyter.askForKernelRestart`.
 */
export class KernelRestartPrompt {
    private prompting = false;

    constructor(private readonly deps: KernelRestartDeps) {}

    async onEnvironmentChanged(): Promise<void> {
        // VS Code opens notebooks without Jupyter, but then nothing runs their kernels.
        if (
            this.prompting ||
            !this.deps.jupyterInstalled() ||
            !this.deps
                .notebooks()
                .some((n) => !n.isClosed && JUPYTER_NOTEBOOK_TYPES.has(n.notebookType))
        ) {
            return;
        }
        this.prompting = true;
        try {
            if (
                (await this.deps.showInformationMessage(RESTART_PROMPT, RESTART_ALL)) !==
                RESTART_ALL
            ) {
                return;
            }
            for (const notebook of this.deps.notebooks()) {
                if (notebook.isClosed || !JUPYTER_NOTEBOOK_TYPES.has(notebook.notebookType)) {
                    continue;
                }
                try {
                    await this.deps.executeCommand(JUPYTER_RESTART_KERNEL, notebook.uri);
                } catch (e) {
                    this.deps.log.error("Failed to restart a Jupyter kernel", e);
                }
            }
        } finally {
            this.prompting = false;
        }
    }
}
