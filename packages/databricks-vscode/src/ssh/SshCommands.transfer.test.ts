import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {randomBytes} from "node:crypto";
import {existsSync} from "node:fs";
import {mkdtemp, rm, writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {anything, instance, mock, reset, spy, verify, when} from "ts-mockito";
import {env, EventEmitter, window} from "vscode";
import type {
    ExtensionContext,
    QuickPick,
    QuickPickItem,
    Terminal,
    TerminalOptions,
} from "vscode";
import {CliWrapper} from "../cli/CliWrapper";
import {ClusterModel} from "../cluster/ClusterModel";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {DatabricksWorkspace} from "../configuration/DatabricksWorkspace";
import type {AuthProvider} from "../configuration/auth/AuthProvider";
import {LoggerManager} from "../logger";
import {Cluster} from "../sdk-extensions/Cluster";
import {createSshTunnelTestServer} from "../test/sshTunnelTestServer";
import {SshCommands} from "./SshCommands";

// Remote VS Code startup transfers several MiB; CLI 1.16.0 cut streams off at 1 MiB.
const PAYLOAD_BYTES = 8 * 1024 * 1024;

describe("SSH tunnel command transfer", function () {
    this.timeout(30_000);

    it("transfers the complete IDE-sized payload through the bundled CLI without reconnecting", async function () {
        const context = mock<ExtensionContext>();
        when(context.asAbsolutePath(anything())).thenCall((relative: string) =>
            path.resolve(__dirname, "../..", relative)
        );
        const cli = new CliWrapper(
            instance(context),
            instance(mock(LoggerManager))
        );
        if (!existsSync(cli.cliPath)) {
            assert(
                !process.env.CI,
                "Bundled CLI missing: run yarn workspace databricks run package:cli:fetch"
            );
            this.skip();
        }
        const directory = await mkdtemp(
            path.join(os.tmpdir(), "ssh-transfer-")
        );
        const peer = await createSshTunnelTestServer();
        const accept = new EventEmitter<void>();
        const hide = new EventEmitter<void>();
        const changed = new EventEmitter<void>();
        const windowSpy = spy(window);
        const envSpy = spy(env);
        const pickerMock = mock<QuickPick<QuickPickItem>>();
        const picker = instance(pickerMock);
        let ssh: SshCommands | undefined;
        try {
            const configFile = path.join(directory, "databrickscfg");
            await writeFile(
                configFile,
                `[ssh-test]\nhost = ${peer.host}\ntoken = local-test-token\nauth_type = pat\n`
            );
            const auth = mock<AuthProvider>();
            /* eslint-disable @typescript-eslint/naming-convention */
            when(auth.toEnv()).thenReturn({
                DATABRICKS_HOST: peer.host,
                DATABRICKS_TOKEN: "local-test-token",
                DATABRICKS_AUTH_TYPE: "pat",
                DATABRICKS_CONFIG_PROFILE: "ssh-test",
                DATABRICKS_CONFIG_FILE: configFile,
            });
            /* eslint-enable @typescript-eslint/naming-convention */
            const workspace = mock(DatabricksWorkspace);
            when(workspace.authProvider).thenReturn(instance(auth));
            when(workspace.userName).thenReturn("ssh-test");
            const connection = mock(ConnectionManager);
            when(connection.isInitialized).thenReturn(true);
            when(connection.state).thenReturn("CONNECTED");
            when(connection.databricksWorkspace).thenReturn(
                instance(workspace)
            );
            const cluster = mock(Cluster);
            when(cluster.id).thenReturn("test-cluster");
            when(cluster.name).thenReturn("Test cluster");
            when(cluster.state).thenReturn("RUNNING");
            when(cluster.isValidSingleUser("ssh-test")).thenReturn(true);
            const clusters = mock(ClusterModel);
            when(clusters.allRoots).thenReturn([instance(cluster)]);
            when(clusters.onDidChange).thenReturn(changed.event);

            when(pickerMock.onDidAccept).thenReturn(accept.event);
            when(pickerMock.onDidHide).thenReturn(hide.event);
            let disposed = false;
            when(pickerMock.dispose()).thenCall(() => {
                if (!disposed) {
                    disposed = true;
                    hide.fire();
                }
            });
            const shown = new Promise<void>((resolve) => {
                when(pickerMock.show()).thenCall(resolve);
            });
            when(windowSpy.createQuickPick()).thenReturn(picker);
            when(windowSpy.showErrorMessage(anything())).thenResolve(undefined);
            when(
                windowSpy.showWarningMessage(anything(), anything())
            ).thenResolve(undefined);
            const terminal = mock<Terminal>();
            let command: string | undefined;
            let terminalOptions: TerminalOptions | undefined;
            when(terminal.sendText(anything())).thenCall((value: string) => {
                command = value;
            });
            when(windowSpy.createTerminal(anything())).thenCall(
                (value: TerminalOptions) => {
                    terminalOptions = value;
                    return instance(terminal);
                }
            );
            const shell = process.platform === "win32" ? "cmd.exe" : "/bin/sh";
            when(envSpy.shell).thenReturn(shell);
            ssh = new SshCommands(
                cli,
                instance(connection),
                instance(clusters)
            );
            const started = ssh.startTunnelCommand();
            await shown;
            const selected = picker.items.find((item) => "cluster" in item);
            assert.ok(
                selected,
                "the compute picker must offer the test cluster"
            );
            picker.selectedItems = [selected];
            accept.fire();
            await started;
            verify(windowSpy.showErrorMessage(anything())).never();
            verify(terminal.sendText(anything())).once();
            assert.ok(command, "accepting compute must launch the CLI");
            assert.ok(terminalOptions);

            // Enter the same ProxyCommand path Remote SSH uses after provisioning.
            // Only cloud setup and the remote peer are replaced; the bundled CLI is real.
            command +=
                " --proxy --metadata=ssh-test,7772,test-cluster --profile=ssh-test";
            const batch = path.join(directory, "launch.cmd");
            await writeFile(batch, `@echo off\r\n${command}\r\n`);
            const shellArgs =
                process.platform === "win32"
                    ? ["/d", "/c", batch]
                    : ["-c", command];
            const inherited = Object.fromEntries(
                Object.entries(process.env).filter(
                    ([key]) =>
                        !key.startsWith("DATABRICKS_") &&
                        !key.toLowerCase().includes("proxy")
                )
            );
            /* eslint-disable @typescript-eslint/naming-convention */
            const child = spawn(shell, shellArgs, {
                cwd: directory,
                detached: process.platform !== "win32",
                env: {
                    ...inherited,
                    ...terminalOptions.env,
                    HOME: directory,
                    USERPROFILE: directory,
                    LOCALAPPDATA: path.join(directory, "local-app-data"),
                    APPDATA: path.join(directory, "app-data"),
                    XDG_CACHE_HOME: path.join(directory, "cache"),
                    NO_PROXY: "127.0.0.1",
                } as NodeJS.ProcessEnv,
            });
            /* eslint-enable @typescript-eslint/naming-convention */
            const payload = randomBytes(PAYLOAD_BYTES);
            const output: Buffer[] = [];
            let outputBytes = 0;
            let stderr = "";
            child.stdin.on("error", () => {});
            child.stderr.on("data", (data: Buffer) => {
                stderr = (stderr + data).slice(-16_384);
            });
            child.stdout.on("data", (data: Buffer) => {
                output.push(data);
                outputBytes += data.length;
                if (outputBytes >= payload.length) {
                    child.stdin.end();
                }
            });
            const closed = new Promise<{
                code: number | null;
                signal: NodeJS.Signals | null;
            }>((resolve, reject) => {
                child.once("error", reject);
                child.once("close", (code, signal) => resolve({code, signal}));
            });
            const timeout = setTimeout(() => {
                if (!child.pid) {
                    return;
                }
                if (process.platform === "win32") {
                    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
                        stdio: "ignore",
                    }).on("error", () => child.kill("SIGKILL"));
                } else {
                    process.kill(-child.pid, "SIGKILL");
                }
            }, 20_000);
            child.stdin.write(payload);
            const result = await closed.finally(() => clearTimeout(timeout));
            const diagnostic = `CLI exit=${result.code}, signal=${result.signal}; uploaded=${peer.receivedBytes}, downloaded=${outputBytes}, expected=${PAYLOAD_BYTES}\n${stderr}`;
            // The regressed CLI can exit successfully after truncating the stream.
            assert.equal(peer.receivedBytes, PAYLOAD_BYTES, diagnostic);
            assert.equal(outputBytes, PAYLOAD_BYTES, diagnostic);
            assert.ok(
                Buffer.concat(output).equals(payload),
                "tunnel payload was corrupted"
            );
            assert.equal(result.code, 0, diagnostic);
            assert.equal(peer.connections, 1, "transfer must not reconnect");
            assert.deepEqual(peer.unexpectedRequests, []);
        } finally {
            picker.dispose();
            ssh?.dispose();
            reset(windowSpy);
            reset(envSpy);
            accept.dispose();
            hide.dispose();
            changed.dispose();
            await peer.dispose();
            await rm(directory, {
                recursive: true,
                force: true,
                maxRetries: 5,
                retryDelay: 200,
            });
        }
    });
});
