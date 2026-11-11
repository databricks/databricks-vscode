// Starts, inspects, and stops a long-lived VS Code session that an MCP client
// (the WebdriverIO MCP server) can attach to. See
// src/test/e2e/agent-session/README.md for how the pieces fit together.
//
//   agent-session.mjs start [--workspace <dir>] [--mode dev|vsix]
//                           [--vscode-version <version>] [--fresh] [--foreground]
//   agent-session.mjs status        # session.json, or exit 1 if none is live
//   agent-session.mjs exec '<function expression>' [jsonArg ...]
//   agent-session.mjs restart       # stop, then start with the same options
//   agent-session.mjs show | hide   # macOS: bring the test window up, or hide it
//   agent-session.mjs stop
//   agent-session.mjs logs          # where to look when something is off
//
// stdout carries only JSON, so callers can parse it; progress goes to stderr.
import {execFileSync, spawn} from "node:child_process";
import {
    closeSync,
    existsSync,
    mkdirSync,
    openSync,
    readFileSync,
    readdirSync,
    renameSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import {createRequire} from "node:module";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {setTimeout as sleep} from "node:timers/promises";
import {createHash, randomUUID} from "node:crypto";

const require = createRequire(import.meta.url);
const packageRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    ".."
);
const sessionDir = path.resolve(
    process.env.AGENT_SESSION_DIR ||
        path.join(packageRoot, "tmp", "agent-session")
);
// Downloaded VS Code and chromedriver builds are immutable per version, so
// every checkout and worktree shares one cache.
const cacheDir = path.resolve(
    process.env.AGENT_SESSION_CACHE_DIR ||
        path.join(os.homedir(), ".cache", "databricks-vscode", "wdio")
);
// VS Code's IPC socket lives under the user data dir and macOS caps socket
// paths at 104 bytes, so keep it short. One per session dir, so worktrees
// don't share editor state.
const userDataDir = path.join(
    os.tmpdir(),
    `dbx-vsc-${createHash("sha256")
        .update(sessionDir)
        .digest("hex")
        .slice(0, 8)}`
);
const files = {
    launcher: path.join(sessionDir, "launcher.json"),
    session: path.join(sessionDir, "session.json"),
    stop: path.join(sessionDir, "stop"),
    log: path.join(sessionDir, "wdio.log"),
    requests: path.join(sessionDir, "requests"),
    responses: path.join(sessionDir, "responses"),
};

function fail(message) {
    console.error(message);
    process.exit(1);
}

function readJson(file) {
    try {
        return JSON.parse(readFileSync(file, "utf-8"));
    } catch {
        return undefined;
    }
}

function isAlive(pid) {
    if (!pid) {
        return false;
    }
    try {
        process.kill(pid, 0);
        return true;
    } catch (e) {
        return e.code === "EPERM";
    }
}

function liveSession() {
    const launcher = readJson(files.launcher);
    if (!isAlive(launcher?.pid)) {
        return undefined;
    }
    return {launcher, session: readJson(files.session)};
}

function parseFlags(args, spec) {
    const flags = {};
    for (let i = 0; i < args.length; i++) {
        const name = args[i].replace(/^--/, "");
        if (!args[i].startsWith("--") || !(name in spec)) {
            fail(`Unknown argument '${args[i]}'`);
        }
        if (spec[name] === "boolean") {
            flags[name] = true;
        } else {
            const value = args[++i];
            if (value === undefined || value.startsWith("--")) {
                fail(`--${name} needs a value`);
            }
            flags[name] = value;
        }
    }
    return flags;
}

function wdioCli() {
    // WDIO 9 exports its entry point but keeps package.json private.
    let root = path.dirname(require.resolve("@wdio/cli"));
    while (!existsSync(path.join(root, "bin", "wdio.js"))) {
        const parent = path.dirname(root);
        if (parent === root) {
            fail("Cannot locate the WebdriverIO CLI executable");
        }
        root = parent;
    }
    return path.join(root, "bin", "wdio.js");
}

