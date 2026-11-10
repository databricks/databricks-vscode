import type { HttpRequest } from "@databricks/sdk-core/http";
import type { FakeHttpClient, FakeResponse } from "./fakeHttp";

/* eslint-disable @typescript-eslint/naming-convention */

interface FakeObject {
    readonly type: "DIRECTORY" | "REPO" | "FILE" | "NOTEBOOK";
    readonly id: number;
    content?: Uint8Array;
    language?: string;
}

const notFound = (path: string): FakeResponse => ({
    status: 404,
    body: { error_code: "RESOURCE_DOES_NOT_EXIST", message: `Path (${path}) doesn't exist.` },
});

const parentOf = (p: string) => p.slice(0, p.lastIndexOf("/")) || "/";

/**
 * An in-memory workspace behind the Workspace-objects API, as the real one
 * answers: `get-status`, `list`, `export`, `import` (with `AUTO` turning a
 * `.ipynb` or a notebook source into a notebook without its extension),
 * `mkdirs` and `delete`. Routes are added to a `FakeHttpClient`.
 */
export class FakeWorkspaceFiles {
    readonly objects = new Map<string, FakeObject>();
    private nextId = 100;

    constructor(http: FakeHttpClient) {
        http.on("GET", "/api/2.0/workspace/get-status", (r) => this.getStatus(r))
            .on("GET", "/api/2.0/workspace/list", (r) => this.list(r))
            .on("GET", "/api/2.0/workspace/export", (r) => this.export(r))
            .on("POST", "/api/2.0/workspace/import", (r) => this.import(r))
            .on("POST", "/api/2.0/workspace/mkdirs", (r) => this.mkdirs(r))
            .on("POST", "/api/2.0/workspace/delete", (r) => this.delete(r));
    }

    mkdir(path: string, type: "DIRECTORY" | "REPO" = "DIRECTORY"): this {
        let current = "";
        for (const part of path.split("/").filter(Boolean)) {
            current += `/${part}`;
            if (!this.objects.has(current)) {
                this.objects.set(current, {
                    type: current === path ? type : "DIRECTORY",
                    id: this.nextId++,
                });
            }
        }
        return this;
    }

    file(path: string, content: string, type: "FILE" | "NOTEBOOK" = "FILE"): this {
        this.mkdir(parentOf(path));
        this.objects.set(path, {
            type,
            id: this.nextId++,
            content: new TextEncoder().encode(content),
            ...(type === "NOTEBOOK" ? { language: "PYTHON" } : {}),
        });
        return this;
    }

    content(path: string): string | undefined {
        const o = this.objects.get(path);
        return o?.content === undefined ? undefined : new TextDecoder().decode(o.content);
    }

    private info(path: string, o: FakeObject) {
        return {
            path,
            object_type: o.type,
            object_id: o.id,
            ...(o.language !== undefined ? { language: o.language } : {}),
            ...(o.content !== undefined
                ? {
                      size: o.content.length,
                      created_at: 1700000000000,
                      modified_at: 1700000000000 + o.id,
                  }
                : {}),
        };
    }

    private getStatus(r: HttpRequest): FakeResponse {
        const path = new URL(r.url).searchParams.get("path")!;
        const o = this.objects.get(path);
        return o === undefined ? notFound(path) : { body: this.info(path, o) };
    }

    private list(r: HttpRequest): FakeResponse {
        const path = new URL(r.url).searchParams.get("path")!;
        const listed = this.objects.get(path);
        if (listed === undefined) {
            return notFound(path);
        }
        // The API lists a file or notebook as itself.
        if (listed.type === "FILE" || listed.type === "NOTEBOOK") {
            return { body: { objects: [this.info(path, listed)] } };
        }
        const objects = [...this.objects]
            .filter(([p]) => p !== path && parentOf(p) === path)
            .map(([p, o]) => this.info(p, o));
        // The API leaves `objects` out for an empty directory.
        return { body: objects.length === 0 ? {} : { objects } };
    }

    private export(r: HttpRequest): FakeResponse {
        const path = new URL(r.url).searchParams.get("path")!;
        const o = this.objects.get(path);
        if (o?.content === undefined) {
            return notFound(path);
        }
        return {
            body: {
                content: Buffer.from(o.content).toString("base64"),
                file_type: o.type === "NOTEBOOK" ? "py" : "",
            },
        };
    }

    private import(r: HttpRequest): FakeResponse {
        const { path, content, overwrite } = JSON.parse(r.body as string) as {
            path: string;
            content: string;
            overwrite: boolean;
            format: string;
        };
        const bytes = Buffer.from(content, "base64");
        const text = bytes.toString();
        const notebook = /\.ipynb$/i.test(path) || isNotebookSource(path, text);
        const target = notebook ? path.replace(/\.(py|ipynb|scala|r|sql)$/i, "") : path;
        if (this.objects.has(target) && !overwrite) {
            return {
                status: 400,
                body: {
                    error_code: "RESOURCE_ALREADY_EXISTS",
                    message: `${target} already exists.`,
                },
            };
        }
        if (!this.objects.has(parentOf(target))) {
            return notFound(parentOf(target));
        }
        this.objects.set(target, {
            type: notebook ? "NOTEBOOK" : "FILE",
            id: this.nextId++,
            content: bytes,
            ...(notebook ? { language: "PYTHON" } : {}),
        });
        return { body: {} };
    }

    private mkdirs(r: HttpRequest): FakeResponse {
        const { path } = JSON.parse(r.body as string) as { path: string };
        const existing = this.objects.get(path);
        if (existing !== undefined && existing.type !== "DIRECTORY") {
            return {
                status: 400,
                body: {
                    error_code: "RESOURCE_ALREADY_EXISTS",
                    message: `Node named '${path}' already exists`,
                },
            };
        }
        this.mkdir(path);
        return { body: {} };
    }

    private delete(r: HttpRequest): FakeResponse {
        const { path, recursive } = JSON.parse(r.body as string) as {
            path: string;
            recursive: boolean;
        };
        if (!this.objects.has(path)) {
            return notFound(path);
        }
        const below = [...this.objects.keys()].filter((p) => p.startsWith(path + "/"));
        if (below.length > 0 && !recursive) {
            return {
                status: 400,
                body: {
                    error_code: "DIRECTORY_NOT_EMPTY",
                    message: `Folder (${path}) is not empty`,
                },
            };
        }
        for (const p of [path, ...below]) {
            this.objects.delete(p);
        }
        return { body: {} };
    }
}

/** A source file the AUTO import makes a notebook: the first line is its language's notebook header. */
function isNotebookSource(path: string, text: string): boolean {
    const comment = { py: "#", r: "#", sql: "--", scala: "//" }[
        path.split(".").pop()?.toLowerCase() ?? ""
    ];
    return (
        comment !== undefined &&
        new RegExp(
            `^${comment.replace(/\//g, "\\/")} Databricks notebook source[ \\t]*(\\r?\\n|$)`,
        ).test(text)
    );
}
