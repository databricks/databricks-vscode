import {SpawnOptionsWithoutStdio} from "child_process";
import {
    ExtensionContext,
    window,
    Uri,
    commands,
    CancellationToken,
} from "vscode";
import {workspaceConfigs} from "../vscode-objs/WorkspaceConfigs";
import {run as runCli} from "./cliProcess";
import {logging} from "@databricks/sdk-experimental";
import {LoggerManager, Loggers} from "../logger";
import {Context, context} from "@databricks/sdk-experimental/dist/context";
import {Cloud} from "../utils/constants";
import {EnvVarGenerators, FileUtils, HostUtils, UrlUtils} from "../utils";
import {AuthProvider} from "../configuration/auth/AuthProvider";
import type {AiToolsScope} from "../telemetry/constants";
export type {AiToolsScope};
import {removeUndefinedKeys} from "../utils/envVarGenerators";
import {quote} from "shell-quote";
import {BundleVariableModel} from "../bundle/models/BundleVariableModel";
import {MsPythonExtensionWrapper} from "../language/MsPythonExtensionWrapper";
import path from "path";
import {
    currentShellKind,
    escapeExecutableForTerminal,
    ShellKind,
} from "../utils/shellUtils";

const withLogContext = logging.withLogContext;

export interface ExecFileOptions {
    /**
     * Close the child's stdin immediately after spawning. Node gives the child
     * an open stdin pipe that never receives EOF, so any CLI command that
     * prompts for confirmation (e.g. `aitools update`) blocks forever waiting
     * on input. Ending stdin delivers EOF so the prompt resolves instead of
     * hanging. Only set this for non-interactive commands we never feed input to.
     */
    closeStdin?: boolean;
}

/**
 * Buffered CLI execution over the shared {@link runCli} seam: run to
 * completion, then resolve with the full output or throw. The thrown error
 * mirrors Node's `execFile` rejection so existing callers keep working — its
 * `message` includes stderr, and `.code`/`.stderr`/`.stdout` are set — which
 * is what the SDK's `isFileNotFound` and the profile-parsing checks inspect.
 */
async function bufferedExec(
    file: string,
    args: string[],
    options: Omit<SpawnOptionsWithoutStdio, "signal">,
    cancellationToken: CancellationToken | undefined,
    execOptions: ExecFileOptions,
    escapeCommandForWindows: boolean
): Promise<{stdout: string; stderr: string}> {
    const result = await runCli(file, args, {
        // SpawnOptions types cwd as string | URL; every caller passes a string.
        cwd: options.cwd as string | undefined,
        env: options.env,
        shell: options.shell as boolean | undefined,
        token: cancellationToken,
        closeStdin: execOptions.closeStdin,
        escapeCommandForWindows,
    });

    if (result.cancelled) {
        throw new CancellationError();
    }
    if (result.exitCode !== 0) {
        const error: Error & {
            code?: number | null;
            stdout?: string;
            stderr?: string;
        } = new Error(
            `Command failed: ${file} ${args.join(" ")}\n${result.stderr}`
        );
        error.code = result.exitCode;
        error.stdout = result.stdout;
        error.stderr = result.stderr;
        throw error;
    }
    return {stdout: result.stdout, stderr: result.stderr};
}

/**
 * Buffered exec that spawns `file` directly (bare command names resolve via the
 * PATH / shell). Used by callers that manage their own Windows quoting through
 * the `shell` option (e.g. the Azure and host-CLI probes).
 */
export async function cancellableExecFile(
    file: string,
    args: string[],
    options: Omit<SpawnOptionsWithoutStdio, "signal"> = {},
    cancellationToken?: CancellationToken,
    execOptions: ExecFileOptions = {}
): Promise<{stdout: string; stderr: string}> {
    return await bufferedExec(
        file,
        args,
        options,
        cancellationToken,
        execOptions,
        /*escapeCommandForWindows*/ false
    );
}

/**
 * Buffered exec that routes the command through `cmd.exe` on Windows, so a CLI
 * invoked by a bare name or a path with spaces resolves and quotes correctly.
 * The default entry point for the extension's own CLI calls.
 */
