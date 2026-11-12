import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bundledCliPath } from "../../kernel/cli";
import { CHOOSE_PROFILE } from "../../kernel/connection/commands";
import { NO_PROJECT_CHOICE, type ConnectionState } from "../../kernel/connection/ConnectionService";
import type { ProfileInfo } from "../../kernel/connection/Profiles";
import type { KernelPlatform } from "../../kernel/createKernel";
import { registerFeatures, startFeatures } from "../../kernel/feature";
import { MutableState, when } from "../../platform/reactive";
import { Settings } from "../../platform/settings";
import { environmentOf, PROBE_ENV, PROBE_SETTINGS } from "../../test-support/childEnvironment";
import { FAKE_CLI_PATH, fakeFeatureHost, fakeKernel, fakeSettings } from "../../test-support/fakes";
import { fetchFailed, FakeHttpClient, SCIM_ME } from "../../test-support/fakeHttp";
import {
    host as vscode,
    QuickPickItemKind,
    TreeItemCollapsibleState,
    type FakeQuickInput,
} from "../../test-support/vscode";
import { statusBarContent } from "./ConnectionStatusBarItem";
import { CONNECTION_FAILED, connection } from "./index";
import {
    UnityGatewayConnectionSection,
    unityGatewayConnectionRows,
} from "./UnityGatewayConnectionSection";
import { runSignInWizard } from "./SignInWizard";
import { chooseWorkspace } from "./WorkspaceChoice";
import {
    workspaceConnectionDetails,
    workspaceConnectionRows,
    WorkspaceConnectionSection,
} from "./WorkspaceConnectionSection";

const A = "https://a.cloud.databricks.com";
const tick = () => new Promise((r) => setImmediate(r));
const lastInput = (): FakeQuickInput => vscode.quickInputs[vscode.quickInputs.length - 1]!;
const labels = (input: FakeQuickInput) => input.items.map((i) => i.label);

const dirs: string[] = [];
function configFile(content: string) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "connection-"));
    dirs.push(dir);
    const file = path.join(dir, ".databrickscfg");
    fs.writeFileSync(file, content);
    return file;
}

/** Settings with each value at the one scope named, as VS Code's `inspect` reports them. */
function settingsAt(
    scope: "globalValue" | "workspaceValue" | "workspaceFolderValue",
    values: Record<string, unknown>,
) {
    return new Settings({
        getConfiguration: (section) => ({
            get: (key: string) => values[`${section}.${key}`],
            inspect: (key: string) =>
                `${section}.${key}` in values
                    ? { [scope]: values[`${section}.${key}`] }
                    : undefined,
            update: async () => {},
        }),
        onDidChangeConfiguration: () => ({ dispose: () => {} }),
    });
}

function setup(
    cfg = `[DEFAULT]\nhost = ${A}\ntoken = dapi-default\n\n[dev]\nhost = ${A}\nauth_type = databricks-cli\n`,
    settings: Record<string, unknown> = {},
    platform: {
        env?: Record<string, string>;
        extension?: KernelPlatform["extension"];
        settings?: Settings;
    } = {},
) {
    const file = configFile(cfg);
    const http = new FakeHttpClient().on("GET", SCIM_ME, (req) => ({
        body: { userName: `user ${req.headers.get("Authorization")}` },
    }));
    const kernel = fakeKernel({
        ...platform,
        env: { ...platform.env, DATABRICKS_CONFIG_FILE: file },
        httpClient: http,
        settings: platform.settings ?? fakeSettings(settings),
    });
    kernel.runner.on(["auth", "token"], {
        stdout: JSON.stringify({
            access_token: "u2m",
            expiry: new Date(Date.now() + 3600_000).toISOString(),
        }),
    });
    const fake = fakeFeatureHost(kernel);
    const registered = registerFeatures([connection], fake.host);
    const run = (id: string, ...args: unknown[]) =>
        vscode.commands.get(id)!(...args) as Promise<unknown>;
    const settled = () => when(kernel.connection.state, (s) => s.status !== "connecting");
    return { kernel, file, http, run, settled, registered, ...fake };
}

