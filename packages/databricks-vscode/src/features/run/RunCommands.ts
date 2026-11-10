import path from "node:path";
import { debug, Uri, window } from "vscode";
import { UserFacingError } from "../../platform/errors";
import { notebookType } from "./notebooks";

export const RUN_EDITOR_CONTENTS = "databricks.run.runEditorContents";
export const RUN_EDITOR_CONTENTS_AS_WORKFLOW = "databricks.run.runEditorContentsAsWorkflow";

/** Why a session window can't run a file, and what to do instead (`Feature.session`); its launches say the same. */
export const SESSION_RUN_UNAVAILABLE = {
    unavailable:
        "It runs on the compute chosen for the project, and a session window can't choose compute.",
    instead:
        "Run the file with the session's Python, or deploy the bundle and run a job from the bundle views.",
} as const;

/**
 * The file a run command acts on: the explorer's or the editor title's
 * resource, else the active editor's. A notebook's cell editor and the
 * notebook editor give the notebook's file.
 */
export function targetResource(resource?: unknown): Uri | undefined {
    if (resource instanceof Uri) {
        return resource;
    }
    const editor = window.activeTextEditor?.document.uri;
    if (editor !== undefined) {
        return editor.scheme === "vscode-notebook-cell" ? Uri.file(editor.fsPath) : editor;
    }
    return window.activeNotebookEditor?.notebook.uri;
}

function requireFile(resource?: unknown): Uri {
    const uri = targetResource(resource);
    if (uri === undefined) {
        throw new UserFacingError("NO_FILE", "Open a file to run on Databricks");
    }
    return uri;
}

/**
 * "Upload and Run File" (RUN-01): a `databricks` debug session without
 * debugging. The checks, the upload and the run are the session's.
 */
export async function runEditorContents(resource?: unknown): Promise<void> {
    const uri = requireFile(resource);
    if ((await notebookType(uri.fsPath).catch(() => undefined)) !== undefined) {
        throw new UserFacingError(
            "NOTEBOOK",
            'Use "Run File as Workflow on Databricks" for running notebooks',
        );
    }
    await debug.startDebugging(
        undefined,
        {
            type: "databricks",
            name: "Upload and Run File on Databricks",
            request: "launch",
            program: uri.fsPath,
        },
        { noDebug: true },
    );
}

/** "Run File as Workflow" (RUN-02): a `databricks-workflow` debug session without debugging. */
export async function runEditorContentsAsWorkflow(resource?: unknown): Promise<void> {
    const uri = requireFile(resource);
    await debug.startDebugging(
        undefined,
        {
            type: "databricks-workflow",
            name: "Run File on Databricks as Workflow",
            request: "launch",
            program: uri.fsPath,
        },
        { noDebug: true },
    );
}

/** `showRunAsWorkflow`: a local Python file or notebook (the old `updateRunAsWorkflowContext`). */
export async function canRunAsWorkflow(uri: Uri | undefined): Promise<boolean> {
    if (uri === undefined || uri.scheme !== "file") {
        return false;
    }
    return (
        uri.fsPath.endsWith(".py") ||
        (await notebookType(uri.fsPath).catch(() => undefined)) !== undefined
    );
}

/** `isActiveFileInActiveWorkspace`: the file is in the active project. */
export function isInProject(uri: Uri | undefined, root: string | undefined): boolean {
    if (uri === undefined || root === undefined || uri.scheme !== "file") {
        return false;
    }
    const relative = path.relative(root, uri.fsPath);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
