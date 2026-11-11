// A mock Databricks workspace for local e2e runs (README.md): SCIM Me for PAT
// tokens, an in-memory workspace file system, the jobs, pipelines, clusters,
// command execution and Unity Catalog APIs the specs use, and gRPC for
// Databricks Connect, forwarded to spark_connect.py. An HTTP proxy on 8888
// (MOCK_PROXY_PORT) routes mock.databricks.test:443 to it, and an intercepting one on 8889
// (MOCK_INTERCEPT_PORT) to the same workspace behind a certificate of its own. State (certificates, logs) is in
// $MOCK_DIR.
import fs from "node:fs";
import http from "node:http";
import http2 from "node:http2";
import net from "node:net";
import nodePath from "node:path";

const DIR = process.env.MOCK_DIR ?? "/tmp/databricks-vscode-e2e-mock";
// Other ports let a second run share the machine (run-e2e.sh passes them).
const PORT = Number(process.env.MOCK_PORT ?? 8443);
const PROXY_PORT = Number(process.env.MOCK_PROXY_PORT ?? 8888);
const SPARK_PORT = Number(process.env.MOCK_SPARK_PORT ?? 15002);
const INTERCEPT_PORT = Number(process.env.MOCK_INTERCEPT_PORT ?? 8889);

const log = (...a) => fs.appendFileSync(nodePath.join(DIR, "requests.log"), a.join(" ") + "\n");
const json = (res, code, body) => {
    res.writeHead(code, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
};
const notFound = (res, what) =>
    json(res, 404, { error_code: "RESOURCE_DOES_NOT_EXIST", message: `${what} doesn't exist.` });

// path -> {type: "DIRECTORY"} | {type: "FILE", content: Buffer}
const fsTree = new Map();
let nextId = 1;
const norm = (p) => {
    p = decodeURIComponent(p ?? "").replace(/\/+$/, "");
    if (!p.startsWith("/")) p = "/" + p;
    return p.startsWith("/Workspace/") ? p.slice("/Workspace".length) : p;
};
const mkdirs = (p) => {
    const parts = norm(p).split("/").filter(Boolean);
    let cur = "";
    for (const part of parts) {
        cur += "/" + part;
        if (!fsTree.has(cur)) fsTree.set(cur, { type: "DIRECTORY", id: nextId++ });
    }
};
const parent = (p) => p.slice(0, p.lastIndexOf("/")) || "/";
const status = (p, e) => ({
    path: p,
    object_type: e.type,
    object_id: e.id,
    ...(e.type === "FILE" ? { size: e.content.length, created_at: e.at, modified_at: e.at } : {}),
    ...(e.type === "NOTEBOOK" ? { language: "PYTHON", created_at: e.at, modified_at: e.at } : {}),
});

// Unity Catalog: UC_CATALOGS (default 60; run-e2e.sh uses 800) catalogs of another owner, then `main`, `samples` and `system`.
const uc = { catalogs: [], schemas: [], tables: [], functions: [] };
for (let i = 0; i < Number(process.env.UC_CATALOGS ?? 60); i++)
    uc.catalogs.push({
        name: `e2e_catalog_${String(i).padStart(3, "0")}`,
        owner: "someone@example.com",
    });
uc.catalogs.push(
    { name: "main", owner: "e2e@example.com" },
    { name: "samples", owner: "System user" },
    { name: "system", owner: "System user", comment: "System catalog" },
);
for (const s of ["__internal_data_quality_monitoring", "access", "billing", "compute"])
    uc.schemas.push({
        name: s,
        catalog_name: "system",
        full_name: `system.${s}`,
        owner: "System user",
    });
uc.schemas.push({
    name: "default",
    catalog_name: "main",
    full_name: "main.default",
    owner: "e2e@example.com",
});
for (const t of ["audit", "column_lineage", "outbound_network", "table_lineage"]) {
    uc.tables.push({
        name: t,
        catalog_name: "system",
        schema_name: "access",
        full_name: `system.access.${t}`,
        table_type: "MANAGED",
        data_source_format: "DELTA",
        table_id: `tid-${t}`,
        owner: "System user",
        created_at: 1700000000000,
        columns: [
            { name: "event_time", type_text: "timestamp", type_name: "TIMESTAMP", position: 0 },
            { name: "workspace_id", type_text: "string", type_name: "STRING", position: 1 },
        ],
    });
}
uc.tables.push({
    name: "usage",
    catalog_name: "system",
    schema_name: "billing",
    full_name: "system.billing.usage",
    table_type: "MANAGED",
    columns: [],
});
uc.functions.push({
    name: "mask",
    catalog_name: "system",
    schema_name: "access",
    full_name: "system.access.mask",
});
const clusterBase = {
    creator_user_name: "e2e@example.com",
    spark_version: "15.4.x-scala2.12",
    cluster_memory_mb: 16384,
    cluster_cores: 4,
    data_security_mode: "USER_ISOLATION",
    driver_node_type_id: "i3.xlarge",
    node_type_id: "i3.xlarge",
    num_workers: 1,
};
const clusters = [
    {
        ...clusterBase,
        cluster_id: process.env.TEST_DEFAULT_CLUSTER_ID ?? "0000-mock-cluster",
        cluster_name: "e2e shared cluster",
        state: "RUNNING",
        cluster_source: "UI",
    },
    {
        ...clusterBase,
        cluster_id: "0001-mock-stopped",
        cluster_name: "e2e stopped cluster",
        state: "TERMINATED",
        state_message: "Inactive for 120 minutes",
        cluster_source: "API",
    },
    {
        ...clusterBase,
        cluster_id: "0002-mock-job",
        cluster_name: "job-1-run-1",
        state: "TERMINATED",
        cluster_source: "JOB",
    },
];
const jobs = new Map();
// Job runs and pipeline updates advance with time: pending, then running, then done.
const runs = new Map();
const pipelines = new Map();
const updates = new Map();
const HOST = "https://mock.databricks.test";
// What a run of a file "prints". The mock can't run Python, so it reads
// the files the wrapper or the bootstrap points at, and echoes every
// `SELECT "<text>"` it finds there and in the project's lib.py; `%sh pwd`
// prints the file's folder.
const readText = (p) => fsTree.get(norm(p))?.content?.toString() ?? "";
const notebookText = (text) => {
    if (!text.trimStart().startsWith("{")) return text;
    try {
        return JSON.parse(text)
            .cells.map((c) => (Array.isArray(c.source) ? c.source.join("") : (c.source ?? "")))
            .join("\n");
    } catch {
        return text;
    }
};
function outputOf(text, extraFile, root, sourceFile) {
    let all = text;
    if (extraFile) all += "\n" + readText(extraFile);
    if (root) all += "\n" + readText(root + "/lib.py");
    const out = [...all.matchAll(/SELECT "([^"]+)"/g)].map((m) => m[1]);
    if (all.includes("%sh pwd") && sourceFile)
        out.push(sourceFile.slice(0, sourceFile.lastIndexOf("/")));
    return out;
}
// A file wrapper names the file to run; a notebook wrapper holds the cells and names the notebook's own path.
function wrapperOutput(path) {
    const text = notebookText(readText(path));
    const file = /python_file = '([^']+)'/.exec(text)?.[1];
    const notebook = /os\.path\.dirname\("([^"]+)"\)/.exec(text)?.[1];
    const root =
        /project_root = '([^']+)'/.exec(text)?.[1] ??
        /project_root_dir = "([^"]+)"/.exec(text)?.[1];
    return outputOf(text, file, root, file ?? notebook).join("\n");
}
const taskOf = (taskRunId) => {
    for (const run of runs.values()) {
        const i = (run.tasks ?? []).findIndex((_, i) => run.run_id * 10 + i === taskRunId);
        if (i >= 0) return { run, task: run.tasks[i] };
    }
    return undefined;
};
const contexts = new Map();
const commands = new Map();