export const execFile = async (
    file: string,
    args: string[],
    options: Omit<SpawnOptionsWithoutStdio, "signal"> = {},
    cancellationToken?: CancellationToken,
    execOptions: ExecFileOptions = {}
): Promise<{stdout: string; stderr: string}> => {
    return await bufferedExec(
        file,
        args,
        options,
        cancellationToken,
        execOptions,
        /*escapeCommandForWindows*/ true
    );
};

/**
 * Constructs the `databricks ssh connect` command args for opening a remote
 * IDE window. Serverless is the default when no cluster is given.
 *
 * The --ide flag matches the host editor so the CLI opens the right remote
 * window
 *
 * Logging is configured out of band via the DATABRICKS_LOG_* env vars (see
 * CliWrapper.getSshConnectEnvVars), so we do not pass --log-* flags here.
 */
export function getSshConnectCommand(opts: {compute: SshConnectCompute}): {
    args: string[];
} {
    const ide = HostUtils.isCursor() ? "cursor" : "vscode";
    const args = ["ssh", "connect", `--ide=${ide}`, "--auto-approve"];
    if (opts.compute.type === "cluster") {
        // Start a stopped single-user cluster when connecting.
        args.push(`--cluster=${opts.compute.clusterId}`);
        args.push("--auto-start-cluster");
    } else if (opts.compute.accelerator) {
        // Serverless GPU: request a specific accelerator type.
        args.push(`--accelerator=${opts.compute.accelerator}`);
    }
    return {args};
}

export interface Command {
    command: string;
    args: string[];
}

export interface ConfigEntry {
    name: string;
    host?: URL;
    accountId?: string;
    workspaceId?: string;
    cloud: Cloud;
    authType: string;
    valid: boolean;
}

export type SyncType = "full" | "incremental";

export type SshConnectCompute =
    | {type: "serverless"; accelerator?: string}
    | {type: "cluster"; clusterId: string};

/** A single skill entry from `databricks aitools list --output json`. */
export interface AiToolsSkill {
    name: string;
    // eslint-disable-next-line @typescript-eslint/naming-convention
    latest_version: string;
    experimental: boolean;
    /**
     * Installed versions keyed by scope. Empty when the skill is not installed.
     * e.g. `{ "project": "0.1.0" }` or `{ "global": "0.1.0" }`.
     */
    installed: Partial<Record<AiToolsScope, string>>;
}

export interface AiToolsAgentInstallation {
    version: string;
    // eslint-disable-next-line @typescript-eslint/naming-convention
    native_scope: string;
    /**
     * How the agent's AI tools were delivered: as raw `skills` or as a
     * managed `plugin`. A managed agent can be delivered either way; when it
     * only received skills the UI annotates the row as "skills only".
     */
    delivery?: "skills" | "plugin";
}

/** A single agent entry from `databricks aitools list --output json`. */
export interface AiToolsAgent {
    name: string;
    // eslint-disable-next-line @typescript-eslint/naming-convention
    display_name: string;
    managed: boolean;
    detected: boolean;
    /**
     * Whether the agent can be installed at project scope. Older CLIs omit this
     * field; callers treat its absence as "supported".
     */
    // eslint-disable-next-line @typescript-eslint/naming-convention
    supports_project_scope?: boolean;
    installed: Partial<Record<AiToolsScope, AiToolsAgentInstallation>>;
}

/** Parsed output of `databricks aitools list --output json`. */
export interface AiToolsListResult {
    release: string;
    skills: AiToolsSkill[];
    agents: AiToolsAgent[];
}

export class ProcessError extends Error {
    constructor(
        message: string,
        public code: number | null
    ) {
        super(message);
    }

