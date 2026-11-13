import assert from "node:assert";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { getBasicBundleConfig, writeRootBundleConfig } from "./utils/bundle-fixtures.ts";
import {
    executeCommandWhenAvailable,
    waitForInput,
    waitForLogin,
    waitForNotification,
} from "./utils/configuration.ts";
import { dismissNotifications } from "./utils/dismiss-notifications.ts";
import { openFile } from "./utils/editor.ts";
import { samePath, vscodePath } from "./utils/paths.ts";
import { getTreeViewItems } from "./utils/view.ts";

/**
 * Debugging a file with Databricks Connect (RUN-05), the
 * Databricks environment of that debug session (RUN-06), the "Python
 * environment" row that reports it (RUN-10) and the autocomplete
 * builtins (PYENV-09), which no frozen spec covers. The frozen `run_dbconnect` spec walks the environment setup; this
 * one makes the `.venv` itself with `uv` (Python 3.12 and
 * databricks-connect 17.3, as the checklist installs for serverless) and
 * hands it to ms-python, so it is skipped without `uv`.
 */

function hasUv(): boolean {
    try {
        execFileSync("uv", ["--version"], { stdio: "ignore", shell: process.platform === "win32" });
        return true;
    } catch {
        return false;
    }
}

describe("Debug a file with Databricks Connect", async function () {
    let root: string;
    let python: string;

    this.timeout(15 * 60 * 1000);

    before(async function () {
        assert(process.env.WORKSPACE_PATH, "WORKSPACE_PATH doesn't exist");
        if (!hasUv()) {
            this.skip();
        }
        root = process.env.WORKSPACE_PATH;
        // requirements.txt routes the project to the external checklist.
        await fs.writeFile(path.join(root, "requirements.txt"), "databricks-connect~=17.3.0\n");
        await fs.writeFile(
            path.join(root, "debug_me.py"),
            [
                `import json, os`,
                `rows = spark.sql('SELECT "hello debug"').toPandas().to_dict("records")`,
                `env = {k: v for k, v in os.environ.items() if k.startswith("DATABRICKS_")}`,
                `json.dump({"rows": rows, "env": env}, open(os.path.join(os.getcwd(), "debug-output.json"), "w"))`,
            ].join("\n"),
        );
        await writeRootBundleConfig(getBasicBundleConfig({}, false), root);
        // --seed: the checklist lists the packages with pip.
        execFileSync("uv", ["venv", "--seed", "--python", "3.12", path.join(root, ".venv")], {
            stdio: "inherit",
            shell: process.platform === "win32",
        });
        python = path.join(
            root,
            ".venv",
            process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
        );
        execFileSync("uv", ["pip", "install", "--python", python, "databricks-connect~=17.3.0"], {
            stdio: "inherit",
            shell: process.platform === "win32",
        });
    });

    it("should be ready with serverless compute and the .venv", async () => {
        await waitForLogin("DEFAULT");
        await dismissNotifications();
        await executeCommandWhenAvailable("Databricks: Configure compute");
        await (await waitForInput()).selectQuickPick("Serverless");
        await browser.executeWorkbench(
            async (vscode, interpreter: string, folder: string) => {
                const api = (await vscode.extensions
                    .getExtension("ms-python.python")
                    ?.activate()) as
                    | {
                          environments: {
                              updateActiveEnvironmentPath(
                                  p: string,
                                  resource?: unknown,
                              ): Promise<void>;
                          };
                      }
                    | undefined;
                await api?.environments.updateActiveEnvironmentPath(
                    interpreter,
                    vscode.Uri.file(folder),
                );
            },
            python,
            root,
        );
        await browser.waitUntil(
            async () => {
                await browser.executeWorkbench(async (vscode) => {
                    await vscode.commands.executeCommand("databricks.environment.refresh");
                });
                const items = await getTreeViewItems("PROJECT", "Python Environment");
                const labels = await Promise.all(items.map((i) => i.getLabel()));
                return labels.some((l) => l.includes("Databricks Connect:"));
            },
            {
                timeout: 180_000,
                interval: 5_000,
                timeoutMsg: "The checklist never found Databricks Connect in the .venv",
            },
        );
    });

    it("should write the Databricks builtins for autocompletion (PYENV-09)", async () => {
        const builtins = path.join(root, "__builtins__.pyi");
        await executeCommandWhenAvailable(
            "Databricks: Configure autocomplete for Databricks globals",
        );
        // The extension names it from the workspace folder's path, as VS Code spells it.
        await waitForNotification(`Create ${vscodePath(builtins)}?`, "Continue");
        const text = await browser.waitUntil(
            () => fs.readFile(builtins, "utf-8").catch(() => false as const),
            {
                timeout: 30_000,
                timeoutMsg: "No __builtins__.pyi was written",
            },
        );
        assert(
            text.includes("dbutils") && text.includes("spark"),
            "__builtins__.pyi doesn't declare spark and dbutils",
        );
    });

    it("should debug the file with the project's Databricks connection (RUN-05, RUN-06)", async () => {
        // Records the session's configuration as the debugger resolves it.
        await browser.executeWorkbench((vscode) => {
            const g = globalThis as { e2eDebugSessions?: unknown[] };
            g.e2eDebugSessions = [];
            vscode.debug.onDidStartDebugSession((s: { type: string; configuration: unknown }) =>
                g.e2eDebugSessions!.push({ type: s.type, configuration: s.configuration }),
            );
        });
        await openFile("debug_me.py");
        await executeCommandWhenAvailable("Databricks: Debug current file with Databricks Connect");
        const output = path.join(root, "debug-output.json");
        const result = await browser.waitUntil(
            () => fs.readFile(output, "utf-8").catch(() => false as const),
            {
                timeout: 300_000,
                interval: 2_000,
                timeoutMsg: "The debugged file wrote no output",
            },
        );
        const { rows, env } = JSON.parse(result) as {
            rows: Record<string, string>[];
            env: Record<string, string>;
        };
        assert.deepStrictEqual(Object.values(rows[0] ?? {}), ["hello debug"]);
        assert(
            env.DATABRICKS_CONFIG_PROFILE === "DEFAULT" || env.DATABRICKS_HOST !== undefined,
            `No Databricks connection in the session: ${Object.keys(env).join(", ")}`,
        );
        const sessions = (await browser.executeWorkbench(
            () => (globalThis as { e2eDebugSessions?: unknown[] }).e2eDebugSessions,
        )) as
            | {
                  type: string;
                  configuration: { databricks?: boolean; program?: string; args?: string[] };
              }[]
            | undefined;
        const session = sessions?.find((s) => s.configuration.databricks === true);
        assert(session, `No Databricks debug session started: ${JSON.stringify(sessions)}`);
        assert.strictEqual(session.type, "debugpy");
        // The provider runs the file through the bootstrap, which sets up `spark` (RUN-06).
        assert.strictEqual(
            path.basename(session.configuration.program ?? ""),
            "dbconnect-bootstrap.py",
        );
        assert(
            (session.configuration.args ?? []).some((a) =>
                samePath(a, path.join(root, "debug_me.py")),
            ),
            `The file isn't the bootstrap's argument: ${JSON.stringify(session.configuration.args)}`,
        );
    });
});
