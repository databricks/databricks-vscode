import assert from "assert";
import {EventEmitter, TreeView, Uri, window, workspace} from "vscode";
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
    const fileEntity = {
        path: "/Users/me/A/note.py",
        type: "FILE",
    } as unknown as WorkspaceFsEntity;

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

    // Context-menu command: element is the right-clicked node; treeView
    // selection is irrelevant.
    describe("createFolder (context menu)", () => {
        it("no element → targets root", async () => {
            await commands.createFolder(undefined);
            assert.strictEqual(capturedRootPath, ROOT_PATH);
        });

        it("element=A → targets A", async () => {
            await commands.createFolder(entityA);
            assert.strictEqual(capturedRootPath, entityA.path);
        });

        it("element=B while A is selected → targets B", async () => {
            fakeTreeView.simulateSelect(entityA);
            await commands.createFolder(entityB);
            assert.strictEqual(capturedRootPath, entityB.path);
        });
    });

    // Toolbar command: VS Code passes the currently-selected node as element.
    // resolveTargetElementForToolbar uses treeView.selection to detect whether
    // something is truly selected; if not, it falls back to root.
    describe("createFolderFromToolbar (toolbar)", () => {
        it("nothing selected → targets root", async () => {
            await commands.createFolderFromToolbar(undefined);
            assert.strictEqual(capturedRootPath, ROOT_PATH);
        });

        it("A selected, toolbar clicked → targets A", async () => {
            fakeTreeView.simulateSelect(entityA);
            // VS Code passes the selected node as element on toolbar click
            await commands.createFolderFromToolbar(entityA);
            assert.strictEqual(capturedRootPath, entityA.path);
        });

        it("selection cleared before toolbar click → targets root", async () => {
            fakeTreeView.simulateSelect(entityA);
            fakeTreeView.simulateSelect(undefined);
            await commands.createFolderFromToolbar(undefined);
            assert.strictEqual(capturedRootPath, ROOT_PATH);
        });

        it("element passed but nothing selected (edge case) → targets root", async () => {
            // treeView.selection is empty; resolveTargetElementForToolbar
            // ignores the element and returns undefined → root
            await commands.createFolderFromToolbar(entityA);
            assert.strictEqual(capturedRootPath, ROOT_PATH);
        });
    });

    // createFile mirrors createFolder's target resolution but, like upload,
    // checks workspaceClient before reaching getValidRoot.
    describe("createFile (context menu)", () => {
        beforeEach(() => {
            when(mockConnectionManager.workspaceClient).thenReturn({} as any);
        });

        it("no element → targets root", async () => {
            await commands.createFile(makeEntity(ROOT_PATH));
            assert.strictEqual(capturedRootPath, ROOT_PATH);
        });

        it("element=A → targets A", async () => {
            await commands.createFile(entityA);
            assert.strictEqual(capturedRootPath, entityA.path);
        });

        it("element=B while A is selected → targets B", async () => {
            fakeTreeView.simulateSelect(entityA);
            await commands.createFile(entityB);
            assert.strictEqual(capturedRootPath, entityB.path);
        });
    });

    describe("createFileFromToolbar (toolbar)", () => {
        beforeEach(() => {
            when(mockConnectionManager.workspaceClient).thenReturn({} as any);
        });

        it("nothing selected → targets root", async () => {
            await commands.createFileFromToolbar(undefined);
            assert.strictEqual(capturedRootPath, ROOT_PATH);
        });

        it("A selected, toolbar clicked → targets A", async () => {
            fakeTreeView.simulateSelect(entityA);
            await commands.createFileFromToolbar(entityA);
            assert.strictEqual(capturedRootPath, entityA.path);
        });

        it("selection cleared before toolbar click → targets root", async () => {
            fakeTreeView.simulateSelect(entityA);
            fakeTreeView.simulateSelect(undefined);
            await commands.createFileFromToolbar(undefined);
            assert.strictEqual(capturedRootPath, ROOT_PATH);
        });

        it("element passed but nothing selected (edge case) → targets root", async () => {
            await commands.createFileFromToolbar(entityA);
            assert.strictEqual(capturedRootPath, ROOT_PATH);
        });
    });

    describe("uploadFile (context menu)", () => {
        // doUploadFile checks workspaceClient before reaching getValidRoot;
        // provide a non-null client so root-path resolution is exercised.
        beforeEach(() => {
            when(mockConnectionManager.workspaceClient).thenReturn({} as any);
        });

        it("no element → targets root", async () => {
            await commands.uploadFile(undefined);
            assert.strictEqual(capturedRootPath, ROOT_PATH);
        });

        it("element=A (directory) → targets A", async () => {
            await commands.uploadFile(entityA);
            assert.strictEqual(capturedRootPath, entityA.path);
        });

        it("element=B while A is selected → targets B", async () => {
            fakeTreeView.simulateSelect(entityA);
            await commands.uploadFile(entityB);
            assert.strictEqual(capturedRootPath, entityB.path);
        });

        it("element=file (non-directory) → targets root", async () => {
            await commands.uploadFile(fileEntity);
            assert.strictEqual(capturedRootPath, ROOT_PATH);
        });
    });

    describe("uploadFileFromToolbar (toolbar)", () => {
        beforeEach(() => {
            when(mockConnectionManager.workspaceClient).thenReturn({} as any);
        });

        it("nothing selected → targets root", async () => {
            await commands.uploadFileFromToolbar(undefined);
            assert.strictEqual(capturedRootPath, ROOT_PATH);
        });

        it("A selected, toolbar clicked → targets A", async () => {
            fakeTreeView.simulateSelect(entityA);
            await commands.uploadFileFromToolbar(entityA);
            assert.strictEqual(capturedRootPath, entityA.path);
        });

        it("selection cleared before toolbar click → targets root", async () => {
            fakeTreeView.simulateSelect(entityA);
            fakeTreeView.simulateSelect(undefined);
            await commands.uploadFileFromToolbar(undefined);
            assert.strictEqual(capturedRootPath, ROOT_PATH);
        });

        it("element passed but nothing selected (edge case) → targets root", async () => {
            await commands.uploadFileFromToolbar(entityA);
            assert.strictEqual(capturedRootPath, ROOT_PATH);
        });

        it("file selected, toolbar clicked → targets root", async () => {
            fakeTreeView.simulateSelect(fileEntity);
            await commands.uploadFileFromToolbar(fileEntity);
            assert.strictEqual(capturedRootPath, ROOT_PATH);
        });
    });
});