    /**
     * Show an error toast for this CLI failure with a "Show Logs" button.
     *
     * `logsCommand` selects which output channel that button opens. It defaults
     * to the bundle logs (`databricks.bundle.showLogs`), since most CLI commands
     * are bundle operations, but callers whose command logs elsewhere (e.g. the
     * AI tools commands, which log to the "Databricks Logs" channel) can pass
     * `databricks.internal.showOutput` so "Show Logs" lands on the right channel.
     */
    showErrorMessage(
        prefix?: string,
        logsCommand:
            | "databricks.bundle.showLogs"
            | "databricks.internal.showOutput" = "databricks.bundle.showLogs"
    ) {
        if (this.message.includes("no value assigned to required variable")) {
            window
                .showErrorMessage(
                    (prefix?.trimEnd().concat(" ") ?? "") +
                        `No value assigned to required variables.`,
                    "Assign Values"
                )
                .then((choice) => {
                    if (choice === "Assign Values") {
                        commands.executeCommand("databricks.bundle.showLogs");
                        commands.executeCommand("dabsVariableView.focus");
                        commands.executeCommand(
                            "databricks.bundle.variable.openFile"
                        );
                    }
                });
            return;
        }

        window
            .showErrorMessage(
                (prefix?.trimEnd().concat(" ") ?? "") +
                    `Error executing Databricks CLI command.`,
                "Show Logs"
            )
            .then((choice) => {
                if (choice === "Show Logs") {
                    commands.executeCommand(logsCommand);
                }
            });
    }
}

export class CancellationError extends Error {
    constructor() {
        super("Cancelled");
    }
}

async function runBundleCommand(
    bundleOpName: string,
    cmd: string,
    args: string[] = [],
    workspaceFolder: Uri,
    displayLogs: {
        start: string | string[];
        end: string;
        error: string;
    },
    env: Record<string, string | undefined> = {},
    logger?: logging.NamedLogger,
    outputHandlers: {
        onStdOut?: (data: string) => void;
        onStdError?: (data: string) => void;
    } = {},
    cancellationToken?: CancellationToken
) {
    const defaultOutputHandlers = {
        onStdOut: (data: string) => {
            logger?.info(data, {bundleOpName});
        },
        onStdError: (data: string) => {
            logger?.info(data, {bundleOpName});
        },
    };
    const {onStdOut, onStdError} = {
        ...defaultOutputHandlers,
        ...outputHandlers,
    };
    const startLogs =
        typeof displayLogs.start === "string"
            ? [displayLogs.start]
            : displayLogs.start;

    startLogs.forEach((msg) => {
        logger?.info(msg, {bundleOpName});
    });

    logger?.debug(quote([cmd, ...args]), {bundleOpName});

    let result;
    try {
        result = await runCli(cmd, args, {
            cwd: workspaceFolder.fsPath,
            env: removeUndefinedKeys(env),
            token: cancellationToken,
            escapeCommandForWindows: true,
            onStdout: onStdOut,
            onStderr: onStdError,
        });
    } catch (e: any) {
        // A genuine spawn/stream failure (e.g. the binary is missing).
        if (cancellationToken?.isCancellationRequested) {
            logger?.warn(`${displayLogs.error} Reason: Cancelled`, {
                bundleOpName,
            });
            throw new CancellationError();
        }
        logger?.error(`${displayLogs.error} ${e.message ?? ""}`, {
            ...e,
            bundleOpName,
        });
        throw new ProcessError(e.message, e.code ?? null);
    }

    if (result.cancelled) {
        logger?.warn(`${displayLogs.error} Reason: Cancelled`, {bundleOpName});
        throw new CancellationError();
    }
    if (result.exitCode !== 0) {
        // stderr was streamed to onStdError (and the logs), so the error itself
        // carries no message — the detail lives in the "Show Logs" channel.
        logger?.error(displayLogs.error, {bundleOpName});
        throw new ProcessError("", result.exitCode);
    }

    logger?.info(displayLogs.end, {bundleOpName});
    logger?.debug("output", {
        stdout: result.stdout,
        stderr: result.stderr,
        bundleOpName,
    });
    return {stdout: result.stdout, stderr: result.stderr};
}
/**
 * Entrypoint for all wrapped CLI commands
 *
 * Righ now this is a placeholder for a future implementation
 * of the databricks CLI
 */
export class CliWrapper {
    private clusterId?: string;
    private _bundleVariableModel?: BundleVariableModel;
    private pythonExtension?: MsPythonExtensionWrapper;

