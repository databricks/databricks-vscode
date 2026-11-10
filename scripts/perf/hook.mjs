/**
 * Installs the probes in VS Code's extension host. `trace.mjs` evaluates this
 * function's source there through the inspector, while the host is paused
 * before its first line, so the function may use nothing from this module:
 * only its argument and Node's built-in modules.
 *
 * It records events in `globalThis.__perf.events`, each with `t`, in
 * milliseconds since the epoch:
 * - `load`: a top-level `require` of a file outside node_modules (each
 *   extension's main module), with the number of modules loaded after it;
 * - `activate`: each extension's `activate()`, when it returned and when its
 *   result settled;
 * - `spawn`: each child process, its first arguments, whether the extension
 *   under test started it (`ours`) and whether it is the Databricks CLI, and
 *   its exit;
 * - `http`: each request made with undici (Node's and VS Code's `fetch`) or
 *   `http(s).request`: method, origin and path. The query string is dropped,
 *   and headers and bodies are never read, so no credential is recorded;
 * - `connection`: the extension's connection state, from its public API;
 * - `quickpick`, `command`, `step`: what the scenario does.
 *
 * Scenario steps use the helpers on `globalThis.__perf`: `vscode` (the API
 * the extension under test gets), `step`, `command`, `waitFor` and `quiet`.
 * Rules in `__perf.rules` answer the extension's quick picks: `{action:
 * "accept", match}` picks the first item whose label matches, and `{action:
 * "hideWhenLoaded"}` closes the pick once it is no longer busy.
 */
