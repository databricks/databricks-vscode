import type { SetupStrategy } from "./pythonSetupGate";

/**
 * What clicking a failing checklist row does (`setup/external/ExternalSetup`):
 * pick an interpreter, attach a cluster, install or reinstall Databricks
 * Connect, write the autocomplete builtins, or check again.
 */
export type CheckAction =
    | "selectInterpreter"
    | "attachCluster"
    | "installDbConnect"
    | "reinstallDbConnect"
    | "configureAutocomplete"
    | "recheck";

/**
 * One row of the external strategy's checklist: the old `FeatureStepState`,
 * without its callback. `action` names what clicking the row does.
 */
export interface ReadinessCheck {
    /** The old step ID, e.g. `checkPythonEnvironment`: rows' `contextValue`s carry it. */
    readonly id: string;
    readonly available: boolean;
    /** A check without a title has no row, as a passing compute check had none. */
    readonly title?: string;
    readonly message?: string;
    /** Shown as a second row under a passing check. */
    readonly warning?: string;
    /** Not needed for readiness: the autocomplete builtins row. */
    readonly optional?: boolean;
    readonly action?: CheckAction;
    /** What `attachCluster` says in the compute picker: why this cluster won't do. */
    readonly actionMessage?: string;
}

/** The active interpreter, as ms-python reports it. */
export interface Interpreter {
    readonly path?: string;
    /** The environment's name; undefined for a global interpreter. */
    readonly name?: string;
    /** `major.minor.micro`. */
    readonly version?: string;
}

/**
 * The single readiness value of a project session. The section, the DB
 * Connect gate, the env file and notebooks read only this.
 */
export interface Readiness {
    readonly strategy: SetupStrategy;
    /**
     * `ready` when every required check passes (external), or when a setup is
     * recorded for the project and its `.venv` exists (uv); `drifted` when a
     * uv setup no longer matches the compute.
     */
    readonly status: "ready" | "notReady" | "drifted";
    readonly interpreter?: Interpreter;
    /** The installed `databricks-connect`, when the external strategy has read it. */
    readonly dbConnectVersion?: string;
    /** The external strategy's checklist; empty for uv. */
    readonly checks: readonly ReadinessCheck[];
    /** A uv setup this session failed, and no later success or compute change followed it. */
    readonly setupFailed?: boolean;
}

/** Ready when every required check passes. */
export function externalStatus(checks: readonly ReadinessCheck[]): Readiness["status"] {
    return checks.every((c) => c.available || c.optional) ? "ready" : "notReady";
}