function tail(file, lines = 40) {
    try {
        return readFileSync(file, "utf-8").split("\n").slice(-lines).join("\n");
    } catch {
        return "(no log)";
    }
}

function terminate(pid, signal = "SIGTERM") {
    // The launcher leads its own process group (detached), so this also
    // reaches the worker, chromedriver, and VS Code — including any of them
    // the launcher left behind when it exited.
    try {
        process.kill(process.platform === "win32" ? pid : -pid, signal);
    } catch {
        // Already gone.
    }
}

// On macOS the test editor is a normal app window: it takes focus when it
// launches and sits where a click or keypress meant for something else can
// land. WebDriver input is synthesized inside the renderer, so a hidden
// (Cmd+H) window still takes clicks and keys and renders screenshots.
// Linux has no equivalent; run it under Xvfb instead.
function osascript(script) {
    return execFileSync("osascript", ["-e", script], {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 10_000,
    }).trim();
}

function frontmostPid() {
    try {
        return Number(
            osascript(
                'tell application "System Events" to get unix id of first process whose frontmost is true'
            )
        );
    } catch {
        return undefined;
    }
}

/** The test editor's main process: in the launcher's group, not a helper. */
function editorPid(launcherPid) {
    const ps = execFileSync("ps", ["-axo", "pid=,pgid=,command="], {
        encoding: "utf-8",
    });
    for (const line of ps.split("\n")) {
        const [pid, pgid, ...command] = line.trim().split(/\s+/);
        const cmd = command.join(" ");
        // The executable is everything before the first flag (its path has
        // spaces). This skips wdio-vscode-service's node wrapper, whose
        // arguments name the app, and Electron's helper processes.
        const executable = cmd.split(" --")[0];
        if (
            Number(pgid) === launcherPid &&
            /\.app\/Contents\/MacOS\/[^/]+$/.test(executable) &&
            !executable.includes("Helper") &&
            !cmd.includes("--type=")
        ) {
            return Number(pid);
        }
    }
    return undefined;
}

async function setEditorVisible(launcherPid, visible, restoreFocusTo) {
    // System Events can lag behind the process by a moment after launch.
    for (let attempt = 0; attempt < 20; attempt++) {
        const pid = editorPid(launcherPid);
        try {
            if (!pid) {
                throw new Error("editor process not found");
            }
            const target = `(first process whose unix id is ${pid})`;
            osascript(
                visible
                    ? `tell application "System Events" to set frontmost of ${target} to true`
                    : `tell application "System Events" to set visible of ${target} to false`
            );
            if (!visible && restoreFocusTo && restoreFocusTo !== pid) {
                osascript(
                    `tell application "System Events" to set frontmost of (first process whose unix id is ${restoreFocusTo}) to true`
                );
            }
            return true;
        } catch (e) {
            if (attempt === 19) {
                console.error(
                    `Could not ${visible ? "show" : "hide"} the test window (${
                        e.message.split("\n")[0]
                    }). macOS may be waiting for you to allow Automation of System Events for your terminal.`
                );
            }
            await sleep(250);
        }
    }
    return false;
}

