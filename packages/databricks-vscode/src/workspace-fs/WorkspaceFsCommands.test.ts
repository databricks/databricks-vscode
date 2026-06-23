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
    let lookedUpPaths: string[];
    let warningMessages: string[];
    let openedUri: Uri | undefined;
    let browserOpenedPath: string | undefined;

    // Stubbed globals are restored after each test.
    let originalShowInputBox: typeof window.showInputBox;
    let originalShowWarningMessage: typeof window.showWarningMessage;
    let originalShowTextDocument: typeof window.showTextDocument;
    let originalOpenTextDocument: typeof workspace.openTextDocument;
    let originalFromPath: typeof WorkspaceFsEntity.fromPath;

    let inputName: string;
    // Path (relative to root) at which fromPath should report an existing
    // entity, or undefined for "nothing exists".
    let existingAt: string | undefined;
    // Whether the user clicks "Overwrite" on the prompt.
    let overwriteAnswer: string | undefined;

    beforeEach(() => {
        existingAt = undefined;
        overwriteAnswer = "Overwrite";
        lookedUpPaths = [];
        warningMessages = [];
        openedUri = undefined;
        browserOpenedPath = undefined;
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

        // Fake root that captures what doCreateFile writes. createFile mimics
        // the SDK: a `.ipynb` is stored as a notebook at the stripped path.
        capturedCreate = undefined;
        const fakeRoot = {
            path: ROOT_PATH,
            createFile: async (path: string, content: string) => {
                capturedCreate = {path, content};
                const storedName = path.replace(/\.ipynb$/i, "");
                return {
                    path: `${ROOT_PATH}/${storedName}`,
                } as unknown as WorkspaceFsEntity;
            },
        };
        (commands as any).getValidRoot = async () => fakeRoot;

        // Capture browser opens (used for notebooks) instead of launching one.
        (commands as any).openInBrowser = async (
            element: WorkspaceFsEntity
        ) => {
            browserOpenedPath = element.path;
        };

        // createDirWizard reads the filename from showInputBox.
        originalShowInputBox = window.showInputBox;
        (window as any).showInputBox = async () => inputName;

        // fromPath reports an existing entity only at `existingAt`.
        originalFromPath = WorkspaceFsEntity.fromPath;
        (WorkspaceFsEntity as any).fromPath = async (
            _client: unknown,
            path: string
        ) => {
            lookedUpPaths.push(path);
            return existingAt !== undefined &&
                path === `${ROOT_PATH}/${existingAt}`
                ? ({path} as unknown as WorkspaceFsEntity)
                : undefined;
        };

        // Capture the overwrite prompt and return the canned answer.
        originalShowWarningMessage = window.showWarningMessage;
        (window as any).showWarningMessage = async (message: string) => {
            warningMessages.push(message);
            return overwriteAnswer;
        };

        // Avoid actually opening an editor after creation.
        originalShowTextDocument = window.showTextDocument;
        (window as any).showTextDocument = async () => undefined;
        originalOpenTextDocument = workspace.openTextDocument;
        (workspace as any).openTextDocument = async (uri: Uri) => {
            openedUri = uri;
            return uri;
        };
    });

    afterEach(() => {
        (window as any).showInputBox = originalShowInputBox;
        (window as any).showWarningMessage = originalShowWarningMessage;
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

    it(".ipynb existence check uses the extension-stripped path", async () => {
        inputName = "notebook.ipynb";
        await commands.createFile(makeEntity(ROOT_PATH));

        // The notebook clash is detected at the path without `.ipynb`.
        assert.ok(
            lookedUpPaths.includes(`${ROOT_PATH}/notebook`),
            `expected lookup at stripped path, got ${JSON.stringify(
                lookedUpPaths
            )}`
        );
        assert.ok(!lookedUpPaths.includes(`${ROOT_PATH}/notebook.ipynb`));
    });

    it("prompts to overwrite an existing notebook with the same name", async () => {
        inputName = "notebook.ipynb";
        existingAt = "notebook"; // notebook stored without extension
        await commands.createFile(makeEntity(ROOT_PATH));

        assert.strictEqual(warningMessages.length, 1);
        assert.ok(warningMessages[0].includes('"notebook"'));
        // User clicked Overwrite → file is still created.
        assert.ok(capturedCreate);
    });

    it("aborts creation when overwrite is declined", async () => {
        inputName = "notebook.ipynb";
        existingAt = "notebook";
        overwriteAnswer = undefined; // dismissed / not "Overwrite"
        await commands.createFile(makeEntity(ROOT_PATH));

        assert.strictEqual(warningMessages.length, 1);
        assert.strictEqual(
            capturedCreate,
            undefined,
            "createFile must not run when overwrite is declined"
        );
    });

    it("opens the created notebook in the browser at its stripped path", async () => {
        inputName = "notebook.ipynb";
        await commands.createFile(makeEntity(ROOT_PATH));

        assert.strictEqual(browserOpenedPath, `${ROOT_PATH}/notebook`);
        // It must NOT also open in the text editor.
        assert.strictEqual(openedUri, undefined);
    });

    it("non-notebook files are looked up and opened in the editor by exact name", async () => {
        inputName = "script.py";
        await commands.createFile(makeEntity(ROOT_PATH));

        assert.ok(lookedUpPaths.includes(`${ROOT_PATH}/script.py`));
        assert.ok(openedUri);
        assert.strictEqual(openedUri!.path, `${ROOT_PATH}/script.py`);
        // Non-notebooks must NOT open in the browser.
        assert.strictEqual(browserOpenedPath, undefined);
    });
});