describe("the connection feature", () => {
    beforeEach(() => vscode.reset());
    afterEach(() => {
        for (const dir of dirs.splice(0)) {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    it("connects to DEFAULT without a folder and shows it in the status bar", async () => {
        const { kernel, settled, registered } = setup();
        startFeatures(registered);
        kernel.start();
        await settled();
        const item = vscode.statusBarItems[0]!;
        expect(item.text).toBe("Databricks: DEFAULT");
        expect(item.command).toBe("databricks.connection.showConnectionMenu");
        expect(item.tooltip).toContain("Profile: DEFAULT, chosen by the DEFAULT profile");
    });

    it("shows the connection in the Connection view, collapsed over its host, user and auth type", async () => {
        const { kernel, settled, registered, host } = setup();
        startFeatures(registered);
        kernel.start();
        await settled();
        const [section] = host.sections.list("signIn");
        const [row] = await section!.getChildren();

        expect(row).toMatchObject({
            label: "Workspace connection",
            description: "DEFAULT",
            contextValue: "databricks.connection.connected",
            // Collapsed, so both connections fit the view; the details are a click away.
            collapsibleState: TreeItemCollapsibleState.Collapsed,
            command: { command: "databricks.connection.showConnectionMenu" },
        });
        expect((await section!.getChildren(row)).map((r) => [r.label, r.description])).toEqual([
            ["Host", A],
            ["User", "user Bearer dapi-default"],
            ["Auth type", "Personal Access Token"],
        ]);

        await kernel.connection.signOut();
        // Unity Gateway is signed out too: no rows, so the view's sign-in welcome shows.
        expect(await section!.getChildren()).toEqual([]);
    });

    it("shows the workspace ID under the host, which on a unified host doesn't name the workspace", () => {
        const U = "https://u.databricks.com";
        const s = {
            status: "connected",
            connection: {
                host: U,
                workspaceId: "1234",
                profile: "dev",
                userName: "me",
                authType: "pat",
                source: { kind: "saved" },
            },
        } as ConnectionState;
        expect(workspaceConnectionDetails(s).map((r) => [r.label, r.description])).toEqual([
            ["Host", U],
            ["Workspace", "1234"],
            ["User", "me"],
            ["Auth type", "Personal Access Token"],
        ]);
        expect(statusBarContent(s).tooltip).toContain(`Host: ${U}\nWorkspace: 1234\nUser: me`);
    });

    it("shows the workspace signed out beside a Unity Gateway connection, with why under it, and signs in from the row", () => {
        const signedOut: ConnectionState = { status: "signedOut", reason: "You signed out." };
        expect(workspaceConnectionRows(signedOut)).toEqual([]);
        const section = new WorkspaceConnectionSection(
            new MutableState<ConnectionState>(signedOut),
            () => undefined,
            new MutableState<ConnectionState>({ status: "connecting" }),
        );
        const [row] = section.getChildren();
        expect(row).toMatchObject({
            label: "Workspace connection",
            description: "Not signed in",
            iconPath: { id: "sign-in" },
            contextValue: "databricks.connection.signedOut",
            collapsibleState: TreeItemCollapsibleState.Expanded,
            command: { command: "databricks.connection.configureLogin" },
        });
        expect(section.getChildren(row)).toMatchObject([
            { label: "You signed out.", iconPath: { id: "info" } },
        ]);
    });

    it("shows the workspace signed out in a project even alone, for the target's reason, and asks for a profile when several match", () => {
        const ambiguous: ConnectionState = {
            status: "signedOut",
            reason: `Profiles a and b both match ${A}.`,
            candidates: ["a", "b"],
        };
        expect(workspaceConnectionRows(ambiguous, "dev")).toMatchObject([
            {
                description: "Select a profile",
                contextValue: "databricks.connection.signedOut.target",
            },
        ]);
        expect(workspaceConnectionDetails(ambiguous)).toMatchObject([
            { label: `Profiles a and b both match ${A}.` },
        ]);
    });

    it("spins while connecting, and shows why it can't connect in the row's hover, with nothing under the row", () => {
        expect(
            workspaceConnectionRows({ status: "connecting", profile: "dev", host: A }),
        ).toMatchObject([
            {
                label: "Workspace connection",
                description: "dev · Connecting…",
                contextValue: "databricks.connection.connecting",
            },
        ]);
        expect(workspaceConnectionRows({ status: "connecting" })[0]?.description).toBe(
            "Connecting…",
        );
        const failed: ConnectionState = {
            status: "error",
            profile: "dev",
            host: A,
            error: new Error("Invalid token\nRun databricks auth login"),
        };
        const [row] = workspaceConnectionRows(failed);
        expect(row).toMatchObject({
            label: "Workspace connection",
            description: "dev · Can't connect",
            tooltip: `Can't connect to ${A}\nInvalid token\nRun databricks auth login`,
            contextValue: "databricks.connection.error",
            command: { command: "databricks.connection.showConnectionMenu" },
        });
        expect(row?.collapsibleState).toBeUndefined();
        expect(workspaceConnectionDetails(failed)).toEqual([]);
        expect(workspaceConnectionRows({ ...failed, remedy: "signInAgain" })[0]?.contextValue).toBe(
            "databricks.connection.error.signInAgain",
        );
    });

    it("gives each state's row its own id, so VS Code applies each one's collapsible state when it first shows it", () => {
        const connected = {
            status: "connected",
            connection: { host: A, profile: "dev", authType: "pat", userName: "me" },
        } as ConnectionState;
        const ids = [
            workspaceConnectionRows({ status: "connecting", profile: "dev" })[0]?.id,
            workspaceConnectionRows({ status: "error", profile: "dev", error: new Error("x") })[0]
                ?.id,
            workspaceConnectionRows(connected)[0]?.id,
            workspaceConnectionRows({ status: "signedOut", reason: "x" }, undefined, true)[0]?.id,
        ];
        expect(new Set(ids).size).toBe(4);
    });

    it("says why a connection that fails by itself can't connect, once per failure, with the row's remedy", async () => {
        const expired =
            "Error: refresh token is invalid. Run databricks auth login --profile DEFAULT";
        const { kernel, settled, registered } = setup(
            `[DEFAULT]\nhost = ${A}\nauth_type = databricks-cli\n`,
        );
        kernel.runner.on(["auth", "token"], { exitCode: 1, stderr: expired });
        startFeatures(registered);
        kernel.start();
        await settled();
        const notice = {
            message: `Can't login with config profile DEFAULT: ${expired}`,
            actions: ["Sign in again"],
        };
        expect(vscode.errors).toEqual([notice]);

        // The config file read again fails the same way: no second notice.
        await kernel.connection.profiles.refresh("test");
        await settled();
        expect(kernel.runner.argv.filter((a) => a[1] === "token")).toHaveLength(2);
        expect(vscode.errors).toEqual([notice]);
    });

    it("says the bundled CLI wasn't found, in the row and the notice, rather than Node's spawn error", async () => {
        const { kernel, settled, registered } = setup(
            `[DEFAULT]\nhost = ${A}\nauth_type = databricks-cli\n`,
        );
        const bundled = FAKE_CLI_PATH;
        const error = Object.assign(new Error(`spawn ${bundled} ENOENT`), {
            code: "ENOENT",
            path: bundled,
        });
        kernel.runner.on(["auth", "token"], () => {
            throw error;
        });
        startFeatures(registered);
        kernel.start();
        await settled();
        const reason = `The Databricks CLI wasn't found at ${bundled}. Reinstall the extension.`;
        // No "Sign in again": signing in can't fix a missing file.
        expect(vscode.errors).toEqual([
            { message: `Can't login with config profile DEFAULT: ${reason}`, actions: [] },
        ]);
        expect(workspaceConnectionRows(kernel.connection.state.value)[0]?.tooltip).toContain(
            reason,
        );
    });

    it("says the override's path wasn't found, and to fix the setting, in the notice", async () => {
        const override = "/opt/databricks-missing";
        const { kernel, settled, registered } = setup(
            `[DEFAULT]\nhost = ${A}\nauth_type = databricks-cli\n`,
            { "databricks.overrideDatabricksCLIPath": override },
        );
        const error = Object.assign(new Error(`spawn ${override} ENOENT`), {
            code: "ENOENT",
            path: override,
        });
        kernel.runner.on(["auth", "token"], () => {
            throw error;
        });
        startFeatures(registered);
        kernel.start();
        await settled();
        expect(vscode.errors).toEqual([
            {
                message: `Can't login with config profile DEFAULT: The Databricks CLI wasn't found at ${override}. Fix the path in databricks.overrideDatabricksCLIPath.`,
                actions: [],
            },
        ]);
    });

    it("warns at startup, in a release build too, when the override's path doesn't exist", async () => {
        const override = "/opt/databricks-missing";
        const { registered } = setup(undefined, {
            "databricks.overrideDatabricksCLIPath": override,
        });
        startFeatures(registered);
        await vi.waitFor(() =>
            expect(vscode.warnings).toEqual([
                {
                    message: `databricks.overrideDatabricksCLIPath is set to ${override}, but no file exists there. Fix the path, or clear the setting to use the bundled CLI.`,
                    actions: ["Ok"],
                },
            ]),
        );
    });

    it("doesn't say an override that's a command name has no file: it's looked up on PATH", async () => {
        const { kernel, registered } = setup(undefined, {
            "databricks.overrideDatabricksCLIPath": "databricks",
        });
        startFeatures(registered);
        // It goes on to compare the override's version, as for any override that runs.
        await vi.waitFor(() =>
            expect(kernel.runner.calls.some((c) => c.args[0] === "version")).toBe(true),
        );
        await tick();
        expect(vscode.warnings.map((w) => w.message)).not.toContainEqual(
            expect.stringContaining("no file exists there"),
        );
    });

    const STRICT_SSL_WARNING =
        "databricks.proxy.strictSSL is no longer used. Set http.proxyStrictSSL instead.";
    const CA_CERT_WARNING =
        "databricks.proxy.caCert is no longer used. Add the CA to the OS trust store, or start VS Code with NODE_EXTRA_CA_CERTS set to its PEM file.";

    it.each([
        ["user", "globalValue"],
        ["workspace", "workspaceValue"],
        ["folder", "workspaceFolderValue"],
    ] as const)(
        "warns at startup when a deprecated proxy setting is set at %s scope",
        async (_name, scope) => {
            const { kernel, settled, registered } = setup(
                undefined,
                {},
                {
                    settings: settingsAt(scope, { "databricks.proxy.strictSSL": false }),
                },
            );
            startFeatures(registered);
            kernel.start();
            await settled();
            expect(vscode.warnings).toContainEqual({
                message: STRICT_SSL_WARNING,
                actions: ["Open Settings"],
            });
        },
    );

    it("names each deprecated proxy setting that is set, in one warning", async () => {
        const { registered } = setup(
            undefined,
            {},
            {
                settings: settingsAt("workspaceValue", {
                    "databricks.proxy.strictSSL": false,
                    "databricks.proxy.caCert": "/etc/corp-ca.pem",
                }),
            },
        );
        startFeatures(registered);
        await vi.waitFor(() =>
            expect(vscode.warnings).toContainEqual({
                message: `${STRICT_SSL_WARNING} ${CA_CERT_WARNING}`,
                actions: ["Open Settings"],
            }),
        );
    });

    it("doesn't warn about a deprecated proxy setting that is unset, null or empty", async () => {
        const { kernel, settled, registered } = setup(
            undefined,
            {},
            {
                settings: settingsAt("globalValue", {
                    "databricks.proxy.strictSSL": null,
                    "databricks.proxy.caCert": "",
                }),
            },
        );
        startFeatures(registered);
        kernel.start();
        await settled();
        expect(vscode.warnings.map((w) => w.message)).not.toContainEqual(
            expect.stringContaining("databricks.proxy."),
        );
    });

    it("opens the databricks.proxy settings from the warning's Open Settings action", async () => {
        const { registered } = setup(
            undefined,
            {},
            {
                settings: settingsAt("globalValue", {
                    "databricks.proxy.caCert": "/etc/corp-ca.pem",
                }),
            },
        );
        vscode.nextMessageChoice = "Open Settings";
        startFeatures(registered);
        await vi.waitFor(() =>
            expect(vscode.executed).toContainEqual({
                command: "workbench.action.openSettings",
                args: ["databricks.proxy"],
            }),
        );
    });

    it("opens no settings when the warning is dismissed", async () => {
        const { registered } = setup(
            undefined,
            {},
            {
                settings: settingsAt("globalValue", {
                    "databricks.proxy.caCert": "/etc/corp-ca.pem",
                }),
            },
        );
        startFeatures(registered);
        await vi.waitFor(() => expect(vscode.warnings).toHaveLength(1));
        await tick();
        expect(vscode.executed.map((e) => e.command)).not.toContain(
            "workbench.action.openSettings",
        );
    });

    it("says at once why the host can't be reached, and Retry connects once it answers", async () => {
        const { kernel, http, settled, registered } = setup(
            `[DEFAULT]\nhost = ${A}\ntoken = dapi-default\n`,
        );
        let reachable = false;
        http.on("GET", SCIM_ME, () => {
            if (!reachable) {
                throw fetchFailed("ENOTFOUND");
            }
            return { body: { userName: "me" } };
        });
        let choose!: (choice: string) => void;
        vscode.nextErrorChoice = new Promise<string>((resolve) => (choose = resolve));
        startFeatures(registered);
        kernel.start();
        await settled();
        expect(kernel.connection.state.value.status).toBe("error");
        // One try: another gets the same answer.
        expect(http.to(SCIM_ME)).toHaveLength(1);
        expect(vscode.errors).toEqual([
            {
                message:
                    "Can't login with config profile DEFAULT: Can't reach a.cloud.databricks.com: the host name doesn't resolve. Check the host, or your network.",
                actions: ["Retry"],
            },
        ]);

        reachable = true;
        choose("Retry");
        await when(kernel.connection.state, (s) => s.status === "connected");
        expect(vscode.errors).toHaveLength(1);
    });

    it("says why again when Retry still can't reach the host", async () => {
        const { kernel, http, settled, registered } = setup(
            `[DEFAULT]\nhost = ${A}\ntoken = dapi-default\n`,
        );
        http.on("GET", SCIM_ME, () => {
            throw fetchFailed("ECONNREFUSED");
        });
        let choose!: (choice: string) => void;
        vscode.nextErrorChoice = new Promise<string>((resolve) => (choose = resolve));
        startFeatures(registered);
        kernel.start();
        await settled();
        expect(vscode.errors).toHaveLength(1);

        choose("Retry");
        // The next notice is dismissed.
        vscode.nextErrorChoice = undefined;
        await vi.waitFor(() => expect(vscode.errors).toHaveLength(2));
        expect(vscode.errors[1]).toEqual({
            message:
                "Can't login with config profile DEFAULT: Can't reach a.cloud.databricks.com: the connection was refused. Check the host, or your network.",
            actions: ["Retry"],
        });
        expect(http.to(SCIM_ME)).toHaveLength(2);
    });

    it("retries the window's connection as it is now, when the window moved to another profile after the notice", async () => {
        const { kernel, http, settled, registered } = setup(
            `[DEFAULT]\nhost = ${A}\ntoken = dapi-default\n\n[other]\nhost = ${A}\ntoken = dapi-other\n`,
        );
        http.on("GET", SCIM_ME, (req) => {
            if (req.headers.get("Authorization") === "Bearer dapi-default") {
                throw fetchFailed("ENOTFOUND");
            }
            return { status: 403, body: { error_code: "PERMISSION_DENIED", message: "Denied." } };
        });
        let choose!: (choice: string) => void;
        vscode.nextErrorChoice = new Promise<string>((resolve) => (choose = resolve));
        startFeatures(registered);
        kernel.start();
        await settled();
        expect(vscode.errors).toHaveLength(1);

        await kernel.connection.useProfile("other");
        choose("Retry");
        // The next notice is dismissed.
        vscode.nextErrorChoice = undefined;
        await vi.waitFor(() => expect(vscode.errors).toHaveLength(2));
        expect(vscode.errors[1]).toEqual({
            message: "Can't login with config profile other: Denied.",
            actions: [],
        });
    });

    it("counts a failure by its profile, host and remedy, not its text", async () => {
        const token = `[DEFAULT]\nhost = ${A}\ntoken = dapi-default\n`;
        const { kernel, file, http, settled, registered } = setup(token);
        let request = 0;
        http.on("GET", SCIM_ME, () => ({
            status: 403,
            body: { error_code: "PERMISSION_DENIED", message: `Denied. [ReqId: ${++request}]` },
        }));
        kernel.runner.on(["auth", "token"], {
            exitCode: 1,
            stderr: "Error: refresh token is invalid.",
        });
        startFeatures(registered);
        kernel.start();
        await settled();
        const reread = async (content: string) => {
            fs.writeFileSync(file, content);
            await kernel.connection.profiles.refresh("test");
            await settled();
        };
        // A new request ID each time: still the same failure.
        await reread(token);
        // Another failure, then the first again: only the new one says why.
        await reread(`[DEFAULT]\nhost = ${A}\nauth_type = databricks-cli\n`);
        await reread(token);

        expect(request).toBe(3);
        expect(vscode.errors).toEqual([
            {
                message: "Can't login with config profile DEFAULT: Denied. [ReqId: 1]",
                actions: [],
            },
            {
                message:
                    "Can't login with config profile DEFAULT: Error: refresh token is invalid.",
                actions: ["Sign in again"],
            },
        ]);
    });

    it("says so again when the same failure comes back after the window had connected", async () => {
        const cli = `[DEFAULT]\nhost = ${A}\nauth_type = databricks-cli\n`;
        const { kernel, file, settled, registered } = setup(cli);
        kernel.runner.on(["auth", "token"], {
            exitCode: 1,
            stderr: "Error: refresh token is invalid.",
        });
        startFeatures(registered);
        kernel.start();
        await settled();
        expect(vscode.errors).toHaveLength(1);

        fs.writeFileSync(file, `[DEFAULT]\nhost = ${A}\ntoken = dapi-default\n`);
        await kernel.connection.profiles.refresh("test");
        await when(kernel.connection.state, (s) => s.status === "connected");
        fs.writeFileSync(file, cli);
        await kernel.connection.profiles.refresh("test");
        await when(kernel.connection.state, (s) => s.status === "error");
        expect(vscode.errors).toHaveLength(2);
    });

    it("leaves a sign-in the user started to its own error", async () => {
        const { kernel, settled, registered } = setup();
        kernel.runner.on(["auth", "token"], {
            exitCode: 1,
            stderr: "Error: refresh token is invalid.",
        });
        startFeatures(registered);
        kernel.start();
        await settled();
        expect(await kernel.connection.useProfile("dev")).toMatchObject({ status: "error" });
        expect(vscode.errors).toEqual([]);
    });

    it("signs in again from the row of an expired session, then reconnects", async () => {
        const { kernel, settled, run } = setup();
        let tokens = 0;
        kernel.runner.on(["auth", "token"], () =>
            ++tokens === 1
                ? {
                      exitCode: 1,
                      stderr: "Error: refresh token is invalid. Run databricks auth login --profile dev",
                  }
                : {
                      stdout: JSON.stringify({
                          access_token: "u2m",
                          expiry: new Date(Date.now() + 3600_000).toISOString(),
                      }),
                  },
        );
        kernel.runner.on(["auth", "login"], {});
        kernel.start();
        await settled();
        await kernel.connection.useProfile("dev");
        expect(kernel.connection.state.value).toMatchObject({
            status: "error",
            remedy: "signInAgain",
        });

        await run("databricks.connection.signInAgain");

        expect(kernel.runner.argv.filter((a) => a[1] === "login")).toEqual([
            expect.arrayContaining(["auth", "login", "--profile", "dev"]),
        ]);
        expect(kernel.connection.connection?.profile).toBe("dev");
    });

    it("opens the wizard from Sign in again when the session isn't expired after all", async () => {
        const { kernel, settled, run } = setup();
        kernel.start();
        await settled();

        const signIn = run("databricks.connection.signInAgain");
        await vi.waitFor(() => expect(vscode.quickInputs).toHaveLength(1));
        lastInput().hide();
        await signIn;
        expect(kernel.runner.argv.filter((a) => a[1] === "login")).toEqual([]);
    });

    it("names the host when there's no profile, as in a session window", () => {
        const state = {
            status: "connected",
            connection: { host: A, authType: "pat", userName: "me" },
        } as ConnectionState;

        expect(workspaceConnectionRows(state)[0]).toMatchObject({
            label: "Workspace connection",
            description: A,
            tooltip: `Signed in to ${A} with the SSH tunnel's credentials`,
        });
    });

    it("puts the switch, sign-out and sign-in-again actions, with icons, on the rows they fit, outside a session window", () => {
        const manifest: {
            contributes: {
                commands: { command: string; icon?: string; title: string }[];
                menus: Record<string, { command?: string; when?: string; group?: string }[]>;
            };
        } = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../../package.json"), "utf-8"));
        const inline = (manifest.contributes.menus["view/item/context"] ?? []).filter((m) =>
            m.when?.startsWith("view == signInView "),
        );
        const command = (id?: string) =>
            manifest.contributes.commands.find((c) => c.command === id);
        const matched = (when: string | undefined) => {
            const [, source] = /viewItem =~ \/((?:[^/\\]|\\.)*)\//.exec(when ?? "") ?? [];
            const re = new RegExp(source ?? "^$");
            return [
                "databricks.connection.signedOut",
                "databricks.connection.connected",
                "databricks.connection.connecting",
                "databricks.connection.error",
                "databricks.connection.error.signInAgain",
                "databricks.connection.connected.target",
                "databricks.connection.error.target",
                "databricks.connection.error.signInAgain.target",
                "databricks.connection.error.selectWorkspace",
                "databricks.connection.error.selectWorkspace.target",
                "databricks.connection.unityGateway.signedOut",
                "databricks.connection.unityGateway.connected",
                "databricks.connection.unityGateway.connecting",
                "databricks.connection.unityGateway.error",
                "databricks.connection.unityGateway.error.signInAgain",
                "databricks.connection.unityGateway.error.selectWorkspace",
            ].filter((c) => re.test(c));
        };

        expect(
            inline.map((m) => [
                m.command,
                m.group,
                command(m.command)?.title,
                command(m.command)?.icon,
            ]),
        ).toEqual([
            ["databricks.connection.signInAgain", "inline@0", "Sign in again", "$(refresh)"],
            [
                "databricks.connection.selectWorkspace",
                "inline@0",
                "Select a workspace",
                "$(list-selection)",
            ],
            [
                "databricks.connection.switchWorkspace",
                "inline@1",
                "Switch workspace",
                "$(arrow-swap)",
            ],
            ["databricks.connection.switchProfile", "inline@1", "Switch profile", "$(arrow-swap)"],
            ["databricks.connection.logout", "inline@2", "Sign out", "$(sign-out)"],
            ["databricks.unityGateway.signInAgain", "inline@0", "Sign in again", "$(refresh)"],
            [
                "databricks.unityGateway.selectWorkspace",
                "inline@0",
                "Select a workspace",
                "$(list-selection)",
            ],
            [
                "databricks.unityGateway.switchWorkspace",
                "inline@1",
                "Switch Unity Gateway workspace",
                "$(arrow-swap)",
            ],
            [
                "databricks.unityGateway.signOut",
                "inline@2",
                "Sign out of Unity Gateway",
                "$(sign-out)",
            ],
        ]);
        expect(inline.map((m) => matched(m.when))).toEqual([
            [
                "databricks.connection.error.signInAgain",
                "databricks.connection.error.signInAgain.target",
            ],
            // A profile signed in to the account only: select one of its workspaces.
            [
                "databricks.connection.error.selectWorkspace",
                "databricks.connection.error.selectWorkspace.target",
            ],
            // Not beside "Select a workspace": the row's menu still has the switch.
            [
                "databricks.connection.connected",
                "databricks.connection.error",
                "databricks.connection.error.signInAgain",
            ],
            // In a project the target decides the workspace, so the switch only changes the profile.
            [
                "databricks.connection.connected.target",
                "databricks.connection.error.target",
                "databricks.connection.error.signInAgain.target",
            ],
            // Sign-out on every failed row too, as Unity Gateway's, so a failed connection can be left.
            [
                "databricks.connection.connected",
                "databricks.connection.error",
                "databricks.connection.error.signInAgain",
                "databricks.connection.connected.target",
                "databricks.connection.error.target",
                "databricks.connection.error.signInAgain.target",
                "databricks.connection.error.selectWorkspace",
                "databricks.connection.error.selectWorkspace.target",
            ],
            ["databricks.connection.unityGateway.error.signInAgain"],
            ["databricks.connection.unityGateway.error.selectWorkspace"],
            // Unity Gateway's switch and sign-out, also when it can't connect; the switch not beside "Select a workspace".
            [
                "databricks.connection.unityGateway.connected",
                "databricks.connection.unityGateway.error",
                "databricks.connection.unityGateway.error.signInAgain",
            ],
            [
                "databricks.connection.unityGateway.connected",
                "databricks.connection.unityGateway.error",
                "databricks.connection.unityGateway.error.signInAgain",
                "databricks.connection.unityGateway.error.selectWorkspace",
            ],
        ]);
        for (const m of inline.filter((i) => i.command?.startsWith("databricks.connection."))) {
            expect(m.when).toContain("!databricks.context.host.fixedIdentity");
        }
        for (const id of [
            "databricks.connection.switchWorkspace",
            "databricks.connection.switchProfile",
            "databricks.connection.signInAgain",
            "databricks.connection.selectWorkspace",
            "databricks.unityGateway.signInAgain",
            "databricks.unityGateway.selectWorkspace",
            "databricks.unityGateway.switchWorkspace",
        ]) {
            expect(manifest.contributes.menus["commandPalette"]).toContainEqual({
                command: id,
                when: "false",
            });
        }
    });

    it("signs out from a failed row, whose sign-out is enabled while the connection has failed", async () => {
        const { kernel, http, settled, registered, run } = setup(
            `[DEFAULT]\nhost = ${A}\ntoken = dapi-default\n`,
        );
        http.on("GET", SCIM_ME, () => {
            throw fetchFailed("ENOTFOUND");
        });
        const set = vi.spyOn(kernel.contextKeys, "set");
        startFeatures(registered);
        kernel.start();
        await settled();
        expect(kernel.connection.state.value.status).toBe("error");
        expect(set).toHaveBeenLastCalledWith(CONNECTION_FAILED, true);
        const manifest: { contributes: { commands: { command: string; enablement?: string }[] } } =
            JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../../package.json"), "utf-8"));
        expect(
            manifest.contributes.commands.find((c) => c.command === "databricks.connection.logout")
                ?.enablement,
        ).toContain(CONNECTION_FAILED.name);

        const requests = http.to(SCIM_ME).length;
        await run("databricks.connection.logout");
        // Signed out for good, as from a connected window: the failure doesn't retry.
        expect(kernel.connection.state.value).toMatchObject({
            status: "signedOut",
            reason: "You signed out.",
        });
        await kernel.connection.profiles.refresh("test");
        await tick();
        expect(kernel.connection.state.value.status).toBe("signedOut");
        expect(http.to(SCIM_ME)).toHaveLength(requests);
        expect(set).toHaveBeenLastCalledWith(CONNECTION_FAILED, false);
    });

    it("opens the menu from a notice's Retry that comes after the window connected, rather than doing nothing", async () => {
        const { kernel, http, settled, registered } = setup(
            `[DEFAULT]\nhost = ${A}\ntoken = dapi-default\n`,
        );
        let reachable = false;
        http.on("GET", SCIM_ME, () => {
            if (!reachable) {
                throw fetchFailed("ENOTFOUND");
            }
            return { body: { userName: "me" } };
        });
        let choose!: (choice: string) => void;
        vscode.nextErrorChoice = new Promise<string>((resolve) => (choose = resolve));
        startFeatures(registered);
        kernel.start();
        await settled();
        expect(vscode.errors).toHaveLength(1);

        // The window connects by another route, then the notice's Retry is clicked.
        reachable = true;
        await kernel.connection.reconnect();
        expect(kernel.connection.state.value.status).toBe("connected");
        const offered: string[] = [];
        vscode.pickFrom = (items) => {
            offered.push(...items.map((i) => i.label));
            return undefined;
        };
        choose("Retry");
        await vi.waitFor(() =>
            expect(offered).toContain("$(file) Open Databricks configuration file"),
        );
        expect(offered).not.toContain("$(refresh) Reconnect");
        // Its Retry asks nothing again: the window is connected.
        expect(http.to(SCIM_ME)).toHaveLength(2);
    });

    it("switches workspace through the sign-in wizard, from the row's inline action", async () => {
        const { kernel, settled, run } = setup();
        kernel.start();
        await settled();

        const switching = run("databricks.connection.switchWorkspace");
        await vi.waitFor(() => expect(vscode.quickInputs).toHaveLength(1));
        lastInput().accept();
        await tick();
        lastInput().accept("dev");
        await switching;

        expect(kernel.connection.connection?.profile).toBe("dev");
    });

    it("signs out and stays signed out; signing in picks a profile for the host", async () => {
        const { kernel, settled, run } = setup();
        kernel.start();
        await settled();

        await run("databricks.connection.logout");
        expect(vscode.statusBarItems[0]!.text).toBe("$(account) Databricks: Sign in");
        // Signed out, one click on the status bar is the sign-in itself, not the menu.
        expect(vscode.statusBarItems[0]!.command).toMatchObject({
            command: "databricks.connection.configureLogin",
            arguments: ["statusBar"],
        });
        expect(kernel.state.get(NO_PROJECT_CHOICE)).toEqual({ signedOut: true });

        const signIn = run("databricks.connection.configureLogin");
        await vi.waitFor(() => expect(vscode.quickInputs).toHaveLength(1));
        // The host step preselects the host signed out of.
        expect(lastInput().activeItems[0]?.label).toBe(A);
        lastInput().accept();
        await tick();
        expect(labels(lastInput())).toEqual([
            "DEFAULT",
            "dev",
            "",
            "OAuth",
            "Personal Access Token",
            "",
            "Edit Databricks profiles",
        ]);
        lastInput().accept("dev");
        await signIn;
        expect(vscode.statusBarItems[0]!.text).toBe("Databricks: dev");
        expect(vscode.statusBarItems[0]!.command).toBe("databricks.connection.showConnectionMenu");
        expect(kernel.runner.argv).toContainEqual(["auth", "token", "--profile", "dev"]);
        expect(kernel.state.get(NO_PROJECT_CHOICE)).toEqual({ profile: "dev" });
    });

    it("records a sign-in started from the status bar with its source", async () => {
        const { kernel, settled, run, reporter } = setup();
        kernel.start();
        await settled();
        await run("databricks.connection.logout");

        const click = vscode.statusBarItems[0]!.command as {
            command: string;
            arguments: unknown[];
        };
        const signIn = run(click.command, ...click.arguments);
        await vi.waitFor(() => expect(vscode.quickInputs).toHaveLength(1));
        lastInput().accept();
        await tick();
        lastInput().accept("dev");
        await signIn;

        const manual = reporter.events.filter((e) => e.name === "manualLogin");
        expect(manual.map((e) => e.properties?.["event.source"])).toEqual(["statusBar"]);
    });

    it("starts the open wizard over on a second sign-in, and says sign-in is under way once it's closed", async () => {
        const { kernel, settled, run } = setup();
        kernel.start();
        await settled();
        let release!: () => void;
        kernel.runner.on(
            ["auth", "login"],
            () => new Promise((resolve) => (release = () => resolve({}))),
        );

        const first = run("databricks.connection.configureLogin");
        await vi.waitFor(() => expect(vscode.quickInputs).toHaveLength(1));
        lastInput().accept();
        await tick();
        const profiles = lastInput();
        const signIn = run("databricks.connection.configureLogin");
        // The first wizard ends quietly, and a new one starts at the host step.
        await expect(first).resolves.toBeUndefined();
        await vi.waitFor(() => expect(vscode.quickInputs).toHaveLength(3));
        expect(profiles.visible).toBe(false);
        expect(labels(lastInput())).toContain(A);
        expect(vscode.errors).toEqual([]);

        // Past the wizard, logging in through the browser: nothing to start over.
        lastInput().accept();
        await tick();
        lastInput().accept("OAuth");
        await tick();
        lastInput().type("fresh");
        lastInput().accept();
        await vi.waitFor(() => expect(kernel.runner.argv.some((a) => a[1] === "login")).toBe(true));
        await run("databricks.connection.configureLogin");
        expect(vscode.errors.map((e) => e.message)).toEqual([
            "Databricks: sign in is already in progress",
        ]);
        release();
        await signIn;
    });

    it("signs in via login.databricks.com: auth login without --host, then connects to the profile the CLI wrote", async () => {
        const { kernel, settled, run, file } = setup();
        kernel.start();
        await settled();
        await run("databricks.connection.logout");
        kernel.runner.on(["auth", "login"], () => {
            fs.appendFileSync(file, `\n[picked]\nhost = ${A}\nauth_type = databricks-cli\n`);
            return {};
        });
        const signIn = run("databricks.connection.configureLogin");
        await vi.waitFor(() => expect(vscode.quickInputs).toHaveLength(1));
        lastInput().accept("$(sign-in) Sign in via login.databricks.com");
        await tick();
        lastInput().type("picked");
        lastInput().accept();
        await signIn;
        expect(kernel.runner.argv).toContainEqual([
            "auth",
            "login",
            "--profile",
            "picked",
            "--timeout",
            "300s",
        ]);
        expect(vscode.statusBarItems[0]!.text).toBe("Databricks: picked");
    });

    it("offers one item to switch workspace or profile, outside a project, which opens the wizard on the current workspace", async () => {
        const { kernel, settled, run } = setup();
        kernel.start();
        await settled();
        let offered: string[] = [];
        vscode.pickFrom = (items) => {
            offered = items.map((i) => i.label);
            return items.find((i) => i.label === "$(arrow-swap) Switch workspace or profile");
        };
        const menu = run("databricks.connection.showConnectionMenu");
        await vi.waitFor(() => expect(vscode.quickInputs).toHaveLength(1));
        expect(offered).toEqual([
            "$(arrow-swap) Switch workspace or profile",
            "$(sign-out) Sign out",
            "$(file) Open Databricks configuration file",
        ]);
        expect(lastInput().placeholder).toContain("Databricks Host");
        expect(lastInput().activeItems[0]?.label).toBe(A);
        lastInput().hide();
        await menu;
    });

    it("switches to another profile on the current workspace: the item, Enter on the focused host, then the profile", async () => {
        // Another workspace's profile sorts first, so only the focus takes Enter to the current one.
        const { kernel, settled, run } = setup(
            `[Alpha]\nhost = https://b.cloud.databricks.com\nauth_type = databricks-cli\n\n` +
                `[DEFAULT]\nhost = ${A}\ntoken = dapi-default\n\n[dev]\nhost = ${A}\nauth_type = databricks-cli\n`,
        );
        kernel.start();
        await settled();
        expect(kernel.connection.connection?.profile).toBe("DEFAULT");
        vscode.pickFrom = (items) =>
            items.find((i) => i.label === "$(arrow-swap) Switch workspace or profile");
        const menu = run("databricks.connection.showConnectionMenu");
        await vi.waitFor(() => expect(vscode.quickInputs).toHaveLength(1));
        // The host step, with the current workspace focused: Enter takes it.
        expect(lastInput().placeholder).toContain("Databricks Host");
        lastInput().accept();
        await tick();
        // The profiles for that workspace, the other one among them.
        expect(lastInput().placeholder).toBe("Select authentication method");
        expect(lastInput().items.map((i) => i.label)).toContain("dev");
        lastInput().accept("dev");
        await menu;
        await settled();
        expect(kernel.connection.connection?.profile).toBe("dev");
    });

    it("signs in with no name when the config file has only [__settings__], and names the profile DEFAULT", async () => {
        const { kernel, settled, run, file } = setup("[__settings__]\ndefault_profile = gone\n");
        kernel.start();
        await settled();
        kernel.runner.on(["auth", "login"], () => {
            fs.appendFileSync(file, `\n[DEFAULT]\nhost = ${A}\nauth_type = databricks-cli\n`);
            return {};
        });
        const signIn = run("databricks.connection.configureLogin");
        await vi.waitFor(() => expect(vscode.quickInputs).toHaveLength(1));
        lastInput().accept("$(sign-in) Sign in via login.databricks.com");
        await signIn;
        expect(kernel.runner.argv).toContainEqual([
            "auth",
            "login",
            "--profile",
            "DEFAULT",
            "--timeout",
            "300s",
        ]);
    });

    it("creates a PAT profile through databricks configure, with the token on stdin", async () => {
        const { kernel, settled, run, file } = setup();
        kernel.start();
        await settled();
        kernel.runner.on(["configure"], (_args, options) => {
            fs.appendFileSync(file, `\n[new]\nhost = ${A}\ntoken = ${options.input!.trim()}\n`);
            return {};
        });
        const signIn = run("databricks.connection.configureLogin");
        await vi.waitFor(() => expect(vscode.quickInputs).toHaveLength(1));
        lastInput().accept();
        await tick();
        lastInput().accept("Personal Access Token");
        await tick();
        lastInput().type("new");
        lastInput().accept();
        await tick();
        expect(lastInput().password).toBe(true);
        lastInput().type("dapi-typed");
        lastInput().accept();
        await signIn;
        const call = kernel.runner.calls.find((c) => c.args[0] === "configure")!;
        expect(call.args).toEqual(["configure", "--host", A, "--profile", "new"]);
        expect(call.options.input).toBe("dapi-typed\n");
        expect(call.options.env?.DATABRICKS_CONFIG_FILE).toBe(file);
        expect(vscode.statusBarItems[0]!.text).toBe("Databricks: new");
    });

    it("checks a new PAT before saving it: a token that fails writes nothing and keeps the connection, and Retry checks it again", async () => {
        const { kernel, settled, run, file, http } = setup();
        let valid = false;
        http.on("GET", SCIM_ME, (req) => {
            if (req.headers.get("Authorization") === "Bearer dapi-typed" && !valid) {
                return {
                    status: 401,
                    body: { error_code: "UNAUTHENTICATED", message: "Invalid access token" },
                };
            }
            return { body: { userName: `user ${req.headers.get("Authorization")}` } };
        });
        kernel.start();
        await settled();
        const before = fs.readFileSync(file, "utf8");
        kernel.runner.on(["configure"], (_args, options) => {
            fs.appendFileSync(file, `\n[new]\nhost = ${A}\ntoken = ${options.input!.trim()}\n`);
            return {};
        });
        let choose!: (choice: string) => void;
        vscode.nextErrorChoice = new Promise<string>((resolve) => (choose = resolve));
        const signIn = run("databricks.connection.configureLogin");
        await vi.waitFor(() => expect(vscode.quickInputs).toHaveLength(1));
        lastInput().accept();
        await tick();
        lastInput().accept("Personal Access Token");
        await tick();
        lastInput().type("new");
        lastInput().accept();
        await tick();
        lastInput().type("dapi-typed");
        lastInput().accept();
        await vi.waitFor(() => expect(vscode.errors).toHaveLength(1));

        expect(vscode.errors[0]!.message).toMatch(
            /^Can't login with the provided Personal Access Token: .*Invalid access token/,
        );
        expect(vscode.errors[0]!.actions).toEqual(["Retry"]);
        expect(kernel.runner.calls.find((c) => c.args[0] === "configure")).toBeUndefined();
        expect(fs.readFileSync(file, "utf8")).toBe(before);
        expect(kernel.connection.connection?.profile).toBe("DEFAULT");
        expect(kernel.connection.savedChoice()).toEqual({ profile: undefined, signedOut: false });

        valid = true;
        choose("Retry");
        await signIn;
        await vi.waitFor(() => expect(kernel.connection.connection?.profile).toBe("new"));
        expect(kernel.runner.calls.filter((c) => c.args[0] === "configure")).toHaveLength(1);
    });

    it("saveNewProfile copies the PAT connection through configure", async () => {
        const { kernel, settled, run } = setup();
        kernel.start();
        await settled();
        await run("databricks.connection.saveNewProfile", "NEW_PROFILE");
        const call = kernel.runner.calls.find((c) => c.args[0] === "configure")!;
        expect(call.args).toEqual(["configure", "--host", A, "--profile", "NEW_PROFILE"]);
        expect(call.options.input).toBe("dapi-default\n");
    });

    it("saveNewProfile fails with 'Must login first' for other connections", async () => {
        const { kernel, settled, run } = setup(
            `[DEFAULT]\nhost = ${A}\nauth_type = databricks-cli\n`,
        );
        kernel.start();
        await settled();
        await run("databricks.connection.saveNewProfile", "NEW_PROFILE");
        expect(vscode.errors[0]?.message).toBe(
            "Error running command databricks.connection.saveNewProfile: Must login first",
        );
    });

    it("opens the config file, creating it if missing", async () => {
        const { kernel, run } = setup();
        const file = path.join(path.dirname(kernel.configFile()), "missing", ".databrickscfg");
        kernel.settings.update(
            { section: "databricks", key: "overrideDatabricksConfigFile", defaultValue: "" },
            file,
            1,
        );
        await run("databricks.connection.openDatabricksConfigFile");
        expect(fs.existsSync(file)).toBe(true);
        expect(vscode.shownDocuments).toEqual([file]);
    });

    // Windows has no POSIX modes: Node reports every file there as 0o666.
    it.skipIf(process.platform === "win32")(
        "creates the missing config file readable only by the user, as the CLI does",
        async () => {
            const { kernel, run } = setup();
            const file = path.join(path.dirname(kernel.configFile()), "new", ".databrickscfg");
            kernel.settings.update(
                { section: "databricks", key: "overrideDatabricksConfigFile", defaultValue: "" },
                file,
                1,
            );
            await run("databricks.connection.openDatabricksConfigFile");
            // `databricks configure` then writes the token into it, and keeps an existing file's mode.
            expect(fs.statSync(file).mode & 0o777).toBe(0o600);
        },
    );

    it("names a config file it can't parse when signing in, and offers to open it", async () => {
        const { kernel, settled, run, file } = setup(
            `[DEFAULT]\nhost = ${A}\ntoken = dapi-default\nsome note\n`,
        );
        kernel.start();
        await settled();
        vscode.nextErrorChoice = "Open Databricks Config File";
        await run("databricks.connection.configureLogin");
        expect(vscode.quickInputs).toHaveLength(0);
        expect(vscode.errors).toEqual([
            {
                message: `Can't read the Databricks config file ${file}: key-value delimiter not found: some note`,
                actions: ["Open Databricks Config File"],
            },
        ]);
        await vi.waitFor(() => expect(vscode.shownDocuments).toEqual([file]));
    });

    it.skipIf(process.platform === "win32")(
        "leaves the mode of an existing config file alone",
        async () => {
            const { kernel, run, file } = setup();
            fs.chmodSync(file, 0o640);
            await run("databricks.connection.openDatabricksConfigFile");
            expect(fs.statSync(file).mode & 0o777).toBe(0o640);
            expect(fs.readFileSync(file, "utf8")).toContain("token = dapi-default");
            expect(vscode.shownDocuments).toEqual([kernel.configFile()]);
        },
    );

    it("records autoLogin once, and the connection states by their old names", async () => {
        const { kernel, settled, reporter } = setup();
        kernel.start();
        await settled();
        const names = reporter.events.map((e) => [
            e.name,
            e.properties?.["event.newState"] ?? e.properties?.["event.source"],
        ]);
        expect(names).toContainEqual(["autoLogin", "init"]);
        expect(names).toContainEqual(["connectionStateChanged", "CONNECTED"]);
    });

    it("whileConnected starts per connection and disposes on sign-out", async () => {
        const kernel = fakeKernel({
            env: { DATABRICKS_CONFIG_FILE: configFile(`[DEFAULT]\nhost = ${A}\ntoken = t\n`) },
            httpClient: new FakeHttpClient().on("GET", SCIM_ME, { body: { userName: "me" } }),
        });
        const events: string[] = [];
        registerFeatures(
            [
                {
                    id: "probe",
                    register: (ctx) =>
                        ctx.whileConnected((c) => {
                            events.push(`start ${c.profile}`);
                            return { dispose: () => events.push(`stop ${c.profile}`) };
                        }),
                },
            ],
            fakeFeatureHost(kernel).host,
        );
        kernel.start();
        await when(kernel.connection.state, (s) => s.status === "connected");
        await kernel.connection.signOut();
        expect(events).toEqual(["start DEFAULT", "stop DEFAULT"]);
    });

    describe("the certificate and proxy variables of each CLI call, as 2.22.0 gave them", () => {
        const probe = (
            cfg?: string,
            settings: Record<string, unknown> = {},
            extension?: KernelPlatform["extension"],
        ) =>
            setup(
                cfg,
                { ...PROBE_SETTINGS, ...settings },
                { env: PROBE_ENV, ...(extension !== undefined ? { extension } : {}) },
            );

        it("auth login: the host env, without http.proxy", async () => {
            const { kernel, settled, run, file } = probe();
            kernel.start();
            await settled();
            kernel.runner.on(["auth", "login"], () => {
                fs.appendFileSync(file, `\n[fresh]\nhost = ${A}\nauth_type = databricks-cli\n`);
                return {};
            });
            const signIn = run("databricks.connection.configureLogin");
            await vi.waitFor(() => expect(vscode.quickInputs).toHaveLength(1));
            lastInput().accept();
            await tick();
            lastInput().accept("OAuth");
            await tick();
            lastInput().type("fresh");
            lastInput().accept();
            await signIn;
            const login = kernel.runner.calls.find((c) => c.args[1] === "login");
            expect(environmentOf(login?.options.env)).toBe("inherited");
        });

        it("the auth token that renews a chosen OAuth profile: the host env, without http.proxy", async () => {
            const { kernel, host, settled } = probe();
            kernel.start();
            await settled();
            // DEFAULT is a PAT profile: the token call after this is the renewal's, not the connection's.
            const before = kernel.runner.calls.length;
            const chosen = host.registry.executeInternal(CHOOSE_PROFILE, undefined);
            await vi.waitFor(() => expect(vscode.quickInputs).toHaveLength(1));
            lastInput().accept();
            await tick();
            lastInput().accept("dev");
            await expect(chosen).resolves.toMatchObject({ profile: "dev" });
            const renewal = kernel.runner.calls.slice(before).find((c) => c.args[1] === "token");
            expect(renewal?.args).toEqual(["auth", "token", "--profile", "dev"]);
            expect(environmentOf(renewal?.options.env)).toBe("inherited");
        });

        it("configure for a new PAT profile: the host env with http.proxy over it", async () => {
            const { kernel, settled, run, file } = probe();
            kernel.start();
            await settled();
            kernel.runner.on(["configure"], (_args, options) => {
                fs.appendFileSync(file, `\n[new]\nhost = ${A}\ntoken = ${options.input!.trim()}\n`);
                return {};
            });
            const signIn = run("databricks.connection.configureLogin");
            await vi.waitFor(() => expect(vscode.quickInputs).toHaveLength(1));
            lastInput().accept();
            await tick();
            lastInput().accept("Personal Access Token");
            await tick();
            lastInput().type("new");
            lastInput().accept();
            await tick();
            lastInput().type("dapi-typed");
            lastInput().accept();
            await signIn;
            const call = kernel.runner.calls.find((c) => c.args[0] === "configure");
            expect(environmentOf(call?.options.env)).toBe("hostAndProxy");
        });

        it("configure from saveNewProfile: the host env with http.proxy over it", async () => {
            const { kernel, settled, run } = probe();
            kernel.start();
            await settled();
            await run("databricks.connection.saveNewProfile", "NEW_PROFILE");
            const call = kernel.runner.calls.find((c) => c.args[0] === "configure");
            expect(environmentOf(call?.options.env)).toBe("hostAndProxy");
        });

        it("the override CLI's version check: the CLI wrapper's curated env", async () => {
            const { kernel, registered } = probe(undefined, {
                "databricks.overrideDatabricksCLIPath": "databricks",
            });
            startFeatures(registered);
            await vi.waitFor(() =>
                expect(kernel.runner.calls.some((c) => c.args[0] === "version")).toBe(true),
            );
            const version = kernel.runner.calls.find((c) => c.args[0] === "version");
            expect(environmentOf(version?.options.env)).toBe("cli");
        });

        it("the bundled CLI's version check in a development build: the host env, without http.proxy", async () => {
            const dir = path.dirname(configFile(""));
            const asAbsolutePath = (p: string) => path.join(dir, p);
            fs.mkdirSync(path.join(dir, "bin"));
            fs.writeFileSync(bundledCliPath(asAbsolutePath), "");
            const { kernel, registered } = probe(
                undefined,
                {},
                {
                    ...fakeKernel().extension,
                    isDevelopment: true,
                    asAbsolutePath,
                },
            );
            startFeatures(registered);
            await vi.waitFor(() =>
                expect(kernel.runner.calls.some((c) => c.args[0] === "version")).toBe(true),
            );
            const version = kernel.runner.calls.find((c) => c.args[0] === "version");
            expect(environmentOf(version?.options.env)).toBe("inherited");
        });
    });
});

describe("the sign-in wizard's focus", () => {
    beforeEach(() => vscode.reset());
    const B = "https://b.cloud.databricks.com";
    const cfg = `[DEFAULT]\nhost = ${A}\ntoken = dapi-default\n\n[ug]\nhost = ${B}\ntoken = dapi-ug\n`;

    it("focuses the host and profile a caller asks for, and the window's host otherwise", async () => {
        const { kernel, host, settled, run } = setup(cfg);
        kernel.start();
        await settled();

        const asked = host.registry.executeInternal(CHOOSE_PROFILE, { host: B, profile: "ug" });
        await vi.waitFor(() => expect(vscode.quickInputs).toHaveLength(1));
        expect(lastInput().activeItems[0]?.label).toBe(B);
        lastInput().accept();
        await tick();
        expect(lastInput().activeItems[0]?.label).toBe("ug");
        lastInput().hide();
        await expect(asked).resolves.toBeUndefined();

        const before = vscode.quickInputs.length;
        const fallback = host.registry.executeInternal(CHOOSE_PROFILE, undefined);
        await vi.waitFor(() => expect(vscode.quickInputs.length).toBeGreaterThan(before));
        expect(lastInput().activeItems[0]?.label).toBe(A);
        lastInput().accept();
        await tick();
        expect(lastInput().activeItems).toEqual([]);
        lastInput().hide();
        await expect(fallback).resolves.toBeUndefined();

        // The window's own switch is unchanged: its host step focuses the window's host.
        const beforeSwitch = vscode.quickInputs.length;
        const switching = run("databricks.connection.switchWorkspace");
        await vi.waitFor(() => expect(vscode.quickInputs.length).toBeGreaterThan(beforeSwitch));
        await tick();
        expect(lastInput().activeItems[0]?.label).toBe(A);
        lastInput().hide();
        await switching.catch(() => undefined);
    });
});

describe("runSignInWizard", () => {
    beforeEach(() => vscode.reset());
    /** The step and total the current input shows. */
    const numbers = () => [lastInput().step, lastInput().totalSteps];
    const UNIFIED = "https://u.databricks.com";
    const unified = async () => ({ hostType: "unified", accountId: "acc-1" });
    /** A profile on another host, so a sign-in names its profile and the name step stays. */
    const ELSEWHERE: ProfileInfo[] = [
        {
            name: "elsewhere",
            host: "https://elsewhere.cloud.databricks.com",
            authType: "databricks-cli",
            profile: {},
        },
    ];
    const profiles: ProfileInfo[] = [
        { name: "DEFAULT", host: A, authType: "pat", profile: {} },
        {
            name: "other",
            host: "https://b.cloud.databricks.com",
            authType: "databricks-cli",
            profile: {},
        },
    ];

    it("lists the current host, DATABRICKS_HOST and the hosts of profiles together, then the browser sign-in", async () => {
        const choice = runSignInWizard({
            profiles,
            envHost: "https://env.cloud.databricks.com",
            preselectHost: "https://b.cloud.databricks.com/",
            openPatPage: () => {},
        });
        await tick();
        expect(lastInput().placeholder).toBe(
            'Databricks Host (should begin with https://), or choose "Sign in via login.databricks.com"',
        );
        expect(lastInput().items.map((i) => [i.label, i.detail])).toEqual([
            ["https://b.cloud.databricks.com", "Profiles: other"],
            ["https://env.cloud.databricks.com", "DATABRICKS_HOST environment variable"],
            [A, "Profiles: DEFAULT"],
            ["", undefined],
            [
                "$(sign-in) Sign in via login.databricks.com",
                "Don't know your workspace URL? Pick your workspace in the browser",
            ],
        ]);
        expect(lastInput().items[3]?.kind).toBe(QuickPickItemKind.Separator);
        expect(lastInput().activeItems[0]?.label).toBe("https://b.cloud.databricks.com");
        lastInput().accept();
        await tick();
        expect(lastInput().items[0]).toMatchObject({
            label: "other",
            detail: "Select existing profile and authenticate using OAuth",
        });
        lastInput().accept("other");
        expect(await choice).toMatchObject({ kind: "existing", profile: { name: "other" } });
    });

    describe("finding a profile by name in the host step", () => {
        const HOSTLESS = "$(sign-in) Sign in via login.databricks.com";
        const shown = () =>
            lastInput()
                .shownItems()
                .map((i) => i.label);

        it("finds a profile whatever the case of its name, and opens its workspace", async () => {
            const choice = runSignInWizard({ profiles, openPatPage: () => {} });
            await tick();
            lastInput().type("OTHER");
            await tick();
            expect(shown()).toEqual(["https://b.cloud.databricks.com"]);
            expect(lastInput().items.map((i) => i.label)).not.toContain("OTHER");
            expect(lastInput().activeItems[0]?.label).toBe("https://b.cloud.databricks.com");
            lastInput().accept();
            await tick();
            expect(labels(lastInput())).toContain("other");
            lastInput().hide();
            await expect(choice).rejects.toMatchObject({ name: "CancelledError" });
        });

        it("doesn't search detail text: a word from the browser sign-in's detail finds nothing", async () => {
            const choice = runSignInWizard({ profiles, openPatPage: () => {} });
            await tick();
            expect(lastInput().matchOnDetail).toBe(false);
            for (const word of ["workspace", "browser"]) {
                lastInput().type(word);
                await tick();
                expect(shown()).not.toContain(HOSTLESS);
            }
            lastInput().hide();
            await expect(choice).rejects.toMatchObject({ name: "CancelledError" });
        });

        it("shows the refusal for an exact name with no workspace, not a longer name's row", async () => {
            const choice = runSignInWizard({
                profiles: [
                    {
                        name: "bare-ws",
                        host: "https://b.cloud.databricks.com",
                        authType: "pat",
                        profile: {},
                    },
                    { name: "bare", profile: {} },
                ],
                openPatPage: () => {},
            });
            await tick();
            lastInput().type("bare");
            await tick();
            expect(shown()).toEqual(["bare"]);
            expect(lastInput().items[0]).toMatchObject({
                label: "bare",
                error: true,
                detail: "$(error) bare is a profile with no workspace to pick. Type the workspace's URL instead.",
            });
            lastInput().accept("bare");
            await tick();
            expect(lastInput().visible).toBe(true);
            lastInput().hide();
            await expect(choice).rejects.toMatchObject({ name: "CancelledError" });
        });

        it("focuses an exact name's workspace, whichever of two longer and exact names comes first", async () => {
            const choice = runSignInWizard({
                profiles: [
                    {
                        name: "dev-ws",
                        host: "https://b.cloud.databricks.com",
                        authType: "pat",
                        profile: {},
                    },
                    {
                        name: "dev",
                        host: "https://c.cloud.databricks.com",
                        authType: "pat",
                        profile: {},
                    },
                ],
                openPatPage: () => {},
            });
            await tick();
            lastInput().type("dev");
            await tick();
            expect(lastInput().activeItems[0]?.label).toBe("https://c.cloud.databricks.com");
            expect(shown()).toEqual(["https://c.cloud.databricks.com"]);
            lastInput().hide();
            await expect(choice).rejects.toMatchObject({ name: "CancelledError" });
        });

        it("refuses an exact name with no workspace, though a workspace URL contains the name", async () => {
            const choice = runSignInWizard({
                profiles: [
                    {
                        name: "dev-ws",
                        host: "https://dev-ws.cloud.databricks.com",
                        authType: "pat",
                        profile: {},
                    },
                    { name: "dev", profile: {} },
                ],
                openPatPage: () => {},
            });
            await tick();
            lastInput().type("dev");
            await tick();
            expect(lastInput().items[0]).toMatchObject({
                label: "dev",
                error: true,
                detail: "$(error) dev is a profile with no workspace to pick. Type the workspace's URL instead.",
            });
            expect(lastInput().items.map((i) => i.label)).toEqual(["dev"]);
            expect(shown()).not.toContain("https://dev-ws.cloud.databricks.com");
            expect(lastInput().activeItems[0]?.label).toBe("dev");
            lastInput().accept("dev");
            await tick();
            expect(lastInput().visible).toBe(true);
            lastInput().hide();
            await expect(choice).rejects.toMatchObject({ name: "CancelledError" });
        });

        it("prefers a profile whose name has the typed case, over one whose name differs only in case", async () => {
            const choice = runSignInWizard({
                profiles: [
                    { name: "dev", profile: {} },
                    {
                        name: "Dev",
                        host: "https://dev.cloud.databricks.com",
                        authType: "pat",
                        profile: {},
                    },
                ],
                openPatPage: () => {},
            });
            await tick();
            lastInput().type("Dev");
            await tick();
            expect(lastInput().activeItems[0]?.label).toBe("https://dev.cloud.databricks.com");
            expect(lastInput().items.some((i) => i.error === true)).toBe(false);
            lastInput().hide();
            await expect(choice).rejects.toMatchObject({ name: "CancelledError" });
        });

        it("takes a typed URL as a host, though a profile with no host is named exactly like it", async () => {
            const URL = "https://dev-ws.cloud.databricks.com";
            const choice = runSignInWizard({
                profiles: [{ name: URL, profile: {} }],
                openPatPage: () => {},
            });
            await tick();
            lastInput().type(URL);
            await tick();
            expect(lastInput().items[0]).toMatchObject({ label: URL });
            expect(lastInput().items.some((i) => i.error === true)).toBe(false);
            lastInput().hide();
            await expect(choice).rejects.toMatchObject({ name: "CancelledError" });
        });

        it("takes a typed URL as that host, though a profile named like it has another workspace", async () => {
            const URL = "https://dev-ws.cloud.databricks.com";
            const choice = runSignInWizard({
                profiles: [
                    {
                        name: URL,
                        host: "https://other.cloud.databricks.com",
                        authType: "pat",
                        profile: {},
                    },
                ],
                openPatPage: () => {},
            });
            await tick();
            lastInput().type(URL);
            await tick();
            expect(shown()).toEqual([URL]);
            expect(lastInput().items[0]?.label).toBe(URL);
            lastInput().hide();
            await expect(choice).rejects.toMatchObject({ name: "CancelledError" });
        });

        it("trims the typed name, so 'dev ' is refused as 'dev' and never taken as a host", async () => {
            const choice = runSignInWizard({
                profiles: [{ name: "dev", profile: {} }],
                openPatPage: () => {},
            });
            await tick();
            lastInput().type("dev ");
            await tick();
            expect(lastInput().items[0]).toMatchObject({
                error: true,
                detail: "$(error) dev is a profile with no workspace to pick. Type the workspace's URL instead.",
            });
            expect(lastInput().items.some((i) => i.label.includes("https://dev"))).toBe(false);
            lastInput().hide();
            await expect(choice).rejects.toMatchObject({ name: "CancelledError" });
        });

        it("trims the typed name before finding a profile's workspace row", async () => {
            const choice = runSignInWizard({
                profiles: [
                    {
                        name: "devx",
                        host: "https://devx.cloud.databricks.com",
                        authType: "pat",
                        profile: {},
                    },
                    {
                        name: "dev",
                        host: "https://dev.cloud.databricks.com",
                        authType: "pat",
                        profile: {},
                    },
                ],
                openPatPage: () => {},
            });
            await tick();
            lastInput().type("dev ");
            await tick();
            expect(lastInput().activeItems[0]?.label).toBe("https://dev.cloud.databricks.com");
            lastInput().hide();
            await expect(choice).rejects.toMatchObject({ name: "CancelledError" });
        });

        it("names the profile on DATABRICKS_HOST, which has its own row", async () => {
            const ENV = "https://env.cloud.databricks.com";
            const choice = runSignInWizard({
                profiles: [{ name: "envprof", host: ENV, authType: "pat", profile: {} }],
                envHost: ENV,
                openPatPage: () => {},
            });
            await tick();
            expect(lastInput().items[0]?.detail).toBe(
                "DATABRICKS_HOST environment variable. Profiles: envprof",
            );
            lastInput().type("envprof");
            await tick();
            expect(shown()).toEqual([ENV]);
            expect(lastInput().activeItems[0]?.label).toBe(ENV);
            lastInput().hide();
            await expect(choice).rejects.toMatchObject({ name: "CancelledError" });
        });

        it("takes the profile's workspace over a host whose label has the same text", async () => {
            const choice = runSignInWizard({
                profiles: [
                    {
                        name: "yy",
                        host: "https://zeta.cloud.databricks.com",
                        authType: "pat",
                        profile: {},
                    },
                    {
                        name: "zeta",
                        host: "https://y.cloud.databricks.com",
                        authType: "pat",
                        profile: {},
                    },
                ],
                openPatPage: () => {},
            });
            await tick();
            lastInput().type("zeta");
            await tick();
            expect(shown()).toHaveLength(2);
            expect(shown()).toContain("https://y.cloud.databricks.com");
            expect(lastInput().activeItems[0]?.label).toBe("https://y.cloud.databricks.com");
            lastInput().hide();
            await expect(choice).rejects.toMatchObject({ name: "CancelledError" });
        });

        it("refuses a profile name with no workspace to pick, for a profile with no host and for an account API", async () => {
            const choice = runSignInWizard({
                profiles: [
                    { name: "bare", profile: {} },
                    {
                        name: "acct",
                        host: "https://accounts.cloud.databricks.com",
                        authType: "pat",
                        profile: {},
                    },
                ],
                openPatPage: () => {},
            });
            await tick();
            for (const [name, message] of [
                [
                    "bare",
                    "bare is a profile with no workspace to pick. Type the workspace's URL instead.",
                ],
                [
                    "acct",
                    "acct is a profile with no workspace to pick. Type the workspace's URL instead.",
                ],
            ] as const) {
                lastInput().type(name);
                await tick();
                expect(lastInput().items[0]).toMatchObject({
                    label: name,
                    detail: `$(error) ${message}`,
                    error: true,
                });
                lastInput().accept(name);
                await tick();
                expect(lastInput().visible).toBe(true);
            }
            lastInput().hide();
            await expect(choice).rejects.toMatchObject({ name: "CancelledError" });
        });
    });

    describe("step numbers", () => {
        it("counts a sign-in with the host step as 3 steps: host, auth method, profile name", async () => {
            const choice = runSignInWizard({
                profiles: ELSEWHERE,
                envHost: A,
                openPatPage: () => {},
            });
            await tick();
            expect(numbers()).toEqual([1, 3]);
            lastInput().accept(A);
            await tick();
            expect(numbers()).toEqual([2, 3]);
            lastInput().accept("OAuth (recommended)");
            await tick();
            expect(numbers()).toEqual([3, 3]);
            lastInput().type("fresh");
            lastInput().accept();
            await choice;
        });

        it("counts a PAT sign-in one step longer, for the token", async () => {
            const choice = runSignInWizard({
                profiles: ELSEWHERE,
                envHost: A,
                openPatPage: () => {},
            });
            await tick();
            lastInput().accept(A);
            await tick();
            lastInput().accept("Personal Access Token");
            await tick();
            expect(numbers()).toEqual([3, 4]);
            lastInput().type("fresh");
            lastInput().accept();
            await tick();
            expect(numbers()).toEqual([4, 4]);
            lastInput().type("dapi");
            lastInput().accept();
            await choice;
        });

        it("counts a unified host's workspace step in the sign-in, and the name after it", async () => {
            const choice = runSignInWizard({
                profiles: ELSEWHERE,
                envHost: UNIFIED,
                openPatPage: () => {},
                hostMetadata: unified,
                openExternal: () => {},
            });
            await tick();
            lastInput().accept(UNIFIED);
            await tick();
            expect(numbers()).toEqual([2, 3]);
            lastInput().accept("OAuth (recommended)");
            await tick();
            expect(lastInput().title).toBe("Select a workspace");
            expect(numbers()).toEqual([3, 4]);
            lastInput().accept("Enter a workspace ID or URL…");
            await tick();
            expect(numbers()).toEqual([3, 4]);
            lastInput().type("1234");
            lastInput().accept();
            await tick();
            expect(numbers()).toEqual([4, 4]);
            lastInput().type("fresh");
            lastInput().accept();
            await choice;
        });

        it("offers no token on a unified host: OAuth and existing profiles only", async () => {
            const choice = runSignInWizard({
                profiles: ELSEWHERE,
                envHost: UNIFIED,
                openPatPage: () => {},
                hostMetadata: unified,
                openExternal: () => {},
            });
            await tick();
            lastInput().accept(UNIFIED);
            await tick();
            expect(lastInput().items.map((i) => i.label)).toEqual([
                "OAuth (recommended)",
                "",
                "Edit Databricks profiles",
            ]);
            lastInput().accept("OAuth (recommended)");
            await tick();
            lastInput().accept("Enter a workspace ID or URL…");
            await tick();
            lastInput().type("1234");
            lastInput().accept();
            await tick();
            lastInput().type("fresh");
            lastInput().accept();
            await choice;
        });

        it("shows the choices busy while the host's metadata loads, and keeps the token once it's given up on", async () => {
            vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
            try {
                const choice = runSignInWizard({
                    profiles: ELSEWHERE,
                    envHost: A,
                    openPatPage: () => {},
                    hostMetadata: () => new Promise(() => {}),
                    openExternal: () => {},
                });
                await tick();
                lastInput().accept(A);
                await tick();
                expect(lastInput().busy).toBe(true);
                vi.advanceTimersByTime(3_000);
                await tick();
                expect(lastInput().busy).toBe(false);
                expect(lastInput().items.map((i) => i.label)).toContain("Personal Access Token");
                lastInput().hide();
                await choice.catch(() => undefined);
            } finally {
                vi.useRealTimers();
            }
        });

        it("keeps the token on a host that isn't unified", async () => {
            const choice = runSignInWizard({
                profiles: ELSEWHERE,
                envHost: A,
                openPatPage: () => {},
                hostMetadata: async () => ({ hostType: "workspace" }),
                openExternal: () => {},
            });
            await tick();
            lastInput().accept(A);
            await tick();
            expect(lastInput().items.map((i) => i.label)).toContain("Personal Access Token");
            lastInput().accept("Personal Access Token");
            await tick();
            lastInput().type("fresh");
            lastInput().accept();
            await tick();
            lastInput().type("dapi");
            lastInput().accept();
            await choice;
        });

        it("counts the workspace step after the auth method when the host is known", async () => {
            const choice = runSignInWizard({
                profiles: ELSEWHERE,
                host: UNIFIED,
                openPatPage: () => {},
                hostMetadata: unified,
                openExternal: () => {},
            });
            await tick();
            expect(numbers()).toEqual([1, 2]);
            lastInput().accept("OAuth (recommended)");
            await tick();
            expect(lastInput().title).toBe("Select a workspace");
            expect(numbers()).toEqual([2, 3]);
            lastInput().accept("Enter a workspace ID or URL…");
            await tick();
            lastInput().type("1234");
            lastInput().accept();
            await tick();
            expect(numbers()).toEqual([3, 3]);
            lastInput().type("fresh");
            lastInput().accept();
            await choice;
        });

        it("counts a host-less sign-in as the host step, then the name", async () => {
            const choice = runSignInWizard({ profiles: ELSEWHERE, openPatPage: () => {} });
            await tick();
            expect(numbers()).toEqual([1, 3]);
            lastInput().accept("$(sign-in) Sign in via login.databricks.com");
            await tick();
            expect(numbers()).toEqual([2, 2]);
            lastInput().accept();
            await choice;
        });

        it("counts 'Select a workspace' on its own: the choice, then a new profile's name", async () => {
            const selecting = chooseWorkspace({
                host: UNIFIED,
                profile: "DEFAULT",
                profiles: [
                    {
                        name: "DEFAULT",
                        host: UNIFIED,
                        authType: "databricks-cli",
                        profile: {},
                        accountId: "acc-1",
                    },
                ],
                accountId: "acc-1",
                // Two, so neither is picked by itself.
                workspaces: Promise.resolve([
                    { id: "1234", name: "dev" },
                    { id: "5678", name: "prod" },
                ]),
                openExternal: () => {},
            });
            await tick();
            expect(numbers()).toEqual([1, 2]);
            lastInput().accept("Enter a workspace ID or URL…");
            await tick();
            expect(numbers()).toEqual([1, 2]);
            lastInput().type("1234");
            lastInput().accept();
            await tick();
            // Not creating a profile: the choice is the whole thing.
            await selecting;
        });

        it("counts a new profile's name on 'Select a workspace' as the second step", async () => {
            const selecting = chooseWorkspace({
                host: UNIFIED,
                profile: "DEFAULT",
                profiles: [
                    {
                        name: "DEFAULT",
                        host: UNIFIED,
                        authType: "databricks-cli",
                        profile: {},
                        accountId: "acc-1",
                    },
                ],
                accountId: "acc-1",
                // Two, so neither is picked by itself.
                workspaces: Promise.resolve([
                    { id: "1234", name: "dev" },
                    { id: "5678", name: "prod" },
                ]),
                openExternal: () => {},
            });
            await tick();
            lastInput().accept("Create a new profile instead…");
            await tick();
            lastInput().type("1234");
            lastInput().accept();
            await tick();
            expect(numbers()).toEqual([2, 2]);
            lastInput().accept();
            await selecting;
        });
    });

    it("leaves profiles for account APIs out of the host and profile steps, but keeps their names taken", async () => {
        const ACCOUNTS = "https://accounts.cloud.databricks.com";
        const choice = runSignInWizard({
            profiles: [
                { name: "acct", host: ACCOUNTS, authType: "pat", profile: {} },
                { name: "DEFAULT", host: A, authType: "pat", profile: {} },
            ],
            openPatPage: () => {},
        });
        await tick();
        expect(lastInput().items.map((i) => i.detail)).not.toContain("Profiles: acct");
        expect(labels(lastInput())).not.toContain(ACCOUNTS);
        lastInput().accept(A);
        await tick();
        expect(labels(lastInput())).toContain("DEFAULT");
        expect(labels(lastInput())).not.toContain("acct");
        lastInput().accept("OAuth");
        await tick();
        lastInput().type("acct");
        lastInput().accept();
        await tick();
        expect(lastInput().validationMessage).toMatchObject({
            message: "Profile acct already exists",
        });
        lastInput().hide();
        await expect(choice).rejects.toMatchObject({ name: "CancelledError" });
    });

    it("skips the host step when the host is known, and recommends OAuth when no profile matches", async () => {
        const choice = runSignInWizard({
            profiles,
            host: "https://new.cloud.databricks.com",
            openPatPage: () => {},
        });
        await tick();
        expect([lastInput().step, lastInput().totalSteps]).toEqual([1, 2]);
        expect(labels(lastInput())).toEqual([
            "OAuth (recommended)",
            "Personal Access Token",
            "",
            "Edit Databricks profiles",
        ]);
        lastInput().accept("OAuth (recommended)");
        await tick();
        lastInput().accept();
        await tick();
        expect(lastInput().validationMessage).toMatchObject({
            message: "Profile name cannot be empty",
        });
        lastInput().type("DEFAULT");
        lastInput().accept();
        await tick();
        expect(lastInput().validationMessage).toMatchObject({
            message: "Profile DEFAULT already exists",
        });
        lastInput().type("fresh");
        lastInput().accept();
        expect(await choice).toEqual({
            kind: "oauth",
            host: "https://new.cloud.databricks.com",
            workspaceId: undefined,
            profile: "fresh",
        });
    });

    it("highlights the first workspace when there's no current one, so Enter doesn't start a browser sign-in", async () => {
        const choice = runSignInWizard({ profiles, openPatPage: () => {} });
        await tick();
        expect(lastInput().items.map((i) => i.label)).toEqual([
            A,
            "https://b.cloud.databricks.com",
            "",
            "$(sign-in) Sign in via login.databricks.com",
        ]);
        expect(lastInput().activeItems[0]?.label).toBe(A);
        lastInput().hide();
        await expect(choice).rejects.toThrow(expect.objectContaining({ name: "CancelledError" }));
    });

    describe("with no profile on the machine", () => {
        it("shows the host step as 1 of 2, and saves DEFAULT without a name step when the login goes through login.databricks.com", async () => {
            // The browser login isn't a wizard step, so the count is the host path's.
            const choice = runSignInWizard({ profiles: [], openPatPage: () => {} });
            await tick();
            expect(numbers()).toEqual([1, 2]);
            lastInput().accept();
            expect(await choice).toEqual({ kind: "oauth", profile: "DEFAULT" });
        });

        it("saves the first profile under the target's workspace.profile name, when it's set", async () => {
            const choice = runSignInWizard({
                profiles: [],
                targetProfile: "ws-target",
                openPatPage: () => {},
            });
            await tick();
            lastInput().accept();
            expect(await choice).toEqual({ kind: "oauth", profile: "ws-target" });
        });

        it("falls back to DEFAULT when the target's name fails the name prompt's check, as a dotted name does", async () => {
            const choice = runSignInWizard({
                profiles: [],
                targetProfile: "my.profile",
                openPatPage: () => {},
            });
            await tick();
            lastInput().accept();
            expect(await choice).toEqual({ kind: "oauth", profile: "DEFAULT" });
        });

        it("keeps the name prompt when a profile exists, prefilled with the target's name, not its workspace.profile", async () => {
            const choice = runSignInWizard({
                profiles: ELSEWHERE,
                suggestedName: "dev",
                targetProfile: "ws-target",
                openPatPage: () => {},
            });
            await tick();
            lastInput().accept("$(sign-in) Sign in via login.databricks.com");
            await tick();
            expect(lastInput().title).toBe("Enter a name for the new profile");
            expect(lastInput().value).toBe("dev");
            lastInput().hide();
            await expect(choice).rejects.toMatchObject({ name: "CancelledError" });
        });

        it("counts a host's sign-in as the host and auth method steps, then no name", async () => {
            const choice = runSignInWizard({ profiles: [], openPatPage: () => {} });
            await tick();
            lastInput().type(A);
            await tick();
            lastInput().accept(A);
            await tick();
            expect(numbers()).toEqual([2, 2]);
            lastInput().accept("OAuth (recommended)");
            expect(await choice).toEqual({
                kind: "oauth",
                host: A,
                workspaceId: undefined,
                profile: "DEFAULT",
            });
        });

        it("counts a PAT's token as one step after the auth method, with DEFAULT as the profile", async () => {
            const choice = runSignInWizard({ profiles: [], envHost: A, openPatPage: () => {} });
            await tick();
            lastInput().accept(A);
            await tick();
            lastInput().accept("Personal Access Token");
            await tick();
            expect(lastInput().title).toBe("Enter Personal Access Token");
            expect(numbers()).toEqual([3, 3]);
            lastInput().type("dapi");
            lastInput().accept();
            expect(await choice).toEqual({
                kind: "pat",
                host: A,
                profile: "DEFAULT",
                token: "dapi",
            });
        });

        it("counts a unified host's workspace step as the last, with no name after it", async () => {
            const choice = runSignInWizard({
                profiles: [],
                openPatPage: () => {},
                hostMetadata: unified,
                openExternal: () => {},
            });
            await tick();
            lastInput().type(UNIFIED);
            await tick();
            lastInput().accept(UNIFIED);
            await tick();
            lastInput().accept("OAuth (recommended)");
            await vi.waitFor(() => expect(lastInput().title).toBe("Select a workspace"));
            expect(numbers()).toEqual([3, 3]);
            lastInput().accept("Enter a workspace ID or URL…");
            await tick();
            lastInput().type("1234");
            lastInput().accept();
            expect(await choice).toEqual({
                kind: "oauth",
                host: UNIFIED,
                workspaceId: "1234",
                profile: "DEFAULT",
                workspaceSelection: "typed",
            });
        });
    });

    it("suggests a generated name for a host-less sign-in when DEFAULT is taken", async () => {
        const choice = runSignInWizard({ profiles, openPatPage: () => {} });
        await tick();
        lastInput().accept("$(sign-in) Sign in via login.databricks.com");
        await tick();
        expect(lastInput().value).toMatch(/^dev-[0-9a-f]{8}$/);
        lastInput().accept();
        expect(await choice).not.toHaveProperty("host");
    });

    it("throws CancelledError when dismissed", async () => {
        const choice = runSignInWizard({ profiles, openPatPage: () => {} });
        await tick();
        lastInput().hide();
        await expect(choice).rejects.toMatchObject({ name: "CancelledError" });
    });
});

describe("statusBarContent", () => {
    it("shows Sign in when signed out, with the reason", () => {
        const s: ConnectionState = { status: "signedOut", reason: "You signed out." };
        expect(statusBarContent(s)).toEqual({
            text: "$(account) Databricks: Sign in",
            tooltip: "Not signed in. You signed out.",
        });
    });

    it("shows the profile and the error", () => {
        const s: ConnectionState = {
            status: "error",
            profile: "dev",
            host: A,
            error: new Error("expired"),
        };
        expect(statusBarContent(s)).toEqual({
            text: "$(warning) Databricks: dev",
            tooltip: `Can't connect to ${A}\nexpired`,
        });
    });

    it("says what to do when a session's token is rejected", () => {
        const s: ConnectionState = {
            status: "error",
            host: A,
            error: new Error("Invalid access token."),
            remedy: "restartSession",
        };
        expect(statusBarContent(s).tooltip).toBe(
            `Can't connect to ${A}\nInvalid access token.\nThe session's token may have expired. Close this window and start the SSH tunnel again from a local window.`,
        );
    });
});

describe("the Connection view's rows and the project's target", () => {
    it("re-reads the workspace row when the target is cleared, while signed out", () => {
        const signedOut: ConnectionState = { status: "signedOut", reason: "You signed out." };
        const target = new MutableState<string | undefined>("dev");
        const section = new WorkspaceConnectionSection(
            new MutableState<ConnectionState>(signedOut),
            () => ({ target: target.value }),
            undefined,
            target,
        );
        const changed = vi.fn();
        section.onDidChange(changed);
        expect(section.getChildren()).toHaveLength(1);

        target.set(undefined);

        expect(changed).toHaveBeenCalledTimes(1);
        expect(section.getChildren()).toEqual([]);
    });
});

describe("unityGatewayConnectionRows", () => {
    const B = "https://b.cloud.databricks.com";
    const connected = (profile: string, host = A) =>
        ({
            status: "connected",
            connection: { host, profile, userName: "me", authType: "pat" },
        }) as ConnectionState;
    const failed: ConnectionState = {
        status: "error",
        profile: "ug",
        host: B,
        error: new Error("Invalid token"),
    };
    const signedOut: ConnectionState = { status: "signedOut", reason: "You signed out." };
    const section = (gateway: ConnectionState, workspace: ConnectionState) =>
        new UnityGatewayConnectionSection(new MutableState(gateway), new MutableState(workspace));

    it("shows Unity Gateway's profile, even the workspace's own, collapsed over its details, and opens its menu", () => {
        const [row] = unityGatewayConnectionRows(connected("ug", B), connected("DEFAULT"));
        expect(row).toMatchObject({
            label: "Unity Gateway connection",
            description: "ug",
            tooltip: `Signed in to ${B} with profile ug`,
            contextValue: "databricks.connection.unityGateway.connected",
            collapsibleState: TreeItemCollapsibleState.Collapsed,
            command: { command: "databricks.unityGateway.showMenu" },
        });
        expect(
            section(connected("ug", B), connected("DEFAULT"))
                .getChildren(row)
                .map((r) => [r.label, r.description]),
        ).toEqual([
            ["Host", B],
            ["User", "me"],
            ["Auth type", "Personal Access Token"],
        ]);
        expect(
            unityGatewayConnectionRows(connected("DEFAULT"), connected("DEFAULT")),
        ).toMatchObject([{ label: "Unity Gateway connection", description: "DEFAULT" }]);
        expect(
            unityGatewayConnectionRows(
                { status: "connecting", profile: "ug" },
                connected("DEFAULT"),
            ),
        ).toMatchObject([{ label: "Unity Gateway connection", description: "ug · Connecting…" }]);
    });

    it("offers the Unity Gateway sign-in while it's signed out", () => {
        expect(unityGatewayConnectionRows(signedOut, connected("DEFAULT"))).toMatchObject([
            {
                label: "Unity Gateway connection",
                description: "Not signed in",
                contextValue: "databricks.connection.unityGateway.signedOut",
                command: { command: "databricks.unityGateway.signIn" },
            },
        ]);
    });

    it("shows a Unity Gateway connection that can't connect, with the reason in its hover and nothing under it", () => {
        const [row] = unityGatewayConnectionRows(failed, connected("DEFAULT"));
        expect(row).toMatchObject({
            label: "Unity Gateway connection",
            description: "ug · Can't connect",
            tooltip: `Can't connect to ${B}\nInvalid token`,
            contextValue: "databricks.connection.unityGateway.error",
            command: { command: "databricks.unityGateway.showMenu" },
        });
        expect(row?.collapsibleState).toBeUndefined();
        expect(section(failed, connected("DEFAULT")).getChildren(row)).toEqual([]);
        expect(
            unityGatewayConnectionRows(
                { ...failed, remedy: "signInAgain" },
                connected("DEFAULT"),
            )[0]?.contextValue,
        ).toBe("databricks.connection.unityGateway.error.signInAgain");
    });

    it("shows beside a signed-out workspace, and nothing while both are signed out outside a project, so the view's sign-in welcome shows", () => {
        expect(unityGatewayConnectionRows(signedOut, signedOut)).toEqual([]);
        // In a project the workspace row shows for its reason, and this one beside it.
        expect(unityGatewayConnectionRows(signedOut, signedOut, "dev")).toMatchObject([
            { label: "Unity Gateway connection", description: "Not signed in" },
        ]);
        expect(unityGatewayConnectionRows(connected("ug", B), signedOut)).toMatchObject([
            { description: "ug" },
        ]);
        expect(unityGatewayConnectionRows(failed, signedOut)).toHaveLength(1);
        // Its "Not signed in" says it all: no reason under it, unlike the workspace's.
        const [row] = unityGatewayConnectionRows(signedOut, connected("DEFAULT"));
        expect(row?.description).toBe("Not signed in");
        expect(row?.collapsibleState).toBeUndefined();
    });

    it("gives each state's row its own id, apart from the workspace's", () => {
        const ids = [
            ...[signedOut, { status: "connecting" } as const, failed, connected("ug", B)].map(
                (state) => unityGatewayConnectionRows(state, connected("DEFAULT"))[0]?.id,
            ),
            ...workspaceConnectionRows(connected("DEFAULT")).map((r) => r.id),
        ];
        expect(new Set(ids).size).toBe(5);
    });
});
