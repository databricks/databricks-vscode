import {
    window,
    commands,
    ProgressLocation,
    Progress,
    CancellationToken,
    Uri,
    OutputChannel,
    Disposable,
    ExtensionContext,
    EventEmitter,
} from "vscode";
import {spawn, ChildProcessWithoutNullStreams} from "child_process";
import * as fs from "fs";
import * as path from "path";
import {MsPythonExtensionWrapper} from "./MsPythonExtensionWrapper";
import {NamedLogger} from "@databricks/sdk-experimental/dist/logging";
import {Loggers} from "../logger";

// ---------------------------------------------------------------------------
// VPEX environment setup
//
// A self-contained parallel entry point that drives the real
// `databricks dbconnect` CLI from real UI: a pre-flight confirmation, a
// phase-aware progress notification, an output channel for raw logs,
// result/error pop-ups, and auto-adoption of the resulting `.venv` via the
// MS Python extension.
//
// It runs, in the open project folder:
//   databricks dbconnect init --serverless <ver> --profile <profile>
//   databricks dbconnect sync --serverless <ver> --profile <profile>
//
// This is a demo flow kept separate from the FeatureManager-driven
// `databricks.environment.setup` command.
// ---------------------------------------------------------------------------

// DEMO/POC: the `dbconnect` subcommand only exists in the dev CLI build, not in
// the CLI currently bundled with the extension (v1.2.0). Point at the dev
// binary explicitly until `dbconnect` ships in the bundled CLI, at which point
// this should switch to CliWrapper.cliPath.
const CLI_PATH = "/Users/grigory.panov/work/cli/bin/databricks";

const OVERRIDES_REL = path.join(
    ".databricks",
    "bundle",
    "dev",
    "vscode.overrides.json"
);
const VENV_PYTHON_REL = path.join(".venv", "bin", "python"); // macOS only

// Serverless version the demo provisions. The serverless env version isn't
// recorded in the project, so we pin it (matches dbconnect-init.sh's default).
const SERVERLESS_VERSION = "v4";

// Human-readable matched state shown after a successful run.
const MATCHED_TARGET = "serverless-v4";
const MATCHED_PYTHON = "3.12";
const MATCHED_DBCONNECT = "17.3";

const PHASE_RE = /===\s*Phase\s+(\S+):\s*(.+?)\s*===/;

interface Target {
    serverless: boolean;
    authProfile: string;
}

interface CommandResult {
    code: number | null;
    stdout: string;
    stderr: string;
    canceled: boolean;
}

export class VpexEnvironmentSetup implements Disposable {
    private outputChannel: OutputChannel;
    private disposables: Disposable[] = [];

    /**
     * Set after a successful setup so a status bar item or tree node can
     * reflect the freshly matched environment.
     */
    private _ready = false;
    public get ready(): boolean {
        return this._ready;
    }

    // Fired whenever `ready` changes, so observers (status bar, tree) refresh.
    private readonly onDidChangeStateEmitter = new EventEmitter<void>();
    public readonly onDidChangeState = this.onDidChangeStateEmitter.event;

    constructor(
        private readonly context: ExtensionContext,
        private readonly pythonExtension: MsPythonExtensionWrapper
    ) {
        this.outputChannel = window.createOutputChannel("VPEX Demo");
        this.disposables.push(this.outputChannel, this.onDidChangeStateEmitter);
    }

    private get projectDir(): string {
        return this.pythonExtension.projectRoot;
    }

