import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import {
    getBasicBundleConfig,
    profileHost,
    writeRootBundleConfig,
} from "./utils/bundle-fixtures.ts";
import { waitForLogin } from "./utils/configuration.ts";
import { dismissNotifications } from "./utils/dismiss-notifications.ts";
import { samePath } from "./utils/paths.ts";

/**
 * Three window-level features no frozen spec covers. The
 * configuration file shortcut (AUTH-04), the public API that other
 * extensions read (INFRA-08: version 2 and the version 1 bridge), and
 * what integrated terminals inherit (INFRA-02: the bundled CLI on PATH and
 * the upstream tag).
 */

const EXTENSION_ID = "databricks.databricks";

describe("Configuration file, public API and terminal environment", async function () {
    let root: string;

    this.timeout(3 * 60 * 1000);

    before(async () => {
        assert(process.env.WORKSPACE_PATH, "WORKSPACE_PATH doesn't exist");
        assert(process.env.DATABRICKS_CONFIG_FILE, "DATABRICKS_CONFIG_FILE doesn't exist");
        root = process.env.WORKSPACE_PATH;
        await writeRootBundleConfig(getBasicBundleConfig({}, false), root);
        await waitForLogin("DEFAULT");
        await dismissNotifications();
        await (await browser.getWorkbench()).getEditorView().closeAllEditors();
    });

    it("should open the Databricks configuration file (AUTH-04)", async () => {
        await browser.executeWorkbench(async (vscode) => {
            await vscode.commands.executeCommand("databricks.connection.openDatabricksConfigFile");
        });
        const opened = await browser.waitUntil(
            () =>
                browser.executeWorkbench(
                    (vscode) => vscode.window.activeTextEditor?.document.uri.fsPath,
                ),
            { timeout: 20_000, timeoutMsg: "No editor opened" },
        );
        assert(
            samePath(opened, process.env.DATABRICKS_CONFIG_FILE!),
            `${opened} isn't ${process.env.DATABRICKS_CONFIG_FILE}`,
        );
        await (await browser.getWorkbench()).getEditorView().closeAllEditors();
    });

    it("should describe the connection through the public API, version 2 (INFRA-08)", async () => {
        const api = await browser.executeWorkbench(async (vscode, id: string) => {
            const extension = vscode.extensions.getExtension(id);
            const exports = (
                extension?.isActive ? extension.exports : await extension?.activate()
            ) as
                | {
                      version: number;
                      connection?: { host: string; profile?: string; userName: string };
                      cliPath: string;
                      configFile: string;
                      getAuthHeaders(): Promise<Record<string, string>>;
                  }
                | undefined;
            if (exports === undefined) {
                return undefined;
            }
            const headers = await exports.getAuthHeaders();
            return {
                version: exports.version,
                connection: exports.connection,
                cliPath: exports.cliPath,
                configFile: exports.configFile,
                authorization: headers.Authorization ?? headers.authorization,
            };
        }, EXTENSION_ID);
        assert(api, "The extension exported nothing");
        assert.strictEqual(api.version, 2);
        assert.strictEqual(new URL(api.connection!.host).host, new URL(profileHost()).host);
        assert.strictEqual(api.connection!.profile, "DEFAULT");
        assert(api.connection!.userName, "The connection has no user name");
        assert.strictEqual(
            path.resolve(api.configFile),
            path.resolve(process.env.DATABRICKS_CONFIG_FILE!),
        );
        await fs.access(api.cliPath);
        assert.match(api.authorization ?? "", /^Bearer /, "getAuthHeaders gave no bearer token");
    });

    it("should keep the version 1 bridge for the extensions that read it", async () => {
        const v1 = await browser.executeWorkbench(async (vscode, id: string) => {
            const exports = vscode.extensions.getExtension(id)?.exports as
                | {
                      connectionManager: {
                          state: string;
                          waitForConnect(): Promise<void>;
                          apiClient?: {
                              host: Promise<URL>;
                              config: { authenticate(h: Record<string, string>): Promise<void> };
                          };
                      };
                  }
                | undefined;
            const manager = exports?.connectionManager;
            if (manager === undefined) {
                return undefined;
            }
            await manager.waitForConnect();
            const headers: Record<string, string> = {};
            await manager.apiClient?.config.authenticate(headers);
            return {
                state: manager.state,
                host: (await manager.apiClient?.host)?.toString(),
                authorization: headers.Authorization,
            };
        }, EXTENSION_ID);
        assert(v1, "No connectionManager");
        assert.strictEqual(v1.state, "CONNECTED");
        assert.strictEqual(new URL(v1.host!).host, new URL(profileHost()).host);
        assert.match(v1.authorization ?? "", /^Bearer /);
    });

    it("should put the bundled CLI on the terminals' PATH (INFRA-02)", async () => {
        const out = path.join(root, "terminal-env.txt");
        const extensionPath = await browser.executeWorkbench(
            (vscode, id: string) => vscode.extensions.getExtension(id)?.extensionPath,
            EXTENSION_ID,
        );
        assert(extensionPath, "The extension isn't installed");
        await browser.executeWorkbench(
            (vscode, cwd: string, file: string, windows: boolean) => {
                const terminal = vscode.window.createTerminal({ name: "e2e terminal env", cwd });
                terminal.show();
                terminal.sendText(
                    windows
                        ? `"$env:DATABRICKS_CLI_UPSTREAM|$env:PATH" | Out-File -Encoding utf8 "${file}"`
                        : `printf '%s|%s\\n' "$DATABRICKS_CLI_UPSTREAM" "$PATH" > '${file}'`,
                );
            },
            root,
            out,
            process.platform === "win32",
        );
        const text = await browser.waitUntil(
            () => fs.readFile(out, "utf-8").catch(() => false as const),
            {
                timeout: 30_000,
                interval: 1_000,
                timeoutMsg: "The terminal didn't write its environment",
            },
        );
        const [upstream, pathValue] = text.replace(/^﻿/, "").trim().split("|");
        assert.strictEqual(upstream, "databricks-vscode-terminal");
        const entries = pathValue!.split(path.delimiter);
        assert(
            entries.some((p) => samePath(p, path.join(extensionPath, "bin"))),
            `PATH has no ${path.join(extensionPath, "bin")}: ${pathValue}`,
        );
    });
});
