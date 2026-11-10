// Helpers for the performance scripts: stats over runs, packages of loaded
// files, pairing trace events into spans, telling calls that wait for the
// previous one from calls that overlap, and the metrics of one traced run.
// Tested in lib.test.mjs.
import path from "node:path";

/**
 * The count, minimum, 10th percentile, median, 90th percentile and maximum
 * of the finite `values`, or undefined if there are none. Percentiles
 * interpolate between the two nearest values, so the median of an even
 * count is the mean of the middle two.
 */
export function stats(values) {
    const sorted = values.filter((v) => Number.isFinite(v)).toSorted((a, b) => a - b);
    if (sorted.length === 0) {
        return undefined;
    }
    const quantile = (q) => {
        const position = (sorted.length - 1) * q;
        const below = sorted[Math.floor(position)];
        return below + (sorted[Math.ceil(position)] - below) * (position - Math.floor(position));
    };
    return {
        n: sorted.length,
        min: sorted[0],
        p10: quantile(0.1),
        median: quantile(0.5),
        p90: quantile(0.9),
        max: sorted.at(-1),
    };
}

/**
 * What a loaded file belongs to: its npm package (`name` or `@scope/name`)
 * under node_modules; for the extension's own files, `dist/<layer>`, or
 * `dist/features/<name>` for a feature; else `other`.
 */
export function packageOf(file, distDir) {
    const parts = file.split(/[\\/]/);
    const modules = parts.lastIndexOf("node_modules");
    if (modules !== -1 && modules + 1 < parts.length) {
        const name = parts[modules + 1];
        return name.startsWith("@") ? `${name}/${parts[modules + 2]}` : name;
    }
    const relative = path.relative(distDir, file);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
        return "other";
    }
    const segments = relative.split(/[\\/]/);
    const depth = segments[0] === "features" && segments.length > 2 ? 2 : 1;
    return ["dist", ...segments.slice(0, depth)].join("/");
}

/** A replacement for a module: every property, call and `new` yields another stub. */
export function stubModule(name) {
    const cache = new Map();
    return new Proxy(function () {}, {
        get(target, property) {
            if (property === "prototype") {
                return target.prototype;
            }
            if (property === "then" || typeof property === "symbol") {
                return undefined;
            }
            if (!cache.has(property)) {
                cache.set(property, stubModule(`${name}.${property}`));
            }
            return cache.get(property);
        },
        apply: () => stubModule(`${name}()`),
        construct: () => stubModule(`new ${name}`),
    });
}

/**
 * Pairs the `start` events of `kind` with their `end` or `exit` event, by
 * `id`. Each span has `start`, `end` (undefined while unfinished), `ms`, and
 * the other fields of both events; a `headers` event adds `firstByte`.
 */
export function spans(events, kind) {
    const open = new Map();
    const result = [];
    for (const { t, phase, kind: k, ...fields } of events) {
        if (k !== kind) {
            continue;
        }
        if (phase === "start") {
            const span = { ...fields, start: t, end: undefined, ms: undefined };
            open.set(fields.id, span);
            result.push(span);
            continue;
        }
        const span = open.get(fields.id);
        if (span === undefined) {
            continue;
        }
        if (phase === "headers") {
            span.firstByte = t;
            Object.assign(span, fields);
        } else if (phase === "end" || phase === "exit") {
            Object.assign(span, fields, { end: t, ms: t - span.start });
            open.delete(fields.id);
        }
    }
    return result;
}

/**
 * Marks each span, in start order, `waited` when it started only after every
 * earlier span had ended (it ran after them, one at a time), or `overlapped`.
 * `gap` is how long nothing ran before a waited span.
 */
export function sequence(list) {
    let lastEnd;
    return list
        .toSorted((a, b) => a.start - b.start)
        .map((span) => {
            const waited = lastEnd !== undefined && span.start >= lastEnd;
            const marked = {
                ...span,
                order: lastEnd === undefined ? "first" : waited ? "waited" : "overlapped",
                gap: waited ? span.start - lastEnd : 0,
            };
            if (span.end !== undefined) {
                lastEnd = lastEnd === undefined ? span.end : Math.max(lastEnd, span.end);
            }
            return marked;
        });
}

/** The host of a URL or origin, lower-cased, or undefined if it isn't one. */
function hostOf(url) {
    try {
        return new URL(url).host.toLowerCase();
    } catch {
        return undefined;
    }
}

