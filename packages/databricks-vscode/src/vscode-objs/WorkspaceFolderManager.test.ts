import {
    Disposable,
    EventEmitter,
    TextEditor,
    Uri,
    WorkspaceFolder,
    window,
    workspace,
} from "vscode";
import {CustomWhenContext} from "./CustomWhenContext";
import {StateStorage} from "./StateStorage";
import {WorkspaceFolderManager} from "./WorkspaceFolderManager";
import {instance, mock, when} from "ts-mockito";
import assert from "node:assert";
import path from "node:path";

describe(__filename, () => {
    it("should correctly set workspace and project folders", () => {
        const stateStorage = mock<StateStorage>();
        const workspaceFolder = workspace.workspaceFolders?.[0];
        assert.ok(workspaceFolder, "workspaceFolder is not defined");
        const workspaceFolderManager = new WorkspaceFolderManager(
            new CustomWhenContext(),
            instance(stateStorage)
        );
        assert.strictEqual(
            workspaceFolderManager.activeProjectUri,
            workspaceFolder.uri
        );
        assert.strictEqual(
            workspaceFolderManager.activeWorkspaceFolder.uri,
            workspaceFolder.uri
        );
    });

    it("should correctly set workspace and project folders based on the state storage", () => {
        const stateStorage = mock<StateStorage>();
        const workspaceFolder = workspace.workspaceFolders?.[0];
        assert.ok(workspaceFolder, "workspaceFolder is not defined");
        const projectPath = path.join(workspaceFolder.uri.fsPath, "project");
        when(stateStorage.get("databricks.activeProjectPath")).thenReturn(
            projectPath
        );
        const workspaceFolderManager = new WorkspaceFolderManager(
            new CustomWhenContext(),
            instance(stateStorage)
        );
        assert.strictEqual(
            workspaceFolderManager.activeProjectUri.fsPath,
            projectPath
        );
        assert.strictEqual(
            workspaceFolderManager.activeWorkspaceFolder.uri,
            workspaceFolder.uri
        );
    });

    it("should fallback to default workspace and project folders if the state storage path is outside of the workspace", () => {
        const stateStorage = mock<StateStorage>();
        const workspaceFolder = workspace.workspaceFolders?.[0];
        assert.ok(workspaceFolder, "workspaceFolder is not defined");
        when(stateStorage.get("databricks.activeProjectPath")).thenReturn(
            "/hello"
        );
        const workspaceFolderManager = new WorkspaceFolderManager(
            new CustomWhenContext(),
            instance(stateStorage)
        );
        assert.strictEqual(
            workspaceFolderManager.activeProjectUri,
            workspaceFolder.uri
        );
        assert.strictEqual(
            workspaceFolderManager.activeWorkspaceFolder.uri,
            workspaceFolder.uri
        );
    });
});