    constructor(
        private extensionContext: ExtensionContext,
        private loggerManager: LoggerManager,
        private logFilePath?: string
    ) {}

    public set bundleVariableModel(model: BundleVariableModel) {
        this._bundleVariableModel = model;
    }

    public setPythonExtension(pythonExtension: MsPythonExtensionWrapper) {
        this.pythonExtension = pythonExtension;
    }

    public setClusterId(clusterId?: string) {
        this.clusterId = clusterId;
    }

    get cliPath(): string {
        // The bundled binary is named `databricks.exe` on Windows. We must
        // include the extension here: while spawning the CLI ourselves works
        // without it (Windows' CreateProcess auto-appends `.exe`), this path is
        // also forwarded to the Databricks Go SDK / Terraform provider via the
        // DATABRICKS_CLI_PATH env var, and they do a literal file lookup that
        // fails on an extensionless path with "databricks CLI not found".
        const binName =
            process.platform === "win32" ? "databricks.exe" : "databricks";
        return this.extensionContext.asAbsolutePath(`./bin/${binName}`);
    }

    getLoggingArguments(): string[] {
        if (!workspaceConfigs.loggingEnabled) {
            return [];
        }
        return [
            "--log-level",
            "debug",
            "--log-file",
            this.logFilePath ?? "stderr",
            "--log-format",
            "json",
        ];
    }

    getLogginEnvVars(): Record<string, string> {
        if (!workspaceConfigs.loggingEnabled) {
            return {};
        }
        return {
            /* eslint-disable @typescript-eslint/naming-convention */
            DATABRICKS_LOG_LEVEL: "debug",
            DATABRICKS_LOG_FILE: this.logFilePath ?? "stderr",
            DATABRICKS_LOG_FORMAT: "json",
            /* eslint-enable @typescript-eslint/naming-convention */
        };
    }

    /**
     * The CLI path, quoted for a shell we send it to as a command.
     *
     * Takes the shell kind explicitly so the escaping matches the shell that
     * will parse the command line, rather than assuming the default profile's.
     */
    escapedCliPathFor(kind: ShellKind): string {
        return escapeExecutableForTerminal(this.cliPath, kind);
    }

    /**
     * The CLI path quoted for the *default* shell.
     *
     * Only correct when sending to a terminal created without `shellPath`,
     * which is what makes the default profile the shell that parses the line.
     * Don't use it with a reused terminal (`window.activeTerminal`): that can be
     * running any profile, so prefer `escapedCliPathFor` with a known kind.
     */
    get escapedCliPath(): string {
        return this.escapedCliPathFor(currentShellKind());
    }

    /**
     * Constructs the databricks sync command
     */
    getSyncCommand(syncType: SyncType): Command {
        const args = [
            "bundle",
            "sync",
            "--watch",
            "--output",
            "json",
            ...this.getLoggingArguments(),
        ];
        if (syncType === "full") {
            args.push("--full");
        }
        return {command: this.cliPath, args};
    }

    private getListProfilesCommand(): Command {
        return {
            command: this.cliPath,
            args: [
                "auth",
                "profiles",
                "--skip-validate",
                ...this.getLoggingArguments(),
            ],
        };
    }