/** The CLI subcommand of a spawn's arguments, such as `bundle validate` or `auth token`. */
export function cliCommand(args) {
    const words = [];
    for (const arg of args ?? []) {
        if (arg.startsWith("-") || words.length === 2) {
            break;
        }
        words.push(arg);
    }
    return words.join(" ");
}

/**
 * One traced run, relative to the moment the extension host started
 * (`trace.resumedAt`): the extension under test's module load and
 * `activate()`, its connection states, the CLI and other processes it
 * started, the requests to the workspace, and the scenario's steps.
 */
export function summarize(trace, { extensionDir, host, dependencyDirs = [] }) {
    const t0 = trace.resumedAt;
    const at = (t) => (t === undefined ? undefined : Math.round((t - t0) * 10) / 10);
    const relative = (span) => ({ ...span, start: at(span.start), end: at(span.end) });
    const ours = (request) => typeof request === "string" && request.startsWith(extensionDir);
    const load = spans(trace.events, "load").find((s) => ours(s.request));
    const activations = spans(trace.events, "activate");
    const activate = activations.find((s) => ours(s.request));
    const returned = trace.events.find(
        (e) => e.kind === "activate" && e.phase === "returned" && e.id === activate?.id,
    );
    const workspaceHost = hostOf(host);
    const processes = spans(trace.events, "spawn").filter((s) => s.ours);
    return {
        extensionLoad: load && { start: at(load.start), end: at(load.end), modules: load.modules },
        // An extension pack member VS Code loaded before the extension, if any: it doesn't start them with it.
        dependenciesStart: at(
            Math.min(
                ...spans(trace.events, "load")
                    .filter((s) => dependencyDirs.some((dir) => s.request?.startsWith(dir)))
                    .map((s) => s.start),
            ),
        ),
        activate: activate && {
            start: at(activate.start),
            returned: at(returned?.t),
            settled: at(activate.end),
        },
        dependencies: activations
            .filter((s) => s !== activate && s.start < (activate?.start ?? Infinity))
            .map((s) => ({ extension: s.request, start: at(s.start), end: at(s.end) })),
        connection: trace.events
            .filter((e) => e.kind === "connection")
            .map((e) => ({ state: e.state, t: at(e.t) })),
        cli: processes
            .filter((s) => s.cli)
            .map((s) => ({ command: cliCommand(s.args), ...relative(s) })),
        processes: processes
            .filter((s) => !s.cli)
            .map((s) => ({ command: path.basename(s.file ?? ""), ...relative(s) })),
        http: spans(trace.events, "http")
            .filter((s) => workspaceHost !== undefined && hostOf(s.origin) === workspaceHost)
            .map((s) => ({ ...relative(s), firstByte: at(s.firstByte) })),
        otherHttp: spans(trace.events, "http").filter(
            (s) => workspaceHost === undefined || hostOf(s.origin) !== workspaceHost,
        ).length,
        steps: spans(trace.events, "step").map(relative),
        commands: spans(trace.events, "command").map(relative),
        quickPicks: trace.events
            .filter((e) => e.kind === "quickpick")
            .map(({ t, ...e }) => ({ ...e, t: at(t) })),
        log: (trace.log ?? []).map(({ t, ...e }) => ({ ...e, t: at(t) })),
    };
}

/** The spans of `list` that start inside `[from, to]`. */
function within(list, from, to) {
    return list.filter((s) => s.start >= from && (to === undefined || s.start <= to));
}

/**
 * The named metrics of one summarized run, in milliseconds unless the name
 * says otherwise. Steps add `<step>`, `<step>: requests`, `<step>: CLI
 * processes`, `<step>: longest wait chain` and the like.
 */
