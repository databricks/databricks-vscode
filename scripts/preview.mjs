// `yarn preview`: opens this checkout's extension in a VS Code of its own, to
// try a change by hand. Each sandbox has its own user data, extensions and
// Databricks config file, and its own title and colour, so several can be
// open side by side; your own VS Code, its settings and ~/.databrickscfg stay
// as they are.
//
//   yarn preview [--project | --folder <dir>] [--profile <name>] [--session <serverless | cluster-id>] [--name <name>] [--color <#rrggbb>] [--extension <id>]... [--with-ssh] [--fresh] [--no-build]
//
//   (no folder)        a window without a folder
//   --project          the sandbox's project, `default-python` from `bundle
//                      init`; making it takes --profile, as the template asks
//                      the workspace for the user's name
//   --folder <dir>     that folder
//   --profile <name>   copies that profile of ~/.databrickscfg (or of
//                      DATABRICKS_CONFIG_FILE) into the sandbox's config file,
//                      without its secrets. An OAuth (`databricks-cli`)
//                      profile shares the CLI's sign-in.
//   --session <serverless | cluster-id>
//                      plays a session window, whose extension host would run
//                      on that compute (remote mode), with the environment
//                      the CLI's SSH tunnel sets: the profile's host and its
//                      token or M2M client, or else a token from `databricks
//                      auth token`, which lives about an hour; a cluster's
//                      runtime; a Python of the sandbox's as the session's
//                      interpreter. Takes --profile, whose workspace holds the
//                      cluster. The sandbox is `<branch>-session`, and has no
//                      profile: a session doesn't use them. When the token
//                      expires, close the window and run this again.
//   --name <name>      the sandbox; the branch by default, so each worktree
//                      has its own, cut to fit VS Code's socket path (about
//                      20 characters under ~/.cache). The colour follows from it.
//   --color <#rrggbb>  another colour
//   --extension <id>   also copies that extension into the sandbox, as the
//                      pack's members are; repeatable. For one a feature
//                      installs on demand, such as ms-vscode-remote.remote-ssh,
//                      to skip that step. It stays until --fresh.
//   --with-ssh         --extension ms-vscode-remote.remote-ssh: the SSH
//                      tunnel's remote window without its install step
//   --fresh            deletes the sandbox first
//   --no-build         skips `yarn build` and fetch:cli
//
// Sandboxes live in ~/.cache/databricks-vscode-preview/<name>, or in
// DATABRICKS_PREVIEW_DIR, and outlive the window: sign-ins, settings and the
// project stay for the next run. Not /tmp, which macOS clears. The extension
// pack's members come from ~/.vscode/extensions (or VSCODE_EXTENSIONS), as the
// Marketplace may be unreachable.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
    colorFor,
    copyProfile,
    dependencyClosure,
    extensionEntries,
    installedExtensions,
    maxSandboxName,
    previewSettings,
    runtimeVersion,
    sandboxName,
    sessionCompute,
    sessionCredentials,
    sessionEnv,
    windowTitle,
    withProfile,
} from "./preview/lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const extensionDir = path.join(root, "packages/databricks-vscode");
const cli = path.join(
    extensionDir,
    "bin",
    process.platform === "win32" ? "databricks.exe" : "databricks",
);
const usage =
    "usage: yarn preview [--project | --folder <dir>] [--profile <name>] [--session <serverless | cluster-id>] [--name <name>] [--color <#rrggbb>] [--extension <id>]... [--with-ssh] [--fresh] [--no-build]";

function fail(message) {
    console.error(`preview: ${message}`);
    process.exit(1);
}

let options;
try {
    ({ values: options } = parseArgs({
        options: {
            "project": { type: "boolean" },
            "folder": { type: "string" },
            "profile": { type: "string" },
            "session": { type: "string" },
            "name": { type: "string" },
            "color": { type: "string" },
            "extension": { type: "string", multiple: true },
            "with-ssh": { type: "boolean" },
            "fresh": { type: "boolean" },
            "no-build": { type: "boolean" },
            "help": { type: "boolean", short: "h" },
        },
    }));
} catch (error) {
    console.error(`preview: ${error.message}\n${usage}`);
    process.exit(2);
}
if (options.help) {
    console.log(usage);
    process.exit(0);
}
if (options.project && options.folder) {
    fail("pass --project or --folder, not both.");
}
const compute = options.session === undefined ? undefined : sessionCompute(options.session);
if (options.session !== undefined && !compute) {
    fail(`--session takes serverless or a cluster's ID, not ${options.session}.`);
}
if (compute && !options.profile) {
    fail("--session takes --profile <name>: the session signs in to that profile's workspace.");
}
if (options.color && !/^#[\da-f]{6}$/i.test(options.color)) {
    fail(`--color takes #rrggbb, not ${options.color}.`);
}

const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf-8" }).trim();
const build = {
    branch: git("rev-parse", "--abbrev-ref", "HEAD"),
    sha: git("rev-parse", "--short", "HEAD"),
    dirty: git("status", "--porcelain") !== "",
};
const sandboxRoot =
    process.env.DATABRICKS_PREVIEW_DIR ??
    path.join(os.homedir(), ".cache", "databricks-vscode-preview");