    @withLogContext(Loggers.Extension)
    public async listProfiles(
        configfilePath?: string,
        @context ctx?: Context
    ): Promise<Array<ConfigEntry>> {
        const cmd = this.getListProfilesCommand();

        let res;
        try {
            res = await execFile(cmd.command, cmd.args, {
                env: {
                    ...EnvVarGenerators.getEnvVarsForCli(
                        this.extensionContext,
                        configfilePath
                    ),
                    ...EnvVarGenerators.getProxyEnvVars(),
                },
            });
        } catch (e) {
            let msg = "Failed to load Databricks Config File";
            if (e instanceof Error) {
                if (e.message.includes("cannot parse config file")) {
                    msg =
                        "Failed to parse Databricks Config File, please make sure it's in the correct ini format";
                } else if (e.message.includes("spawn UNKNOWN")) {
                    msg = `Failed to parse Databricks Config File using databricks CLI, please make sure you have permissions to execute this binary: "${this.cliPath}"`;
                } else {
                    msg += e.message;
                }
            }
            ctx?.logger?.error(msg, e);
            window
                .showWarningMessage(msg, "Open Databricks Config File")
                .then(async (choice) => {
                    if (choice === "Open Databricks Config File") {
                        await FileUtils.openDatabricksConfigFile();
                    }
                });
            return [];
        }

        const profiles = JSON.parse(res.stdout).profiles || [];

        const result = [];
        let hasError = false;
        for (const profile of profiles) {
            try {
                result.push({
                    name: profile.name,
                    host: UrlUtils.normalizeHost(profile.host),
                    accountId: profile.account_id,
                    workspaceId: profile.workspace_id,
                    cloud: profile.cloud,
                    authType: profile.auth_type,
                    valid: profile.valid,
                });
            } catch (e: unknown) {
                let msg: string;
                if (e instanceof TypeError) {
                    msg = `Can't parse host for profile ${profile.name}`;
                } else {
                    msg = `Error parsing profile ${profile.name}`;
                }
                ctx?.logger?.error(msg, e);
                hasError = true;
            }
        }

        if (hasError) {
            window
                .showWarningMessage(
                    "There were errors in parsing some profiles",
                    "Open Databricks Config File",
                    "Show Error Logs"
                )
                .then(async (choice) => {
                    if (choice === "Open Databricks Config File") {
                        await FileUtils.openDatabricksConfigFile();
                    }
                    if (choice === "Show Error Logs") {
                        await this.loggerManager.showOutputChannel(
                            "Databricks Logs"
                        );
                    }
                });
        }
        return result;
    }

    public async getBundleSchema(): Promise<string> {
        const {stdout} = await execFile(this.cliPath, [
            "bundle",
            "schema",
            ...this.getLoggingArguments(),
        ]);
        return stdout;
    }

    private aitoolsEnv(): Record<string, string | undefined> {
        return {
            ...EnvVarGenerators.getEnvVarsForCli(this.extensionContext),
            ...EnvVarGenerators.getProxyEnvVars(),
        };
    }

    /**
     * Install Databricks AI tools (skills + agent plugins) for the given scope.
     *
     * `cwd` selects the install root: the project root for `--scope project`
     * (installs into `.databricks/aitools/skills` under the workspace) or the
     * home dir for `--scope global` (see AiToolsManager.cwdForScope). The CLI
     * prints human-readable text (it ignores `--output json` for this
     * subcommand), so success/failure is determined by the exit code (a non-zero
     * exit rejects with a {@link ProcessError}).
     */
    @withLogContext(Loggers.Extension)
    public async aitoolsInstall(
        scope: AiToolsScope,
        cwd: string,
        cancellationToken: CancellationToken | undefined,
        agents: string[],
        @context ctx?: Context
    ): Promise<void> {
        if (agents.length === 0) {
            return;
        }

        const args = [
            "aitools",
            "install",
            "--scope",
            scope,
            "--agents",
            agents.join(","),
        ];
        try {
            await execFile(
                this.cliPath,
                args,
                {cwd, env: this.aitoolsEnv()},
                cancellationToken,
                {closeStdin: true}
            );
        } catch (e: any) {
            ctx?.logger?.error("Failed to install Databricks AI tools", e);
            throw new ProcessError(e.message, e.code ?? null);
        }
    }

    /**
     * Update installed Databricks AI tools for the given scope.
     */
    @withLogContext(Loggers.Extension)
    public async aitoolsUpdate(
        scope: AiToolsScope,
        cwd: string,
        cancellationToken?: CancellationToken,
        @context ctx?: Context
    ): Promise<void> {
        const args = ["aitools", "update", "--scope", scope];
        try {
            await execFile(
                this.cliPath,
                args,
                {cwd, env: this.aitoolsEnv()},
                cancellationToken,
                {closeStdin: true}
            );
        } catch (e: any) {
            ctx?.logger?.error("Failed to update Databricks AI tools", e);
            throw new ProcessError(e.message, e.code ?? null);
        }
    }

