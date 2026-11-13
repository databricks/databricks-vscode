/**
 * The real bootstrap against the `vscode` stand-in: what `activate()` wires
 * between the kernel and VS Code, which the feature tests' fakes replace.
 */
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { activate } from "./extension";
import { LOG_FILE_NAME, type LogEntry } from "./platform/log";
import { toUserMetadata } from "./kernel/telemetry/userMetadata";
import { deactivateContext, fakeExtensionContext } from "./test-support/fakeExtensionContext";
import { stubDatabricksApi } from "./test-support/fakeDatabricksApi";
import { FakeMsPython } from "./test-support/fakeMsPython";
import {
    SERVERLESS_INTERPRETER,
    SERVERLESS_SESSION_ENV,
    SESSION_HOST,
    SESSION_REMOTE_NAME,
    SESSION_TOKEN,
} from "./test-support/sessionEnv";
import { useTempDirs } from "./test-support/tempDir";
import { env as vscodeEnv, host as vscode } from "./test-support/vscode";

const telemetry = vi.hoisted(() => ({
    events: [] as { name: string; properties: Record<string, string> }[],
}));

// It loads `vscode` itself, which exists only in the host.
vi.mock("@vscode/extension-telemetry", () => ({
    TelemetryReporter: class {
        readonly telemetryLevel = "all";
        sendTelemetryEvent(name: string, properties: Record<string, string> = {}) {
            telemetry.events.push({ name, properties });
        }
        sendTelemetryErrorEvent() {}
        dispose() {
            return Promise.resolve();
        }
    },
}));

const A = "https://a.cloud.databricks.com";
const TOKEN = "dapi0123456789abcdef-SECRET";
const tempDir = useTempDirs();

const run = (id: string, ...args: unknown[]) =>
    vscode.commands.get(id)!(...args) as Promise<unknown>;
/** The connection's status-bar item of the live activation. */
const statusBar = () =>
    vscode.statusBarItems.find((i) => i.id === "databricks.connection" && !i.disposed);
const logEntries = (context: ReturnType<typeof fakeExtensionContext>): LogEntry[] =>
    fs
        .readFileSync(path.join(context.logUri.fsPath, LOG_FILE_NAME), "utf8")
        .split("\n")
        .filter((line) => line !== "")
        .map((line) => JSON.parse(line) as LogEntry);

/** The `user.*` properties of the next `commandExecution`, once the connection has set them. */
async function userOfNextEvent(): Promise<Record<string, string>> {
    let user: Record<string, string> = {};
    await vi.waitFor(async () => {
        await run("databricks.logs.openFolder");
        const event = telemetry.events.at(-1)!;
        expect(event.name).toBe("commandExecution");
        user = Object.fromEntries(
            Object.entries(event.properties).filter(([k]) => k.startsWith("user.")),
        );
        expect(user).not.toEqual({});
    });
    return user;
}

/** Activates with a PAT profile, connected as alice@example.com. */
async function activateConnected() {
    process.env.DATABRICKS_CONFIG_FILE = tempDir().write(
        ".databrickscfg",
        `[DEFAULT]\nhost = ${A}\ntoken = ${TOKEN}\n`,
    );
    await stubDatabricksApi(async () =>
        Response.json(
            { userName: "alice@example.com" },
            { headers: { "x-databricks-org-id": "1234" } },
        ),
    );
    const context = fakeExtensionContext(tempDir().dir);
    activate(context as never);
    await vi.waitFor(() => expect(statusBar()?.text).toBe("Databricks: DEFAULT"));
    return context;
}