const phase = (startedAt) => {
    const t = Date.now() - startedAt;
    return t < 2000 ? 0 : t < 6000 ? 1 : 2;
};
// A job whose name contains "_slow" keeps running for two minutes, so a spec can cancel it.
const SLOW_RUN_MS = 120_000;
const isSlow = (run) => jobs.get(run.job_id)?.settings.name?.includes("_slow") === true;
const runState = (run) => {
    if (run.cancelled)
        return {
            life_cycle_state: "TERMINATED",
            result_state: "CANCELED",
            state_message: "Cancelled",
            user_cancelled_or_timedout: true,
        };
    if (isSlow(run) && Date.now() - run.startedAt < SLOW_RUN_MS) {
        return Date.now() - run.startedAt < 2000
            ? { life_cycle_state: "PENDING", state_message: "Waiting for cluster" }
            : { life_cycle_state: "RUNNING", state_message: "In run" };
    }
    return [
        { life_cycle_state: "PENDING", state_message: "Waiting for cluster" },
        { life_cycle_state: "RUNNING", state_message: "In run" },
        { life_cycle_state: "TERMINATED", result_state: "SUCCESS", state_message: "" },
    ][phase(run.startedAt)];
};
const runJson = (run) => {
    const state = runState(run);
    const job = jobs.get(run.job_id);
    return {
        job_id: run.job_id,
        run_id: run.run_id,
        run_name: job?.settings.name,
        run_page_url: `${HOST}/?o=1234#job/${run.job_id}/run/${run.run_id}`,
        start_time: run.startedAt,
        run_duration: Date.now() - run.startedAt,
        state,
        status: { state: state.life_cycle_state },
        tasks: (run.tasks ?? job?.settings.tasks ?? []).map((t, i) => ({
            task_key: t.task_key,
            run_id: run.run_id * 10 + i,
            state,
            start_time: run.startedAt,
            ...(state.life_cycle_state === "TERMINATED" ? { end_time: run.startedAt + 6000 } : {}),
            execution_duration: Date.now() - run.startedAt,
            ...(t.existing_cluster_id
                ? {
                      cluster_instance: {
                          cluster_id: t.existing_cluster_id,
                          spark_context_id: "123456",
                      },
                  }
                : {}),
        })),
    };
};
const updateState = (u) =>
    u.cancelled
        ? "CANCELED"
        : ["WAITING_FOR_RESOURCES", "RUNNING", "COMPLETED"][phase(u.startedAt)];
