/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable no-console */
import path from "node:path";
import {fileURLToPath} from "node:url";
import {
    cpSync,
    existsSync,
    mkdirSync,
    readdirSync,
    readFileSync,
} from "node:fs";
import os from "node:os";
import packageJson from "../../../../package.json" with {type: "json"};
import {
    codeCliForBinary,
    E2E_USER_SETTINGS,
    engineAllows,
    installExtensions,
    stripTsxImportInWorker,
    vscodeVersionForBinary,
} from "../utils/vscodeLaunch.ts";

/**
 * WebdriverIO config for an agent-driven VS Code session: one long-lived
 * editor that an MCP client attaches to. Started by
 * `scripts/agent-session.mjs`, which passes everything through the
 * AGENT_SESSION_* variables below. See README.md in this folder.
 */

stripTsxImportInWorker();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(__dirname, "..", "..", "..", "..");

function requiredEnv(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(
            `${name} is not set. Start agent sessions with: yarn workspace databricks run agent:session start`
        );
    }
    return value;
}

const SESSION_DIR = requiredEnv("AGENT_SESSION_DIR");
const WORKSPACE_PATH = requiredEnv("AGENT_SESSION_WORKSPACE");
const CACHE_DIR = requiredEnv("AGENT_SESSION_CACHE_DIR");
const VSCODE_VERSION = process.env.AGENT_SESSION_VSCODE_VERSION || "stable";
// "dev" loads the checkout's out/ build as a development extension; "vsix"
// installs the package from test:integ:prepare, like CI does.
const MODE = process.env.AGENT_SESSION_MODE === "vsix" ? "vsix" : "dev";

// VS Code puts its IPC socket under the user data dir, and macOS caps socket
// paths at 104 bytes, which a checkout-relative path easily exceeds.
const STORAGE_DIR = requiredEnv("AGENT_SESSION_USER_DATA");
const EXTENSIONS_DIR = path.join(STORAGE_DIR, "extensions");
mkdirSync(EXTENSIONS_DIR, {recursive: true});
mkdirSync(CACHE_DIR, {recursive: true});

function testVsixPath(): string {
    const pointer = path.join(PACKAGE_ROOT, ".build", "test-vsix-path");
    if (!existsSync(pointer)) {
        throw new Error(
            "No test VSIX. Run yarn workspace databricks run test:integ:prepare first, or use dev mode."
        );
    }
    return path.resolve(PACKAGE_ROOT, readFileSync(pointer, "utf-8").trim());
}

/**
 * The newest unpacked folder for `extId` in `dir`; with `vscodeVersion`, the
 * newest one whose `engines.vscode` admits that editor.
 */
function findExtensionDir(
    dir: string,
    extId: string,
    vscodeVersion?: string
): string | undefined {
    if (!existsSync(dir)) {
        return undefined;
    }
    // `<id>-<version>[-<platform>]`; the digit keeps ms-toolsai.jupyter from
    // matching ms-toolsai.jupyter-renderers.
    const prefix = `${extId.toLowerCase()}-`;
    return readdirSync(dir)
        .filter(
            (name) =>
                name.toLowerCase().startsWith(prefix) &&
                /^\d/.test(name.slice(prefix.length))
        )
        .sort()
        .reverse()
        .map((name) => path.join(dir, name))
        .find((extDir) => {
            if (!vscodeVersion) {
                return true;
            }
            try {
                const manifest = JSON.parse(
                    readFileSync(path.join(extDir, "package.json"), "utf-8")
                );
                return engineAllows(
                    manifest.engines?.vscode ?? "*",
                    vscodeVersion
                );
            } catch {
                return false;
            }
        });
}

/** A vendored `<id>-<version>-<platform>.vsix`, as CI provides. */
function findVendoredVsix(extId: string): string | undefined {
    const vsixDir = process.env.EXTENSION_VSIX_DIR;
    if (!vsixDir || !existsSync(vsixDir)) {
        return undefined;
    }
    const names = readdirSync(vsixDir).filter((name) =>
        name.startsWith(`${extId}-`)
    );
    const vsix =
        names.find((name) =>
            name.endsWith(`-${process.platform}-${process.arch}.vsix`)
        ) ?? names.find((name) => name.endsWith("-universal.vsix"));
    return vsix && path.join(vsixDir, vsix);
}