    /**
     * Uninstall Databricks AI tools for the given scope.
     */
    @withLogContext(Loggers.Extension)
    public async aitoolsUninstall(
        scope: AiToolsScope,
        cwd: string,
        cancellationToken?: CancellationToken,
        @context ctx?: Context
    ): Promise<void> {
        const args = ["aitools", "uninstall", "--scope", scope];
        try {
            await execFile(
                this.cliPath,
                args,
                {cwd, env: this.aitoolsEnv()},
                cancellationToken,
                {closeStdin: true}
            );
        } catch (e: any) {
            ctx?.logger?.error("Failed to uninstall Databricks AI tools", e);
            throw new ProcessError(e.message, e.code ?? null);
        }
    }

    /**
     * List Databricks AI tools components as structured JSON.
     *
     * `aitools list` is the only aitools subcommand that emits real JSON
     * (`aitools update --check` and `install` print text). We use it both to
     * detect whether an update is available (any installed skill whose
     * `installed[scope]` differs from `latest_version`) and to read the current
     * release.
     */
    @withLogContext(Loggers.Extension)
    public async aitoolsList(
        cwd: string,
        @context ctx?: Context
    ): Promise<AiToolsListResult> {
        const args = ["aitools", "list", "--output", "json"];
        let res;
        try {
            res = await execFile(
                this.cliPath,
                args,
                {cwd, env: this.aitoolsEnv()},
                undefined,
                {closeStdin: true}
            );
        } catch (e: any) {
            ctx?.logger?.error("Failed to list Databricks AI tools", e);
            throw new ProcessError(e.message, e.code ?? null);
        }
        return JSON.parse(res.stdout) as AiToolsListResult;
    }

    async getBundleCommandEnvVars(
        authProvider: AuthProvider,
        configfilePath?: string
    ) {
        // Add python executable to PATH
        const executable = await this.pythonExtension?.getPythonExecutable();
        const cliEnvVars = EnvVarGenerators.getEnvVarsForCli(
            this.extensionContext,
            configfilePath
        );
        let shellPath = cliEnvVars.PATH;
        if (executable) {
            shellPath = `${path.dirname(executable)}${
                path.delimiter
            }${shellPath}`;
        }

        return removeUndefinedKeys({
            ...cliEnvVars,
            ...EnvVarGenerators.getProxyEnvVars(),
            ...authProvider.toEnv(),
            ...this.getLogginEnvVars(),
            ...((await this._bundleVariableModel?.getEnvVariables()) ?? {}),
            /* eslint-disable @typescript-eslint/naming-convention */
            DATABRICKS_CLUSTER_ID: this.clusterId,
            PATH: shellPath,
            /* eslint-enable @typescript-eslint/naming-convention */
        });
    }

    async bundleValidate(
        target: string,
        authProvider: AuthProvider,
        workspaceFolder: Uri,
        configfilePath?: string,
        logger?: logging.NamedLogger
    ) {
        const bundleOpName = "validate";
        return await runBundleCommand(
            bundleOpName,
            this.cliPath,
            ["bundle", "validate", "--target", target],
            workspaceFolder,
            {
                start: `Reading local bundle configuration for target ${target}...`,
                end: "Finished reading local bundle configuration.",
                error: "Failed to read local bundle configuration.",
            },
            await this.getBundleCommandEnvVars(authProvider, configfilePath),
            logger,
            // Print stdout to the debug log (not visible in the output channel).
            // stderr data will be printed to the output channel with the error level.
            {onStdOut: (data) => logger?.debug(data, {target, bundleOpName})}
        );
    }

