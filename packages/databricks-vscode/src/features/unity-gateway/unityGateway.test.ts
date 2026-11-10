import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectionState } from "../../kernel/connection/ConnectionService";
import { registerFeatures, startFeatures } from "../../kernel/feature";
import type { UnityGatewayModelsState } from "../../kernel/unity-gateway/UnityGatewayModels";
import {
    UNITY_GATEWAY_SAVED_PROFILE,
    UNITY_GATEWAY_SIGNED_IN_BEFORE,
    type SavedUnityGatewayProfile,
} from "../../kernel/unity-gateway/UnityGatewayService";
import { MutableState, when } from "../../platform/reactive";
import type { ConfigurationItem } from "../../platform/ui/sections";
import { StateStore } from "../../platform/state";
import { FakeFileEvents } from "../../test-support/fakeFiles";
import { fakeFeatureHost, fakeKernel, fakeMemento } from "../../test-support/fakes";
import {
    fetchFailed,
    FakeHttpClient,
    SCIM_ME,
    type FakeResponse,
} from "../../test-support/fakeHttp";
import { SERVERLESS_SESSION } from "../../test-support/sessionEnv";
import { useTempDirs } from "../../test-support/tempDir";
import {
    TreeItemCollapsibleState,
    host as vscode,
    type FakeQuickInput,
    type FakeStatusBarItem,
} from "../../test-support/vscode";
import { connection } from "../connection";
import { UNITY_GATEWAY_HAS_SAVED_PROFILE, UNITY_GATEWAY_UNAVAILABLE, unityGateway } from "./index";
import { CHOOSE_MODEL } from "./UnityGatewayCommands";
import { modelsRow } from "./UnityGatewaySection";
import { SHOW_MENU, unityGatewayStatus } from "./UnityGatewayStatusBarItem";

const A = "https://a.cloud.databricks.com";
const B = "https://b.cloud.databricks.com";
/** A unified host, where profile acct is signed in to the account only. */
const U = "https://u.databricks.com";
/** The account console: a profile for account APIs, which no workspace can be chosen for. */
const ACCOUNTS = "https://accounts.cloud.databricks.com";
const tick = () => new Promise((r) => setImmediate(r));
const lastInput = (): FakeQuickInput => vscode.quickInputs[vscode.quickInputs.length - 1];
const item = (): FakeStatusBarItem | undefined =>
    vscode.statusBarItems.find((i) => i.id === "databricks.unityGateway");
const run = async (id: string) => {
    await vscode.commands.get(id)!();
};
const tempDir = useTempDirs();
/** Answers profile slow's SCIM call, which waits until then; by default it connects. Set once the call is made. */
let answerSlow: ((response?: FakeResponse) => void) | undefined;
const TWO_MODELS: FakeResponse = {
    body: {
        model_services: [
            { name: "system.ai.gpt-5", supported_api_types: ["mlflow/v1/responses"] },
            { name: "system.ai.claude-sonnet", supported_api_types: ["mlflow/v1/responses"] },
        ],
    },
};
/** What the workspace's model-services listing answers. */
let modelServices: FakeResponse = TWO_MODELS;

/** The origins whose host doesn't resolve. */
const unreachable = new Set<string>();

/**
 * `workspace: false` leaves DEFAULT out, so the window's connection starts
 * signed out and Unity Gateway has nothing to copy. `"u2m"` makes DEFAULT an
 * OAuth profile on B, as Unity Gateway's copy of it would be.
 */
function setup(
    options: {
        saved?: SavedUnityGatewayProfile;
        session?: boolean;
        isCursor?: boolean;
        workspace?: boolean | "u2m";
        /** A bundle folder with these targets, on these hosts; the first is the default. */
        targets?: Record<string, string>;
        /** Runs before the kernel starts, for example to fake the CLI. */
        beforeStart?: (kernel: ReturnType<typeof fakeKernel>) => void;
    } = {},
) {
    const workspace =
        options.workspace === false
            ? ""
            : options.workspace === "u2m"
              ? `[DEFAULT]\nhost = ${B}\nauth_type = databricks-cli\n\n`
              : `[DEFAULT]\nhost = ${A}\ntoken = dapi-default\n\n`;
    const dir = tempDir();
    if (options.targets !== undefined) {
        const [first] = Object.keys(options.targets);
        dir.write(
            "databricks.yml",
            `targets:\n${Object.entries(options.targets)
                .map(
                    ([name, host]) =>
                        `  ${name}:\n${name === first ? "    default: true\n" : ""}    workspace: {host: ${host}}\n`,
                )
                .join("")}`,
        );
    }
    const file = dir.write(
        ".databrickscfg",
        `${workspace}[ug]\nhost = ${B}\ntoken = dapi-ug\n\n[down]\nhost = ${B}\ntoken = dapi-down\n\n[slow]\nhost = ${B}\ntoken = dapi-slow\n\n[u2m]\nhost = ${B}\nauth_type = databricks-cli\n\n[acct]\nhost = ${U}\naccount_id = acc-1\nauth_type = databricks-cli\n\n[api]\nhost = ${ACCOUNTS}\ntoken = dapi-api\n`,
    );
    const http = new FakeHttpClient()
        .on("GET", SCIM_ME, (req) => {
            const url = new URL(req.url);
            if (unreachable.has(url.origin)) {
                throw fetchFailed("ENOTFOUND", url.host);
            }
            // A unified host: without a workspace, the request reaches the account API.
            if (new URL(req.url).origin === U && !req.headers.has("X-Databricks-Workspace-Id")) {
                return {
                    status: 403,
                    body: { error_code: "PERMISSION_DENIED", message: "account admins only" },
                };
            }
            switch (req.headers.get("Authorization")) {
                case "Bearer dapi-down":
                    return {
                        status: 401,
                        body: { error_code: "UNAUTHENTICATED", message: "Invalid token" },
                    };
                case "Bearer dapi-slow":
                    return new Promise((resolve) => {
                        answerSlow = (response = { body: { userName: "me" } }) => resolve(response);
                    });
                default:
                    return { body: { userName: "me" } };
            }
        })
        .on("GET", "/api/2.1/unity-catalog/model-services", () => modelServices)
        .on("GET", "/.well-known/databricks-config", { body: { host_type: "unified" } });
    const global = fakeMemento();
    if (options.saved !== undefined) {
        global.store.set(UNITY_GATEWAY_SAVED_PROFILE.name, options.saved);
    }
    const kernel = fakeKernel({
        env: { DATABRICKS_CONFIG_FILE: file },
        httpClient: http,
        state: new StateStore({ global, workspace: fakeMemento() }),
        ...(options.session ? { host: SERVERLESS_SESSION } : {}),
        ...(options.isCursor ? { isCursor: true } : {}),
        ...(options.targets !== undefined
            ? {
                  folders: new MutableState<readonly string[]>([dir.dir]),
                  files: new FakeFileEvents(),
              }
            : {}),
    });
    const fake = fakeFeatureHost(kernel);
    const registered = registerFeatures([connection, unityGateway], fake.host);
    startFeatures(registered);
    options.beforeStart?.(kernel);
    kernel.start();
    const settled = () => when(kernel.unityGateway.state, (s) => s.status !== "connecting");
    const connectedTo = (profile: string) =>
        when(
            kernel.unityGateway.state,
            (s) => s.status === "connected" && s.connection.profile === profile,
        );
    const windowOn = (profile: string) =>
        when(
            kernel.connection.state,
            (s) => s.status === "connected" && s.connection.profile === profile,
        );
    /** The Models & AI tools view's sections, and its rows with their children. */
    const models = async () => {
        const sections = fake.host.sections.list("modelsAndAiTools");
        const rows: ConfigurationItem[] = [];
        const children: ConfigurationItem[] = [];
        for (const section of sections) {
            for (const row of await section.getChildren()) {
                rows.push(row);
                children.push(...(await section.getChildren(row)));
            }
        }
        return {
            ids: sections.map((x) => x.id),
            rows,
            children,
            message: sections[0]?.message?.(),
        };
    };
    /** The Connection view's top rows, as label and description. */
    const signInRows = async () => {
        const rows: [unknown, unknown][] = [];
        for (const section of fake.host.sections.list("signIn")) {
            rows.push(
                ...(await section.getChildren()).map((r): [unknown, unknown] => [
                    r.label,
                    r.description,
                ]),
            );
        }
        return rows;
    };
    return { kernel, settled, connectedTo, windowOn, fake, models, signInRows };
}

