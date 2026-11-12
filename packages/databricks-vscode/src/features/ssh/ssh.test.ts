import os from "node:os";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerFeatures, startFeatures } from "../../kernel/feature";
import { CancelledError, type UserFacingError } from "../../platform/errors";
import { MutableState, when } from "../../platform/reactive";
import { environmentOf, PROBE_ENV, PROBE_SETTINGS } from "../../test-support/childEnvironment";
import { apiCluster, FakeClusters } from "../../test-support/fakeClusters";
import { fakeFeatureHost, fakeKernel, fakeSettings } from "../../test-support/fakes";
import { FakeFileEvents } from "../../test-support/fakeFiles";
import { FakeHttpClient, SCIM_ME } from "../../test-support/fakeHttp";
import { useTempDirs } from "../../test-support/tempDir";
import { env, host as vscode, type FakeQuickInput } from "../../test-support/vscode";
import { connection } from "../connection";
import { ssh, SSH_TUNNEL_PROJECT_VIEW, SSH_TUNNEL_VIEW, START_TUNNEL } from "./index";
import { SERVERLESS_LABEL } from "./SshComputePicker";
import { SshTunnel, TERMINAL_NAME } from "./SshTunnel";

/* eslint-disable @typescript-eslint/naming-convention */

const A = "https://a.cloud.databricks.com";
const tempDir = useTempDirs();

function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((r) => (resolve = r));
    return { promise, resolve };
}

/**
 * The real kernel, signed in as "me" with the DEFAULT profile, with the
 * connection and ssh features registered. With `project`, a bundle with a
 * development target is open, and `overrides` are its compute choices.
 * With `probe`, the host env and settings tell the child environments apart.
 */
async function setup(
    options: {
        project?: boolean;
        overrides?: Record<string, unknown>;
        probe?: boolean;
        settings?: Record<string, unknown>;
    } = {},
) {
    const t = tempDir();
    const config = t.write(".databrickscfg", `[DEFAULT]\nhost = ${A}\ntoken = dapi-default\n`);
    const folders: string[] = [];
    if (options.project) {
        t.write(
            "project/databricks.yml",
            `bundle: {name: demo}\ntargets:\n  dev: {default: true, mode: development, workspace: {host: ${A}}}\n`,
        );
        if (options.overrides !== undefined) {
            t.write(
                "project/.databricks/bundle/dev/vscode.overrides.json",
                JSON.stringify(options.overrides),
            );
        }
        folders.push(t.path("project"));
    }
    vscode.folders = folders;
    const http = new FakeHttpClient().on("GET", SCIM_ME, () => ({ body: { userName: "me" } }));
    const clusters = new FakeClusters([
        apiCluster("c-shared", { cluster_name: "shared", data_security_mode: "USER_ISOLATION" }),
        apiCluster("c-other", {
            cluster_name: "theirs",
            data_security_mode: "SINGLE_USER",
            single_user_name: "someone",
        }),
        apiCluster("c-stopped", {
            cluster_name: "a-stopped",
            state: "TERMINATED",
            data_security_mode: "SINGLE_USER",
            single_user_name: "me",
        }),
        apiCluster("c-mine", {
            cluster_name: "mine",
            cluster_memory_mb: 2048,
            cluster_cores: 4,
            data_security_mode: "SINGLE_USER",
            single_user_name: "me",
        }),
    ]);
    clusters.install(http);
    const kernel = fakeKernel({
        env: {
            ...(options.probe ? PROBE_ENV : {}),
            DATABRICKS_CONFIG_FILE: config,
            DATABRICKS_TOKEN: "ambient",
            PATH: "/usr/bin",
        },
        settings: fakeSettings({
            ...(options.probe ? PROBE_SETTINGS : {}),
            ...options.settings,
        }),
        httpClient: http,
        folders: new MutableState<readonly string[]>(folders),
        files: new FakeFileEvents(),
    });
    kernel.runner.on(["bundle", "validate"], () => ({
        stdout: JSON.stringify({ bundle: { name: "demo", target: "dev", mode: "development" } }),
    }));
    kernel.runner.on(["bundle", "summary"], () => ({
        stdout: JSON.stringify({ bundle: { name: "demo", target: "dev" } }),
    }));
    const fake = fakeFeatureHost(kernel);
    const registered = registerFeatures([connection, ssh], fake.host);
    kernel.start();
    startFeatures(registered);
    await when(kernel.connection.state, (s) => s.status === "connected");
    if (options.project) {
        await when(kernel.bundle.validated, (s) => s.status === "ready");
    }
    const tunnel = (deps: Partial<ConstructorParameters<typeof SshTunnel>[0]> = {}) =>
        new SshTunnel({
            kernel,
            log: fake.log,
            signIn: async () => {},
            shellKind: () => "posix",
            platform: "linux",
            isHostCliOnPath: async () => true,
            hostCliInInstall: async () => undefined,
            ...deps,
        });
    const picker = () => vscode.quickInputs.at(-1) as FakeQuickInput;
    const labels = () => picker().items.map((i) => i.label);
    return { t, kernel, clusters, tunnel, picker, labels, fake };
}

