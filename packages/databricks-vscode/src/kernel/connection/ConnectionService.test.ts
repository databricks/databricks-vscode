import { describe, expect, it, vi } from "vitest";
import { CliError } from "../cli/Cli";
import { StateStore } from "../../platform/state";
import { MutableState, when } from "../../platform/reactive";
import { detectHost } from "../host/Host";
import { fakeLog, fakeMemento } from "../../test-support/fakes";
import { HostMetadataCache } from "./hostMetadata";
import { FakeHttpClient, SCIM_ME } from "../../test-support/fakeHttp";
import {
    ConnectionService,
    identityOf,
    NO_PROJECT_CHOICE,
    type ConnectionState,
    type ProjectConnectionSource,
    type ProjectScope,
} from "./ConnectionService";
import { Profiles, type ProfileInfo, type ProfilesSnapshot } from "./Profiles";
import { WORKSPACE_IDS_BY_HOST, WorkspaceIdLedger } from "./WorkspaceIds";

const A = "https://a.cloud.databricks.com";
const pat = (name: string, host = A): ProfileInfo => ({
    name,
    host,
    authType: "pat",
    profile: { name, host, token: { value: `dapi-${name}` } as never },
});

function setup(
    options: {
        profiles?: ProfileInfo[];
        env?: Record<string, string>;
        session?: boolean;
        http?: FakeHttpClient;
        u2mToken?: () => Promise<{ value: string }>;
        project?: ProjectConnectionSource;
    } = {},
) {
    let snapshot: ProfilesSnapshot = {
        configFile: "/cfg",
        exists: true,
        profiles: options.profiles ?? [pat("DEFAULT"), pat("dev")],
    };
    let fire: () => void = () => {};
    const profiles = new Profiles(
        () => "/cfg",
        (_f, onChange) => {
            fire = onChange;
            return { dispose: () => {} };
        },
        async () => snapshot,
    );
    const http =
        options.http ??
        new FakeHttpClient().on("GET", SCIM_ME, (req) => ({
            body: { userName: `user-of-${req.headers.get("Authorization")}` },
            headers: { "x-databricks-org-id": "1234" },
        }));
    const state = new StateStore({ global: fakeMemento(), workspace: fakeMemento() });
    const service = new ConnectionService({
        profiles,
        hostMetadata: new HostMetadataCache(http),
        state,
        env: options.env ?? {},
        identity: options.session
            ? identityOf(
                  detectHost(
                      { ...options.env, DATABRICKS_REMOTE_ENV: "1" },
                      { remoteName: "ssh-remote" },
                  ),
              )
            : { kind: "profiles" },
        workspaces: new WorkspaceIdLedger(state),
        sources: {
            u2mToken: options.u2mToken ?? (async () => ({ value: "u2m" })),
            azureCliToken: async () => ({ value: "az" }),
        },
        project: options.project,
        log: fakeLog(),
        httpClient: http,
    });
    const settle = () => when(service.state, (s) => s.status !== "connecting");
    return {
        service,
        state,
        http,
        settle,
        setProfiles: (p: ProfileInfo[]) => {
            snapshot = { ...snapshot, profiles: p };
            fire();
        },
    };
}

const summary = (s: ConnectionState) =>
    s.status === "connected"
        ? `connected ${s.connection.profile} ${s.connection.userName}`
        : s.status === "signedOut"
          ? `signedOut: ${s.reason}`
          : s.status === "error"
            ? `error: ${s.error.message}`
            : s.status;

