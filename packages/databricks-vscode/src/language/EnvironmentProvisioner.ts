import {
    CancellationToken,
    Disposable,
    OutputChannel,
    Progress,
    ProgressLocation,
    commands,
    window,
} from "vscode";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {MsPythonExtensionWrapper} from "./MsPythonExtensionWrapper";
import {WorkspaceFolderManager} from "../vscode-objs/WorkspaceFolderManager";
import {UvBinaryProvider} from "./UvBinaryProvider";
import {workspaceConfigs} from "../vscode-objs/WorkspaceConfigs";
import {ComputeTargetSpec, resolveComputeTargetSpec} from "./computeTargetSpec";
import {cancellableExecFile} from "../cli/CliWrapper";
import {Mutex} from "../locking";
import {Events, Telemetry} from "../telemetry";
import {NamedLogger} from "@databricks/sdk-experimental/dist/logging";
import {Loggers} from "../logger";

export type ProvisionFailureClass =
    | "networkBlocked"
    | "uvUnavailable"
    | "pythonUnavailable"
    | "disk"
    | "cancelled"
    | "unknown";

export type ProvisionStep =
    | "uvAcquire"
    | "pythonInstall"
    | "venvCreate"
    | "depsInstall"
    | "interpreterSet";

export type VenvDisposition = "satisfied" | "repair" | "recreate" | "absent";

export interface ProvisionResult {
    success: boolean;
    /**
     * True when the provisioner decided not to act (unsupported compute,
     * user chose manual setup): callers should fall back to the manual
     * setup flow.
     */
    noOp?: boolean;
    failureClass?: ProvisionFailureClass;
    failedStep?: ProvisionStep;
    message?: string;
}

export class ProvisionError extends Error {
    constructor(
        message: string,
        public readonly failureClass: ProvisionFailureClass
    ) {
        super(message);
    }
}

class ProvisionStepError extends Error {
    constructor(
        public readonly step: ProvisionStep,
        public readonly cause: unknown
    ) {
        super(cause instanceof Error ? cause.message : String(cause));
    }
}

export function venvPythonExecutable(
    venvDir: string,
    platform: NodeJS.Platform = process.platform
): string {
    return platform === "win32"
        ? path.join(venvDir, "Scripts", "python.exe")
        : path.join(venvDir, "bin", "python");
}

/**
 * uv doesn't read pip configuration files, so we look up a custom index-url
 * configured for pip and pass it to uv explicitly.
 */
export function readPipIndexUrl(
    platform: NodeJS.Platform = process.platform,
    env: NodeJS.ProcessEnv = process.env,
    homeDir: string = os.homedir()
): string | undefined {
    const candidates: string[] = [];
    if (env.PIP_CONFIG_FILE) {
        candidates.push(env.PIP_CONFIG_FILE);
    }
    if (platform === "win32") {
        if (env.APPDATA) {
            candidates.push(path.join(env.APPDATA, "pip", "pip.ini"));
        }
        candidates.push(path.join(homeDir, "pip", "pip.ini"));
    } else {
        candidates.push(
            path.join(
                env.XDG_CONFIG_HOME ?? path.join(homeDir, ".config"),
                "pip",
                "pip.conf"
            ),
            path.join(homeDir, ".pip", "pip.conf"),
            "/etc/pip.conf"
        );
    }
    for (const candidate of candidates) {
        let content: string;
        try {
            content = fs.readFileSync(candidate, "utf-8");
        } catch {
            continue;
        }
        const match = content.match(/^\s*index-url\s*=\s*(\S+)/m);
        if (match) {
            return match[1];
        }
    }
    return undefined;
}

/**
 * Environment for uv child processes: forwards the user's proxy and index
 * settings and maps pip's index configuration to uv's, which doesn't read
 * PIP_* variables or pip.conf.
 */
export function buildProvisionEnv(
    baseEnv: NodeJS.ProcessEnv = process.env,
    pipIndexUrl: string | undefined = undefined
): NodeJS.ProcessEnv {
    const env = {...baseEnv};
    if (!env.UV_INDEX_URL) {
        const indexUrl = env.PIP_INDEX_URL ?? pipIndexUrl;
        if (indexUrl) {
            env.UV_INDEX_URL = indexUrl;
        }
    }
    return env;
}