describe("activate", () => {
    const saved = { ...process.env };
    beforeEach(() => {
        vscode.reset();
        telemetry.events.length = 0;
        for (const name of [
            "DATABRICKS_HOST",
            "DATABRICKS_TOKEN",
            "DATABRICKS_CONFIG_PROFILE",
            "DATABRICKS_REMOTE_ENV",
        ]) {
            delete process.env[name];
        }
        process.env.DATABRICKS_CONFIG_FILE = "/nonexistent/.databrickscfg";
    });
    afterEach(() => {
        process.env = { ...saved };
        vi.unstubAllGlobals();
    });

    it("activates again in the same process once the first activation is disposed", async () => {
        const first = fakeExtensionContext(tempDir().dir);
        expect(activate(first as never)?.version).toBe(2);
        await vi.waitFor(() => expect(statusBar()?.text).toBe("$(account) Databricks: Sign in"));
        // A local window lacks nothing: every host key is false.
        expect(
            vscode.executed
                .filter((e) => e.command === "setContext")
                .map((e) => e.args as [string, unknown])
                .filter(([key]) => key.startsWith("databricks.context.host."))
                .every(([, value]) => value === false),
        ).toBe(true);
        const commands = [...vscode.commands.keys()].sort();
        const views = [...vscode.treeDataProviders.keys()].sort();
        expect(commands.length).toBeGreaterThan(50);

        deactivateContext(first);
        expect(vscode.commands.size).toBe(0);
        // The stand-in keeps a tree view's provider after `dispose()`; the view records it.
        expect(
            [...vscode.treeViews].filter(([, view]) => !view.disposed).map(([id]) => id),
        ).toEqual([]);
        expect(
            [...vscode.treeDataProviders.keys()].filter((id) => !vscode.treeViews.has(id)),
        ).toEqual([]);
        expect(vscode.chatProviders.size).toBe(0);
        expect(vscode.statusBarItems.filter((i) => !i.disposed).map((i) => i.text)).toEqual([]);

        const second = fakeExtensionContext(tempDir().dir);
        expect(activate(second as never)?.version).toBe(2);
        await vi.waitFor(() => expect(statusBar()?.text).toBe("$(account) Databricks: Sign in"));
        expect([...vscode.commands.keys()].sort()).toEqual(commands);
        expect([...vscode.treeDataProviders.keys()].sort()).toEqual(views);
        expect(vscode.errors).toEqual([]);
        await vi.waitFor(() =>
            expect(logEntries(second).some((e) => e.message.startsWith("Activated"))).toBe(true),
        );
        expect(logEntries(second).filter((e) => e.level === "error")).toEqual([]);
        deactivateContext(second);
    });

    it("tags events with the hashed user name and the workspace's host name, as the old extension did", async () => {
        const context = await activateConnected();
        const expectedUser = toUserMetadata({ userName: "alice@example.com", host: A });
        expect(await userOfNextEvent()).toEqual({
            "user.hashedUserName": expectedUser.hashedUserName,
            // The old extension sent `URL.host`, without the scheme; the dashboards group by it.
            "user.host": "a.cloud.databricks.com",
            "user.workspaceId": "1234",
            "user.authType": "pat",
        });
        deactivateContext(context);
    });

    it("tags the events recorded as the connection comes up with the user", async () => {
        const context = await activateConnected();
        const firstEvent = (name: string, property: string, value: string) =>
            telemetry.events.find((e) => e.name === name && e.properties[property] === value)
                ?.properties;
        expect(firstEvent("connectionStateChanged", "event.newState", "CONNECTED")).toHaveProperty(
            "user.hashedUserName",
        );
        expect(firstEvent("autoLogin", "event.success", "true")).toHaveProperty(
            "user.hashedUserName",
        );
        deactivateContext(context);
    });

    it("stops tagging events with the user once signed out, as the old extension did", async () => {
        const context = await activateConnected();
        expect(await userOfNextEvent()).toHaveProperty("user.hashedUserName");

        await run("databricks.connection.logout");
        expect(statusBar()?.text).toBe("$(account) Databricks: Sign in");
        await run("databricks.logs.openFolder");
        const event = telemetry.events.at(-1)!;
        expect(event.name).toBe("commandExecution");
        expect(Object.keys(event.properties).filter((k) => k.startsWith("user."))).toEqual([]);
        deactivateContext(context);
    });

    it("clears the user when signed out as soon as the connection is announced", async () => {
        process.env.DATABRICKS_CONFIG_FILE = tempDir().write(
            ".databrickscfg",
            `[DEFAULT]\nhost = ${A}\ntoken = ${TOKEN}\n`,
        );
        await stubDatabricksApi(async () => Response.json({ userName: "alice@example.com" }));
        const context = fakeExtensionContext(tempDir().dir);
        const api = activate(context as never)!;
        // Signs out as soon as the connection is announced: the user just set must be cleared.
        api.onDidChangeConnection(() => {
            if (api.connection !== undefined) {
                void run("databricks.connection.logout");
            }
        });
        await vi.waitFor(() => expect(statusBar()?.text).toBe("$(account) Databricks: Sign in"));
        await new Promise((r) => setTimeout(r, 200));
        await run("databricks.logs.openFolder");
        const event = telemetry.events.at(-1)!;
        expect(event.name).toBe("commandExecution");
        expect(Object.keys(event.properties).filter((k) => k.startsWith("user."))).toEqual([]);
        deactivateContext(context);
    });

    it("writes the profile's token nowhere: not the log file, the state or telemetry", async () => {
        process.env.DATABRICKS_CONFIG_FILE = tempDir().write(
            ".databrickscfg",
            `[DEFAULT]\nhost = ${A}\ntoken = ${TOKEN}\n\n[sp]\nhost = ${A}\nclient_id = sp-id\nclient_secret = ${TOKEN}-m2m\nazure_client_secret = ${TOKEN}-azure\n`,
        );
        let calls = 0;
        await stubDatabricksApi(async () =>
            ++calls === 1
                ? Response.json(
                      { error_code: "UNAUTHENTICATED", message: "Invalid access token." },
                      { status: 401 },
                  )
                : Response.json({ userName: "alice@example.com" }),
        );
        const context = fakeExtensionContext(tempDir().dir);
        activate(context as never);
        await vi.waitFor(() => expect(statusBar()?.text).toBe("$(warning) Databricks: DEFAULT"));
        expect(statusBar()?.tooltip).toBe(`Can't connect to ${A}\nInvalid access token.`);
        // Sign in again, through the wizard, with the same profile.
        const signIn = run("databricks.connection.configureLogin");
        await vi.waitFor(() => expect(vscode.quickInputs).toHaveLength(1));
        vscode.quickInputs[0]!.accept();
        await vi.waitFor(() => expect(vscode.quickInputs).toHaveLength(2));
        vscode.quickInputs[1]!.accept("DEFAULT");
        await signIn;
        expect(statusBar()?.text).toBe("Databricks: DEFAULT");
        deactivateContext(context);

        await vi.waitFor(() =>
            expect(logEntries(context).some((e) => e.message.startsWith("Can't connect"))).toBe(
                true,
            ),
        );
        const written = [
            fs.readFileSync(path.join(context.logUri.fsPath, LOG_FILE_NAME), "utf8"),
            JSON.stringify([...context.globalState.store, ...context.workspaceState.store]),
            JSON.stringify(telemetry.events),
        ];
        for (const text of written) {
            expect(text).not.toContain(TOKEN);
        }
        // The failed request's error is in the file, so the check above read what was logged.
        expect(written[0]).toContain("Invalid access token.");
    });

    it("activates a session window: the old remote-mode key, the host in the log and telemetry, and the token nowhere", async () => {
        Object.assign(process.env, SERVERLESS_SESSION_ENV);
        vscodeEnv.remoteName = SESSION_REMOTE_NAME;
        await stubDatabricksApi(async () => Response.json({ userName: "alice@example.com" }));
        try {
            const context = fakeExtensionContext(tempDir().dir);
            activate(context as never);
            await vi.waitFor(() => expect(statusBar()?.text).toBe("Databricks: session"));
            const contexts = Object.fromEntries(
                vscode.executed
                    .filter((e) => e.command === "setContext")
                    .map((e) => e.args as [string, unknown]),
            );
            expect(contexts).toMatchObject({
                "databricks.context.remoteMode": true,
                "databricks.context.host.fixedIdentity": true,
                "databricks.context.host.givenPython": true,
                "databricks.context.host.mountedWorkspace": true,
                "databricks.context.host.noTunnel": true,
                "databricks.context.host.noAiTools": true,
            });
            expect(
                telemetry.events.find((e) => e.name === "extensionActivation")?.properties[
                    "context.mode"
                ],
            ).toBe("remote");
            deactivateContext(context);
            await vi.waitFor(() =>
                expect(logEntries(context).map((e) => e.message)).toContain(
                    "Activated databricks.databricks 2.20.0 in a session window",
                ),
            );
            const session = logEntries(context).find((e) => e.message === "Session window");
            expect(session?.data?.[0]).toMatchObject({
                host: SESSION_HOST,
                interpreter: SERVERLESS_INTERPRETER,
            });
            const written = [
                fs.readFileSync(path.join(context.logUri.fsPath, LOG_FILE_NAME), "utf8"),
                JSON.stringify(telemetry.events),
            ];
            for (const text of written) {
                expect(text).not.toContain(SESSION_TOKEN);
            }
        } finally {
            vscodeEnv.remoteName = undefined;
        }
    });

    it("offers to reconnect, not to sign in, when a session window's command needs a connection", async () => {
        Object.assign(process.env, SERVERLESS_SESSION_ENV);
        vscodeEnv.remoteName = SESSION_REMOTE_NAME;
        // Without it, selecting the session's interpreter shows an error of its own.
        new FakeMsPython().install();
        await stubDatabricksApi(async () =>
            Response.json(
                { error_code: "UNAUTHENTICATED", message: "Invalid access token." },
                { status: 401 },
            ),
        );
        try {
            const context = fakeExtensionContext(tempDir().dir);
            activate(context as never);
            await vi.waitFor(() => expect(statusBar()?.text).toBe("$(warning) Databricks: error"));
            await run("databricks.cluster.start");
            expect(vscode.errors).toEqual([
                // At start, the failed connection says why once.
                {
                    message:
                        "Can't connect with the session's credentials: Invalid access token. The session's token may have expired. Close this window and start the SSH tunnel again from a local window.",
                    actions: [],
                },
                {
                    message: "This window isn't connected with the SSH tunnel's credentials.",
                    actions: ["Reconnect"],
                },
            ]);
            deactivateContext(context);
        } finally {
            vscodeEnv.remoteName = undefined;
        }
    });
});