describe("the SSH tunnel's compute picker (SSH-01)", () => {
    beforeEach(() => {
        vscode.reset();
        vscode.extensions.set("ms-vscode-remote.remote-ssh", {
            isActive: false,
            exports: undefined,
            activate: async () => undefined,
        });
    });

    it("offers the serverless items at once, then the user's single-user clusters, running first, and stops loading", async () => {
        const s = await setup();
        const slow = deferred();
        s.clusters.listDelay = slow.promise;
        const started = s.tunnel().start();
        await vi.waitFor(() => expect(vscode.quickInputs).toHaveLength(1));

        expect(s.picker().title).toBe("Select compute for SSH tunnel");
        expect(s.picker().placeholder).toBe("Loading dedicated clusters…");
        expect(s.picker().busy).toBe(true);
        expect(s.labels()).toEqual([
            SERVERLESS_LABEL,
            "$(cloud) Serverless GPU 1xA10",
            "$(cloud) Serverless GPU 8xH100",
            "Loading clusters…",
        ]);
        expect(
            s
                .picker()
                .items.slice(0, 3)
                .every((i) => i.alwaysShow === true),
        ).toBe(true);
        expect(s.picker().items[3]!.kind).toBe(-1);

        slow.resolve();
        await vi.waitFor(() => expect(s.picker().busy).toBe(false));
        expect(s.picker().placeholder).toBeUndefined();
        expect(s.labels().slice(3)).toEqual([
            "Dedicated clusters",
            "$(server) mine (c-mine)",
            "$(server) a-stopped (c-stopped)",
        ]);
        expect(s.picker().items[4]!.detail).toBe("Active | 2 GB | 4 Cores | 15.4.x-scala2.12 | me");
        expect(s.picker().items[5]!.detail).toMatch(/^Inactive \| /);

        s.picker().hide();
        await expect(started).rejects.toBeInstanceOf(CancelledError);
        expect(vscode.terminals).toHaveLength(0);
    });

    it("says so when the user has no dedicated cluster", async () => {
        const s = await setup();
        s.clusters.clusters.delete("c-mine");
        s.clusters.clusters.delete("c-stopped");
        void s
            .tunnel()
            .start()
            .catch(() => {});
        await vi.waitFor(() => expect(vscode.quickInputs).toHaveLength(1));
        await vi.waitFor(() => expect(s.picker().busy).toBe(false));
        expect(s.labels().slice(3)).toEqual(["No dedicated clusters found"]);
        s.picker().hide();
    });

    it("stops showing the spinner after the timeout when the list hangs", async () => {
        const s = await setup();
        s.clusters.listDelay = new Promise(() => {});
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
        try {
            void s
                .tunnel()
                .start()
                .catch(() => {});
            await vi.waitFor(() => expect(vscode.quickInputs).toHaveLength(1));
            expect(s.picker().busy).toBe(true);
            vi.advanceTimersByTime(10_000);
            expect(s.picker().busy).toBe(false);
            expect(s.labels().slice(3)).toEqual(["No dedicated clusters found"]);
            s.picker().hide();
        } finally {
            vi.useRealTimers();
        }
    });

    it("lists from the whole workspace, not the Compute view's filter, and shows a failed listing as no clusters", async () => {
        const s = await setup();
        s.kernel.http.on("GET", "/api/2.1/clusters/list", () => ({
            status: 500,
            body: { error_code: "INTERNAL_ERROR", message: "boom" },
        }));
        void s
            .tunnel()
            .start()
            .catch(() => {});
        await vi.waitFor(() => expect(vscode.quickInputs).toHaveLength(1));
        await vi.waitFor(() => expect(s.picker().busy).toBe(false));
        expect(s.labels().slice(3)).toEqual(["No dedicated clusters found"]);
        s.picker().hide();
    });

    it("preselects the project's attached cluster once it is listed", async () => {
        const s = await setup({ project: true, overrides: { clusterId: "c-stopped" } });
        void s
            .tunnel()
            .start()
            .catch(() => {});
        await vi.waitFor(() => expect(vscode.quickInputs).toHaveLength(1));
        await vi.waitFor(() => expect(s.picker().busy).toBe(false));
        expect(s.picker().activeItems.map((i) => i.label)).toEqual([
            "$(server) a-stopped (c-stopped)",
        ]);
        s.picker().hide();
    });

    it("preselects Serverless when the project uses it", async () => {
        const s = await setup({ project: true, overrides: { serverless: true } });
        void s
            .tunnel()
            .start()
            .catch(() => {});
        await vi.waitFor(() => expect(vscode.quickInputs).toHaveLength(1));
        expect(s.picker().activeItems.map((i) => i.label)).toEqual([SERVERLESS_LABEL]);
        s.picker().hide();
    });

    it("preselects nothing for the serverless default: Enter must not start a session", async () => {
        const s = await setup({ project: true, overrides: {} });
        void s
            .tunnel()
            .start()
            .catch(() => {});
        await vi.waitFor(() => expect(vscode.quickInputs).toHaveLength(1));
        await vi.waitFor(() => expect(s.picker().busy).toBe(false));
        expect(s.picker().activeItems).toEqual([]);
        s.picker().hide();
    });

    it("preselects nothing for a cluster that isn't the user's", async () => {
        const s = await setup({ project: true, overrides: { clusterId: "c-shared" } });
        void s
            .tunnel()
            .start()
            .catch(() => {});
        await vi.waitFor(() => expect(vscode.quickInputs).toHaveLength(1));
        await vi.waitFor(() => expect(s.picker().busy).toBe(false));
        expect(s.picker().activeItems).toEqual([]);
        s.picker().hide();
    });
});

