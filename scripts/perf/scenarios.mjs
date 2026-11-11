// The scenarios of trace.mjs: what each one opens, and the steps it runs in
// the extension host. A step's body is the source of an async function that
// gets the hook's helpers as `perf` and the run's `params` (hook.mjs says
// what the helpers do).

/** Activation, sign-in, then validate and summary when signed in, until the extension is idle. */
const STARTUP = {
    name: "startup",
    timeoutMs: 300_000,
    body: `
        const end = perf.step("startup");
        await perf.waitFor(() => perf.activated, 120000);
        await perf.waitFor(() => perf.connection === "CONNECTED" || perf.connection === "DISCONNECTED", 60000);
        if (perf.connection === "CONNECTED") {
            await perf.waitFor(() => perf.ran("bundle summary"), 180000);
        }
        await perf.quiet(3000, 120000);
        end();`,
};

/** A step that runs one command of the extension, then waits until the extension is idle. */
function commandStep(
    name,
    command,
    { args = "", before = "", after = "", timeoutMs = 120_000 } = {},
) {
    return {
        name,
        timeoutMs: timeoutMs + 30_000,
        body: `
        ${before}
        const end = perf.step(${JSON.stringify(name)});
        await perf.command(${JSON.stringify(command)}${args});
        ${after}
        await perf.quiet(2000, ${timeoutMs});
        end();`,
    };
}

/** What each scenario opens and does. `params` has `extensionDir`, `extensionId`, `profile` and `pythonFile`. */
export const SCENARIOS = {
    activation: {
        folder: false,
        profile: false,
        steps: () => [
            {
                name: "startup",
                timeoutMs: 120_000,
                body: `
        const end = perf.step("startup");
        // Once the host's own startup activations are over, only the extension's chain runs.
        await perf.extensionsIdle(1000, 60000);
        const trigger = perf.step("trigger: activate the extension");
        await perf.vscodeFor(params.extensionDir).extensions.getExtension(params.extensionId).activate();
        trigger();
        await perf.waitFor(() => perf.connection === "DISCONNECTED", 30000);
        end();`,
            },
        ],
    },
    empty: {
        folder: false,
        profile: false,
        steps: () => [
            {
                name: "startup",
                timeoutMs: 120_000,
                body: `
        const end = perf.step("startup");
        if (!(await perf.waitFor(() => perf.activated, 20000))) {
            const trigger = perf.step("trigger: list chat models");
            await perf.vscodeFor(params.extensionDir).lm.selectChatModels();
            trigger();
            await perf.waitFor(() => perf.activated, 60000);
        }
        await perf.waitFor(() => perf.connection === "CONNECTED" || perf.connection === "DISCONNECTED", 30000);
        await perf.quiet(3000, 60000);
        end();`,
            },
        ],
    },
    startup: {
        folder: true,
        profile: true,
        steps: () => [
            STARTUP,
            // The views list their roots when they show: opening the sidebar shows them together.
            commandStep(
                "Open the Databricks sidebar: first listings",
                "workbench.view.extension.databricksBar",
            ),
        ],
    },
    commands: {
        folder: true,
        profile: true,
        steps: (params) => [
            STARTUP,
            commandStep("Show bundle logs", "databricks.bundle.showLogs"),
            commandStep(
                "Select compute: picker loads",
                "databricks.connection.attachClusterQuickPick",
                {
                    before: `perf.rules.push({ action: "hideWhenLoaded" });`,
                },
            ),
            commandStep(
                "Sign in: wizard, existing profile",
                "databricks.connection.configureLogin",
                {
                    before: `perf.rules.push({ action: "accept", match: ${JSON.stringify(escapeRegExp(params.profile))} });`,
                    after: `await perf.waitFor(() => perf.connection === "CONNECTED", 60000);`,
                },
            ),
            commandStep("Python environment checks", "databricks.environment.refresh", {
                timeoutMs: 300_000,
            }),
            commandStep("Deploy bundle", "databricks.bundle.deploy", { timeoutMs: 600_000 }),
            commandStep(
                "Run File as Workflow (serverless)",
                "databricks.run.runEditorContentsAsWorkflow",
                {
                    before: `const terminated = new Promise((resolve) => {
            const subscription = perf.vscode.debug.onDidTerminateDebugSession(() => {
                subscription.dispose();
                resolve();
            });
        });`,
                    args: `, perf.vscode.Uri.file(${JSON.stringify(params.pythonFile)})`,
                    after: `await Promise.race([terminated, new Promise((resolve) => setTimeout(resolve, 900000))]);`,
                    timeoutMs: 900_000,
                },
            ),
            commandStep("Destroy bundle", "databricks.bundle.destroy", {
                args: ", false, false",
                timeoutMs: 600_000,
            }),
        ],
    },
};

function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The expression that runs a step in the extension host, where `globalThis.__perf` is the hook's. */
export function stepExpression(step, params) {
    return `(async (perf, params) => {${step.body}\n})(globalThis.__perf, ${JSON.stringify(params)})`;
}

/** The bundle the startup and commands scenarios open: one job, a development target on `host`. */
export function projectFiles(host) {
    return {
        "databricks.yml": [
            "bundle:",
            "  name: perf-trace",
            "",
            "resources:",
            "  jobs:",
            "    perf_audit_job:",
            "      name: perf_audit_job",
            "      tasks:",
            "        - task_key: main",
            "          spark_python_task:",
            "            python_file: ./src/main.py",
            "          environment_key: default",
            "      environments:",
            "        - environment_key: default",
            "          spec:",
            '            environment_version: "2"',
            "",
            "targets:",
            "  dev:",
            "    mode: development",
            "    default: true",
            "    workspace:",
            `      host: ${host}`,
            "",
        ].join("\n"),
        "src/main.py": 'print("perf audit")\n',
    };
}
