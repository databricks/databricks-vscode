// `node scripts/perf/trace.mjs`: measures the extension in a real VS Code.
// Each run starts VS Code with its own user data and the extension host
// paused, installs the probes of hook.mjs before any extension loads, runs
// the scenario's steps, and writes what the probes saw to a JSON file. The first run warms up and isn't counted; the summary gives
// each metric's median and spread (p10–p90) over the others.
//
//   node scripts/perf/trace.mjs --scenario <activation|empty|startup|commands> --vscode <dir>
//       [--profile <name>] [--runs <n>] [--warm-up <n>] [--vsix <file>] [--steps <regexp>]
//       [--cold] [--fresh] [--summarize]
//   node scripts/perf/trace.mjs --compare <sandbox> <sandbox>
//
//   --scenario activation  a window without a folder or a profile: once the
//                        host's startup activations are over, the extension is
//                        activated through the API, with its extension
//                        pack's members installed; then it signs out.
//              empty     a window without a folder or a profile. If nothing
//                        activates the extension within 20 s, the step lists
//                        the chat models, as Copilot Chat does at startup.
//              startup   a bundle project whose target is the profile's
//                        workspace: activation, sign-in, validate and summary,
//                        then opening the Databricks sidebar, whose views list
//                        their first items.
//              commands  startup, then the most used commands:
//                        show the bundle logs, the compute picker, the
//                        sign-in wizard, the Python checks, deploy, Run File
//                        as Workflow on serverless, and destroy.
//                        After both, it destroys the bundle, deletes its
//                        workspace folder, which `bundle validate` creates
//                        even when nothing was deployed, and deletes the
//                        one-time runs the user started meanwhile, in case a
//                        step failed.
//   --vscode <dir>       an unpacked VS Code for Linux, the folder with its `code`
//                        binary, such as the e2e suite's
//                        packages/databricks-vscode-e2e/.wdio-vscode-service/vscode-linux-x64-<version>
//   --profile <name>     startup and commands: a profile of ~/.databrickscfg (or
//                        DATABRICKS_CONFIG_FILE), copied without its secrets as
//                        `yarn preview` copies it, plus `serverless_compute_id = auto`
//   --runs <n>           measured runs (default 5)
//   --warm-up <n>        runs before them that aren't counted (default 1)
//   --vsix <file>        the extension; default: the newest
//                        packages/databricks-vscode/.build/*.vsix (`yarn package`)
//   --steps <regexp>     runs only the first step (the startup) and the steps
//                        whose names match, such as "Sign in|Python"
//   --cold               starts every run as the first one after a reboot would
//                        for what the extension reads: new user data, an empty
//                        CLI cache, the project without .databricks/, and the
//                        extensions' files dropped from the page cache (python3)
//   --fresh              deletes the sandbox first
//   --summarize          only summarizes the sandbox's traces again (run-<n>.json)
//   --compare            the metrics of two sandboxes, before and after: each
//                        median's change, shown when it is larger than either
//                        side's spread (p10–p90), and not shown when it isn't
//
// The sandbox, ~/.cache/databricks-vscode-perf/<scenario> (or
// $DATABRICKS_PERF_DIR/<scenario>), holds the user data, the extensions, the
// config file, the CLI's cache (DATABRICKS_CACHE_DIR), the project, the traces
// (run-<n>.json), timeline.md and summary.json. Runs add up: without --fresh,
// a run is numbered after the sandbox's last one, and the summary covers them
// all, so before and after can be measured in alternating batches, each in
// its own sandbox. A sandbox holds the runs of one VSIX. Delete it when done.
// The extension's dependencies come from DATABRICKS_E2E_EXTENSIONS (their
// folders, as for the e2e suite) or ~/.vscode/extensions (VSCODE_EXTENSIONS).
// Without a display, VS Code runs under xvfb-run.
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
    copyProfile,
    dependencyClosure,
    extensionEntries,
    installedExtensions,
    withProfile,
} from "../preview/lib.mjs";
import { installHook } from "./hook.mjs";
import { projectFiles, SCENARIOS, stepExpression } from "./scenarios.mjs";
import {
    aggregate,
    compareRows,
    comparisonTable,
    metrics,
    metricsTable,
    summarize,
    timeline,
} from "./lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const extensionPackage = path.join(root, "packages/databricks-vscode");

