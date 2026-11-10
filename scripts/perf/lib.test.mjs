import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import vm from "node:vm";
import { ACTIVATION_SETUP, setupGap } from "./activationMetric.mjs";
import { installHook } from "./hook.mjs";
import {
    aggregate,
    cliCommand,
    compareRows,
    comparisonTable,
    metrics,
    metricsTable,
    packageOf,
    sequence,
    spans,
    stats,
    stubModule,
    summarize,
    timeline,
} from "./lib.mjs";
import { measureLoad } from "./moduleLoad.mjs";
import { projectFiles, SCENARIOS, stepExpression } from "./scenarios.mjs";
import { cleanEnv, readExtensionLog } from "./trace.mjs";

await test("stats", async (t) => {
    await t.test("gives the median of an odd and an even number of values", () => {
        assert.equal(stats([3, 1, 2]).median, 2);
        assert.equal(stats([4, 1, 2, 3]).median, 2.5);
    });

    await t.test("gives the 10th and 90th percentiles, between the nearest values", () => {
        const values = Array.from({ length: 21 }, (_, i) => 100 + i);
        assert.deepEqual(stats(values), {
            n: 21,
            min: 100,
            p10: 102,
            median: 110,
            p90: 118,
            max: 120,
        });
        // Between the 1st and 2nd of 6 values: 1 + (2 - 1) * 0.5.
        assert.equal(stats([1, 2, 3, 4, 5, 6]).p10, 1.5);
    });

    await t.test("skips values that aren't numbers, and is undefined without any", () => {
        assert.deepEqual(stats([undefined, 5, Number.NaN]), {
            n: 1,
            min: 5,
            p10: 5,
            median: 5,
            p90: 5,
            max: 5,
        });
        assert.equal(stats([undefined]), undefined);
    });
});

await test("compareRows", async (t) => {
    const row = (name, values) => ({ name, ...stats(values) });

    await t.test("shows a change larger than either side's spread, and not a smaller one", () => {
        const before = [
            row("sign-in", [700, 705, 710, 715, 720]),
            row("load", [360, 365, 370, 375, 380]),
        ];
        const after = [
            row("sign-in", [500, 505, 510, 515, 520]),
            row("load", [355, 360, 365, 370, 375]),
        ];
        const [signIn, load] = compareRows(before, after);
        assert.equal(signIn.change, -200);
        assert.equal(signIn.shown, true);
        assert.equal(load.change, -5);
        assert.equal(load.spread, 16);
        assert.equal(load.shown, false);
    });

    await t.test("skips a metric that only one side has", () => {
        const rows = compareRows([row("a", [1]), row("b", [2])], [row("b", [3])]);
        assert.deepEqual(
            rows.map((r) => r.name),
            ["b"],
        );
    });

    await t.test("tabulates each side, the change and the verdict", () => {
        const table = comparisonTable(
            compareRows([row("sign-in", [700, 710, 720])], [row("sign-in", [500, 510, 520])]),
        );
        assert.match(
            table,
            /\| sign-in \| 710 \(702–718, n=3\) \| 510 \(502–518, n=3\) \| -200 \| shown \|/,
        );
    });
});

await test("packageOf", async (t) => {
    const dist = "/repo/packages/databricks-vscode/dist";

    await t.test("names the package of a file under node_modules, scoped or not", () => {
        assert.equal(packageOf("/repo/node_modules/zod/v4/index.js", dist), "zod");
        assert.equal(
            packageOf("/repo/node_modules/@databricks/sdk-jobs/dist/v2/index.js", dist),
            "@databricks/sdk-jobs",
        );
        assert.equal(packageOf("/repo/node_modules/a/node_modules/b/index.js", dist), "b");
    });

    await t.test("names the layer of the extension's own files, and the feature", () => {
        assert.equal(packageOf(`${dist}/extension.js`, dist), "dist/extension.js");
        assert.equal(packageOf(`${dist}/kernel/connection/Profiles.js`, dist), "dist/kernel");
        assert.equal(packageOf(`${dist}/features/python/index.js`, dist), "dist/features/python");
    });

    await t.test("is other for anything else", () => {
        assert.equal(packageOf("/elsewhere/x.js", dist), "other");
    });
});

await test("stubModule stands in for any export, call and construction", () => {
    const stub = stubModule("vscode");
    assert.equal(typeof stub.window.createOutputChannel("x").appendLine, "function");
    assert.equal(typeof new stub.EventEmitter().event, "function");
    assert.equal(stub.then, undefined, "awaiting the stub must not hang");
    // A module may extend a class of the stub; constructing one yields another stub.
    assert.doesNotThrow(() => new (class extends stub.TreeItem {})());
});