// VS Code quits at once when its socket path in the sandbox is too long: a
// branch's name is cut to fit, a name given with --name is refused.
const maxName = maxSandboxName(sandboxRoot);
if (maxName < 1) {
    fail(
        `${sandboxRoot} is too long for VS Code's socket path. Set a shorter DATABRICKS_PREVIEW_DIR.`,
    );
}
if (options.name !== undefined && sandboxName(options.name, root).length > maxName) {
    fail(
        `--name ${options.name} is too long: VS Code's socket path in ${sandboxRoot} leaves room for ${maxName} characters.`,
    );
}
// A session's sandbox sits next to the branch's own, with its own VS Code.
const SESSION_SUFFIX = "-session";
const name =
    compute && options.name === undefined
        ? `${sandboxName(build.branch, root, maxName - SESSION_SUFFIX.length)}${SESSION_SUFFIX}`
        : sandboxName(options.name ?? build.branch, root, maxName);
const sandbox = path.join(sandboxRoot, name);
const userData = path.join(sandbox, "user-data");
const extensions = path.join(sandbox, "extensions");
const configFile = path.join(sandbox, "databrickscfg");

/**
 * What the sandbox's processes see: no DATABRICKS_* of your shell, so only its
 * config file decides the workspace, and no VSCODE_* of a VS Code terminal,
 * which would make `code` open the window in that VS Code instead.
 */
const env = Object.fromEntries(
    Object.entries(process.env).filter(
        ([key]) => !/^(DATABRICKS_|VSCODE_|ELECTRON_RUN_AS_NODE$)/.test(key),
    ),
);
env.DATABRICKS_CONFIG_FILE = configFile;

if (options.fresh) {
    fs.rmSync(sandbox, { recursive: true, force: true });
}
fs.mkdirSync(path.join(userData, "User"), { recursive: true });
fs.mkdirSync(extensions, { recursive: true });

if (!options["no-build"]) {
    const yarn = (...args) => execFileSync("yarn", args, { cwd: root, stdio: "inherit" });
    yarn("build");
    try {
        yarn("workspace", "databricks", "fetch:cli");
    } catch {
        // fetch:cli sometimes fails once with a bare Node error.
        yarn("workspace", "databricks", "fetch:cli");
    }
}
if (!fs.existsSync(path.join(extensionDir, "dist", "extension.js")) || !fs.existsSync(cli)) {
    fail("the extension isn't built. Run without --no-build.");
}

// The extension pack's members and any --extension, copied once per sandbox.
const sourceExtensions =
    process.env.VSCODE_EXTENSIONS ?? path.join(os.homedir(), ".vscode", "extensions");
const manifest = JSON.parse(fs.readFileSync(path.join(extensionDir, "package.json"), "utf-8"));
if (!Array.isArray(manifest.extensionPack)) {
    fail(`${path.join(extensionDir, "package.json")} has no extensionPack.`);
}
const { needed, missing } = dependencyClosure(
    [
        ...manifest.extensionPack,
        ...(options.extension ?? []),
        ...(options["with-ssh"] ? ["ms-vscode-remote.remote-ssh"] : []),
    ],
    installedExtensions(sourceExtensions),
);
if (missing.length > 0) {
    fail(
        `${missing.join(", ")} not installed in ${sourceExtensions}. Install them in VS Code, or set VSCODE_EXTENSIONS.`,
    );
}
const inSandbox = installedExtensions(extensions);
const copied = [...needed].filter(([id]) => !inSandbox.has(id)).map(([, extension]) => extension);
for (const { folder } of copied) {
    console.log(`Copying ${folder} into the sandbox`);
    fs.cpSync(path.join(sourceExtensions, folder), path.join(extensions, folder), {
        recursive: true,
        verbatimSymlinks: true,
    });
}
const readJson = (file, fallback) =>
    fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf-8")) : fallback;
const entriesFile = path.join(extensions, "extensions.json");
fs.writeFileSync(
    entriesFile,
    JSON.stringify(
        extensionEntries(
            readJson(entriesFile, []),
            copied,
            readJson(path.join(sourceExtensions, "extensions.json"), []),
            extensions,
        ),
    ),
);

const title = windowTitle(name, build);
const color = options.color ?? colorFor(name);
const settingsFile = path.join(userData, "User", "settings.json");
let settings;
try {
    settings = readJson(settingsFile, {});
} catch {
    fail(`${settingsFile} isn't plain JSON (comments?). Fix it, or start over with --fresh.`);
}
fs.writeFileSync(
    settingsFile,
    `${JSON.stringify(previewSettings(settings, { title, color }), undefined, 4)}\n`,
);

if (!fs.existsSync(configFile)) {
    fs.writeFileSync(configFile, "", { mode: 0o600 });
}
const userConfig = process.env.DATABRICKS_CONFIG_FILE ?? path.join(os.homedir(), ".databrickscfg");
const userConfigText = fs.existsSync(userConfig) ? fs.readFileSync(userConfig, "utf-8") : "";
if (options.profile && !compute) {
    const section = copyProfile(userConfigText, options.profile);
    if (!section) {
        fail(`${userConfig} has no profile "${options.profile}".`);
    }
    fs.writeFileSync(
        configFile,
        withProfile(fs.readFileSync(configFile, "utf-8"), options.profile, section),
    );
}

