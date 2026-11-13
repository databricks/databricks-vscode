import { existsSync } from "node:fs";
import path from "node:path";
import { CatalogsClient } from "@databricks/sdk-uc-catalogs/v1";
import {
    commands,
    debug,
    env,
    ProgressLocation,
    Uri,
    window,
    workspace,
    type Disposable,
    type OutputChannel,
} from "vscode";
import { environmentsSetupLocal } from "../../kernel/cli/commands/environments";
import { dbrVersion } from "../../kernel/compute/clusters";
import {
    ATTACH_CLUSTER_QUICK_PICK,
    SELECT_SERVERLESS_VERSION,
} from "../../kernel/compute/commands";
import { calls, type Connection } from "../../kernel/connection";
import { JUPYTER, PYTHON } from "../../kernel/extensionDependencies";
import type { Feature, FeatureContext, ProjectSession } from "../../kernel/feature";
import { errorMessage, UserFacingError } from "../../platform/errors";
import { disposeAll, Emitter } from "../../platform/event";
import type { ExtensionDependencies } from "../../platform/extensions";
import { resolveSystemVariables, setting } from "../../platform/settings";
import { detectShellKind } from "../../platform/shell";
import { Autocomplete, BUILTINS_STUB } from "./autocomplete/Autocomplete";
import { DatabricksDebugConfigurationProvider } from "./DatabricksDebugConfigurationProvider";
import { DbConnectRunner } from "./DbConnectRunner";
import { EnvFileWriter } from "./EnvFile";
import { MsPython } from "./MsPython";
import { writeCellMarkers } from "./notebooks/cellMarkers";
import { INIT_SCRIPT_SOURCE, InitScripts, IPYTHON_DIR, ipythonDir } from "./notebooks/InitScripts";
import { KernelRestartPrompt } from "./notebooks/KernelRestartPrompt";
import {
    NOTEBOOKS_CHANNEL,
    NotebookInitScriptManager,
} from "./notebooks/NotebookInitScriptManager";
import { inNotebook, startNotebookSession, usable } from "./notebooks/NotebookSession";
import { PackageManagerTelemetry } from "./PackageManagerTelemetry";
import { PythonEnvironmentSection } from "./PythonEnvironmentSection";
import { SessionPythonSection } from "./SessionPythonSection";
import type {
    BuiltinsProbe,
    CatalogProbe,
    ChecklistCompute,
    PackageProbe,
} from "./setup/external/checks";
import {
    DBCONNECT_CHANNEL,
    DbConnectInstaller,
    type InstallChannel,
} from "./setup/external/DbConnectInstaller";
import { ExternalSetup } from "./setup/external/ExternalSetup";
import { Packages } from "./setup/external/Packages";
import { collectPackageManagerSignals } from "./setup/packageManagerSignals";
import { PythonEnvironment } from "./setup/PythonEnvironment";
import { PythonSetupManagerDetector } from "./setup/PythonSetupManagerDetector";
import type { PythonEnvironmentSetupMode } from "./setup/pythonSetupGate";
import { routeEnvironmentSetup } from "./setup/pythonSetupRouting";
import type { Readiness } from "./setup/readiness";
import { INSTALL_UV_COMMAND_ID, USE_MANUAL_SETUP_COMMAND_ID } from "./setup/uv/errorMessages";
import { optOutOfAutomatedPythonSetup } from "./setup/uv/manualSetupOptOut";
import { PythonSetupAdoptionManager } from "./setup/uv/PythonSetupAdoptionManager";
import { PythonSetupDriftManager } from "./setup/uv/PythonSetupDriftManager";
import {
    PythonSetupEnvironmentSetup,
    type SetupCompute,
} from "./setup/uv/PythonSetupEnvironmentSetup";
import {
    makePythonSetupDeps,
    resolveComputeFrom,
    type AttachedCompute,
} from "./setup/uv/pythonSetupDeps";
import { SetupFailures } from "./setup/uv/SetupFailures";
import { SetupStates } from "./setup/uv/SetupStates";
import {
    recordManualSetupOptOut,
    recordPythonSetupAdoption,
    recordPythonSetupDrift,
} from "./setup/uv/setupTelemetry";
import {
    runUvInstall,
    UV_INSTALL_CONFIRM_ACTION,
    UV_INSTALL_CONFIRM_MESSAGE,
} from "./setup/uv/uvInstall";
import { venvInterpreterPath } from "./setup/uv/venvInterpreterPath";
import {
    DBCONNECT_RUN,
    PYTHON_ENV_DBCONNECT_INSTALL,
    PYTHON_EVENTS,
    type PythonSetupOptOutSource,
    type TargetCompute,
} from "./telemetry";

export const ENVIRONMENT_REFRESH = "databricks.environment.refresh";
/** Routes to the uv flow or the checklist, whichever the project shows (`routeEnvironmentSetup`). */
export const ENVIRONMENT_SETUP = "databricks.environment.setup";
const SETUP_PYTHON_ENV = "databricks.environment.setupPythonEnv";
/** The ready and out-of-sync rows' re-run: the same flow under another title. */
export const RERUN_PYTHON_ENV = "databricks.environment.rerunPythonEnv";
export const INSTALL_UV = INSTALL_UV_COMMAND_ID;
export const USE_MANUAL_PYTHON_SETUP = USE_MANUAL_SETUP_COMMAND_ID;
export const DBCONNECT_RUN_FILE = "databricks.run.dbconnect.run";
export const DBCONNECT_DEBUG_FILE = "databricks.run.dbconnect.debug";
export const SELECT_PYTHON_INTERPRETER = "databricks.environment.selectPythonInterpreter";
export const REINSTALL_DBCONNECT = "databricks.environment.reinstallDBConnect";
export const CONFIGURE_AUTOCOMPLETE = "databricks.autocomplete.configure";
export const VERIFY_NOTEBOOK_INIT_SCRIPT = "databricks.notebookInitScript.verify";

