import { STDOUT_ERROR_BOUNDARY } from "./ErrorParser";

/** What `resources/python/bootstrap.py` reads. */
export interface BootstrapArguments {
    /** The file to run, as the cluster sees it (`/Workspace/…`). */
    readonly pythonFile: string;
    /** The bundle's files in the workspace, put first on `sys.path`. */
    readonly repoPath: string;
    /** `sys.argv`: the file, then the launch configuration's `args`. */
    readonly argv: readonly string[];
    /** The launch configuration's `env`. */
    readonly env: Readonly<Record<string, string>>;
}

const ENV_NAME = /^[a-zA-Z_]{1,}[a-zA-Z0-9_]*$/;

/** The old message for an `env` key the bootstrap can't set; undefined when every key is valid. */
export function invalidEnvironmentVariable(
    env: Readonly<Record<string, string>>,
): string | undefined {
    const key = Object.keys(env).find((k) => !ENV_NAME.test(k));
    return key === undefined
        ? undefined
        : `Invalid environment variable ${key}: Only lower and upper case letters, digits and '_'(underscore) are allowed.`;
}

/**
 * The command that runs a file on a cluster (RUN-01): `bootstrap.py`, after
 * one line that defines its arguments as a JSON string. The
 * old runner substituted each value into the script's source, so a quote in
 * a path or an argument could break it. A JSON string is also a valid
 * Python string literal: `JSON.stringify` escapes quotes, backslashes and
 * control characters in ways Python reads the same.
 */
export function bootstrapCommand(source: string, args: BootstrapArguments): string {
    const config = JSON.stringify({
        python_file: args.pythonFile,
        repo_path: args.repoPath,
        args: args.argv,
        env: args.env,
        stdout_error_boundary: STDOUT_ERROR_BOUNDARY,
    });
    return `__databricks_bootstrap_config = ${JSON.stringify(config)}\n${source}`;
}
