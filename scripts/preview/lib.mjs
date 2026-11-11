// The parts of `yarn preview` (scripts/preview.mjs) that decide what goes in a
// sandbox, apart from the I/O that puts it there, so node:test can check them.
import fs from "node:fs";
import path from "node:path";

/** Dark colours that white text reads well on, one per sandbox. */
export const PALETTE = [
    "#1f5fbf", // blue
    "#2e8b57", // green
    "#7b3fa0", // purple
    "#c0571b", // orange
    "#00838f", // teal
    "#b8860b", // dark gold
    "#ad1457", // magenta
    "#455a64", // slate
    "#283593", // indigo
    "#6d4c41", // brown
    "#827717", // olive
];

/**
 * The sandbox's name: the branch, or the worktree's folder on a detached HEAD,
 * safe for a path. Never `.` or `..`, which `--fresh` would delete the parent
 * folder through. Cut to `maxLength`, so VS Code's socket path fits.
 */
export function sandboxName(branch, worktreeDir, maxLength = Infinity) {
    let name = (branch && branch !== "HEAD" ? branch : path.basename(worktreeDir)).replace(
        /[^\w.-]+/g,
        "-",
    );
    if (name.length > maxLength) {
        name = name.slice(0, maxLength).replace(/[-.]+$/, "") || name.slice(0, maxLength);
    }
    return /^\.*$/.test(name) ? name.replace(/\./g, "-") || "-" : name;
}

/**
 * VS Code listens on `<user-data>/<version>-main.sock`, such as
 * `1.14-main.sock`. A Unix socket's path holds at most 103 characters: past
 * that VS Code warns, and on macOS quits at once, before it writes a log.
 */
const MAX_SOCKET_PATH = 103;
const SOCKET_FILE = "1.14-main.sock";

/** The longest sandbox name under `sandboxRoot` that leaves VS Code's socket path short enough. */
export function maxSandboxName(sandboxRoot) {
    return MAX_SOCKET_PATH - path.join(sandboxRoot, "", "user-data", SOCKET_FILE).length - 1;
}

/** The same colour for the same name, on every run. */
export function colorFor(name) {
    let hash = 0;
    for (const char of name) {
        hash = (hash * 31 + char.codePointAt(0)) >>> 0;
    }
    return PALETTE[hash % PALETTE.length];
}

/** The window title: the sandbox, then what was built, then VS Code's usual title. */
export function windowTitle(name, { branch, sha, dirty }) {
    const ref = `${branch && branch !== "HEAD" && branch !== name ? `${branch}@` : ""}${sha}${dirty ? "+wip" : ""}`;
    return `${name} · ${ref} — \${rootName}\${separator}\${activeEditorShort}`;
}

/**
 * The sandbox's settings: its own, with the title and colours this run sets.
 * The colours paint the title and status bars, so windows side by side differ.
 */
export function previewSettings(existing, { title, color }) {
    return {
        // Keeps the YAML extension from asking about telemetry in every new sandbox.
        "redhat.telemetry.enabled": false,
        // Lets the chat work in a new sandbox without a Copilot sign-in. Hidden
        // and experimental in VS Code, so not in the Settings UI.
        "chat.allowAnonymousAccess": true,
        ...existing,
        "window.title": title,
        "workbench.colorCustomizations": {
            ...existing["workbench.colorCustomizations"],
            "titleBar.activeBackground": color,
            "titleBar.activeForeground": "#ffffff",
            "titleBar.inactiveBackground": `${color}99`,
            "titleBar.inactiveForeground": "#ffffffcc",
            "statusBar.background": color,
            "statusBar.foreground": "#ffffff",
            "statusBar.noFolderBackground": color,
            "statusBar.noFolderForeground": "#ffffff",
            "statusBar.debuggingBackground": color,
            "activityBar.activeBorder": color,
        },
    };
}

/** The profiles of a Databricks config file, each a map of its keys to values. */
function parseConfig(text) {
    const profiles = new Map();
    let current;
    for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim();
        if (line === "" || line.startsWith("#") || line.startsWith(";")) {
            continue;
        }
        const section = /^\[(.+)\]$/.exec(line);
        if (section) {
            current = new Map();
            profiles.set(section[1].trim(), current);
            continue;
        }
        const eq = line.indexOf("=");
        if (current && eq > 0) {
            current.set(line.slice(0, eq).trim(), line.slice(eq + 1).trim());
        }
    }
    return profiles;
}

const SECRET_KEY = /token|password|secret|credentials/i;

/**
 * A profile for the sandbox's config file, copied from the user's without
 * secrets. A profile that signs in with `databricks-cli` (OAuth) shares the
 * CLI's token cache, so it is signed in already; any other one asks again.
 */
export function copyProfile(configText, profile) {
    const keys = parseConfig(configText).get(profile);
    if (!keys) {
        return undefined;
    }
    const lines = [...keys]
        .filter(([key]) => !SECRET_KEY.test(key))
        .map(([key, value]) => `${key} = ${value}`);
    return `[${profile}]\n${lines.join("\n")}\n`;
}

/** The config file with its profile of that name, if any, replaced by `section` at the end. */
export function withProfile(configText, profile, section) {
    let inProfile = false;
    const kept = configText.split("\n").filter((line) => {
        const header = /^\s*\[(.+)\]\s*$/.exec(line);
        if (header) {
            inProfile = header[1].trim() === profile;
        }
        return !inProfile;
    });
    const head = kept.join("\n").trimEnd();
    return `${head}${head ? "\n\n" : ""}${section}`;
}