/** Why a session window has none of the Python setup: its Python is the session's. */
const PYTHON_IN_A_SESSION = {
    unavailable:
        "In a session window Python is the session's: the SSH tunnel set up its interpreter, its packages and its notebook init script.",
    instead:
        "Use the session's interpreter, which this window selects. To set up a local environment, open the project in a local window.",
} as const;

const DBCONNECT_IN_A_SESSION = {
    unavailable:
        "A Databricks Connect run sets up a local interpreter, and in a session window the interpreter is the session's.",
    instead: "Run or debug the file with the session's interpreter.",
} as const;

/** `auto` offers the uv-native setup for suitable projects; `manual` never does. */
const ENVIRONMENT_SETUP_MODE = setting<string>("databricks", "python.environmentSetup", "auto");

/** The `databricks-connect` version for serverless, which decides the Python version the checklist asks for. */
const SERVERLESS_DBCONNECT_VERSION = setting<string>(
    "databricks",
    "connect.serverlessDbconnectVersion",
    "17.3",
);

/** Databricks Connect's progress bar, through `SPARK_CONNECT_PROGRESS_BAR_ENABLED` in the env file. */
const DBCONNECT_PROGRESS = setting<boolean>("databricks", "connect.progress", true);

/** ms-python's env file, merged into ours. Read, never written. */
const PYTHON_ENV_FILE = setting<string | undefined>("python", "envFile", undefined);

const SETUP_CHANNEL = "Databricks Python Environment Setup";

/** Any value other than `manual` (unset, `auto`, or an unexpected string) is `auto`, as before. */
function setupMode(ctx: FeatureContext): PythonEnvironmentSetupMode {
    return ctx.kernel.settings.get(ENVIRONMENT_SETUP_MODE) === "manual" ? "manual" : "auto";
}

/** The resolved mode when validate has run for the target, else the YAML's. */
function targetMode(ctx: FeatureContext, session: ProjectSession): string | undefined {
    const validated = ctx.kernel.bundle.validated.latest;
    if (
        validated?.root === session.project.root &&
        validated.target === session.target &&
        validated.config.bundle?.mode !== undefined
    ) {
        return validated.config.bundle.mode;
    }
    return session.project.config.targets.find((t) => t.name === session.target)?.mode;
}

/** What the checklist checks: serverless, the attached cluster once it is read, or nothing. */
function checklistCompute(ctx: FeatureContext): ChecklistCompute {
    const { compute, settings } = ctx.kernel;
    const effective = compute.effective.value;
    if (effective?.kind === "serverless") {
        return { kind: "serverless", dbConnectVersion: settings.get(SERVERLESS_DBCONNECT_VERSION) };
    }
    if (effective?.kind !== "cluster") {
        return { kind: "none" };
    }
    const attached = compute.attachedCluster.value;
    if (attached?.clusterId === effective.clusterId && attached.details !== undefined) {
        return {
            kind: "cluster",
            dbrVersion: dbrVersion(attached.details.sparkVersion),
            accessMode: attached.details.accessMode,
        };
    }
    return { kind: "pending" };
}

/**
 * Whether the connection's workspace has a catalog the user can read: the
 * first page of the catalog list, as the old check read the first item.
 */
async function probeCatalogs(connection: Connection): Promise<CatalogProbe> {
    try {
        const page = await connection.api.get(CatalogsClient).listCatalogs({}, calls.read());
        return (page.catalogs?.length ?? 0) > 0 || page.nextPageToken
            ? { kind: "found" }
            : { kind: "none" };
    } catch (e) {
        return { kind: "failed", message: errorMessage(e) };
    }
}

function targetCompute(ctx: FeatureContext): TargetCompute {
    return ctx.kernel.compute.effective.value?.kind ?? "none";
}

/** The effective compute, as the uv flow resolves it. */
function attachedCompute(ctx: FeatureContext): AttachedCompute {
    const effective = ctx.kernel.compute.effective.value;
    return {
        serverless: effective?.kind === "serverless",
        cluster: effective?.kind === "cluster" ? { id: effective.clusterId } : undefined,
        serverlessVersion: effective?.kind === "serverless" ? effective.version : undefined,
    };
}

/**
 * What drift compares, without spawning the CLI: a cluster with its Spark
 * version, so a runtime edit re-checks and a state change doesn't, or
 * serverless with its version. Undefined when nothing comparable is attached.
 */
function computeDescriptor(ctx: FeatureContext): string | undefined {
    const { compute } = ctx.kernel;
    const effective = compute.effective.value;
    if (effective?.kind === "cluster") {
        const attached = compute.attachedCluster.value;
        const sparkVersion =
            attached?.clusterId === effective.clusterId
                ? attached.details?.sparkVersion
                : undefined;
        return `cluster:${effective.clusterId}:${sparkVersion}`;
    }
    if (effective?.kind === "serverless") {
        return effective.version === undefined ? undefined : `serverless:${effective.version}`;
    }
    return undefined;
}