await test("spans", async (t) => {
    await t.test("pairs start and end events by id, keeping the fields of both", () => {
        const events = [
            { t: 10, kind: "http", phase: "start", id: 1, method: "GET" },
            { t: 15, kind: "http", phase: "headers", id: 1, status: 200 },
            { t: 20, kind: "spawn", phase: "start", id: 2 },
            { t: 30, kind: "http", phase: "end", id: 1 },
        ];
        assert.deepEqual(spans(events, "http"), [
            { id: 1, method: "GET", start: 10, end: 30, ms: 20, firstByte: 15, status: 200 },
        ]);
    });

    await t.test("leaves an unfinished span without an end", () => {
        const [span] = spans([{ t: 5, kind: "spawn", phase: "start", id: 3 }], "spawn");
        assert.equal(span.end, undefined);
        assert.equal(span.ms, undefined);
    });
});

await test("sequence tells calls that waited from calls that overlapped", () => {
    const ordered = sequence([
        { id: "c", start: 25, end: 40 },
        { id: "a", start: 0, end: 10 },
        { id: "b", start: 12, end: 30 },
    ]);
    assert.deepEqual(
        ordered.map((s) => [s.id, s.order, s.gap]),
        [
            ["a", "first", 0],
            ["b", "waited", 2],
            ["c", "overlapped", 0],
        ],
    );
});

await test("cliCommand is the subcommand, without the flags", () => {
    assert.equal(cliCommand(["bundle", "validate", "--target", "dev"]), "bundle validate");
    assert.equal(cliCommand(["auth", "token", "--profile", "p"]), "auth token");
    assert.equal(cliCommand(["version", "--output", "json"]), "version");
});

/** A trace of a startup: the extension loads, activates, connects, validates and summarizes. */
function startupTrace() {
    const ext = "/sandbox/extensions/databricks.databricks-0.0.0";
    const cli = `${ext}/bin/databricks`;
    return {
        resumedAt: 1000,
        events: [
            { t: 1100, kind: "step", phase: "start", id: 1, name: "startup" },
            { t: 1200, kind: "load", phase: "start", id: 2, request: `${ext}/dist/extension.js` },
            { t: 1560, kind: "load", phase: "end", id: 2, modules: 700 },
            {
                t: 1570,
                kind: "activate",
                phase: "start",
                id: 3,
                request: `${ext}/dist/extension.js`,
            },
            { t: 1583, kind: "activate", phase: "returned", id: 3 },
            { t: 1590, kind: "activate", phase: "end", id: 3 },
            {
                t: 1800,
                kind: "spawn",
                phase: "start",
                id: 4,
                file: cli,
                args: ["auth", "token"],
                ours: true,
                cli: true,
            },
            { t: 1900, kind: "spawn", phase: "exit", id: 4, code: 0 },
            {
                t: 1910,
                kind: "http",
                phase: "start",
                id: 5,
                method: "GET",
                origin: "https://ws.example.com",
                path: "/api/2.0/preview/scim/v2/Me",
            },
            { t: 2100, kind: "http", phase: "end", id: 5 },
            { t: 2110, kind: "connection", state: "CONNECTED" },
            {
                t: 2120,
                kind: "spawn",
                phase: "start",
                id: 6,
                file: cli,
                args: ["bundle", "validate", "--target", "dev"],
                ours: true,
                cli: true,
            },
            { t: 3120, kind: "spawn", phase: "exit", id: 6, code: 0 },
            {
                t: 3130,
                kind: "spawn",
                phase: "start",
                id: 7,
                file: cli,
                args: ["bundle", "summary", "--target", "dev"],
                ours: true,
                cli: true,
            },
            { t: 4630, kind: "spawn", phase: "exit", id: 7, code: 0 },
            {
                t: 4700,
                kind: "http",
                phase: "start",
                id: 8,
                method: "GET",
                origin: "https://other.example.com",
                path: "/x",
            },
            { t: 4800, kind: "http", phase: "end", id: 8 },
            { t: 7700, kind: "step", phase: "end", id: 1 },
            { t: 7710, kind: "step", phase: "start", id: 9, name: "Deploy bundle" },
            {
                t: 7720,
                kind: "command",
                phase: "start",
                id: 10,
                command: "databricks.bundle.deploy",
            },
            {
                t: 7730,
                kind: "spawn",
                phase: "start",
                id: 11,
                file: cli,
                args: ["bundle", "deploy"],
                ours: true,
                cli: true,
            },
            { t: 9730, kind: "spawn", phase: "exit", id: 11, code: 0 },
            { t: 9740, kind: "command", phase: "end", id: 10 },
            { t: 12000, kind: "step", phase: "end", id: 9 },
        ],
        log: [],
    };
}