describe("starting the SSH tunnel (SSH-01)", () => {
    beforeEach(() => {
        vscode.reset();
        env.uriScheme = "vscode";
        vscode.extensions.set("ms-vscode-remote.remote-ssh", {
            isActive: false,
            exports: undefined,
            activate: async () => undefined,
        });
    });

    it("runs ssh connect for serverless in the transient terminal, with the connection's environment", async () => {
        const s = await setup();
        const started = s.tunnel().start();
        await vi.waitFor(() => expect(vscode.quickInputs).toHaveLength(1));
        s.picker().accept(SERVERLESS_LABEL);
        await started;

        expect(vscode.terminals).toHaveLength(1);
        const terminal = vscode.terminals[0]!;
        expect(terminal.creationOptions).toMatchObject({
            name: TERMINAL_NAME,
            isTransient: true,
            strictEnv: true,
            cwd: os.tmpdir(),
        });
        expect(terminal.creationOptions.env).toMatchObject({
            DATABRICKS_HOST: A,
            DATABRICKS_CONFIG_PROFILE: "DEFAULT",
            DATABRICKS_CONFIG_FILE: s.t.path(".databrickscfg"),
            DATABRICKS_OUTPUT_FORMAT: "text",
            DATABRICKS_CLI_UPSTREAM: "databricks-vscode",
            PATH: "/usr/bin",
        });
        // Credentials in the VS Code process don't reach the CLI.
        expect(terminal.creationOptions.env?.DATABRICKS_TOKEN).toBeUndefined();
        expect(terminal.shown).toBe(1);
        expect(terminal.sent).toEqual([
            `'${s.kernel.cli.cliPath}' ssh connect --ide=vscode --auto-approve`,
        ]);
        expect(s.picker().disposed).toBe(true);
    });

    it("passes the editor's command from its install folder to ssh connect, and only when it is found", async () => {
        const found = await setup();
        const started = found
            .tunnel({ hostCliInInstall: async () => "/opt/editor/bin/code" })
            .start();
        await vi.waitFor(() => expect(vscode.quickInputs).toHaveLength(1));
        found.picker().accept(SERVERLESS_LABEL);
        await started;
        expect(vscode.terminals[0]!.creationOptions.env?.DATABRICKS_SSH_IDE_COMMAND).toBe(
            "/opt/editor/bin/code",
        );
        expect(vscode.terminals[0]!.sent[0]).toMatch(/ ssh connect --ide=vscode --auto-approve$/);

        vscode.reset();
        vscode.extensions.set("ms-vscode-remote.remote-ssh", {
            isActive: false,
            exports: undefined,
            activate: async () => undefined,
        });
        const missing = await setup();
        const notFound = missing.tunnel().start();
        await vi.waitFor(() => expect(vscode.quickInputs).toHaveLength(1));
        missing.picker().accept(SERVERLESS_LABEL);
        await notFound;
        expect(vscode.terminals[0]!.creationOptions.env).not.toHaveProperty(
            "DATABRICKS_SSH_IDE_COMMAND",
        );
    });

    it("gives the terminal the host env with http.proxy over it, as 2.22.0 did", async () => {
        const s = await setup({ probe: true });
        const started = s.tunnel().start();
        await vi.waitFor(() => expect(vscode.quickInputs).toHaveLength(1));
        s.picker().accept(SERVERLESS_LABEL);
        await started;
        expect(environmentOf(vscode.terminals[0]!.creationOptions.env)).toBe("hostAndProxy");
    });

    it("asks for a GPU accelerator", async () => {
        const s = await setup();
        const started = s.tunnel().start();
        await vi.waitFor(() => expect(vscode.quickInputs).toHaveLength(1));
        s.picker().accept("$(cloud) Serverless GPU 8xH100");
        await started;
        expect(vscode.terminals[0]!.sent[0]).toMatch(
            / ssh connect --ide=vscode --auto-approve --accelerator=GPU_8xH100$/,
        );
    });

    it("starts a stopped dedicated cluster", async () => {
        const s = await setup();
        const started = s.tunnel().start();
        await vi.waitFor(() => expect(s.labels()).toContain("$(server) a-stopped (c-stopped)"));
        s.picker().accept("$(server) a-stopped (c-stopped)");
        await started;
        expect(vscode.terminals[0]!.sent[0]).toMatch(
            / ssh connect --ide=vscode --auto-approve --cluster=c-stopped --auto-start-cluster$/,
        );
        // Nothing is saved: the tunnel's compute isn't the project's.
        expect(s.clusters.starts).toEqual([]);
    });

    it("opens the remote window in Cursor when running in Cursor, and checks Cursor's Remote-SSH", async () => {
        const s = await setup();
        env.uriScheme = "cursor";
        vscode.extensions.clear();
        vscode.extensions.set("anysphere.remote-ssh", {
            isActive: false,
            exports: undefined,
            activate: async () => undefined,
        });
        const started = s.tunnel().start();
        await vi.waitFor(() => expect(vscode.quickInputs).toHaveLength(1));
        s.picker().accept(SERVERLESS_LABEL);
        await started;
        expect(vscode.terminals[0]!.sent[0]).toMatch(/ ssh connect --ide=cursor --auto-approve$/);
        expect(vscode.executed.map((e) => e.command)).not.toContain(
            "workbench.extensions.installExtension",
        );
    });

    it("writes the line for the default profile's shell", async () => {
        const s = await setup();
        const started = s.tunnel({ shellKind: () => "powershell" }).start();
        await vi.waitFor(() => expect(vscode.quickInputs).toHaveLength(1));
        s.picker().accept(SERVERLESS_LABEL);
        await started;
        expect(vscode.terminals[0]!.sent[0]).toBe(
            `& '${s.kernel.cli.cliPath}' ssh connect --ide=vscode --auto-approve`,
        );
    });

    it("signs in first when signed out, then carries on with the new connection", async () => {
        const s = await setup();
        await s.kernel.connection.signOut();
        const signIn = vi.fn(async () => {
            await s.kernel.connection.useProfile("DEFAULT");
        });
        const started = s.tunnel({ signIn }).start();
        await vi.waitFor(() => expect(vscode.quickInputs).toHaveLength(1));
        expect(signIn).toHaveBeenCalledOnce();
        s.picker().accept(SERVERLESS_LABEL);
        await started;
        expect(vscode.terminals[0]!.creationOptions.env).toMatchObject({
            DATABRICKS_CONFIG_PROFILE: "DEFAULT",
        });
    });

    it("stops quietly when the sign-in wizard is dismissed", async () => {
        const s = await setup();
        await s.kernel.connection.signOut();
        await expect(s.tunnel({ signIn: async () => {} }).start()).rejects.toBeInstanceOf(
            CancelledError,
        );
        expect(vscode.quickInputs).toHaveLength(0);
        expect(vscode.terminals).toHaveLength(0);
    });

    it("installs Remote-SSH first when it is missing, or enables it", async () => {
        const s = await setup();
        vscode.extensions.clear();
        const started = s.tunnel().start();
        await vi.waitFor(() => expect(vscode.quickInputs).toHaveLength(1));
        expect(vscode.executed).toContainEqual({
            command: "workbench.extensions.installExtension",
            args: ["ms-vscode-remote.remote-ssh", { enable: true }],
        });
        expect(vscode.progress.map((p) => p.title)).toEqual([
            "Installing the Remote - SSH extension (ms-vscode-remote.remote-ssh)",
        ]);
        s.picker().accept(SERVERLESS_LABEL);
        await started;
        expect(vscode.terminals).toHaveLength(1);
    });

    it("updates a Remote-SSH older than the CLI accepts, and leaves a recent one alone", async () => {
        const s = await setup();
        const remoteSsh = (version: string) => ({
            isActive: false,
            exports: undefined,
            activate: async () => undefined,
            packageJSON: { version },
        });
        vscode.extensions.set("ms-vscode-remote.remote-ssh", remoteSsh("0.119.0"));
        let started = s.tunnel().start();
        await vi.waitFor(() => expect(vscode.quickInputs).toHaveLength(1));
        expect(vscode.executed).toContainEqual({
            command: "workbench.extensions.installExtension",
            args: ["ms-vscode-remote.remote-ssh"],
        });
        s.picker().hide();
        await started.catch(() => {});

        vscode.executed.length = 0;
        vscode.extensions.set("ms-vscode-remote.remote-ssh", remoteSsh("0.122.2025090915"));
        started = s.tunnel().start();
        await vi.waitFor(() => expect(vscode.quickInputs).toHaveLength(2));
        expect(vscode.executed.map((e) => e.command)).not.toContain(
            "workbench.extensions.installExtension",
        );
        s.picker().hide();
        await started.catch(() => {});
    });

    it("stops before signing in or picking compute when Remote-SSH can't be installed", async () => {
        const s = await setup();
        vscode.extensions.clear();
        vscode.commands.set("workbench.extensions.installExtension", () =>
            Promise.reject(new Error("offline")),
        );
        const signIn = vi.fn(async () => {});
        await expect(s.tunnel({ signIn }).start()).rejects.toMatchObject({
            code: "EXTENSION_INSTALL_FAILED",
            userMessage:
                "Opening the remote window needs the Remote - SSH extension (ms-vscode-remote.remote-ssh), and it couldn't be installed: offline",
        });
        expect(signIn).not.toHaveBeenCalled();
        expect(vscode.quickInputs).toHaveLength(0);
    });

    it("stops before installing Remote-SSH, signing in or picking compute when extensions.allowed blocks it", async () => {
        const s = await setup({ settings: { "extensions.allowed": { "*": false } } });
        vscode.extensions.clear();
        const signIn = vi.fn(async () => {});
        const error = await s
            .tunnel({ signIn })
            .start()
            .then(
                () => undefined,
                (e: unknown) => e as UserFacingError,
            );
        expect(error).toMatchObject({
            code: "EXTENSION_NOT_ALLOWED",
            userMessage:
                "The 'Remote - SSH' extension is required to start an SSH tunnel, but installing it is blocked. " +
                "Please modify the 'extensions.allowed' setting to allow 'ms-vscode-remote.remote-ssh', then try again.",
        });
        expect(vscode.executed.map((e) => e.command)).not.toContain(
            "workbench.extensions.installExtension",
        );
        expect(signIn).not.toHaveBeenCalled();
        expect(vscode.quickInputs).toHaveLength(0);

        expect(error!.actions.map((a) => a.title)).toEqual(["Open setting"]);
        await error!.actions[0]!.run();
        expect(vscode.executed).toContainEqual({
            command: "workbench.action.openSettings",
            args: ["extensions.allowed"],
        });
    });

    it("names Cursor's Remote-SSH when extensions.allowed blocks it in Cursor", async () => {
        const s = await setup({
            settings: { "extensions.allowed": { "*": false, "microsoft": true } },
        });
        env.uriScheme = "cursor";
        await expect(s.tunnel().start()).rejects.toMatchObject({
            code: "EXTENSION_NOT_ALLOWED",
            userMessage: expect.stringContaining("allow 'anysphere.remote-ssh'"),
        });
    });

    it("carries on when extensions.allowed allows Remote-SSH", async () => {
        const s = await setup({
            settings: {
                "extensions.allowed": { "*": false, "ms-vscode-remote.remote-ssh": "stable" },
            },
        });
        const started = s.tunnel().start();
        await vi.waitFor(() => expect(vscode.quickInputs).toHaveLength(1));
        s.picker().accept(SERVERLESS_LABEL);
        await started;
        expect(vscode.terminals).toHaveLength(1);
    });
});

