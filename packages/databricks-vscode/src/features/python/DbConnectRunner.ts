import type { Disposable, Event, Terminal, TerminalOptions } from "vscode";
import { UserFacingError } from "../../platform/errors";
import {
    escapeExecutableForTerminal,
    escapePathArgument,
    hasCmdUnsafeChars,
    type ShellKind,
} from "../../platform/shell";
import type { DatabricksPythonDebugConfiguration } from "./DatabricksDebugConfigurationProvider";
import { DEBUGPY, PYTHON } from "../../kernel/extensionDependencies";
import type { ExtensionDependencies } from "../../platform/extensions";
import type { PackageProbe } from "./setup/external/checks";
import type { Readiness } from "./setup/readiness";

export const TERMINAL_NAME = "Databricks Connect";

/** How long the databricks-connect probe may take before the run goes on without it. */
export const DBCONNECT_PROBE_TIMEOUT_MS = 10_000;

/** The part of `vscode.window` the runner needs. */
interface TerminalHost {
    createTerminal(options: TerminalOptions): Terminal;
    readonly onDidCloseTerminal: Event<Terminal>;
}

export interface DbConnectRunnerDeps {
    /** The project root: the terminal's working directory. */
    readonly root: string;
    /** Re-evaluates the session's readiness and resolves with it (the run gate reads only this). */
    readiness(): Promise<Readiness | undefined>;
    /** `databricks.environment.setup`: the uv flow or the checklist, whichever the project shows. */
    setup(): Promise<void>;
    /** Throws when a member of the extension pack the run needs is missing or disabled. */
    readonly requireExtension: ExtensionDependencies["require"];
    /** The interpreter ms-python has selected for the project. */
    executable(): Promise<string | undefined>;
    /** Whether an interpreter has databricks-connect: the same probe the external checklist uses. */
    dbConnect(executable: string, signal: AbortSignal): Promise<PackageProbe>;
    /** Writes the env file the bootstrap reads, and resolves when it is current. */
    writeEnvFile(): Promise<unknown>;
    /** `resources/python/dbconnect-bootstrap.py`. */
    readonly bootstrapPath: string;
    readonly terminals: TerminalHost;
    shellKind(): ShellKind;
    /** `vscode.debug.startDebugging` in the project's workspace folder. */
    startDebugging?(configuration: DatabricksPythonDebugConfiguration): Thenable<boolean>;
    /** Called once a run was sent to the terminal, or a debug session started. */
    onRun?(launchType: "run" | "debug"): void;
}

/** A setup that ran but doesn't match the compute any more still runs: the row says so. */
function canRun(readiness: Readiness | undefined): readiness is Readiness {
    return readiness !== undefined && readiness.status !== "notReady";
}

/**
 * "Run current file with Databricks Connect" (RUN-04): runs the file with
 * the project's interpreter through `dbconnect-bootstrap.py`, which loads the
 * env file and defines `spark`, `dbutils` and the other globals; or debugs
 * it (RUN-05). Ports the Databricks Connect half of the old `RunCommands`.
 *
 * The old command typed into whatever terminal was active, so the working
 * directory, and with it where a script's relative paths land, depended on
 * that terminal. This one owns a terminal whose working directory is
 * the project root, and reuses it while it is open.
 */
export class DbConnectRunner implements Disposable {
    private terminal?: Terminal;
    private readonly closed: Disposable;
    /** Interpreters found with databricks-connect in this session. */
    private readonly withDbConnect = new Set<string>();

    constructor(private readonly deps: DbConnectRunnerDeps) {
        this.closed = deps.terminals.onDidCloseTerminal((t) => {
            if (t === this.terminal) {
                this.terminal = undefined;
            }
        });
    }

