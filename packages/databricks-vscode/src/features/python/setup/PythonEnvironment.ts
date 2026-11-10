import type { Disposable, Event } from "vscode";
import type { Logger } from "../../../platform/log";
import { Resource, type State, type ResourceState } from "../../../platform/reactive";
import type { FileEvents } from "../../../platform/fileEvents";
import type { ResolvedEnvironment } from "../msPythonApi";
import {
    checkBuiltins,
    checkCluster,
    checkEnvironmentDependencies,
    checkWorkspaceHasUc,
    interpreterCompute,
    type BuiltinsProbe,
    type CatalogProbe,
    type ChecklistCompute,
    type PackageProbe,
} from "./external/checks";
import { checkPythonEnvironment } from "./external/interpreterCheck";
import type { PackageManagerDetection } from "./packageManagerDetection";
import { collectPackageManagerSignals } from "./packageManagerSignals";
import { PythonSetupManagerDetector } from "./PythonSetupManagerDetector";
import { setupStrategy, type PythonEnvironmentSetupMode } from "./pythonSetupGate";
import { externalStatus, type Interpreter, type Readiness } from "./readiness";

/**
 * The files whose presence or content changes the detection: the
 * lockfiles, `pyproject.toml`, requirements and constraints files, and conda
 * environment files, in the project root.
 */
export const MARKER_FILES =
    "{uv.lock,poetry.lock,pyproject.toml,requirements*.txt,constraints.txt,environment.yml,environment.yaml}";

/**
 * Re-evaluating after a change waits this long for more changes: a `uv lock`
 * or a branch switch touches several files. Starting and `refresh` don't wait.
 */
const DEBOUNCE_MS = 200;

export interface PythonEnvironmentInputs {
    /** The project root, where the marker files are. */
    readonly root: string;
    readonly python: {
        activeEnvironment(resource: string): Promise<ResolvedEnvironment | undefined>;
        readonly onDidChangeInterpreter: Event<void>;
        /** Whether the Python extension is installed and enabled. */
        readonly installed: boolean;
    };
    readonly files: FileEvents;
    /** `databricks.python.environmentSetup`. */
    setupMode(): PythonEnvironmentSetupMode;
    readonly onDidChangeSetupMode: Event<void>;
    /** What the external strategy checks the compute and the interpreter against. */
    compute(): ChecklistCompute;
    readonly onDidChangeCompute: Event<void>;
    /** Whether the workspace has a catalog the user can read (the checklist's Unity Catalog row). */
    catalogs(signal: AbortSignal): Promise<CatalogProbe>;
    /** `databricks-connect` in the interpreter `executable` (the checklist's Databricks Connect row). */
    dbConnect(executable: string, signal: AbortSignal): Promise<PackageProbe>;
    /** Whether `__builtins__.pyi` declares the Databricks globals (the checklist's optional autocomplete row). */
    builtins?(): Promise<BuiltinsProbe>;
    /** The builtins file was written, or declined. */
    readonly onDidChangeBuiltins?: Event<void>;
    /**
     * The uv strategy's status (PYENV-04): `ready` once a setup is recorded for
     * the project and its `.venv` is there, `drifted` when the compute no
     * longer matches it. Defaults to `notReady`.
     */
    uvStatus?(signal: AbortSignal): Promise<Readiness["status"]>;
    /** Whether this session's uv setup failed for the project. */
    uvSetupFailed?(): boolean;
    /** The setup record, the `.venv` or the drift may have changed. */
    readonly onDidChangeUvStatus?: Event<void>;
    readonly log: Logger;
    /** Defaults to the extension host's `CONDA_PREFIX`. */
    readonly condaPrefix?: string;
}

/** What one evaluation found. */
export interface Evaluation {
    readonly detection: PackageManagerDetection;
    readonly environment?: ResolvedEnvironment;
    readonly readiness: Readiness;
}

function interpreterOf(env: ResolvedEnvironment | undefined): Interpreter | undefined {
    if (env === undefined) {
        return undefined;
    }
    const v = env.version;
    return {
        path: env.executable.uri?.fsPath,
        name: env.environment?.name,
        version: v?.major === undefined ? undefined : `${v.major}.${v.minor ?? 0}.${v.micro ?? 0}`,
    };
}

/**
 * The Python environment of one project session: the setup strategy,
 * uv or external, and one readiness value. Ports the old
 * `makePythonSetupVisibility` gate and the external checklist's state.
 *
 * Nothing is read until `start()`: the section calls it when it first shows,
 * so ms-python loads only then. From then on the strategy and readiness are
 * re-evaluated when a marker file changes, when the interpreter changes,
 * when `databricks.python.environmentSetup` changes, when the compute
 * changes, and when the uv setup changes; or when `refresh` is called.
 */
