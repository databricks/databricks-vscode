import { newPatCredentials } from "@databricks/sdk-auth/credentials";
import { setProduct } from "@databricks/sdk-core/clientinfo";
import { describe, expect, it, vi } from "vitest";
import { ApiClients, type Connection } from "../../kernel/connection";
import { FakeHttpClient } from "../../test-support/fakeHttp";
import { FakeWorkspaceFiles } from "../../test-support/fakeWorkspaceFiles";
import { FileChangeType, FileSystemError, FileType, Uri } from "../../test-support/vscode";
import { WorkspaceFilesModel, type WorkspaceFilesChange } from "./WorkspaceFilesModel";
import { WorkspaceFsProvider } from "./WorkspaceFsProvider";

const HOST = "https://a.cloud.databricks.com";
const HOME = "/Users/me@example.com";

function fakeConnection(http: FakeHttpClient): Connection {
    return {
        host: HOST,
        authType: "pat",
        userName: "me@example.com",
        source: { kind: "default", profile: "DEFAULT" },
        api: new ApiClients({
            host: HOST,
            credentials: newPatCredentials("dapi-1"),
            httpClient: http,
        }),
        child: { kind: "profile", host: HOST, profile: "DEFAULT", authType: "pat" },
    } as unknown as Connection;
}

function setup() {
    const http = new FakeHttpClient();
    const files = new FakeWorkspaceFiles(http)
        .mkdir(HOME)
        .file(`${HOME}/a.py`, "print(1)")
        .mkdir(`${HOME}/src`);
    let now = 0;
    const model = new WorkspaceFilesModel(fakeConnection(http), () => now);
    const changes: WorkspaceFilesChange[] = [];
    model.onDidChange((c) => changes.push(c));
    return { http, files, model, changes, advance: (ms: number) => (now += ms) };
}