export function installHook({ extensionDir, host }) {
    const events = [];
    const now = () => performance.timeOrigin + performance.now();
    const perf = {
        events,
        rules: [],
        busy: new Set(),
        lastActivity: now(),
        lastExtensionEvent: now(),
        connection: undefined,
        activated: false,
        vscode: undefined,
    };
    globalThis.__perf = perf;
    let nextId = 0;
    const push = (event, ours = false) => {
        const t = now();
        events.push({ t, ...event });
        if (ours) {
            perf.lastActivity = t;
        }
        if (event.kind === "load" || event.kind === "activate") {
            perf.lastExtensionEvent = t;
        }
    };
    // Whether the extension's code is on the stack. Its frame is a few deep, as
    // platform/process.ts spawns directly; the default limit of 10 frames is raised in case.
    const startedByUs = () => {
        const limit = Error.stackTraceLimit;
        Error.stackTraceLimit = 30;
        try {
            return (new Error().stack ?? "").includes(extensionDir);
        } finally {
            Error.stackTraceLimit = limit;
        }
    };
    const workspaceHost = (() => {
        try {
            return new URL(host).host.toLowerCase();
        } catch {
            return undefined;
        }
    })();
    const isWorkspace = (origin) => {
        try {
            return (
                workspaceHost !== undefined && new URL(origin).host.toLowerCase() === workspaceHost
            );
        } catch {
            return false;
        }
    };

    // Requests.
    const channels = process.getBuiltinModule("node:diagnostics_channel");
    const requests = new WeakMap();
    const begin = (request, origin, method, requestPath) => {
        const id = ++nextId;
        const ours = isWorkspace(origin);
        requests.set(request, { id, ours });
        if (ours) {
            perf.busy.add(`http${id}`);
        }
        push(
            {
                kind: "http",
                phase: "start",
                id,
                method,
                origin,
                path: String(requestPath).split("?")[0],
            },
            ours,
        );
    };
    const finish = (request, fields) => {
        const known = requests.get(request);
        if (known === undefined) {
            return;
        }
        requests.delete(request);
        perf.busy.delete(`http${known.id}`);
        push({ kind: "http", phase: "end", id: known.id, ...fields }, known.ours);
    };
    channels.subscribe("undici:request:create", ({ request }) =>
        begin(request, String(request.origin), request.method, request.path),
    );
    channels.subscribe("undici:request:headers", ({ request, response }) => {
        const known = requests.get(request);
        if (known !== undefined) {
            push({ kind: "http", phase: "headers", id: known.id, status: response.statusCode });
        }
    });
    channels.subscribe("undici:request:trailers", ({ request }) => finish(request, {}));
    channels.subscribe("undici:request:error", ({ request, error }) =>
        finish(request, { error: String(error?.code ?? error?.name ?? "error") }),
    );
    channels.subscribe("http.client.request.start", ({ request }) =>
        begin(request, `${request.protocol}//${request.host}`, request.method, request.path),
    );
    channels.subscribe("http.client.response.finish", ({ request, response }) =>
        finish(request, { status: response.statusCode }),
    );
    channels.subscribe("http.client.request.error", ({ request, error }) =>
        finish(request, { error: String(error?.code ?? error?.name ?? "error") }),
    );

    // Child processes.
    const childProcess = process.getBuiltinModule("node:child_process");
    const path = process.getBuiltinModule("node:path");
    const spawn = childProcess.ChildProcess.prototype.spawn;
    childProcess.ChildProcess.prototype.spawn = function (options) {
        const id = ++nextId;
        const ours = startedByUs();
        const file = String(options?.file ?? "");
        const args = (Array.isArray(options?.args) ? options.args.slice(1, 7) : []).map((a) =>
            String(a).slice(0, 80),
        );
        const cli = path.basename(file).replace(/\.exe$/, "") === "databricks";
        if (ours) {
            perf.busy.add(`spawn${id}`);
        }
        push({ kind: "spawn", phase: "start", id, file, args, ours, cli }, ours);
        this.once("exit", (code, signal) => {
            perf.busy.delete(`spawn${id}`);
            push({ kind: "spawn", phase: "exit", id, code, signal }, ours);
        });
        return spawn.call(this, options);
    };

    // Extensions' main modules, and their activate().
    const Module = process.getBuiltinModule("node:module");
    const load = Module._load;
    let depth = 0;
    const isMainModule = (request) =>
        depth === 0 &&
        typeof request === "string" &&
        path.isAbsolute(request) &&
        !request.includes("node_modules");
    Module._load = function (request, ...rest) {
        if (!isMainModule(request)) {
            depth++;
            try {
                return load.call(this, request, ...rest);
            } finally {
                depth--;
            }
        }
        const id = ++nextId;
        const ours = request.startsWith(extensionDir);
        push({ kind: "load", phase: "start", id, request }, ours);
        if (ours) {
            try {
                perf.automate();
            } catch (error) {
                push({ kind: "note", text: `Can't take the extension's API: ${String(error)}` });
            }
        }
        depth++;
        let loaded;
        try {
            loaded = load.call(this, request, ...rest);
            return loaded;
        } finally {
            depth--;
            push(
                { kind: "load", phase: "end", id, modules: Object.keys(Module._cache).length },
                ours,
            );
            if (typeof loaded?.activate === "function" && !loaded.__perfWrapped) {
                wrapActivate(loaded, request, ours);
            }
        }
    };
    const wrapActivate = (loaded, request, ours) => {
        const activate = loaded.activate;
        try {
            loaded.activate = function (...args) {
                const id = ++nextId;
                push({ kind: "activate", phase: "start", id, request }, ours);
                let result;
                try {
                    result = activate.apply(this, args);
                } finally {
                    push({ kind: "activate", phase: "returned", id }, ours);
                }
                Promise.resolve(result).then(
                    (api) => {
                        push({ kind: "activate", phase: "end", id }, ours);
                        if (ours) {
                            perf.activated = true;
                            perf.api = api;
                            const report = (state) => {
                                perf.connection = state;
                                push({ kind: "connection", state }, true);
                            };
                            report(api?.connectionManager?.state);
                            api?.connectionManager?.onDidChangeState?.(report);
                        }
                    },
                    (error) =>
                        push({ kind: "activate", phase: "end", id, error: String(error) }, ours),
                );
                return result;
            };
            loaded.__perfWrapped = true;
        } catch (error) {
            push({ kind: "note", text: `Can't wrap activate() of ${request}: ${String(error)}` });
        }
    };

    /**
     * The `vscode` API that an extension's modules get. VS Code hands it out
     * by the path of the requiring module, so a module "inside" the extension's
     * folder gets its API, before or after it activates.
     */
    perf.vscodeFor = (dir) => {
        const probe = new Module(path.join(dir, "dist", "extension.js"));
        probe.filename = probe.id;
        probe.paths = Module._nodeModulePaths(dir);
        return probe.require("vscode");
    };

    /** Takes the extension's API and answers its quick picks by `perf.rules`. */
    perf.automate = () => {
        if (perf.vscode !== undefined) {
            return;
        }
        const api = perf.vscodeFor(extensionDir);
        perf.vscode = api;
        const create = api.window.createQuickPick;
        api.window.createQuickPick = function (...args) {
            const pick = create.apply(this, args);
            watchQuickPick(api, pick);
            return pick;
        };
        if (api.window.createQuickPick === create) {
            push({ kind: "note", text: "Can't answer quick picks: window is read-only" });
        }
    };
    const descriptor = (object, name) => {
        for (let o = object; o; o = Object.getPrototypeOf(o)) {
            const found = Object.getOwnPropertyDescriptor(o, name);
            if (found) {
                return found;
            }
        }
        return undefined;
    };
    const watchQuickPick = (api, pick) => {
        const id = ++nextId;
        const state = { shown: false };
        push({ kind: "quickpick", phase: "create", id }, true);
        const act = () => {
            const rule = perf.rules[0];
            if (rule === undefined || !state.shown) {
                return;
            }
            if (rule.action === "hideWhenLoaded" && !pick.busy) {
                perf.rules.shift();
                push({ kind: "quickpick", phase: "auto-hide", id }, true);
                setTimeout(() => pick.hide(), 0);
            } else if (rule.action === "accept") {
                const item = pick.items.find((i) => new RegExp(rule.match).test(i.label ?? ""));
                if (item !== undefined) {
                    perf.rules.shift();
                    push({ kind: "quickpick", phase: "auto-accept", id, label: item.label }, true);
                    pick.activeItems = [item];
                    // As a user would press Enter once the item is active.
                    setTimeout(() => {
                        push({ kind: "quickpick", phase: "accepted", id }, true);
                        void api.commands.executeCommand(
                            "workbench.action.acceptSelectedQuickOpenItem",
                        );
                    }, 100);
                }
            }
        };
        for (const name of ["items", "busy"]) {
            const original = descriptor(pick, name);
            if (original?.set === undefined) {
                continue;
            }
            Object.defineProperty(pick, name, {
                configurable: true,
                enumerable: true,
                get() {
                    return original.get.call(this);
                },
                set(value) {
                    original.set.call(this, value);
                    push(
                        name === "items"
                            ? { kind: "quickpick", phase: "items", id, count: value.length }
                            : { kind: "quickpick", phase: "busy", id, busy: value },
                        true,
                    );
                    act();
                },
            });
        }
        const show = pick.show;
        pick.show = function () {
            const result = show.apply(this);
            state.shown = true;
            push({ kind: "quickpick", phase: "show", id, items: pick.items.length }, true);
            act();
            return result;
        };
        pick.onDidHide(() => push({ kind: "quickpick", phase: "hidden", id }, true));
    };

    /** Marks a scenario step; returns the function that ends it. */
    perf.step = (name) => {
        const id = ++nextId;
        push({ kind: "step", phase: "start", id, name }, true);
        return () => push({ kind: "step", phase: "end", id }, true);
    };
    /** Runs a command of the extension, recording when it started and resolved. */
    perf.command = async (command, ...args) => {
        const id = ++nextId;
        push({ kind: "command", phase: "start", id, command }, true);
        try {
            await perf.vscode.commands.executeCommand(command, ...args);
            push({ kind: "command", phase: "end", id }, true);
        } catch (error) {
            push({ kind: "command", phase: "end", id, error: String(error).slice(0, 200) }, true);
        }
    };
    /** Whether a CLI process running `command`, such as "bundle summary", has exited. */
    perf.ran = (command) => {
        const started = events
            .filter(
                (e) =>
                    e.kind === "spawn" &&
                    e.phase === "start" &&
                    e.cli &&
                    e.args
                        .filter((a) => !a.startsWith("-"))
                        .slice(0, 2)
                        .join(" ") === command,
            )
            .map((e) => e.id);
        return events.some(
            (e) => e.kind === "spawn" && e.phase === "exit" && started.includes(e.id),
        );
    };
    /** Resolves once `predicate()` holds, or after `timeoutMs` with false. */
    perf.waitFor = (predicate, timeoutMs) =>
        new Promise((resolve) => {
            const started = now();
            const check = () => {
                if (predicate()) {
                    resolve(true);
                } else if (now() - started > timeoutMs) {
                    resolve(false);
                } else {
                    setTimeout(check, 25);
                }
            };
            check();
        });
    /**
     * Resolves once the extension has had no process and no workspace request
     * running, and recorded nothing, for `quietMs`; or after `timeoutMs`.
     */
    perf.quiet = (quietMs, timeoutMs) =>
        perf.waitFor(() => perf.busy.size === 0 && now() - perf.lastActivity >= quietMs, timeoutMs);
    /**
     * Resolves once no extension has loaded or activated for `quietMs`, so
     * the host's startup activations are over; or after `timeoutMs`, with false.
     */
    perf.extensionsIdle = (quietMs, timeoutMs) =>
        perf.waitFor(() => now() - perf.lastExtensionEvent >= quietMs, timeoutMs);
    return "installed";
}
