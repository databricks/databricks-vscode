import type { Disposable } from "vscode";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPublicApi } from "./api";
import type {
    Connection,
    ConnectionState as KernelState,
} from "./kernel/connection/ConnectionService";
import type { Kernel } from "./kernel/feature";
import { disposeAll } from "./platform/event";
import { MutableState, when } from "./platform/reactive";
import { FAKE_CLI_PATH, fakeKernel } from "./test-support/fakes";
import { FakeHttpClient, SCIM_ME } from "./test-support/fakeHttp";
import { useTempDirs } from "./test-support/tempDir";

const tempDir = useTempDirs();
const A = "https://a.cloud.databricks.com";
const subscriptions: Disposable[] = [];
afterEach(() => disposeAll(subscriptions));

/** The real kernel; with `signedIn`, the DEFAULT profile has a token. */
function setup(options: { signedIn?: boolean } = {}) {
    const t = tempDir();
    const config = t.write(
        ".databrickscfg",
        options.signedIn === false ? "" : `[DEFAULT]\nhost = ${A}\ntoken = dapi-default\n`,
    );
    const http = new FakeHttpClient().on("GET", SCIM_ME, () => ({ body: { userName: "me" } }));
    const kernel = fakeKernel({ env: { DATABRICKS_CONFIG_FILE: config }, httpClient: http });
    const signIn = vi.fn(async () => {});
    const api = createPublicApi(kernel, signIn, subscriptions);
    return { kernel, api, signIn, config };
}

describe("the public API, version 2 (INFRA-08)", () => {
    it("describes the connection without SDK types, and gives its auth headers", async () => {
        const s = setup();
        const changed = vi.fn();
        s.api.onDidChangeConnection(changed);
        expect(s.api.version).toBe(2);
        expect(s.api.connection).toBeUndefined();
        s.kernel.start();
        await when(s.kernel.connection.state, (c) => c.status === "connected");
        expect(s.api.connection).toEqual({
            host: A,
            profile: "DEFAULT",
            authType: "pat",
            userName: "me",
        });
        expect(changed).toHaveBeenCalledOnce();
        expect(await s.api.getAuthHeaders()).toEqual({ Authorization: "Bearer dapi-default" });
        expect(s.api.configFile).toBe(s.config);
        expect(s.api.cliPath).toBe(FAKE_CLI_PATH);
    });

    it("rejects auth headers while signed out", async () => {
        const s = setup({ signedIn: false });
        s.kernel.start();
        await when(s.kernel.connection.state, (c) => c.status !== "connecting");
        await expect(s.api.getAuthHeaders()).rejects.toThrow(
            "Not connected to a Databricks workspace.",
        );
    });
});

describe("the version 1 state events", () => {
    /** Only the connection state is set: the API reads nothing else when it's created. */
    function stateApi(initial: KernelState) {
        const state = new MutableState<KernelState>(initial, (a, b) => a === b);
        const kernel = { connection: { state, connection: undefined } } as unknown as Kernel;
        const api = createPublicApi(kernel, async () => {}, subscriptions);
        const states: string[] = [];
        api.connectionManager.onDidChangeState((s) => states.push(s));
        return { state, states };
    }
    const connected = (): KernelState => ({ status: "connected", connection: {} as Connection });

    it("fires only when the version 1 state changes", () => {
        const { state, states } = stateApi({ status: "connecting" });
        state.set(connected());
        state.set(connected());
        expect(states).toEqual(["CONNECTED"]);
        state.set({ status: "connecting" });
        state.set(connected());
        state.set({ status: "error", error: new Error("boom") });
        state.set(connected());
        state.set({ status: "signedOut", reason: "You signed out." });
        expect(states).toEqual([
            "CONNECTED",
            "CONNECTING",
            "CONNECTED",
            "DISCONNECTED",
            "CONNECTED",
            "DISCONNECTED",
        ]);
    });

    it("fires the first change as DISCONNECTED with no profile, as the kernel's first signed-out state", () => {
        const { state, states } = stateApi({ status: "connecting" });
        state.set({ status: "signedOut", reason: "No profile." });
        expect(states).toEqual(["DISCONNECTED"]);
    });

    it("reports the startup order of version 2.x: CONNECTING, then CONNECTED", () => {
        // The kernel is already connecting when the API is created, then connects.
        const { state, states } = stateApi({ status: "connecting" });
        state.set({ status: "connecting", profile: "DEFAULT", host: A });
        state.set(connected());
        expect(states).toEqual(["CONNECTING", "CONNECTED"]);
    });
});

describe("the version 1 bridge", () => {
    it("waits for the connection and authenticates Headers, Maps and objects", async () => {
        const s = setup();
        const states: string[] = [];
        s.api.connectionManager.onDidChangeState((state) => states.push(state));
        s.kernel.start();
        await s.api.connectionManager.login();
        expect(s.api.connectionManager.state).toBe("CONNECTED");
        expect(states.at(-1)).toBe("CONNECTED");
        const client = s.api.connectionManager.workspaceClient!.apiClient;
        expect((await client.host).hostname).toBe("a.cloud.databricks.com");
        const headers = new Headers();
        await client.config.authenticate(headers);
        expect(headers.get("Authorization")).toBe("Bearer dapi-default");
        const map = new Map<string, string>();
        await s.api.connectionManager.apiClient!.config.authenticate(map);
        expect(map.get("Authorization")).toBe("Bearer dapi-default");
        const plain: Record<string, string> = {};
        await client.config.authenticate(plain);
        expect(plain).toEqual({ Authorization: "Bearer dapi-default" });
        expect(s.signIn).not.toHaveBeenCalled();
    });

    it("signs in for an interactive login while signed out, and rejects when that didn't connect", async () => {
        const s = setup({ signedIn: false });
        s.kernel.start();
        await expect(s.api.connectionManager.login()).rejects.toThrow("Not connected");
        expect(s.signIn).not.toHaveBeenCalled();
        await expect(s.api.connectionManager.login(true)).rejects.toThrow("Not connected");
        expect(s.signIn).toHaveBeenCalledOnce();
        expect(s.api.connectionManager.state).toBe("DISCONNECTED");
        expect(s.api.connectionManager.apiClient).toBeUndefined();
        expect(s.api.connectionManager.workspaceClient).toBeUndefined();
    });

    it("has no cluster, no serverless and no project folder without a project", () => {
        const s = setup();
        expect(s.api.connectionManager.cluster).toBeUndefined();
        expect(s.api.connectionManager.serverless).toBe(false);
        expect(s.api.connectionManager.workspaceFolderManager.activeProjectUri).toBeUndefined();
    });
});