export function metrics(summary) {
    const m = {};
    const { extensionLoad, activate, connection } = summary;
    if (extensionLoad) {
        m["host start → extension load starts"] = extensionLoad.start;
        if (Number.isFinite(summary.dependenciesStart)) {
            m["dependencies start loading → extension load starts"] =
                extensionLoad.start - summary.dependenciesStart;
        }
        m["extension load"] = extensionLoad.end - extensionLoad.start;
        m["modules after load (count)"] = extensionLoad.modules;
    }
    if (activate?.returned !== undefined) {
        m["activate()"] = activate.returned - activate.start;
        const settled = connection.find(
            (c) => c.t >= activate.start && (c.state === "CONNECTED" || c.state === "DISCONNECTED"),
        );
        if (settled) {
            m[`activate() returned → ${settled.state.toLowerCase()}`] =
                settled.t - activate.returned;
        }
        const startupEnd = summary.steps.find((s) => s.name === "startup")?.end;
        const startup = {
            cli: within(summary.cli, activate.start, startupEnd),
            http: within(summary.http, activate.start, startupEnd),
        };
        for (const command of ["bundle validate", "bundle summary", "auth token"]) {
            const runs = startup.cli.filter((c) => c.command === command);
            if (runs.length > 0) {
                m[`startup: ${command} (count)`] = runs.length;
                m[`startup: ${command}`] = runs[0].ms;
                m[`activate() returned → ${command} ends`] = runs[0].end - activate.returned;
            }
        }
        m["startup: requests (count)"] = startup.http.length;
        m["startup: CLI processes (count)"] = startup.cli.length;
        Object.assign(m, callMetrics("startup", startup.http, []));
    }
    // The log's clock isn't the probes' in the extension host, so its milestones are timed
    // from its own "Activated" entry, written while activate() runs.
    const logged = (prefix) => summary.log.find((e) => e.message.startsWith(prefix))?.t;
    const activatedAt = logged("Activated ");
    for (const [name, prefix] of [
        ["activate() → project detected (log)", "Project "],
        ["activate() → connection resolution starts (log)", "Resolving the connection"],
    ]) {
        const t = logged(prefix);
        if (activatedAt !== undefined && t !== undefined) {
            m[name] = t - activatedAt;
        }
    }
    for (const step of summary.steps) {
        if (step.name === "startup" || step.end === undefined) {
            continue;
        }
        const name = step.name.startsWith("trigger") ? "trigger → activate() returned" : step.name;
        if (name !== step.name) {
            if (activate?.returned !== undefined) {
                m[name] = activate.returned - step.start;
            }
            if (activate?.settled !== undefined) {
                m["trigger → activate() settled"] = activate.settled - step.start;
            }
            if (extensionLoad) {
                m["trigger → extension load starts"] = extensionLoad.start - step.start;
            }
            continue;
        }
        const http = within(summary.http, step.start, step.end);
        const cli = within(summary.cli, step.start, step.end);
        const processes = within(summary.processes, step.start, step.end);
        const commands = within(summary.commands, step.start, step.end);
        // Until the last call or the command ends: the step's own wait for quiet isn't work.
        const ends = [...http, ...cli, ...processes, ...commands]
            .map((s) => s.end)
            .filter((t) => t !== undefined);
        m[name] = Math.max(step.start, ...ends) - step.start;
        m[`${name}: requests (count)`] = http.length;
        m[`${name}: CLI processes (count)`] = cli.length;
        m[`${name}: other processes (count)`] = processes.length;
        m[`${name}: calls that waited for the previous one (count)`] = sequence([
            ...http,
            ...cli,
            ...processes,
        ]).filter((s) => s.order === "waited").length;
        Object.assign(m, callMetrics(name, http, cli));
        const picks = summary.quickPicks.filter((q) => q.t >= step.start && q.t <= step.end);
        const firstOf = (predicate) => picks.find(predicate)?.t;
        const shown = firstOf((q) => q.phase === "show");
        if (shown !== undefined) {
            m[`${name}: quick pick shown`] = shown - step.start;
            const loaded = firstOf((q) => q.phase === "busy" && q.busy === false && q.t >= shown);
            if (loaded !== undefined) {
                m[`${name}: quick pick done loading`] = loaded - step.start;
            }
            const accepted = firstOf((q) => q.phase === "accepted");
            const connected = summary.connection.find(
                (c) => c.state === "CONNECTED" && accepted !== undefined && c.t >= accepted,
            )?.t;
            if (connected !== undefined) {
                m[`${name}: profile chosen → connected`] = connected - accepted;
            }
        }
    }
    return m;
}

