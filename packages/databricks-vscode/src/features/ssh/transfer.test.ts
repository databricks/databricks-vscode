import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bundledCliPath } from "../../kernel/cli/CliPaths";
import type { ClusterDetails } from "../../kernel/compute/clusters";
import type { ClusterList } from "../../kernel/compute/ComputeService";
import type { Compute } from "../../kernel/compute/effectiveCompute";
import type { Connection, ConnectionState } from "../../kernel/connection/ConnectionService";
import type { Kernel } from "../../kernel/feature";
import { MutableState } from "../../platform/reactive";
import { fakeKernel, fakeLog } from "../../test-support/fakes";
import { createSshTunnelServer } from "../../test-support/sshTunnelServer";
import { env, host as vscode, type FakeQuickInput } from "../../test-support/vscode";
import { SshTunnel } from "./SshTunnel";

/* eslint-disable @typescript-eslint/naming-convention */

// Remote VS Code startup transfers several MiB; CLI 1.16.0 cut streams off at 1 MiB.
const PAYLOAD_BYTES = 8 * 1024 * 1024;
const packageDir = path.resolve(__dirname, "../../..");
const cliPath = bundledCliPath((relative) => path.resolve(packageDir, relative));

/**
 * Ported from the old `SshCommands.transfer.test.ts`: the command line and
 * environment the tunnel types into its terminal, run with the bundled CLI
 * through the `--proxy` path Remote-SSH takes after provisioning, against a
 * local workspace and driver proxy. Skipped when the CLI hasn't been fetched
 * (`yarn workspace databricks fetch:cli`), except in CI.
 */
describe("SSH tunnel transfer", () => {
    let directory: string;
    let peer: Awaited<ReturnType<typeof createSshTunnelServer>>;

    beforeEach(async () => {
        vscode.reset();
        env.uriScheme = "vscode";
        vscode.extensions.set("ms-vscode-remote.remote-ssh", {
            isActive: false,
            exports: undefined,
            activate: async () => undefined,
        });
        directory = await mkdtemp(path.join(os.tmpdir(), "ssh-transfer-"));
        peer = await createSshTunnelServer();
    });

    afterEach(async () => {
        await peer.dispose();
        await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    });

    it.skipIf(!fs.existsSync(cliPath) && !process.env.CI)(
        "transfers an IDE-sized payload through the bundled CLI without reconnecting",
        async () => {
            const configFile = path.join(directory, "databrickscfg");
            await writeFile(
                configFile,
                `[ssh-test]\nhost = ${peer.host}\ntoken = local-test-token\nauth_type = pat\n`,
            );
            // The terminal's environment is exactly what the tunnel passes (`strictEnv`).
            const inherited = Object.fromEntries(
                Object.entries(process.env).filter(
                    ([key]) =>
                        !key.startsWith("DATABRICKS_") && !key.toLowerCase().includes("proxy"),
                ),
            );
            const kernel = fakeKernel({
                env: { ...inherited, DATABRICKS_CONFIG_FILE: configFile },
                extension: {
                    id: "databricks.databricks",
                    version: "2.20.0",
                    logPath: directory,
                    asAbsolutePath: (relative) => path.resolve(packageDir, relative),
                    cliVersion: "1.19.0",
                    isDevelopment: false,
                    globalStoragePath: "/tmp/databricks-vscode-test-storage",
                },
            });
            // The kernel signs in only to https hosts without a port, so the
            // connection to the local peer is given, as the old test mocked
            // its auth provider. `childEnv` and the CLI path are the kernel's.
            const peerConnection = {
                host: peer.host,
                profile: "ssh-test",
                authType: "pat",
                userName: "ssh-test",
                child: { kind: "profile", host: peer.host, profile: "ssh-test", authType: "pat" },
            } as unknown as Connection;
            const cluster: ClusterDetails = {
                id: "test-cluster",
                name: "Test cluster",
                state: "RUNNING",
                accessMode: "SINGLE_USER",
                singleUserName: "ssh-test",
            };
            const tunnelKernel = {
                cli: kernel.cli,
                processes: kernel.processes,
                childEnv: (options?: Parameters<Kernel["childEnv"]>[0]) => kernel.childEnv(options),
                extensionDependencies: kernel.extensionDependencies,
                settings: kernel.settings,
                connection: {
                    state: new MutableState<ConnectionState>({
                        status: "connected",
                        connection: peerConnection,
                    }),
                },
                compute: {
                    clusters: new MutableState<ClusterList>({
                        status: "ready",
                        clusters: [cluster],
                    }),
                    refreshClusters: async () => {},
                    effective: new MutableState<Compute | undefined>(undefined),
                },
            } as unknown as Kernel;
            const shell = process.platform === "win32" ? "cmd.exe" : "/bin/sh";

            const started = new SshTunnel({
                kernel: tunnelKernel,
                log: fakeLog(),
                signIn: async () => {},
                shellKind: () => (process.platform === "win32" ? "cmd" : "posix"),
                isHostCliOnPath: async () => true,
            }).start();
            await vi.waitFor(() =>
                expect(
                    (vscode.quickInputs[0] as FakeQuickInput | undefined)?.items.map(
                        (i) => i.label,
                    ),
                ).toContain("$(server) Test cluster (test-cluster)"),
            );
            vscode.quickInputs[0]!.accept("$(server) Test cluster (test-cluster)");
            await started;
            expect(vscode.errors).toEqual([]);
            const terminal = vscode.terminals[0]!;
            expect(terminal.sent).toHaveLength(1);

            // Enter the same ProxyCommand path Remote-SSH uses after provisioning.
            // Only cloud setup and the remote peer are replaced; the bundled CLI is real.
            const command = `${terminal.sent[0]} --proxy --metadata=ssh-test,7772,test-cluster --profile=ssh-test`;
            const batch = path.join(directory, "launch.cmd");
            await writeFile(batch, `@echo off\r\n${command}\r\n`);
            const shellArgs = process.platform === "win32" ? ["/d", "/c", batch] : ["-c", command];
            const child = spawn(shell, shellArgs, {
                cwd: directory,
                detached: process.platform !== "win32",
                env: {
                    ...terminal.creationOptions.env,
                    HOME: directory,
                    USERPROFILE: directory,
                    LOCALAPPDATA: path.join(directory, "local-app-data"),
                    APPDATA: path.join(directory, "app-data"),
                    XDG_CACHE_HOME: path.join(directory, "cache"),
                    NO_PROXY: "127.0.0.1",
                },
            });
            const payload = randomBytes(PAYLOAD_BYTES);
            const output: Buffer[] = [];
            let outputBytes = 0;
            let stderr = "";
            child.stdin.on("error", () => {});
            child.stderr.on("data", (data: Buffer) => {
                stderr = (stderr + data.toString()).slice(-16_384);
            });
            child.stdout.on("data", (data: Buffer) => {
                output.push(data);
                outputBytes += data.length;
                if (outputBytes >= payload.length) {
                    child.stdin.end();
                }
            });
            const closed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
                (resolve, reject) => {
                    child.once("error", reject);
                    child.once("close", (code, signal) => resolve({ code, signal }));
                },
            );
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
            expect(peer.receivedBytes, diagnostic).toBe(PAYLOAD_BYTES);
            expect(outputBytes, diagnostic).toBe(PAYLOAD_BYTES);
            expect(Buffer.concat(output).equals(payload), "tunnel payload was corrupted").toBe(
                true,
            );
            expect(result.code, diagnostic).toBe(0);
            expect(peer.connections, "transfer must not reconnect").toBe(1);
            expect(peer.unexpectedRequests).toEqual([]);
        },
        30_000,
    );
});
