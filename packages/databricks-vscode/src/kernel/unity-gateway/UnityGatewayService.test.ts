import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { when } from "../../platform/reactive";
import { StateStore } from "../../platform/state";
import { fakeKernel, fakeLog, fakeMemento } from "../../test-support/fakes";
import { FakeHttpClient, SCIM_ME, type FakeResponse } from "../../test-support/fakeHttp";
import { SERVERLESS_SESSION } from "../../test-support/sessionEnv";
import { useTempDirs } from "../../test-support/tempDir";
import { NO_PROJECT_CHOICE } from "../connection/ConnectionService";
import { bindToConnection } from "../feature";
import {
    UNITY_GATEWAY_SAVED_PROFILE,
    UNITY_GATEWAY_SIGNED_IN_BEFORE,
    type SavedUnityGatewayProfile,
} from "./UnityGatewayService";

const A = "https://a.cloud.databricks.com";
const B = "https://b.cloud.databricks.com";
const C = "https://c.cloud.databricks.com";
const CONFIG = [
    `[DEFAULT]\nhost = ${A}\ntoken = dapi-default`,
    `[ug]\nhost = ${B}\ntoken = dapi-ug`,
    `[u2m]\nhost = ${B}\nauth_type = databricks-cli`,
    `[down]\nhost = ${C}\ntoken = dapi-down`,
    `[nohost]\ntoken = dapi-nohost`,
].join("\n\n");
/** What the old extension saved for profile ug. */
const SAVED_UG: SavedUnityGatewayProfile = { profile: "ug", host: `${B}/`, workspaceId: "222" };
const OK_B: FakeResponse = {
    body: { userName: `user of ${B}` },
    headers: { "x-databricks-org-id": "222" },
};
const FAILED: FakeResponse = {
    status: 500,
    body: { error_code: "INTERNAL_ERROR", message: "workspace down" },
};
const tempDir = useTempDirs();

function answer(host: string): FakeResponse {
    return host === C
        ? FAILED
        : host === B
          ? OK_B
          : { body: { userName: `user of ${host}` }, headers: { "x-databricks-org-id": "111" } };
}

/** Holds SCIM calls to B until `release` answers them. */
function holdB() {
    const waiting: ((response: FakeResponse) => void)[] = [];
    return {
        me: (host: string) =>
            host === B
                ? new Promise<FakeResponse>((resolve) => waiting.push(resolve))
                : answer(host),
        waiting: () => waiting.length,
        release: (response: FakeResponse) =>
            waiting.splice(0).forEach((resolve) => resolve(response)),
    };
}

function setup(
    options: {
        saved?: SavedUnityGatewayProfile;
        session?: boolean;
        isCursor?: boolean;
        me?: (host: string) => FakeResponse | Promise<FakeResponse>;
    } = {},
) {
    const file = tempDir().write(".databrickscfg", CONFIG);
    const me = options.me ?? answer;
    const http = new FakeHttpClient().on("GET", SCIM_ME, (req) => me(new URL(req.url).origin));
    const global = fakeMemento();
    if (options.saved !== undefined) {
        global.store.set(UNITY_GATEWAY_SAVED_PROFILE.name, options.saved);
    }
    const log = fakeLog();
    const kernel = fakeKernel({
        env: { DATABRICKS_CONFIG_FILE: file },
        httpClient: http,
        state: new StateStore({ global, workspace: fakeMemento() }),
        log,
        ...(options.session ? { host: SERVERLESS_SESSION } : {}),
        ...(options.isCursor ? { isCursor: true } : {}),
    });
    const service = kernel.unityGateway;
    return {
        kernel,
        service,
        file,
        log,
        /** SCIM `me` calls to a host. */
        meCalls: (host: string) =>
            http.to(SCIM_ME).filter((r) => new URL(r.url).origin === host).length,
        saved: () => kernel.state.get(UNITY_GATEWAY_SAVED_PROFILE),
        signedInBefore: () => kernel.state.get(UNITY_GATEWAY_SIGNED_IN_BEFORE),
        settled: () => when(service.state, (s) => s.status !== "connecting"),
    };
}