    async setup() {
        const projectDir = this.projectDir;
        if (!projectDir) {
            this.showFailure(
                "No workspace folder is open. Open the project folder and try again."
            );
            return;
        }

        if (!fs.existsSync(CLI_PATH)) {
            this.showFailure(
                `Databricks CLI not found at ${CLI_PATH}. ` +
                    "The dbconnect subcommand requires the dev CLI build."
            );
            return;
        }

        // --- Pre-flight: detect target from the .databricks overrides ------
        const target = this.detectTarget(projectDir);
        const targetLabel = target.serverless
            ? `serverless (→ ${MATCHED_TARGET})`
            : "cluster";

        const confirm = await window.showInformationMessage(
            `Detected target: ${targetLabel}, profile "${target.authProfile}".\n\nSet up ${MATCHED_TARGET} environment?`,
            {modal: true},
            "Set up"
        );
        if (confirm !== "Set up") {
            // Cancel aborts quietly.
            return;
        }

        // --- Run the CLI with a phase-aware progress notification ----------
        // init: create pyproject.toml + provision .venv.
        // sync: merge managed dependencies + re-provision.
        const profile = target.authProfile;
        const commonArgs = [
            "--serverless",
            SERVERLESS_VERSION,
            "--profile",
            profile,
        ];
        const steps: {label: string; args: string[]}[] = [
            {label: "init", args: ["dbconnect", "init", ...commonArgs]},
            {label: "sync", args: ["dbconnect", "sync", ...commonArgs]},
        ];

        this.outputChannel.clear();

        const result = await window.withProgress(
            {
                location: ProgressLocation.Notification,
                title: "Databricks: setting up Python environment",
                cancellable: true,
            },
            async (progress, token) => {
                let last: CommandResult = {
                    code: 0,
                    stdout: "",
                    stderr: "",
                    canceled: false,
                };
                for (const step of steps) {
                    if (token.isCancellationRequested) {
                        return {...last, canceled: true};
                    }
                    progress.report({
                        message: `Running dbconnect ${step.label}…`,
                    });
                    this.outputChannel.appendLine(
                        `$ ${CLI_PATH} ${step.args.join(" ")}`
                    );
                    this.outputChannel.appendLine(`  cwd: ${projectDir}`);
                    this.outputChannel.appendLine("");
                    last = await this.runCli(
                        step.args,
                        projectDir,
                        step.label,
                        progress,
                        token
                    );
                    this.outputChannel.appendLine("");
                    // Stop the sequence on cancellation or failure.
                    if (last.canceled || last.code !== 0) {
                        return last;
                    }
                }
                return last;
            }
        );

        if (result.canceled) {
            window.showWarningMessage("VPEX: environment setup canceled.");
            return;
        }

        if (result.code !== 0) {
            const tail = this.tailLines(result.stderr || result.stdout, 6);
            this.showFailure(
                `Setup failed (exit code ${result.code}).\n${tail}`
            );
            return;
        }

        // --- Success: auto-adopt the interpreter, then announce ------------
        await this.adoptInterpreter(projectDir);
        this._ready = true;
        this.onDidChangeStateEmitter.fire();

        const choice = await window.showInformationMessage(
            `Environment ready: ${MATCHED_TARGET} (Python ${MATCHED_PYTHON}, databricks-connect ${MATCHED_DBCONNECT}).`,
            "Select Interpreter",
            "Show Logs"
        );
        if (choice === "Select Interpreter") {
            await commands.executeCommand(
                "databricks.environment.selectPythonInterpreter"
            );
        } else if (choice === "Show Logs") {
            this.outputChannel.show(true);
        }
    }

    async showVersions() {
        const projectDir = this.projectDir;
        if (!projectDir) {
            window.showErrorMessage("VPEX: no workspace folder is open.");
            return;
        }
        const venvPython = path.join(projectDir, VENV_PYTHON_REL);
        if (!fs.existsSync(venvPython)) {
            window.showErrorMessage(
                "VPEX: no .venv found yet — run 'Set up Python Environment' first."
            );
            return;
        }

        const code =
            "import sys, databricks.connect as c; " +
            "print('Python ' + sys.version.split()[0]); " +
            "print('databricks-connect ' + getattr(c, '__version__', 'unknown'))";

        const result = await new Promise<{out: string; code: number | null}>(
            (resolve) => {
                const child = spawn(venvPython, ["-c", code], {
                    cwd: projectDir,
                });
                let out = "";
                child.stdout.on("data", (b: Buffer) => (out += b.toString()));
                child.stderr.on("data", (b: Buffer) => (out += b.toString()));
                child.on("close", (c2) => resolve({out, code: c2}));
                child.on("error", (e) => resolve({out: e.message, code: 1}));
            }
        );

        if (result.code !== 0) {
            window.showErrorMessage(
                `VPEX: could not read versions: ${result.out.trim()}`
            );
            return;
        }
        window.showInformationMessage(
            `Matched environment:\n${result.out.trim()}`,
            {modal: true}
        );
    }

    // -----------------------------------------------------------------------
    // CLI runner
    // -----------------------------------------------------------------------

