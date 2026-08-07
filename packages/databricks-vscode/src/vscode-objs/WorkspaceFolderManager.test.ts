import {workspace} from "vscode";
import {CustomWhenContext} from "./CustomWhenContext";
import {StateStorage} from "./StateStorage";
import {WorkspaceFolderManager} from "./WorkspaceFolderManager";
import {anything, capture, instance, mock, verify, when} from "ts-mockito";
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

    describe("with no folder open", () => {
        let originalFolders: PropertyDescriptor | undefined;

        beforeEach(() => {
            // Simulate a folderless window: `workspace.workspaceFolders` is
            // undefined, so the manager has no active project/workspace folder.
            originalFolders = Object.getOwnPropertyDescriptor(
                workspace,
                "workspaceFolders"
            );
            Object.defineProperty(workspace, "workspaceFolders", {
                value: undefined,
                configurable: true,
            });
        });

        afterEach(() => {
            if (originalFolders) {
                Object.defineProperty(
                    workspace,
                    "workspaceFolders",
                    originalFolders
                );
            }
        });

        it("does not throw during construction and reports the file as outside the active workspace", () => {
            // Regression guard: `setIsActiveFileInActiveProject` runs from the
            // constructor and must use the non-throwing private field rather
            // than the `activeProjectUri` getter, which throws when no folder is
            // open.
            const stateStorage = mock<StateStorage>();
            const customWhenContext = mock(CustomWhenContext);

            const manager = new WorkspaceFolderManager(
                instance(customWhenContext),
                instance(stateStorage)
            );

            // The when-context is set to false (no folder -> nothing can be in
            // the active workspace), and the getter still throws as designed.
            verify(
                customWhenContext.setIsActiveFileInActiveWorkspace(false)
            ).once();
            const [value] = capture(
                customWhenContext.setIsActiveFileInActiveWorkspace
            ).last();
            assert.strictEqual(value, false);
            assert.throws(() => manager.activeProjectUri);
            assert.throws(() => manager.activeWorkspaceFolder);
            verify(
                customWhenContext.setIsActiveFileInActiveWorkspace(anything())
            ).once();
        });
    });
});