const updateJson = (u) => ({
    pipeline_id: u.pipeline_id,
    update_id: u.update_id,
    state: updateState(u),
    creation_time: u.startedAt,
    cause: "API_CALL",
    full_refresh: false,
    validate_only: u.validate_only ?? false,
    ...(u.refresh_selection ? { refresh_selection: u.refresh_selection } : {}),
});
// The events of a completed update of the e2e pipeline, as the API sends them.
const updateEvents = (u) => {
    const at = (s) => new Date(u.startedAt + s * 100).toISOString();
    const origin = (extra = {}) => ({
        pipeline_id: u.pipeline_id,
        update_id: u.update_id,
        ...extra,
    });
    const events = [
        {
            id: `${u.update_id}-1`,
            timestamp: at(1),
            level: "INFO",
            event_type: "create_update",
            message: "Update started by API call.",
            origin: origin(),
        },
    ];
    if (phase(u.startedAt) >= 1) {
        events.push(
            {
                id: `${u.update_id}-2`,
                timestamp: at(2),
                level: "INFO",
                event_type: "dataset_definition",
                message: "Dataset `test_view` defined as VIEW.",
                origin: origin({ dataset_name: "test_view" }),
                details: {
                    dataset_definition: {
                        dataset_type: "VIEW",
                        schema: [{ name: "1", data_type: "INTEGER" }],
                        num_flows: 0,
                    },
                },
            },
            {
                id: `${u.update_id}-3`,
                timestamp: at(3),
                level: "INFO",
                event_type: "dataset_definition",
                message:
                    "Dataset `vscode_integration_test`.`test_table` defined as MATERIALIZED_VIEW.",
                origin: origin({ dataset_name: "vscode_integration_test.test_table" }),
                details: {
                    dataset_definition: { dataset_type: "MATERIALIZED_VIEW", num_flows: 1 },
                },
            },
        );
    }
    if (phase(u.startedAt) >= 2) {
        events.push(
            {
                id: `${u.update_id}-4`,
                timestamp: at(4),
                level: "INFO",
                event_type: "flow_progress",
                message: "Flow 'vscode_integration_test.test_table' has COMPLETED.",
                origin: origin({
                    dataset_name: "vscode_integration_test.test_table",
                    flow_name: "vscode_integration_test.test_table",
                }),
                details: {
                    flow_progress: { status: "COMPLETED" },
                    dataset_definition: { schema: [{ name: "1", data_type: "INTEGER" }] },
                },
            },
            {
                id: `${u.update_id}-5`,
                timestamp: at(5),
                level: "INFO",
                event_type: "update_progress",
                message: "Update is COMPLETED.",
                origin: origin(),
            },
        );
    }
    return events;
};

function body(req) {
    return new Promise((resolve) => {
        const chunks = [];
        req.on("data", (c) => chunks.push(c));
        req.on("end", () => resolve(Buffer.concat(chunks)));
    });
}

// Databricks Connect speaks gRPC (HTTP/2) to the same host: forward it to the
// fake Spark Connect server (spark_connect.py, h2c on 15002). Everything else
// is the REST mock, over HTTP/1.1 or HTTP/2.
let sparkConnect;
const proxyGrpc = (req, res) => {
    if (!sparkConnect || sparkConnect.destroyed) {
        sparkConnect = http2.connect(`http://127.0.0.1:${SPARK_PORT}`);
        sparkConnect.on("error", (e) => log("grpc-upstream-error", e.message));
    }
    const headers = {};
    for (const [k, v] of Object.entries(req.headers)) {
        if (!k.startsWith(":") && k !== "connection" && k !== "host") headers[k] = v;
    }
    log("grpc", req.headers[":path"]);
    const upstream = sparkConnect.request({
        ":method": "POST",
        ":path": req.headers[":path"],
        ":authority": `127.0.0.1:${SPARK_PORT}`,
        ...headers,
    });
    const strip = (h) => Object.fromEntries(Object.entries(h).filter(([k]) => !k.startsWith(":")));
    upstream.on("response", (h) => res.writeHead(h[":status"] ?? 200, strip(h)));
    upstream.on("trailers", (t) => res.addTrailers(strip(t)));
    upstream.on("data", (d) => res.write(d));
    upstream.on("end", () => res.end());
    upstream.on("error", (e) => {
        log("grpc-error", e.message);
        res.stream.close(http2.constants.NGHTTP2_INTERNAL_ERROR);
    });
    req.on("data", (d) => upstream.write(d));
    req.on("end", () => upstream.end());
    res.on("close", () => {
        if (!upstream.closed) upstream.close();
    });
};