describe("ConnectionService", () => {
    it("connects to the CLI default profile without a project", async () => {
        const { service, settle } = setup();
        service.start();
        const s = await settle();
        expect(summary(s)).toBe("connected DEFAULT user-of-Bearer dapi-DEFAULT");
        expect(service.connection).toMatchObject({
            host: A,
            workspaceId: "1234",
            authType: "pat",
            source: { kind: "defaultProfile" },
            child: { kind: "profile", host: A, profile: "DEFAULT", authType: "pat" },
        });
    });

    it("switches profile and records the choice", async () => {
        const { service, settle, state } = setup();
        service.start();
        await settle();
        const s = await service.useProfile("dev");
        expect(summary(s)).toBe("connected dev user-of-Bearer dapi-dev");
        expect(state.get(NO_PROJECT_CHOICE)).toEqual({ profile: "dev" });
        expect(service.connection?.source).toEqual({ kind: "saved" });
    });

    it("stays signed out after signing out, with a hint for the next sign-in", async () => {
        const { service, settle, setProfiles } = setup();
        service.start();
        await settle();
        await service.signOut();
        expect(service.state.value).toMatchObject({
            status: "signedOut",
            reason: "You signed out.",
            hint: { host: A, profile: "DEFAULT" },
        });
        // A config change doesn't sign back in.
        setProfiles([pat("DEFAULT"), pat("other")]);
        await new Promise((r) => setTimeout(r, 250));
        expect(service.state.value.status).toBe("signedOut");
    });

    it("reconnects when the profile's content changes, and not otherwise", async () => {
        const { service, settle, setProfiles, http } = setup();
        service.start();
        await settle();
        setProfiles([pat("DEFAULT"), pat("dev"), pat("extra")]);
        await new Promise((r) => setTimeout(r, 250));
        expect(http.to(SCIM_ME)).toHaveLength(1);
        setProfiles([
            {
                ...pat("DEFAULT"),
                profile: { name: "DEFAULT", host: A, token: { value: "dapi-new" } as never },
            },
        ]);
        // Until the reconnect lands: `settle` alone can still see the old connection.
        await vi.waitFor(async () =>
            expect(summary(await settle())).toBe("connected DEFAULT user-of-Bearer dapi-new"),
        );
    });

    it("reports a failed me call as an error with the profile and host", async () => {
        const http = new FakeHttpClient().on("GET", SCIM_ME, {
            status: 401,
            body: { error_code: "UNAUTHENTICATED", message: "bad token" },
        });
        const { service, settle } = setup({ http });
        service.start();
        const s = await settle();
        expect(s).toMatchObject({ status: "error", profile: "DEFAULT", host: A });
        expect(summary(s)).toBe("error: bad token");
    });

    it("offers signing in again when the CLI can't refresh a U2M token", async () => {
        const u2m: ProfileInfo = {
            name: "DEFAULT",
            host: A,
            authType: "databricks-cli",
            profile: { name: "DEFAULT", host: A },
        };
        const { service, settle } = setup({
            profiles: [u2m],
            u2mToken: async () => {
                throw new CliError(["auth", "token"], 1, "refresh token is invalid", "");
            },
        });
        service.start();
        expect(await settle()).toMatchObject({ status: "error", remedy: "signInAgain" });
    });

    it("uses the session's credentials in a session window", async () => {
        const { service, settle, http } = setup({
            session: true,
            env: {
                DATABRICKS_HOST: "https://r.cloud.databricks.com",
                DATABRICKS_TOKEN: "dapi-env",
            },
        });
        service.start();
        await settle();
        expect(service.connection).toMatchObject({
            host: "https://r.cloud.databricks.com",
            profile: undefined,
            authType: "pat",
            child: { kind: "session" },
        });
        expect(http.requests[0]!.headers.get("Authorization")).toBe("Bearer dapi-env");
    });

    it("records which workspace a host served when nothing named one, for session windows, and nothing from a session", async () => {
        const local = setup({ profiles: [pat("DEFAULT"), { ...pat("named"), workspaceId: "9" }] });
        local.service.start();
        await local.settle();
        await vi.waitFor(() =>
            expect(local.state.get(WORKSPACE_IDS_BY_HOST)).toEqual({ [A]: ["1234"] }),
        );
        // A profile that names its workspace says nothing about what the host serves otherwise.
        await local.service.useProfile("named");
        expect(local.state.get(WORKSPACE_IDS_BY_HOST)).toEqual({ [A]: ["1234"] });

        const session = setup({
            session: true,
            env: { DATABRICKS_HOST: "https://r.cloud.databricks.com", DATABRICKS_TOKEN: "t" },
        });
        session.service.start();
        expect((await session.settle()).status).toBe("connected");
        expect(session.state.get(WORKSPACE_IDS_BY_HOST)).toEqual({});
    });

    it("says a session's rejected token needs a new session, which no reconnect gives", async () => {
        const { service, settle } = setup({
            session: true,
            env: { DATABRICKS_HOST: "https://r.cloud.databricks.com", DATABRICKS_TOKEN: "expired" },
            http: new FakeHttpClient().on("GET", SCIM_ME, {
                status: 401,
                body: { error_code: "UNAUTHENTICATED", message: "Invalid access token." },
            }),
        });
        service.start();
        expect(await settle()).toMatchObject({ status: "error", remedy: "restartSession" });
        expect(await service.reconnect()).toMatchObject({
            status: "error",
            remedy: "restartSession",
        });
    });

    it("refuses, in a session window, to use a profile or sign out, and writes no choice local windows would read", async () => {
        const { service, settle, state } = setup({
            session: true,
            env: {
                DATABRICKS_HOST: "https://r.cloud.databricks.com",
                DATABRICKS_TOKEN: "dapi-env",
            },
        });
        service.start();
        await settle();
        await expect(service.signOut()).rejects.toThrow(
            "A session window can't sign out: its credentials come from the SSH tunnel.",
        );
        await expect(service.useProfile("dev")).rejects.toThrow("can't use a profile");
        expect(state.get(NO_PROJECT_CHOICE)).toBeUndefined();
        expect(service.connection?.host).toBe("https://r.cloud.databricks.com");
    });

    it("lets the latest resolution win", async () => {
        const order: string[] = [];
        let releaseFirst!: () => void;
        const gate = new Promise<void>((r) => (releaseFirst = r));
        const http = new FakeHttpClient().on("GET", SCIM_ME, async (req) => {
            const auth = req.headers.get("Authorization")!;
            if (auth.endsWith("DEFAULT")) {
                await gate;
            }
            order.push(auth);
            return { body: { userName: auth } };
        });
        const { service, settle } = setup({ http });
        service.start();
        await vi.waitFor(() => expect(http.requests).toHaveLength(1));
        const switched = service.useProfile("dev");
        await vi.waitFor(() => expect(http.requests).toHaveLength(2));
        releaseFirst();
        await switched;
        expect(summary(await settle())).toBe("connected dev Bearer dapi-dev");
    });
});