async function start(args) {
    const flags = parseFlags(args, {
        "workspace": "string",
        "mode": "string",
        "vscode-version": "string",
        "fresh": "boolean",
        "timeout": "string",
        "foreground": "boolean",
    });
    const live = liveSession();
    if (
        live?.session &&
        flags.workspace &&
        path.resolve(flags.workspace) !== live.session.workspacePath
    ) {
        fail(
            `A session is already running on ${
                live.session.workspacePath
            }. Run stop first to open ${path.resolve(flags.workspace)}.`
        );
    }
    if (live?.session) {
        console.error("A session is already running; reusing it.");
        console.log(JSON.stringify(live.session, null, 2));
        return;
    }
    if (live) {
        fail(
            `A session is still starting (pid ${live.launcher.pid}). Run status, or stop and retry. Log: ${files.log}`
        );
    }
    const mode = flags.mode ?? "dev";
    if (!["dev", "vsix"].includes(mode)) {
        fail("--mode must be dev or vsix");
    }
    if (flags.fresh) {
        rmSync(sessionDir, {recursive: true, force: true});
        rmSync(userDataDir, {recursive: true, force: true});
    }
    for (const file of [files.session, files.stop, files.launcher]) {
        rmSync(file, {force: true});
    }
    for (const dir of [files.requests, files.responses]) {
        rmSync(dir, {recursive: true, force: true});
    }
    mkdirSync(sessionDir, {recursive: true});
    const workspace = path.resolve(
        flags.workspace ?? path.join(sessionDir, "workspace")
    );
    mkdirSync(workspace, {recursive: true});

    const env = {
        ...process.env,
        PATH: `${path.dirname(process.execPath)}${path.delimiter}${
            process.env.PATH || ""
        }`,
        AGENT_SESSION_DIR: sessionDir,
        AGENT_SESSION_WORKSPACE: workspace,
        AGENT_SESSION_USER_DATA: userDataDir,
        AGENT_SESSION_CACHE_DIR: cacheDir,
        AGENT_SESSION_MODE: mode,
    };
    if (flags["vscode-version"]) {
        env.AGENT_SESSION_VSCODE_VERSION = flags["vscode-version"];
    }
    const background = process.platform === "darwin" && !flags.foreground;
    const previousFront = background ? frontmostPid() : undefined;
    const log = openSync(files.log, "w");
    const child = spawn(
        process.execPath,
        [
            wdioCli(),
            "run",
            "src/test/e2e/agent-session/wdio.conf.ts",
            "--tsConfigPath",
            "src/test/e2e/tsconfig.json",
        ],
        {cwd: packageRoot, env, detached: true, stdio: ["ignore", log, log]}
    );
    closeSync(log);
    child.unref();
    writeFileSync(
        files.launcher,
        JSON.stringify({
            pid: child.pid,
            mode,
            workspace,
            // What `restart` replays; --fresh is deliberately not kept.
            startArgs: args.filter((arg) => arg !== "--fresh"),
            startedAt: new Date(),
        })
    );
    console.error(
        `Starting VS Code (${mode} mode, workspace ${workspace}). The first run downloads VS Code and extensions. Log: ${files.log}`
    );

    // First runs download VS Code, chromedriver, and four marketplace
    // extensions, so allow far longer than a warm start needs.
    const deadline = Date.now() + Number(flags.timeout ?? 600) * 1000;
    while (Date.now() < deadline) {
        const session = readJson(files.session);
        if (session) {
            if (background) {
                await setEditorVisible(child.pid, false, previousFront);
            }
            console.log(JSON.stringify(session, null, 2));
            return;
        }
        if (!isAlive(child.pid)) {
            terminate(child.pid, "SIGKILL");
            fail(
                `The session exited before VS Code was ready:\n${tail(
                    files.log
                )}`
            );
        }
        await sleep(500);
    }
    terminate(child.pid, "SIGKILL");
    fail(
        `VS Code was not ready within ${flags.timeout ?? 600}s:\n${tail(
            files.log
        )}`
    );
}

function status() {
    const live = liveSession();
    if (!live?.session) {
        fail(
            live
                ? `Starting (pid ${live.launcher.pid}); see ${files.log}`
                : "No agent session is running."
        );
    }
    console.log(JSON.stringify(live.session, null, 2));
}

