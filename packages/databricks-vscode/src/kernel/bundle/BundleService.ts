import { isDeepStrictEqual } from "node:util";
import { CancelledError, isCancellation } from "../../platform/errors";
import { disposeAll, type Disposable } from "../../platform/event";
import type { Logger } from "../../platform/log";
import { Resource, type State } from "../../platform/reactive";
import { CliError, type Cli } from "../cli/Cli";
import {
    bundleSummary,
    bundleValidate,
    MissingVariableError,
    type SummaryOutput,
    type ValidateOutput,
} from "../cli/commands/bundle";
import type { Connection, ConnectionState } from "../connection/ConnectionService";
import type { ProjectSnapshot } from "../project/ProjectService";
import { accessError, type TargetAccessState } from "../project/TargetGuard";
import type { VariableOverrides } from "../project/TargetFiles";
import type { BundleLog } from "./BundleLog";
import { bundleClusterOverride } from "../compute/effectiveCompute";
import {
    BundleOperations,
    type BundleEnvInputs,
    type OperationHost,
    type OperationTarget,
} from "./BundleOperations";

/** What one CLI call ran against. Both results carry it, so readers can tell stale from current. */
interface BundleTarget {
    readonly root: string;
    readonly target: string;
    /** The connection's host, for links into the workspace. */
    readonly host: string;
}

/** `bundle validate`'s resolved configuration for the target. */
export interface ValidatedBundle extends BundleTarget {
    readonly config: ValidateOutput;
}

/** `bundle summary`: the configuration with the deployed state merged in. */
export interface DeployedBundle extends BundleTarget {
    readonly summary: SummaryOutput;
}

export interface BundleServiceDeps {
    readonly project: State<ProjectSnapshot>;
    readonly connection: State<ConnectionState>;
    /** Whether the target may run bundle commands here; a paused one is neither validated nor summarised. */
    readonly access?: State<TargetAccessState>;
    readonly cli: Cli;
    /**
     * The environment of a bundle CLI call for this connection, these
     * variable overrides and this cluster override (`childEnv`, with
     * `BUNDLE_VAR_*` and `DATABRICKS_CLUSTER_ID`).
     */
    readonly env: (
        connection: Connection,
        inputs: BundleEnvInputs,
    ) => Record<string, string> | Promise<Record<string, string>>;
    /**
     * Whether the target's "Override Jobs cluster in bundle" applies (`capabilities.compute` is
     * `perTarget`). A session's compute is the window's: its deploys keep the bundle's own.
     */
    readonly choosesCompute: boolean;
    readonly log: Logger;
    readonly bundleLog: BundleLog;
    /** Coalesces the project and connection changes of one transition. */
    readonly debounceMs?: number;
}

interface Inputs extends BundleTarget {
    readonly revision?: string;
    /** The target's `vscode.bundlevars.json`; a change validates again. */
    readonly variables: VariableOverrides;
    /** "Override Jobs cluster in bundle"'s cluster; a change validates again, since `cluster_id` follows it. */
    readonly clusterId?: string;
    readonly connection: Connection;
}

/**
 * The bundle pipeline. A project session with a
 * target and a connection is validated whenever a bundle file, the target,
 * the target's variable overrides or the connection changes; `bundle summary` then runs only if validate's
 * outcome changed. A burst of saves therefore starts at most two processes,
 * a newer validate aborts the one in flight, and reading never starts one.
 * While a deploy or destroy runs (`operations`), no summary starts; one
 * runs when it ends.
 *
 * Replaces the old `BundleValidateModel`, `BundleRemoteStateModel` and the
 * bundle half of `ConfigModel`.
 */
export class BundleService implements Disposable {
    readonly validated: Resource<ValidatedBundle>;
    readonly deployed: Resource<DeployedBundle>;
    /** Deploy and destroy, one at a time per project. */
    readonly operations: BundleOperations;

    private inputs?: Inputs;
    /**
     * The target manual commands run for: as `inputs`, but it follows the connection
     * and not the cached check, which only the automatic runs wait for. Each command's
     * check (`bundleEnv`) decides what may run.
     */
    private manual?: Inputs;
    /** Validate's last outcome, as a comparable string. */
    private lastOutcome?: string;
    /** Set by an explicit refresh: the next summary runs even if validate's outcome is unchanged. */
    private pendingRefresh?: { forcePull: boolean };
    /** Whether the summary about to run pulls the remote state. */
    private forcePull = false;
    /** Operations running: summaries wait until none is. */
    private paused = 0;
    private readonly disposables: Disposable[] = [];
    private started = false;