function parseOptions(argv) {
    const { values, positionals } = parseArgs({
        args: argv,
        allowPositionals: true,
        options: {
            "scenario": { type: "string" },
            "vscode": { type: "string" },
            "profile": { type: "string" },
            "runs": { type: "string", default: "5" },
            "warm-up": { type: "string", default: "1" },
            "vsix": { type: "string" },
            "steps": { type: "string" },
            "cold": { type: "boolean", default: false },
            "fresh": { type: "boolean", default: false },
            "summarize": { type: "boolean", default: false },
            "compare": { type: "boolean", default: false },
        },
    });
    if (values.compare) {
        if (positionals.length !== 2) {
            throw new Error("--compare takes two sandboxes: before, then after");
        }
        return { compare: positionals };
    }
    if (positionals.length > 0) {
        throw new Error(`Unexpected arguments: ${positionals.join(" ")}`);
    }
    const runs = Number(values.runs);
    const warmUp = Number(values["warm-up"]);
    if (!Number.isInteger(runs) || runs < 1 || !Number.isInteger(warmUp) || warmUp < 0) {
        throw new Error(
            `--runs and --warm-up take whole numbers, not ${values.runs} and ${values["warm-up"]}`,
        );
    }
    return {
        ...values,
        vscode: values.vscode ?? process.env.PERF_VSCODE,
        steps: values.steps === undefined ? undefined : new RegExp(values.steps),
        runs,
        warmUp,
    };
}

/** The scenario's definition, after checking that the options suit it. */
function definitionOf(options) {
    const definition = SCENARIOS[options.scenario ?? ""];
    if (definition === undefined) {
        throw new Error(`--scenario takes one of ${Object.keys(SCENARIOS).join(", ")}`);
    }
    if (definition.profile && !options.profile) {
        throw new Error(`--scenario ${options.scenario} takes --profile <name>`);
    }
    if (!options.vscode || !fs.existsSync(path.join(options.vscode, "code"))) {
        throw new Error(
            "--vscode takes an unpacked VS Code for Linux (the folder with the `code` binary)",
        );
    }
    return definition;
}

/** The user's config file, as the CLI resolves it. */
function userConfigFile() {
    return process.env.DATABRICKS_CONFIG_FILE ?? path.join(os.homedir(), ".databrickscfg");
}

/** The extensions to copy into the sandbox, by lower-case ID: `{dir, manifest}`. */
export function sourceExtensions() {
    const found = new Map();
    const folders = (process.env.DATABRICKS_E2E_EXTENSIONS ?? "")
        .split(path.delimiter)
        .filter((f) => f !== "");
    if (folders.length > 0) {
        for (const dir of folders) {
            const manifest = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf-8"));
            found.set(`${manifest.publisher}.${manifest.name}`.toLowerCase(), { dir, manifest });
        }
        return found;
    }
    const dir = process.env.VSCODE_EXTENSIONS ?? path.join(os.homedir(), ".vscode", "extensions");
    for (const [id, { folder, manifest }] of installedExtensions(dir)) {
        found.set(id, { dir: path.join(dir, folder), manifest });
    }
    return found;
}

/** Copies the dependencies in once, installs the VSIX, and returns the installed extension's folder. */
function prepareExtensions(sandbox, options) {
    const extensions = path.join(sandbox, "extensions");
    fs.mkdirSync(extensions, { recursive: true });
    const manifest = JSON.parse(
        fs.readFileSync(path.join(extensionPackage, "package.json"), "utf-8"),
    );
    const dependencies = manifest.extensionPack ?? [];
    const { needed, missing } = dependencyClosure(dependencies, sourceExtensions());
    const required = missing.filter((id) => dependencies.map((d) => d.toLowerCase()).includes(id));
    if (required.length > 0) {
        throw new Error(
            `${required.join(", ")} not found. Set DATABRICKS_E2E_EXTENSIONS to their folders, or install them in ~/.vscode/extensions.`,
        );
    }
    const entriesFile = path.join(extensions, "extensions.json");
    const existing = fs.existsSync(entriesFile)
        ? JSON.parse(fs.readFileSync(entriesFile, "utf-8"))
        : [];
    const copied = [];
    for (const [id, { dir, manifest: m }] of needed) {
        const folder = `${id}-${m.version}`;
        if (!fs.existsSync(path.join(extensions, folder))) {
            fs.cpSync(dir, path.join(extensions, folder), {
                recursive: true,
                verbatimSymlinks: true,
            });
        }
        copied.push({ folder, manifest: m });
    }
    fs.writeFileSync(
        entriesFile,
        JSON.stringify(extensionEntries(existing, copied, [], extensions)),
    );

    const vsix = options.vsix ?? newestVsix();
    execFileSync(
        path.join(options.vscode, "bin", "code"),
        [
            `--user-data-dir=${path.join(sandbox, "user-data")}`,
            `--extensions-dir=${extensions}`,
            "--install-extension",
            vsix,
            "--force",
        ],
        { stdio: ["ignore", "ignore", "inherit"], env: cleanEnv() },
    );
    const installed = fs
        .readdirSync(extensions)
        .find((f) => f.startsWith(`${manifest.publisher}.${manifest.name}-`));
    if (installed === undefined) {
        throw new Error(`${vsix} didn't install into ${extensions}`);
    }
    return {
        extensionDir: path.join(extensions, installed),
        dependencyDirs: copied.map(({ folder }) => path.join(extensions, folder)),
        dependencies: Object.fromEntries(
            copied.map(({ manifest: m }) => [`${m.publisher}.${m.name}`.toLowerCase(), m.version]),
        ),
        vsix,
    };
}

