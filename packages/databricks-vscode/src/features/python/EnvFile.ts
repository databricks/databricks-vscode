import { EOL } from "node:os";
import fs from "node:fs/promises";
import path from "node:path";
import type { Disposable, Event } from "vscode";
import { AMBIENT_AUTH_VARIABLES, AMBIENT_COMPUTE_VARIABLES } from "../../kernel/cli/childEnv";
import { Emitter } from "../../platform/event";
import type { Logger } from "../../platform/log";
import { Resource } from "../../platform/reactive";
import type { FileEvents } from "../../platform/fileEvents";

/**
 * `.databricks/.databricks.env` (RUN-07): what Python processes the user
 * starts need to reach the workspace, read by `dbconnect-bootstrap.py` and
 * debug sessions and notebooks. It replaces `DatabricksEnvFileManager`.
 *
 * The contract the readers share, pinned by `fixtures/env-file/` and the
 * Python tests:
 * - one `KEY=value` per line, sorted, split at the first `=`;
 * - an empty value unsets the variable, so the variables `childEnv` removes
 *   are written as `KEY=` and ambient credentials can't reach the process;
 * - `DATABRICKS_ENV_FILE_VERSION` says which contract a file follows.
 *
 * It holds a profile name, never a token or a broker URL.
 */
export const ENV_FILE = path.join(".databricks", ".databricks.env");
const ENV_FILE_VERSION_KEY = "DATABRICKS_ENV_FILE_VERSION";
const ENV_FILE_VERSION = "1";
/**
 * Set to "1" when the file's serverless compute is only the default, for a target with nothing
 * chosen. The startup script of a notebook kernel then starts no Spark session; Databricks Connect
 * runs still use the compute, as the default says.
 */
export const SERVERLESS_DEFAULT_KEY = "DATABRICKS_SERVERLESS_COMPUTE_DEFAULT";

/** The `childEnv` variables the file carries; everything else in a child's environment is the host's. */
const CHILD_VARIABLES = [
    "DATABRICKS_HOST",
    // A bundle target's workspace, for a profile that names none; 2.22's file had it too.
    "DATABRICKS_WORKSPACE_ID",
    "DATABRICKS_CONFIG_PROFILE",
    "DATABRICKS_CONFIG_FILE",
    "DATABRICKS_CLI_PATH",
    "DATABRICKS_CLUSTER_ID",
    "DATABRICKS_SERVERLESS_COMPUTE_ID",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "NO_PROXY",
] as const;

export interface EnvFileInputs {
    /** `kernel.childEnv({compute})` for the connection. */
    readonly child: Readonly<Record<string, string>>;
    /**
     * A profile connection clears the ambient credentials and compute. A
     * session connection keeps them: they are its credentials.
     */
    readonly clearAmbient: boolean;
    readonly projectRoot: string;
    readonly target?: string;
    readonly extensionVersion: string;
    /** `databricks.connect.progress`. */
    readonly progressBar: boolean;
    /** The host's `SPARK_CONNECT_USER_AGENT`, which ours is appended to. */
    readonly sparkUserAgent?: string;
    /** The user's `python.envFile` variables, which win. */
    readonly user?: Readonly<Record<string, string>>;
    /** The child's serverless compute is the default, not a choice (see `SERVERLESS_DEFAULT_KEY`). */
    readonly computeDefault?: boolean;
}

/** The file's variables. Pure, so each auth type has a golden file. */
export function envFileVariables(inputs: EnvFileInputs): Record<string, string> {
    const vars: Record<string, string> = {};
    for (const key of CHILD_VARIABLES) {
        const value = inputs.child[key];
        if (value !== undefined) {
            vars[key] = value;
        }
    }
    if (inputs.clearAmbient) {
        for (const key of [...AMBIENT_AUTH_VARIABLES, ...AMBIENT_COMPUTE_VARIABLES]) {
            vars[key] ??= "";
        }
    }
    if (inputs.target !== undefined) {
        vars.DATABRICKS_BUNDLE_TARGET = inputs.target;
    }
    vars.DATABRICKS_PROJECT_ROOT = inputs.projectRoot;
    // Ours is appended to whatever the host set.
    vars.SPARK_CONNECT_USER_AGENT = [
        inputs.sparkUserAgent ?? "",
        `databricks-vscode/${inputs.extensionVersion}`,
    ]
        .join(" ")
        .trim();
    vars.SPARK_CONNECT_PROGRESS_BAR_ENABLED = inputs.progressBar ? "1" : "0";
    // https://github.com/fabioz/PyDev.Debugger/blob/main/_pydevd_bundle/pydevd_constants.py
    vars.PYDEVD_WARN_SLOW_RESOLVE_TIMEOUT = "10";
    vars[ENV_FILE_VERSION_KEY] = ENV_FILE_VERSION;
    if (inputs.computeDefault === true) {
        vars[SERVERLESS_DEFAULT_KEY] = "1";
    }
    return { ...vars, ...inputs.user };
}

