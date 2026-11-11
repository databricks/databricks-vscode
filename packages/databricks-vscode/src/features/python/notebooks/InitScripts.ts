import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ProcessRunner } from "../../../platform/process";
import { setting } from "../../../platform/settings";

/** Where IPython keeps its profiles; unset or empty means `IPYTHONDIR`, else `~/.ipython`. */
export const IPYTHON_DIR = setting<string | undefined>("databricks", "ipythonDir", undefined);

/** The startup script, as shipped in the extension. */
export const INIT_SCRIPT_SOURCE = path.join("resources", "python", "00-databricks-init.py");

/** Ours, from this or any other version of the extension (the old glob `00-databricks-init-*.py`). */
const INIT_SCRIPT_NAME = /^00-databricks-init-.*\.py$/;

/** The old `ipythonDir`: the setting, else `IPYTHONDIR`, else `~/.ipython`. */
export function ipythonDir(
    configured: string | undefined,
    env: NodeJS.ProcessEnv = process.env,
    home = os.homedir(),
): string {
    return configured || env["IPYTHONDIR"] || path.join(home, ".ipython");
}

/**
 * `00-databricks-init-<md5 of the content>.py`: the name the old build
 * generated (`writeJupyterInitFileWithVersion.ts`). It is computed at run
 * time now, so there is no generated copy to keep in step. A new version of
 * the script gets a new name, which is how an outdated copy is recognised.
 */
export function initScriptName(content: string): string {
    return `00-databricks-init-${createHash("md5").update(content).digest("hex")}.py`;
}

/** One `name:type:message` line the script writes to stderr (`logError`). */
export interface InitScriptError {
    readonly functionName: string;
    readonly errorType: string;
    readonly message: string;
}

/** The old rule: a stderr line with at least three `:`-separated parts is one of the script's errors. */
export function initScriptErrors(stderr: string): InitScriptError[] {
    return stderr
        .split(/\r?\n/)
        .filter((line) => line.split(":").length > 2)
        .map((line) => {
            const [functionName = "", errorType = "", ...rest] = line.split(":");
            return { functionName, errorType, message: rest.join(":") };
        });
}

/** What running the startup script in an interpreter found. */
export interface InitScriptRun {
    readonly file: string;
    readonly errors: readonly InitScriptError[];
    /** stderr, when IPython itself failed (a non-zero exit) without one of the script's errors. */
    readonly failure?: string;
}

export interface InitScriptsDeps {
    /** `INIT_SCRIPT_SOURCE`, resolved against the extension. */
    readonly sourcePath: string;
    /** `ipythonDir(...)` with the current setting. */
    ipythonDir(): string;
    readonly processes: ProcessRunner;
}

/**
 * The IPython startup script (RUN-08): installed into the default profile's
 * `startup` folder, so every IPython kernel on the machine runs it (kept
 * for parity with the old extension), and run once in an interpreter to check it
 * loads. Ports the file half of the old `NotebookInitScriptManager`.
 */
export class InitScripts {
    private source?: Promise<{ name: string; content: string }>;

    constructor(private readonly deps: InitScriptsDeps) {}

    get startupDir(): string {
        return path.join(this.deps.ipythonDir(), "profile_default", "startup");
    }

    /** The installed file's name. */
    async fileName(): Promise<string> {
        return (await this.read()).name;
    }

    /**
     * Removes our outdated copies and copies the current script in, unless it
     * is there already. Resolves with its path.
     */
    async install(): Promise<string> {
        const { name, content } = await this.read();
        const dir = this.startupDir;
        await fs.mkdir(dir, { recursive: true });
        const present = await fs.readdir(dir);
        for (const file of present) {
            if (INIT_SCRIPT_NAME.test(file) && file !== name) {
                await fs.rm(path.join(dir, file), { force: true });
            }
        }
        const target = path.join(dir, name);
        if (!present.includes(name)) {
            await fs.writeFile(target, content, "utf-8");
        }
        return target;
    }

    /** Runs the installed script with `<executable> -m IPython <file>` in `cwd`, as a kernel would at startup. */
    async run(
        executable: string,
        options: { env: NodeJS.ProcessEnv; cwd: string; signal?: AbortSignal },
    ): Promise<InitScriptRun> {
        const file = path.join(this.startupDir, await this.fileName());
        const result = await this.deps.processes.run(executable, ["-m", "IPython", file], {
            ...options,
            closeStdin: true,
        });
        const errors = initScriptErrors(result.stderr);
        const failed = result.exitCode !== 0 && !result.cancelled && errors.length === 0;
        return {
            file,
            errors,
            failure: failed
                ? result.stderr.trim() || `${executable} exited with code ${result.exitCode}`
                : undefined,
        };
    }

    private read(): Promise<{ name: string; content: string }> {
        this.source ??= fs
            .readFile(this.deps.sourcePath, "utf-8")
            .then((content) => ({ name: initScriptName(content), content }));
        // A failed read is tried again next time.
        this.source.catch(() => (this.source = undefined));
        return this.source;
    }
}
