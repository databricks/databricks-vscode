import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setupDriver } from "@wdio/utils/node";
import { prepareRemoteEnvironment } from "./src/utils/remote.ts";
import { prepareSshEditor } from "./src/utils/ssh.ts";

// extract-zip, used to unpack ChromeDriver, silently truncates files on Node 26+:
// https://github.com/puppeteer/puppeteer/issues/14957
if (Number(process.versions.node.split(".")[0]) >= 26) {
    throw new Error(
        `Node ${process.versions.node} can't install ChromeDriver; use Node 24 (see .nvmrc).`,
    );
}

const packageDir = path.dirname(fileURLToPath(import.meta.url));
// The source build, or the `extension/` folder of an unpacked VSIX (`yarn package`).
const extensionPath = path.resolve(
    process.env.DATABRICKS_E2E_EXTENSION_PATH ?? path.join(packageDir, "../databricks-vscode"),
);

// Deterministic paths: this file is evaluated by the launcher and again by
// every worker, so they all have to agree on the same locations.
const tmpDir = path.join(os.tmpdir(), "databricks-vscode-e2e");
const workspacePath = path.join(tmpDir, "workspace");
fs.mkdirSync(workspacePath, { recursive: true });
// A worker inherits the folder `onWorkerStart` made for it; keep that one.
process.env.WORKSPACE_PATH ??= workspacePath;
// The extension installs its IPython startup script into the default profile
// (RUN-08), and Jupyter's kernels read it from there: both follow IPYTHONDIR,
// which VS Code inherits, so a run never touches the machine's ~/.ipython.
// Each worker gets one of its own (`onWorkerStart`), so no kernel reads the
// script while another window writes it.
process.env.IPYTHONDIR = path.join(tmpDir, "ipython");

// Specs write profiles into the config file and per-target choices into the
// workspace, so every spec file gets a folder and a copy of
// DATABRICKS_CONFIG_FILE (empty when it isn't set) of its own, as in the old
// harness. A spec that adds a profile for the host then can't make another
// spec's choice ambiguous. The launcher records the original; each worker
// gets its copy's path from `onWorkerStart`, through its capabilities.
process.env.DATABRICKS_E2E_CONFIG_SOURCE ??= process.env.DATABRICKS_CONFIG_FILE ?? "";
const configsPath = path.join(tmpDir, "configs");

// E2E_WORKERS windows run spec files side by side (CI runs 6 against the
// mock). wdio starts a worker without waiting for the others' `onWorkerStart`,
// so what one worker's spec needs travels in its capabilities, under
// WORKER_ENV, rather than in the launcher's environment, which the next
// worker's `onWorkerStart` would change first; `beforeSession` puts it into
// the worker's environment.
const workers = Number(process.env.E2E_WORKERS ?? "1");
if (!Number.isInteger(workers) || workers < 1) {
    throw new Error(
        `E2E_WORKERS takes a whole number of workers, not "${process.env.E2E_WORKERS}".`,
    );
}
const WORKER_ENV = "databricks:workerEnv";

// run_serverless_workflow expects serverless compute from its profile: its
// copy of the config file, and no other, has `serverless_compute_id = auto`.
const SERVERLESS_SPEC_FILE = "run_serverless_workflow.ucws.e2e.ts";

