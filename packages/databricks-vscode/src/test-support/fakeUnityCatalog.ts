import type { HttpRequest } from "@databricks/sdk-core/http";
import type { FakeHttpClient, FakeResponse } from "./fakeHttp";

/* eslint-disable @typescript-eslint/naming-convention */

/** A securable as the API sends it (snake_case). */
export type Wire = Record<string, unknown>;

const UC = "/api/2.1/unity-catalog/";
const MONITORS = "/api/data-quality/v1/monitors/";

const notFound = (what: string): FakeResponse => ({
    status: 404,
    body: { error_code: "RESOURCE_DOES_NOT_EXIST", message: `${what} does not exist.` },
});

type ListKind = "catalogs" | "schemas" | "tables" | "volumes" | "functions" | "models";

/**
 * An in-memory metastore behind the Unity Catalog routes of a
 * `FakeHttpClient`, answering as the API does: lists filtered by catalog
 * and schema (paged when `pageSize` is set), gets by full name, model
 * versions, effective permissions, tag assignments and data-quality
 * monitors. `fail` makes a list answer with an error.
 */
export class FakeUnityCatalog {
    readonly catalogs: Wire[] = [];
    readonly schemas: Wire[] = [];
    readonly tables: Wire[] = [];
    readonly volumes: Wire[] = [];
    readonly functions: Wire[] = [];
    readonly models: Wire[] = [];
    readonly versions: Wire[] = [];
    readonly permissions = new Map<string, Wire[]>();
    readonly tags = new Map<string, Wire[]>();
    readonly monitors = new Map<string, Wire>();
    readonly failures = new Map<string, FakeResponse>();
    /** Lists return this many items per page; the rest after `page_token`. */
    pageSize: number | undefined;

    constructor(private readonly http: FakeHttpClient) {
        http.onPrefix("GET", UC, (r) => this.route(r));
        http.onPrefix("GET", MONITORS, (r) => this.monitor(r));
    }

    catalog(name: string, fields: Wire = {}): this {
        this.catalogs.push({ name, ...fields });
        return this;
    }

    schema(fullName: string, fields: Wire = {}): this {
        const [catalog_name, name] = fullName.split(".");
        this.schemas.push({ name, catalog_name, full_name: fullName, ...fields });
        return this;
    }

    table(fullName: string, fields: Wire = {}): this {
        this.tables.push({ ...this.securable(fullName), table_type: "MANAGED", ...fields });
        return this;
    }

    volume(fullName: string, fields: Wire = {}): this {
        this.volumes.push({ ...this.securable(fullName), volume_type: "MANAGED", ...fields });
        return this;
    }

    function(fullName: string, fields: Wire = {}): this {
        this.functions.push({ ...this.securable(fullName), ...fields });
        return this;
    }

    model(fullName: string, fields: Wire = {}): this {
        this.models.push({ ...this.securable(fullName), ...fields });
        return this;
    }

    version(modelFullName: string, version: number, fields: Wire = {}): this {
        const [catalog_name, schema_name, model_name] = modelFullName.split(".");
        this.versions.push({
            catalog_name,
            schema_name,
            model_name,
            version,
            status: "READY",
            ...fields,
        });
        return this;
    }

    /** List requests for a kind ("tables"), or every UC request. */
    requests(kind?: ListKind): HttpRequest[] {
        return this.http.requests.filter((r) => {
            const path = new URL(r.url).pathname;
            return path.startsWith(UC) && (kind === undefined || path === `${UC}${kind}`);
        });
    }

    private securable(fullName: string): Wire {
        const [catalog_name, schema_name, name] = fullName.split(".");
        return { name, catalog_name, schema_name, full_name: fullName };
    }

    private route(request: HttpRequest): FakeResponse {
        const url = new URL(request.url);
        const rest = decodeURIComponent(url.pathname.slice(UC.length));
        const q = url.searchParams;
        const [kind, ...more] = rest.split("/");
        const failure =
            this.failures.get(rest) ?? (more.length === 0 ? this.failures.get(kind!) : undefined);
        if (failure !== undefined) {
            return failure;
        }
        const inScope = (w: Wire) =>
            (!q.has("catalog_name") || w["catalog_name"] === q.get("catalog_name")) &&
            (!q.has("schema_name") || w["schema_name"] === q.get("schema_name"));
        const byFullName = (list: Wire[], fullName: string, what: string): FakeResponse => {
            const found = list.find((w) => (w["full_name"] ?? w["name"]) === fullName);
            return found === undefined ? notFound(`${what} '${fullName}'`) : { body: found };
        };
        switch (kind) {
            case "catalogs":
                return more.length === 0
                    ? this.page(q, "catalogs", this.catalogs)
                    : byFullName(this.catalogs, more[0]!, "Catalog");
            case "schemas":
                return more.length === 0
                    ? this.page(q, "schemas", this.schemas.filter(inScope))
                    : byFullName(this.schemas, more[0]!, "Schema");
            case "tables":
                return more.length === 0
                    ? this.page(q, "tables", this.tables.filter(inScope))
                    : byFullName(this.tables, more[0]!, "Table");
            case "volumes":
                return more.length === 0
                    ? this.page(q, "volumes", this.volumes.filter(inScope))
                    : byFullName(this.volumes, more[0]!, "Volume");
            case "functions":
                return more.length === 0
                    ? this.page(q, "functions", this.functions.filter(inScope))
                    : byFullName(this.functions, more[0]!, "Function");
            case "models": {
                if (more.length === 0) {
                    return this.page(q, "registered_models", this.models.filter(inScope));
                }
                const [fullName, sub, version] = more;
                const versions = this.versions.filter(
                    (v) =>
                        [v["catalog_name"], v["schema_name"], v["model_name"]].join(".") ===
                        fullName,
                );
                if (sub === "versions" && version === undefined) {
                    return this.page(q, "model_versions", versions);
                }
                if (sub === "versions") {
                    const found = versions.find((v) => String(v["version"]) === version);
                    return found === undefined
                        ? notFound(`Model version '${fullName}' v${version}`)
                        : { body: found };
                }
                return byFullName(this.models, fullName!, "Model");
            }
            case "effective-permissions": {
                const [type, fullName] = more;
                return {
                    body: {
                        privilege_assignments: this.permissions.get(`${type}/${fullName}`) ?? [],
                    },
                };
            }
            case "entity-tag-assignments": {
                const [type, name] = more;
                return { body: { tag_assignments: this.tags.get(`${type}/${name}`) ?? [] } };
            }
        }
        return notFound(rest);
    }

    private page(q: URLSearchParams, field: string, all: Wire[]): FakeResponse {
        if (this.pageSize === undefined) {
            return { body: { [field]: all } };
        }
        const start = Number(q.get("page_token") ?? "0");
        const end = start + this.pageSize;
        return {
            body: {
                [field]: all.slice(start, end),
                ...(end < all.length ? { next_page_token: String(end) } : {}),
            },
        };
    }

    private monitor(request: HttpRequest): FakeResponse {
        const [type, id] = decodeURIComponent(
            new URL(request.url).pathname.slice(MONITORS.length),
        ).split("/");
        const monitor = this.monitors.get(id!);
        return type === "table" && monitor !== undefined
            ? { body: monitor }
            : notFound(`Monitor for ${id}`);
    }
}
