import { commands, QuickPickItemKind, Uri, window, workspace, type QuickPickItem } from "vscode";
import type { Kernel } from "../../kernel/feature";
import type { SubProject } from "../../kernel/project/ProjectService";
import { CancelledError } from "../../platform/errors";
import { CONFIGURATION_VIEW_ID } from "./welcome";

/**
 * The project picker (SHELL-03): the folders below the workspace folder that
 * hold a bundle, then "Choose another folder". A folder outside the
 * workspace opens in this window. Ported from the old
 * `promptToSelectActiveProjectFolder`, without its legacy root-level
 * overrides file.
 */
export async function selectActiveProjectFolder(
    kernel: Kernel,
    recordCount: (count: number) => void,
): Promise<void> {
    const folder = workspaceFolderOf(kernel.project.root.value);
    const projects = await window.withProgress(
        { location: { viewId: CONFIGURATION_VIEW_ID } },
        () => kernel.project.findSubProjects(folder),
    );
    recordCount(projects.length);
    const uri = (await pickProject(projects)) ?? (await pickFolder());
    if (uri === undefined) {
        throw new CancelledError();
    }
    if (workspace.getWorkspaceFolder(uri) === undefined) {
        await commands.executeCommand("vscode.openFolder", uri);
        return;
    }
    await kernel.project.selectProject(uri.fsPath);
}

type ProjectItem = QuickPickItem & { uri?: Uri };

/** Undefined means "Choose another folder", or no projects to choose from. */
async function pickProject(projects: readonly SubProject[]): Promise<Uri | undefined> {
    if (projects.length === 0) {
        return undefined;
    }
    const items: ProjectItem[] = [
        ...projects.map((p) => ({
            uri: Uri.file(p.absolute),
            label: p.relative,
            detail: p.absolute,
        })),
        { label: "", kind: QuickPickItemKind.Separator },
        { label: "Choose another folder" },
    ];
    const item = await window.showQuickPick<ProjectItem>(items, {
        title: "Select the project you want to open",
    });
    if (item === undefined) {
        throw new CancelledError();
    }
    return item.uri;
}

async function pickFolder(): Promise<Uri | undefined> {
    const folders = await window.showOpenDialog({ canSelectFolders: true, canSelectMany: false });
    return folders?.[0];
}

/** The workspace folder that holds `root`, else the first one. */
function workspaceFolderOf(root: string | undefined): string | undefined {
    const folder = root !== undefined ? workspace.getWorkspaceFolder(Uri.file(root)) : undefined;
    return (folder ?? workspace.workspaceFolders?.[0])?.uri.fsPath;
}