/** The config file `text` with `serverless_compute_id = auto` in its [DEFAULT] profile, replacing any value there. */
function withServerlessCompute(text: string): string {
    const lines: string[] = [];
    let inDefault = false;
    for (const line of text.split("\n")) {
        const header = /^\s*\[/.test(line);
        if (header) {
            inDefault = /^\s*\[DEFAULT\]\s*$/.test(line);
        }
        if (inDefault && /^\s*serverless_compute_id\s*=/.test(line)) {
            continue;
        }
        lines.push(line);
        if (header && inDefault) {
            lines.push("serverless_compute_id = auto");
        }
    }
    return lines.join("\n");
}

/**
 * With several workers on Linux, each worker's VS Code gets an X server of
 * its own: windows on one display take focus from each other, and a quick
 * pick closes when its window loses focus. Xvfb picks a free display number
 * (-displayfd) and says it on fd 3.
 */
let display: ChildProcess | undefined;
function startDisplay(): Promise<string> {
    return new Promise((resolve, reject) => {
        const xvfb = spawn(
            "Xvfb",
            ["-displayfd", "3", "-screen", "0", "1280x1024x24", "-nolisten", "tcp"],
            { stdio: ["ignore", "ignore", "ignore", "pipe"] },
        );
        display = xvfb;
        process.once("exit", () => xvfb.kill());
        let number = "";
        xvfb.stdio[3]!.on("data", (data: Buffer) => {
            number += data.toString();
            if (number.includes("\n")) {
                resolve(`:${number.trim()}`);
            }
        });
        xvfb.on("error", (e) =>
            reject(
                new Error(
                    `Can't start Xvfb, which gives each of the E2E_WORKERS a display: ${e.message}`,
                ),
            ),
        );
        xvfb.on("exit", (code) =>
            reject(new Error(`Xvfb exited with ${code} before it named its display`)),
        );
    });
}

let driverInstalled: Promise<unknown> | undefined;

// The extension's `extensionPack` (ms-python.python, ms-python.debugpy,
// ms-toolsai.jupyter, redhat.vscode-yaml) is installed into this folder
// before the first window starts; the specs that use Python, debugging,
// notebooks or bundle YAML need it. A folder or VSIX in
// DATABRICKS_E2E_EXTENSIONS (separated by the path delimiter) is used for a
// member it provides, as the old harness's EXTENSION_VSIX_DIR was; anything
// else comes from the Marketplace through the downloaded VS Code's CLI.
const extensionsDir = path.join(tmpDir, "extensions");
// The window without the pack's members (`noDepsSpecs`) gets this one, empty.
const noDepsExtensionsDir = path.join(tmpDir, "extensions-no-deps");
const cachePath = path.join(packageDir, ".wdio-vscode-service");

/** An unpacked extension's `publisher.name` and version. */
function unpacked(dir: string): { id: string; version: string } | undefined {
    try {
        const manifest = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf-8")) as {
            publisher?: string;
            name?: string;
            version?: string;
        };
        return {
            id: `${manifest.publisher}.${manifest.name}`.toLowerCase(),
            version: manifest.version ?? "0.0.0",
        };
    } catch {
        return undefined;
    }
}

/** The CLI of the VS Code the service downloaded; on macOS it is inside the app bundle. */
function vscodeCli(): string {
    const dirs = fs
        .readdirSync(cachePath)
        .filter((d) => d.startsWith("vscode-"))
        .sort();
    const dir = path.join(cachePath, dirs[dirs.length - 1] ?? "");
    const bin =
        process.platform === "darwin"
            ? path.join(dir, "Visual Studio Code.app", "Contents", "Resources", "app", "bin")
            : path.join(dir, "bin");
    const cli = path.join(bin, process.platform === "win32" ? "code.cmd" : "code");
    if (!fs.existsSync(cli)) {
        throw new Error(
            `Can't find the VS Code CLI in ${cachePath} to install the extension's dependencies`,
        );
    }
    return cli;
}

let dependenciesInstalled = false;
function installDependencies() {
    if (dependenciesInstalled) {
        return;
    }
    dependenciesInstalled = true;
    const manifestPath = path.join(extensionPath, "package.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as {
        extensionPack?: unknown;
    };
    if (!Array.isArray(manifest.extensionPack)) {
        // Else nothing would be installed, and the specs that need the pack would fail far from the cause.
        console.error(`${manifestPath} has no extensionPack to install.`);
        process.exit(1);
    }
    for (const dir of [extensionsDir, noDepsExtensionsDir]) {
        fs.rmSync(dir, { recursive: true, force: true });
        fs.mkdirSync(dir, { recursive: true });
    }
    for (const id of manifest.extensionPack as string[]) {
        try {
            installExtension(id);
        } catch (error) {
            // wdio only logs a hook's error, and every spec would then run
            // without the pack, failing far from the cause.
            console.error(
                `Couldn't install ${id}, of the extension's pack: ${String(error)}\n` +
                    "Set DATABRICKS_E2E_EXTENSIONS to the dependencies' folders or VSIX files, or run yarn test:e2e:spec, which takes them from ~/.vscode/extensions.",
            );
            process.exit(1);
        }
    }
}