/** The calls of a summarized run, step by step, in start order, as Markdown. */
export function timeline(summary) {
    const ms = (v) => (v === undefined ? "–" : `${Math.round(v)}`);
    const lines = ["# Timeline of one run", "", "Times in ms since the extension host started."];
    for (const step of summary.steps) {
        const calls = sequence([
            ...within(summary.cli, step.start, step.end).map((c) => ({
                ...c,
                what: `CLI ${c.command}`,
            })),
            ...within(summary.processes, step.start, step.end).map((p) => ({
                ...p,
                what: `process ${p.command}`,
            })),
            ...within(summary.http, step.start, step.end).map((h) => ({
                ...h,
                what: `${h.method} ${h.path}${h.status === undefined ? "" : ` → ${h.status}`}`,
            })),
        ]);
        lines.push("", `## ${step.name} (${ms(step.start)}–${ms(step.end)})`, "");
        if (step.name === "startup" && summary.activate !== undefined) {
            const { extensionLoad: load, activate } = summary;
            lines.push(
                `- extension load ${ms(load?.start)}–${ms(load?.end)}, activate() ${ms(activate.start)}–${ms(activate.returned)}`,
                ...summary.connection.map((c) => `- connection ${c.state} at ${ms(c.t)}`),
            );
        }
        for (const call of calls) {
            const order = call.order === "waited" ? `waited, gap ${ms(call.gap)}` : call.order;
            lines.push(
                `- ${ms(call.start)}–${ms(call.end)} (${ms(call.ms)}) ${call.what} [${order}]`,
            );
        }
    }
    return `${lines.join("\n")}\n`;
}

/**
 * The duration of the first request of each kind (`GET /path`) and of each
 * CLI subcommand in a step, and how many there were when more than one.
 */
function callMetrics(step, http, cli) {
    const m = {};
    const add = (what, span) => {
        const key = `${step}: ${what}`;
        if (m[key] === undefined) {
            m[key] = span.ms;
        } else {
            m[`${key} (count)`] = (m[`${key} (count)`] ?? 1) + 1;
        }
    };
    for (const span of http) {
        add(`${span.method} ${span.path}`, span);
    }
    for (const span of cli) {
        add(`CLI ${span.command}`, span);
    }
    return m;
}

/** Each metric's stats over the runs, in the order the metrics first appear. */
export function aggregate(runs) {
    const names = [...new Set(runs.flatMap((r) => Object.keys(r)))];
    return names.map((name) => ({ name, ...stats(runs.map((r) => r[name])) }));
}

const format = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

/** A Markdown table of aggregated metrics: the median, its spread (p10–p90), then the range. */
export function metricsTable(rows) {
    const lines = ["| Metric | Median | p10–p90 | Min–max | Runs |", "|---|---:|---:|---:|---:|"];
    for (const row of rows) {
        if (row.n === undefined) {
            continue;
        }
        lines.push(
            `| ${row.name} | ${format(row.median)} | ${format(row.p10)}–${format(row.p90)} | ${format(row.min)}–${format(row.max)} | ${row.n} |`,
        );
    }
    return lines.join("\n");
}

/**
 * The metrics that `before` and `after` (aggregated rows) both have, with
 * the change of the median and whether it is shown: larger than the spread
 * (p10–p90) of either side. A smaller change is within the noise.
 */
export function compareRows(before, after) {
    const afterByName = new Map(after.filter((r) => r.n !== undefined).map((r) => [r.name, r]));
    return before
        .filter((b) => b.n !== undefined && afterByName.has(b.name))
        .map((b) => {
            const a = afterByName.get(b.name);
            const change = a.median - b.median;
            const spread = Math.max(b.p90 - b.p10, a.p90 - a.p10);
            return {
                name: b.name,
                before: b,
                after: a,
                change,
                spread,
                shown: Math.abs(change) > spread,
            };
        });
}

/** A Markdown table of `compareRows`: each side's median (p10–p90, runs), the change and whether it is shown. */
export function comparisonTable(rows) {
    const side = (s) => `${format(s.median)} (${format(s.p10)}–${format(s.p90)}, n=${s.n})`;
    const lines = [
        "| Metric | Before: median (p10–p90, runs) | After: median (p10–p90, runs) | Change | Shown? |",
        "|---|---:|---:|---:|---|",
    ];
    for (const row of rows) {
        const sign = row.change > 0 ? "+" : "";
        lines.push(
            `| ${row.name} | ${side(row.before)} | ${side(row.after)} | ${sign}${format(row.change)} | ${row.shown ? "shown" : "not shown"} |`,
        );
    }
    return lines.join("\n");
}