function newestVsix() {
    const dir = path.join(extensionPackage, ".build");
    const files = (fs.existsSync(dir) ? fs.readdirSync(dir) : [])
        .filter((f) => f.endsWith(".vsix"))
        .map((f) => path.join(dir, f))
        .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    if (files.length === 0) {
        throw new Error(
            "No VSIX in packages/databricks-vscode/.build. Run `yarn package`, or pass --vsix.",
        );
    }
    return files[0];
}

/** The sandbox's settings: nothing that phones home or updates itself while it is measured. */
function writeSettings(userData) {
    fs.mkdirSync(path.join(userData, "User"), { recursive: true });
    fs.writeFileSync(
        path.join(userData, "User", "settings.json"),
        JSON.stringify(
            {
                "telemetry.telemetryLevel": "off",
                "workbench.startupEditor": "none",
                "update.mode": "none",
                "extensions.autoUpdate": false,
                "extensions.autoCheckUpdates": false,
                "security.workspace.trust.enabled": false,
                "workbench.enableExperiments": false,
            },
            undefined,
            4,
        ),
    );
}

/** The sandbox's config file: the profile without its secrets, and serverless compute. Returns the profile's host. */
function writeConfig(configFile, profile) {
    if (profile === undefined) {
        fs.writeFileSync(configFile, "", { mode: 0o600 });
        return undefined;
    }
    const userConfig = userConfigFile();
    const section = copyProfile(
        fs.existsSync(userConfig) ? fs.readFileSync(userConfig, "utf-8") : "",
        profile,
    );
    if (!section) {
        throw new Error(`${userConfig} has no profile "${profile}"`);
    }
    const host = /^host\s*=\s*(.+)$/m.exec(section)?.[1]?.trim();
    if (!host) {
        throw new Error(`Profile "${profile}" has no host`);
    }
    const serverless = section.replace(/^serverless_compute_id\s*=.*\n?/m, "").trimEnd();
    fs.writeFileSync(
        configFile,
        withProfile("", profile, `${serverless}\nserverless_compute_id = auto\n`),
        {
            mode: 0o600,
        },
    );
    return host;
}

/**
 * What VS Code and the CLI run with: none of the shell's DATABRICKS_* or
 * VSCODE_*, and the sandbox's config file and CLI cache, so a run neither
 * reads nor fills the user's.
 */
export function cleanEnv({ configFile, cacheDir } = {}, base = process.env) {
    const env = Object.fromEntries(
        Object.entries(base).filter(
            ([key]) => !/^(DATABRICKS_|VSCODE_|ELECTRON_RUN_AS_NODE$)/.test(key),
        ),
    );
    if (configFile !== undefined) {
        env.DATABRICKS_CONFIG_FILE = configFile;
    }
    if (cacheDir !== undefined) {
        env.DATABRICKS_CACHE_DIR = cacheDir;
    }
    return env;
}

/**
 * Drops the files under `dirs` from the OS page cache, so that the next run
 * reads them from disk, as the first one after a reboot does. Python's
 * posix_fadvise does it without root, for these files only; it can't drop
 * pages not yet written, so each file is flushed first.
 */