export function classifyProvisionFailure(e: unknown): ProvisionFailureClass {
    if (e instanceof ProvisionError) {
        return e.failureClass;
    }
    const message = e instanceof Error ? e.message : String(e);
    if (
        (e instanceof Error && e.name === "AbortError") ||
        message.includes("ABORT_ERR")
    ) {
        return "cancelled";
    }
    if (/ENOSPC|[Nn]o space left/.test(message)) {
        return "disk";
    }
    if (
        /[Nn]o download found for|[Nn]o interpreter found for|managed Python download/.test(
            message
        )
    ) {
        return "pythonUnavailable";
    }
    if (
        /error sending request|[Cc]onnection (refused|reset)|certificate|tls|timed out|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|proxy|403|407|503/.test(
            message
        )
    ) {
        return "networkBlocked";
    }
    return "unknown";
}

const failureMessages: Record<ProvisionFailureClass, string> = {
    networkBlocked:
        "Your network seems to block the package index or interpreter downloads. " +
        "If you use a proxy or a package mirror, set HTTPS_PROXY, UV_INDEX_URL " +
        "(or pip.conf index-url) and UV_PYTHON_INSTALL_MIRROR, then retry.",
    uvUnavailable:
        "The extension could not find or download the uv tool used to set up " +
        "Python environments. Install uv (https://docs.astral.sh/uv/) and retry, " +
        "or set up the environment manually.",
    pythonUnavailable:
        "A matching Python interpreter is not available and could not be downloaded. " +
        "Install the required Python version and retry.",
    disk: "Not enough disk space to set up the Python environment.",
    cancelled: "",
    unknown: "Failed to set up the Python environment.",
};

interface VenvAssessment {
    disposition: VenvDisposition | "manual";
    pythonMatches: boolean;
    /** Whether .venv was created by this extension (has our marker file) */
    managed: boolean;
}

/**
 * Provisions a Python environment matching the selected compute using uv:
 * downloads a suitable interpreter, creates the project .venv, installs
 * databricks-connect and the project's own dependencies, and selects the
 * interpreter in the MS Python extension. Gated behind the
 * "python.managedEnvironment" experimental setting.
 */
export class EnvironmentProvisioner implements Disposable {
    private readonly logger = NamedLogger.getOrCreate(Loggers.Extension);
    private readonly mutex = new Mutex();
    private readonly disposables: Disposable[] = [];
    private _outputChannel?: OutputChannel;

    constructor(
        private readonly connectionManager: ConnectionManager,
        private readonly pythonExtension: MsPythonExtensionWrapper,
        private readonly workspaceFolderManager: WorkspaceFolderManager,
        private readonly uvProvider: UvBinaryProvider,
        private readonly telemetry: Telemetry,
        private readonly execFn: typeof cancellableExecFile = cancellableExecFile
    ) {}

    get enabled(): boolean {
        return workspaceConfigs.managedPythonEnvironmentEnabled;
    }

    private get outputChannel() {
        if (!this._outputChannel) {
            this._outputChannel = window.createOutputChannel(
                "Databricks Python Environment"
            );
            this.disposables.push(this._outputChannel);
        }
        return this._outputChannel;
    }

    private get projectRoot() {
        return this.workspaceFolderManager.activeProjectUri.fsPath;
    }

    private get venvDir() {
        return path.join(this.projectRoot, ".venv");
    }

    private get markerPath() {
        return path.join(this.venvDir, "databricks.json");
    }

    async ensureEnvironment(): Promise<ProvisionResult> {
        await this.mutex.wait();
        try {
            return await this.ensureEnvironmentImpl();
        } finally {
            this.mutex.signal();
        }
    }

    private resolveSpec(): ComputeTargetSpec | undefined {
        return resolveComputeTargetSpec({
            serverless: this.connectionManager.serverless,
            serverlessDbconnectVersion:
                workspaceConfigs.serverlessDbconnectVersion,
            dbrVersion: this.connectionManager.cluster?.dbrVersion,
        });
    }