/**
 * The fields of a workspace/import: JSON with base64 content, or, from the CLI's
 * file uploader (bundle deploy, sync, import-dir), multipart with the raw bytes.
 */
async function importRequest(req, raw) {
    const type = String(req.headers["content-type"] ?? "");
    if (!type.startsWith("multipart/form-data")) {
        const { path, content, overwrite, format } = JSON.parse(raw.toString() || "{}");
        return {
            rawPath: path,
            bytes: Buffer.from(content ?? "", "base64"),
            overwrite: overwrite === true,
            format: format ?? "AUTO",
        };
    }
    const form = await new Response(raw, { headers: { "content-type": type } }).formData();
    const text = (name) => {
        const value = form.get(name);
        return typeof value === "string" ? value : undefined;
    };
    const content = form.get("content");
    return {
        rawPath: text("path") ?? "",
        bytes:
            content instanceof Blob
                ? Buffer.from(await content.arrayBuffer())
                : Buffer.from(content ?? ""),
        overwrite: text("overwrite") === "true",
        format: text("format") ?? "AUTO",
    };
}

/** One request to the REST mock, or gRPC for the Spark Connect fake. */
async function handle(req, res) {
    if (
        req.httpVersion === "2.0" &&
        String(req.headers["content-type"] ?? "").startsWith("application/grpc")
    ) {
        return proxyGrpc(req, res);
    }
    const auth = req.headers.authorization ?? "";
    const url = new URL(req.url, "https://x");
    const q = url.searchParams;
    const raw = await body(req);
    const data = () => JSON.parse(raw.toString() || "{}");
    log(
        new Date().toISOString(),
        req.method,
        req.url,
        auth.slice(0, 16),
        raw.length > 0 && raw.length < 400
            ? raw.toString().replace(/\s+/g, " ")
            : `(${raw.length} bytes)`,
    );
    if (
        !url.pathname.startsWith("/.well-known") &&
        !url.pathname.startsWith("/telemetry") &&
        !auth.startsWith("Bearer dapi-")
    ) {
        return json(res, 401, { error_code: "UNAUTHENTICATED", message: "bad token" });
    }
    const p = url.pathname;
    // Unity Gateway (the chat models): one model service that serves the unified Responses route, its
    // token limits, and a reply that streams. The proxy-TLS spec (proxy_tls.trust.e2e.ts) asks for it.
    if (p === "/api/2.1/unity-catalog/model-services") {
        return json(res, 200, {
            model_services: [
                {
                    name: "model-services/system.ai.e2e-model",
                    supported_api_types: ["mlflow/v1/responses"],
                },
            ],
        });
    }
    if (p === "/ai-gateway/anthropic/v1/models") {
        return json(res, 200, {
            data: [{ id: "system.ai.e2e-model", max_input_tokens: 200000, max_tokens: 32000 }],
            has_more: false,
        });
    }
    if (p === "/ai-gateway/mlflow/v1/responses" && req.method === "POST") {
        const events = [
            { type: "response.output_text.delta", delta: "Hello " },
            { type: "response.output_text.delta", delta: "from the mock gateway." },
            { type: "response.completed", response: {} },
        ].map((e) => `data: ${JSON.stringify(e)}\n\n`);
        res.writeHead(200, { "content-type": "text/event-stream" });
        // One event per write, apart, so the reply arrives in pieces, as a real stream's does.
        events.forEach((e, i) => setTimeout(() => res.write(e), i * 50));
        setTimeout(() => res.end(), events.length * 50);
        return;
    }
    if (p.startsWith("/api/2.0/preview/scim/v2/Me")) {
        res.writeHead(200, { "content-type": "application/json", "x-databricks-org-id": "1234" });
        return res.end(JSON.stringify({ userName: "e2e@example.com", id: "1" }));
    }
    if (p.startsWith("/api/2.1/unity-catalog/current-metastore-assignment")) {
        return json(res, 200, {
            metastore_id: "mock-metastore",
            workspace_id: 1234,
            default_catalog_name: "main",
        });
    }
    // Unity Catalog: many catalogs, so `system` sorts below the tree's rendered rows.
    if (p.startsWith("/api/2.1/unity-catalog/")) {
        await new Promise((r) => setTimeout(r, 150));
        const rest = decodeURIComponent(p.slice("/api/2.1/unity-catalog/".length)).split("/");
        const inScope = (x) =>
            (!q.get("catalog_name") || x.catalog_name === q.get("catalog_name")) &&
            (!q.get("schema_name") || x.schema_name === q.get("schema_name"));
        const get = (list, name, what) => {
            const found = list.find((x) => (x.full_name ?? x.name) === name);
            return found ? json(res, 200, found) : notFound(res, `${what} '${name}'`);
        };
        switch (rest[0]) {
            case "catalogs":
                return rest.length === 1
                    ? json(res, 200, { catalogs: uc.catalogs })
                    : get(uc.catalogs, rest[1], "Catalog");
            case "schemas":
                return rest.length === 1
                    ? json(res, 200, { schemas: uc.schemas.filter(inScope) })
                    : get(uc.schemas, rest[1], "Schema");
            case "tables":
                return rest.length === 1
                    ? json(res, 200, { tables: uc.tables.filter(inScope) })
                    : get(uc.tables, rest[1], "Table");
            case "volumes":
                return rest.length === 1
                    ? json(res, 200, { volumes: [] })
                    : notFound(res, "Volume");
            case "functions":
                return rest.length === 1
                    ? json(res, 200, { functions: uc.functions.filter(inScope) })
                    : get(uc.functions, rest[1], "Function");
            case "models":
                return rest.length === 1
                    ? json(res, 200, { registered_models: [] })
                    : notFound(res, "Model");
            case "effective-permissions":
                return json(res, 200, {
                    privilege_assignments: [
                        { principal: "account users", privileges: [{ privilege: "USE_CATALOG" }] },
                    ],
                });
            case "entity-tag-assignments":
                return json(res, 200, { tag_assignments: [] });
        }
    }
    if (p.startsWith("/api/data-quality/v1/monitors/")) {
        return notFound(res, "Monitor");
    }
    if (p === "/telemetry-ext") {
        return json(res, 200, {});
    }
    // Workspace file system.
    if (p === "/api/2.0/workspace/get-status") {
        const path = norm(q.get("path"));
        const e = fsTree.get(path);
        return e ? json(res, 200, status(q.get("path"), e)) : notFound(res, `Path (${path})`);
    }
    if (p === "/api/2.0/workspace/mkdirs") {
        const existing = fsTree.get(norm(data().path));
        if (existing && existing.type !== "DIRECTORY")
            return json(res, 400, {
                error_code: "RESOURCE_ALREADY_EXISTS",
                message: `Node named '${data().path}' already exists`,
            });
        mkdirs(data().path);
        return json(res, 200, {});
    }
    if (p === "/api/2.0/workspace/list") {
        // A real workspace takes a few hundred milliseconds to list a folder.
        await new Promise((r) => setTimeout(r, 300));
        const path = norm(q.get("path"));
        if (!fsTree.has(path)) return notFound(res, `Path (${path})`);
        const objects = [...fsTree.entries()]
            .filter(([k]) => parent(k) === path)
            .map(([k, e]) => status(k, e));
        return json(res, 200, { objects });
    }
    if (p === "/api/2.0/workspace/delete") {
        const { path: rawPath, recursive } = data();
        const path = norm(rawPath);
        if (!fsTree.has(path)) return notFound(res, `Path (${path})`);
        for (const k of Array.from(fsTree.keys())) {
            if (k === path || (recursive && k.startsWith(path + "/"))) fsTree.delete(k);
        }
        return json(res, 200, {});
    }
    if (p === "/api/2.0/workspace/import") {
        const { rawPath, bytes, overwrite, format } = await importRequest(req, raw);
        // format AUTO: a .ipynb, or a source file with the notebook header, becomes a notebook without its extension.
        const auto =
            format === "AUTO" &&
            (/\.ipynb$/i.test(rawPath) ||
                (/\.(py|sql|scala|r)$/i.test(rawPath) &&
                    /^(# |-- |\/\/ )Databricks notebook source/.test(bytes.toString())));
        // Any other format than RAW and AUTO is a notebook, under the path as given.
        const notebook = auto || (format !== "RAW" && format !== "AUTO");
        const path = norm(auto ? rawPath.replace(/\.(py|ipynb|scala|r|sql)$/i, "") : rawPath);
        if (fsTree.has(path) && !overwrite)
            return json(res, 400, {
                error_code: "RESOURCE_ALREADY_EXISTS",
                message: `${path} already exists`,
            });
        if (!fsTree.has(parent(path))) return notFound(res, `The parent folder (${parent(path)})`);
        fsTree.set(path, {
            type: notebook ? "NOTEBOOK" : "FILE",
            id: nextId++,
            content: bytes,
            at: Date.now(),
        });
        return json(res, 200, {});
    }
    if (p.startsWith("/api/2.0/workspace-files/import-file/")) {
        const path = norm(p.slice("/api/2.0/workspace-files/import-file".length));
        if (fsTree.has(path) && q.get("overwrite") !== "true")
            return json(res, 409, {
                error_code: "RESOURCE_ALREADY_EXISTS",
                message: `${path} already exists`,
            });
        if (!fsTree.has(parent(path))) return notFound(res, `The parent folder (${parent(path)})`);
        fsTree.set(path, { type: "FILE", id: nextId++, content: raw, at: Date.now() });
        return json(res, 200, {});
    }
    if (p === "/api/2.0/workspace/export") {
        const path = norm(q.get("path"));
        const e = fsTree.get(path);
        if (!e || (e.type !== "FILE" && e.type !== "NOTEBOOK"))
            return notFound(res, `Path (${path})`);
        if (q.get("direct_download") === "true") {
            res.writeHead(200, { "content-type": "application/octet-stream" });
            return res.end(e.content);
        }
        return json(res, 200, { content: e.content.toString("base64") });
    }
    if (p.startsWith("/api/2.0/fs/files/")) {
        const path = norm(p.slice("/api/2.0/fs/files".length));
        const e = fsTree.get(path);
        if (req.method === "GET") {
            if (!e || e.type !== "FILE") return notFound(res, `File (${path})`);
            res.writeHead(200, { "content-type": "application/octet-stream" });
            return res.end(e.content);
        }
    }
    // Jobs.
    if (p === "/api/2.2/jobs/create" || p === "/api/2.1/jobs/create") {
        const id = nextId++;
        jobs.set(id, {
            job_id: id,
            settings: data(),
            created_time: Date.now(),
            creator_user_name: "e2e@example.com",
        });
        return json(res, 200, { job_id: id });
    }
    if (p === "/api/2.2/jobs/get" || p === "/api/2.1/jobs/get") {
        const job = jobs.get(Number(q.get("job_id")));
        return job
            ? json(res, 200, job)
            : json(res, 400, {
                  error_code: "INVALID_PARAMETER_VALUE",
                  message: `Job ${q.get("job_id")} does not exist.`,
              });
    }
    if (p === "/api/2.2/jobs/reset" || p === "/api/2.1/jobs/reset") {
        const { job_id, new_settings } = data();
        const job = jobs.get(Number(job_id));
        if (!job)
            return json(res, 400, {
                error_code: "INVALID_PARAMETER_VALUE",
                message: `Job ${job_id} does not exist.`,
            });
        job.settings = new_settings;
        return json(res, 200, {});
    }
    if (p === "/api/2.2/jobs/delete" || p === "/api/2.1/jobs/delete") {
        const { job_id } = data();
        if (!jobs.delete(Number(job_id)))
            return json(res, 400, {
                error_code: "INVALID_PARAMETER_VALUE",
                message: `Job ${job_id} does not exist.`,
            });
        return json(res, 200, {});
    }
    if (p === "/api/2.2/jobs/list" || p === "/api/2.1/jobs/list") {
        const name = q.get("name");
        const list = [...jobs.values()].filter((j) => name === null || j.settings.name === name);
        return json(res, 200, { jobs: list, has_more: false });
    }
    if (/^\/api\/2\.[12]\/jobs\/run-now$/.test(p)) {
        const { job_id } = data();
        if (!jobs.has(Number(job_id)))
            return json(res, 400, {
                error_code: "INVALID_PARAMETER_VALUE",
                message: `Job ${job_id} does not exist.`,
            });
        const run = { run_id: nextId++, job_id: Number(job_id), startedAt: Date.now() };
        runs.set(run.run_id, run);
        return json(res, 200, { run_id: run.run_id, number_in_job: run.run_id });
    }
    if (/^\/api\/2\.[12]\/jobs\/runs\/get$/.test(p)) {
        const run = runs.get(Number(q.get("run_id")));
        return run
            ? json(res, 200, runJson(run))
            : json(res, 400, {
                  error_code: "INVALID_PARAMETER_VALUE",
                  message: `Run ${q.get("run_id")} does not exist.`,
              });
    }
    if (/^\/api\/2\.[12]\/jobs\/runs\/cancel$/.test(p)) {
        const run = runs.get(Number(data().run_id));
        if (run && runState(run).life_cycle_state !== "TERMINATED") run.cancelled = true;
        return json(res, 200, {});
    }
    // One-time runs ("Run File as Workflow").
    if (p === "/api/2.2/jobs/runs/submit") {
        const run = { run_id: nextId++, startedAt: Date.now(), tasks: data().tasks ?? [] };
        runs.set(run.run_id, run);
        return json(res, 200, { run_id: run.run_id });
    }
    if (p === "/api/2.2/jobs/runs/get-output") {
        const found = taskOf(Number(q.get("run_id")));
        if (!found)
            return json(res, 400, {
                error_code: "INVALID_PARAMETER_VALUE",
                message: `Run ${q.get("run_id")} does not exist.`,
            });
        const file = found.task.spark_python_task?.python_file;
        return json(res, 200, {
            logs: file ? wrapperOutput(file) + "\n" : "",
            metadata: runJson(found.run),
        });
    }
    if (p === "/api/2.2/jobs/runs/export") {
        const found = taskOf(Number(q.get("run_id")));
        if (!found)
            return json(res, 400, {
                error_code: "INVALID_PARAMETER_VALUE",
                message: `Run ${q.get("run_id")} does not exist.`,
            });
        const nb = found.task.notebook_task?.notebook_path ?? "";
        const out = wrapperOutput(nb).replace(/[<&]/g, (c) => (c === "<" ? "&lt;" : "&amp;"));
        // A script, as an exported notebook has, to show whether the frame runs it.
        const content = `<!DOCTYPE html><html><head><title>${nb}</title></head><body><pre id="out">${out}</pre><script>document.body.insertAdjacentHTML("beforeend", "<p id='ran'>script ran</p>");</script></body></html>`;
        return json(res, 200, {
            views: [{ content, name: nb.split("/").pop(), type: "NOTEBOOK" }],
        });
    }
    // The Command Execution API (1.2), for "Upload and Run File".
    if (p === "/api/1.2/contexts/create") {
        const id = `ctx-${nextId++}`;
        contexts.set(id, { clusterId: data().clusterId, at: Date.now() });
        return json(res, 200, { id });
    }
    if (p === "/api/1.2/contexts/status") {
        const c = contexts.get(q.get("contextId"));
        return c
            ? json(res, 200, {
                  id: q.get("contextId"),
                  status: Date.now() - c.at > 500 ? "Running" : "Pending",
              })
            : json(res, 400, { error: "no such context" });
    }
    if (p === "/api/1.2/contexts/destroy") {
        contexts.delete(data().contextId);
        return json(res, 200, {});
    }
    if (p === "/api/1.2/commands/execute") {
        const { command } = data();
        const id = `cmd-${nextId++}`;
        const config = JSON.parse(
            JSON.parse(command.split("\n")[0].replace(/^__databricks_bootstrap_config = /, "")),
        );
        const lines = outputOf("", config.python_file, config.repo_path, config.python_file).map(
            (t) => `+${"-".repeat(t.length)}+\n|${t}|\n+${"-".repeat(t.length)}+`,
        );
        commands.set(id, { at: Date.now(), data: lines.join("\n") });
        return json(res, 200, { id });
    }
    if (p === "/api/1.2/commands/status") {
        const c = commands.get(q.get("commandId"));
        if (!c) return json(res, 400, { error: "no such command" });
        if (c.cancelled) return json(res, 200, { id: q.get("commandId"), status: "Cancelled" });
        return json(
            res,
            200,
            Date.now() - c.at > 1000
                ? {
                      id: q.get("commandId"),
                      status: "Finished",
                      results: { resultType: "text", data: c.data },
                  }
                : { id: q.get("commandId"), status: "Running" },
        );
    }
    if (p === "/api/1.2/commands/cancel") {
        const c = commands.get(data().commandId);
        if (c) c.cancelled = true;
        return json(res, 200, {});
    }
    // Pipelines.
    if (p === "/api/2.0/pipelines" && req.method === "GET") {
        // Only the filter the specs use: name LIKE '<pattern>', with % as the wildcard.
        const like = /name LIKE '([^']+)'/.exec(q.get("filter") ?? "")?.[1];
        const pattern =
            like === undefined
                ? undefined
                : new RegExp(
                      `^${like
                          .split("%")
                          .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
                          .join(".*")}$`,
                  );
        const statuses = [...pipelines.values()].filter(
            (x) => pattern === undefined || pattern.test(x.spec.name),
        );
        return json(res, 200, {
            statuses: statuses.map((x) => ({
                pipeline_id: x.pipeline_id,
                name: x.spec.name,
                state: "IDLE",
            })),
        });
    }
    if (p === "/api/2.0/pipelines" && req.method === "POST") {
        const id = `mock-pipeline-${nextId++}`;
        pipelines.set(id, { pipeline_id: id, spec: { ...data(), id } });
        return json(res, 200, { pipeline_id: id });
    }
    const pm = /^\/api\/2\.0\/pipelines\/([^/]+)(\/.*)?$/.exec(p);
    if (pm) {
        const [, id, rest = ""] = pm;
        const pipeline = pipelines.get(id);
        if (!pipeline) return notFound(res, `Pipeline ${id}`);
        const ofPipeline = [...updates.values()]
            .filter((u) => u.pipeline_id === id)
            .sort((a, b) => b.startedAt - a.startedAt);
        const latest = ofPipeline[0];
        if (rest === "" && req.method === "GET") {
            const running =
                latest && updateState(latest) !== "COMPLETED" && updateState(latest) !== "CANCELED";
            return json(res, 200, {
                pipeline_id: id,
                name: pipeline.spec.name,
                spec: pipeline.spec,
                state: running ? "RUNNING" : "IDLE",
                creator_user_name: "e2e@example.com",
                run_as_user_name: "e2e@example.com",
                latest_updates: ofPipeline.slice(0, 3).map((u) => ({
                    update_id: u.update_id,
                    state: updateState(u),
                    creation_time: new Date(u.startedAt).toISOString(),
                })),
            });
        }
        if (rest === "" && req.method === "PUT") {
            pipeline.spec = { ...data(), id };
            return json(res, 200, {});
        }
        if (rest === "" && req.method === "DELETE") {
            pipelines.delete(id);
            return json(res, 200, {});
        }
        if (rest === "/updates" && req.method === "POST") {
            const body = data();
            const u = {
                update_id: `mock-update-${nextId++}`,
                pipeline_id: id,
                startedAt: Date.now(),
                validate_only: body.validate_only,
                refresh_selection: body.refresh_selection,
            };
            updates.set(u.update_id, u);
            return json(res, 200, { update_id: u.update_id });
        }
        if (rest === "/updates" && req.method === "GET") {
            return json(res, 200, {
                updates: ofPipeline.slice(0, Number(q.get("max_results") ?? 25)).map(updateJson),
            });
        }
        const um = /^\/updates\/([^/]+)$/.exec(rest);
        if (um) {
            const u = updates.get(um[1]);
            return u ? json(res, 200, { update: updateJson(u) }) : notFound(res, `Update ${um[1]}`);
        }
        if (rest === "/stop" && req.method === "POST") {
            if (latest) latest.cancelled = true;
            return json(res, 200, {});
        }
        if (rest === "/events") {
            const filter = q.get("filter") ?? "";
            const byUpdate = /update_id = '([^']+)'/.exec(filter)?.[1];
            const after = /timestamp > '([^']+)'/.exec(filter)?.[1];
            const from = /timestamp >= '([^']+)'/.exec(filter)?.[1];
            let events = ofPipeline.flatMap(updateEvents);
            if (byUpdate) events = events.filter((e) => e.origin.update_id === byUpdate);
            if (after) events = events.filter((e) => e.timestamp > after);
            if (from) events = events.filter((e) => e.timestamp >= from);
            const asc = (q.getAll("order_by")[0] ?? "").includes("asc");
            events.sort((a, b) => (asc ? 1 : -1) * a.timestamp.localeCompare(b.timestamp));
            return json(res, 200, { events });
        }
    }
    // Clusters: the shared cluster the specs attach, others around it, and a job cluster the list filters out.
    if (p === "/api/2.1/clusters/list") {
        await new Promise((r) => setTimeout(r, 300));
        const sources = q.getAll("filter_by.cluster_sources");
        return json(res, 200, {
            clusters: clusters.filter(
                (c) => sources.length === 0 || sources.includes(c.cluster_source),
            ),
        });
    }
    if (p === "/api/2.1/clusters/get") {
        const c = clusters.find((c) => c.cluster_id === q.get("cluster_id"));
        return c
            ? json(res, 200, c)
            : json(res, 400, {
                  error_code: "INVALID_PARAMETER_VALUE",
                  message: `Cluster ${q.get("cluster_id")} does not exist`,
              });
    }
    if (p === "/api/2.1/clusters/start" || p === "/api/2.1/clusters/delete") {
        const c = clusters.find((c) => c.cluster_id === data().cluster_id);
        if (!c)
            return json(res, 400, {
                error_code: "INVALID_PARAMETER_VALUE",
                message: "no such cluster",
            });
        c.state = p.endsWith("start") ? "RUNNING" : "TERMINATED";
        return json(res, 200, {});
    }
    if (p.startsWith("/api/2.0/permissions/")) {
        return json(res, 200, { access_control_list: [] });
    }
    json(res, 404, {
        error_code: "NOT_FOUND",
        message: `mock: no route for ${req.method} ${req.url}`,
    });
}

