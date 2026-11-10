import { beforeEach, describe, expect, it } from "vitest";
import { registerFeatures, startFeatures } from "../../kernel/feature";
import { MutableState, when } from "../../platform/reactive";
import { fakeFeatureHost, fakeKernel } from "../../test-support/fakes";
import { FakeFileEvents } from "../../test-support/fakeFiles";
import { FakeHttpClient, SCIM_ME } from "../../test-support/fakeHttp";
import { FakeWorkspaceFiles } from "../../test-support/fakeWorkspaceFiles";
import { useTempDirs } from "../../test-support/tempDir";
import { host as vscode, type TreeItem } from "../../test-support/vscode";
import { workspaceFiles } from "./index";
import { EMPTY_IPYNB_CONTENT } from "./WorkspaceFsCommands";
import type { WorkspaceFsNode, WorkspaceFsTreeDataProvider } from "./WorkspaceFsTree";

const A = "https://a.cloud.databricks.com";
const HOME = "/Users/me@example.com";
const tempDir = useTempDirs();

/** The real kernel, connected as me@example.com, with workspace files registered, and a home folder with a folder, a file and a notebook. */
async function setup(options: { project?: boolean } = {}) {
    const t = tempDir();
    const config = t.write(".databrickscfg", `[DEFAULT]\nhost = ${A}\ntoken = dapi-default\n`);
    const folders: string[] = [];
    if (options.project === true) {
        t.write(
            "my-project/databricks.yml",
            `bundle: {name: demo}\ntargets:\n  dev: {default: true, workspace: {host: ${A}}}\n`,
        );
        folders.push(t.path("my-project"));
    }
    vscode.folders = folders;
    const http = new FakeHttpClient().on("GET", SCIM_ME, () => ({
        body: { userName: "me@example.com" },
    }));
    const files = new FakeWorkspaceFiles(http)
        .mkdir(`${HOME}/A`)
        .mkdir(`${HOME}/B`)
        .file(`${HOME}/A/note.py`, "print('hi')")
        .file(`${HOME}/nb`, "# Databricks notebook source", "NOTEBOOK");
    const kernel = fakeKernel({
        env: { DATABRICKS_CONFIG_FILE: config },
        httpClient: http,
        folders: new MutableState<readonly string[]>(folders),
        files: new FakeFileEvents(),
    });
    const fake = fakeFeatureHost(kernel);
    const registered = registerFeatures([workspaceFiles], fake.host);
    kernel.start();
    startFeatures(registered);
    await when(kernel.connection.state, (s) => s.status === "connected");
    if (options.project === true) {
        await when(kernel.project.active, (p) => p !== undefined);
    }

    const tree = vscode.treeDataProviders.get("workspaceFsView") as WorkspaceFsTreeDataProvider;
    const treeView = vscode.treeViews.get("workspaceFsView")!;
    const roots = () => tree.getChildren();
    const node = async (path: string): Promise<WorkspaceFsNode> => {
        let nodes = await roots();
        for (;;) {
            const found = nodes.find((n) => n.entry.path === path);
            if (found !== undefined) {
                return found;
            }
            const parent = nodes.find((n) => path.startsWith(n.entry.path + "/"));
            if (parent === undefined) {
                throw new Error(`No row for ${path}`);
            }
            nodes = await parent.getChildren();
        }
    };
    const labels = async (nodes?: WorkspaceFsNode[]) =>
        (nodes ?? (await roots())).map((n) => (n.getTreeItem() as unknown as TreeItem).label);
    const run = (command: string, ...args: unknown[]) => vscode.commands.get(command)?.(...args);
    const select = (n?: WorkspaceFsNode) => (treeView.selection = n === undefined ? [] : [n]);
    const typed = (value: string | undefined) => (vscode.nextInput = value);
    return { kernel, http, files, tree, roots, node, labels, run, select, typed, t };
}

