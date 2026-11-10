import { hostKey } from "../connection/hostMatching";

/**
 * Where this extension host runs. Decided once, at activation, by
 * `detectHost`, which replaces `remoteSessionOf`. Kernel services take
 * strategies from it; features see only its capabilities
 * (`capabilitiesOf`), never its kind.
 */
export type Host = LocalHost | SessionHost | ComputeHost;

/** The user's machine, or a remote host that isn't Databricks compute. */
interface LocalHost {
    readonly kind: "local";
}

/**
 * A window whose extension host runs on Databricks compute, inside a
 * session the CLI's SSH tunnel set up. The tunnel's bootstrap sets the
 * variables, and the SSH server passes them to every SSH session, so the
 * VS Code server and its extension host inherit them. Nothing here is a
 * secret: the token stays in the environment, for the connection to read.
 */
export interface SessionHost {
    readonly kind: "session";
    /** How the window got here. The CLI's SSH tunnel is the only entry today. */
    readonly entry: "sshTunnel";
    /**
     * `DATABRICKS_HOST`, normalised: the workspace's canonical URL, which can
     * differ from a profile's alias. Undefined when it is missing or invalid;
     * the connection then says so.
     */
    readonly host?: string;
    /** The session's credentials: a token, or an M2M client. Undefined when the environment has neither. */
    readonly auth?: "pat" | "oauth-m2m";
    /** The compute the session runs on, if the environment names it. */
    readonly compute?: SessionCompute;
    /** `DATABRICKS_VIRTUAL_ENV`: the session's interpreter (`sys.executable`), not a virtual environment's folder. */
    readonly interpreter?: string;
    /** `DATABRICKS_CLI_PATH`: the CLI the tunnel uploaded. */
    readonly tunnelCli?: string;
    /** What looked wrong about the environment, for the log. */
    readonly warnings: readonly string[];
}

/** The compute a session runs on. */
export interface SessionCompute {
    /** Serverless sets `IS_SERVERLESS` and `DATABRICKS_JUPYTER_SERVERLESS`. */
    readonly kind: "cluster" | "serverless";
    /** `DATABRICKS_CLUSTER_ID`; on serverless, the ID of the session's own compute. */
    readonly clusterId: string;
    /** `DATABRICKS_RUNTIME_VERSION`: `17.3` on a cluster, `client.4.10` on serverless. */
    readonly runtimeVersion?: string;
}

/**
 * Databricks compute reached without the tunnel's session: VS Code started
 * from a notebook's terminal, for example. Local rules apply, but profiles
 * and browser sign-in may not work there, so the bootstrap warns.
 */
export interface ComputeHost {
    readonly kind: "compute";
    readonly runtimeVersion: string;
}

/** What VS Code says about the window. */
export interface WindowInfo {
    /** `vscode.env.remoteName`: `ssh-remote` in a session window, undefined in a local one. */
    readonly remoteName?: string;
}

/**
 * Where the extension host runs: a pure function of its environment and the
 * window, so every case is a table test (`Host.test.ts`).
 *
 * `DATABRICKS_REMOTE_ENV=1` alone makes a session, as the CLI's bootstrap
 * sets it. Without `DATABRICKS_VIRTUAL_ENV` it is still a session, without
 * an interpreter, where the old extension stayed silently local. A window
 * that VS Code doesn't call remote gets a warning but stays a session: the
 * variables may have leaked from the shell that started VS Code, but the e2e
 * suite simulates a session in a local window that way, and a real session
 * mistaken for a local window would be worse.
 */
export function detectHost(
    env: Readonly<Record<string, string | undefined>>,
    window: WindowInfo,
): Host {
    const runtimeVersion = env.DATABRICKS_RUNTIME_VERSION || undefined;
    if (env.DATABRICKS_REMOTE_ENV !== "1") {
        // `DB_HOME` is set on compute too, but the name is too common to tell by.
        return runtimeVersion === undefined
            ? { kind: "local" }
            : { kind: "compute", runtimeVersion };
    }
    const warnings: string[] = [];
    const interpreter = env.DATABRICKS_VIRTUAL_ENV || undefined;
    if (interpreter === undefined) {
        warnings.push(
            "DATABRICKS_VIRTUAL_ENV isn't set: the session's interpreter isn't selected.",
        );
    }
    if (window.remoteName === undefined) {
        warnings.push(
            "DATABRICKS_REMOTE_ENV is set in a window VS Code doesn't call remote. If VS Code was started from a shell that exported a session's variables, start it from another shell.",
        );
    }
    const host = hostKey(env.DATABRICKS_HOST);
    const auth = env.DATABRICKS_TOKEN
        ? "pat"
        : env.DATABRICKS_CLIENT_ID && env.DATABRICKS_CLIENT_SECRET
          ? "oauth-m2m"
          : undefined;
    const clusterId = env.DATABRICKS_CLUSTER_ID || undefined;
    const serverless =
        env.IS_SERVERLESS?.toUpperCase() === "TRUE" ||
        env.DATABRICKS_JUPYTER_SERVERLESS?.toLowerCase() === "true";
    return {
        kind: "session",
        entry: "sshTunnel",
        ...(host !== undefined ? { host } : {}),
        ...(auth !== undefined ? { auth } : {}),
        ...(clusterId !== undefined
            ? {
                  compute: {
                      kind: serverless ? "serverless" : "cluster",
                      clusterId,
                      ...(runtimeVersion !== undefined ? { runtimeVersion } : {}),
                  },
              }
            : {}),
        ...(interpreter !== undefined ? { interpreter } : {}),
        ...(env.DATABRICKS_CLI_PATH ? { tunnelCli: env.DATABRICKS_CLI_PATH } : {}),
        warnings,
    };
}

/**
 * The bootstrap's warning about a window on Databricks compute without the
 * tunnel's session, which local rules can't fully serve.
 */
export function computeHostWarning(host: ComputeHost): string {
    return `This window runs on Databricks compute (runtime ${host.runtimeVersion}) without an SSH tunnel session, so signing in with a profile or a browser may not work. To work on this compute, start the SSH tunnel from a local window.`;
}