    constructor(private readonly deps: BundleServiceDeps) {
        this.validated = new Resource((signal) => this.validate(signal), {
            debounceMs: deps.debounceMs ?? 50,
        });
        this.deployed = new Resource((signal) => this.summarize(signal));
        this.disposables.push(this.validated.onDidChange((s) => this.onValidated(s)));
        this.operations = new BundleOperations({
            host: this.operationHost(),
            cli: deps.cli,
            env: deps.env,
            log: deps.log,
            bundleLog: deps.bundleLog,
        });
    }

    /** Starts following the project and the connection. Call from `start`. */
    start(): void {
        if (this.started) {
            return;
        }
        this.started = true;
        this.disposables.push(
            this.deps.project.onDidChange(() => this.update()),
            this.deps.connection.onDidChange(() => this.update()),
        );
        if (this.deps.access !== undefined) {
            this.disposables.push(this.deps.access.onDidChange(() => this.update()));
        }
        this.update();
    }

    /** The target guard lets `target` of `root` run bundle commands: always, without one. */
    private usable(root: string, target: string): boolean {
        const access = this.deps.access?.value;
        return access === undefined || accessError(access, root, target) === undefined;
    }

    /**
     * Validates again and then refreshes the deployed state, even if nothing
     * changed; `forcePull` downloads the remote state too. Resolves when
     * both are done, and throws what failed.
     */
    async refreshRemoteState(options: { forcePull: boolean }): Promise<void> {
        if (this.inputs === undefined) {
            return;
        }
        this.pendingRefresh = options;
        this.validated.invalidate("refresh");
        await this.validated.settled();
        const deployed = await this.deployed.settled();
        const validated = this.validated.value;
        if (validated.status === "error") {
            throw validated.error;
        }
        if (deployed.status === "error") {
            throw deployed.error;
        }
    }

    private update() {
        const project = this.deps.project.value;
        const connection = this.deps.connection.value;
        const root = project.project?.root;
        const target = project.target;
        this.manual = this.manualInputs(root, target, connection);
        if (root === undefined || target === undefined || !this.usable(root, target)) {
            return this.clear();
        }
        this.deps.bundleLog.open();
        if (connection.status !== "connected") {
            // While reconnecting, keep showing the last results for the same target.
            if (
                connection.status === "connecting" &&
                this.inputs?.root === root &&
                this.inputs.target === target
            ) {
                return;
            }
            return this.clear();
        }
        const next = this.inputsOf(root, target, connection.connection);
        const previous = this.inputs;
        if (
            previous !== undefined &&
            previous.root === next.root &&
            previous.target === next.target &&
            previous.revision === next.revision &&
            isDeepStrictEqual(previous.variables, next.variables) &&
            previous.clusterId === next.clusterId &&
            previous.connection.api === next.connection.api
        ) {
            this.inputs = next;
            return;
        }
        if (previous?.root !== next.root || previous.target !== next.target) {
            // Results for another target mustn't show while this one loads.
            this.validated.reset();
            this.deployed.reset();
            this.lastOutcome = undefined;
        }
        this.inputs = next;
        this.validated.invalidate(previous === undefined ? "session started" : "inputs changed");
    }

    /** The target manual commands run for: the connection's, whatever the cached check says. */
    private manualInputs(
        root: string | undefined,
        target: string | undefined,
        connection: ConnectionState,
    ): Inputs | undefined {
        if (root === undefined || target === undefined) {
            return undefined;
        }
        if (connection.status === "connected") {
            return this.inputsOf(root, target, connection.connection);
        }
        // While reconnecting, keep the last target, as the automatic inputs do.
        return connection.status === "connecting" &&
            this.manual?.root === root &&
            this.manual.target === target
            ? this.manual
            : undefined;
    }

    private inputsOf(root: string, target: string, connection: Connection): Inputs {
        const project = this.deps.project.value;
        return {
            root,
            target,
            revision: project.revision,
            variables: project.variables ?? {},
            clusterId: this.deps.choosesCompute
                ? bundleClusterOverride(project.overrides)
                : undefined,
            host: connection.host,
            connection,
        };
    }

    private clear() {
        if (this.inputs === undefined) {
            return;
        }
        this.inputs = undefined;
        this.lastOutcome = undefined;
        this.pendingRefresh = undefined;
        this.validated.reset();
        this.deployed.reset();
    }