describe("UnityGatewayService", () => {
    it("signs in with a profile, and saves it in the old extension's shape before it reports connected", async () => {
        const { kernel, service, saved } = setup();
        kernel.start();
        let savedWhenConnected: unknown;
        service.state.onDidChange((s) => {
            if (s.status === "connected") {
                savedWhenConnected = saved();
            }
        });

        const connection = await service.signIn("ug");

        expect(connection).toMatchObject({
            host: B,
            profile: "ug",
            userName: `user of ${B}`,
            workspaceId: "222",
            source: { kind: "unityGateway" },
        });
        expect(service.connection).toBe(connection);
        expect(saved()).toEqual(SAVED_UG);
        expect(savedWhenConnected).toEqual(SAVED_UG);
    });

    it("leaves the window's connection alone", async () => {
        const { kernel, service } = setup();
        kernel.start();
        await service.signIn("ug");
        const workspace = await when(kernel.connection.state, (s) => s.status !== "connecting");

        expect(workspace.status === "connected" && workspace.connection.profile).toBe("DEFAULT");
        expect(kernel.state.get(NO_PROJECT_CHOICE)).toBeUndefined();
    });

    it("switches to another profile", async () => {
        const { kernel, service, saved } = setup();
        kernel.start();
        await service.signIn("ug");
        await service.signIn("DEFAULT");

        expect(service.connection?.host).toBe(A);
        expect(saved()).toEqual({ profile: "DEFAULT", host: `${A}/`, workspaceId: "111" });
    });

    it("saves nothing when a sign-in fails, and shows the profile it tried", async () => {
        const { kernel, service, saved } = setup();
        kernel.start();

        await expect(service.signIn("down")).rejects.toThrow("workspace down");
        expect(service.state.value).toMatchObject({ status: "error", profile: "down" });
        await expect(service.signIn("gone")).rejects.toThrow("Profile 'gone' doesn't exist.");
        expect(service.state.value).toMatchObject({ status: "error", profile: "gone" });
        expect(saved()).toBeUndefined();
    });

    it("keeps the saved profile when a switch fails, and doesn't keep the previous connection", async () => {
        const { kernel, service, saved } = setup();
        kernel.start();
        await service.signIn("ug");

        await expect(service.signIn("down")).rejects.toThrow("workspace down");
        expect(service.connection).toBeUndefined();
        expect(service.state.value).toMatchObject({ status: "error", profile: "down" });
        expect(saved()).toEqual(SAVED_UG);
    });

    it("lets a newer sign-in win over one still under way", async () => {
        const held = holdB();
        const { kernel, service, saved } = setup({ me: held.me });
        kernel.start();
        const first = service.signIn("ug");
        await expect.poll(held.waiting).toBe(1);

        await service.signIn("DEFAULT");
        held.release(OK_B);
        await expect(first).rejects.toThrow(expect.objectContaining({ name: "CancelledError" }));
        expect(service.connection?.profile).toBe("DEFAULT");
        expect(saved()?.profile).toBe("DEFAULT");
    });

    it("signs out with a reason when its profile is deleted from the config file", async () => {
        const { kernel, service, file } = setup();
        kernel.start();
        await service.signIn("ug");

        fs.writeFileSync(file, `[DEFAULT]\nhost = ${A}\ntoken = dapi-default\n`);
        await kernel.connection.profiles.refresh("test");
        expect(service.state.value).toMatchObject({
            status: "signedOut",
            reason: "Profile 'ug' no longer exists.",
        });
    });

    it("stays connected when the config file changes and its profile is still there", async () => {
        const { kernel, service, file } = setup();
        kernel.start();
        await service.signIn("ug");

        fs.writeFileSync(file, `${CONFIG}\n\n[other]\nhost = ${C}\ntoken = dapi-other\n`);
        await kernel.connection.profiles.refresh("test");
        expect(service.connection?.profile).toBe("ug");
    });

    it("shows the profile a sign-in tried when it fails, not the saved one whose restore failed", async () => {
        const { kernel, service } = setup({ saved: { profile: "gone", host: `${B}/` } });
        kernel.start();
        await service.reconnect();
        expect(service.state.value).toMatchObject({ status: "error", profile: "gone" });

        await expect(service.signIn("down")).rejects.toThrow("workspace down");
        expect(service.state.value).toMatchObject({ status: "error", profile: "down" });
    });

    it.each([
        { late: "connects", response: OK_B },
        { late: "fails", response: FAILED },
    ])("keeps a sign-in when the restore it interrupted $late later", async ({ response }) => {
        const held = holdB();
        const { kernel, service, saved } = setup({ saved: SAVED_UG, me: held.me });
        kernel.start();
        const restoring = service.reconnect();
        await expect.poll(held.waiting).toBe(1);

        await service.signIn("DEFAULT");
        held.release(response);
        await restoring;
        expect(service.connection?.profile).toBe("DEFAULT");
        expect(saved()?.profile).toBe("DEFAULT");
    });

    it("shows the profile a sign-in tried when it fails, though a restore it interrupted is still under way", async () => {
        const held = holdB();
        const { kernel, service, saved } = setup({ saved: SAVED_UG, me: held.me });
        kernel.start();
        const restoring = service.reconnect();
        await expect.poll(held.waiting).toBe(1);

        await expect(service.signIn("down")).rejects.toThrow("workspace down");
        expect(service.state.value).toMatchObject({ status: "error", profile: "down" });
        held.release(OK_B);
        await restoring;
        expect(service.state.value).toMatchObject({ status: "error", profile: "down" });
        expect(saved()).toEqual(SAVED_UG);
    });

    it("restores again after a sign-in that interrupted the restore fails, rather than waiting on the interrupted one", async () => {
        const held = holdB();
        const { kernel, service } = setup({ saved: SAVED_UG, me: held.me });
        kernel.start();
        void service.reconnect();
        await expect.poll(held.waiting).toBe(1);
        await expect(service.signIn("down")).rejects.toThrow("workspace down");

        const again = service.reconnect();
        await expect.poll(held.waiting).toBe(2);
        held.release(OK_B);

        const state = await again;
        expect(state.status === "connected" && state.connection.profile).toBe("ug");
    });

    it("restores the saved sign-in at start", async () => {
        const { kernel, service, meCalls } = setup({ saved: SAVED_UG });
        kernel.start();
        // A second call while the first is in flight shares it.
        const state = await service.reconnect();

        expect(state.status === "connected" && state.connection.profile).toBe("ug");
        expect(meCalls(B)).toBe(1);
        // Already connected: nothing to do.
        await service.reconnect();
        expect(meCalls(B)).toBe(1);
    });

    it("stays signed out at start when nothing is saved", async () => {
        const { kernel, service } = setup();
        kernel.start();

        expect((await service.reconnect()).status).toBe("signedOut");
    });

    it.each([
        {
            why: "the profile is gone",
            saved: { profile: "gone", host: `${B}/` },
            message: "Profile 'gone' doesn't exist.",
        },
        {
            why: "the profile has no host",
            saved: { profile: "nohost", host: `${B}/` },
            message: "Profile 'nohost' has no valid host.",
        },
        {
            why: "the profile points at another host",
            saved: { profile: "ug", host: `${A}/` },
            message: `Profile 'ug' now points at ${B}, not ${A}.`,
        },
        {
            why: "the profile points at another workspace on the host",
            saved: { ...SAVED_UG, workspaceId: "999" },
            message: "Profile 'ug' now points at workspace 222, not 999.",
        },
        {
            why: "the workspace fails",
            saved: { profile: "down", host: `${C}/` },
            message: "workspace down",
        },
    ])(
        "keeps the saved profile when it can't be restored: $why",
        async ({ saved: before, message }) => {
            const { kernel, service, saved, log } = setup({ saved: before });
            kernel.start();
            const state = await service.reconnect();

            expect(state).toMatchObject({
                status: "error",
                profile: before.profile,
                host: before.host.replace(/\/$/, ""),
            });
            expect(state.status === "error" && state.error.message).toContain(message);
            // Only an expired OAuth session is fixed by signing in again.
            expect(state).not.toHaveProperty("remedy");
            expect(saved()).toEqual(before);
            expect(log.entries).toContainEqual(
                expect.objectContaining({
                    level: "error",
                    message: `Can't restore the Unity Gateway sign-in with profile ${before.profile}`,
                }),
            );
        },
    );

    it("tries again on reconnect after a failed restore", async () => {
        let calls = 0;
        const { kernel, service } = setup({
            saved: SAVED_UG,
            me: (host) => (host === B && ++calls === 1 ? FAILED : answer(host)),
        });
        kernel.start();
        expect((await service.reconnect()).status).toBe("error");

        expect((await service.reconnect()).status).toBe("connected");
    });

    it("doesn't call a host the saved profile no longer points at", async () => {
        const { kernel, service, meCalls } = setup({ saved: { profile: "ug", host: `${A}/` } });
        kernel.start();
        await service.reconnect();

        expect(meCalls(B)).toBe(0);
    });

    it("offers signing in again when the CLI can't refresh a U2M token", async () => {
        const { kernel, service } = setup({ saved: { profile: "u2m", host: `${B}/` } });
        kernel.runner.on(["auth", "token"], {
            exitCode: 1,
            stderr: "Error: refresh token is invalid. Run databricks auth login",
        });
        kernel.start();

        expect(await service.reconnect()).toMatchObject({
            status: "error",
            profile: "u2m",
            remedy: "signInAgain",
        });
    });

    it.each([{ session: true }, { isCursor: true }])(
        "does nothing when unavailable (%o)",
        async (where) => {
            const { kernel, service, saved, meCalls } = setup({ saved: SAVED_UG, ...where });
            kernel.start();

            expect(service.available).toBe(false);
            expect((await service.reconnect()).status).toBe("signedOut");
            await expect(service.signIn("ug")).rejects.toThrow(
                "Unity Gateway isn't available here.",
            );
            expect(meCalls(B)).toBe(0);
            expect(saved()).toEqual(SAVED_UG);
        },
    );

    it("signs out after a failed restore, and while connected", async () => {
        const { kernel, service, saved } = setup({ saved: { profile: "gone", host: `${B}/` } });
        kernel.start();
        expect((await service.reconnect()).status).toBe("error");

        await service.signOut();
        expect(saved()).toBeUndefined();
        expect(service.state.value.status).toBe("signedOut");

        await service.signIn("ug");
        await service.signOut();
        expect(saved()).toBeUndefined();
        expect(service.connection).toBeUndefined();
    });

    it("drops a sign-in that finishes after a sign-out", async () => {
        const held = holdB();
        const { kernel, service, saved } = setup({ me: held.me });
        kernel.start();
        const signingIn = service.signIn("ug");
        await expect.poll(held.waiting).toBe(1);

        await service.signOut();
        held.release(OK_B);

        await expect(signingIn).rejects.toThrow(
            expect.objectContaining({ name: "CancelledError" }),
        );
        expect(saved()).toBeUndefined();
        expect(service.state.value.status).toBe("signedOut");
    });

    it("copies a profile the first time, as its own sign-in, and nothing after a sign-out", async () => {
        const { kernel, service, saved, signedInBefore } = setup();
        kernel.start();
        expect(signedInBefore()).toBe(false);

        const copied = await service.copy("DEFAULT");
        expect(copied).toBe(service.connection);
        expect(copied).not.toBe(kernel.connection.connection);
        expect(saved()).toEqual({ profile: "DEFAULT", host: `${A}/`, workspaceId: "111" });
        expect(signedInBefore()).toBe(true);

        await service.signOut();
        expect(service.copy("ug")).toBeUndefined();
        expect(service.state.value.status).toBe("signedOut");
    });

    it("copies nothing after the user's own sign-in, even once signed out", async () => {
        const { kernel, service, signedInBefore } = setup();
        kernel.start();
        await service.signIn("ug");
        expect(service.copy("DEFAULT")).toBeUndefined();

        await service.signOut();
        expect(signedInBefore()).toBe(true);
        expect(service.copy("DEFAULT")).toBeUndefined();
    });

    it("copies nothing over a saved profile, restored or not", async () => {
        const { kernel, service, saved } = setup({ saved: SAVED_UG });
        expect(service.copy("DEFAULT")).toBeUndefined();
        kernel.start();
        await service.reconnect();

        expect(service.copy("DEFAULT")).toBeUndefined();
        expect(saved()).toEqual(SAVED_UG);
    });

    it("copies nothing after signing out of a profile the old extension saved", async () => {
        const { kernel, service, signedInBefore } = setup({ saved: SAVED_UG });
        kernel.start();
        await service.reconnect();
        expect(signedInBefore()).toBe(false);

        await service.signOut();
        expect(signedInBefore()).toBe(true);
        expect(service.copy("DEFAULT")).toBeUndefined();
    });

    it("saves nothing when a copy fails, so a later one tries again", async () => {
        const { kernel, service, saved, signedInBefore } = setup();
        kernel.start();

        await expect(service.copy("down")).rejects.toThrow("workspace down");
        expect(saved()).toBeUndefined();
        expect(signedInBefore()).toBe(false);
        expect(service.state.value).toMatchObject({ status: "error", profile: "down" });

        await service.copy("DEFAULT");
        expect(service.connection?.profile).toBe("DEFAULT");
    });

    it("lets a newer copy win over one still under way", async () => {
        const held = holdB();
        const { kernel, service, saved } = setup({ me: held.me });
        kernel.start();
        const first = service.copy("ug");
        await expect.poll(held.waiting).toBe(1);

        const second = service.copy("DEFAULT");
        expect(second).toBeDefined();
        await second;
        held.release(OK_B);

        await expect(first).rejects.toThrow(expect.objectContaining({ name: "CancelledError" }));
        expect(service.connection?.profile).toBe("DEFAULT");
        expect(saved()?.profile).toBe("DEFAULT");
    });

    it("doesn't copy over the user's own sign-in under way", async () => {
        const held = holdB();
        const { kernel, service, saved } = setup({ me: held.me });
        kernel.start();
        const signingIn = service.signIn("ug");
        await expect.poll(held.waiting).toBe(1);

        expect(service.copy("DEFAULT")).toBeUndefined();
        held.release(OK_B);
        await signingIn;
        expect(saved()?.profile).toBe("ug");
    });

    it.each([{ session: true }, { isCursor: true }])(
        "copies nothing where Unity Gateway is off (%o)",
        (where) => {
            const { service } = setup(where);
            expect(service.copy("DEFAULT")).toBeUndefined();
        },
    );

    it("works with whileConnected's lifetime", async () => {
        const { kernel, service } = setup();
        kernel.start();
        const events: string[] = [];
        bindToConnection(
            service,
            (c) => {
                events.push(`start ${c.profile}`);
                return { dispose: () => events.push(`end ${c.profile}`) };
            },
            fakeLog(),
        );

        await service.signIn("ug");
        await service.signOut();
        expect(events).toEqual(["start ug", "end ug"]);
    });
});