export function formatEnvFile(vars: Readonly<Record<string, string>>): string {
    return (
        Object.entries(vars)
            .map(([key, value]) => `${key}=${value}`)
            .sort()
            .join(EOL) + EOL
    );
}

/**
 * The user's `python.envFile`, as the old `getUserEnvVars` read it: the
 * first value of each key wins, and lines without a key or a value are
 * skipped. Comments are skipped too.
 */
export function parseUserEnvFile(content: string): Record<string, string> {
    const vars: Record<string, string> = {};
    for (const line of content.split(/\r?\n/)) {
        if (line.trimStart().startsWith("#")) {
            continue;
        }
        const [key, ...rest] = line.split("=");
        const value = rest.join("=");
        if (key && value && !(key in vars)) {
            vars[key] = value;
        }
    }
    return vars;
}

export interface EnvFileWriterInputs {
    readonly root: string;
    /** The inputs, without the user's variables; undefined while signed out, when nothing is written. */
    inputs(): Omit<EnvFileInputs, "user"> | undefined;
    /** `python.envFile`, resolved; undefined when unset. */
    userEnvFile(): string | undefined;
    readonly files: FileEvents;
    readonly log: Logger;
}

/**
 * Writes the project's env file when its inputs change: the connection, the
 * compute, the target, the settings, or the user's `python.envFile`. Writes
 * are coalesced, and an unchanged file isn't touched. Created per project
 * session; the first write is the session's start (the CLI path in it
 * includes the extension's version, so every activation rewrites it).
 */
export class EnvFileWriter implements Disposable {
    private readonly writes: Resource<string | undefined>;
    private userWatch?: { file: string; subscription: Disposable };
    private readonly changed = new Emitter<void>();
    /** The file was written with new content: running kernels have the old variables (RUN-07). */
    readonly onDidChange: Event<void> = this.changed.event;

    constructor(private readonly deps: EnvFileWriterInputs) {
        this.writes = new Resource(() => this.write(), { debounceMs: 100 });
    }

    get path(): string {
        return path.join(this.deps.root, ENV_FILE);
    }

    /** Writes again soon. Resolves when the file is current. */
    update(reason: string): Promise<unknown> {
        this.watchUserFile();
        this.writes.invalidate(reason);
        return this.writes.settled();
    }

    /**
     * The Databricks variables the file holds, without the user's
     * `python.envFile`, which debug sessions load themselves. Undefined while
     * signed out.
     */
    variables(): Record<string, string> | undefined {
        const inputs = this.deps.inputs();
        return inputs === undefined ? undefined : envFileVariables(inputs);
    }

    dispose(): void {
        this.userWatch?.subscription.dispose();
        this.writes.dispose();
        this.changed.dispose();
    }

    /** Follows the user's file, which may be outside the project. */
    private watchUserFile(): void {
        const file = this.deps.userEnvFile();
        if (file === this.userWatch?.file) {
            return;
        }
        this.userWatch?.subscription.dispose();
        this.userWatch =
            file === undefined
                ? undefined
                : {
                      file,
                      subscription: this.deps.files.watch(
                          path.dirname(file),
                          path.basename(file),
                          () => void this.update("python.envFile changed"),
                      ),
                  };
    }

    /** Resolves with what was written, or undefined when nothing was. */
    private async write(): Promise<string | undefined> {
        const inputs = this.deps.inputs();
        if (inputs === undefined) {
            return undefined;
        }
        const userFile = this.deps.userEnvFile();
        const content = formatEnvFile(
            envFileVariables({
                ...inputs,
                user: userFile === this.path ? undefined : await this.readUserFile(userFile),
            }),
        );
        const target = this.path;
        try {
            if ((await fs.readFile(target, "utf-8")) === content) {
                return content;
            }
        } catch {
            // Not there yet.
        }
        try {
            await fs.mkdir(path.dirname(target), { recursive: true });
            await fs.writeFile(target, content, "utf-8");
            this.deps.log.debug(`Wrote ${target}`);
            this.changed.fire();
            return content;
        } catch (e) {
            // The file is a convenience for the user's own processes: say so in the log, not in a toast.
            this.deps.log.warn(`Can't write ${target}`, e);
            return undefined;
        }
    }

    private async readUserFile(
        file: string | undefined,
    ): Promise<Record<string, string> | undefined> {
        if (file === undefined) {
            return undefined;
        }
        try {
            return parseUserEnvFile(await fs.readFile(file, "utf-8"));
        } catch {
            this.deps.log.debug(
                `${file} does not exist. Not loading user env vars and continuing.`,
            );
            return undefined;
        }
    }
}