describe("the host CLI hint", () => {
    beforeEach(() => {
        vscode.reset();
        env.uriScheme = "vscode";
        vscode.extensions.set("ms-vscode-remote.remote-ssh", {
            isActive: false,
            exports: undefined,
            activate: async () => undefined,
        });
    });

    /** Starts the tunnel with the probe's answer, dismisses the picker, and lets the hint settle. */
    async function hint(options: {
        onPath: boolean;
        platform: NodeJS.Platform;
        choice?: string;
        uriScheme?: string;
        inInstall?: string;
    }) {
        const s = await setup();
        env.uriScheme = options.uriScheme ?? "vscode";
        if (options.uriScheme === "cursor") {
            vscode.extensions.set("anysphere.remote-ssh", {
                isActive: false,
                exports: undefined,
                activate: async () => undefined,
            });
        }
        vscode.nextMessageChoice = options.choice;
        const probed: string[] = [];
        const started = s
            .tunnel({
                platform: options.platform,
                hostCliInInstall: async () => options.inInstall,
                isHostCliOnPath: async (command) => {
                    probed.push(command);
                    return options.onPath;
                },
            })
            .start();
        await vi.waitFor(() => expect(vscode.quickInputs).toHaveLength(1));
        s.picker().hide();
        await started.catch(() => {});
        await new Promise((r) => setTimeout(r, 0));
        return probed;
    }

    it("says nothing when the command is on PATH", async () => {
        expect(await hint({ onPath: true, platform: "linux" })).toEqual(["code"]);
        expect(vscode.warnings).toEqual([]);
    });

    it("says nothing, and doesn't probe PATH, when the command is in the install folder", async () => {
        expect(
            await hint({ onPath: false, platform: "darwin", inInstall: "/opt/editor/bin/code" }),
        ).toEqual([]);
        expect(vscode.warnings).toEqual([]);
    });

    it("still hints when the command is in neither the install folder nor on PATH", async () => {
        expect(await hint({ onPath: false, platform: "linux" })).toEqual(["code"]);
        expect(vscode.warnings).toHaveLength(1);
    });

    it("offers the shell-command installer on macOS", async () => {
        await hint({ onPath: false, platform: "darwin", choice: "Install shell command" });
        expect(vscode.warnings).toEqual([
            {
                message:
                    'The "code" command may not be on your PATH, which the Databricks SSH tunnel needs to open the remote window. If the tunnel fails to open a window, add it to your PATH and try again.',
                actions: ["Install shell command"],
            },
        ]);
        expect(vscode.executed).toContainEqual({
            command: "workbench.action.installCommandLine",
            args: [],
        });
    });

    it("doesn't run the installer when the hint is dismissed", async () => {
        await hint({ onPath: false, platform: "darwin" });
        expect(vscode.warnings).toHaveLength(1);
        expect(vscode.executed.map((e) => e.command)).not.toContain(
            "workbench.action.installCommandLine",
        );
    });

    it("points at VS Code's PATH docs elsewhere", async () => {
        await hint({ onPath: false, platform: "linux", choice: "Setup instructions" });
        expect(vscode.warnings[0]!.actions).toEqual(["Setup instructions"]);
        const open = vscode.executed.find((e) => e.command === "vscode.open");
        expect(String(open?.args[0])).toBe(
            "https://code.visualstudio.com/docs/setup/setup-overview",
        );
    });

    it("probes `cursor` and points at Cursor's docs in Cursor", async () => {
        expect(
            await hint({
                onPath: false,
                platform: "win32",
                choice: "Setup instructions",
                uriScheme: "cursor",
            }),
        ).toEqual(["cursor"]);
        expect(vscode.warnings[0]!.message).toContain('The "cursor" command');
        const open = vscode.executed.find((e) => e.command === "vscode.open");
        expect(String(open?.args[0])).toBe("https://docs.cursor.com/en/cli/installation");
    });

    it("doesn't open the docs when the hint is dismissed", async () => {
        await hint({ onPath: false, platform: "linux" });
        expect(vscode.warnings).toHaveLength(1);
        expect(vscode.executed.map((e) => e.command)).not.toContain("vscode.open");
    });
});

