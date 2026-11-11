// `node scripts/perf/moduleLoad.mjs`: times loading the built extension,
// packages/databricks-vscode/dist/extension.js, in plain Node with a stub
// `vscode`, and attributes the time to packages. It is the part of
// activation before `activate()` runs, which the activation budget
// (src/test/budgets/activation.test.ts) doesn't time. Each load runs in a
// fresh process.
//
//   node scripts/perf/moduleLoad.mjs [--runs <n>] [--defer <package>[,<package>...]] [--bundle]
//
//   --runs <n>    loads of each variant (default 10)
//   --defer <p>   also loads with these packages replaced by a stub, as if the
//                 extension imported them on first use
//   --bundle      also loads dist/ bundled into one file by esbuild (a
//                 dependency of the dev tools), in a temporary folder
//
// The variants alternate within each run; the difference of their medians is
// the saving. Run `yarn build` first.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import Module from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { packageOf, stats, stubModule } from "./lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const entry = path.join(root, "packages/databricks-vscode/dist/extension.js");

/**
 * Requires `entryFile` in this process, with `vscode` and the `defer`
 * packages stubbed, and returns how long it took, how many modules and
 * bytes it loaded, and each package's own time (its files' load time minus
 * the time of the files they required).
 */
export function measureLoad(entryFile, { defer = [] } = {}) {
    const distDir = path.dirname(fs.realpathSync(entryFile));
    const stubbed = (request) =>
        request === "vscode" || defer.some((p) => request === p || request.startsWith(`${p}/`));
    const before = new Set(Object.keys(Module._cache));
    const selfTimes = {};
    const frames = [];
    const load = Module._load;
    Module._load = function (request, parent, isMain) {
        if (stubbed(request)) {
            return stubModule(request);
        }
        let file;
        try {
            file = Module._resolveFilename(request, parent, isMain);
        } catch {
            file = undefined;
        }
        const fresh =
            file !== undefined && Module._cache[file] === undefined && !Module.isBuiltin(request);
        const frame = { started: performance.now(), children: 0 };
        frames.push(frame);
        try {
            return load.call(this, request, parent, isMain);
        } finally {
            frames.pop();
            const total = performance.now() - frame.started;
            if (frames.length > 0) {
                frames.at(-1).children += total;
            }
            if (fresh) {
                const name = packageOf(file, distDir);
                selfTimes[name] = (selfTimes[name] ?? 0) + total - frame.children;
            }
        }
    };
    const started = performance.now();
    try {
        Module.createRequire(entryFile)(entryFile);
    } finally {
        Module._load = load;
    }
    const loadMs = performance.now() - started;
    const loaded = Object.keys(Module._cache).filter((f) => !before.has(f));
    const bytes = loaded.reduce(
        (sum, f) => sum + (fs.statSync(f, { throwIfNoEntry: false })?.size ?? 0),
        0,
    );
    return { loadMs, modules: loaded.length, bytes, selfTimes };
}

function child(args) {
    return JSON.parse(
        execFileSync(process.execPath, [fileURLToPath(import.meta.url), "--child", ...args], {
            encoding: "utf-8",
        }),
    );
}

/** dist/ bundled into one CommonJS file by esbuild, `vscode` left out. */
function bundle(dir) {
    const outfile = path.join(dir, "extension.js");
    execFileSync(
        path.join(root, "node_modules/esbuild/bin/esbuild"),
        [
            entry,
            "--bundle",
            "--platform=node",
            "--format=cjs",
            "--target=node22",
            "--external:vscode",
            `--outfile=${outfile}`,
            "--log-level=error",
        ],
        { stdio: "inherit" },
    );
    return outfile;
}

function main() {
    const { values } = parseArgs({
        options: {
            runs: { type: "string", default: "10" },
            defer: { type: "string", default: "" },
            bundle: { type: "boolean", default: false },
            child: { type: "boolean", default: false },
            entry: { type: "string", default: entry },
        },
    });
    const defer = values.defer.split(",").filter((p) => p !== "");
    if (values.child) {
        console.log(JSON.stringify(measureLoad(values.entry, { defer })));
        return;
    }
    if (!fs.existsSync(entry)) {
        throw new Error(`${entry} doesn't exist. Run \`yarn build\` first.`);
    }
    const temp = values.bundle ? fs.mkdtempSync(path.join(os.tmpdir(), "perf-bundle-")) : undefined;
    try {
        const variants = [
            { name: "as built", args: [] },
            ...(defer.length > 0
                ? [{ name: `${defer.join(", ")} deferred`, args: ["--defer", defer.join(",")] }]
                : []),
            ...(temp !== undefined
                ? [{ name: "bundled with esbuild", args: ["--entry", bundle(temp)] }]
                : []),
        ].map((v) => ({ ...v, results: [] }));
        const runs = Number(values.runs);
        for (let i = 0; i < runs; i++) {
            for (const variant of variants) {
                variant.results.push(child(variant.args));
            }
        }
        report(variants, runs);
    } finally {
        if (temp !== undefined) {
            fs.rmSync(temp, { recursive: true, force: true });
        }
    }
}

function report(variants, runs) {
    const median = (list, pick) => stats(list.map(pick))?.median ?? 0;
    const format = (v) => v.toFixed(1);
    const range = (list) => {
        const s = stats(list.map((r) => r.loadMs));
        return `${format(s.median)} ms (${format(s.min)}–${format(s.max)})`;
    };
    const [baseline] = variants;
    console.log(
        `Loading ${path.relative(root, entry)} in Node ${process.versions.node}, ${runs} runs each\n`,
    );
    console.log(
        "| Variant | Load, median (min–max) | Saved | Modules | Bytes |\n|---|---:|---:|---:|---:|",
    );
    for (const { name, results } of variants) {
        const saved = median(baseline.results, (r) => r.loadMs) - median(results, (r) => r.loadMs);
        console.log(
            `| ${name} | ${range(results)} | ${format(saved)} ms | ${median(results, (r) => r.modules)} | ${median(results, (r) => r.bytes)} |`,
        );
    }
    const names = [...new Set(baseline.results.flatMap((r) => Object.keys(r.selfTimes)))];
    const ranked = names
        .map((name) => ({ name, ms: median(baseline.results, (r) => r.selfTimes[name] ?? 0) }))
        .sort((a, b) => b.ms - a.ms)
        .slice(0, 20);
    console.log(`\n| Package (as built) | Own load time, median ms |\n|---|---:|`);
    for (const { name, ms } of ranked) {
        console.log(`| ${name} | ${format(ms)} |`);
    }
}

if (import.meta.main) {
    main();
}