/** What the window's VS Code sees: the sandbox's environment, and a session's with --session. */
const windowEnv = compute ? { ...env, ...prepareSession() } : env;

/**
 * The session's environment. Its secrets go to VS Code's environment only,
 * as on compute; nothing here prints or stores them.
 */
function prepareSession() {
    const session = sessionCredentials(userConfigText, options.profile);
    if (!session) {
        fail(`${userConfig} has no profile "${options.profile}".`);
    }
    if (!session.host) {
        fail(`The profile "${options.profile}" has no host: a session serves one workspace.`);
    }
    /** The CLI's JSON answer, with the user's profile; throws with the CLI's reason. */
    const userCli = (...args) => {
        try {
            return JSON.parse(
                execFileSync(cli, [...args, "--profile", options.profile, "-o", "json"], {
                    env: { ...env, DATABRICKS_CONFIG_FILE: userConfig },
                    encoding: "utf-8",
                    stdio: ["ignore", "pipe", "pipe"],
                }),
            );
        } catch (error) {
            // With `-o json` the CLI writes its error to stdout, as JSON.
            let reason;
            try {
                reason = JSON.parse(error.stdout).message;
            } catch {
                reason = error.stderr?.trim() || error.message;
            }
            throw new Error(reason, { cause: error });
        }
    };
    let credentials = session.credentials;
    if (!credentials) {
        // An OAuth profile: the CLI's cached sign-in gives a token, as the tunnel gives a session one.
        let token;
        let reason = "it gave none";
        try {
            token = userCli("auth", "token").access_token;
        } catch (error) {
            reason = error.message;
        }
        if (!token) {
            fail(
                `The profile "${options.profile}" has no token or M2M client, and \`databricks auth token --profile ${options.profile}\` failed: ${reason}`,
            );
        }
        credentials = { DATABRICKS_TOKEN: token };
        console.log(
            `The session signs in with a token of "${options.profile}" that lives about an hour; then close the window and run this again.`,
        );
    }
    if (compute.kind === "cluster") {
        let cluster;
        try {
            cluster = userCli("clusters", "get", compute.clusterId);
        } catch (error) {
            fail(
                `Can't get the cluster ${compute.clusterId} in the profile "${options.profile}"'s workspace: ${error.message}`,
            );
        }
        compute.runtimeVersion = runtimeVersion(cluster.spark_version);
    }
    return sessionEnv({
        host: session.host,
        credentials,
        compute,
        interpreter: sessionInterpreter(),
    });
}

/** The session's interpreter: a virtual environment's Python in the sandbox, made once. */
function sessionInterpreter() {
    const venv = path.join(sandbox, "session-venv");
    const python = path.join(
        venv,
        process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
    );
    if (fs.existsSync(python)) {
        return python;
    }
    console.log(`Making the session's Python in ${venv}`);
    try {
        execFileSync("uv", ["venv", "--python", "3.12", venv], {
            stdio: "inherit",
            shell: process.platform === "win32",
        });
    } catch {
        execFileSync(process.platform === "win32" ? "python" : "python3", ["-m", "venv", venv], {
            stdio: "inherit",
        });
    }
    return python;
}

let folder = options.folder && path.resolve(options.folder);
if (folder && !fs.statSync(folder, { throwIfNoEntry: false })?.isDirectory()) {
    fail(`${folder} isn't a folder.`);
}
if (options.project) {
    const workspace = path.join(sandbox, "workspace");
    folder = path.join(workspace, "my_project");
    if (!fs.existsSync(folder)) {
        if (!options.profile) {
            fail(
                "making the project takes --profile <name>: the bundle template asks the workspace for your user name.",
            );
        }
        fs.mkdirSync(workspace, { recursive: true });
        const templateConfig = path.join(sandbox, "bundle-init.json");
        fs.writeFileSync(templateConfig, JSON.stringify({ project_name: "my_project" }));
        execFileSync(
            cli,
            [
                "bundle",
                "init",
                "default-python",
                "--config-file",
                templateConfig,
                "--output-dir",
                workspace,
                // A session signs in from its environment, which names the session's host in the project.
                ...(compute ? [] : ["--profile", options.profile]),
            ],
            { env: windowEnv, stdio: "inherit" },
        );
    }
}

console.log(
    `Opening ${title.split(" — ")[0]} in ${color}, sandbox ${sandbox}${folder ? `, folder ${folder}` : ""}${compute ? `, as a session on ${compute.kind === "serverless" ? "serverless" : `cluster ${compute.clusterId}`}` : ""}`,
);
execFileSync(
    "code",
    [
        "--new-window",
        `--user-data-dir=${userData}`,
        `--extensions-dir=${extensions}`,
        `--extensionDevelopmentPath=${extensionDir}`,
        ...(folder ? [folder] : []),
    ],
    { env: windowEnv, stdio: "inherit" },
);