// Specs named `*.no-folder.*` run in a window without a folder;
// every other spec gets the workspace folder.
const noFolderSpecs = ["./src/**/*.no-folder.*e2e.ts"];
const folderOnly = Boolean(process.env.E2E_FOLDER_ONLY || process.env.MOCK_FOLDER_ONLY);
// Specs named `*.no-deps.*`, and the activation smoke spec, run in a folder
// window without the extension pack's members too, as for a user who disabled
// or uninstalled them. `--spec` ignores a window's `wdio:specs`, so that
// window excludes every other spec by name.
const NO_DEPS_PATTERN = "./src/**/*.no-deps.*e2e.ts";
// The proxy-TLS journey runs only in the mock config's two windows (wdio.mock.conf.ts).
const TRUST_PATTERN = "./src/**/*.trust.e2e.ts";
const SMOKE_SPEC = "./src/activation_smoke.next.e2e.ts";
const allSpecs = fs
    .globSync("src/**/*.e2e.ts", { cwd: packageDir })
    .map((f) => `./${f.split(path.sep).join("/")}`);
const noDepsSpecs = [NO_DEPS_PATTERN, SMOKE_SPEC];
const notNoDepsSpecs = allSpecs.filter((f) => f !== SMOKE_SPEC && !f.includes(".no-deps."));

// The spec files that take a minute or so start first, so that with several
// workers a full run doesn't end waiting on one of them. A spec missing here
// only starts later.
const SLOW_SPECS = [
    "unity_catalog.ucws",
    "run_dbconnect.ucws",
    "bundle_run_variants.next",
    "unity_catalog_actions.next.ucws",
    "bundle_init",
    "auth_profile_choice.next",
];
const slowness = (spec: string) => {
    const i = SLOW_SPECS.indexOf(path.basename(spec, ".e2e.ts"));
    return i < 0 ? SLOW_SPECS.length : i;
};
const slowFirst = [...allSpecs].sort((a, b) => slowness(a) - slowness(b));

// The SSH spec needs a workspace that offers Serverless SSH compute, a
// tunnel port it permits, and Remote-SSH, so it is opt-in, as in the old
// harness: without TEST_SSH_E2E=true it is excluded, however it was
// selected; with it, it runs in a window of its own, set up in
// `beforeSession`.
const SSH_SPEC_FILE = "ssh_connection.ucws.e2e.ts";
const sshSpec = `./src/${SSH_SPEC_FILE}`;
const sshEnabled = process.env.TEST_SSH_E2E === "true";
const isSshSpec = (spec: string) => path.basename(spec) === SSH_SPEC_FILE;
// The remote-mode spec (SSH-03) gets the environment of a Databricks SSH
// session in `beforeSession`: src/utils/remote.ts.
const REMOTE_SPEC_FILE = "remote_mode.next.ucws.e2e.ts";
// Its user data and the home folder the CLI and Remote-SSH write into.
const sshStorage = path.join(tmpDir, "ssh-storage");
const sshHome = path.join(tmpDir, "ssh-home");
const sshSettings = {
    "remote.SSH.configFile": path.join(sshHome, ".ssh", "config"),
    "security.workspace.trust.enabled": false,
    "terminal.integrated.shellIntegration.enabled": false,
    "terminal.integrated.profiles.osx": { "SSH test": { path: "/bin/sh", args: [] } },
    "terminal.integrated.defaultProfile.osx": "SSH test",
    "terminal.integrated.profiles.linux": { "SSH test": { path: "/bin/sh", args: [] } },
    "terminal.integrated.defaultProfile.linux": "SSH test",
};