await test("summarize and metrics", async (t) => {
    const summary = summarize(startupTrace(), {
        extensionDir: "/sandbox/extensions/databricks.databricks-0.0.0",
        host: "https://ws.example.com/",
    });

    await t.test("time the load, activate() and the startup's calls from the host's start", () => {
        const m = metrics(summary);
        assert.equal(m["host start → extension load starts"], 200);
        assert.equal(m["extension load"], 360);
        assert.equal(m["activate()"], 13);
        assert.equal(m["activate() returned → connected"], 527);
        assert.equal(m["startup: bundle validate"], 1000);
        assert.equal(m["activate() returned → bundle summary ends"], 3047);
        assert.equal(m["startup: requests (count)"], 1);
        assert.equal(m["startup: CLI processes (count)"], 3);
    });

    await t.test(
        "time a step until its last call or command ended, not until it went quiet",
        () => {
            const m = metrics(summary);
            assert.equal(m["Deploy bundle"], 2030);
            assert.equal(m["Deploy bundle: CLI processes (count)"], 1);
        },
    );

    await t.test("count only the workspace's requests as the extension's", () => {
        assert.equal(summary.http.length, 1);
        assert.equal(summary.otherHttp, 1);
    });

    await t.test("list the calls of each step in order", () => {
        const text = timeline(summary);
        assert.match(text, /## startup/);
        assert.match(text, /CLI bundle summary \[waited, gap 10\]/);
    });

    await t.test("aggregate into a table of medians and their spread", () => {
        const table = metricsTable(aggregate([metrics(summary), metrics(summary)]));
        assert.match(table, /\| extension load \| 360 \| 360–360 \| 360–360 \| 2 \|/);
    });

    await t.test("time an activation from its trigger until activate() settled", () => {
        const trace = startupTrace();
        trace.events.splice(1, 0, {
            t: 1150,
            kind: "step",
            phase: "start",
            id: 99,
            name: "trigger: activate the extension",
        });
        trace.events.push({ t: 1595, kind: "step", phase: "end", id: 99 });
        const m = metrics(
            summarize(trace, {
                extensionDir: "/sandbox/extensions/databricks.databricks-0.0.0",
                host: "https://ws.example.com/",
            }),
        );
        assert.equal(m["trigger → extension load starts"], 50);
        assert.equal(m["trigger → activate() returned"], 433);
        assert.equal(m["trigger → activate() settled"], 440);
    });
});

await test("every scenario step compiles as the expression the host evaluates", () => {
    const params = {
        extensionDir: "/e",
        extensionId: "databricks.databricks",
        profile: "my-profile",
        pythonFile: "/p/src/main.py",
    };
    for (const [name, scenario] of Object.entries(SCENARIOS)) {
        for (const step of scenario.steps(params)) {
            assert.doesNotThrow(
                () => new vm.Script(stepExpression(step, params)),
                `${name}: ${step.name}`,
            );
        }
    }
});

await test("the hook runs from its own source, as the host gets it", () => {
    const source = `(${installHook.toString()})(${JSON.stringify({ extensionDir: "/e", host: "https://h" })})`;
    assert.doesNotThrow(() => new vm.Script(source));
    // It reaches modules through process.getBuiltinModule, never a bare require or import.
    assert.doesNotMatch(installHook.toString(), /(?<![.\w])require\(|\bimport\(/);
});

await test("projectFiles is a development target on the profile's host", () => {
    const files = projectFiles("https://ws.example.com");
    assert.match(files["databricks.yml"], /mode: development/);
    assert.match(files["databricks.yml"], /host: https:\/\/ws\.example\.com/);
    assert.ok(files["src/main.py"]);
});

await test("measureLoad", async (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "perf-test-"));
    const write = (file, content) => {
        fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
        fs.writeFileSync(path.join(dir, file), content);
    };
    write(
        "dist/extension.js",
        'require("vscode").window; require("./kernel/a.js"); require("heavy");',
    );
    write("dist/kernel/a.js", "module.exports = 1;");
    write("node_modules/heavy/index.js", 'require("./part.js"); module.exports = 2;');
    write("node_modules/heavy/part.js", "module.exports = 3;");
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

    await t.test("attributes the loaded files to packages", () => {
        const result = measureLoad(path.join(dir, "dist/extension.js"));
        assert.equal(result.modules, 4);
        assert.deepEqual(Object.keys(result.selfTimes).sort(), [
            "dist/extension.js",
            "dist/kernel",
            "heavy",
        ]);
    });

    await t.test("leaves a deferred package out", () => {
        write("dist/extension2.js", 'require("heavy"); require("heavy/part.js");');
        const result = measureLoad(path.join(dir, "dist/extension2.js"), { defer: ["heavy"] });
        assert.equal(result.modules, 1);
        assert.deepEqual(Object.keys(result.selfTimes), ["dist/extension2.js"]);
    });
});

await test("setupGap", async (t) => {
    const pinned = new Map(Object.entries(ACTIVATION_SETUP.dependencies));
    const reference = {
        platform: "linux",
        here: ACTIVATION_SETUP.machine,
        env: { DISPLAY: ":0" },
        vscodeVersion: ACTIVATION_SETUP.vscode,
        dependencies: pinned,
        required: [...pinned.keys()],
    };

    await t.test("has none on the reference setup", () => {
        assert.equal(setupGap(reference), undefined);
    });

    await t.test(
        "is elsewhere on another machine or system, where the baseline means nothing",
        () => {
            assert.match(setupGap({ ...reference, here: "Apple M3 ×8" }).elsewhere, /Apple M3 ×8/);
            assert.match(setupGap({ ...reference, platform: "darwin" }).elsewhere, /darwin/);
        },
    );

    await t.test(
        "is missing without VS Code at its version, or a dependency at its version",
        () => {
            assert.match(
                setupGap({ ...reference, vscodeVersion: undefined }).missing,
                /PERF_VSCODE/,
            );
            assert.match(setupGap({ ...reference, vscodeVersion: "1.141.0" }).missing, /1\.141\.0/);
            const older = new Map([...pinned, ["ms-python.python", "2025.1.0"]]);
            assert.match(
                setupGap({ ...reference, dependencies: older }).missing,
                /ms-python\.python 2026\.4\.0 .*found 2025\.1\.0/,
            );
        },
    );

    await t.test("is missing for a new dependency until its version is pinned", () => {
        assert.match(
            setupGap({ ...reference, required: [...pinned.keys(), "ms-toolsai.datawrangler"] })
                .missing,
            /ms-toolsai\.datawrangler has no version/,
        );
    });

    await t.test("is missing without a display or xvfb-run", () => {
        assert.match(setupGap({ ...reference, env: { PATH: "" } }).missing, /xvfb-run/);
    });
});

await test("cleanEnv keeps the shell's Databricks and VS Code variables from the sandbox", () => {
    const env = cleanEnv(
        { configFile: "/sandbox/databrickscfg", cacheDir: "/sandbox/cli-cache" },
        {
            PATH: "/bin",
            DATABRICKS_TOKEN: "dapi-secret",
            DATABRICKS_HOST: "https://elsewhere",
            DATABRICKS_CACHE_DIR: "/home/user/.cache/databricks",
            VSCODE_IPC_HOOK_CLI: "/tmp/hook",
            ELECTRON_RUN_AS_NODE: "1",
        },
    );
    assert.deepEqual(env, {
        PATH: "/bin",
        DATABRICKS_CONFIG_FILE: "/sandbox/databrickscfg",
        DATABRICKS_CACHE_DIR: "/sandbox/cli-cache",
    });
});

await test("readExtensionLog keeps each entry's message, not its data, and skips a half-written line", (t) => {
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), "perf-log-"));
    t.after(() => fs.rmSync(userData, { recursive: true, force: true }));
    const dir = path.join(userData, "logs", "20261019T000000", "exthost1", "databricks.databricks");
    fs.mkdirSync(dir, { recursive: true });
    const entry = (message) =>
        JSON.stringify({
            timestamp: "2026-10-19T00:00:01.000Z",
            level: "info",
            logger: "Extension",
            message,
            data: [{ body: "x" }],
        });
    fs.writeFileSync(
        path.join(dir, "sdk-and-extension-logs.json"),
        `${entry("Activated databricks")}\n${entry("Project databricks.yml")}\n{"timestamp": "2026-10`,
    );
    assert.deepEqual(readExtensionLog(userData, 0), [
        {
            t: Date.parse("2026-10-19T00:00:01.000Z"),
            level: "info",
            logger: "Extension",
            message: "Activated databricks",
        },
        {
            t: Date.parse("2026-10-19T00:00:01.000Z"),
            level: "info",
            logger: "Extension",
            message: "Project databricks.yml",
        },
    ]);
});