/** The workspace over TLS, with a key and certificate from $MOCK_DIR. */
const workspaceServer = (key, cert) =>
    http2.createSecureServer(
        {
            key: fs.readFileSync(nodePath.join(DIR, key)),
            cert: fs.readFileSync(nodePath.join(DIR, cert)),
            allowHTTP1: true,
        },
        (req, res) => {
            handle(req, res).catch((e) => {
                log("handler-error", e.message);
                if (!res.headersSent)
                    json(res, 500, { error_code: "INTERNAL_ERROR", message: e.message });
            });
        },
    );
const server = workspaceServer("key.pem", "cert.pem");
server.listen(PORT, "127.0.0.1");

/** An HTTP proxy that tunnels CONNECT mock.databricks.test to `port()`, and refuses anything else. */
const connectProxy = (port) => {
    const proxy = http.createServer((req, res) => {
        log("proxy-http", req.method, req.url);
        res.writeHead(403);
        res.end();
    });
    proxy.on("connect", (req, socket, head) => {
        const [host] = req.url.split(":");
        if (host !== "mock.databricks.test") {
            socket.end("HTTP/1.1 403 Forbidden\r\n\r\n");
            return;
        }
        const upstream = net.connect(port(), "127.0.0.1", () => {
            socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
            upstream.write(head);
            upstream.pipe(socket);
            socket.pipe(upstream);
        });
        upstream.on("error", () => socket.destroy());
        socket.on("error", () => upstream.destroy());
    });
    return proxy;
};
connectProxy(() => PORT).listen(PROXY_PORT, "127.0.0.1");

// The intercepting proxy: the same workspace, behind the certificate a TLS-intercepting proxy would present,
// which no store holds. Its TLS end listens on a free port.
const intercepted = workspaceServer("intercept-key.pem", "intercept-cert.pem");
intercepted.listen(0, "127.0.0.1");
connectProxy(() => intercepted.address().port).listen(INTERCEPT_PORT, "127.0.0.1");