    private onValidated(s: Resource<ValidatedBundle>["value"]) {
        if (s.status !== "ready" && s.status !== "error") {
            return;
        }
        const outcome =
            s.status === "ready" ? JSON.stringify(s.value) : `error: ${s.error.message}`;
        const refresh = this.pendingRefresh;
        this.pendingRefresh = undefined;
        if (outcome === this.lastOutcome && refresh === undefined) {
            return;
        }
        this.lastOutcome = outcome;
        if (this.paused > 0) {
            // The operation summarizes when it ends.
            return;
        }
        this.forcePull = refresh?.forcePull ?? false;
        this.deployed.invalidate(refresh !== undefined ? "refresh" : "validate output changed");
    }

    private operationHost(): OperationHost {
        return {
            unavailable: () => {
                const { project, target } = this.deps.project.value;
                const access = this.deps.access?.value;
                return (
                    (project !== undefined && target !== undefined && access !== undefined
                        ? accessError(access, project.root, target)
                        : undefined) ?? new Error("No bundle target is connected.")
                );
            },
            current: (): OperationTarget | undefined => {
                const inputs = this.manual;
                return inputs === undefined
                    ? undefined
                    : {
                          root: inputs.root,
                          target: inputs.target,
                          connection: inputs.connection,
                          variables: inputs.variables,
                          clusterId: inputs.clusterId,
                      };
            },
            pauseSummaries: async () => {
                this.paused++;
                await this.deployed.settled();
                let resumed = false;
                return async () => {
                    if (resumed) {
                        return;
                    }
                    resumed = true;
                    this.paused--;
                    if (this.paused > 0 || this.inputs === undefined) {
                        return;
                    }
                    this.forcePull = false;
                    this.deployed.invalidate("operation finished");
                    const deployed = await this.deployed.settled();
                    if (deployed.status === "error") {
                        throw deployed.error;
                    }
                };
            },
        };
    }

    private async validate(signal: AbortSignal): Promise<ValidatedBundle> {
        const inputs = this.current();
        const { bundleLog } = this.deps;
        bundleLog.info(`Reading local bundle configuration for target ${inputs.target}...`);
        const config = await this.run(
            async () =>
                bundleValidate(this.deps.cli, inputs.target, await this.context(inputs, signal)),
            "Failed to read local bundle configuration.",
        );
        bundleLog.info("Finished reading local bundle configuration.");
        return { root: inputs.root, target: inputs.target, host: inputs.host, config };
    }

    private async summarize(signal: AbortSignal): Promise<DeployedBundle> {
        const inputs = this.current();
        const forcePull = this.forcePull;
        this.forcePull = false;
        const { bundleLog } = this.deps;
        bundleLog.info(`Refreshing bundle configuration for target ${inputs.target}...`);
        const summary = await this.run(
            async () =>
                bundleSummary(this.deps.cli, inputs.target, await this.context(inputs, signal), {
                    forcePull,
                }),
            "Failed to refresh bundle configuration.",
        );
        bundleLog.info("Bundle configuration refreshed.");
        return { root: inputs.root, target: inputs.target, host: inputs.host, summary };
    }

    private current(): Inputs {
        if (this.inputs === undefined) {
            // `clear()` resets the resources first, so a load never starts without inputs.
            throw new CancelledError();
        }
        return this.inputs;
    }

    private async context(inputs: Inputs, signal: AbortSignal) {
        // stderr carries the CLI's warnings and errors; the old extension streamed it there too.
        return {
            cwd: inputs.root,
            env: await this.deps.env(inputs.connection, inputs),
            signal,
            onStderr: (chunk: string) => this.deps.bundleLog.output(chunk),
        };
    }

    /** Runs one CLI call, writing its stderr and outcome to the bundle log. */
    private async run<T>(call: () => Promise<T>, failure: string): Promise<T> {
        try {
            return await call();
        } catch (e) {
            if (isCancellation(e)) {
                // Superseded by a newer call, which logs its own outcome.
                this.deps.log.debug(`${failure} Reason: Cancelled`);
                throw e;
            }
            // A CLI failure's stderr is already in the log; anything else isn't.
            const fromCli = e instanceof CliError || e instanceof MissingVariableError;
            this.deps.bundleLog.error(
                fromCli ? failure : `${failure} ${e instanceof Error ? e.message : String(e)}`,
            );
            this.deps.log.warn(failure, e);
            throw e;
        }
    }

    dispose(): void {
        this.operations.dispose();
        disposeAll(this.disposables);
        this.validated.dispose();
        this.deployed.dispose();
    }
}