describe("WorkspaceFsCommands – createFile content", () => {
    const ROOT_PATH = "/Users/me";

    let commands: WorkspaceFsCommands;
    let capturedCreate: {path: string; content: string} | undefined;

    // Stubbed globals are restored after each test.
    let originalShowInputBox: typeof window.showInputBox;
    let originalShowTextDocument: typeof window.showTextDocument;
    let originalOpenTextDocument: typeof workspace.openTextDocument;
    let originalFromPath: typeof WorkspaceFsEntity.fromPath;

    let inputName: string;

    beforeEach(() => {
        const mockConnectionManager = mock<ConnectionManager>();
        when(mockConnectionManager.workspaceClient).thenReturn({} as any);

        // createDirWizard reads activeProjectUri to seed the input box.
        const mockWorkspaceFolderManager = mock<WorkspaceFolderManager>();
        when(mockWorkspaceFolderManager.activeProjectUri).thenReturn(
            Uri.file("/tmp/project")
        );

        commands = new WorkspaceFsCommands(
            instance(mockWorkspaceFolderManager),
            instance(mockConnectionManager),
            instance(mock<WorkspaceFsDataProvider>()),
            instance(mock<WorkspaceFsFileSystemProvider>()),
            new FakeTreeView() as unknown as TreeView<WorkspaceFsEntity>
        );

        // Fake root that captures what doCreateFile writes.
        capturedCreate = undefined;
        const fakeRoot = {
            path: ROOT_PATH,
            createFile: async (path: string, content: string) => {
                capturedCreate = {path, content};
            },
        };
        (commands as any).getValidRoot = async () => fakeRoot;

        // createDirWizard reads the filename from showInputBox.
        originalShowInputBox = window.showInputBox;
        (window as any).showInputBox = async () => inputName;

        // No pre-existing file → skip the overwrite prompt.
        originalFromPath = WorkspaceFsEntity.fromPath;
        (WorkspaceFsEntity as any).fromPath = async () => undefined;

        // Avoid actually opening an editor after creation.
        originalShowTextDocument = window.showTextDocument;
        (window as any).showTextDocument = async () => undefined;
        originalOpenTextDocument = workspace.openTextDocument;
        (workspace as any).openTextDocument = async (uri: Uri) => uri;
    });

    afterEach(() => {
        (window as any).showInputBox = originalShowInputBox;
        (window as any).showTextDocument = originalShowTextDocument;
        (workspace as any).openTextDocument = originalOpenTextDocument;
        (WorkspaceFsEntity as any).fromPath = originalFromPath;
    });

    it(".ipynb file is created with valid empty notebook JSON", async () => {
        inputName = "notebook.ipynb";
        await commands.createFile(makeEntity(ROOT_PATH));

        assert.ok(capturedCreate, "createFile should have been called");
        assert.strictEqual(capturedCreate!.path, "notebook.ipynb");

        const parsed = JSON.parse(capturedCreate!.content);
        assert.deepStrictEqual(parsed.cells, []);
        assert.strictEqual(parsed.nbformat, 4);
        assert.strictEqual(parsed.nbformat_minor, 5);
        assert.strictEqual(parsed.metadata.language_info.name, "python");
    });

    it(".IPYNB extension is matched case-insensitively", async () => {
        inputName = "NoteBook.IPYNB";
        await commands.createFile(makeEntity(ROOT_PATH));

        assert.ok(capturedCreate);
        const parsed = JSON.parse(capturedCreate!.content);
        assert.strictEqual(parsed.nbformat, 4);
    });

    it(".py file is created with empty content", async () => {
        inputName = "script.py";
        await commands.createFile(makeEntity(ROOT_PATH));

        assert.ok(capturedCreate);
        assert.strictEqual(capturedCreate!.content, "");
    });

    it("plain file is created with empty content", async () => {
        inputName = "notes.txt";
        await commands.createFile(makeEntity(ROOT_PATH));

        assert.ok(capturedCreate);
        assert.strictEqual(capturedCreate!.content, "");
    });
});