    private async ensureEnvironmentImpl(): Promise<ProvisionResult> {
        const spec = this.resolveSpec();
        if (!spec) {
            return {success: false, noOp: true};
        }
        const venvPython = venvPythonExecutable(this.venvDir);
        const assessment = await this.assessVenv(spec, venvPython);
        if (assessment.disposition === "manual") {
            return {success: false, noOp: true};
        }

        const computeTitle =
            spec.computeType === "serverless"
                ? "Serverless"
                : "the selected cluster";
        const result = await window.withProgress(
            {
                location: ProgressLocation.Notification,
                title: `Databricks: Setting up Python environment for ${computeTitle} (Python ${spec.pythonVersion.display})`,
                cancellable: true,
            },
            (progress, token) =>
                this.provision(spec, assessment, venvPython, progress, token)
        );
        if (!result.success && !result.noOp) {
            this.reportFailure(result);
        }
        return result;
    }

    private async assessVenv(
        spec: ComputeTargetSpec,
        venvPython: string
    ): Promise<VenvAssessment> {
        const managed = fs.existsSync(this.markerPath);
        if (!fs.existsSync(this.venvDir)) {
            return {disposition: "absent", pythonMatches: false, managed};
        }
        const pythonMatches = await this.venvPythonMatches(spec, venvPython);
        const depsMatch =
            pythonMatches && (await this.venvDepsMatch(spec, venvPython));
        if (pythonMatches && depsMatch) {
            return {disposition: "satisfied", pythonMatches, managed};
        }
        if (managed) {
            return {
                disposition: pythonMatches ? "repair" : "recreate",
                pythonMatches,
                managed,
            };
        }
        const disposition = await this.promptForeignVenv(spec, pythonMatches);
        return {disposition, pythonMatches, managed};
    }

    private async venvPythonMatches(
        spec: ComputeTargetSpec,
        venvPython: string
    ): Promise<boolean> {
        if (!fs.existsSync(venvPython)) {
            return false;
        }
        try {
            const {stdout} = await this.execFn(
                venvPython,
                ["-c", "import sys; print('%d.%d' % sys.version_info[:2])"],
                {shell: false}
            );
            return stdout.trim() === spec.pythonVersion.display;
        } catch {
            return false;
        }
    }

    private async venvDepsMatch(
        spec: ComputeTargetSpec,
        venvPython: string
    ): Promise<boolean> {
        try {
            const {stdout} = await this.execFn(
                venvPython,
                [
                    "-c",
                    "import importlib.metadata as m; print(m.version('databricks-connect'))",
                ],
                {shell: false}
            );
            // "17.3.*" should match an installed 17.3.x
            const expectedPrefix = spec.dbconnectVersion.replace(/\.?\*$/, "");
            const installed = stdout.trim();
            return (
                installed === expectedPrefix ||
                installed.startsWith(`${expectedPrefix}.`)
            );
        } catch {
            return false;
        }
    }

    /**
     * The .venv exists but wasn't created by this extension: never modify it
     * without an explicit user decision.
     */
    protected async promptForeignVenv(
        spec: ComputeTargetSpec,
        pythonMatches: boolean
    ): Promise<VenvDisposition | "manual"> {
        const repairChoice = "Install into .venv";
        const recreateChoice = "Recreate .venv";
        const manualChoice = "Set up manually";
        const choices = pythonMatches
            ? [repairChoice, recreateChoice, manualChoice]
            : [recreateChoice, manualChoice];
        const detail = pythonMatches
            ? `The project .venv is missing the dependencies for Databricks Connect (databricks-connect ${spec.dbconnectVersion}).`
            : `The project .venv doesn't match the selected compute: Python ${spec.pythonVersion.display} is required. Recreating will delete the existing .venv.`;
        const choice = await window.showWarningMessage(
            `Update the existing Python environment for Databricks Connect?`,
            {modal: true, detail},
            ...choices
        );
        switch (choice) {
            case repairChoice:
                return "repair";
            case recreateChoice:
                return "recreate";
            default:
                return "manual";
        }
    }