    /**
     * Runs `file`. Not ready, it runs the setup first, as the old gate did,
     * and stops quietly if the environment still isn't ready: the setup has
     * said why.
     */
    async run(file: string | undefined): Promise<boolean> {
        this.deps.requireExtension(PYTHON, "Running a file with Databricks Connect");
        const executable = await this.preflight(file);
        if (executable === undefined || file === undefined) {
            return false;
        }
        const kind = this.deps.shellKind();
        if (kind === "cmd" && [executable, this.deps.bootstrapPath, file].some(hasCmdUnsafeChars)) {
            throw new UserFacingError(
                "UNSAFE_PATH",
                `Can't run "${file}" in the Command Prompt shell, which expands "%" and "!" in paths. ` +
                    `Rename the file or folder, or set "terminal.integrated.defaultProfile.windows" to PowerShell.`,
            );
        }
        await this.deps.writeEnvFile();

        this.terminal ??= this.deps.terminals.createTerminal({
            name: TERMINAL_NAME,
            cwd: this.deps.root,
        });
        this.terminal.show();
        this.terminal.sendText(
            [
                escapeExecutableForTerminal(executable, kind),
                escapePathArgument(this.deps.bootstrapPath, kind),
                escapePathArgument(file, kind),
            ].join(" "),
        );
        this.deps.onRun?.("run");
        return true;
    }

    /**
     * "Debug current file with Databricks Connect" (RUN-05): the same gate,
     * then a `debugpy` session with `databricks: true`, which the debug
     * configuration provider runs through the bootstrap with the project's
     * Databricks variables. debugpy is pinned to the interpreter the gate
     * checked. The session runs in the project root, as runs do, and
     * gets no copy of the extension host's environment.
     */
    async debug(file: string | undefined): Promise<boolean> {
        // Before the gate, which may run the whole setup first.
        this.deps.requireExtension(PYTHON, "Debugging a file with Databricks Connect");
        this.deps.requireExtension(DEBUGPY, "Debugging a file with Databricks Connect");
        const executable = await this.preflight(file);
        if (
            executable === undefined ||
            file === undefined ||
            this.deps.startDebugging === undefined
        ) {
            return false;
        }
        await this.deps.writeEnvFile();
        const started = await this.deps.startDebugging({
            type: "debugpy",
            name: "Databricks Connect",
            request: "launch",
            databricks: true,
            program: file,
            console: "integratedTerminal",
            cwd: this.deps.root,
            python: executable,
        });
        if (started) {
            this.deps.onRun?.("debug");
        }
        return started;
    }

    /** The gate, the file and the interpreter, shared by run and debug so both use the same interpreter. */
    private async preflight(file: string | undefined): Promise<string | undefined> {
        let readiness = await this.deps.readiness();
        let setupRan = false;
        if (!canRun(readiness)) {
            await this.deps.setup();
            setupRan = true;
            readiness = await this.deps.readiness();
            if (!canRun(readiness)) {
                return undefined;
            }
        }
        if (file === undefined) {
            throw new UserFacingError("NO_FILE", "Open a file to run on Databricks");
        }
        const executable = await this.deps.executable();
        if (executable === undefined) {
            throw new UserFacingError("NO_INTERPRETER", "No python executable found");
        }
        // The uv row describes the .venv, not the selected interpreter. As in 2.x, a
        // missing databricks-connect runs the setup, which adopts the .venv; the run
        // goes on only if the interpreter it then uses has the package. The external
        // checklist already probed the selected interpreter in readiness.
        if (readiness.strategy === "uv" && (await this.missingDbConnect(executable))) {
            // Setup runs once per run, as in 2.x: after one that already ran, a missing package stops the run.
            if (setupRan) {
                return undefined;
            }
            await this.deps.setup();
            const after = await this.deps.executable();
            if (after === undefined || (await this.missingDbConnect(after))) {
                return undefined;
            }
            return after;
        }
        return executable;
    }

    /**
     * A probe that times out or fails lets the run go on: the run reports its own error.
     * A found package is remembered per interpreter for the session, as 2.x re-checks only
     * when the interpreter changed; a missing or failed result is probed again.
     */
    private async missingDbConnect(executable: string): Promise<boolean> {
        if (this.withDbConnect.has(executable)) {
            return false;
        }
        const probe = await this.deps
            .dbConnect(executable, AbortSignal.timeout(DBCONNECT_PROBE_TIMEOUT_MS))
            .catch(() => undefined);
        if (probe?.kind === "installed") {
            this.withDbConnect.add(executable);
        }
        return probe?.kind === "missing";
    }

    /** The terminal stays open: its output is the user's to read. */
    dispose(): void {
        this.closed.dispose();
        this.terminal = undefined;
    }
}
