import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import { getBasicBundleConfig, writeRootBundleConfig } from "./utils/bundle-fixtures.ts";
import { waitForLogin } from "./utils/configuration.ts";
import { dismissNotifications } from "./utils/dismiss-notifications.ts";
import { getViewSection } from "./utils/view.ts";

/**
 * The activation smoke test: in a fresh profile, the extension activates and
 * signs in to the workspace, every command `package.json` contributes is
 * registered in the extension host, and nothing is logged at the error
 * level along the way. It runs against the source build, or against an
 * unpacked VSIX when DATABRICKS_E2E_EXTENSION_PATH points at one.
 */

const EXTENSION_ID = "databricks.databricks";
const LOG_FILE_NAME = "sdk-and-extension-logs.json";

/** The window's user data folder, which the service passes to VS Code. */
function userDataDir(): string {
    const args =
        (browser.requestedCapabilities as { "goog:chromeOptions"?: { args?: string[] } })[
            "goog:chromeOptions"
        ]?.args ?? [];
    const arg = args.find((a) => a.startsWith("--user-data-dir="));
    assert(arg, `No --user-data-dir in ${args.join(" ")}`);
    return arg.slice("--user-data-dir=".length);
}

/** The extension's JSON log entries in this window's newest log session. */
async function logEntries(): Promise<
    { level: string; logger: string; message: string; data?: unknown[] }[]
> {
    const logs = path.join(userDataDir(), "logs");
    const files = (await fs.readdir(logs, { recursive: true }))
        .filter((f) => f.endsWith(path.join(EXTENSION_ID, LOG_FILE_NAME)))
        .sort();
    assert(files.length > 0, `No ${LOG_FILE_NAME} under ${logs}`);
    const text = await fs.readFile(path.join(logs, files[files.length - 1]!), "utf-8");
    // The extension may be writing the last line as we read.
    return text
        .split("\n")
        .filter((line) => line.trim() !== "")
        .flatMap((line) => {
            try {
                return [JSON.parse(line)];
            } catch {
                return [];
            }
        });
}

describe("Activation", async function () {
    this.timeout(3 * 60 * 1000);

    before(async () => {
        assert(process.env.WORKSPACE_PATH, "WORKSPACE_PATH doesn't exist");
        await writeRootBundleConfig(getBasicBundleConfig({}, false), process.env.WORKSPACE_PATH);
    });

    it("activates and signs in", async () => {
        assert(await getViewSection("PROJECT"));
        await waitForLogin("DEFAULT");
        await dismissNotifications();
        const extension = await browser.executeWorkbench((vscode, id: string) => {
            const e = vscode.extensions.getExtension(id);
            return { active: e?.isActive, path: e?.extensionPath };
        }, EXTENSION_ID);
        assert.strictEqual(extension.active, true);
        if (process.env.DATABRICKS_E2E_EXTENSION_PATH) {
            // The build under test is the one VS Code loaded.
            assert.strictEqual(
                path.resolve(extension.path ?? ""),
                path.resolve(process.env.DATABRICKS_E2E_EXTENSION_PATH),
            );
        }
    });

    it("registers every contributed command", async () => {
        const result = await browser.executeWorkbench(async (vscode, id: string) => {
            const extension = vscode.extensions.getExtension(id);
            const contributed = (
                (extension?.packageJSON as { contributes?: { commands?: { command: string }[] } })
                    ?.contributes?.commands ?? []
            ).map((c) => c.command);
            const registered = new Set(await vscode.commands.getCommands(true));
            return {
                contributed: contributed.length,
                missing: contributed.filter((c) => !registered.has(c)),
            };
        }, EXTENSION_ID);
        assert(result.contributed > 90, `Only ${result.contributed} contributed commands`);
        assert.deepStrictEqual(result.missing, []);
    });

    it("logs no errors while activating, signing in and loading the views", async () => {
        // Let the views and the bundle's first validate finish.
        await browser.pause(5_000);
        const entries = await logEntries();
        assert(
            entries.some((e) => e.message.startsWith("Activated ")),
            "No activation line in the log",
        );
        const errors = entries
            .filter((e) => e.level === "error")
            .map((e) => `[${e.logger}] ${e.message} ${JSON.stringify(e.data ?? [])}`);
        assert.deepStrictEqual(errors, []);
    });
});