function dropFromPageCache(dirs) {
    const script = [
        "import os, sys",
        "for top in sys.argv[1:]:",
        "    for d, _, files in os.walk(top):",
        "        for f in files:",
        "            try:",
        "                fd = os.open(os.path.join(d, f), os.O_RDONLY)",
        "            except OSError:",
        "                continue",
        "            os.fdatasync(fd)",
        "            os.posix_fadvise(fd, 0, 0, os.POSIX_FADV_DONTNEED)",
        "            os.close(fd)",
    ].join("\n");
    execFileSync("python3", ["-I", "-c", script, ...dirs], { stdio: "inherit" });
}

function freePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.on("error", reject);
        server.listen(0, "127.0.0.1", () => {
            const { port } = server.address();
            server.close(() => resolve(port));
        });
    });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** A minimal Chrome DevTools Protocol client over the inspector's WebSocket. */
async function inspect(port, deadlineMs) {
    const started = Date.now();
    let target;
    while (target === undefined) {
        try {
            target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json())[0];
        } catch {
            if (Date.now() - started > deadlineMs) {
                throw new Error("The extension host's inspector didn't open");
            }
            await sleep(50);
        }
    }
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
        socket.addEventListener("open", resolve, { once: true });
        socket.addEventListener("error", reject, { once: true });
    });
    let seq = 0;
    const pending = new Map();
    socket.addEventListener("message", (message) => {
        const reply = JSON.parse(message.data);
        pending.get(reply.id)?.(reply);
        pending.delete(reply.id);
    });
    const send = (method, params = {}) =>
        new Promise((resolve) => {
            const id = ++seq;
            pending.set(id, resolve);
            socket.send(JSON.stringify({ id, method, params }));
        });
    // While the host waits for the debugger no microtask runs, so nothing may be awaited then.
    const evaluate = async (expression, { awaitPromise = true } = {}) => {
        const reply = await send("Runtime.evaluate", {
            expression,
            awaitPromise,
            returnByValue: true,
        });
        const details = reply.result?.exceptionDetails ?? reply.error;
        if (details !== undefined) {
            throw new Error(
                details.exception?.description ?? details.text ?? JSON.stringify(details),
            );
        }
        return reply.result?.result?.value;
    };
    return { send, evaluate, close: () => socket.close() };
}

/** The extension's own log of this session (`sdk-and-extension-logs.json`), without the entries' data. */
export function readExtensionLog(userData, since) {
    const found = [];
    const visit = (dir) => {
        for (const entry of fs.existsSync(dir)
            ? fs.readdirSync(dir, { withFileTypes: true })
            : []) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                visit(full);
            } else if (entry.name === "sdk-and-extension-logs.json") {
                found.push(full);
            }
        }
    };
    visit(path.join(userData, "logs"));
    const file = found
        .filter((f) => fs.statSync(f).mtimeMs >= since)
        .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
    if (file === undefined) {
        return [];
    }
    // The extension is still running: its last line may be half written.
    return fs
        .readFileSync(file, "utf-8")
        .split("\n")
        .flatMap((line) => {
            try {
                const { timestamp, level, logger, message } = JSON.parse(line);
                return [
                    {
                        t: Date.parse(timestamp),
                        level,
                        logger,
                        message: String(message).slice(0, 200),
                    },
                ];
            } catch {
                return [];
            }
        });
}