// Where the developer's own VS Code keeps extensions, to seed dependencies
// from when the marketplace is unreachable (a sandbox, a locked-down network).
const LOCAL_EXTENSIONS_DIR =
    process.env.AGENT_SESSION_LOCAL_EXTENSIONS ||
    path.join(os.homedir(), ".vscode", "extensions");

export const config: WebdriverIO.Config = {
    specs: [path.join(__dirname, "holdSession.ts")],
    maxInstances: 1,
    capabilities: [
        {
            "browserName": "vscode",
            "browserVersion": VSCODE_VERSION,
            "wdio:vscodeOptions": {
                binary: process.env.VSCODE_TEST_BINARY,
                extensionPath:
                    MODE === "dev"
                        ? PACKAGE_ROOT
                        : path.resolve(
                              __dirname,
                              "..",
                              "resources",
                              "dummy-test"
                          ),
                storagePath: STORAGE_DIR,
                workspacePath: WORKSPACE_PATH,
                vscodeArgs: {
                    extensionsDir: EXTENSIONS_DIR,
                    disableExtensions: false,
                },
                userSettings: E2E_USER_SETTINGS,
                // Code sent through `agent:session exec` may legitimately
                // wait on a workspace round trip.
                vscodeProxyOptions: {commandTimeout: 5 * 60 * 1000},
            },
        },
    ],
    logLevel: "info",
    outputDir: path.join(SESSION_DIR, "logs"),
    waitforTimeout: 10000,
    connectionRetryTimeout: 120000,
    connectionRetryCount: 3,
    services: [["vscode", {cachePath: CACHE_DIR}]],
    cacheDir: CACHE_DIR,
    framework: "mocha",
    reporters: ["spec"],
    // The hold spec runs until `agent:session stop`. wdio's Mocha adapter
    // turns a 0 ("no timeout") into a negative timer, so use a day instead.
    mochaOpts: {ui: "bdd", timeout: 24 * 60 * 60 * 1000},

    onPrepare: function () {
        process.env.EXTENSION_DEVELOPMENT = "true";
        process.env.DATABRICKS_VSCODE_INTEGRATION_TEST = "true";
        if (
            MODE === "dev" &&
            !existsSync(path.join(PACKAGE_ROOT, "out", "extension.js"))
        ) {
            console.error(
                "out/extension.js is missing. Run yarn workspace databricks run build first."
            );
            process.exit(1);
        }
    },

    beforeSession: async function (_config, capabilities) {
        const binary = capabilities["wdio:vscodeOptions"]!.binary as string;
        const cli = codeCliForBinary(binary);
        const vscodeVersion = vscodeVersionForBinary(binary);
        // Dependencies are installed once per session directory and reused on
        // restart (`start --fresh` wipes them). Prefer sources that need no
        // network: a vendored VSIX, then a copy of the developer's own install,
        // and only then the marketplace.
        const args: string[] = [];
        for (const extId of packageJson.extensionDependencies) {
            if (findExtensionDir(EXTENSIONS_DIR, extId)) {
                continue;
            }
            const vsix = findVendoredVsix(extId);
            // A copy must suit this editor: a developer's own install is often
            // newer than the version under test supports.
            const local =
                vscodeVersion &&
                findExtensionDir(LOCAL_EXTENSIONS_DIR, extId, vscodeVersion);
            if (vsix) {
                args.push("--install-extension", vsix);
            } else if (local) {
                console.log(`Copying ${extId} from ${local}`);
                cpSync(local, path.join(EXTENSIONS_DIR, path.basename(local)), {
                    recursive: true,
                });
            } else {
                args.push("--install-extension", extId);
            }
        }
        if (MODE === "vsix") {
            args.push("--install-extension", testVsixPath());
        }
        if (args.length > 0) {
            console.log("Installing extensions:", args.join(" "));
            await installExtensions(cli, EXTENSIONS_DIR, args);
        }
    },
};