/** The extensions installed in `dir`, by lower-case ID, the newest version of each. */
export function installedExtensions(dir) {
    const found = new Map();
    for (const folder of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
        let manifest;
        try {
            manifest = JSON.parse(fs.readFileSync(path.join(dir, folder, "package.json"), "utf-8"));
        } catch {
            continue;
        }
        const id = `${manifest.publisher}.${manifest.name}`.toLowerCase();
        const known = found.get(id);
        if (
            !known ||
            manifest.version.localeCompare(known.manifest.version, undefined, { numeric: true }) > 0
        ) {
            found.set(id, { folder, manifest });
        }
    }
    return found;
}

/**
 * The extensions that `ids` need, with everything they depend on or pack, from
 * `installed` (installedExtensions). VS Code activates the extension only when
 * all of them are there, and the sandbox can't fetch them: the Marketplace may
 * be unreachable.
 */
export function dependencyClosure(ids, installed) {
    const needed = new Map();
    const missing = [];
    const todo = [...ids];
    while (todo.length > 0) {
        const id = todo.pop().toLowerCase();
        if (needed.has(id) || missing.includes(id)) {
            continue;
        }
        const extension = installed.get(id);
        if (!extension) {
            missing.push(id);
            continue;
        }
        needed.set(id, extension);
        todo.push(
            ...(extension.manifest.extensionDependencies ?? []),
            ...(extension.manifest.extensionPack ?? []),
        );
    }
    return { needed, missing: missing.sort((a, b) => a.localeCompare(b)) };
}

/**
 * The sandbox's extensions.json: its entries, plus one for each copied folder
 * that has none. A copied entry keeps VS Code's metadata from `sourceEntries`,
 * with the location moved into the sandbox: an entry that points elsewhere
 * leaves the extension out, silently.
 */
export function extensionEntries(existing, copied, sourceEntries, extensionsDir) {
    const entries = [...existing];
    const have = new Set(existing.map((entry) => entry.relativeLocation));
    for (const { folder, manifest } of copied) {
        if (have.has(folder)) {
            continue;
        }
        const source = sourceEntries.find((entry) => entry.relativeLocation === folder);
        entries.push({
            ...(source ?? {
                identifier: { id: `${manifest.publisher}.${manifest.name}`.toLowerCase() },
                version: manifest.version,
            }),
            location: { $mid: 1, path: path.join(extensionsDir, folder), scheme: "file" },
            relativeLocation: folder,
        });
    }
    return entries;
}

/** What `--session` takes: `serverless`, or the ID of a cluster in the profile's workspace. */
export function sessionCompute(value) {
    if (value === "serverless") {
        return { kind: "serverless" };
    }
    if (!/^[\w-]+$/.test(value)) {
        return undefined;
    }
    return { kind: "cluster", clusterId: value };
}

/**
 * What a session window signs in with, from the user's profile: its host
 * and, as a session's environment carries them, a token or an M2M client.
 * A profile with neither (OAuth with `databricks-cli`, say) gets no
 * credentials here: the caller asks the CLI for a token instead.
 */
export function sessionCredentials(configText, profile) {
    const keys = parseConfig(configText).get(profile);
    if (!keys) {
        return undefined;
    }
    const token = keys.get("token");
    const clientId = keys.get("client_id");
    const clientSecret = keys.get("client_secret");
    return {
        host: keys.get("host"),
        credentials: token
            ? { DATABRICKS_TOKEN: token }
            : clientId && clientSecret
              ? { DATABRICKS_CLIENT_ID: clientId, DATABRICKS_CLIENT_SECRET: clientSecret }
              : undefined,
    };
}

/** `17.3` from a cluster's `spark_version`, such as `17.3.x-scala2.13`. */
export function runtimeVersion(sparkVersion) {
    return /^(\d+\.\d+)/.exec(sparkVersion ?? "")?.[1];
}

/** A serverless session's runtime, as the tunnel's bootstrap reports it. */
const SERVERLESS_RUNTIME = "client.4.10";
/** Nothing reads a serverless session's cluster ID; the bootstrap sets one. */
const SERVERLESS_CLUSTER_ID = "preview-serverless-session";

/**
 * The environment the CLI's SSH tunnel gives a session's extension host
 * (`kernel/host/Host.ts`, `detectHost`), for a local window that plays one.
 * `DATABRICKS_VIRTUAL_ENV` names the interpreter, as on compute.
 */
export function sessionEnv({ host, credentials, compute, interpreter }) {
    return {
        DATABRICKS_REMOTE_ENV: "1",
        DATABRICKS_HOST: host,
        ...credentials,
        DATABRICKS_VIRTUAL_ENV: interpreter,
        ...(compute.kind === "serverless"
            ? {
                  DATABRICKS_CLUSTER_ID: SERVERLESS_CLUSTER_ID,
                  IS_SERVERLESS: "TRUE",
                  DATABRICKS_RUNTIME_VERSION: SERVERLESS_RUNTIME,
              }
            : {
                  DATABRICKS_CLUSTER_ID: compute.clusterId,
                  ...(compute.runtimeVersion
                      ? { DATABRICKS_RUNTIME_VERSION: compute.runtimeVersion }
                      : {}),
              }),
    };
}
