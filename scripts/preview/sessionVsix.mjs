// The parts of `yarn preview:remote-vsix` (scripts/sessionVsix.mjs) that
// need no compute: which SSH host a session has, which VSIX its CPU takes,
// and what the compute is asked to run.
import crypto from "node:crypto";

/**
 * The Marketplace extension (2.x) a session's VS Code server gets. Remote -
 * SSH installs it again whenever the window connects, a reload included
 * (`remote.SSH.defaultExtensions`), so it can't be uninstalled for good. The
 * build takes its ID instead: that install then finds it installed.
 */
export const MARKETPLACE_EXTENSION = "databricks.databricks";
/** The packaged name that gives the build the Marketplace extension's ID. */
export const MARKETPLACE_NAME = "databricks";
/** Above any release yet, so the Marketplace never updates the build away; `-dev` says what it is. */
export const SESSION_VERSION = "3.999.0-dev";
/** The ID this extension had before it took the Marketplace one. A build from then, installed by hand, registers the same commands. */
export const EARLIER_EXTENSION = "databricks.databricks-vscode";

/** The host as the CLI's SDK keeps it (`Config.fixHostIfNeeded`): scheme and authority, https when it has none. */
export function canonicalHost(host) {
    const withScheme = /^[a-z][\w+.-]*:\/\//i.test(host) ? host : `https://${host}`;
    const [, scheme, authority] = /^([^:]+):\/\/([^/?#]*)/.exec(withScheme);
    return `${scheme.toLowerCase()}://${authority}`;
}

/**
 * The SSH host `databricks ssh connect` writes for a session, in
 * ~/.databricks/ssh-tunnel-configs/: a cluster's ID, or for serverless a
 * name made from the workspace's host (the CLI's
 * `GenerateDefaultConnectionName`, with no accelerator or base environment).
 */
export function sshHostAlias(compute, host) {
    if (compute.kind === "cluster") {
        return compute.clusterId;
    }
    const hash = crypto.createHash("md5").update(canonicalHost(host)).digest("hex");
    return `databricks-cpu-${hash.slice(0, 8)}`;
}

/** vsce's target for a Linux machine, from `uname -m`; undefined for one the extension isn't built for. */
export function linuxTarget(machine) {
    return { x86_64: "linux-x64", aarch64: "linux-arm64", arm64: "linux-arm64" }[machine];
}

/** A word for a POSIX shell, in single quotes. */
export function shellQuote(word) {
    return `'${word.replaceAll("'", `'\\''`)}'`;
}

/**
 * What the compute is asked first: its CPU, then the CLI of each VS Code
 * server that Remote - SSH installed in the home folder, newest first.
 * Newer Remote - SSH puts them in `cli/servers/Stable-<commit>/server`,
 * older in `bin/<commit>`.
 */
export const PROBE_SCRIPT = [
    "uname -m",
    'ls -td "$HOME"/.vscode-server/cli/servers/*/server/bin/code-server "$HOME"/.vscode-server/bin/*/bin/code-server 2>/dev/null',
    // ls fails on the pattern of a layout that isn't there.
    "true",
].join("\n");

/** PROBE_SCRIPT's answer: the machine, and the servers' CLIs, newest first, with the VS Code commit of each. */
export function parseProbe(output) {
    const [machine = "", ...lines] = output.trim().split("\n");
    const servers = lines
        .map((line) => line.trim())
        .filter((line) => line.endsWith("/code-server"))
        .map((cli) => ({
            cli,
            commit: /([\da-f]{40})(?:\/server)?\/bin\/code-server$/.exec(cli)?.[1],
        }));
    return { machine: machine.trim(), servers };
}

/**
 * The server the session window runs: the one of the local VS Code's
 * commit, else the newest, which a window opened since the last update
 * installed. Every server of the home folder installs into the same
 * `~/.vscode-server/extensions`.
 */
export function pickServer(servers, commit) {
    return servers.find((server) => server.commit === commit) ?? servers[0];
}

/**
 * The compute's part of an install: the VSIX comes on standard input, and
 * the server's CLI installs it over the Marketplace extension or an earlier
 * build (`--force`), then uninstalls a build under the earlier ID.
 */
export function installScript(serverCli) {
    const cli = shellQuote(serverCli);
    return [
        "set -e",
        "dir=$(mktemp -d)",
        `trap 'rm -rf "$dir"' EXIT`,
        'cat > "$dir/databricks.vsix"',
        `${cli} --install-extension "$dir/databricks.vsix" --force`,
        `if ${cli} --list-extensions | grep -qixF ${EARLIER_EXTENSION}; then`,
        `    ${cli} --uninstall-extension ${EARLIER_EXTENSION}`,
        "fi",
    ].join("\n");
}
