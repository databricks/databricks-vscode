// `yarn preview:remote-vsix`: installs this checkout's extension in a real
// session window, whose extension host runs on Databricks compute. Such a
// window gets the Marketplace extension (databricks.databricks), not this
// checkout's build, so trying a change there took a VSIX, an
// install and a disable by hand. This does it in one command: it asks the
// compute for its CPU over the tunnel's SSH host, packages the VSIX for it
// under the Marketplace extension's ID, and installs it over that one with
// the compute's VS Code server. Uninstalling the Marketplace extension
// doesn't last: Remote - SSH installs it again whenever the window connects,
// a reload included, and two of them register the same commands. Under its
// ID, at version 3.999.0-dev, the build is what that install finds.
//
//   yarn preview:remote-vsix (--session <serverless | cluster-id> [--profile <name>] | --ssh-host <name>) [--no-build]
//
//   --session <serverless | cluster-id>
//                      the compute of the session, as for `yarn preview
//                      --session`. Its window must be open: the VS Code
//                      server that Remote - SSH installs there does the install.
//   --profile <name>   the profile the tunnel was started with, from
//                      ~/.databrickscfg (or DATABRICKS_CONFIG_FILE). A
//                      serverless session's SSH host is named after its
//                      workspace's host; a cluster's is the cluster's ID.
//   --ssh-host <name>  the SSH host instead, for a session started with
//                      `--name`, `--accelerator` or `--base-environment`
//   --no-build         skips `yarn build`; the VSIX is always packaged
//
// Then run "Developer: Reload Window" in the session window. The install
// lasts as long as the compute's home folder: a serverless session starts
// with a new one, with the Marketplace extension. Run this again then. To go
// back to the Marketplace extension, uninstall the build in the window and
// reload. A disabled databricks.databricks disables the build too: VS Code
// keeps that in your user state, for the ID. Enable it in a local window;
// in the session window, enabling it also enables the extension pack's
// members, and VS Code fails on the local YAML extension there ("because of
// its extension kind").
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { sessionCompute, sessionCredentials } from "./preview/lib.mjs";
import {
    MARKETPLACE_EXTENSION,
    MARKETPLACE_NAME,
    EARLIER_EXTENSION,
    PROBE_SCRIPT,
    SESSION_VERSION,
    installScript,
    linuxTarget,
    parseProbe,
    pickServer,
    sshHostAlias,
} from "./preview/sessionVsix.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const extensionDir = path.join(root, "packages/databricks-vscode");
const usage =
    "usage: yarn preview:remote-vsix (--session <serverless | cluster-id> [--profile <name>] | --ssh-host <name>) [--no-build]";

function fail(message) {
    console.error(`preview:remote-vsix: ${message}`);
    process.exit(1);
}

let options;
try {
    ({ values: options } = parseArgs({
        options: {
            "session": { type: "string" },
            "profile": { type: "string" },
            "ssh-host": { type: "string" },
            "no-build": { type: "boolean" },
            "help": { type: "boolean", short: "h" },
        },
    }));
} catch (error) {
    console.error(`preview:remote-vsix: ${error.message}\n${usage}`);
    process.exit(2);
}
if (options.help) {
    console.log(usage);
    process.exit(0);
}
if ((options.session === undefined) === (options["ssh-host"] === undefined)) {
    fail(`pass --session or --ssh-host, one of them.\n${usage}`);
}

/**
 * What ssh and its ProxyCommand (`databricks ssh connect --proxy`) see: no
 * DATABRICKS_* of your shell but the config file, so the profile the tunnel
 * wrote into the SSH host decides the workspace.
 */
const env = Object.fromEntries(
    Object.entries(process.env).filter(
        ([key]) => !key.startsWith("DATABRICKS_") || key === "DATABRICKS_CONFIG_FILE",
    ),
);

