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
import type { Readiness } from "./setup/readiness";

export const TERMINAL_NAME = "Databricks Connect";

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
function canRun(readiness: Readiness | undefined): boolean {
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
        if (!canRun(await this.deps.readiness())) {
            await this.deps.setup();
            if (!canRun(await this.deps.readiness())) {
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
        return executable;
    }

    /** The terminal stays open: its output is the user's to read. */
    dispose(): void {
        this.closed.dispose();
        this.terminal = undefined;
    }
}