    async bundleSummarise(
        target: string,
        authProvider: AuthProvider,
        workspaceFolder: Uri,
        configfilePath?: string,
        logger?: logging.NamedLogger
    ) {
        const bundleOpName = "summarize";
        return await runBundleCommand(
            bundleOpName,
            this.cliPath,
            [
                "bundle",
                "summary",
                "--include-locations",
                "--target",
                target,
                // Forces the CLI to regenerate local terraform state and pull the remote state.
                // Regenerating terraform state is useful when we want to ensure that the provider version
                // used in the local state matches the bundled version we supply with the extension.
                "--force-pull",
            ],
            workspaceFolder,
            {
                start: `Refreshing bundle configuration for target ${target}...`,
                end: "Bundle configuration refreshed.",
                error: "Failed to refresh bundle configuration.",
            },
            await this.getBundleCommandEnvVars(authProvider, configfilePath),
            logger,
            // Print stdout to the debug log (not visible in the output channel).
            // stderr data will be printed to the output channel with the error level.
            {onStdOut: (data) => logger?.debug(data, {target, bundleOpName})}
        );
    }

    getBundleInitEnvVars(authProvider: AuthProvider) {
        return removeUndefinedKeys({
            ...EnvVarGenerators.getEnvVarsForCli(
                this.extensionContext,
                workspaceConfigs.databrickscfgLocation
            ),
            ...EnvVarGenerators.getProxyEnvVars(),
            ...this.getLogginEnvVars(),
            ...authProvider.toEnv(),
            // eslint-disable-next-line @typescript-eslint/naming-convention
            DATABRICKS_OUTPUT_FORMAT: "text",
        });
    }

    /**
     * Env vars for interactive CLI commands run in a terminal (e.g. `ssh
     * connect`). Auth is forwarded via env vars, matching the bundle init flow.
     */
    getSshConnectEnvVars(authProvider: AuthProvider) {
        return removeUndefinedKeys({
            ...EnvVarGenerators.getEnvVarsForCli(
                this.extensionContext,
                workspaceConfigs.databrickscfgLocation
            ),
            ...EnvVarGenerators.getProxyEnvVars(),
            ...this.getLogginEnvVars(),
            ...authProvider.toEnv(),
            // eslint-disable-next-line @typescript-eslint/naming-convention
            DATABRICKS_OUTPUT_FORMAT: "text",
        });
    }

    /**
     * Env vars for `environments setup-local` (the uv-native Python environment
     * setup).
     *
     * Auth is forwarded the same way as the bundle-init and ssh-connect flows,
     * so the command provisions against the workspace the extension is actually
     * connected to: `authProvider.toEnv()` carries the host and profile, and
     * `getEnvVarsForCli` carries `DATABRICKS_CONFIG_FILE` for users who have
     * relocated their `.databrickscfg`. Without them the CLI's
     * `MustWorkspaceClient` falls back to its own default-profile resolution.
     *
     * Like the sibling methods this returns only the Databricks vars; the caller
     * overlays them onto the ambient environment, because `setup-local` shells
     * out to `uv` and needs the real OS environment (platform paths, `UV_*`
     * vars) as its base.
     *
     * Unlike those two this keeps `getEnvVarsForCli`'s `DATABRICKS_OUTPUT_FORMAT
     * = json` rather than overriding it to "text": they render CLI output into a
     * terminal for a human, whereas this run's stdout is parsed as the single
     * JSON result object (the argv also passes `--output json` explicitly).
     *
     * `DATABRICKS_BUNDLE_TARGET` must accompany the profile. `setup-local` runs
     * `MustWorkspaceClient` without a `--profile` flag, so the CLI does not skip
     * loading the bundle and selects its *default* target; the profile we inject
     * then reaches `Workspace.Client`, which rejects the run outright when that
     * target's host disagrees with the profile's host ("the host in the profile
     * doesn't match the host configured in the bundle"). Naming the target we
     * are actually connected to keeps the two in agreement. `dbconnect` forwards
     * this var for the same reason (see `getCommonDatabricksEnvVars`).
     */
    getSetupLocalEnvVars(authProvider: AuthProvider, target?: string) {
        return removeUndefinedKeys({
            ...EnvVarGenerators.getEnvVarsForCli(
                this.extensionContext,
                workspaceConfigs.databrickscfgLocation
            ),
            ...EnvVarGenerators.getProxyEnvVars(),
            ...this.getLogginEnvVars(),
            ...authProvider.toEnv(),
            // eslint-disable-next-line @typescript-eslint/naming-convention
            DATABRICKS_BUNDLE_TARGET: target,
        });
    }