const vscodeCapability = (
    workspace: string | undefined,
    extra: {
        storagePath?: string;
        userSettings?: Record<string, unknown>;
        extensionsDir?: string;
    } = {},
): WebdriverIO.Capabilities => ({
    "browserName": "vscode",
    "browserVersion": "stable",
    "wdio:vscodeOptions": {
        extensionPath,
        ...(workspace !== undefined ? { workspacePath: workspace } : {}),
        ...(extra.storagePath !== undefined ? { storagePath: extra.storagePath } : {}),
        // The service disables installed extensions by default; the pack's members must load.
        vscodeArgs: {
            extensionsDir: extra.extensionsDir ?? extensionsDir,
            disableExtensions: false,
        },
        userSettings: {
            "workbench.startupEditor": "none",
            "telemetry.telemetryLevel": "off",
            ...extra.userSettings,
        },
    },
    "wdio:enforceWebDriverClassic": true,
});

/** A dependency from DATABRICKS_E2E_EXTENSIONS, else the Marketplace, as `installDependencies` does. */
function installExtension(id: string, extraArgs: string[] = []) {
    const sources = (process.env.DATABRICKS_E2E_EXTENSIONS ?? "")
        .split(path.delimiter)
        .filter((s) => s !== "");
    const folder = sources.find((s) => unpacked(s)?.id === id.toLowerCase());
    if (folder !== undefined) {
        fs.cpSync(folder, path.join(extensionsDir, `${id}-${unpacked(folder)!.version}`), {
            recursive: true,
        });
        return;
    }
    const vsix = sources.find(
        (s) =>
            s.endsWith(".vsix") &&
            path.basename(s).toLowerCase().startsWith(`${id.toLowerCase()}-`),
    );
    execFileSync(
        vscodeCli(),
        [
            "--extensions-dir",
            extensionsDir,
            "--install-extension",
            vsix ?? id,
            "--force",
            ...extraArgs,
        ],
        {
            stdio: "inherit",
            shell: process.platform === "win32",
        },
    );
}