/** A project source over a state the test controls; it saves into the scope, as the target file would. */
function fakeProject(project: ProjectScope | undefined, initialized = true) {
    const scope = new MutableState<{ initialized: boolean; project?: ProjectScope }>({
        initialized,
        project,
    });
    const saved: (string | undefined)[] = [];
    const update = (change: Partial<ProjectScope>) =>
        scope.set({ initialized: true, project: { ...scope.value.project!, ...change } });
    const source: ProjectConnectionSource = {
        scope,
        saveProfile: async (profile) => {
            saved.push(profile);
            update({ savedProfile: profile });
        },
        saveSignedOut: async (signedOut) => update({ signedOut }),
    };
    return { source, scope, saved };
}

const B = "https://b.cloud.databricks.com";
const dev: ProjectScope = { root: "/w", target: "dev", host: A };

describe("ConnectionService in a project", () => {
    it("waits for the project to be detected before resolving", async () => {
        const project = fakeProject(undefined, false);
        const { service, http } = setup({
            project: project.source,
            profiles: [pat("DEFAULT"), pat("prod", B)],
        });
        service.start();
        await new Promise((r) => setTimeout(r, 250));
        expect(service.state.value.status).toBe("connecting");
        expect(http.requests).toHaveLength(0);
        project.scope.set({ initialized: true, project: { root: "/w", target: "dev", host: B } });
        expect(summary(await when(service.state, (s) => s.status !== "connecting"))).toBe(
            "connected prod user-of-Bearer dapi-prod",
        );
    });

    it("connects with the only profile for the target's host, and saves it for the target", async () => {
        const project = fakeProject({ root: "/w", target: "dev", host: B });
        const { service, settle } = setup({
            project: project.source,
            profiles: [pat("DEFAULT"), pat("prod", B)],
        });
        service.start();
        await settle();
        expect(service.connection).toMatchObject({
            profile: "prod",
            source: { kind: "onlyProfileForHost", host: B },
        });
        await vi.waitFor(() => expect(project.saved).toEqual(["prod"]));
        // Saving doesn't reconnect; only the reason changes, and the connection keeps its clients.
        const api = service.connection!.api;
        await vi.waitFor(() =>
            expect(service.connection?.source).toEqual({ kind: "savedForTarget", target: "dev" }),
        );
        expect(service.connection!.api).toBe(api);
    });

    it("signs out with the candidates when several profiles match", async () => {
        const project = fakeProject(dev);
        const { service, settle } = setup({ project: project.source });
        service.start();
        expect(await settle()).toMatchObject({
            status: "signedOut",
            reason: "Profiles DEFAULT and dev both match https://a.cloud.databricks.com.",
            hint: { host: A },
            candidates: ["DEFAULT", "dev"],
        });
    });

    it("saves an explicit choice for the target, not for windows without a project", async () => {
        const project = fakeProject(dev);
        const { service, settle, state } = setup({ project: project.source });
        service.start();
        await settle();
        const s = await service.useProfile("dev");
        expect(summary(s)).toBe("connected dev user-of-Bearer dapi-dev");
        expect(project.saved).toEqual(["dev"]);
        expect(state.get(NO_PROJECT_CHOICE)).toBeUndefined();
        expect(service.connection?.source).toEqual({ kind: "savedForTarget", target: "dev" });
    });

    it("signs out of the target and stays signed out until a profile is chosen", async () => {
        const project = fakeProject({ ...dev, savedProfile: "dev" });
        const { service, settle, setProfiles } = setup({ project: project.source });
        service.start();
        await settle();
        await service.signOut();
        expect(service.state.value).toMatchObject({
            status: "signedOut",
            reason: "You signed out of target 'dev'.",
        });
        expect(project.scope.value.project?.signedOut).toBe(true);
        setProfiles([pat("DEFAULT"), pat("dev"), pat("extra")]);
        await new Promise((r) => setTimeout(r, 250));
        expect(service.state.value.status).toBe("signedOut");
        // Another target, with its own file, isn't signed out.
        project.scope.set({
            initialized: true,
            project: { ...dev, target: "other", savedProfile: "dev" },
        });
        await vi.waitFor(() => expect(service.connection?.profile).toBe("dev"));
        project.scope.set({
            initialized: true,
            project: { ...dev, savedProfile: "dev", signedOut: true },
        });
        await vi.waitFor(() => expect(service.state.value.status).toBe("signedOut"));
        await service.useProfile("DEFAULT");
        expect(project.scope.value.project?.signedOut).toBe(false);
        expect(service.connection?.profile).toBe("DEFAULT");
    });

    it("keeps the connection when the project goes away and the default is the same profile", async () => {
        const project = fakeProject({ ...dev, savedProfile: "DEFAULT" });
        const { service, settle, http } = setup({ project: project.source });
        service.start();
        await settle();
        project.scope.set({ initialized: true });
        await vi.waitFor(() =>
            expect(service.connection?.source).toEqual({ kind: "defaultProfile" }),
        );
        expect(http.to(SCIM_ME)).toHaveLength(1);
    });

    it("switches to the no-project resolution when the project goes away", async () => {
        const project = fakeProject({ ...dev, savedProfile: "dev" });
        const { service, settle } = setup({ project: project.source });
        service.start();
        await settle();
        project.scope.set({ initialized: true });
        await vi.waitFor(() => expect(service.connection?.profile).toBe("DEFAULT"));
        expect(service.project).toBeUndefined();
    });

    it("ignores the project in a session window", async () => {
        const project = fakeProject(undefined, false);
        const { service, settle } = setup({
            project: project.source,
            session: true,
            env: {
                DATABRICKS_HOST: "https://r.cloud.databricks.com",
                DATABRICKS_TOKEN: "dapi-env",
            },
        });
        service.start();
        expect((await settle()).status).toBe("connected");
        expect(service.project).toBeUndefined();
    });
});