describe("the SSH Tunnel view and command (SSH-02)", () => {
    beforeEach(() => {
        vscode.reset();
        env.uriScheme = "vscode";
        vscode.extensions.set("ms-vscode-remote.remote-ssh", {
            isActive: false,
            exports: undefined,
            activate: async () => undefined,
        });
    });

    it("has an empty view, so its welcome content and button show, with or without a folder", async () => {
        await setup();
        const provider = vscode.treeDataProviders.get(SSH_TUNNEL_VIEW) as {
            getChildren(): unknown[];
        };
        expect(provider.getChildren()).toEqual([]);
        expect(vscode.commands.has(START_TUNNEL)).toBe(true);
    });

    it("has an empty provider for each of its two view IDs, the one above Project and the one below the bundle views", async () => {
        await setup();
        for (const id of [SSH_TUNNEL_VIEW, SSH_TUNNEL_PROJECT_VIEW]) {
            const provider = vscode.treeDataProviders.get(id) as { getChildren(): unknown[] };
            expect(provider.getChildren()).toEqual([]);
        }
    });

    it("runs the shared sign-in wizard when signed out, and does nothing when it is dismissed", async () => {
        const s = await setup();
        await s.kernel.connection.signOut();
        const run = vscode.commands.get(START_TUNNEL)!() as Promise<unknown>;
        // The wizard's first step.
        await vi.waitFor(() => expect(vscode.quickInputs).toHaveLength(1));
        expect(s.picker().title).not.toBe("Select compute for SSH tunnel");
        s.picker().hide();
        await run;
        expect(vscode.errors).toEqual([]);
        expect(vscode.terminals).toHaveLength(0);
        expect(s.fake.executions.find((e) => e.command === START_TUNNEL)?.success).toBe(true);
    });

    it("renders a failure to install Remote-SSH with a way to find it", async () => {
        const s = await setup();
        vscode.extensions.clear();
        vscode.commands.set("workbench.extensions.installExtension", () =>
            Promise.reject(new Error("offline")),
        );
        await vscode.commands.get(START_TUNNEL)!();
        expect(vscode.errors).toEqual([
            {
                message:
                    "Opening the remote window needs the Remote - SSH extension (ms-vscode-remote.remote-ssh), and it couldn't be installed: offline",
                actions: ["Show extension"],
            },
        ]);
        expect(s.fake.executions.find((e) => e.command === START_TUNNEL)?.success).toBe(false);
    });
});