/** One run: VS Code from launch to the last step, then closed. */
async function traceRun({ options, steps, sandbox, extensionDir, host, env, folder, params, log }) {
    const userData = path.join(sandbox, "user-data");
    const port = await freePort();
    const code = path.join(options.vscode, "code");
    const args = [
        "--no-sandbox",
        "--disable-gpu",
        "--new-window",
        `--user-data-dir=${userData}`,
        `--extensions-dir=${path.join(sandbox, "extensions")}`,
        `--inspect-brk-extensions=${port}`,
        "--skip-welcome",
        "--skip-release-notes",
        "--disable-workspace-trust",
        ...(folder ? [folder] : []),
    ];
    const headless = process.platform === "linux" && !process.env.DISPLAY;
    const launchedAt = Date.now();
    const child = spawn(headless ? "xvfb-run" : code, headless ? ["-a", code, ...args] : args, {
        env,
        detached: true,
        stdio: ["ignore", log, log],
    });
    const exited = new Promise((resolve) => child.once("exit", resolve));
    // The process group: xvfb-run, Xvfb and every VS Code process.
    const group = child.pid === undefined ? undefined : -child.pid;
    const stop = async () => {
        if (group === undefined) {
            return;
        }
        try {
            process.kill(group, "SIGTERM");
        } catch {
            return;
        }
        const grace = new Promise((resolve) => setTimeout(resolve, 10_000).unref());
        if ((await Promise.race([exited.then(() => true), grace])) !== true) {
            try {
                process.kill(group, "SIGKILL");
            } catch {
                // Already gone.
            }
        }
    };
    let inspector;
    try {
        inspector = await inspect(port, 120_000);
        const paused = { awaitPromise: false };
        await inspector.evaluate(
            `(${installHook.toString()})(${JSON.stringify({ extensionDir, host })})`,
            paused,
        );
        const resumedAt = await inspector.evaluate(
            "performance.timeOrigin + performance.now()",
            paused,
        );
        await inspector.send("Runtime.runIfWaitingForDebugger");
        // Node finishes its bootstrap after the host resumes, and timers fail until then: wait
        // for the first event, an extension loading, before a step may use them.
        const deadline = Date.now() + 120_000;
        while ((await inspector.evaluate("globalThis.__perf.events.length", paused)) === 0) {
            if (Date.now() > deadline) {
                throw new Error("No extension loaded within 2 minutes of the host's start");
            }
            await sleep(100);
        }
        const timedOut = [];
        for (const step of steps) {
            let timer;
            const outcome = await Promise.race([
                inspector.evaluate(stepExpression(step, params)).then(() => "done"),
                new Promise((resolve) => {
                    timer = setTimeout(() => resolve("timed out"), step.timeoutMs);
                }),
            ]);
            clearTimeout(timer);
            if (outcome !== "done") {
                options.log(`  step "${step.name}" ${outcome}`);
                timedOut.push(step.name);
            }
        }
        const events = JSON.parse(
            await inspector.evaluate("JSON.stringify(globalThis.__perf.events)"),
        );
        return {
            launchedAt,
            resumedAt,
            events,
            log: readExtensionLog(userData, launchedAt),
            timedOut,
        };
    } finally {
        inspector?.close();
        await stop();
    }
}

/**
 * After the scenarios that open the bundle: destroys it, deletes its folder
 * in the workspace, which `bundle validate` creates even when nothing was
 * deployed, and deletes the one-time runs of its files that the user started
 * since `since`, in case a step failed before the commands scenario's own
 * destroy ran.
 */
function cleanUpWorkspace({ cli, env, profile, projectDir, since }) {
    const run = (args, opts = {}) =>
        execFileSync(cli, [...args, "--profile", profile], { env, ...opts });
    run(["bundle", "destroy", "--auto-approve", "--target", "dev"], {
        cwd: projectDir,
        stdio: "inherit",
    });
    const me = JSON.parse(
        run(["current-user", "me", "-o", "json"], { encoding: "utf-8" }),
    ).userName;
    try {
        run(["workspace", "delete", "--recursive", `/Workspace/Users/${me}/.bundle/perf-trace`], {
            stdio: "pipe",
        });
    } catch (error) {
        if (!/doesn't exist/.test(String(error.stderr))) {
            throw error;
        }
    }
    const runs = JSON.parse(
        run(
            [
                "jobs",
                "list-runs",
                "--run-type",
                "SUBMIT_RUN",
                "--expand-tasks",
                "--start-time-from",
                String(since),
                "-o",
                "json",
            ],
            { encoding: "utf-8" },
        ) || "[]",
    );
    const ours = (r) =>
        r.creator_user_name === me && JSON.stringify(r.tasks ?? []).includes("/perf-trace/");
    for (const r of runs.filter(ours)) {
        run(["jobs", "delete-run", String(r.run_id)]);
        console.log(`Deleted one-time run ${r.run_id}`);
    }
}

/** The numbers of a sandbox's run-<n>.json traces, in order. */
function runNumbers(sandbox) {
    return (fs.existsSync(sandbox) ? fs.readdirSync(sandbox) : [])
        .map((f) => /^run-(\d+)\.json$/.exec(f)?.[1])
        .filter((n) => n !== undefined)
        .map(Number)
        .sort((a, b) => a - b);
}

