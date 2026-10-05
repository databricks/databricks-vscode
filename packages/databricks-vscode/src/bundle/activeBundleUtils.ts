import {
    QuickPickItem,
    QuickPickItemKind,
    Uri,
    window,
    commands,
    workspace,
} from "vscode";
import {AuthProvider} from "../configuration/auth/AuthProvider";
import {OverrideableConfigModel} from "../configuration/models/OverrideableConfigModel";
import {writeFile, mkdir} from "fs/promises";
import path from "path";
import {WorkspaceFolderManager} from "../vscode-objs/WorkspaceFolderManager";
import {ConfigModel} from "../configuration/models/ConfigModel";
import {ProcessError} from "../cli/CliWrapper";

export async function promptToSelectActiveProjectFolder(
    projects: {absolute: Uri; relative: string}[],
    authProvider?: AuthProvider,
    workspaceFolderManager?: WorkspaceFolderManager
) {
    let uri: Uri | undefined;

    type OpenProjectItem = QuickPickItem & {uri?: Uri};
    const items: OpenProjectItem[] = projects.map((project) => {
        return {
            uri: project.absolute,
            label: project.relative,
            detail: project.absolute.fsPath,
        };
    });

    if (items.length > 0) {
        items.push(
            {label: "", kind: QuickPickItemKind.Separator},
            {label: "Choose another folder"}
        );
        const options = {
            title: "Select the project you want to open",
        };
        const item = await window.showQuickPick<OpenProjectItem>(
            items,
            options
        );
        if (!item) {
            return;
        }
        uri = item.uri;
    }

    if (!uri) {
        const folders = await window.showOpenDialog({
            canSelectFolders: true,
            canSelectMany: false,
        });
        if (folders) {
            uri = folders[0];
        }
    }

    if (!uri) {
        return;
    }

    if (authProvider?.authType === "profile") {
        const rootOverrideFilePath =
            OverrideableConfigModel.getRootOverrideFile(uri);
        await mkdir(path.dirname(rootOverrideFilePath.fsPath), {
            recursive: true,
        });
        await writeFile(
            rootOverrideFilePath.fsPath,
            JSON.stringify({authProfile: authProvider.toJSON().profile})
        );
    }

    const workspaceFolder = workspace.getWorkspaceFolder(uri);
    if (!workspaceFolderManager || !workspaceFolder) {
        await commands.executeCommand("vscode.openFolder", uri);
    } else {
        workspaceFolderManager.setActiveProjectFolder(uri, workspaceFolder);
    }
}

/**
 * The project-folder picker, with progress shown on the Configuration view
 * while `findProjects` searches for sub-projects. Shared by normal mode
 * (BundleProjectManager) and remote mode.
 */
export async function selectActiveProjectFolder(
    workspaceFolderManager: WorkspaceFolderManager,
    findProjects: () => Promise<{absolute: Uri; relative: string}[]>
) {
    return window.withProgress(
        {location: {viewId: "configurationView"}},
        async () =>
            promptToSelectActiveProjectFolder(
                await findProjects(),
                undefined,
                workspaceFolderManager
            )
    );
}

/**
 * Show a quickpick of the active project's bundle targets and set the chosen one
 * on the ConfigModel. Shared by the normal-mode ConnectionCommands.selectTarget
 * and the remote-mode `databricks.connection.bundle.selectTarget` registration.
 * A CLI failure is shown as its own error message rather than thrown, so
 * callers' error popups don't repeat it.
 */
export async function promptToSelectBundleTarget(configModel: ConfigModel) {
    const targets = await configModel.targets;
    const currentTarget = configModel.target;
    if (targets === undefined || Object.keys(targets).length === 0) {
        window.showInformationMessage(
            "The selected project has no bundle targets."
        );
        return;
    }

    const selectedTarget = await window.showQuickPick(
        Object.keys(targets)
            .map((t) => {
                return {
                    label: t,
                    description: targets[t].mode ?? "dev",
                    detail: targets[t].workspace?.host,
                };
            })
            .sort((a) => (a.label === currentTarget ? -1 : 1)),
        {title: "Select bundle target"}
    );
    if (selectedTarget === undefined) {
        return;
    }
    try {
        await configModel.setTarget(selectedTarget.label);
    } catch (e) {
        if (e instanceof ProcessError) {
            e.showErrorMessage("Error selecting target");
            return;
        }
        throw e;
    }
}