const tunnelConfigs = path.join(os.homedir(), ".databricks", "ssh-tunnel-configs");
let sshHost = options["ssh-host"];
if (sshHost === undefined) {
    const compute = sessionCompute(options.session);
    if (!compute) {
        fail(`--session takes serverless or a cluster's ID, not ${options.session}.`);
    }
    let host;
    if (compute.kind === "serverless") {
        if (!options.profile) {
            fail(
                "--session serverless takes --profile <name>: the session's SSH host is named after the profile's workspace.",
            );
        }
        const userConfig =
            process.env.DATABRICKS_CONFIG_FILE ?? path.join(os.homedir(), ".databrickscfg");
        host = sessionCredentials(
            fs.existsSync(userConfig) ? fs.readFileSync(userConfig, "utf-8") : "",
            options.profile,
        )?.host;
        if (!host) {
            fail(`${userConfig} has no profile "${options.profile}" with a host.`);
        }
    }
    sshHost = sshHostAlias(compute, host);
    if (!fs.existsSync(path.join(tunnelConfigs, sshHost))) {
        fail(
            `There is no SSH host ${sshHost} in ${tunnelConfigs}. Open the session window first, with "Start SSH tunnel" or \`databricks ssh connect --ide vscode${compute.kind === "cluster" ? ` --cluster ${compute.clusterId}` : ""}${options.profile ? ` --profile ${options.profile}` : ""}\`; for a session started with --name, --accelerator or --base-environment, pass --ssh-host.`,
        );
    }
}

/** Runs `script` on the compute; BatchMode, so a missing key fails instead of asking. */
function onCompute(script, input) {
    return execFileSync("ssh", ["-o", "BatchMode=yes", sshHost, script], {
        env,
        encoding: "utf-8",
        input,
        stdio: [input === undefined ? "ignore" : "pipe", "pipe", "inherit"],
    });
}

console.log(`Asking ${sshHost} for its CPU and VS Code server, over the SSH tunnel`);
let probe;
try {
    probe = parseProbe(onCompute(PROBE_SCRIPT));
} catch {
    fail(
        `ssh ${sshHost} failed (above). Is the session window open? Its server stops 10 minutes after the last window closes.`,
    );
}
const target = linuxTarget(probe.machine);
if (!target) {
    fail(
        `${sshHost} is a ${probe.machine || "machine of no known kind"}; the extension is built for x86_64 and aarch64.`,
    );
}
let localCommit;
try {
    localCommit = execFileSync("code", ["--version"], { encoding: "utf-8" }).split("\n")[1];
} catch {
    // Without `code` on PATH, the newest server is the guess.
}
const server = pickServer(probe.servers, localCommit);
if (!server) {
    fail(
        `${sshHost} has no VS Code server in ~/.vscode-server. Open the session window first, then run this again.`,
    );
}
if (localCommit && server.commit !== localCommit) {
    console.log(
        `${sshHost} has no VS Code server of this VS Code (${localCommit.slice(0, 10)}); installing with its newest, ${server.commit?.slice(0, 10) ?? server.cli}.`,
    );
}

const vsix = path.join(
    extensionDir,
    ".build",
    `${MARKETPLACE_NAME}-${target}-${SESSION_VERSION}.vsix`,
);
try {
    if (!options["no-build"]) {
        execFileSync("yarn", ["build"], { cwd: root, stdio: "inherit" });
    }
    execFileSync(
        process.execPath,
        [
            "--use-system-ca",
            path.join(extensionDir, "scripts", "packageVsix.mjs"),
            "--target",
            target,
            "--out",
            vsix,
            "--name",
            MARKETPLACE_NAME,
            "--version",
            SESSION_VERSION,
        ],
        { cwd: extensionDir, stdio: "inherit" },
    );
} catch {
    fail(`Building the ${target} VSIX failed (above).`);
}

console.log(
    `Installing ${path.relative(root, vsix)} on ${sshHost} as ${MARKETPLACE_EXTENSION} ${SESSION_VERSION}, and uninstalling ${EARLIER_EXTENSION} if it's there`,
);
try {
    process.stdout.write(onCompute(installScript(server.cli), fs.readFileSync(vsix)));
} catch (error) {
    process.stdout.write(error.stdout ?? "");
    fail(`The install on ${sshHost} failed (above).`);
}
console.log(
    `Done. Run "Developer: Reload Window" in the session window on ${sshHost}. If you disabled ${MARKETPLACE_EXTENSION} before, the build is disabled too, as it has that ID: enable it in a local window, then reload. A serverless session's new home folder has the Marketplace extension again; run this again then.`,
);