/** What makes runs comparable: the same build, VS Code, dependencies and kind of run. */
function setupOf(meta) {
    const { vsixSha256, vscode, dependencies, cold, steps } = meta;
    return JSON.stringify({ vsixSha256, vscode, dependencies, cold, steps });
}

/**
 * The run-<n>.json traces of a sandbox, summarized again with this
 * checkout's lib.mjs. Refuses a sandbox whose runs aren't comparable.
 */
function summarizeSandbox(sandbox) {
    const traces = runNumbers(sandbox).map((n) =>
        JSON.parse(fs.readFileSync(path.join(sandbox, `run-${n}.json`), "utf-8")),
    );
    if (traces.length === 0) {
        throw new Error(`No run-<n>.json in ${sandbox}`);
    }
    const { meta } = traces[0];
    if (new Set(traces.map((t) => setupOf(t.meta))).size > 1) {
        throw new Error(
            `${sandbox} mixes runs of different builds or kinds of run; measure each in a sandbox of its own`,
        );
    }
    return {
        meta,
        summaries: traces.map((trace) =>
            summarize(trace, {
                extensionDir: meta.extensionDir,
                host: meta.host,
                dependencyDirs: meta.dependencyDirs,
            }),
        ),
    };
}

/** Writes summary.json and timeline.md (of the last run), and prints the metrics. */
function report(sandbox, meta, summaries) {
    const rows = aggregate(summaries.map(metrics));
    fs.writeFileSync(
        path.join(sandbox, "summary.json"),
        JSON.stringify({ meta, metrics: rows, summaries }, undefined, 1),
    );
    fs.writeFileSync(path.join(sandbox, "timeline.md"), timeline(summaries.at(-1)));
    console.log(
        `\n${JSON.stringify(meta)}\n\n${metricsTable(rows)}\n\nTraces, timeline.md and summary.json are in ${sandbox}`,
    );
}

/** The bundle project, written again: a cold run starts without the .databricks/ a run leaves. */
function writeProject(folder, host) {
    fs.rmSync(folder, { recursive: true, force: true });
    for (const [file, content] of Object.entries(projectFiles(host))) {
        fs.mkdirSync(path.dirname(path.join(folder, file)), { recursive: true });
        fs.writeFileSync(path.join(folder, file), content);
    }
}

/**
 * Runs a scenario: `runs` measured runs, after `warmUp` runs that aren't
 * counted, in `sandbox` (see the top of this file for the other options).
 * Returns the summaries of every run the sandbox holds, and what went wrong:
 * steps that timed out, and a failed clean-up.
 */
