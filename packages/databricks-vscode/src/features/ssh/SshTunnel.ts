import os from "node:os";
import { commands, env, Uri, window, type Terminal, type TerminalOptions } from "vscode";
import {
    sshConnectCommandLine,
    sshConnectEnv,
    type SshConnectCompute,
    type SshIde,
} from "../../kernel/cli/commands/ssh";
import type { Connection } from "../../kernel/connection/ConnectionService";
import type { Kernel } from "../../kernel/feature";
import { CancelledError, UserFacingError } from "../../platform/errors";
import type { Logger } from "../../platform/log";
import { when } from "../../platform/reactive";
import { detectShellKind, type ShellKind } from "../../platform/shell";
import type { QuickInputFactory } from "../../platform/ui/quickPick";
import {
    findHostCliInInstall,
    hostCliCommand,
    hostIde,
    isHostCliOnPath,
    pathSetupDocs,
    remoteSshExtension,
} from "./host";
import { pickSshCompute } from "./SshComputePicker";

export const TERMINAL_NAME = "Databricks SSH Tunnel";

export interface SshTunnelDeps {
    readonly kernel: Kernel;
    readonly log: Logger;
    /** The connection feature's sign-in wizard (`SIGN_IN`). */
    readonly signIn: () => Promise<unknown>;
    readonly factory?: QuickInputFactory;
    readonly createTerminal?: (options: TerminalOptions) => Terminal;
    readonly shellKind?: () => ShellKind;
    readonly platform?: NodeJS.Platform;
    /** The advisory PATH probe; the real one asks a login shell. */
    readonly isHostCliOnPath?: (command: string) => Promise<boolean>;
    /** The editor's shell command in its install folder, if found there; the real one looks under `env.appRoot`. */
    readonly hostCliInInstall?: (ide: SshIde) => Promise<string | undefined>;
}

/**
 * "Start SSH tunnel" (SSH-01, SSH-02), ported from the old `SshCommands`.
 * It works with and without a folder: signed out, it runs the shared
 * sign-in wizard first, which connects the window. Then it asks for the
 * compute and runs `databricks ssh connect` in the "Databricks SSH Tunnel"
 * terminal, which opens the remote window.
 */
export class SshTunnel {
    constructor(private readonly deps: SshTunnelDeps) {}

    /** Resolves once the terminal is started. Throws `CancelledError` when a step is dismissed. */
    async start(): Promise<void> {
        const ide = hostIde(env.uriScheme);
        const ideCommand = await this.lookUpHostCliInInstall(ide);
        // Found in the install folder, the CLI runs it whatever PATH holds,
        // so there is nothing to warn about. Advisory otherwise, so it
        // doesn't hold the tunnel up: the probe's shell can see another PATH
        // than the terminal's.
        if (ideCommand === undefined) {
            this.warnIfHostCliMissing(ide).catch((e: unknown) =>
                this.deps.log.error("Failed to handle the host CLI PATH prompt", e),
            );
        }
        await this.ensureRemoteSsh(ide);
        const connection = await this.connect();
        const compute = await pickSshCompute({
            compute: this.deps.kernel.compute,
            userName: connection.userName,
            createQuickPick: () => (this.deps.factory ?? window).createQuickPick(),
            log: this.deps.log,
        });
        if (compute === undefined) {
            throw new CancelledError();
        }
        this.launch(connection, compute, ide, ideCommand);
    }

    /** The install-folder lookup, or `undefined` when the editor's command isn't there. */
    private lookUpHostCliInInstall(ide: SshIde): Promise<string | undefined> {
        return (
            this.deps.hostCliInInstall ??
            ((i: SshIde) => findHostCliInInstall(i, env.appRoot, this.platform))
        )(ide);
    }

    /**
     * The window's connection; signed out, after the sign-in wizard. A
     * connection still being made is waited for, as the old flow waited for
     * its login.
     */
    private async connect(): Promise<Connection> {
        const { connection } = this.deps.kernel;
        const settled = () => when(connection.state, (s) => s.status !== "connecting");
        let state = await settled();
        if (state.status !== "connected") {
            await this.deps.signIn();
            state = await settled();
        }
        switch (state.status) {
            case "connected":
                return state.connection;
            case "signedOut":
                // The wizard was dismissed.
                throw new CancelledError();
            default:
                throw new UserFacingError(
                    "NOT_CONNECTED",
                    "Please connect to a Databricks workspace before starting an SSH tunnel.",
                );
        }
    }