    private async provision(
        spec: ComputeTargetSpec,
        assessment: VenvAssessment,
        venvPython: string,
        progress: Progress<{message?: string; increment?: number}>,
        token: CancellationToken
    ): Promise<ProvisionResult> {
        const disposition = assessment.disposition as VenvDisposition;
        const childEnv = buildProvisionEnv(process.env, readPipIndexUrl());
        let createdVenv = false;
        const start = Date.now();
        try {
            if (disposition !== "satisfied") {
                const uv = await this.runStep(spec, "uvAcquire", async () => {
                    progress.report({message: "locating uv", increment: 5});
                    const uvPath = await this.uvProvider.getUvPath(token);
                    if (!uvPath) {
                        throw new ProvisionError(
                            "uv is not available",
                            "uvUnavailable"
                        );
                    }
                    return uvPath;
                });
                this.throwIfCancelled(token);

                await this.runStep(spec, "pythonInstall", async () => {
                    progress.report({
                        message: `ensuring Python ${spec.pythonVersion.display} is installed`,
                        increment: 15,
                    });
                    await this.ensurePythonInterpreter(
                        uv,
                        spec,
                        childEnv,
                        token
                    );
                });
                this.throwIfCancelled(token);

                if (disposition !== "repair") {
                    await this.runStep(spec, "venvCreate", async () => {
                        progress.report({
                            message: "creating .venv",
                            increment: 15,
                        });
                        if (fs.existsSync(this.venvDir)) {
                            // Deleting is safe here: either we created this
                            // venv (marker file) or the user explicitly chose
                            // "Recreate" in promptForeignVenv.
                            await fs.promises.rm(this.venvDir, {
                                recursive: true,
                                force: true,
                            });
                        }
                        await this.uvExec(
                            uv,
                            [
                                "venv",
                                this.venvDir,
                                "--python",
                                spec.pythonVersion.display,
                                "--seed",
                            ],
                            childEnv,
                            token
                        );
                        createdVenv = true;
                    });
                    this.throwIfCancelled(token);
                }

                await this.runStep(spec, "depsInstall", async () => {
                    progress.report({
                        message: `installing databricks-connect ${spec.dbconnectVersion}`,
                        increment: 40,
                    });
                    await this.installDependencies(
                        uv,
                        spec,
                        venvPython,
                        childEnv,
                        token
                    );
                });
                this.throwIfCancelled(token);
            }

            await this.runStep(spec, "interpreterSet", async () => {
                progress.report({
                    message: "selecting the interpreter",
                    increment: 15,
                });
                if (createdVenv || assessment.managed) {
                    // Only tag environments we own: the marker is what allows
                    // silent recreation later, so a user-created venv must
                    // never get one.
                    this.writeMarker(spec);
                }
                await this.pythonExtension.api.environments.refreshEnvironments();
                await this.pythonExtension.api.environments.updateActiveEnvironmentPath(
                    venvPython
                );
            });

            this.recordTotal(spec, disposition, start, true);
            return {success: true};
        } catch (e) {
            this.logger.error("Failed to provision python environment", e);
            const step = e instanceof ProvisionStepError ? e.step : undefined;
            const cause = e instanceof ProvisionStepError ? e.cause : e;
            const failureClass = classifyProvisionFailure(cause);
            if (createdVenv) {
                // Don't leave behind a half-initialized venv we created.
                await fs.promises.rm(this.venvDir, {
                    recursive: true,
                    force: true,
                });
            }
            this.recordTotal(spec, disposition, start, false, failureClass);
            return {
                success: false,
                failureClass,
                failedStep: step,
                message: cause instanceof Error ? cause.message : String(cause),
            };
        }
    }

    private async ensurePythonInterpreter(
        uv: string,
        spec: ComputeTargetSpec,
        childEnv: NodeJS.ProcessEnv,
        token: CancellationToken
    ) {
        try {
            await this.uvExec(
                uv,
                ["python", "find", spec.pythonVersion.display],
                childEnv,
                token,
                false
            );
            return;
        } catch {
            // not found: fall through to install
        }
        await this.uvExec(
            uv,
            ["python", "install", spec.pythonVersion.display],
            childEnv,
            token
        );
    }

