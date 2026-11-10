import { window, workspace, type Disposable, type Event, type TextDocument } from "vscode";
import type { Logger } from "../../../platform/log";
import type { Readiness } from "../setup/readiness";
import type { KernelRestartPrompt } from "./KernelRestartPrompt";
import type { NotebookInitScriptManager } from "./NotebookInitScriptManager";

/** Whether readiness lets Databricks Connect run: `drifted` still runs, as DB Connect runs do. */
export function usable(readiness: Readiness | undefined): boolean {
    return readiness?.status === "ready" || readiness?.status === "drifted";
}

function isDatabricksPythonNotebook(document: TextDocument | undefined): boolean {
    return (
        document?.languageId === "python" &&
        document.lineCount > 0 &&
        document.lineAt(0).text.startsWith("# Databricks notebook source")
    );
}

/** A Jupyter notebook, one of its cells, or a Databricks `.py` notebook is in front. */
export function inNotebook(): boolean {
    const document = window.activeTextEditor?.document;
    return (
        window.activeNotebookEditor !== undefined ||
        document?.uri.scheme === "vscode-notebook-cell" ||
        isDatabricksPythonNotebook(document)
    );
}

export interface NotebookSessionDeps {
    readonly manager: NotebookInitScriptManager;
    readonly restart: KernelRestartPrompt;
    readiness(): Readiness | undefined;
    /** Fires after each evaluation, which an interpreter change starts. */
    readonly onDidChangeReadiness: Event<unknown>;
    readonly onDidChangeEnvFile: Event<void>;
    readonly log: Logger;
}

/**
 * The notebook half of a project session (RUN-07, RUN-08): the startup
 * script is installed when the environment first becomes usable, and
 * verified when a notebook comes to the front, or again when readiness or
 * its interpreter changes; a changed env file offers to restart the
 * kernels.
 */
export function startNotebookSession(deps: NotebookSessionDeps): Disposable {
    const { manager, log } = deps;
    const quietly = (what: string) => (p: Promise<void>) =>
        p.catch((e: unknown) => log.error(`Notebook init script ${what} failed`, e));
    let installed = false;
    // What the verification depends on: whether the environment is usable, and with which interpreter.
    let last = "";
    const onReadiness = () => {
        const readiness = deps.readiness();
        const key = `${usable(readiness)}:${readiness?.interpreter?.path ?? ""}`;
        if (key === last) {
            return;
        }
        last = key;
        if (usable(readiness) && !installed) {
            installed = true;
            void quietly("install")(manager.install());
        }
        void quietly("verification")(manager.reset());
    };
    const onNotebook = () => void quietly("verification")(manager.onNotebook());
    const subscriptions = [
        deps.onDidChangeReadiness(onReadiness),
        deps.onDidChangeEnvFile(
            () =>
                void deps.restart
                    .onEnvironmentChanged()
                    .catch((e: unknown) => log.error("The kernel restart prompt failed", e)),
        ),
        workspace.onDidOpenNotebookDocument(onNotebook),
        window.onDidChangeActiveNotebookEditor((editor) => {
            if (editor !== undefined) {
                onNotebook();
            }
        }),
        window.onDidChangeActiveTextEditor((editor) => {
            const document = editor?.document;
            if (
                document?.languageId === "python" &&
                (document.uri.scheme === "vscode-notebook-cell" ||
                    isDatabricksPythonNotebook(document))
            ) {
                onNotebook();
            }
        }),
    ];
    onReadiness();
    return { dispose: () => subscriptions.forEach((s) => s.dispose()) };
}