    /**
     * The remote window needs the editor's Remote-SSH extension, in a
     * version the CLI accepts. The CLI would install or update it too
     * (`--auto-approve`), but through the editor's shell command; doing it
     * here works whatever PATH holds, and fails before any compute starts.
     */
    private async ensureRemoteSsh(ide: SshIde): Promise<void> {
        const dependencies = this.deps.kernel.extensionDependencies;
        const remoteSsh = remoteSshExtension(ide);
        if (dependencies.available(remoteSsh)) {
            return;
        }
        // Missing, disabled, or older than the CLI accepts: `install` installs, enables or updates it.
        this.deps.log.info(
            `${remoteSsh.id} is missing, disabled or too old; installing it for the SSH tunnel`,
        );
        await dependencies.install(remoteSsh, "Opening the remote window");
    }

    /**
     * A hint when the shell command (`code` or `cursor`) looks missing:
     * `ssh connect` runs it to open the remote window, and without it fails
     * only deep in the terminal. On macOS it offers the editor's own "Install
     * shell command" (registered only there); elsewhere the PATH setup docs.
     */
    private async warnIfHostCliMissing(ide: SshIde): Promise<void> {
        const command = hostCliCommand(ide);
        const { kernel, log } = this.deps;
        const onPath =
            this.deps.isHostCliOnPath ??
            ((c: string) =>
                isHostCliOnPath(c, {
                    processes: kernel.processes,
                    env: kernel.childEnv(),
                    platform: this.platform,
                    log,
                }));
        if (await onPath(command)) {
            return;
        }
        const message =
            `The "${command}" command may not be on your PATH, which the ` +
            `Databricks SSH tunnel needs to open the remote window. If the ` +
            `tunnel fails to open a window, add it to your PATH and try again.`;
        if (this.platform === "darwin") {
            const install = "Install shell command";
            if ((await window.showWarningMessage(message, install)) === install) {
                await commands.executeCommand("workbench.action.installCommandLine");
            }
            return;
        }
        const setup = "Setup instructions";
        if ((await window.showWarningMessage(message, setup)) === setup) {
            await commands.executeCommand("vscode.open", Uri.parse(pathSetupDocs(ide)));
        }
    }

    /**
     * The terminal isn't kept for disposal: that would close a live tunnel
     * when the extension reloads. It is transient, and goes when closed.
     */
    private launch(
        connection: Connection,
        compute: SshConnectCompute,
        ide: SshIde,
        ideCommand: string | undefined,
    ): void {
        const { kernel } = this.deps;
        // The dialect of the default profile, which parses the line (as in
        // the new-project wizard).
        const kind = (this.deps.shellKind ?? (() => detectShellKind(env.shell)))();
        const commandLine = sshConnectCommandLine(kernel.cli.cliPath, compute, ide, kind);
        const terminal = (
            this.deps.createTerminal ??
            ((options: TerminalOptions) => window.createTerminal(options))
        )({
            name: TERMINAL_NAME,
            isTransient: true,
            // As 2.22.0's terminal, whose variables VS Code merged over its own env:
            // SSL_CERT_FILE and lower-case proxies included, with http.proxy over them.
            env: sshConnectEnv(
                kernel.childEnv({ connection, cli: true, environment: "hostAndProxy" }),
                ideCommand,
            ),
            // Otherwise the VS Code process's own credentials, and other
            // extensions' variables, would be merged over the connection's.
            strictEnv: true,
            // Not in a bundle: the CLI would load the bundle's target (it
            // has `--target`) and could reject the connection's profile.
            cwd: os.tmpdir(),
        });
        terminal.show();
        terminal.sendText(commandLine);
        this.deps.log.info(
            `Started the SSH tunnel on ${compute.kind === "cluster" ? `cluster ${compute.clusterId}` : `serverless${compute.accelerator ? ` (${compute.accelerator})` : ""}`}`,
        );
    }

    private get platform(): NodeJS.Platform {
        return this.deps.platform ?? process.platform;
    }
}
