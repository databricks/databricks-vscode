import { describe, expect, it } from "vitest";
import { fakeLog } from "../../../test-support/fakes";
import {
    JUPYTER_RESTART_KERNEL,
    KernelRestartPrompt,
    RESTART_ALL,
    RESTART_PROMPT,
    type OpenNotebook,
} from "./KernelRestartPrompt";

function prompt(
    notebooks: OpenNotebook[],
    choice: string | undefined = RESTART_ALL,
    jupyter = true,
) {
    const prompts: { message: string; items: string[] }[] = [];
    const executed: unknown[][] = [];
    let release = () => {};
    const shown = new Promise<void>((resolve) => (release = resolve));
    const p = new KernelRestartPrompt({
        jupyterInstalled: () => jupyter,
        notebooks: () => notebooks,
        showInformationMessage: async (message, ...items) => {
            prompts.push({ message, items });
            await shown;
            return choice;
        },
        executeCommand: async (command, ...args) => void executed.push([command, ...args]),
        log: fakeLog(),
    });
    return { p, prompts, executed, release };
}

const notebook = (
    uri: string,
    notebookType = "jupyter-notebook",
    isClosed = false,
): OpenNotebook => ({ uri, notebookType, isClosed });

describe("KernelRestartPrompt", () => {
    it("restarts every open Jupyter kernel in place, past a closed document", async () => {
        const { p, prompts, executed, release } = prompt([
            notebook("a.ipynb", "jupyter-notebook", true),
            notebook("b.ipynb"),
            notebook("iw", "interactive"),
            notebook("c", "other"),
        ]);
        release();
        await p.onEnvironmentChanged();
        expect(prompts).toEqual([{ message: RESTART_PROMPT, items: [RESTART_ALL] }]);
        expect(executed).toEqual([
            [JUPYTER_RESTART_KERNEL, "b.ipynb"],
            [JUPYTER_RESTART_KERNEL, "iw"],
        ]);
    });

    it("doesn't ask without open Jupyter notebooks", async () => {
        const { p, prompts } = prompt([
            notebook("c", "other"),
            notebook("a.ipynb", "jupyter-notebook", true),
        ]);
        await p.onEnvironmentChanged();
        expect(prompts).toEqual([]);
    });

    it("doesn't ask without Jupyter, which runs the kernels, though VS Code still opens the notebooks", async () => {
        const { p, prompts, executed } = prompt([notebook("a.ipynb")], RESTART_ALL, false);
        await p.onEnvironmentChanged();
        expect(prompts).toEqual([]);
        expect(executed).toEqual([]);
    });

    it("asks once while a prompt is open, and restarts nothing when dismissed", async () => {
        const { p, prompts, executed, release } = prompt([notebook("b.ipynb")], "dismissed");
        const first = p.onEnvironmentChanged();
        await p.onEnvironmentChanged();
        release();
        await first;
        expect(prompts).toHaveLength(1);
        expect(executed).toEqual([]);
    });
});