    async bundleInit(
        templateDirPath: string,
        outputDirPath: string,
        initConfigFilePath: string,
        authProvider: AuthProvider
    ) {
        return await execFile(
            this.cliPath,
            [
                "bundle",
                "init",
                templateDirPath,
                "--output-dir",
                outputDirPath,
                "--config-file",
                initConfigFilePath,
            ],
            {
                env: this.getBundleInitEnvVars(authProvider),
            }
        );
    }

    async bundleDeploy(
        target: string,
        authProvider: AuthProvider,
        workspaceFolder: Uri,
        configfilePath?: string,
        logger?: logging.NamedLogger,
        force = false,
        token?: CancellationToken
    ) {
        await commands.executeCommand("databricks.bundle.showLogs");
        return await runBundleCommand(
            "deploy",
            this.cliPath,
            [
                "bundle",
                "deploy",
                "--target",
                target,
                "--verbose",
                ...(force ? ["--force-lock", "--force"] : []),
            ],
            workspaceFolder,
            {
                start: [`Deploying the bundle for target ${target}...`].concat(
                    this.clusterId
                        ? [`DATABRICKS_CLUSTER_ID=${this.clusterId}`]
                        : []
                ),
                end: "Bundle deployed successfully.",
                error: "Failed to deploy the bundle.",
            },
            await this.getBundleCommandEnvVars(authProvider, configfilePath),
            logger,
            {},
            token
        );
    }

    async bundleDestroy(
        target: string,
        authProvider: AuthProvider,
        workspaceFolder: Uri,
        configfilePath?: string,
        logger?: logging.NamedLogger,
        force = false,
        token?: CancellationToken
    ) {
        await commands.executeCommand("databricks.bundle.showLogs");
        return await runBundleCommand(
            "destroy",
            this.cliPath,
            [
                "bundle",
                "destroy",
                "--target",
                target,
                "--auto-approve",
                ...(force ? ["--force-lock"] : []),
            ],
            workspaceFolder,
            {
                start: `Destroying the bundle for target ${target}...`,
                end: "Bundle destroyed successfully.",
                error: "Failed to destroy the bundle.",
            },
            await this.getBundleCommandEnvVars(authProvider, configfilePath),
            logger,
            {},
            token
        );
    }

    async bundleSync(
        target: string,
        authProvider: AuthProvider,
        workspaceFolder: Uri,
        configfilePath?: string,
        logger?: logging.NamedLogger,
        token?: CancellationToken
    ) {
        await commands.executeCommand("databricks.bundle.showLogs");
        return await runBundleCommand(
            "sync",
            this.cliPath,
            ["bundle", "sync", "--target", target, "--output", "text"],
            workspaceFolder,
            {
                start: `Uploading bundle assets for target ${target}...`,
                end: "Bundle assets uploaded successfully.",
                error: "Failed to upload bundle assets.",
            },
            await this.getBundleCommandEnvVars(authProvider, configfilePath),
            logger,
            {},
            token
        );
    }

    async getBundleRunCommand(
        target: string,
        authProvider: AuthProvider,
        resourceKey: string,
        workspaceFolder: Uri,
        configfilePath?: string,
        additionalArgs: string[] = []
    ): Promise<{
        cmd: string;
        args: string[];
        options: SpawnOptionsWithoutStdio;
    }> {
        const env: Record<string, string> = removeUndefinedKeys({
            ...EnvVarGenerators.getEnvVarsForCli(
                this.extensionContext,
                configfilePath
            ),
            ...EnvVarGenerators.getProxyEnvVars(),
            ...authProvider.toEnv(),
            ...((await this._bundleVariableModel?.getEnvVariables()) ?? {}),
            ...this.getLogginEnvVars(),
            // eslint-disable-next-line @typescript-eslint/naming-convention
            DATABRICKS_CLUSTER_ID: this.clusterId,
        });

        return {
            cmd: this.cliPath,
            args: [
                "bundle",
                "run",
                "--target",
                target,
                resourceKey,
                ...additionalArgs,
            ],
            options: {
                cwd: workspaceFolder.fsPath,
                env,
            },
        };
    }
}
