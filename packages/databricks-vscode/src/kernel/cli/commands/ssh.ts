import { escapeExecutableForTerminal, type ShellKind } from "../../../platform/shell";

/*
 * `databricks ssh connect` (SSH-01) provisions an SSH server on the chosen
 * compute, writes the SSH config and the editor's Remote-SSH settings, and
 * then runs `code` or `cursor` to open the remote window. It keeps running
 * while the tunnel is up and prints for a person, so it runs in a terminal,
 * not through `Cli.exec`, and has no output to parse. This module builds
 * that terminal's command line and environment; `features/ssh` creates the
 * terminal.
 */

/** Serverless, optionally with a GPU accelerator, or a dedicated cluster. */
export type SshConnectCompute =
    | { readonly kind: "serverless"; readonly accelerator?: string }
    | { readonly kind: "cluster"; readonly clusterId: string };

/** The editor the CLI opens the remote window in (`--ide`). */
export type SshIde = "vscode" | "cursor";

/**
 * The arguments, ported from the old `getSshConnectCommand`. A cluster that
 * is stopped is started (`--auto-start-cluster`); serverless is the default
 * when no cluster is given. Logging comes from the environment, so there
 * are no `--log-*` flags.
 */
export function sshConnectArgs(compute: SshConnectCompute, ide: SshIde): string[] {
    const args = ["ssh", "connect", `--ide=${ide}`, "--auto-approve"];
    if (compute.kind === "cluster") {
        args.push(`--cluster=${compute.clusterId}`, "--auto-start-cluster");
    } else if (compute.accelerator !== undefined) {
        args.push(`--accelerator=${compute.accelerator}`);
    }
    return args;
}

/**
 * The line typed into the terminal. The arguments need no quoting: they are
 * fixed flags, a cluster ID and an accelerator name.
 */
export function sshConnectCommandLine(
    cliPath: string,
    compute: SshConnectCompute,
    ide: SshIde,
    kind: ShellKind,
): string {
    return [escapeExecutableForTerminal(cliPath, kind), ...sshConnectArgs(compute, ide)].join(" ");
}

/**
 * The terminal's environment: `childEnv` for the connection, with text
 * output, because the CLI's progress is read by a person. `ideCommand` is the
 * editor's shell command when it was found in its install folder; the CLI
 * then runs that instead of looking the command up on PATH.
 */
export function sshConnectEnv(
    childEnv: Record<string, string>,
    ideCommand?: string,
): Record<string, string> {
    const env: Record<string, string> = { ...childEnv, DATABRICKS_OUTPUT_FORMAT: "text" };
    if (ideCommand !== undefined) {
        env.DATABRICKS_SSH_IDE_COMMAND = ideCommand;
    }
    return env;
}