/** Picks the host, then the profile, in the shared sign-in wizard. */
async function pickInWizard(host: string, profile: string) {
    await vi.waitFor(() => expect(vscode.quickInputs).toHaveLength(1));
    lastInput().accept(host);
    await tick();
    lastInput().accept(profile);
}

/** The menu's labels; picks `choice`, or dismisses it. */
function menu(choice?: string) {
    const shown: string[][] = [];
    vscode.pickFrom = (items) => {
        shown.push(items.map((i) => i.label));
        return items.find((i) => i.label === choice);
    };
    return shown;
}

describe("the Unity Gateway feature", () => {
    beforeEach(() => {
        vscode.reset();
        answerSlow = undefined;
        modelServices = TWO_MODELS;
        unreachable.clear();
    });

    it("signs in through the shared wizard, with no status-bar item of its own beside the connection's", async () => {
        const { kernel, connectedTo } = setup();
        await connectedTo("DEFAULT");
        expect(item()).toMatchObject({ visible: false, priority: 99, command: SHOW_MENU });

        const signIn = run("databricks.unityGateway.signIn");
        await pickInWizard(B, "ug");
        await signIn;

        expect(kernel.unityGateway.connection?.profile).toBe("ug");
        expect(item()?.visible).toBe(false);
        expect(vscode.progress.map((p) => p.title)).toContain(
            "Databricks: Signing in to Unity Gateway using profile 'ug'",
        );
        expect(kernel.contextKeys.get(UNITY_GATEWAY_HAS_SAVED_PROFILE)).toBe(true);
        // The window's own connection is unchanged.
        await when(kernel.connection.state, (s) => s.status === "connected");
        expect(vscode.statusBarItems[0].text).toBe("Databricks: DEFAULT");

        await run("databricks.unityGateway.signOut");
        expect(item()?.visible).toBe(false);
        expect(kernel.contextKeys.get(UNITY_GATEWAY_HAS_SAVED_PROFILE)).toBe(false);
        expect(kernel.state.get(UNITY_GATEWAY_SAVED_PROFILE)).toBeUndefined();
        expect(kernel.unityGateway.state.value.status).toBe("signedOut");
    });

    it("switches the Unity Gateway workspace from the Connection row's button, through the same wizard", async () => {
        const { kernel, connectedTo } = setup();
        await connectedTo("DEFAULT");

        const switching = run("databricks.unityGateway.switchWorkspace");
        await pickInWizard(B, "ug");
        await switching;

        expect(kernel.unityGateway.connection?.profile).toBe("ug");
        expect(kernel.connection.connection?.profile).toBe("DEFAULT");
    });

    it("does nothing when the wizard is dismissed", async () => {
        const { kernel } = setup({ workspace: false });
        const signIn = run("databricks.unityGateway.signIn");
        await vi.waitFor(() => expect(vscode.quickInputs).toHaveLength(1));
        lastInput().hide();
        await signIn;

        expect(kernel.unityGateway.state.value.status).toBe("signedOut");
        expect(item()?.visible).toBe(false);
        expect(vscode.errors).toEqual([]);
    });

    it("titles its sign-in wizard for Unity Gateway", async () => {
        setup({ workspace: false });
        const signIn = run("databricks.unityGateway.signIn");
        await vi.waitFor(() => expect(vscode.quickInputs).toHaveLength(1));
        expect(lastInput().title).toBe("Sign in to Unity Gateway");
        lastInput().hide();
        await signIn;
    });

    it("puts Unity Gateway's row back as it was when its browser login is cancelled", async () => {
        let stopLogin!: () => void;
        const { kernel } = setup({
            workspace: false,
            beforeStart: (k) => {
                k.runner.on(["auth", "token"], {
                    exitCode: 1,
                    stderr: "Error: refresh token is invalid.",
                });
                k.runner.on(
                    ["auth", "login"],
                    () =>
                        new Promise((resolve) => (stopLogin = () => resolve({ cancelled: true }))),
                );
            },
        });
        const before = kernel.unityGateway.state.value;
        const signIn = run("databricks.unityGateway.signIn");
        await pickInWizard(B, "u2m");
        await vi.waitFor(() => expect(stopLogin).toBeDefined());
        expect(kernel.unityGateway.state.value).toMatchObject({
            status: "connecting",
            signingIn: true,
        });

        vscode.cancelProgress();
        stopLogin();
        await signIn;
        expect(kernel.unityGateway.state.value).toEqual(before);
        expect(vscode.errors).toEqual([]);
    });

    it("keeps its previous profile and saved sign-in when a switch to an expired profile is cancelled", async () => {
        let stopLogin!: () => void;
        const { kernel, connectedTo } = setup({
            saved: { profile: "ug", host: `${B}/` },
            beforeStart: (k) => {
                k.runner.on(["auth", "token", "--profile", "u2m"], {
                    exitCode: 1,
                    stderr: "Error: refresh token is invalid.",
                });
                k.runner.on(
                    ["auth", "login"],
                    () =>
                        new Promise((resolve) => (stopLogin = () => resolve({ cancelled: true }))),
                );
            },
        });
        await connectedTo("ug");

        const signIn = run("databricks.unityGateway.signIn");
        await pickInWizard(B, "u2m");
        await vi.waitFor(() => expect(stopLogin).toBeDefined());
        vscode.cancelProgress();
        stopLogin();
        await signIn;

        expect(kernel.unityGateway.connection?.profile).toBe("ug");
        expect(kernel.state.get(UNITY_GATEWAY_SAVED_PROFILE)).toEqual({
            profile: "ug",
            host: `${B}/`,
        });
    });

    it("reconnects a failed first sign-in with the profile it tried, from the menu's Reconnect", async () => {
        unreachable.add(B);
        const { kernel, connectedTo } = setup({ workspace: false });
        const signIn = run("databricks.unityGateway.signIn");
        await pickInWizard(B, "ug");
        await signIn;
        expect(kernel.unityGateway.state.value).toMatchObject({ status: "error", profile: "ug" });

        unreachable.delete(B);
        const shown = menu("$(refresh) Reconnect");
        await run(SHOW_MENU);
        expect(shown[0]).toContain("$(refresh) Reconnect");
        await connectedTo("ug");
    });

    it("shows its row as signing in while its own browser login runs", async () => {
        let loggedIn = false;
        const login: { finish?: () => void; cancel?: () => void } = {};
        const { kernel } = setup({
            workspace: false,
            beforeStart: (k) => {
                k.runner.on(["auth", "token"], () =>
                    loggedIn
                        ? {
                              stdout: JSON.stringify({
                                  access_token: "u2m",
                                  expiry: new Date(Date.now() + 3600_000).toISOString(),
                              }),
                          }
                        : { exitCode: 1, stderr: "Error: refresh token is invalid." },
                );
                k.runner.on(
                    ["auth", "login"],
                    () =>
                        new Promise((resolve) => {
                            login.finish = () => {
                                loggedIn = true;
                                resolve({});
                            };
                            login.cancel = () => resolve({ cancelled: true });
                        }),
                );
            },
        });
        const signIn = run("databricks.unityGateway.signIn");
        await pickInWizard(B, "u2m");
        await vi.waitFor(() => expect(login.finish).toBeDefined());
        expect(kernel.unityGateway.state.value).toMatchObject({
            status: "connecting",
            profile: "u2m",
            signingIn: true,
        });
        login.finish?.();
        await signIn;
        expect(kernel.unityGateway.connection?.profile).toBe("u2m");
    });

    it("refuses a second sign-in while one is in progress", async () => {
        setup();
        const first = run("databricks.unityGateway.signIn");
        await vi.waitFor(() => expect(vscode.quickInputs).toHaveLength(1));

        await run("databricks.unityGateway.signIn");
        expect(vscode.errors.map((e) => e.message)).toEqual([
            "Databricks: Unity Gateway sign in is already in progress",
        ]);
        expect(vscode.quickInputs).toHaveLength(1);
        lastInput().hide();
        await first;
    });

    it("says why a sign-in failed", async () => {
        setup();
        const signIn = run("databricks.unityGateway.signIn");
        await pickInWizard(B, "down");
        await signIn;

        expect(vscode.errors.map((e) => e.message)).toEqual([
            expect.stringMatching(/^Can't login with config profile down: .*names no workspace on/),
        ]);
        expect(item()?.visible).toBe(true);
    });

    it("stays quiet when a sign-out cancels a sign-in under way", async () => {
        const { kernel } = setup();
        const signIn = run("databricks.unityGateway.signIn");
        await pickInWizard(B, "slow");
        await vi.waitFor(() => expect(answerSlow).toBeDefined());

        await run("databricks.unityGateway.signOut");
        answerSlow?.();
        await signIn;
        expect(vscode.errors).toEqual([]);
        expect(item()?.visible).toBe(false);
        expect(kernel.state.get(UNITY_GATEWAY_SAVED_PROFILE)).toBeUndefined();
    });

    it("signs in while the workspace is signed out", async () => {
        const { kernel } = setup({ workspace: false });
        await when(kernel.connection.state, (s) => s.status === "signedOut");

        const signIn = run("databricks.unityGateway.signIn");
        await pickInWizard(B, "ug");
        await signIn;

        expect(vscode.errors).toEqual([]);
        expect(kernel.unityGateway.connection?.profile).toBe("ug");
        expect(kernel.connection.state.value.status).toBe("signedOut");
    });

    it("shows the Unity Gateway connection in the Models & AI tools view, and refreshes it as the state changes", async () => {
        const { kernel, fake, models, connectedTo } = setup();
        await connectedTo("DEFAULT");
        const copied = await models();
        expect(copied.ids).toEqual(["unityGateway"]);
        const from = (rows: ConfigurationItem[]) =>
            rows.map((r) => [r.label, String(r.description).replace(/^.* · /, "")]);
        expect(from(copied.rows)).toEqual([["Models", "from DEFAULT"]]);
        expect(copied.message).toBeUndefined();
        let refreshes = 0;
        fake.host.sections.onDidChange(() => refreshes++);

        const signIn = run("databricks.unityGateway.signIn");
        await pickInWizard(B, "ug");
        await signIn;
        expect(refreshes).toBeGreaterThan(0);
        await vi.waitFor(() => expect(kernel.unityGateway.models.value.status).toBe("ready"));
        const switched = await models();
        expect(switched.rows.map((r) => [r.label, r.description])).toEqual([
            ["Models", "2 available · from ug"],
        ]);
        expect(switched.children).toEqual([]);

        // Signing out of the workspace leaves the models; signing out of Unity Gateway stops them.
        await run("databricks.connection.logout");
        expect(from((await models()).rows)).toEqual([["Models", "from ug"]]);
        await run("databricks.unityGateway.signOut");
        const signedOut = await models();
        expect(signedOut.rows.map((r) => [r.label, r.description])).toEqual([
            ["Models", "Sign in to Unity Gateway to use them"],
        ]);
        expect(signedOut.children).toEqual([]);
    });

    it("shows the Unity Gateway connection in the Connection view beside the workspace's, and nothing while both are signed out", async () => {
        const { kernel, signInRows, connectedTo } = setup();
        await when(kernel.connection.state, (s) => s.status === "connected");
        await connectedTo("DEFAULT");
        expect(await signInRows()).toEqual([
            ["Workspace connection", "DEFAULT"],
            ["Unity Gateway connection", "DEFAULT"],
        ]);

        const signIn = run("databricks.unityGateway.signIn");
        await pickInWizard(B, "ug");
        await signIn;
        expect(await signInRows()).toEqual([
            ["Workspace connection", "DEFAULT"],
            ["Unity Gateway connection", "ug"],
        ]);

        // Unity Gateway stays signed in, so both rows stay.
        await run("databricks.connection.logout");
        expect(await signInRows()).toEqual([
            ["Workspace connection", "Not signed in"],
            ["Unity Gateway connection", "ug"],
        ]);

        // Both signed out: no rows, so the view's sign-in welcome shows.
        await run("databricks.unityGateway.signOut");
        expect(await signInRows()).toEqual([]);
    });

    it("copies the workspace's startup connection, and saves it as its own", async () => {
        const { kernel, connectedTo } = setup();
        await connectedTo("DEFAULT");
        // A connection of its own, not the window's.
        expect(kernel.unityGateway.connection).not.toBe(kernel.connection.connection);
        expect(kernel.state.get(UNITY_GATEWAY_SAVED_PROFILE)).toEqual({
            profile: "DEFAULT",
            host: `${A}/`,
        });
        expect(kernel.state.get(UNITY_GATEWAY_SIGNED_IN_BEFORE)).toBe(true);
        expect(kernel.contextKeys.get(UNITY_GATEWAY_HAS_SAVED_PROFILE)).toBe(true);
    });

    it("copies the profile of the first Databricks sign-in", async () => {
        const { kernel, signInRows, connectedTo } = setup({ workspace: false });
        await when(kernel.connection.state, (s) => s.status === "signedOut");
        expect(kernel.unityGateway.state.value.status).toBe("signedOut");

        const signIn = run("databricks.connection.configureLogin");
        await pickInWizard(B, "ug");
        await signIn;
        await connectedTo("ug");
        expect(await signInRows()).toEqual([
            ["Workspace connection", "ug"],
            ["Unity Gateway connection", "ug"],
        ]);
        expect(kernel.state.get(UNITY_GATEWAY_SAVED_PROFILE)?.profile).toBe("ug");
    });

    it.each<[string, FakeResponse]>([
        ["connects", { body: { userName: "me" } }],
        [
            "fails",
            { status: 401, body: { error_code: "UNAUTHENTICATED", message: "Invalid token" } },
        ],
    ])(
        "copies a newer workspace connection over an earlier one still connecting, which then %s",
        async (_, late) => {
            const { kernel, connectedTo } = setup({ workspace: false });
            await when(kernel.connection.state, (s) => s.status === "signedOut");
            const first = kernel.connection.useProfile("slow");
            await vi.waitFor(() => expect(answerSlow).toBeDefined());

            await kernel.connection.useProfile("ug");
            answerSlow?.(late);
            await first;
            await connectedTo("ug");
            await tick();
            expect(kernel.unityGateway.connection?.profile).toBe("ug");
            expect(kernel.state.get(UNITY_GATEWAY_SAVED_PROFILE)?.profile).toBe("ug");
        },
    );

    it("doesn't copy a workspace connection while the user signs Unity Gateway in", async () => {
        const { kernel, connectedTo } = setup({ workspace: false });
        await when(kernel.connection.state, (s) => s.status === "signedOut");
        const signIn = run("databricks.unityGateway.signIn");
        await pickInWizard(B, "slow");
        await vi.waitFor(() => expect(answerSlow).toBeDefined());

        await kernel.connection.useProfile("ug");
        answerSlow?.();
        await signIn;
        await connectedTo("slow");
        expect(kernel.state.get(UNITY_GATEWAY_SAVED_PROFILE)?.profile).toBe("slow");
    });

    it("keeps the Unity Gateway profile the user chose when signing in to Databricks", async () => {
        const { kernel, settled, signInRows } = setup({ saved: { profile: "ug", host: `${B}/` } });
        await settled();
        await when(kernel.connection.state, (s) => s.status === "connected");

        const signIn = run("databricks.connection.configureLogin");
        await pickInWizard(A, "DEFAULT");
        await signIn;
        expect(await signInRows()).toEqual([
            ["Workspace connection", "DEFAULT"],
            ["Unity Gateway connection", "ug"],
        ]);
    });

    it("never moves with the workspace connection: a switch or a sign-out leaves it", async () => {
        const { kernel, connectedTo, windowOn } = setup();
        await connectedTo("DEFAULT");

        await kernel.connection.useProfile("ug");
        await windowOn("ug");
        await kernel.connection.signOut();
        await tick();

        expect(kernel.unityGateway.connection?.profile).toBe("DEFAULT");
        expect(kernel.state.get(UNITY_GATEWAY_SAVED_PROFILE)?.profile).toBe("DEFAULT");
    });

    it("copies only once: after signing out of Unity Gateway, a workspace sign-in leaves it signed out", async () => {
        const { kernel, connectedTo, windowOn } = setup();
        await connectedTo("DEFAULT");
        await run("databricks.unityGateway.signOut");

        await kernel.connection.useProfile("ug");
        await windowOn("ug");
        await tick();

        expect(kernel.unityGateway.state.value.status).toBe("signedOut");
        expect(kernel.state.get(UNITY_GATEWAY_SAVED_PROFILE)).toBeUndefined();
    });

    it("signs in with the workspace again when you sign in by hand, signed out of both", async () => {
        const { kernel, connectedTo, signInRows } = setup();
        await connectedTo("DEFAULT");
        await run("databricks.unityGateway.signOut");
        await run("databricks.connection.logout");
        await when(kernel.connection.state, (s) => s.status === "signedOut");

        const signIn = run("databricks.connection.configureLogin");
        await pickInWizard(B, "ug");
        await signIn;
        await connectedTo("ug");
        expect(await signInRows()).toEqual([
            ["Workspace connection", "ug"],
            ["Unity Gateway connection", "ug"],
        ]);
        expect(kernel.state.get(UNITY_GATEWAY_SAVED_PROFILE)?.profile).toBe("ug");
    });

    it("stays quiet when a sign-out cancels that sign-in", async () => {
        const { kernel, connectedTo, fake } = setup();
        await connectedTo("DEFAULT");
        await run("databricks.unityGateway.signOut");
        await run("databricks.connection.logout");
        await when(kernel.connection.state, (s) => s.status === "signedOut");

        const signIn = run("databricks.connection.configureLogin");
        await pickInWizard(B, "slow");
        await vi.waitFor(() => expect(answerSlow).toBeDefined());
        const forWorkspace = answerSlow;
        forWorkspace?.();
        await signIn;
        await vi.waitFor(() => expect(answerSlow).not.toBe(forWorkspace));
        expect(kernel.unityGateway.state.value.status).toBe("connecting");

        await run("databricks.unityGateway.signOut");
        answerSlow?.();
        await tick();
        expect(kernel.state.get(UNITY_GATEWAY_SAVED_PROFILE)).toBeUndefined();
        expect(fake.log.entries.filter((e) => e.message.includes("Unity Gateway"))).toEqual([]);
    });

    it("stays signed out when you switch the workspace by hand after signing out of Unity Gateway alone", async () => {
        const { kernel, connectedTo, windowOn } = setup();
        await connectedTo("DEFAULT");
        await run("databricks.unityGateway.signOut");

        const signIn = run("databricks.connection.configureLogin");
        await pickInWizard(B, "ug");
        await signIn;
        await windowOn("ug");
        await tick();

        expect(kernel.unityGateway.state.value.status).toBe("signedOut");
        expect(kernel.state.get(UNITY_GATEWAY_SAVED_PROFILE)).toBeUndefined();
    });

    it("stays signed out when a target connects the window by itself, signed out of both", async () => {
        const { kernel, connectedTo, windowOn } = setup({ targets: { dev: A, prod: A } });
        await connectedTo("DEFAULT");
        await run("databricks.unityGateway.signOut");
        await run("databricks.connection.logout");
        await when(kernel.connection.state, (s) => s.status === "signedOut");

        // Signed out of dev only: prod connects with the only profile for its host.
        await kernel.project.selectTarget("prod");
        await windowOn("DEFAULT");
        await tick();

        expect(kernel.unityGateway.state.value.status).toBe("signedOut");
        expect(kernel.state.get(UNITY_GATEWAY_SAVED_PROFILE)).toBeUndefined();
    });

    it("keeps its own sign-in when you sign the workspace in by hand from signed out", async () => {
        const { kernel, connectedTo, windowOn } = setup({
            saved: { profile: "ug", host: `${B}/` },
        });
        await connectedTo("ug");
        await windowOn("DEFAULT");
        await run("databricks.connection.logout");
        await when(kernel.connection.state, (s) => s.status === "signedOut");

        const signIn = run("databricks.connection.configureLogin");
        await pickInWizard(A, "DEFAULT");
        await signIn;
        await windowOn("DEFAULT");
        await tick();

        expect(kernel.unityGateway.connection?.profile).toBe("ug");
        expect(kernel.state.get(UNITY_GATEWAY_SAVED_PROFILE)?.profile).toBe("ug");
    });

    it("stays out of a sign-in from signed out in Cursor, where it's off", async () => {
        const { kernel, fake, windowOn } = setup({ isCursor: true });
        await windowOn("DEFAULT");
        await run("databricks.connection.logout");
        await when(kernel.connection.state, (s) => s.status === "signedOut");

        const signIn = run("databricks.connection.configureLogin");
        await pickInWizard(A, "DEFAULT");
        await signIn;
        await windowOn("DEFAULT");
        await tick();

        expect(fake.log.entries.filter((e) => e.message.includes("Unity Gateway"))).toEqual([]);
    });

    it("copies nothing over a saved profile, from 2.21 or an earlier sign-in", async () => {
        const { kernel, connectedTo, windowOn } = setup({
            saved: { profile: "ug", host: `${B}/` },
        });
        await connectedTo("ug");
        await windowOn("DEFAULT");
        await tick();

        expect(kernel.unityGateway.connection?.profile).toBe("ug");
        expect(kernel.state.get(UNITY_GATEWAY_SAVED_PROFILE)?.profile).toBe("ug");
    });

    it("copies a bundle target's profile first, and then never moves when the target changes", async () => {
        const { kernel, connectedTo, windowOn } = setup({ targets: { dev: A, prod: B } });
        // The window connects for target dev, with the only profile for its host.
        await windowOn("DEFAULT");
        await connectedTo("DEFAULT");

        // Several profiles are for prod's host: the window asks, and the pick is the user's.
        await kernel.project.selectTarget("prod");
        await when(kernel.project.snapshot, (p) => p.target === "prod");
        await kernel.connection.useProfile("ug");
        await windowOn("ug");
        // Back and forth: now the target alone moves the window, with the profile saved for it.
        await kernel.project.selectTarget("dev");
        await windowOn("DEFAULT");
        await kernel.project.selectTarget("prod");
        await windowOn("ug");
        await tick();

        expect(kernel.unityGateway.connection?.profile).toBe("DEFAULT");
        expect(kernel.state.get(UNITY_GATEWAY_SAVED_PROFILE)?.profile).toBe("DEFAULT");
    });

    it("counts the workspace's models on the Models row, and a click opens Chat's model picker", async () => {
        const { kernel, models, fake } = setup({ saved: { profile: "ug", host: `${B}/` } });
        await vi.waitFor(() => expect(kernel.unityGateway.models.value.status).toBe("ready"));
        const { rows, children } = await models();

        expect(rows[0]).toMatchObject({
            description: "2 available · from ug",
            collapsibleState: TreeItemCollapsibleState.None,
            command: { command: CHOOSE_MODEL },
        });
        expect(children).toEqual([]);
        await run(CHOOSE_MODEL);

        // Chat opens first, so that the picker acts on its input.
        expect(
            vscode.executed
                .filter((e) => e.command.startsWith("workbench.action.chat."))
                .map((e) => [e.command, e.args]),
        ).toEqual([
            ["workbench.action.chat.open", []],
            ["workbench.action.chat.openModelPicker", []],
        ]);
        expect(vscode.errors).toEqual([]);
        expect(fake.log.entries.filter((e) => e.level === "error")).toEqual([]);
    });

    it("says why Chat didn't open", async () => {
        setup();
        vscode.commands.set("workbench.action.chat.open", () => {
            throw new Error("Chat is disabled.");
        });
        await run(CHOOSE_MODEL);

        expect(vscode.errors.map((e) => e.message)).toEqual(["Can't open Chat. Chat is disabled."]);
        expect(
            vscode.executed.filter((e) => e.command === "workbench.action.chat.openModelPicker"),
        ).toEqual([]);
    });

    it("leaves Chat open, with no error, when its model picker fails, and logs why", async () => {
        const { fake } = setup();
        vscode.commands.set("workbench.action.chat.openModelPicker", () => {
            throw new Error("command 'workbench.action.chat.openModelPicker' not found");
        });
        await run(CHOOSE_MODEL);

        expect(vscode.errors).toEqual([]);
        expect(vscode.executed.map((e) => e.command)).toContain("workbench.action.chat.open");
        expect(fake.log.entries.filter((e) => e.level === "error").map((e) => e.message)).toEqual([
            "Can't open Chat's model picker",
        ]);
    });

    it("says why it can't list the models", async () => {
        modelServices = {
            status: 403,
            body: {
                error_code: "PERMISSION_DENIED",
                message: "User does not have USE CATALOG on system",
            },
        };
        const { kernel, fake, models } = setup({ saved: { profile: "ug", host: `${B}/` } });
        await vi.waitFor(() => expect(kernel.unityGateway.models.value.status).toBe("error"));

        expect((await models()).rows[0]).toMatchObject({
            description: "Can't list them · from ug",
            tooltip: `From Unity Gateway on ${B} with profile ug\nCan't list the Unity Gateway models\nUser does not have USE CATALOG on system`,
            iconPath: { id: "warning" },
        });

        // Listed again, as chat does after a failure: the row follows.
        let refreshes = 0;
        fake.host.sections.onDidChange(() => refreshes++);
        modelServices = TWO_MODELS;
        await kernel.unityGateway.models.list();
        expect(refreshes).toBeGreaterThan(0);
        expect((await models()).rows[0]?.description).toBe("2 available · from ug");
    });

    it("restores the saved sign-in without any UI", async () => {
        const { settled, models } = setup({ saved: { profile: "ug", host: `${B}/` } });
        await vi.waitFor(async () => expect((await settled()).status).toBe("connected"));

        expect(item()?.visible).toBe(false);
        expect((await models()).rows.map((r) => r.description)).toEqual([
            expect.stringMatching(/ · from ug$/),
        ]);
        expect(vscode.quickInputs).toEqual([]);
        expect([...vscode.errors, ...vscode.warnings, ...vscode.infos]).toEqual([]);
    });

    it("shows a failed restore as a warning and says why once; Reconnect says why it still fails", async () => {
        const { settled, models, windowOn } = setup({ saved: { profile: "gone", host: `${B}/` } });
        await vi.waitFor(async () => expect((await settled()).status).toBe("error"));
        // The notice waits for the workspace connection, which may say why for both.
        await windowOn("DEFAULT");
        await vi.waitFor(() => expect(vscode.errors).toHaveLength(1));
        expect(item()).toMatchObject({ visible: true, text: "$(warning) Unity Gateway: gone" });
        expect((await models()).rows).toMatchObject([
            {
                label: "Models",
                description: "Not connected · gone",
                tooltip: "Unity Gateway isn't connected\nProfile 'gone' doesn't exist.",
                command: { command: SHOW_MENU },
            },
        ]);

        const shown = menu("$(refresh) Reconnect");
        await run(SHOW_MENU);
        expect(shown).toEqual([
            [
                "$(refresh) Reconnect",
                "$(sign-in) Sign in to Unity Gateway",
                "$(sign-out) Sign out of Unity Gateway",
            ],
        ]);
        expect(vscode.errors.map((e) => e.message)).toEqual([
            "Can't login with config profile gone: Profile 'gone' doesn't exist.",
            "Can't login with config profile gone: Profile 'gone' doesn't exist.",
        ]);
    });

    it("leaves a failing workspace connection to its own status-bar item", async () => {
        const { kernel, connectedTo } = setup({ workspace: false });
        await when(kernel.connection.state, (s) => s.status === "signedOut");
        const signIn = run("databricks.unityGateway.signIn");
        await pickInWizard(B, "ug");
        await signIn;
        await connectedTo("ug");

        await kernel.connection.useProfile("down");
        await when(kernel.connection.state, (s) => s.status === "error");

        expect(item()?.visible).toBe(false);
        expect(kernel.unityGateway.connection?.profile).toBe("ug");
    });

    it("signs in again from an expired session, through the connection's login, then reconnects", async () => {
        let tokens = 0;
        const { kernel, settled, signInRows, fake } = setup({
            saved: { profile: "u2m", host: `${B}/` },
            beforeStart: (k) => {
                k.runner.on(["auth", "token"], () =>
                    ++tokens === 1
                        ? {
                              exitCode: 1,
                              stderr: "Error: refresh token is invalid. Run databricks auth login --profile u2m",
                          }
                        : {
                              stdout: JSON.stringify({
                                  access_token: "u2m",
                                  expiry: new Date(Date.now() + 3600_000).toISOString(),
                              }),
                          },
                );
                k.runner.on(["auth", "login"], {});
            },
        });
        await vi.waitFor(async () => expect((await settled()).status).toBe("error"));
        expect(kernel.unityGateway.state.value).toMatchObject({ remedy: "signInAgain" });
        await vi.waitFor(() =>
            expect(vscode.errors).toEqual([
                {
                    message:
                        "Can't login with config profile u2m: Error: refresh token is invalid. Run databricks auth login --profile u2m",
                    actions: ["Sign in again"],
                },
            ]),
        );
        await when(kernel.connection.state, (s) => s.status === "connected");
        expect(await signInRows()).toEqual([
            ["Workspace connection", "DEFAULT"],
            ["Unity Gateway connection", "u2m · Can't connect"],
        ]);
        const section = fake.host.sections
            .list("signIn")
            .find((x) => x.id === "unityGatewayConnection");
        const [row] = (await section?.getChildren()) ?? [];
        expect(await section?.getChildren(row)).toEqual([]);
        const shown = menu();
        await run(SHOW_MENU);
        expect(shown[0]?.[0]).toBe("$(refresh) Sign in again");

        await run("databricks.unityGateway.signInAgain");

        expect(kernel.runner.argv.filter((a) => a[1] === "login")).toEqual([
            expect.arrayContaining(["auth", "login", "--profile", "u2m"]),
        ]);
        expect(kernel.unityGateway.connection?.profile).toBe("u2m");
    });

    describe("with one expired session for both connections", () => {
        /**
         * DEFAULT, Unity Gateway's copy of the workspace's: its token fails
         * until `auth login`. Saved for another host, Unity Gateway fails
         * another way.
         */
        function expired(savedHost = B) {
            let signedIn = false;
            const s = setup({
                workspace: "u2m",
                saved: { profile: "DEFAULT", host: `${savedHost}/` },
                beforeStart: (k) => {
                    k.runner.on(["auth", "token"], () =>
                        signedIn
                            ? {
                                  stdout: JSON.stringify({
                                      access_token: "u2m",
                                      expiry: new Date(Date.now() + 3600_000).toISOString(),
                                  }),
                              }
                            : { exitCode: 1, stderr: "Error: refresh token is invalid." },
                    );
                    k.runner.on(["auth", "login"], () => {
                        signedIn = true;
                        return {};
                    });
                },
            });
            const logins = () => s.kernel.runner.argv.filter((a) => a[1] === "login");
            return { ...s, logins };
        }

        it("says why once, in the workspace's notice, whose Sign in again reconnects both", async () => {
            // The user answers the notice after the start-up checks have settled.
            let choose!: (choice: string) => void;
            vscode.nextErrorChoice = new Promise<string>((resolve) => (choose = resolve));
            const { kernel, settled, windowOn, connectedTo, logins } = expired();
            await vi.waitFor(async () => expect((await settled()).status).toBe("error"));
            await when(kernel.unityGateway.state, (s) => s.status === "error");
            await tick();
            await tick();
            expect(vscode.errors).toEqual([
                {
                    message:
                        "Can't login with config profile DEFAULT: Error: refresh token is invalid.",
                    actions: ["Sign in again"],
                },
            ]);

            choose("Sign in again");
            await windowOn("DEFAULT");
            await connectedTo("DEFAULT");
            expect(vscode.errors).toHaveLength(1);
            expect(logins()).toHaveLength(1);
            expect(kernel.unityGateway.connection?.profile).toBe("DEFAULT");
        });

        it("still says why for Unity Gateway when it failed another way", async () => {
            const { kernel, settled } = expired(A);
            await vi.waitFor(async () => expect((await settled()).status).toBe("error"));
            await when(kernel.connection.state, (s) => s.status === "error");

            await vi.waitFor(() =>
                expect(vscode.errors.map((e) => e.message).sort()).toEqual([
                    "Can't login with config profile DEFAULT: Error: refresh token is invalid.",
                    `Can't login with config profile DEFAULT: Profile 'DEFAULT' now points at ${B}, not ${A}.`,
                ]),
            );
        });

        it("reconnects the workspace too from Unity Gateway's Sign in again", async () => {
            const { kernel, settled, windowOn, logins } = expired();
            await vi.waitFor(async () => expect((await settled()).status).toBe("error"));
            await when(kernel.connection.state, (s) => s.status === "error");

            await run("databricks.unityGateway.signInAgain");

            await windowOn("DEFAULT");
            expect(kernel.unityGateway.connection?.profile).toBe("DEFAULT");
            expect(logins()).toHaveLength(1);
        });
    });

    describe("when the host can't be reached", () => {
        /** The notices' choice, held until the test makes it. */
        function holdChoice() {
            let choose!: (choice: string) => void;
            vscode.nextErrorChoice = new Promise<string>((resolve) => (choose = resolve));
            return choose;
        }

        it("offers Retry for the restore, which signs in once the host answers", async () => {
            unreachable.add(B);
            const choose = holdChoice();
            const { settled, windowOn, connectedTo } = setup({
                saved: { profile: "ug", host: `${B}/` },
            });
            await vi.waitFor(async () => expect((await settled()).status).toBe("error"));
            await windowOn("DEFAULT");
            await vi.waitFor(() =>
                expect(vscode.errors).toEqual([
                    {
                        message:
                            "Can't login with config profile ug: Can't reach b.cloud.databricks.com: the host name doesn't resolve. Check the host, or your network.",
                        actions: ["Retry"],
                    },
                ]),
            );

            unreachable.delete(B);
            choose("Retry");
            await connectedTo("ug");
            expect(vscode.errors).toHaveLength(1);
        });

        it("says why again when Retry still can't reach the host", async () => {
            unreachable.add(B);
            const choose = holdChoice();
            const { settled, windowOn } = setup({ saved: { profile: "ug", host: `${B}/` } });
            await vi.waitFor(async () => expect((await settled()).status).toBe("error"));
            await windowOn("DEFAULT");
            await vi.waitFor(() => expect(vscode.errors).toHaveLength(1));

            choose("Retry");
            // The next notice is dismissed.
            vscode.nextErrorChoice = undefined;
            await vi.waitFor(() => expect(vscode.errors).toHaveLength(2));
            expect(vscode.errors[1]).toEqual(vscode.errors[0]);
            expect((await settled()).status).toBe("error");
        });

        it("with one profile for both, says why once, and its Retry connects both", async () => {
            unreachable.add(A);
            const choose = holdChoice();
            const { kernel, settled, windowOn, connectedTo } = setup({
                saved: { profile: "DEFAULT", host: `${A}/` },
            });
            await vi.waitFor(async () => expect((await settled()).status).toBe("error"));
            await when(kernel.connection.state, (s) => s.status === "error");
            // Unity Gateway's notice decides once the window's connection has failed.
            await kernel.unityGateway.started;
            await tick();
            await tick();
            expect(vscode.errors).toEqual([
                {
                    message:
                        "Can't login with config profile DEFAULT: Can't reach a.cloud.databricks.com: the host name doesn't resolve. Check the host, or your network.",
                    actions: ["Retry"],
                },
            ]);

            unreachable.delete(A);
            choose("Retry");
            await windowOn("DEFAULT");
            await connectedTo("DEFAULT");
            expect(vscode.errors).toHaveLength(1);
        });
    });

    describe("when a sign-in fails", () => {
        /** The notices' choice, held until the test makes it. */
        function holdChoice() {
            let choose!: (choice: string) => void;
            vscode.nextErrorChoice = new Promise<string>((resolve) => (choose = resolve));
            return choose;
        }

        it("offers Select a workspace for the profile it tried, and shows that profile", async () => {
            const choose = holdChoice();
            const { kernel, connectedTo } = setup({
                saved: { profile: "ug", host: `${B}/` },
                beforeStart: (k) => {
                    k.runner.on(["auth", "token"], {
                        stdout: JSON.stringify({
                            access_token: "u2m",
                            expiry: new Date(Date.now() + 3600_000).toISOString(),
                        }),
                    });
                    k.runner.on(["auth", "login"], () => {
                        fs.writeFileSync(
                            k.configFile(),
                            fs
                                .readFileSync(k.configFile(), "utf8")
                                .replace("[acct]\n", "[acct]\nworkspace_id = 1234\n"),
                        );
                        return {};
                    });
                },
            });
            await connectedTo("ug");

            const signIn = run("databricks.unityGateway.signIn");
            await pickInWizard(U, "acct");
            await signIn;

            expect(vscode.errors).toEqual([
                {
                    message: expect.stringMatching(
                        /^Can't login with config profile acct: Profile 'acct' is signed in to the account on .* not to one of its workspaces/,
                    ),
                    actions: ["Select a workspace"],
                },
            ]);
            expect(kernel.unityGateway.connection).toBeUndefined();
            expect(kernel.unityGateway.state.value).toMatchObject({
                status: "error",
                profile: "acct",
            });

            choose("Select a workspace");
            await vi.waitFor(() =>
                expect(lastInput()?.placeholder).toBe("This updates profile acct"),
            );
            lastInput().accept("Enter a workspace ID or URL…");
            await tick();
            lastInput().type("1234");
            lastInput().accept();
            await connectedTo("acct");
            expect(kernel.unityGateway.connection).toMatchObject({
                profile: "acct",
                workspaceId: "1234",
            });
        });

        it("offers Sign in again for the profile it tried: it renews that profile, then signs in with it", async () => {
            const choose = holdChoice();
            let tokens = 0;
            const { kernel, connectedTo } = setup({
                saved: { profile: "ug", host: `${B}/` },
                beforeStart: (k) => {
                    // The wizard's check is the first call; the sign-in's is the second.
                    k.runner.on(["auth", "token"], () =>
                        ++tokens === 2
                            ? {
                                  exitCode: 1,
                                  stderr: "Error: refresh token is invalid. Run databricks auth login --profile u2m",
                              }
                            : {
                                  stdout: JSON.stringify({
                                      access_token: "u2m",
                                      expiry: new Date(Date.now() + 3600_000).toISOString(),
                                  }),
                              },
                    );
                    k.runner.on(["auth", "login"], {});
                },
            });
            await connectedTo("ug");

            const signIn = run("databricks.unityGateway.signIn");
            await pickInWizard(B, "u2m");
            await signIn;

            expect(vscode.errors).toEqual([
                {
                    message:
                        "Can't login with config profile u2m: Error: refresh token is invalid. Run databricks auth login --profile u2m",
                    actions: ["Sign in again"],
                },
            ]);
            expect(kernel.unityGateway.connection).toBeUndefined();

            choose("Sign in again");
            await connectedTo("u2m");
            expect(kernel.runner.argv.filter((a) => a[1] === "login")).toEqual([
                expect.arrayContaining(["auth", "login", "--profile", "u2m"]),
            ]);
        });

        it("offers Retry for a host that couldn't be reached, which signs in with the profile it tried", async () => {
            unreachable.add(B);
            const choose = holdChoice();
            const { kernel, connectedTo } = setup({ workspace: false });

            const signIn = run("databricks.unityGateway.signIn");
            await pickInWizard(B, "ug");
            await signIn;

            expect(vscode.errors).toEqual([
                {
                    message:
                        "Can't login with config profile ug: Can't reach b.cloud.databricks.com: the host name doesn't resolve. Check the host, or your network.",
                    actions: ["Retry"],
                },
            ]);
            expect(kernel.unityGateway.connection).toBeUndefined();

            unreachable.delete(B);
            choose("Retry");
            await connectedTo("ug");
            expect(vscode.errors).toHaveLength(1);
        });

        it("offers Select a profile in its menu for a profile for account APIs, as the notice does", async () => {
            setup({ saved: { profile: "api", host: `${ACCOUNTS}/` } });
            await vi.waitFor(() => expect(vscode.errors).toHaveLength(1));
            let items: { label: string; detail?: string }[] = [];
            vscode.pickFrom = (list) => {
                items = list;
                return undefined;
            };
            await run(SHOW_MENU);
            expect(items.find((i) => i.label === "$(list-selection) Select a profile")).toEqual({
                label: "$(list-selection) Select a profile",
                run: expect.any(Function),
            });
        });

        it("offers Select a profile for a saved profile for account APIs, and the wizard doesn't offer that profile", async () => {
            const choose = holdChoice();
            setup({ saved: { profile: "api", host: `${ACCOUNTS}/` } });
            await vi.waitFor(() => expect(vscode.errors).toHaveLength(1));
            expect(vscode.errors[0]).toMatchObject({ actions: ["Select a profile"] });
            const before = vscode.quickInputs.length;
            choose("Select a profile");
            await vi.waitFor(() => expect(vscode.quickInputs).toHaveLength(before + 1));
            expect(lastInput().items.map((i) => i.detail)).not.toContain("Profiles: api");
            lastInput().hide();
        });
    });

    it("says nothing about a restore that a newer sign-in replaced: that sign-in says how it went", async () => {
        let answer: (() => void) | undefined;
        const { kernel } = setup({
            saved: { profile: "u2m", host: `${B}/` },
            beforeStart: (k) =>
                k.runner.on(
                    ["auth", "token"],
                    () =>
                        new Promise((resolve) => {
                            answer = () => resolve({ exitCode: 1, stderr: "Error: timed out" });
                        }),
                ),
        });
        await vi.waitFor(() => expect(answer).toBeDefined());
        // A token profile with no workspace on this suite's unified host: the sign-in's own reason.
        await expect(kernel.unityGateway.signIn("down")).rejects.toThrow("names no workspace on");

        answer!();
        await tick();
        await tick();
        expect(vscode.errors).toEqual([]);
    });

    it("offers to select a workspace for a profile signed in to the account only, and saves it through the CLI", async () => {
        const { kernel, settled, signInRows, fake } = setup({
            saved: { profile: "acct", host: `${U}/` },
            beforeStart: (k) => {
                k.runner.on(["auth", "token"], {
                    stdout: JSON.stringify({
                        access_token: "u2m",
                        expiry: new Date(Date.now() + 3600_000).toISOString(),
                    }),
                });
                k.runner.on(["auth", "login"], () => {
                    fs.writeFileSync(
                        k.configFile(),
                        fs
                            .readFileSync(k.configFile(), "utf8")
                            .replace("[acct]\n", "[acct]\nworkspace_id = 1234\n"),
                    );
                    return {};
                });
            },
        });
        await vi.waitFor(async () => expect((await settled()).status).toBe("error"));
        expect(kernel.unityGateway.state.value).toMatchObject({ remedy: "selectWorkspace" });
        await when(kernel.connection.state, (s) => s.status === "connected");
        expect(await signInRows()).toContainEqual([
            "Unity Gateway connection",
            "acct · Signed in to the account, not a workspace",
        ]);
        const shown = menu();
        await run(SHOW_MENU).catch(() => {});
        expect(shown[0]?.[0]).toBe("$(list-selection) Select a workspace");

        const selecting = run("databricks.unityGateway.selectWorkspace");
        await vi.waitFor(() => expect(lastInput()?.placeholder).toBe("This updates profile acct"));
        lastInput().accept("Enter a workspace ID or URL…");
        await tick();
        lastInput().type("1234");
        lastInput().accept();
        await selecting;

        expect(kernel.runner.argv.filter((a) => a[1] === "login")).toEqual([
            ["auth", "login", "--host", `${U}?w=1234`, "--profile", "acct", "--timeout", "300s"],
        ]);
        expect(kernel.unityGateway.connection).toMatchObject({
            profile: "acct",
            workspaceId: "1234",
        });
        expect(
            fake.reporter.events
                .filter((e) => e.name === "accountOnlyProfile")
                .map((e) => e.properties?.["event.where"]),
        ).toEqual(["unityGateway"]);
    });

    it("offers switching the workspace and signing out while connected", async () => {
        const { kernel, settled } = setup({ saved: { profile: "ug", host: `${B}/` } });
        await vi.waitFor(async () => expect((await settled()).status).toBe("connected"));

        const shown = menu("$(sign-out) Sign out of Unity Gateway");
        await run(SHOW_MENU);
        expect(shown).toEqual([
            [
                "$(arrow-swap) Switch Unity Gateway workspace",
                "$(sign-out) Sign out of Unity Gateway",
            ],
        ]);
        expect(kernel.unityGateway.state.value.status).toBe("signedOut");
        expect(kernel.state.get(UNITY_GATEWAY_SAVED_PROFILE)).toBeUndefined();
        expect(item()?.visible).toBe(false);
    });

    it.each([
        // A session window's registry gives the feature's session entry instead.
        [
            { session: true },
            "Unity Gateway signs in with a profile, and a session window has none. Use Unity Gateway and its chat models from a local window.",
            // The fake session has no token, so its own connection fails and says so.
            ["Can't connect with the session's credentials: Profile 'session' has no token."],
        ],
        [{ isCursor: true }, "Unity Gateway isn't available in this window.", []],
    ])("is off when unavailable (%o)", async (where, message, connectionErrors) => {
        const { kernel, models } = setup({ saved: { profile: "ug", host: `${B}/` }, ...where });
        await when(kernel.connection.state, (s) => s.status !== "connecting");
        await tick();

        expect(kernel.contextKeys.get(UNITY_GATEWAY_UNAVAILABLE)).toBe(true);
        expect(item()).toBeUndefined();
        expect((await models()).ids).toEqual([]);
        await run("databricks.unityGateway.signIn");
        await run(SHOW_MENU);
        expect(vscode.errors.map((e) => e.message)).toEqual([
            ...connectionErrors,
            message,
            message,
        ]);
        expect(vscode.quickInputs).toEqual([]);
    });

    it("is available otherwise", () => {
        const { kernel } = setup();
        expect(kernel.contextKeys.get(UNITY_GATEWAY_UNAVAILABLE)).toBe(false);
    });
});

describe("unityGatewayStatus", () => {
    it.each<[ConnectionState, ReturnType<typeof unityGatewayStatus>]>([
        [{ status: "signedOut", reason: "Not signed in." }, undefined],
        [{ status: "connecting", profile: "ug", host: B }, undefined],
        [
            {
                status: "connected",
                connection: { host: B, profile: "ug", userName: "me" },
            } as ConnectionState,
            undefined,
        ],
        [
            { status: "error", profile: "ug", host: B, error: new Error("Invalid token") },
            {
                text: "$(warning) Unity Gateway: ug",
                tooltip: "Unity Gateway isn't connected\nInvalid token",
            },
        ],
    ])("%o", (state, expected) => {
        expect(unityGatewayStatus(state)).toEqual(expected);
    });
});

describe("modelsRow", () => {
    const connected = {
        status: "connected",
        connection: { host: B, profile: "ug", userName: "me" },
    } as ConnectionState;
    const ready = (...names: string[]) =>
        ({
            status: "ready",
            value: names.map((name) => ({ id: `system.ai.${name}`, name, family: name })),
        }) as const;

    it("offers the Unity Gateway sign-in while signed out, with a link in the hover", () => {
        const row = modelsRow({ status: "signedOut", reason: "Not signed in." }, ready());
        expect(row).toMatchObject({
            label: "Models",
            description: "Sign in to Unity Gateway to use them",
            contextValue: "databricks.unityGateway.models.signedOut",
            command: { command: "databricks.unityGateway.signIn" },
            iconPath: { id: "sign-in" },
            tooltip: {
                value: "Use Databricks models in VS Code Chat. [Learn more](https://docs.databricks.com/aws/en/ai-gateway/)",
            },
        });
    });

    it.each<[ConnectionState, string]>([
        [{ status: "connecting", profile: "ug", host: B }, "Connecting… · from ug"],
        [{ status: "connecting" }, "Connecting…"],
    ])("spins while connecting (%o)", (state, description) => {
        const row = modelsRow(state, { status: "idle" });
        expect(row).toMatchObject({
            description,
            contextValue: "databricks.unityGateway.models.connecting",
            iconPath: { id: "sync~spin" },
        });
        expect(row.command).toBeUndefined();
    });

    it("says how many models there are, and where they come from", () => {
        expect(modelsRow(connected, ready("a", "b"))).toMatchObject({
            description: "2 available · from ug",
            tooltip: `From Unity Gateway on ${B} with profile ug`,
            contextValue: "databricks.unityGateway.models.connected",
            iconPath: { id: "comment-discussion" },
            collapsibleState: TreeItemCollapsibleState.None,
            command: { title: "Choose a model in Chat", command: CHOOSE_MODEL },
        });
        expect(modelsRow(connected, ready("a")).description).toBe("1 available · from ug");
    });

    it.each([{ status: "idle" } as const, { status: "loading" } as const])(
        "spins while the models load (%o)",
        (models) => {
            expect(modelsRow(connected, models)).toMatchObject({
                description: "Loading… · from ug",
                iconPath: { id: "sync~spin" },
            });
        },
    );

    it("says when the workspace has none, and has no command to click", () => {
        expect(modelsRow(connected, ready())).toMatchObject({
            description: "None available · from ug",
            tooltip: `From Unity Gateway on ${B} with profile ug\nThis workspace has no model on Unity Gateway's Responses route.`,
            collapsibleState: TreeItemCollapsibleState.None,
        });
        expect(modelsRow(connected, ready()).command).toBeUndefined();
    });

    it.each<[string, UnityGatewayModelsState]>([
        ["loading", { status: "loading" }],
        ["idle", { status: "idle" }],
        ["none", ready()],
        ["failed", { status: "error", error: new Error("No USE CATALOG") }],
    ])("has no command to click while the models are %s", (_, models) => {
        expect(modelsRow(connected, models).command).toBeUndefined();
    });

    it.each<[string, ConnectionState, UnityGatewayModelsState]>([
        ["signed out", { status: "signedOut", reason: "Not signed in." }, ready("a")],
        ["connecting", { status: "connecting", profile: "ug", host: B }, ready("a")],
        ["not connected", { status: "error", error: new Error("Invalid token") }, ready("a")],
        ["loading", connected, { status: "loading" }],
        ["can't list", connected, { status: "error", error: new Error("No USE CATALOG") }],
        ["connected", connected, ready("a", "b")],
    ])("never expands, so a click is the only action on the row (%s)", (_, state, models) => {
        expect(modelsRow(state, models).collapsibleState).toBe(TreeItemCollapsibleState.None);
    });

    it("says why it can't list them", () => {
        const failed = { status: "error", error: new Error("No USE CATALOG") } as const;
        expect(modelsRow(connected, failed)).toMatchObject({
            description: "Can't list them · from ug",
            tooltip: `From Unity Gateway on ${B} with profile ug\nCan't list the Unity Gateway models\nNo USE CATALOG`,
            iconPath: { id: "warning" },
        });
    });

    it("says it isn't connected after an error, naming the profile, and opens the menu", () => {
        const error = {
            status: "error",
            profile: "ug",
            host: B,
            error: new Error("Invalid token"),
        } as const;
        expect(modelsRow(error, { status: "idle" })).toMatchObject({
            description: "Not connected · ug",
            tooltip: "Unity Gateway isn't connected\nInvalid token",
            contextValue: "databricks.unityGateway.models.error",
            command: { command: SHOW_MENU },
            iconPath: { id: "warning" },
        });
        expect(
            modelsRow({ status: "error", error: new Error("Invalid token") }, { status: "idle" })
                .description,
        ).toBe("Not connected");
    });

    it("has no switch or sign-out of its own: the Connection view's row has them", () => {
        const manifest: {
            contributes: {
                menus: Record<string, { command?: string; when?: string }[]>;
            };
        } = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../../package.json"), "utf-8"));
        const menus =
            manifest.contributes.menus["view/item/context"]?.filter((m) =>
                m.when?.includes("viewItem =~ /^databricks\\.unityGateway\\.models"),
            ) ?? [];
        expect(menus).toEqual([]);
    });
});