async function exec(args) {
    const [source, ...rawArgs] = args;
    if (!source) {
        fail(
            "Usage: exec '<function expression>' [jsonArg ...], e.g. exec 'async (vscode) => vscode.version'"
        );
    }
    try {
        // Compile here so a syntax error is reported before anything runs.
        if (typeof new Function(`return (${source});`)() !== "function") {
            throw new Error("it does not evaluate to a function");
        }
    } catch (e) {
        fail(
            `The code must be a function expression of (vscode, ...args): ${e.message}`
        );
    }
    let fnArgs;
    try {
        fnArgs = rawArgs.map((arg) => JSON.parse(arg));
    } catch {
        fail(
            "Each argument after the function must be JSON, e.g. '\"text\"' or '{\"a\":1}'"
        );
    }
    if (!liveSession()?.session) {
        fail("No agent session is running. Run start first.");
    }
    const id = `${Date.now()}-${randomUUID()}.json`;
    const request = path.join(files.requests, id);
    writeFileSync(
        `${request}.tmp`,
        JSON.stringify({fn: `(${source})`, args: fnArgs}),
        {
            mode: 0o600,
        }
    );
    renameSync(`${request}.tmp`, request);
    const response = path.join(files.responses, id);
    // Longer than the proxy's own command timeout, so its error wins.
    const deadline = Date.now() + 6 * 60 * 1000;
    while (Date.now() < deadline) {
        const reply = readJson(response);
        if (reply) {
            rmSync(response, {force: true});
            console.log(
                JSON.stringify(reply.ok ? reply.result ?? null : reply, null, 2)
            );
            process.exit(reply.ok ? 0 : 1);
        }
        if (!liveSession()) {
            fail("The session ended before replying.");
        }
        await sleep(100);
    }
    rmSync(request, {force: true});
    fail("No reply from the session within 6 minutes.");
}

async function waitForExit(pid, ms) {
    const deadline = Date.now() + ms;
    while (isAlive(pid) && Date.now() < deadline) {
        await sleep(250);
    }
    return !isAlive(pid);
}

async function stop() {
    const launcher = readJson(files.launcher);
    if (!isAlive(launcher?.pid)) {
        // Sweep anything a launcher that died uncleanly left in its group.
        if (launcher?.pid) {
            terminate(launcher.pid, "SIGKILL");
        }
        rmSync(files.session, {force: true});
        console.error("No agent session is running.");
        return;
    }
    writeFileSync(files.stop, "");
    if (!(await waitForExit(launcher.pid, 30_000))) {
        console.error("The session did not stop within 30s; terminating it.");
        terminate(launcher.pid);
        await waitForExit(launcher.pid, 5_000);
    }
    // A clean exit leaves nothing; this catches a chromedriver or editor that
    // outlived its parent, which otherwise lingers as an orphan.
    terminate(launcher.pid, "SIGKILL");
    rmSync(files.session, {force: true});
    console.error("Stopped.");
}

function logs() {
    const userData = path.join(userDataDir, "settings");
    const vscodeLogs = path.join(userData, "logs");
    const latest = existsSync(vscodeLogs)
        ? readdirSync(vscodeLogs).sort().at(-1)
        : undefined;
    console.log(
        JSON.stringify(
            {
                sessionDir,
                userDataDir,
                wdio: files.log,
                wdioOutputDir: path.join(sessionDir, "logs"),
                vscodeLogs: latest ? path.join(vscodeLogs, latest) : vscodeLogs,
                databricksLogs: path.join(
                    userData,
                    "User",
                    "globalStorage",
                    "databricks.databricks"
                ),
            },
            null,
            2
        )
    );
}

const [command, ...rest] = process.argv.slice(2);
switch (command) {
    case "start":
        await start(rest);
        break;
    case "status":
        status();
        break;
    case "exec":
        await exec(rest);
        break;
    case "restart": {
        // VS Code runs in extension-test mode, where Reload Window exits the
        // editor, so restarting is how a rebuilt extension gets picked up.
        const previous = readJson(files.launcher)?.startArgs ?? [];
        await stop();
        await start(rest.length > 0 ? rest : previous);
        break;
    }
    case "show":
    case "hide": {
        const launcher = liveSession()?.launcher;
        if (!launcher) {
            fail("No agent session is running.");
        }
        if (process.platform !== "darwin") {
            fail("show and hide are macOS only.");
        }
        const ok = await setEditorVisible(
            launcher.pid,
            command === "show",
            command === "hide" ? frontmostPid() : undefined
        );
        process.exit(ok ? 0 : 1);
        break;
    }
    case "stop":
        await stop();
        break;
    case "logs":
        logs();
        break;
    default:
        fail(
            "Usage: agent-session.mjs start|status|exec|restart|show|hide|stop|logs (see the header of this file)"
        );
}