export const config: WebdriverIO.Config = {
    runner: "local",
    specs: slowFirst,
    exclude: sshEnabled ? [] : [sshSpec],
    maxInstances: workers,
    capabilities: [
        {
            ...vscodeCapability(workspacePath),
            "wdio:exclude": [...noFolderSpecs, NO_DEPS_PATTERN, TRUST_PATTERN, sshSpec],
        },
        // `--spec` runs a spec in every capability that doesn't exclude it;
        // E2E_FOLDER_ONLY (or the mock's MOCK_FOLDER_ONLY) drops this window
        // for a spec written for a folder.
        ...(folderOnly
            ? []
            : [
                  {
                      ...vscodeCapability(undefined),
                      "wdio:specs": noFolderSpecs,
                      "wdio:exclude": [NO_DEPS_PATTERN, sshSpec],
                  },
              ]),
        {
            ...vscodeCapability(workspacePath, { extensionsDir: noDepsExtensionsDir }),
            "wdio:specs": noDepsSpecs,
            "wdio:exclude": [...notNoDepsSpecs, sshSpec],
        },
        ...(sshEnabled
            ? [
                  {
                      ...vscodeCapability(workspacePath, {
                          storagePath: sshStorage,
                          userSettings: sshSettings,
                      }),
                      "wdio:specs": [sshSpec],
                  },
              ]
            : []),
    ],
    services: [["vscode", { cachePath }]],
    framework: "mocha",
    mochaOpts: {
        ui: "bdd",
        timeout: 3 * 60 * 1000,
    },
    // Each test shows as it ends, not only when its spec file does.
    reporters: [["spec", { realtimeReporting: true }]],
    logLevel: "warn",
    outputDir: path.join(packageDir, "logs"),
    // The folder is below the workspace: specs write `databricks.yml` at its
    // root, and `bundle_sub_folder` needs a root without one.
    async onWorkerStart(cid, capabilities, specs) {
        // Here rather than in onPrepare: the service has downloaded VS Code by now.
        installDependencies();
        const caps = capabilities as WebdriverIO.Capabilities;
        // The service turns a capability into Chrome's only in the worker, so
        // wdio installs no ChromeDriver up front, and each worker installs it
        // if it's missing: workers that start together on an empty cache
        // unpack it over each other, and fail. So it's installed here, once,
        // for the version the service picked, before the first worker starts.
        driverInstalled ??= setupDriver(config, [
            { browserName: "chrome", browserVersion: caps.browserVersion },
        ]);
        await driverInstalled;
        const name = `spec-${cid}-${Date.now()}`;
        const source = process.env.DATABRICKS_E2E_CONFIG_SOURCE;
        const text = source ? fs.readFileSync(source, "utf-8") : "";
        const serverless = specs.some((s) => path.basename(s) === SERVERLESS_SPEC_FILE);
        const configFile = path.join(configsPath, `${name}.databrickscfg`);
        fs.writeFileSync(configFile, serverless ? withServerlessCompute(text) : text, {
            mode: 0o600,
        });
        const env: Record<string, string> = {
            DATABRICKS_CONFIG_FILE: configFile,
            IPYTHONDIR: path.join(tmpDir, "ipython", name),
        };
        (caps as Record<string, unknown>)[WORKER_ENV] = env;

        const options = caps["wdio:vscodeOptions"];
        if (options?.workspacePath === undefined) {
            return;
        }
        const root = path.join(workspacePath, name);
        fs.mkdirSync(root, { recursive: true });
        // A spec that needs files in its folder before VS Code starts (the
        // activation events see them) has them in src/resources/seed/<spec>/.
        for (const spec of specs) {
            const seed = path.join(
                packageDir,
                "src",
                "resources",
                "seed",
                path.basename(spec).replace(/\.e2e\.ts$/, ""),
            );
            if (fs.existsSync(seed)) {
                fs.cpSync(seed, root, { recursive: true });
            }
        }
        options.workspacePath = root;
        env.WORKSPACE_PATH = root;
    },
    onPrepare() {
        if (workers > 1 && process.platform !== "linux") {
            console.warn(
                `E2E_WORKERS=${workers}: on ${process.platform} the windows share one screen, and one that takes focus closes another's quick pick.`,
            );
        }
        // `exclude` drops it, so a run that asked for nothing else would be empty.
        const selected = process.argv.flatMap((arg, i, argv) =>
            argv[i - 1] === "--spec" ? [arg] : arg.startsWith("--spec=") ? [arg.slice(7)] : [],
        );
        if (!sshEnabled && selected.length > 0 && selected.every(isSshSpec)) {
            // wdio only logs a hook's rejection; name the missing flag rather than report an empty run.
            console.error(
                `${SSH_SPEC_FILE} runs only with TEST_SSH_E2E=true, against a workspace that offers Serverless SSH compute, with Remote-SSH installable.`,
            );
            process.exit(1);
        }
        for (const dir of [workspacePath, configsPath]) {
            fs.rmSync(dir, { recursive: true, force: true });
            fs.mkdirSync(dir, { recursive: true });
        }
    },
    // In the worker, before its VS Code starts: the environment set here
    // reaches that VS Code, the tunnel's terminal and the spec.
    async beforeSession(_config, capabilities, specs) {
        const caps = capabilities as Record<string, unknown>;
        Object.assign(process.env, caps[WORKER_ENV]);
        delete caps[WORKER_ENV];
        if (workers > 1 && process.platform === "linux") {
            process.env.DISPLAY = await startDisplay();
        }
        // The remote-mode spec's VS Code runs as if inside a Databricks SSH session.
        if (specs.some((s) => path.basename(s) === REMOTE_SPEC_FILE)) {
            prepareRemoteEnvironment(process.env.DATABRICKS_CONFIG_FILE, tmpDir);
        }
        if (!specs.some(isSshSpec)) {
            return;
        }
        // Fatal on purpose: a skip would let the run pass without exercising the tunnel.
        // The pack's other members are optional for the tunnel.
        installExtension("ms-vscode-remote.remote-ssh", ["--do-not-include-pack-dependencies"]);
        await prepareSshEditor({
            code: vscodeCli(),
            extensionsDir,
            storageDir: sshStorage,
            resourcesDir: path.join(packageDir, "src", "resources"),
            home: sshHome,
        });
    },
    afterSession() {
        display?.kill();
    },
};