    private async installDependencies(
        uv: string,
        spec: ComputeTargetSpec,
        venvPython: string,
        childEnv: NodeJS.ProcessEnv,
        token: CancellationToken
    ) {
        const pipInstall = ["pip", "install", "--python", venvPython];
        await this.uvExec(
            uv,
            [
                ...pipInstall,
                `databricks-connect==${spec.dbconnectVersion}`,
                // Required for executing notebooks with %run magic
                "nbformat",
            ],
            childEnv,
            token
        );
        for (const requirements of [
            "requirements.txt",
            "requirements-dev.txt",
        ]) {
            const requirementsPath = path.join(this.projectRoot, requirements);
            if (fs.existsSync(requirementsPath)) {
                await this.uvExec(
                    uv,
                    [...pipInstall, "-r", requirementsPath],
                    childEnv,
                    token
                );
            }
        }
        const pyprojectPath = path.join(this.projectRoot, "pyproject.toml");
        if (
            fs.existsSync(pyprojectPath) &&
            /^\[project\]/m.test(fs.readFileSync(pyprojectPath, "utf-8"))
        ) {
            await this.uvExec(
                uv,
                [...pipInstall, "-r", pyprojectPath],
                childEnv,
                token
            );
        }
    }

    private async uvExec(
        uv: string,
        args: string[],
        childEnv: NodeJS.ProcessEnv,
        token: CancellationToken,
        log = true
    ) {
        if (log) {
            this.outputChannel.appendLine(`Running: ${uv} ${args.join(" ")}`);
        }
        const {stdout, stderr} = await this.execFn(
            uv,
            args,
            {cwd: this.projectRoot, env: childEnv, shell: false},
            token
        );
        if (log) {
            if (stdout.trim()) {
                this.outputChannel.appendLine(stdout.trim());
            }
            if (stderr.trim()) {
                this.outputChannel.appendLine(stderr.trim());
            }
        }
        return {stdout, stderr};
    }

    private writeMarker(spec: ComputeTargetSpec) {
        fs.writeFileSync(
            this.markerPath,
            JSON.stringify(
                {
                    createdBy: "databricks-vscode",
                    pythonVersion: spec.pythonVersion.display,
                    dbconnectVersion: spec.dbconnectVersion,
                    createdAt: new Date().toISOString(),
                },
                null,
                2
            )
        );
    }

    private throwIfCancelled(token: CancellationToken) {
        if (token.isCancellationRequested) {
            throw new ProvisionError("Setup was cancelled", "cancelled");
        }
    }

    private async runStep<T>(
        spec: ComputeTargetSpec,
        step: ProvisionStep,
        fn: () => Promise<T>
    ): Promise<T> {
        const start = Date.now();
        try {
            const result = await fn();
            this.telemetry.recordEvent(Events.MANAGED_ENV_SETUP, {
                step,
                success: true,
                computeType: spec.computeType,
                duration: Date.now() - start,
            });
            return result;
        } catch (e) {
            this.telemetry.recordEvent(Events.MANAGED_ENV_SETUP, {
                step,
                success: false,
                computeType: spec.computeType,
                failureClass: classifyProvisionFailure(e),
                duration: Date.now() - start,
            });
            throw new ProvisionStepError(step, e);
        }
    }

    private recordTotal(
        spec: ComputeTargetSpec,
        disposition: VenvDisposition,
        start: number,
        success: boolean,
        failureClass?: ProvisionFailureClass
    ) {
        this.telemetry.recordEvent(Events.MANAGED_ENV_SETUP, {
            step: "total",
            success,
            computeType: spec.computeType,
            failureClass,
            venvDisposition: disposition,
            duration: Date.now() - start,
        });
    }

    private reportFailure(result: ProvisionResult) {
        if (result.failureClass === "cancelled") {
            return;
        }
        const message =
            failureMessages[result.failureClass ?? "unknown"] +
            (result.message ? ` (${result.message})` : "");
        // Not awaited: the toast stays up until the user reacts.
        window
            .showErrorMessage(
                `Databricks: Failed to set up the Python environment. ${message}`,
                "Retry",
                "Show Logs",
                "Set up manually"
            )
            .then(async (choice) => {
                switch (choice) {
                    case "Retry":
                        await commands.executeCommand(
                            "databricks.environment.setup"
                        );
                        break;
                    case "Show Logs":
                        this.outputChannel.show();
                        break;
                    case "Set up manually":
                        await commands.executeCommand(
                            "databricks.environment.selectPythonInterpreter"
                        );
                        break;
                }
            });
    }

    dispose() {
        this.disposables.forEach((i) => i.dispose());
    }
}