describe("WorkspaceFilesModel", () => {
    it("is rooted at the user's folder", () => {
        expect(setup().model.root).toBe(HOME);
    });

    it("lists a directory in the old order, and nothing for a missing one", async () => {
        const { model } = setup();
        expect((await model.list(HOME))?.map((e) => [e.path, e.type])).toEqual([
            [`${HOME}/src`, "DIRECTORY"],
            [`${HOME}/a.py`, "FILE"],
        ]);
        expect(await model.list(`${HOME}/missing`)).toBeUndefined();
        expect(await model.stat(`${HOME}/missing`)).toBeUndefined();
        // The API leaves `objects` out for an empty directory.
        expect(await model.list(`${HOME}/src`)).toEqual([]);
    });

    it("shares one request between callers, and reuses results briefly", async () => {
        const { http, model, advance } = setup();
        await Promise.all([model.stat(`${HOME}/a.py`), model.stat(`${HOME}/a.py`)]);
        await model.list(HOME);
        await model.list(HOME);
        expect(http.to("/api/2.0/workspace/get-status")).toHaveLength(1);
        expect(http.to("/api/2.0/workspace/list")).toHaveLength(1);

        advance(5_000);
        await model.stat(`${HOME}/a.py`);
        await model.list(HOME);
        expect(http.to("/api/2.0/workspace/get-status")).toHaveLength(2);
        expect(http.to("/api/2.0/workspace/list")).toHaveLength(2);
    });

    it("shows changes made elsewhere after a refresh", async () => {
        const { files, model, changes } = setup();
        expect(await model.list(HOME)).toHaveLength(2);
        files.objects.delete(`${HOME}/src`);
        expect(await model.list(HOME)).toHaveLength(2);

        model.refresh();

        expect((await model.list(HOME))?.map((e) => e.path)).toEqual([`${HOME}/a.py`]);
        expect(changes).toEqual([{ kind: "refreshed" }]);
    });

    it("doesn't cache a failure", async () => {
        const { http, model } = setup();
        http.on(
            "GET",
            "/api/2.0/workspace/list",
            { status: 403, body: { error_code: "PERMISSION_DENIED", message: "no" } },
            { body: { objects: [] } },
        );
        await expect(model.list(HOME)).rejects.toThrow("no");
        expect(await model.list(HOME)).toEqual([]);
    });

    it("finds nothing for RESOURCE_DOES_NOT_EXIST, which the API also sends with a 400", async () => {
        const { http, model } = setup();
        const gone = {
            status: 400,
            body: { error_code: "RESOURCE_DOES_NOT_EXIST", message: "gone" },
        };
        http.on("GET", "/api/2.0/workspace/get-status", gone).on(
            "GET",
            "/api/2.0/workspace/list",
            gone,
        );
        expect(await model.stat(`${HOME}/a.py`)).toBeUndefined();
        expect(await model.list(HOME)).toBeUndefined();

        http.on("GET", "/api/2.0/workspace/get-status", {
            status: 403,
            body: { error_code: "PERMISSION_DENIED", message: "no" },
        });
        await expect(model.stat(`${HOME}/src`)).rejects.toThrow("no");
    });

    it("retries a read that got a 503, but not a write", async () => {
        const { http, model } = setup();
        const unavailable = {
            status: 503,
            body: { error_code: "TEMPORARILY_UNAVAILABLE", message: "later" },
        };
        http.on("GET", "/api/2.0/workspace/get-status", unavailable, {
            body: { path: `${HOME}/a.py`, object_type: "FILE", object_id: 1 },
        });
        expect(await model.stat(`${HOME}/a.py`)).toMatchObject({ path: `${HOME}/a.py`, id: 1 });
        expect(http.to("/api/2.0/workspace/get-status")).toHaveLength(2);

        http.on("POST", "/api/2.0/workspace/import", unavailable, { body: {} });
        await expect(
            model.write(`${HOME}/a.py`, new TextEncoder().encode("x"), true),
        ).rejects.toThrow("later");
        expect(http.to("/api/2.0/workspace/import")).toHaveLength(1);
    });

    it("exports and imports with format AUTO, as before", async () => {
        const { http, model } = setup();
        await model.read(`${HOME}/a.py`);
        await model.write(`${HOME}/b.py`, new TextEncoder().encode("x = 1"), false);

        const exported = new URL(http.to("/api/2.0/workspace/export")[0]!.url).searchParams;
        expect([exported.get("path"), exported.get("format")]).toEqual([`${HOME}/a.py`, "AUTO"]);
        expect(JSON.parse(http.to("/api/2.0/workspace/import")[0]!.body as string)).toEqual({
            path: `${HOME}/b.py`,
            format: "AUTO",
            overwrite: false,
            content: Buffer.from("x = 1").toString("base64"),
        });
    });

    it("names the extension in its requests' User-Agent", async () => {
        setProduct("databricks-vscode", "0.0.0");
        const { http, model } = setup();
        await model.stat(`${HOME}/a.py`);
        const userAgent = http.to("/api/2.0/workspace/get-status")[0]!.headers.get("User-Agent");
        expect(userAgent).toContain("databricks-vscode/0.0.0");
        expect(userAgent).toContain("auth/pat");
    });

    it("writes, then shows the new file in its directory", async () => {
        const { files, model, changes } = setup();
        await model.list(HOME);

        const created = await model.write(`${HOME}/b.py`, new TextEncoder().encode("x"), false);

        expect(created).toMatchObject({ path: `${HOME}/b.py`, type: "FILE" });
        expect(files.content(`${HOME}/b.py`)).toBe("x");
        expect((await model.list(HOME))?.map((e) => e.path)).toContain(`${HOME}/b.py`);
        expect(changes).toEqual([{ kind: "created", path: `${HOME}/b.py` }]);
    });

    it("resolves a notebook written as .ipynb to its path without the extension", async () => {
        const { model, changes } = setup();
        const created = await model.write(`${HOME}/nb.ipynb`, new TextEncoder().encode("{}"), true);
        expect(created).toMatchObject({ path: `${HOME}/nb`, type: "NOTEBOOK" });
        expect(changes).toEqual([{ kind: "created", path: `${HOME}/nb` }]);
    });

    it("reports an overwrite as a change", async () => {
        const { model, changes } = setup();
        await model.write(`${HOME}/a.py`, new TextEncoder().encode("print(2)"), true);
        expect(new TextDecoder().decode(await model.read(`${HOME}/a.py`))).toBe("print(2)");
        expect(changes).toEqual([{ kind: "changed", path: `${HOME}/a.py` }]);
    });

    it("creates and deletes directories, forgetting what was below", async () => {
        const { model, changes } = setup();
        expect(await model.mkdir(`${HOME}/src/new`)).toMatchObject({ type: "DIRECTORY" });
        expect((await model.list(`${HOME}/src`))?.map((e) => e.path)).toEqual([`${HOME}/src/new`]);

        await model.delete(`${HOME}/src`, true);

        expect(await model.stat(`${HOME}/src/new`)).toBeUndefined();
        expect(await model.list(`${HOME}/src`)).toBeUndefined();
        expect((await model.list(HOME))?.map((e) => e.path)).toEqual([`${HOME}/a.py`]);
        expect(changes).toEqual([
            { kind: "created", path: `${HOME}/src/new` },
            { kind: "deleted", path: `${HOME}/src` },
        ]);
    });
});