    private runCli(
        args: string[],
        cwd: string,
        stepLabel: string,
        progress: Progress<{message?: string; increment?: number}>,
        token: CancellationToken
    ): Promise<CommandResult> {
        return new Promise<CommandResult>((resolve) => {
            let child: ChildProcessWithoutNullStreams;
            try {
                child = spawn(CLI_PATH, args, {cwd, env: process.env});
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                resolve({code: 1, stdout: "", stderr: msg, canceled: false});
                return;
            }

            let stdout = "";
            let stderr = "";
            let canceled = false;

            const cancelSub = token.onCancellationRequested(() => {
                canceled = true;
                this.outputChannel.appendLine(
                    "\n[VPEX] Cancellation requested — killing process…"
                );
                child.kill("SIGTERM");
                setTimeout(() => {
                    if (!child.killed) {
                        child.kill("SIGKILL");
                    }
                }, 2000);
            });

            // Phase lines can arrive split across chunks; buffer by line.
            let lineBuf = "";
            const handlePhaseText = (text: string) => {
                lineBuf += text;
                let idx: number;
                while ((idx = lineBuf.indexOf("\n")) >= 0) {
                    const line = lineBuf.slice(0, idx);
                    lineBuf = lineBuf.slice(idx + 1);
                    // Strip ANSI color codes the CLI emits.
                    // eslint-disable-next-line no-control-regex
                    const clean = line.replace(/\x1b\[[0-9;]*m/g, "");
                    const m = PHASE_RE.exec(clean);
                    if (m) {
                        progress.report({
                            message: this.friendlyPhase(stepLabel, m[2]),
                        });
                    }
                }
            };

            child.stdout.on("data", (buf: Buffer) => {
                const text = buf.toString();
                stdout += text;
                this.outputChannel.append(text);
                handlePhaseText(text);
            });

            child.stderr.on("data", (buf: Buffer) => {
                const text = buf.toString();
                stderr += text;
                this.outputChannel.append(text);
            });

            child.on("error", (err) => {
                cancelSub.dispose();
                resolve({
                    code: 1,
                    stdout,
                    stderr: stderr + `\n[spawn error] ${err.message}`,
                    canceled,
                });
            });

            child.on("close", (code) => {
                cancelSub.dispose();
                resolve({code, stdout, stderr, canceled});
            });
        });
    }

    // Map raw `=== Phase N: <name> ===` headers from `databricks dbconnect`
    // to narrated progress messages, prefixed with the current step.
    private friendlyPhase(stepLabel: string, name: string): string {
        const prefix = `dbconnect ${stepLabel}`;
        const lower = name.toLowerCase();
        if (lower.includes("preflight")) {
            return `${prefix}: checking prerequisites…`;
        }
        if (lower.includes("resolve")) {
            return `${prefix}: resolving target…`;
        }
        if (lower.includes("fetch")) {
            return `${prefix}: fetching constraints…`;
        }
        if (lower.includes("parse-python-version")) {
            return `${prefix}: reading Python version…`;
        }
        if (lower.includes("plan")) {
            return `${prefix}: planning pyproject.toml changes…`;
        }
        if (lower.includes("apply")) {
            return `${prefix}: applying pyproject.toml changes…`;
        }
        if (lower.includes("ensure-python")) {
            return `${prefix}: installing Python via uv…`;
        }
        if (lower.includes("provision")) {
            return `${prefix}: provisioning .venv via uv…`;
        }
        if (lower.includes("validate")) {
            return `${prefix}: validating environment…`;
        }
        return `${prefix}: ${name}`;
    }

    // -----------------------------------------------------------------------
    // Target detection
    // -----------------------------------------------------------------------

    private detectTarget(projectDir: string): Target {
        const fallback: Target = {serverless: true, authProfile: "dev"};
        try {
            const raw = fs.readFileSync(
                path.join(projectDir, OVERRIDES_REL),
                "utf8"
            );
            const json = JSON.parse(raw);
            return {
                serverless: json.serverless === true,
                authProfile:
                    typeof json.authProfile === "string"
                        ? json.authProfile
                        : "dev",
            };
        } catch (e) {
            this.outputChannel.appendLine(
                `[VPEX] Could not read ${OVERRIDES_REL}; assuming serverless/dev.`
            );
            return fallback;
        }
    }

    // -----------------------------------------------------------------------
    // Interpreter adoption via the MS Python extension API
    // -----------------------------------------------------------------------

    private async adoptInterpreter(projectDir: string): Promise<void> {
        const venvPython = path.join(projectDir, VENV_PYTHON_REL);
        if (!fs.existsSync(venvPython)) {
            this.outputChannel.appendLine(
                `[VPEX] Expected interpreter not found at ${venvPython}; skipping auto-select.`
            );
            return;
        }

        const environments = this.pythonExtension.api?.environments;
        if (!environments) {
            this.outputChannel.appendLine(
                "[VPEX] Python extension API unavailable; skipping auto-select. " +
                    "Pick the interpreter manually via 'Change Python environment'."
            );
            window.showWarningMessage(
                "VPEX: Python extension not available — please select the .venv interpreter manually."
            );
            return;
        }

        try {
            this.outputChannel.appendLine(
                "[VPEX] Refreshing Python environments…"
            );
            await environments.refreshEnvironments();

            this.outputChannel.appendLine(
                `[VPEX] Selecting interpreter: ${venvPython}`
            );
            await environments.updateActiveEnvironmentPath(
                venvPython,
                Uri.file(projectDir)
            );
            this.outputChannel.appendLine("[VPEX] Interpreter adopted.");
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this.outputChannel.appendLine(`[VPEX] Auto-select failed: ${msg}`);
            NamedLogger.getOrCreate(Loggers.Extension).error(
                "VPEX interpreter auto-select failed",
                err
            );
            window.showWarningMessage(
                "VPEX: could not auto-select the interpreter — please pick .venv manually."
            );
        }
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    private showFailure(message: string): void {
        window
            .showErrorMessage(`VPEX: ${message}`, "Show Logs")
            .then((choice) => {
                if (choice === "Show Logs") {
                    this.outputChannel.show(true);
                }
            });
    }

    private tailLines(text: string, n: number): string {
        const lines = text
            // eslint-disable-next-line no-control-regex
            .replace(/\x1b\[[0-9;]*m/g, "")
            .split("\n")
            .filter((l) => l.trim().length > 0);
        return lines.slice(-n).join("\n");
    }

    dispose() {
        this.disposables.forEach((d) => d.dispose());
    }
}