/** The file a run or debug command is for: the explorer's or editor title's resource, else the active editor's. */
function fileOf(resource: unknown): string | undefined {
    return resource instanceof Uri ? resource.fsPath : window.activeTextEditor?.document.uri.fsPath;
}

function venvExists(root: string): boolean {
    return existsSync(venvInterpreterPath(path.join(root, ".venv")));
}

/** What the commands reach: the active session's objects. */
interface PythonSession {
    readonly root: string;
    readonly environment: PythonEnvironment;
    readonly runner: DbConnectRunner;
    readonly envFile: EnvFileWriter;
    readonly external: ExternalSetup;
    readonly autocomplete: Autocomplete;
    readonly notebooks: NotebookInitScriptManager;
    /** `databricks.environment.setup`: the uv flow, or the checklist's action for `stepId`. */
    setupEnvironment(stepId?: string): Promise<void>;
    /** The uv flow, joining the project's run in flight. */
    setupUv(): Promise<void>;
}

/**
 * Python (PYENV-01 to PYENV-07, RUN-04, RUN-07): ms-python loaded on
 * first use; per project session a `PythonEnvironment` with its strategy (uv
 * or external) and one readiness value, the uv setup with its drift check,
 * the env file, the checklist's actions with the Databricks Connect install
 * (PYENV-07, PYENV-08), and running and debugging a file with Databricks
 * Connect (RUN-04 to RUN-06); the "Python environment" rows (RUN-10);
 * notebooks: the IPython startup script, the cell markers and the
 * kernel-restart prompt (RUN-07 to RUN-09); and autocomplete for the
 * Databricks globals (PYENV-09).
 */