/** A get-status answer for a file of `size` bytes. */
function statBody(path: string, size: number) {
    return {
        body: {
            path,
            object_type: "FILE",
            object_id: 100 + size,
            size,
            created_at: 1700000000000,
            modified_at: 1700000000000 + size,
        },
    };
}

/** `promise`, or `"timed out"` if it hasn't settled within `ms`. */
async function within<T>(promise: Promise<T>, ms: number): Promise<T | "timed out"> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<"timed out">(
        (resolve) => (timer = setTimeout(() => resolve("timed out"), ms)),
    );
    try {
        return await Promise.race([promise, timeout]);
    } finally {
        clearTimeout(timer);
    }
}

describe("WorkspaceFsProvider", () => {
    function provider() {
        const s = setup();
        const p = new WorkspaceFsProvider(() => s.model);
        s.model.onDidChange((c) => p.modelChanged(c));
        const events: { type: number; uri: Uri }[][] = [];
        p.onDidChangeFile((e) => events.push(e as never));
        const uri = (path: string) => Uri.from({ scheme: "databricks-wsfs", path }) as never;
        return { ...s, p, events, uri };
    }

    it("stats files and directories", async () => {
        const { p, uri } = provider();
        expect(await p.stat(uri(`${HOME}/a.py`))).toMatchObject({
            type: FileType.File,
            size: 8,
            ctime: 1700000000000,
        });
        expect(await p.stat(uri(HOME))).toMatchObject({ type: FileType.Directory });
        await expect(p.stat(uri(`${HOME}/missing`))).rejects.toMatchObject({
            code: "FileNotFound",
        });
    });

    it("stats fresh, so VS Code's save check sees a change made elsewhere", async () => {
        const { p, uri, files, http, model } = provider();
        const file = `${HOME}/a.py`;
        expect(await p.stat(uri(file))).toMatchObject({ size: 8 });

        files.file(file, "print(1)\nprint(2)");

        expect(await p.stat(uri(file))).toMatchObject({ size: 17 });
        // The fresh result is what the tree and the reads see next.
        expect(await model.stat(file)).toMatchObject({ size: 17 });
        expect(http.to("/api/2.0/workspace/get-status")).toHaveLength(2);
    });

    it("doesn't take a fresh stat from a request that started before the change", async () => {
        const { p, uri, http } = provider();
        const file = `${HOME}/a.py`;
        // The first request is answered only when released, with the old size.
        let release!: () => void;
        const held = new Promise<void>((r) => (release = r));
        http.on(
            "GET",
            "/api/2.0/workspace/get-status",
            async () => {
                await held;
                return statBody(file, 8);
            },
            statBody(file, 17),
        );

        const before = p.stat(uri(file));
        await vi.waitFor(() => expect(http.to("/api/2.0/workspace/get-status")).toHaveLength(1));
        // The change lands while the first request is in flight.
        const fresh = p.stat(uri(file));

        release();
        expect(await within(fresh, 1_000)).toMatchObject({ size: 17 });
        await before;
    });

    it("a newer stat stays cached after an older request settles", async () => {
        const { model, http } = provider();
        const file = `${HOME}/a.py`;
        // The tree's request is answered only when released, with the old size.
        let release!: () => void;
        const held = new Promise<void>((r) => (release = r));
        http.on(
            "GET",
            "/api/2.0/workspace/get-status",
            async () => {
                await held;
                return statBody(file, 8);
            },
            statBody(file, 17),
        );

        const tree = model.stat(file);
        await vi.waitFor(() => expect(http.to("/api/2.0/workspace/get-status")).toHaveLength(1));
        expect(await model.statFresh(file)).toMatchObject({ size: 17 });

        release();
        await tree;
        expect(await model.stat(file)).toMatchObject({ size: 17 });
    });

    it("doesn't wait on a request that hangs when it asks fresh", async () => {
        const { p, uri, http } = provider();
        const file = `${HOME}/a.py`;
        let release!: () => void;
        const held = new Promise<void>((r) => (release = r));
        http.on(
            "GET",
            "/api/2.0/workspace/get-status",
            async () => {
                await held;
                return statBody(file, 8);
            },
            statBody(file, 8),
        );

        const hung = p.stat(uri(file));
        await vi.waitFor(() => expect(http.to("/api/2.0/workspace/get-status")).toHaveLength(1));

        expect(await within(p.stat(uri(file)), 1_000)).toMatchObject({ size: 8 });
        release();
        await hung;
    });

    it("reads a directory and a file", async () => {
        const { p, uri } = provider();
        expect(await p.readDirectory(uri(HOME))).toEqual([
            ["src", FileType.Directory],
            ["a.py", FileType.File],
        ]);
        expect(new TextDecoder().decode(await p.readFile(uri(`${HOME}/a.py`)))).toBe("print(1)");
        await expect(p.readFile(uri(HOME))).rejects.toMatchObject({ code: "FileIsADirectory" });
    });

    it("doesn't read a file as a directory, though the API lists a file as itself", async () => {
        const { p, uri } = provider();
        await expect(p.readDirectory(uri(`${HOME}/a.py`))).rejects.toMatchObject({
            code: "FileNotADirectory",
        });
        await expect(p.readDirectory(uri(`${HOME}/missing`))).rejects.toMatchObject({
            code: "FileNotFound",
        });
    });

    it("writes a file, and tells VS Code it changed", async () => {
        const { p, uri, files, events } = provider();
        await p.writeFile(uri(`${HOME}/a.py`), new TextEncoder().encode("edited"), {
            create: true,
            overwrite: true,
        });
        await p.writeFile(uri(`${HOME}/new.py`), new TextEncoder().encode("new"), {
            create: true,
            overwrite: true,
        });

        expect(files.content(`${HOME}/a.py`)).toBe("edited");
        expect(files.content(`${HOME}/new.py`)).toBe("new");
        expect(events.flat().map((e) => [e.type, e.uri.path])).toEqual([
            [FileChangeType.Changed, `${HOME}/a.py`],
            [FileChangeType.Created, `${HOME}/new.py`],
        ]);
        // Its own write isn't hidden by the cache.
        expect(new TextDecoder().decode(await p.readFile(uri(`${HOME}/a.py`)))).toBe("edited");
    });

    it("refuses writes that VS Code's flags rule out", async () => {
        const { p, uri } = provider();
        const content = new Uint8Array();
        await expect(
            p.writeFile(uri(`${HOME}/new.py`), content, { create: false, overwrite: true }),
        ).rejects.toMatchObject({ code: "FileNotFound" });
        await expect(
            p.writeFile(uri(`${HOME}/a.py`), content, { create: true, overwrite: false }),
        ).rejects.toMatchObject({ code: "FileExists" });
        await expect(
            p.writeFile(uri(`${HOME}/nowhere/x.py`), content, { create: true, overwrite: true }),
        ).rejects.toMatchObject({ code: "FileNotFound" });
        await expect(
            p.writeFile(uri(`${HOME}/a.py/x.py`), content, { create: true, overwrite: true }),
        ).rejects.toMatchObject({ code: "NoPermissions" });
        await expect(
            p.writeFile(uri(`${HOME}/src`), content, { create: true, overwrite: true }),
        ).rejects.toMatchObject({ code: "FileIsADirectory" });
    });

    it("leaves creating directories, deleting and renaming to the commands", () => {
        const { p, uri } = provider();
        const u = uri(`${HOME}/a.py`);
        expect(() => p.createDirectory(u)).toThrow(FileSystemError);
        expect(() => p.delete(u, { recursive: false })).toThrow(
            expect.objectContaining({ code: "NoPermissions" }),
        );
        expect(() => p.rename(u, u, { overwrite: false })).toThrow(
            expect.objectContaining({ code: "NoPermissions" }),
        );
    });

    it("is unavailable while signed out", async () => {
        const p = new WorkspaceFsProvider(() => undefined);
        await expect(
            p.stat(Uri.from({ scheme: "databricks-wsfs", path: HOME }) as never),
        ).rejects.toMatchObject({ code: "Unavailable" });
    });
});
