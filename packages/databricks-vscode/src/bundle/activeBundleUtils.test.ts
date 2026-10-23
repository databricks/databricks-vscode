import assert from "assert";
import {mkdtempSync, readFileSync, rmSync} from "fs";
import os from "os";
import path from "path";
import {commands, Uri, window, workspace, WorkspaceFolder} from "vscode";
import {anything, capture, instance, mock, verify, when} from "ts-mockito";
import {AuthProvider} from "../configuration/auth/AuthProvider";
import {OverrideableConfigModel} from "../configuration/models/OverrideableConfigModel";
import {WorkspaceFolderManager} from "../vscode-objs/WorkspaceFolderManager";
import {promptToSelectActiveProjectFolder} from "./activeBundleUtils";

describe(__filename, () => {
    let originalShowQuickPick: typeof window.showQuickPick;
    let originalExecuteCommand: typeof commands.executeCommand;
    let originalGetWorkspaceFolder: typeof workspace.getWorkspaceFolder;
    let executedCommands: {command: string; args: unknown[]}[];
    const externalUri = Uri.file(
        path.join(os.tmpdir(), "databricks-external-init")
    );
    const workspaceFolder: WorkspaceFolder = {
        uri: Uri.file(path.join(os.tmpdir(), "databricks-workspace")),
        name: "databricks-workspace",
        index: 0,
    };
    const workspaceProjectUri = Uri.joinPath(workspaceFolder.uri, "project");

    beforeEach(() => {
        executedCommands = [];
        originalShowQuickPick = window.showQuickPick;
        originalExecuteCommand = commands.executeCommand;
        originalGetWorkspaceFolder = workspace.getWorkspaceFolder;
        // Pick the only project offered.
        (window as any).showQuickPick = async (items: {uri?: Uri}[]) =>
            items[0];
        (commands as any).executeCommand = (
            command: string,
            ...args: unknown[]
        ) => {
            executedCommands.push({command, args});
            return Promise.resolve();
        };
        // Only paths under workspaceFolder are in the workspace.
        (workspace as any).getWorkspaceFolder = (uri: Uri) =>
            uri.fsPath.startsWith(workspaceFolder.uri.fsPath + path.sep)
                ? workspaceFolder
                : undefined;
    });

    afterEach(() => {
        (window as any).showQuickPick = originalShowQuickPick;
        (commands as any).executeCommand = originalExecuteCommand;
        (workspace as any).getWorkspaceFolder = originalGetWorkspaceFolder;
    });

    it("opens an externally initialized project with vscode.openFolder", async () => {
        const workspaceFolderManager = mock<WorkspaceFolderManager>();

        await promptToSelectActiveProjectFolder(
            [{absolute: externalUri, relative: "databricks-external-init"}],
            undefined,
            instance(workspaceFolderManager)
        );

        assert.deepStrictEqual(executedCommands, [
            {command: "vscode.openFolder", args: [externalUri]},
        ]);
        verify(
            workspaceFolderManager.setActiveProjectFolder(
                anything(),
                anything()
            )
        ).never();
    });

    it("saves the auth profile in an external project before opening it", async () => {
        const projectDir = mkdtempSync(
            path.join(os.tmpdir(), "databricks-external-init-")
        );
        try {
            const projectUri = Uri.file(projectDir);
            const overrideFile =
                OverrideableConfigModel.getRootOverrideFile(projectUri).fsPath;
            // The reloaded window reads the profile from this file, so it must
            // be written by the time vscode.openFolder runs.
            let overridesWhenOpened: unknown;
            (commands as any).executeCommand = async () => {
                overridesWhenOpened = JSON.parse(
                    readFileSync(overrideFile, "utf-8")
                );
            };
            const authProvider = mock<AuthProvider>();
            when(authProvider.authType).thenReturn("profile");
            when(authProvider.toJSON()).thenReturn({profile: "DEFAULT"});

            await promptToSelectActiveProjectFolder(
                [{absolute: projectUri, relative: "project"}],
                instance(authProvider),
                instance(mock<WorkspaceFolderManager>())
            );

            assert.deepStrictEqual(overridesWhenOpened, {
                authProfile: "DEFAULT",
            });
        } finally {
            rmSync(projectDir, {recursive: true, force: true});
        }
    });

    it("opens the project when no workspace folder manager is available", async () => {
        await promptToSelectActiveProjectFolder([
            {absolute: workspaceProjectUri, relative: "project"},
        ]);

        assert.deepStrictEqual(executedCommands, [
            {command: "vscode.openFolder", args: [workspaceProjectUri]},
        ]);
    });

    it("sets the active project in place when it is inside the workspace", async () => {
        const workspaceFolderManager = mock<WorkspaceFolderManager>();

        await promptToSelectActiveProjectFolder(
            [{absolute: workspaceProjectUri, relative: "project"}],
            undefined,
            instance(workspaceFolderManager)
        );

        assert.strictEqual(executedCommands.length, 0);
        verify(
            workspaceFolderManager.setActiveProjectFolder(
                anything(),
                anything()
            )
        ).once();
        const [projectFolder, folder] = capture(
            workspaceFolderManager.setActiveProjectFolder
        ).last();
        assert.strictEqual(projectFolder.fsPath, workspaceProjectUri.fsPath);
        assert.strictEqual(folder, workspaceFolder);
    });
});