export class PythonEnvironment implements Disposable {
    private readonly evaluation: Resource<Evaluation>;
    private readonly detector: PythonSetupManagerDetector;
    private environment?: Promise<ResolvedEnvironment | undefined>;
    private subscriptions?: Disposable[];

    constructor(private readonly inputs: PythonEnvironmentInputs) {
        // One interpreter lookup per evaluation, shared by the detection and the checks.
        this.detector = new PythonSetupManagerDetector(async (root) =>
            collectPackageManagerSignals(
                root,
                await this.environment,
                (message, e) => inputs.log.debug(message, e),
                inputs.condaPrefix ?? process.env["CONDA_PREFIX"],
            ),
        );
        this.evaluation = new Resource((signal) => this.evaluate(signal), {
            debounceMs: DEBOUNCE_MS,
        });
    }

    /** The evaluations; `idle` until `start()`. */
    get state(): State<ResourceState<Evaluation>> {
        return this.evaluation;
    }

    /** The last readiness, kept while a re-evaluation runs. Undefined before the first. */
    get readiness(): Readiness | undefined {
        return this.evaluation.latest?.readiness;
    }

    get started(): boolean {
        return this.subscriptions !== undefined;
    }

    /** Starts watching and evaluates. Further calls do nothing. */
    start(): void {
        if (this.subscriptions !== undefined) {
            return;
        }
        const { inputs } = this;
        const again = (reason: string) => () => this.evaluation.invalidate(reason);
        this.subscriptions = [
            inputs.files.watch(inputs.root, MARKER_FILES, again("a marker file changed")),
            inputs.python.onDidChangeInterpreter(again("the interpreter changed")),
            inputs.onDidChangeSetupMode(again("databricks.python.environmentSetup changed")),
            inputs.onDidChangeCompute(again("the compute changed")),
            ...(inputs.onDidChangeUvStatus
                ? [inputs.onDidChangeUvStatus(again("the uv setup changed"))]
                : []),
            ...(inputs.onDidChangeBuiltins
                ? [inputs.onDidChangeBuiltins(again("the autocomplete builtins changed"))]
                : []),
        ];
        void this.evaluation.refresh("started");
    }

    /** Re-evaluates, starting first if needed. Resolves with the result. */
    refresh(reason: string): Promise<ResourceState<Evaluation>> {
        if (this.subscriptions === undefined) {
            this.start();
            return this.evaluation.settled();
        }
        return this.evaluation.refresh(reason);
    }

    dispose(): void {
        this.subscriptions?.forEach((s) => s.dispose());
        this.evaluation.dispose();
    }

    private async evaluate(signal: AbortSignal): Promise<Evaluation> {
        const { inputs } = this;
        this.environment = inputs.python.activeEnvironment(inputs.root).catch((e: unknown) => {
            inputs.log.debug("Can't resolve the Python environment", e);
            return undefined;
        });
        const environment = await this.environment;
        const detection = await this.detector.detect(inputs.root);
        signal.throwIfAborted();
        const strategy = setupStrategy(inputs.setupMode(), detection);
        const interpreter = interpreterOf(environment);
        if (strategy === "uv") {
            const status = (await inputs.uvStatus?.(signal)) ?? "notReady";
            signal.throwIfAborted();
            const setupFailed = inputs.uvSetupFailed?.() === true;
            return {
                detection,
                environment,
                readiness: {
                    strategy,
                    status,
                    interpreter,
                    checks: [],
                    ...(setupFailed ? { setupFailed } : {}),
                },
            };
        }
        // The old checklist's rows, in its order: compute, Unity Catalog, interpreter, Databricks Connect, builtins.
        const compute = inputs.compute();
        const interpreterCheck = checkPythonEnvironment(
            environment,
            interpreterCompute(compute),
            inputs.python.installed,
        );
        const executable = interpreterCheck.available ? interpreterCheck.message : undefined;
        const [catalogs, dbConnect] = await Promise.all([
            inputs.catalogs(signal),
            executable === undefined ? undefined : inputs.dbConnect(executable, signal),
        ]);
        signal.throwIfAborted();
        const dependencies = checkEnvironmentDependencies(
            interpreterCheck.available,
            dbConnect,
            compute,
        );
        const builtins = dependencies.available ? await inputs.builtins?.() : undefined;
        signal.throwIfAborted();
        const checks = [
            checkCluster(compute),
            checkWorkspaceHasUc(catalogs),
            interpreterCheck,
            dependencies,
            checkBuiltins(dependencies.available, builtins),
        ];
        const dbConnectVersion = dbConnect?.kind === "installed" ? dbConnect.version : undefined;
        return {
            detection,
            environment,
            readiness: {
                strategy,
                status: externalStatus(checks),
                interpreter,
                dbConnectVersion,
                checks,
            },
        };
    }
}
