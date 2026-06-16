import assert from "assert";
import {EventEmitter, TreeView} from "vscode";
import {mock, instance, when} from "ts-mockito";
import {WorkspaceFsCommands} from "./WorkspaceFsCommands";
import {WorkspaceFsEntity} from "../sdk-extensions";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {WorkspaceFsDataProvider} from "./WorkspaceFsDataProvider";
import {WorkspaceFsFileSystemProvider} from "./WorkspaceFsFileSystemProvider";
import {WorkspaceFolderManager} from "../vscode-objs/WorkspaceFolderManager";
import {DatabricksWorkspace} from "../configuration/DatabricksWorkspace";
import {RemoteUri} from "../sync/SyncDestination";

// Minimal fake TreeView that tracks selection and fires onDidChangeSelection
class FakeTreeView {
    selection: ReadonlyArray<WorkspaceFsEntity> = [];
    private _emitter = new EventEmitter<{
        selection: WorkspaceFsEntity[];
    }>();
    readonly onDidChangeSelection = this._emitter.event;

    simulateSelect(element: WorkspaceFsEntity | undefined): void {
        this.selection = element ? [element] : [];
        this._emitter.fire({selection: [...this.selection]});
    }
}

function makeEntity(path: string): WorkspaceFsEntity {
    return {path, type: "DIRECTORY"} as unknown as WorkspaceFsEntity;
}

describe("WorkspaceFsCommands – target folder resolution", () => {
    const ROOT_PATH = "/Users/me";

    let fakeTreeView: FakeTreeView;
    let mockConnectionManager: ConnectionManager;
    let commands: WorkspaceFsCommands;
    let capturedRootPath: string | undefined;

    const entityA = makeEntity("/Users/me/A");
    const entityB = makeEntity("/Users/me/B");

    beforeEach(() => {
        fakeTreeView = new FakeTreeView();

        const mockDatabricksWorkspace = mock<DatabricksWorkspace>();
        when(mockDatabricksWorkspace.currentFsRoot).thenReturn(
            new RemoteUri(ROOT_PATH)
        );

        mockConnectionManager = mock<ConnectionManager>();
        when(mockConnectionManager.workspaceClient).thenReturn(
            undefined as any
        );
        when(mockConnectionManager.databricksWorkspace).thenReturn(
            instance(mockDatabricksWorkspace)
        );

        commands = new WorkspaceFsCommands(
            instance(mock<WorkspaceFolderManager>()),
            instance(mockConnectionManager),
            instance(mock<WorkspaceFsDataProvider>()),
            instance(mock<WorkspaceFsFileSystemProvider>()),
            fakeTreeView as unknown as TreeView<WorkspaceFsEntity>
        );

        // Replace getValidRoot to capture rootPath and short-circuit execution
        capturedRootPath = undefined;
        (commands as any).getValidRoot = async (rootPath?: string) => {
            capturedRootPath = rootPath;
            return undefined;
        };
    });

    describe("createFolder", () => {
        it("title bar, nothing selected → targets root", async () => {
            await commands.createFolder(undefined);
            assert.strictEqual(capturedRootPath, ROOT_PATH);
        });

        it("title bar, A selected → targets A", async () => {
            fakeTreeView.simulateSelect(entityA);
            await commands.createFolder(entityA);
            assert.strictEqual(capturedRootPath, entityA.path);
        });

        it("title bar, A selected then deselected → targets root", async () => {
            fakeTreeView.simulateSelect(entityA);
            fakeTreeView.simulateSelect(undefined);
            await commands.createFolder(undefined);
            assert.strictEqual(capturedRootPath, ROOT_PATH);
        });

        it("context menu on B while A is selected → targets B", async () => {
            fakeTreeView.simulateSelect(entityA);
            // Right-click on B does NOT update selection; selection[0] is still A
            await commands.createFolder(entityB);
            assert.strictEqual(capturedRootPath, entityB.path);
        });

        it("context menu on B with nothing selected → targets B", async () => {
            await commands.createFolder(entityB);
            assert.strictEqual(capturedRootPath, entityB.path);
        });

        it("context menu on A while A is selected → targets A", async () => {
            fakeTreeView.simulateSelect(entityA);
            // Right-click on the already-selected item: element === selection[0]
            await commands.createFolder(entityA);
            assert.strictEqual(capturedRootPath, entityA.path);
        });
    });

    describe("uploadFile", () => {
        // uploadFile bails early when workspaceClient is undefined, before
        // reaching getValidRoot. Provide a non-null client so the activeElement
        // logic is exercised.
        beforeEach(() => {
            when(mockConnectionManager.workspaceClient).thenReturn({} as any);
        });

        it("title bar, nothing selected → targets root", async () => {
            await commands.uploadFile(undefined);
            assert.strictEqual(capturedRootPath, ROOT_PATH);
        });

        it("title bar, A selected → targets A", async () => {
            fakeTreeView.simulateSelect(entityA);
            await commands.uploadFile(entityA);
            assert.strictEqual(capturedRootPath, entityA.path);
        });

        it("title bar, A selected then deselected → targets root", async () => {
            fakeTreeView.simulateSelect(entityA);
            fakeTreeView.simulateSelect(undefined);
            await commands.uploadFile(undefined);
            assert.strictEqual(capturedRootPath, ROOT_PATH);
        });

        it("context menu on B while A is selected → targets B", async () => {
            fakeTreeView.simulateSelect(entityA);
            await commands.uploadFile(entityB);
            assert.strictEqual(capturedRootPath, entityB.path);
        });

        it("context menu on B with nothing selected → targets B", async () => {
            await commands.uploadFile(entityB);
            assert.strictEqual(capturedRootPath, entityB.path);
        });

        it("context menu on A while A is selected → targets A", async () => {
            fakeTreeView.simulateSelect(entityA);
            await commands.uploadFile(entityA);
            assert.strictEqual(capturedRootPath, entityA.path);
        });

        it("title bar, file (non-directory) selected → targets root", async () => {
            const fileEntity = {
                path: "/Users/me/A/note.py",
                type: "FILE",
            } as unknown as WorkspaceFsEntity;
            fakeTreeView.simulateSelect(fileEntity);
            await commands.uploadFile(fileEntity);
            assert.strictEqual(capturedRootPath, ROOT_PATH);
        });
    });
});