export async function traceScenario(options) {
    const definition = definitionOf(options);
    const { sandbox, log = console.log } = options;
    const userData = path.join(sandbox, "user-data");
    const vscodeVersion = JSON.parse(
        fs.readFileSync(path.join(options.vscode, "resources/app/package.json"), "utf-8"),
    ).version;
    // VS Code listens on a socket in the user data, and a Unix socket's path has 107 characters at most.
    const socket = path.join(userData, `${vscodeVersion.slice(0, 4)}-main.sock`);
    if (socket.length > 107) {
        throw new Error(
            `${sandbox} is too deep for VS Code's socket (${socket.length} > 107 characters); set DATABRICKS_PERF_DIR to a shorter folder`,
        );
    }
    if (options.fresh) {
        fs.rmSync(sandbox, { recursive: true, force: true });
    }
    fs.mkdirSync(sandbox, { recursive: true });
    const { extensionDir, dependencyDirs, dependencies, vsix } = prepareExtensions(
        sandbox,
        options,
    );
    const configFile = path.join(sandbox, "databrickscfg");
    const cacheDir = path.join(sandbox, "cli-cache");
    const env = cleanEnv({ configFile, cacheDir });
    const host = writeConfig(configFile, definition.profile ? options.profile : undefined);
    const folder = definition.folder ? path.join(sandbox, "project") : undefined;
    const installed = JSON.parse(fs.readFileSync(path.join(extensionDir, "package.json"), "utf-8"));
    const params = {
        extensionDir,
        extensionId: `${installed.publisher}.${installed.name}`,
        profile: options.profile ?? "",
        pythonFile: folder ? path.join(folder, "src", "main.py") : "",
    };
    const steps = definition
        .steps(params)
        .filter(
            (step, i) => i === 0 || options.steps === undefined || options.steps.test(step.name),
        );
    const cli = path.join(
        extensionDir,
        "bin",
        process.platform === "win32" ? "databricks.exe" : "databricks",
    );
    const meta = {
        scenario: options.scenario,
        date: new Date().toISOString(),
        commit: execFileSync("git", ["rev-parse", "--short", "HEAD"], {
            cwd: root,
            encoding: "utf-8",
        }).trim(),
        vscode: vscodeVersion,
        cli: /\d+\.\d+\.\d+/.exec(execFileSync(cli, ["version"], { encoding: "utf-8" }))?.[0],
        vsix: path.basename(vsix),
        vsixSha256: createHash("sha256").update(fs.readFileSync(vsix)).digest("hex"),
        dependencies,
        cold: options.cold,
        steps: options.steps?.source,
        machine: `${os.cpus()[0]?.model ?? "?"} ×${os.cpus().length}, ${Math.round(os.totalmem() / 2 ** 30)} GB, ${os.platform()} ${os.release()}`,
        host,
        extensionDir,
        dependencyDirs,
    };
    if (!options.cold) {
        writeSettings(userData);
        if (folder !== undefined && !fs.existsSync(folder)) {
            writeProject(folder, host);
        }
    }
    const output = fs.openSync(path.join(sandbox, "vscode.log"), "a");
    const problems = [];
    const first = (runNumbers(sandbox).at(-1) ?? 0) + 1;
    const started = Date.now();
    try {
        for (let i = 1 - options.warmUp; i <= options.runs; i++) {
            const n = first + i - 1;
            log(
                `${options.scenario}: ${i < 1 ? `warm-up ${i + options.warmUp}/${options.warmUp}` : `run ${n} (${i}/${options.runs})`}`,
            );
            if (options.cold) {
                fs.rmSync(userData, { recursive: true, force: true });
                fs.rmSync(cacheDir, { recursive: true, force: true });
                writeSettings(userData);
                if (folder !== undefined) {
                    writeProject(folder, host);
                }
                dropFromPageCache([path.join(sandbox, "extensions")]);
            }
            const trace = await traceRun({
                options: { ...options, log },
                steps,
                sandbox,
                extensionDir,
                host,
                env,
                folder,
                params,
                log: output,
            });
            fs.writeFileSync(
                path.join(sandbox, i < 1 ? `warm-up-${i + options.warmUp}.json` : `run-${n}.json`),
                JSON.stringify({ meta, ...trace }),
            );
            if (trace.timedOut.length > 0) {
                problems.push(
                    `run ${i < 1 ? "warm-up" : n}: ${trace.timedOut.join(", ")} timed out`,
                );
            }
        }
    } finally {
        fs.closeSync(output);
        if (definition.profile) {
            try {
                cleanUpWorkspace({
                    cli,
                    env,
                    profile: options.profile,
                    projectDir: folder,
                    since: started,
                });
            } catch (error) {
                problems.push(
                    `Cleaning up failed: ${String(error)}. Check the workspace for the bundle perf-trace and its one-time runs.`,
                );
            }
        }
    }
    return { ...summarizeSandbox(sandbox), problems };
}

async function main() {
    const options = parseOptions(process.argv.slice(2));
    if (options.compare) {
        const [before, after] = options.compare.map((sandbox) => summarizeSandbox(sandbox));
        for (const [label, { meta, summaries }] of [
            ["Before", before],
            ["After", after],
        ]) {
            console.log(
                `${label}: ${meta.vsix} (sha256 ${meta.vsixSha256?.slice(0, 12)}), ${summaries.length} runs${meta.cold ? ", cold" : ""}`,
            );
        }
        const rows = (side) => aggregate(side.summaries.map(metrics));
        console.log(`\n${comparisonTable(compareRows(rows(before), rows(after)))}`);
        return;
    }
    const sandbox = path.join(
        process.env.DATABRICKS_PERF_DIR ??
            path.join(os.homedir(), ".cache", "databricks-vscode-perf"),
        options.scenario ?? "",
    );
    if (options.summarize) {
        const { meta, summaries } = summarizeSandbox(sandbox);
        report(sandbox, meta, summaries);
        return;
    }
    const { meta, summaries, problems } = await traceScenario({ ...options, sandbox });
    report(sandbox, meta, summaries);
    for (const problem of problems) {
        // Not thrown: the traces are written, and the report says what they hold.
        console.error(problem);
        process.exitCode = 1;
    }
}

if (import.meta.main) {
    await main();
}