describe("workspace files", () => {
    beforeEach(() => vscode.reset());

    describe("the tree (WSFS-01)", () => {
        it("lists the home folder's children, folders first", async () => {
            const s = await setup();
            expect(await s.labels()).toEqual(["A", "B", "nb"]);
            expect(await s.labels(await (await s.node(`${HOME}/A`)).getChildren())).toEqual([
                "note.py",
            ]);
            s.kernel.dispose();
        });

        it("renders rows as before: files open in an editor, notebooks in the browser", async () => {
            const s = await setup();
            const dir = (await s.node(`${HOME}/A`)).getTreeItem() as unknown as TreeItem & {
                tooltip: { value: string };
            };
            const file = (await s.node(`${HOME}/A/note.py`)).getTreeItem() as unknown as TreeItem;
            const nbNode = await s.node(`${HOME}/nb`);
            const nb = nbNode.getTreeItem() as unknown as TreeItem;

            expect([
                dir.contextValue,
                dir.collapsibleState,
                dir.iconPath?.id,
                dir.iconPath?.color?.id,
            ]).toEqual(["wsfs.directory", 1, "file-directory", "charts.green"]);
            expect((dir as unknown as { id: string }).id).toBe(`${HOME}/A`);
            expect(dir.tooltip.value).toBe(`**A**\n\nPath: \`${HOME}/A\`\n\nType: DIRECTORY`);
            expect([file.contextValue, file.collapsibleState, file.iconPath?.id]).toEqual([
                "wsfs.file",
                0,
                "file",
            ]);
            expect(file.command?.command).toBe("vscode.open");
            expect(String(file.command?.arguments?.[0])).toBe(`databricks-wsfs:${HOME}/A/note.py`);
            expect([nb.contextValue, nb.iconPath?.id, nb.command?.command]).toEqual([
                "wsfs.notebook",
                "notebook",
                "databricks.wsfs.openInBrowser",
            ]);
            expect(nb.command?.arguments).toEqual([nbNode]);
            s.kernel.dispose();
        });

        it("has no rows while signed out", async () => {
            const s = await setup();
            await s.kernel.connection.signOut();
            expect(await s.roots()).toEqual([]);
            s.kernel.dispose();
        });

        it("shows a deletion made outside VS Code after a refresh", async () => {
            const s = await setup();
            expect(await s.labels()).toContain("B");
            s.files.objects.delete(`${HOME}/B`);
            s.files.file(`${HOME}/new.py`, "");
            let refreshed = 0;
            s.tree.onDidChangeTreeData(() => refreshed++);

            await s.run("databricks.wsfs.refresh");

            expect(refreshed).toBe(1);
            expect(await s.labels()).toEqual(["A", "nb", "new.py"]);
            s.kernel.dispose();
        });

        it("registers databricks-wsfs:, case-sensitive", async () => {
            const s = await setup();
            expect(vscode.fileSystemProviders.has("databricks-wsfs")).toBe(true);
            s.kernel.dispose();
        });
    });

    // Ported from WorkspaceFsCommands.test.ts: which folder each command acts on.
    describe("the target folder", () => {
        const targetOf = async (
            s: Awaited<ReturnType<typeof setup>>,
            command: string,
            ...args: unknown[]
        ) => {
            s.typed(undefined);
            vscode.inputBoxes.length = 0;
            await s.run(command, ...args);
            const box = vscode.inputBoxes[0];
            // The validation message names the root.
            return (box?.validateInput?.("../x") as string | undefined)?.replace(
                "The path must be a child of ",
                "",
            );
        };

        it("createFolder: no row → the root; a row → that row, whatever is selected", async () => {
            const s = await setup();
            const a = await s.node(`${HOME}/A`);
            const b = await s.node(`${HOME}/B`);
            expect(await targetOf(s, "databricks.wsfs.createFolder")).toBe(HOME);
            expect(await targetOf(s, "databricks.wsfs.createFolder", a)).toBe(`${HOME}/A`);
            s.select(a);
            expect(await targetOf(s, "databricks.wsfs.createFolder", b)).toBe(`${HOME}/B`);
            s.kernel.dispose();
        });

        it("createFolder from the toolbar: the selected row, else the root", async () => {
            const s = await setup();
            const a = await s.node(`${HOME}/A`);
            expect(await targetOf(s, "databricks.wsfs.createFolder.toolbar")).toBe(HOME);
            s.select(a);
            expect(await targetOf(s, "databricks.wsfs.createFolder.toolbar", a)).toBe(`${HOME}/A`);
            s.select(undefined);
            expect(await targetOf(s, "databricks.wsfs.createFolder.toolbar")).toBe(HOME);
            // A row passed while nothing is selected (edge case) → the root.
            expect(await targetOf(s, "databricks.wsfs.createFolder.toolbar", a)).toBe(HOME);
            s.kernel.dispose();
        });

        it("createNewFile, and its toolbar variant, resolve the same way", async () => {
            const s = await setup();
            const a = await s.node(`${HOME}/A`);
            const b = await s.node(`${HOME}/B`);
            expect(await targetOf(s, "databricks.wsfs.createNewFile")).toBe(HOME);
            expect(await targetOf(s, "databricks.wsfs.createNewFile", a)).toBe(`${HOME}/A`);
            s.select(a);
            expect(await targetOf(s, "databricks.wsfs.createNewFile", b)).toBe(`${HOME}/B`);
            expect(await targetOf(s, "databricks.wsfs.createNewFile.toolbar", a)).toBe(`${HOME}/A`);
            s.select(undefined);
            expect(await targetOf(s, "databricks.wsfs.createNewFile.toolbar", a)).toBe(HOME);
            s.kernel.dispose();
        });

        it("uploadFile: a directory row → it; a file row → the root; the toolbar needs a selection", async () => {
            const s = await setup();
            const a = await s.node(`${HOME}/A`);
            const b = await s.node(`${HOME}/B`);
            const file = await s.node(`${HOME}/A/note.py`);
            const local = s.t.write("local.txt", "local");
            vscode.files.set(local, new TextEncoder().encode("local"));
            const uploadedTo = async (command: string, arg?: unknown) => {
                vscode.nextOpenDialog = local;
                await s.run(command, arg);
                const uploaded = [...s.files.objects.keys()].filter((p) =>
                    p.endsWith("/local.txt"),
                );
                uploaded.forEach((p) => s.files.objects.delete(p));
                // Deleted behind the model's back: refresh, so the next upload doesn't ask to overwrite.
                await s.run("databricks.wsfs.refresh");
                return uploaded;
            };
            expect(await uploadedTo("databricks.wsfs.uploadFile")).toEqual([`${HOME}/local.txt`]);
            expect(await uploadedTo("databricks.wsfs.uploadFile", a)).toEqual([
                `${HOME}/A/local.txt`,
            ]);
            s.select(a);
            expect(await uploadedTo("databricks.wsfs.uploadFile", b)).toEqual([
                `${HOME}/B/local.txt`,
            ]);
            expect(await uploadedTo("databricks.wsfs.uploadFile", file)).toEqual([
                `${HOME}/local.txt`,
            ]);
            expect(await uploadedTo("databricks.wsfs.uploadFile.toolbar", a)).toEqual([
                `${HOME}/A/local.txt`,
            ]);
            s.select(file);
            expect(await uploadedTo("databricks.wsfs.uploadFile.toolbar", file)).toEqual([
                `${HOME}/local.txt`,
            ]);
            s.select(undefined);
            expect(await uploadedTo("databricks.wsfs.uploadFile.toolbar", a)).toEqual([
                `${HOME}/local.txt`,
            ]);
            expect(vscode.errors).toEqual([]);
            s.kernel.dispose();
        });
    });

    describe("createFolder (WSFS-03)", () => {
        it("asks for a name, creates the folder, and shows it", async () => {
            const s = await setup();
            s.typed("made");
            await s.run("databricks.wsfs.createFolder");

            expect(vscode.inputBoxes[0]).toMatchObject({ title: "Directory Name", value: "" });
            expect(s.files.objects.get(`${HOME}/made`)?.type).toBe("DIRECTORY");
            expect(await s.labels()).toEqual(["A", "B", "made", "nb"]);
            expect(vscode.errors).toEqual([]);
            s.kernel.dispose();
        });

        it("preselects the project folder's name, as before", async () => {
            const s = await setup({ project: true });
            await s.run("databricks.wsfs.createFolder");
            expect(vscode.inputBoxes[0]).toMatchObject({
                value: "my-project",
                placeHolder: "my-project",
            });
            s.kernel.dispose();
        });

        it("validates the name", async () => {
            const s = await setup();
            await s.run("databricks.wsfs.createFolder");
            const validate = vscode.inputBoxes[0]!.validateInput!;
            expect(validate("")).toBe(`The path must be a child of ${HOME}`);
            expect(validate("..")).toBe(`The path must be a child of ${HOME}`);
            expect(validate("a/b")).toBe("Invalid name: Folders cannot contain '/'");
            expect(validate("ok")).toBeUndefined();
            s.kernel.dispose();
        });

        it("does nothing when dismissed", async () => {
            const s = await setup();
            await s.run("databricks.wsfs.createFolder");
            expect(s.http.to("/api/2.0/workspace/mkdirs")).toEqual([]);
            expect(vscode.errors).toEqual([]);
            s.kernel.dispose();
        });

        it("says so when a file has the name", async () => {
            const s = await setup();
            s.typed("note.py");
            await s.run("databricks.wsfs.createFolder", await s.node(`${HOME}/A`));
            expect(vscode.errors.map((e) => e.message)).toEqual([
                `Can't create note.py as child of ${HOME}/A: A file with same path exists`,
            ]);
            s.kernel.dispose();
        });

        it("refuses a file as the parent", async () => {
            const s = await setup();
            await s.run("databricks.wsfs.createFolder", await s.node(`${HOME}/A/note.py`));
            expect(vscode.errors.map((e) => e.message)).toEqual([
                "Cannot create a directory as a child of a FILE",
            ]);
            s.kernel.dispose();
        });

        it("needs a connection", async () => {
            const s = await setup();
            await s.kernel.connection.signOut();
            await s.run("databricks.wsfs.createFolder");
            await s.run("databricks.wsfs.refresh");
            expect(vscode.errors.map((e) => e.message)).toEqual(["Sign in to Databricks first."]);
            s.kernel.dispose();
        });
    });

    // Ported from WorkspaceFsCommands.test.ts: "createFile content".
    describe("createNewFile (WSFS-03)", () => {
        it("creates a .ipynb as a valid empty notebook, and opens it in the browser", async () => {
            const s = await setup();
            s.typed("notebook.ipynb");
            await s.run("databricks.wsfs.createNewFile");

            const created = s.files.objects.get(`${HOME}/notebook`);
            expect(created?.type).toBe("NOTEBOOK");
            const parsed = JSON.parse(s.files.content(`${HOME}/notebook`)!);
            expect([
                parsed.cells,
                parsed.nbformat,
                parsed.nbformat_minor,
                parsed.metadata.language_info.name,
            ]).toEqual([[], 4, 5, "python"]);
            expect(s.files.content(`${HOME}/notebook`)).toBe(EMPTY_IPYNB_CONTENT);
            expect(vscode.opened).toEqual([`${A}/editor/notebooks/${created!.id}`]);
            expect(vscode.shownDocuments).toEqual([]);
            s.kernel.dispose();
        });

        it("matches .IPYNB case-insensitively", async () => {
            const s = await setup();
            s.typed("NoteBook.IPYNB");
            await s.run("databricks.wsfs.createNewFile");
            expect(JSON.parse(s.files.content(`${HOME}/NoteBook`)!).nbformat).toBe(4);
            s.kernel.dispose();
        });

        it("creates a .py or plain file empty, and opens it in an editor by its exact name", async () => {
            const s = await setup();
            s.typed("script.py");
            await s.run("databricks.wsfs.createNewFile");
            s.typed("notes.txt");
            await s.run("databricks.wsfs.createNewFile");

            expect([
                s.files.content(`${HOME}/script.py`),
                s.files.content(`${HOME}/notes.txt`),
            ]).toEqual(["", ""]);
            expect(vscode.shownDocuments).toEqual([`${HOME}/script.py`, `${HOME}/notes.txt`]);
            expect(vscode.opened).toEqual([]);
            expect(await s.labels()).toEqual(["A", "B", "nb", "notes.txt", "script.py"]);
            s.kernel.dispose();
        });

        it("checks a .ipynb against the path without the extension, and asks before overwriting", async () => {
            const s = await setup();
            s.files.file(`${HOME}/notebook`, "# Databricks notebook source", "NOTEBOOK");
            s.typed("notebook.ipynb");
            vscode.nextMessageChoice = "Overwrite";
            await s.run("databricks.wsfs.createNewFile");

            expect(vscode.warnings.map((w) => [w.message, w.actions])).toEqual([
                [`"notebook" already exists in the workspace. Overwrite it?`, ["Overwrite"]],
            ]);
            const statuses = s.http
                .to("/api/2.0/workspace/get-status")
                .map((r) => new URL(r.url).searchParams.get("path"));
            expect(statuses).toContain(`${HOME}/notebook`);
            expect(s.files.content(`${HOME}/notebook`)).toBe(EMPTY_IPYNB_CONTENT);
            s.kernel.dispose();
        });

        it("creates nothing when the overwrite is declined", async () => {
            const s = await setup();
            s.files.file(`${HOME}/notebook`, "old", "NOTEBOOK");
            s.typed("notebook.ipynb");
            await s.run("databricks.wsfs.createNewFile");
            expect(vscode.warnings).toHaveLength(1);
            expect(s.http.to("/api/2.0/workspace/import")).toEqual([]);
            expect(s.files.content(`${HOME}/notebook`)).toBe("old");
            s.kernel.dispose();
        });
    });

    describe("the other actions (WSFS-04)", () => {
        it("deletes after the confirmation, recursively for folders", async () => {
            const s = await setup();
            vscode.nextMessageChoice = "Delete";
            await s.run("databricks.wsfs.delete", await s.node(`${HOME}/A`));

            expect(vscode.warnings.map((w) => w.message)).toEqual([`Delete "A"?`]);
            expect(JSON.parse(s.http.to("/api/2.0/workspace/delete")[0]!.body as string)).toEqual({
                path: `${HOME}/A`,
                recursive: true,
            });
            expect(s.files.objects.has(`${HOME}/A/note.py`)).toBe(false);
            expect(await s.labels()).toEqual(["B", "nb"]);
            s.kernel.dispose();
        });

        it("deletes nothing when declined", async () => {
            const s = await setup();
            await s.run("databricks.wsfs.delete", await s.node(`${HOME}/nb`));
            expect(s.http.to("/api/2.0/workspace/delete")).toEqual([]);
            s.kernel.dispose();
        });

        it("asks before an upload overwrites", async () => {
            const s = await setup();
            const local = s.t.write("note.py", "new");
            vscode.files.set(local, new TextEncoder().encode("new"));
            vscode.nextOpenDialog = local;
            await s.run("databricks.wsfs.uploadFile", await s.node(`${HOME}/A`));
            expect(s.files.content(`${HOME}/A/note.py`)).toBe("print('hi')");

            vscode.nextMessageChoice = "Overwrite";
            await s.run("databricks.wsfs.uploadFile", await s.node(`${HOME}/A`));
            expect(s.files.content(`${HOME}/A/note.py`)).toBe("new");
            s.kernel.dispose();
        });

        it("asks before an uploaded .ipynb replaces the notebook it is stored as", async () => {
            const s = await setup();
            const local = s.t.write("nb.ipynb", EMPTY_IPYNB_CONTENT);
            vscode.files.set(local, new TextEncoder().encode(EMPTY_IPYNB_CONTENT));
            vscode.nextOpenDialog = local;
            await s.run("databricks.wsfs.uploadFile");

            expect(s.files.content(`${HOME}/nb`)).toBe("# Databricks notebook source");
            expect(s.http.to("/api/2.0/workspace/import")).toEqual([]);
            expect(vscode.warnings.map((w) => [w.message, w.actions])).toEqual([
                [`"nb" already exists in the workspace. Overwrite it?`, ["Overwrite"]],
            ]);

            vscode.nextMessageChoice = "Overwrite";
            await s.run("databricks.wsfs.uploadFile");
            expect(s.files.content(`${HOME}/nb`)).toBe(EMPTY_IPYNB_CONTENT);
            s.kernel.dispose();
        });

        it("asks before an uploaded notebook source replaces the notebook it is stored as, and not for a plain file", async () => {
            const s = await setup();
            const source = "# Databricks notebook source\nprint('new')";
            const local = s.t.write("nb.py", source);
            vscode.files.set(local, new TextEncoder().encode(source));
            vscode.nextOpenDialog = local;
            await s.run("databricks.wsfs.uploadFile");

            expect(s.files.content(`${HOME}/nb`)).toBe("# Databricks notebook source");
            expect(s.http.to("/api/2.0/workspace/import")).toEqual([]);
            expect(vscode.warnings.map((w) => w.message)).toEqual([
                `"nb" already exists in the workspace. Overwrite it?`,
            ]);

            // A .py without the header is imported as a file, under its own name: no clash with the notebook.
            const plain = s.t.write("plain/nb.py", "print('file')");
            vscode.files.set(plain, new TextEncoder().encode("print('file')"));
            vscode.nextOpenDialog = plain;
            await s.run("databricks.wsfs.uploadFile");
            expect(vscode.warnings).toHaveLength(1);
            expect(s.files.content(`${HOME}/nb.py`)).toBe("print('file')");
            expect(s.files.content(`${HOME}/nb`)).toBe("# Databricks notebook source");
            s.kernel.dispose();
        });

        it("checks a notebook source by its own language's header, as the import does", async () => {
            const s = await setup();
            s.files
                .file(`${HOME}/x.sql`, "select 1")
                .file(`${HOME}/y`, "-- Databricks notebook source", "NOTEBOOK");
            const upload = async (name: string, content: string) => {
                const local = s.t.write(`up/${name}`, content);
                vscode.files.set(local, new TextEncoder().encode(content));
                vscode.nextOpenDialog = local;
                await s.run("databricks.wsfs.uploadFile");
            };
            // A SQL file with Python's header is a file to the import, stored as x.sql.
            await upload("x.sql", "# Databricks notebook source\nselect 2");
            // With SQL's own header it is the notebook y.
            await upload("y.sql", "-- Databricks notebook source\nselect 3");

            expect(vscode.warnings.map((w) => w.message)).toEqual([
                `"x.sql" already exists in the workspace. Overwrite it?`,
                `"y" already exists in the workspace. Overwrite it?`,
            ]);
            expect(s.http.to("/api/2.0/workspace/import")).toEqual([]);
            s.kernel.dispose();
        });

        it("downloads a file to the chosen place, and only files and notebooks", async () => {
            const s = await setup();
            vscode.nextSaveDialog = "/tmp/out/note.py";
            await s.run("databricks.wsfs.downloadFile", await s.node(`${HOME}/A/note.py`));
            expect(new TextDecoder().decode(vscode.files.get("/tmp/out/note.py"))).toBe(
                "print('hi')",
            );

            await s.run("databricks.wsfs.downloadFile", await s.node(`${HOME}/A`));
            expect(vscode.errors.map((e) => e.message)).toEqual([
                "Can only download files and notebooks",
            ]);
            s.kernel.dispose();
        });

        it("opens a row in the browser, and copies its path", async () => {
            const s = await setup();
            const a = await s.node(`${HOME}/A`);
            await s.run("databricks.wsfs.openInBrowser", a);
            await s.run("databricks.wsfs.copyPath", await s.node(`${HOME}/A/note.py`));
            expect(vscode.opened).toEqual([`${A}/browse/folders/${a.entry.id}`]);
            expect(vscode.clipboard).toBe(`${HOME}/A/note.py`);
            s.kernel.dispose();
        });

        it("opens files written through databricks-wsfs: with their new content", async () => {
            const s = await setup();
            const provider = vscode.fileSystemProviders.get("databricks-wsfs") as {
                readFile(uri: unknown): Promise<Uint8Array>;
                writeFile(
                    uri: unknown,
                    content: Uint8Array,
                    options: { create: boolean; overwrite: boolean },
                ): Promise<void>;
            };
            const uri = { scheme: "databricks-wsfs", path: `${HOME}/A/note.py` };
            expect(new TextDecoder().decode(await provider.readFile(uri))).toBe("print('hi')");
            await provider.writeFile(uri, new TextEncoder().encode("edited"), {
                create: true,
                overwrite: true,
            });
            expect(s.files.content(`${HOME}/A/note.py`)).toBe("edited");
            s.kernel.dispose();
        });
    });
});