export const python: Feature = {
    id: "python",
    telemetryEvents: PYTHON_EVENTS,
    session: {
        ...Object.fromEntries(
            [
                ENVIRONMENT_REFRESH,
                ENVIRONMENT_SETUP,
                SETUP_PYTHON_ENV,
                RERUN_PYTHON_ENV,
                INSTALL_UV,
                USE_MANUAL_PYTHON_SETUP,
                SELECT_PYTHON_INTERPRETER,
                REINSTALL_DBCONNECT,
                CONFIGURE_AUTOCOMPLETE,
                VERIFY_NOTEBOOK_INIT_SCRIPT,
            ].map((id) => [id, PYTHON_IN_A_SESSION]),
        ),
        [DBCONNECT_RUN_FILE]: DBCONNECT_IN_A_SESSION,
        [DBCONNECT_DEBUG_FILE]: DBCONNECT_IN_A_SESSION,
    },

    register(ctx) {
        const { kernel } = ctx;
        // The extensions the components need may be missing or disabled: each says so, with Install.
        const dependencies = kernel.extensionDependencies;
        const requireExtension: ExtensionDependencies["require"] = (dep, what) =>
            dependencies.require(dep, what);
        const msPython = new MsPython(dependencies);
        ctx.subscriptions.push(msPython);
        interpreters.set(ctx, msPython);
        const detectionTelemetry = new PackageManagerTelemetry({
            telemetry: ctx.telemetry,
            activeEnvironment: (root) => msPython.activeEnvironment(root),
            projectRoot: () => kernel.project.active.value?.root,
            computeType: () => targetCompute(ctx),
            isConnected: () => kernel.connection.connection !== undefined,
            setupMode: () => setupMode(ctx),
            log: ctx.log,
        });
        const detector = new PythonSetupManagerDetector(async (root) =>
            collectPackageManagerSignals(
                root,
                await msPython.activeEnvironment(root),
                (message, e) => ctx.log.debug(message, e),
            ),
        );
        const states = new SetupStates(kernel.state, () => workspace.workspaceFolders?.length ?? 0);

        // Created on the first setup, so a user who never runs one has no empty channel.
        let channel: OutputChannel | undefined;
        const setupChannel = () => {
            if (channel === undefined) {
                channel = window.createOutputChannel(SETUP_CHANNEL);
                ctx.subscriptions.push(channel);
            }
            return channel;
        };

        let installChannel: OutputChannel | undefined;
        const dbConnectChannel = (): InstallChannel => {
            if (installChannel === undefined) {
                installChannel = window.createOutputChannel(DBCONNECT_CHANNEL);
                ctx.subscriptions.push(installChannel);
            }
            return {
                clear: () => installChannel?.clear(),
                show: () => installChannel?.show(),
                append: (text) => installChannel?.append(text),
                appendLine: (text) => installChannel?.appendLine(text),
            };
        };

        let notebooksChannel: OutputChannel | undefined;
        const notebooksOutput = () => {
            if (notebooksChannel === undefined) {
                notebooksChannel = window.createOutputChannel(NOTEBOOKS_CHANNEL);
                ctx.subscriptions.push(notebooksChannel);
            }
            return notebooksChannel;
        };
        const initScripts = new InitScripts({
            sourcePath: kernel.extension.asAbsolutePath(INIT_SCRIPT_SOURCE),
            ipythonDir: () => ipythonDir(kernel.settings.get(IPYTHON_DIR)),
            processes: kernel.processes,
        });

        // One catalog probe per connection; a failure isn't kept, and an explicit check probes again.
        let catalogs: { connection: Connection; probe: Promise<CatalogProbe> } | undefined;
        const catalogProbe = (): Promise<CatalogProbe> => {
            const connection = kernel.connection.connection;
            if (connection === undefined) {
                return Promise.resolve({ kind: "failed", message: "Not signed in" });
            }
            if (catalogs?.connection !== connection) {
                const probe = probeCatalogs(connection);
                catalogs = { connection, probe };
                void probe.then((result) => {
                    if (result.kind === "failed") {
                        ctx.log.error("Failed to check workspace permissions", result.message);
                        if (catalogs?.probe === probe) {
                            catalogs = undefined;
                        }
                    }
                });
            }
            return catalogs.probe;
        };

        // A run's compute: the setup-local env for the connection, the target and the project.
        // It reads the bundle for the target, so it is a bundle call.
        const setupLocalEnv = (session: ProjectSession) => ({
            ...kernel.childEnv({
                cli: true,
                // The host env with http.proxy over it, as 2.22.0's setup-local had.
                environment: "hostAndProxy",
                ...(session.target !== undefined
                    ? { bundle: { root: session.project.root, target: session.target } }
                    : {}),
            }),
            ...(session.target !== undefined ? { DATABRICKS_BUNDLE_TARGET: session.target } : {}),
        });

        // One uv setup per project at a time. A target change rebuilds the
        // session while setup-local still runs, so the guard outlives sessions.
        const uvSetups = new Map<string, Promise<void>>();
        // A failed uv setup stays red only while the compute in use has the key of the run that
        // failed: the compute, and what its checklist read. A window reload forgets it.
        const setupFailures = new SetupFailures((compute) =>
            JSON.stringify([compute, checklistCompute(ctx)]),
        );
        ctx.subscriptions.push(setupFailures);
        const uvSetupOnce = (root: string, run: () => Promise<void>): Promise<void> => {
            const running = uvSetups.get(root);
            if (running !== undefined) {
                return running;
            }
            const next = run().finally(() => uvSetups.delete(root));
            uvSetups.set(root, next);
            return next;
        };

        let current: PythonSession | undefined;
        ctx.whileProjectSession((session) => {
            // The session's Python is given: no setup, env file or init script of ours.
            const given = kernel.capabilities.python;
            if (given.kind === "session") {
                void writeCellMarkers({
                    settings: kernel.settings,
                    state: kernel.state,
                    log: ctx.log,
                    jupyterInstalled: () => dependencies.available(JUPYTER),
                });
                return ctx.sections.add(new SessionPythonSection(given.interpreter));
            }
            const root = session.project.root;
            const changed = new Emitter<void>();
            const setupModeChanged = new Emitter<void>();
            const computeChanged = new Emitter<void>();
            const uvChanged = new Emitter<void>();
            const cli = {
                run: (
                    invocation: Parameters<typeof environmentsSetupLocal>[1],
                    options: { cwd: string; onLog?: (chunk: string) => void; signal?: AbortSignal },
                ) =>
                    environmentsSetupLocal(kernel.cli, invocation, {
                        cwd: options.cwd,
                        env: setupLocalEnv(session),
                        signal: options.signal,
                        onStderr: options.onLog,
                    }),
            };

            const packages = new Packages({
                processes: kernel.processes,
                root,
                env: () => kernel.childEnv(),
            });
            let pending: PythonEnvironment | undefined;
            const isUv = async () => pending?.readiness?.strategy === "uv";
            const drift = new PythonSetupDriftManager({
                isVisible: isUv,
                getPersistedEnvKey: () => states.get(root)?.envKey,
                getComputeDescriptor: () => computeDescriptor(ctx),
                resolveCurrentEnvKey: async (signal) => {
                    const resolution = resolveComputeFrom(attachedCompute(ctx));
                    if (resolution.status !== "ok") {
                        return undefined;
                    }
                    try {
                        return (
                            await cli.run(
                                { dryRun: true, compute: resolution.compute },
                                { cwd: root, signal },
                            )
                        ).compute?.envKey;
                    } catch {
                        return undefined;
                    }
                },
                recordDrift: (report) => recordPythonSetupDrift(ctx.telemetry, report),
            });

            /** Whether `executable` has databricks-connect. Shared by the checklist and the run gate. */
            const dbConnectProbe = async (
                executable: string,
                signal?: AbortSignal,
                options: { uv?: boolean } = {},
            ): Promise<PackageProbe> => {
                try {
                    const found = await packages.find(
                        executable,
                        "databricks-connect",
                        signal,
                        options,
                    );
                    return found === undefined
                        ? { kind: "missing" }
                        : { kind: "installed", version: found.version };
                } catch (e) {
                    signal?.throwIfAborted();
                    ctx.log.error("Failed to check python environment dependencies", e);
                    return { kind: "failed", message: errorMessage(e) };
                }
            };

            const autocomplete = new Autocomplete({
                stubSource: kernel.extension.asAbsolutePath(BUILTINS_STUB),
                workspaceFolder: () =>
                    workspace.getWorkspaceFolder(Uri.file(root))?.uri.fsPath ?? root,
                settings: kernel.settings,
                state: kernel.state,
                showInformationMessage: (message, ...items) =>
                    window.showInformationMessage(message, ...items),
            });

            const environment = new PythonEnvironment({
                root,
                python: msPython,
                files: kernel.files,
                setupMode: () => setupMode(ctx),
                onDidChangeSetupMode: setupModeChanged.event,
                compute: () => checklistCompute(ctx),
                onDidChangeCompute: computeChanged.event,
                catalogs: () => catalogProbe(),
                dbConnect: dbConnectProbe,
                builtins: async (): Promise<BuiltinsProbe> => {
                    try {
                        return (await autocomplete.shouldSetupBuiltins())
                            ? { kind: "needed" }
                            : { kind: "configured" };
                    } catch (e) {
                        ctx.log.error("Failed to check Databricks builtins definition", e);
                        return { kind: "failed", message: errorMessage(e) };
                    }
                },
                onDidChangeBuiltins: autocomplete.onDidUpdate,
                uvStatus: async () => {
                    if (states.get(root) === undefined || !venvExists(root)) {
                        return "notReady";
                    }
                    return drift.state === "drifted" ? "drifted" : "ready";
                },
                uvSetupFailed: () => setupFailures.matches(root, kernel.compute.effective.value),
                onDidChangeUvStatus: uvChanged.event,
                log: ctx.log,
            });
            pending = environment;

            const setup = new PythonSetupEnvironmentSetup(
                makePythonSetupDeps({
                    cli,
                    failures: setupFailures,
                    logger: ctx.log,
                    projectRoot: () => root,
                    detect: (r) => detector.detect(r),
                    setupMode: () => setupMode(ctx),
                    attachedCompute: () => attachedCompute(ctx),
                    // The compute feature's picker saves the version with Serverless selected.
                    promptServerlessVersion: async () =>
                        ctx.commands.execute(SELECT_SERVERLESS_VERSION, undefined),
                    persistServerlessVersion: async () => {},
                    promptSelectCompute: async (): Promise<SetupCompute | undefined> => {
                        const picked = await ctx.commands.execute(
                            ATTACH_CLUSTER_QUICK_PICK,
                            "Select compute to set up the Python environment for",
                        );
                        if (picked?.kind === "cluster") {
                            return picked;
                        }
                        if (picked?.kind === "serverless") {
                            const version =
                                picked.version ??
                                (await ctx.commands.execute(SELECT_SERVERLESS_VERSION, undefined));
                            return version === undefined
                                ? undefined
                                : { kind: "serverless", version };
                        }
                        return undefined;
                    },
                    createQuickPick: () => window.createQuickPick(),
                    // The attached cluster's runtime when it is read, else a fresh read.
                    clusterDbrVersion: async (clusterId) => {
                        try {
                            const attached = kernel.compute.attachedCluster.value;
                            const details =
                                attached?.clusterId === clusterId && attached.details !== undefined
                                    ? attached.details
                                    : await kernel.compute.getCluster(clusterId);
                            return dbrVersion(details.sparkVersion);
                        } catch {
                            return undefined;
                        }
                    },
                    requirePythonExtension: () =>
                        dependencies.require(PYTHON, "Setting up the Python environment"),
                    setActiveInterpreter: (interpreterPath, r) =>
                        msPython.setActiveEnvironmentPath(interpreterPath, r),
                    persistSetupState: (r, state) => states.set(r, state),
                    openExternal: async (url) => env.openExternal(Uri.parse(url, true)),
                    showError: (error) => ctx.commands.showError(error),
                    log: {
                        append: (chunk) => setupChannel().append(chunk),
                        show: () => setupChannel().show(true),
                    },
                    reportEnvironment: {
                        extensionVersion: kernel.extension.version,
                        cliVersion: kernel.extension.cliVersion ?? "unknown",
                        platform: process.platform,
                    },
                    telemetry: ctx.telemetry,
                }),
            );

            const envFile = new EnvFileWriter({
                root,
                inputs: () => {
                    const connection = kernel.connection.connection;
                    if (connection === undefined) {
                        return undefined;
                    }
                    const effective = kernel.compute.effective.value;
                    return {
                        child: kernel.childEnv({
                            compute:
                                effective === undefined
                                    ? undefined
                                    : effective.kind === "cluster"
                                      ? { kind: "cluster", clusterId: effective.clusterId }
                                      : { kind: "serverless" },
                        }),
                        computeDefault:
                            effective?.kind === "serverless" && effective.source === "default",
                        clearAmbient: connection.child.kind === "profile",
                        projectRoot: root,
                        target: session.target,
                        extensionVersion: kernel.extension.version,
                        progressBar: kernel.settings.get(DBCONNECT_PROGRESS),
                        sparkUserAgent: process.env["SPARK_CONNECT_USER_AGENT"],
                    };
                },
                userEnvFile: () => {
                    const value = kernel.settings.get(PYTHON_ENV_FILE);
                    return value
                        ? path.resolve(root, resolveSystemVariables(value, root))
                        : undefined;
                },
                files: kernel.files,
                log: ctx.log,
            });

            const runner = new DbConnectRunner({
                root,
                readiness: async (): Promise<Readiness | undefined> => {
                    const state = await environment.refresh("Databricks Connect run");
                    return state.status === "ready" ? state.value.readiness : environment.readiness;
                },
                setup: () => runSetup(),
                requireExtension,
                executable: () => msPython.executable(root),
                dbConnect: (executable, signal) => dbConnectProbe(executable, signal, { uv: true }),
                setActiveEnvironmentPath: (interpreter) =>
                    msPython.setActiveEnvironmentPath(interpreter, root),
                writeEnvFile: () => envFile.update("Databricks Connect run"),
                bootstrapPath: kernel.extension.asAbsolutePath(
                    path.join("resources", "python", "dbconnect-bootstrap.py"),
                ),
                terminals: window,
                shellKind: () => detectShellKind(env.shell),
                startDebugging: (configuration) =>
                    debug.startDebugging(
                        workspace.getWorkspaceFolder(Uri.file(root)),
                        configuration,
                    ),
                onRun: (launchType) => {
                    const kind = kernel.compute.effective.value?.kind;
                    ctx.telemetry.record(DBCONNECT_RUN, {
                        launchType,
                        computeType: kind === "serverless" ? "serverless" : "cluster",
                    });
                    void detectionTelemetry.emitDetection(launchType);
                },
            });

            // The checklist re-checks after an action; that also probes the catalogs again.
            const recheck = async (progress: boolean): Promise<Readiness | undefined> => {
                catalogs = undefined;
                const evaluate = () => environment.refresh(ENVIRONMENT_SETUP);
                const state = progress
                    ? await window.withProgress(
                          {
                              location: ProgressLocation.Notification,
                              title: "Databricks: checking python environment",
                          },
                          evaluate,
                      )
                    : await evaluate();
                return state.status === "ready" ? state.value.readiness : environment.readiness;
            };
            const installer = new DbConnectInstaller({
                packages,
                executable: () => msPython.executable(root),
                environmentName: async () =>
                    (await msPython.activeEnvironment(root))?.environment?.name,
                compute: () => checklistCompute(ctx),
                channel: dbConnectChannel,
                ui: {
                    showInformationMessage: (message, ...choices) =>
                        window.showInformationMessage(message, ...choices),
                    showInputBox: (options) => window.showInputBox(options),
                    showError: (error) => ctx.commands.showError(error),
                },
                selectInterpreter: async () => {
                    await commands.executeCommand(SELECT_PYTHON_INTERPRETER);
                },
                startInstall: () => ctx.telemetry.start(PYTHON_ENV_DBCONNECT_INSTALL),
                onInstalled: () => recheck(false),
            });
            const external = new ExternalSetup({
                readiness: () => environment.readiness,
                refresh: recheck,
                python: {
                    availableEnvironments: () => msPython.availableEnvironments(),
                    createEnvironment: () => msPython.createEnvironment(),
                    selectInterpreter: () => msPython.selectInterpreter(),
                    setActiveEnvironmentPath: (interpreter) =>
                        msPython.setActiveEnvironmentPath(interpreter, root),
                },
                requireExtension,
                installer,
                compute: () => checklistCompute(ctx),
                attachCluster: async (message) => {
                    await ctx.commands.execute(ATTACH_CLUSTER_QUICK_PICK, message);
                },
                configureAutocomplete: () => autocomplete.configure(),
                ui: window,
            });

            const notebooks = new NotebookInitScriptManager({
                scripts: initScripts,
                root,
                usable: () => usable(environment.readiness),
                inNotebook,
                requireExtension,
                executable: () => msPython.executable(root),
                environmentName: async () =>
                    (await msPython.activeEnvironment(root))?.environment?.name,
                hasIpython: async (executable) =>
                    (await packages.find(executable, "ipython")) !== undefined,
                installIpython: (executable) =>
                    packages.install(executable, "ipython", undefined, notebooksOutput()),
                selectInterpreter: async () => {
                    await commands.executeCommand(SELECT_PYTHON_INTERPRETER);
                },
                // Through the registry, which shows the command's errors.
                verifyAgain: async () => {
                    await commands.executeCommand(VERIFY_NOTEBOOK_INIT_SCRIPT);
                },
                // The script reads the env file itself; the run gets the same variables, empty ones unset.
                env: async () => {
                    await envFile.update("notebook init script");
                    const vars: NodeJS.ProcessEnv = {
                        ...kernel.childEnv(),
                        ...envFile.variables(),
                    };
                    for (const [key, value] of Object.entries(vars)) {
                        if (value === "") {
                            delete vars[key];
                        }
                    }
                    return vars;
                },
                channel: notebooksOutput,
                ui: {
                    showError: (error) => ctx.commands.showError(error),
                    showInformationMessage: (message) => window.showInformationMessage(message),
                    showWarningMessage: (message) => window.showWarningMessage(message),
                    withProgress: (message, task) =>
                        Promise.resolve(
                            window.withProgress(
                                { location: ProgressLocation.Notification },
                                async (progress) => {
                                    progress.report({ message });
                                    return task();
                                },
                            ),
                        ),
                },
                log: ctx.log,
            });
            // The checklist's setup, as the old command ran it: in the configuration view, with its progress.
            const externalSetup = async (stepId?: string) => {
                void commands.executeCommand("configurationView.focus");
                void detectionTelemetry.emitDetection("explicit_command");
                await window.withProgress({ location: { viewId: "configurationView" } }, () =>
                    external.setup(stepId),
                );
            };
            const uvSetup = () => uvSetupOnce(root, () => setup.setup());
            const runSetup = (stepId?: string) =>
                routeEnvironmentSetup(
                    { isVisible: isUv, setup: uvSetup },
                    { setup: externalSetup },
                    stepId,
                );
            current = {
                root,
                environment,
                runner,
                envFile,
                external,
                autocomplete,
                notebooks,
                setupEnvironment: runSetup,
                setupUv: uvSetup,
            };

            // The checks read the compute only when it changes what they ask for.
            let lastCompute = JSON.stringify(checklistCompute(ctx));
            const onCompute = () => {
                const next = JSON.stringify(checklistCompute(ctx));
                if (next !== lastCompute) {
                    lastCompute = next;
                    computeChanged.fire();
                }
                setupFailures.clearUnless(root, kernel.compute.effective.value);
                uvChanged.fire();
                drift.check("computeChange");
                void envFile.update("the compute changed");
            };

            const visible = () =>
                kernel.connection.connection !== undefined &&
                targetMode(ctx, session) === "development";
            // Shown, the rows need an evaluation, which loads ms-python, and the attached cluster's runtime.
            let observing: Disposable | undefined;
            const update = () => {
                if (visible()) {
                    environment.start();
                    observing ??= kernel.compute.attachedCluster.onDidChange(onCompute);
                } else if (observing !== undefined) {
                    observing.dispose();
                    observing = undefined;
                }
                changed.fire();
            };

            // Databricks `.py` notebooks split into cells in the Interactive Window (RUN-09); once per workspace.
            const cellMarkers = {
                settings: kernel.settings,
                state: kernel.state,
                log: ctx.log,
                jupyterInstalled: () => dependencies.available(JUPYTER),
            };
            let checkedDrift = false;
            const disposables: Disposable[] = [
                // A newly selected interpreter without Databricks Connect is offered the install, once (PYENV-08).
                msPython.onDidChangeInterpreter(() => {
                    if (!environment.started) {
                        return;
                    }
                    void environment
                        .refresh("the interpreter changed")
                        .then((state) =>
                            state.status === "ready"
                                ? external.offerInstall(state.value.readiness, true)
                                : undefined,
                        )
                        .catch((e: unknown) =>
                            ctx.log.error("The Databricks Connect install prompt failed", e),
                        );
                }),
                changed,
                setupModeChanged,
                computeChanged,
                uvChanged,
                drift,
                environment,
                setup,
                envFile,
                runner,
                autocomplete,
                startNotebookSession({
                    manager: notebooks,
                    restart: new KernelRestartPrompt({
                        jupyterInstalled: () => dependencies.available(JUPYTER),
                        notebooks: () => workspace.notebookDocuments,
                        showInformationMessage: (message, ...items) =>
                            window.showInformationMessage(message, ...items),
                        executeCommand: (command, ...args) =>
                            commands.executeCommand(command, ...args),
                        log: ctx.log,
                    }),
                    readiness: () => environment.readiness,
                    onDidChangeReadiness: environment.state.onDidChange,
                    onDidChangeEnvFile: envFile.onDidChange,
                    log: ctx.log,
                }),
                ctx.sections.add(
                    new PythonEnvironmentSection(
                        {
                            visible,
                            readiness: () => environment.readiness,
                            commands: {
                                setup: SETUP_PYTHON_ENV,
                                rerun: RERUN_PYTHON_ENV,
                                step: ENVIRONMENT_SETUP,
                            },
                        },
                        changed.event,
                    ),
                ),
                environment.state.onDidChange((s) => {
                    changed.fire();
                    if (s.status !== "ready") {
                        return;
                    }
                    // Choosing Serverless asks for a version while the uv setup is the surface (COMP-02).
                    kernel.compute.serverlessVersionRequired.set(
                        s.value.readiness.strategy === "uv",
                    );
                    if (s.value.readiness.strategy === "uv" && !checkedDrift) {
                        checkedDrift = true;
                        drift.check("workspaceOpen");
                    }
                    void detectionTelemetry.emitDetection("auto_open");
                }),
                states.onDidChange(() => uvChanged.fire()),
                drift.onDidChangeState(() => uvChanged.fire()),
                setup.onDidChangeState(() => drift.check("setupCompleted")),
                setupFailures.onDidChange(() => uvChanged.fire()),
                kernel.files.watch(root, ".venv/{bin/python,Scripts/python.exe}", () =>
                    uvChanged.fire(),
                ),
                kernel.settings.onDidChange(ENVIRONMENT_SETUP_MODE, () => setupModeChanged.fire()),
                kernel.settings.onDidChange(SERVERLESS_DBCONNECT_VERSION, onCompute),
                kernel.settings.onDidChange(
                    DBCONNECT_PROGRESS,
                    () => void envFile.update("databricks.connect.progress changed"),
                ),
                kernel.settings.onDidChange(
                    PYTHON_ENV_FILE,
                    () => void envFile.update("python.envFile changed"),
                ),
                kernel.compute.effective.onDidChange(onCompute),
                kernel.connection.state.onDidChange(() => {
                    update();
                    void envFile.update("the connection changed");
                }),
                kernel.bundle.validated.onDidChange(update),
                // Jupyter installed or enabled later: its settings exist now.
                dependencies.onDidChange(JUPYTER, () => void writeCellMarkers(cellMarkers)),
            ];
            update();
            void envFile.update("the session started");
            void writeCellMarkers(cellMarkers);
            return {
                dispose: () => {
                    if (current?.environment === environment) {
                        current = undefined;
                        kernel.compute.serverlessVersionRequired.set(false);
                    }
                    observing?.dispose();
                    disposeAll(disposables);
                },
            };
        });

        // Once per project and window: is a recorded setup's `.venv` still there?
        const adoption = new PythonSetupAdoptionManager({
            projectRoot: () => kernel.project.active.value?.root,
            // Setups are recorded per project now, so a reading is always the project's own.
            isAttributable: () => true,
            isVpexActive: () => {
                const root = kernel.project.active.value?.root;
                return root !== undefined && states.get(root) !== undefined;
            },
            getTargetType: () => targetCompute(ctx),
            venvExists,
            record: (report) => recordPythonSetupAdoption(ctx.telemetry, report),
        });
        if (kernel.capabilities.python.kind === "managed") {
            ctx.whileConnected(() => adoption.report());
        }

        const session = (): PythonSession => {
            if (current === undefined) {
                // The commands run in project scope, so a session exists; this is defence in depth.
                throw new Error("No Python session for the active project");
            }
            return current;
        };

        ctx.commands.register(
            ENVIRONMENT_REFRESH,
            async () => {
                const environment = current?.environment;
                if (environment !== undefined) {
                    // As before, an explicit refresh checks the workspace's catalogs again.
                    catalogs = undefined;
                    await window.withProgress({ location: { viewId: "configurationView" } }, () =>
                        environment.refresh(ENVIRONMENT_REFRESH),
                    );
                }
            },
            { scope: "project" },
        );
        ctx.commands.register(
            ENVIRONMENT_SETUP,
            // A checklist row passes its step ID; the uv flow has no steps.
            async (_project, stepId?: unknown) => {
                const s = session();
                await s.setupEnvironment(typeof stepId === "string" ? stepId : undefined);
                await s.environment.refresh(ENVIRONMENT_SETUP);
            },
            { scope: "project" },
        );
        for (const id of [SETUP_PYTHON_ENV, RERUN_PYTHON_ENV]) {
            ctx.commands.register(id, () => session().setupUv(), { scope: "project" });
        }
        ctx.commands.register(USE_MANUAL_PYTHON_SETUP, async (arg?: { source?: unknown }) => {
            // The E_FETCH notification passes {source: "error_popup"}; the palette passes nothing.
            const source: PythonSetupOptOutSource =
                arg?.source === "error_popup" ? "error_popup" : "command_palette";
            await optOutOfAutomatedPythonSetup(source, {
                currentMode: () => setupMode(ctx),
                hasFolder: () => (workspace.workspaceFolders?.length ?? 0) > 0,
                setManual: (target) =>
                    kernel.settings.update(ENVIRONMENT_SETUP_MODE, "manual", target),
                recordOptOut: (report) => recordManualSetupOptOut(ctx.telemetry, report),
                showError: (m) =>
                    ctx.commands.showError(new UserFacingError("MANUAL_SETUP_NOT_SAVED", m)),
                showInfo: (m) => window.showInformationMessage(m),
            });
        });
        ctx.commands.register(INSTALL_UV, () =>
            runUvInstall({
                // A remote script runs: one explicit, informed confirmation.
                confirm: async () =>
                    (await window.showWarningMessage(
                        UV_INSTALL_CONFIRM_MESSAGE,
                        { modal: true },
                        UV_INSTALL_CONFIRM_ACTION,
                    )) === UV_INSTALL_CONFIRM_ACTION,
                openTerminal: (spec) => {
                    const terminal = window.createTerminal({
                        name: spec.name,
                        shellPath: spec.shellPath,
                    });
                    terminal.show();
                    terminal.sendText(spec.command);
                },
                shellKind: () => detectShellKind(env.shell),
            }),
        );
        ctx.commands.register(
            DBCONNECT_RUN_FILE,
            async (_project, resource?: unknown) =>
                void (await session().runner.run(fileOf(resource))),
            { scope: "project" },
        );
        ctx.commands.register(
            DBCONNECT_DEBUG_FILE,
            async (_project, resource?: unknown) =>
                void (await session().runner.debug(fileOf(resource))),
            { scope: "project" },
        );
        ctx.commands.register(
            SELECT_PYTHON_INTERPRETER,
            () => session().external.selectPythonInterpreter(),
            { scope: "project" },
        );
        ctx.commands.register(REINSTALL_DBCONNECT, () => session().external.reinstallDbConnect(), {
            scope: "project",
        });
        ctx.commands.register(CONFIGURE_AUTOCOMPLETE, () => session().autocomplete.configure(), {
            scope: "project",
        });
        ctx.commands.register(
            VERIFY_NOTEBOOK_INIT_SCRIPT,
            () => session().notebooks.verifyCommand(),
            { scope: "project" },
        );

        // `databricks: true` sessions and ms-python's test sessions get the project's Databricks variables (RUN-06).
        const debugConfiguration = new DatabricksDebugConfigurationProvider({
            bootstrapPath: kernel.extension.asAbsolutePath(
                path.join("resources", "python", "dbconnect-bootstrap.py"),
            ),
            variables: async () => current?.envFile.variables(),
        });
        for (const type of ["python", "debugpy"]) {
            ctx.subscriptions.push(
                debug.registerDebugConfigurationProvider(type, debugConfiguration),
            );
        }
    },

    async start(ctx) {
        // The session's interpreter is the window's, as the old remote mode
        // set it. A missing Python extension is shown, with Install;
        // a failure to select is logged, not shown, as before.
        const python = ctx.kernel.capabilities.python;
        const msPython = interpreters.get(ctx);
        if (python.kind !== "session" || python.interpreter === undefined || !msPython) {
            return;
        }
        try {
            ctx.kernel.extensionDependencies.require(
                PYTHON,
                "Selecting the session's Python environment",
            );
        } catch (e) {
            if (e instanceof UserFacingError) {
                await ctx.commands.showError(e);
                return;
            }
            throw e;
        }
        ctx.log.debug("Selecting the session's interpreter", { interpreter: python.interpreter });
        await msPython
            .setActiveEnvironmentPath(python.interpreter)
            .catch((e: unknown) =>
                ctx.log.error(`Can't select the interpreter ${python.interpreter}`, e),
            );
    },
};

/** Each registration's ms-python, for its `start`. */
const interpreters = new WeakMap<FeatureContext, MsPython>();
