/* eslint-disable @typescript-eslint/naming-convention */

import assert from "assert";
import {ApiClient, WorkspaceClient} from "@databricks/sdk-experimental";
import {anything, deepEqual, instance, mock, verify, when} from "ts-mockito";
import {CliWrapper} from "../cli/CliWrapper";
import {ProfileAuthProvider} from "../configuration/auth/AuthProvider";
import type {ConnectionState} from "../configuration/ConnectionManager";
import {StateStorage} from "../vscode-objs/StateStorage";
import {UnityGatewayConnectionManager} from "./UnityGatewayConnectionManager";

const PROFILE_KEY = "databricks.unityGateway.savedProfile";
const WORKSPACE_ID = "1234";

/** What signing in with `profile(name)` saves. */
function saved(name: string) {
    return {
        profile: name,
        host: `https://${name}.cloud.databricks.com/`,
        workspaceId: WORKSPACE_ID,
    };
}

describe(__filename, () => {
    let mockStateStorage: StateStorage;
    let unreachableProfiles: Set<string>;
    let apiClients: Map<string, ApiClient>;
    let restoredProfiles: string[];
    let manager: UnityGatewayConnectionManager;
    let states: ConnectionState[];

    /**
     * A signed-in profile on its own workspace. Its workspace client fails to
     * load the workspace while the profile is in `unreachableProfiles`.
     */
    function profile(name: string): ProfileAuthProvider {
        const mockWorkspaceClient = mock(WorkspaceClient);
        // DatabricksWorkspace.load() reads the org id from a header on the
        // currentUser.me() response and (best-effort) the workspace conf.
        when(mockWorkspaceClient.currentUser).thenReturn({
            me: async () => {
                if (unreachableProfiles.has(name)) {
                    throw new Error(`${name} is unreachable`);
                }
                return {
                    "userName": "test@databricks.com",
                    "x-databricks-org-id": WORKSPACE_ID,
                } as any;
            },
        } as any);
        const apiClient = instance(mock(ApiClient));
        apiClients.set(name, apiClient);
        when(mockWorkspaceClient.apiClient).thenReturn(apiClient);

        const mockAuthProvider = mock(ProfileAuthProvider);
        when(mockAuthProvider.profile).thenReturn(name);
        when(mockAuthProvider.host).thenReturn(
            new URL(`https://${name}.cloud.databricks.com`)
        );
        when(mockAuthProvider.getWorkspaceClient()).thenResolve(
            instance(mockWorkspaceClient)
        );
        return instance(mockAuthProvider);
    }

    function workspaceHost() {
        return manager.databricksWorkspace?.host.toString();
    }

    beforeEach(() => {
        mockStateStorage = mock<StateStorage>();
        // Unstubbed ts-mockito calls return null; StateStorage returns
        // undefined for a missing key.
        when(mockStateStorage.get(PROFILE_KEY)).thenReturn(undefined);
        when(mockStateStorage.set(anything(), anything())).thenResolve();
        unreachableProfiles = new Set();
        apiClients = new Map();
        restoredProfiles = [];
        manager = new UnityGatewayConnectionManager(
            instance(mock(CliWrapper)),
            instance(mockStateStorage),
            async (name) => {
                restoredProfiles.push(name);
                if (name === "deleted") {
                    throw new Error("profile not found");
                }
                return profile(name);
            }
        );
        states = [];
        manager.onDidChange(() => states.push(manager.state));
    });

    afterEach(() => {
        manager.dispose();
    });

    describe("signIn", () => {
        it("connects and saves the profile with its host", async () => {
            await manager.signIn(profile("a"));

            assert.equal(manager.state, "CONNECTED");
            assert.equal(workspaceHost(), "https://a.cloud.databricks.com/");
            assert.equal(manager.apiClient, apiClients.get("a"));
            verify(
                mockStateStorage.set(PROFILE_KEY, deepEqual(saved("a")))
            ).once();
            assert.deepStrictEqual(states, ["CONNECTING", "CONNECTED"]);
        });

        it("stays signed out and remembers nothing when it fails", async () => {
            unreachableProfiles.add("a");

            await assert.rejects(
                () => manager.signIn(profile("a")),
                /a is unreachable/
            );

            assert.equal(manager.state, "DISCONNECTED");
            assert.equal(manager.databricksWorkspace, undefined);
            verify(mockStateStorage.set(anything(), anything())).never();
            assert.deepStrictEqual(states, ["CONNECTING", "DISCONNECTED"]);
        });

        it("switches workspace", async () => {
            await manager.signIn(profile("a"));
            states = [];

            await manager.signIn(profile("b"));

            assert.equal(workspaceHost(), "https://b.cloud.databricks.com/");
            verify(
                mockStateStorage.set(PROFILE_KEY, deepEqual(saved("b")))
            ).once();
            assert.deepStrictEqual(states, ["CONNECTING", "CONNECTED"]);
        });

        it("disconnects, keeping the saved profile, when switching fails", async () => {
            await manager.signIn(profile("a"));
            unreachableProfiles.add("b");
            states = [];

            await assert.rejects(
                () => manager.signIn(profile("b")),
                /b is unreachable/
            );

            assert.equal(manager.state, "DISCONNECTED");
            assert.equal(manager.databricksWorkspace, undefined);
            verify(
                mockStateStorage.set(PROFILE_KEY, deepEqual(saved("b")))
            ).never();
            assert.deepStrictEqual(states, ["CONNECTING", "DISCONNECTED"]);
        });

        it("saves the profile before reporting CONNECTED", async () => {
            const savedWhen: ConnectionState[] = [];
            when(
                mockStateStorage.set(PROFILE_KEY, deepEqual(saved("a")))
            ).thenCall(async () => {
                savedWhen.push(manager.state);
            });

            await manager.signIn(profile("a"));

            assert.deepStrictEqual(savedWhen, ["CONNECTING"]);
        });

        it("stays signed out, and reports it, when the profile can't be saved", async () => {
            when(
                mockStateStorage.set(PROFILE_KEY, deepEqual(saved("a")))
            ).thenReject(new Error("can't write"));

            await assert.rejects(
                () => manager.signIn(profile("a")),
                /can't write/
            );

            assert.equal(manager.state, "DISCONNECTED");
            assert.equal(manager.databricksWorkspace, undefined);
            assert.equal(manager.hasSavedProfile, false);
            assert.deepStrictEqual(states, ["CONNECTING", "DISCONNECTED"]);
        });
    });

    describe("restore", () => {
        it("does nothing when no profile is remembered", async () => {
            await manager.restore();

            assert.equal(manager.state, "DISCONNECTED");
            assert.deepStrictEqual(restoredProfiles, []);
            assert.deepStrictEqual(states, []);
        });

        it("reconnects with the remembered profile", async () => {
            when(mockStateStorage.get(PROFILE_KEY)).thenReturn(saved("a"));

            await manager.restore();

            assert.equal(manager.state, "CONNECTED");
            assert.equal(workspaceHost(), "https://a.cloud.databricks.com/");
            assert.deepStrictEqual(restoredProfiles, ["a"]);
        });

        it("keeps a profile it can't load, without throwing", async () => {
            when(mockStateStorage.get(PROFILE_KEY)).thenReturn(
                saved("deleted")
            );

            await manager.restore();

            assert.equal(manager.state, "DISCONNECTED");
            verify(mockStateStorage.set(anything(), anything())).never();
            assert.deepStrictEqual(states, []);
        });

        it("skips a profile that now points at another host, and keeps it", async () => {
            when(mockStateStorage.get(PROFILE_KEY)).thenReturn({
                ...saved("a"),
                host: "https://elsewhere.cloud.databricks.com/",
            });

            await manager.restore();

            assert.equal(manager.state, "DISCONNECTED");
            assert.equal(manager.hasSavedProfile, true);
            verify(mockStateStorage.set(anything(), anything())).never();
            assert.deepStrictEqual(states, []);
        });

        it("skips a profile on the same host with another workspace id, and keeps it", async () => {
            // A unified host serves several workspaces.
            when(mockStateStorage.get(PROFILE_KEY)).thenReturn({
                ...saved("a"),
                workspaceId: "2222",
            });

            await manager.restore();

            assert.equal(manager.state, "DISCONNECTED");
            assert.equal(manager.databricksWorkspace, undefined);
            assert.equal(manager.hasSavedProfile, true);
            verify(mockStateStorage.set(anything(), anything())).never();
            assert.deepStrictEqual(states, ["CONNECTING", "DISCONNECTED"]);
        });

        it("keeps the profile when the workspace can't be reached, and retries next time", async () => {
            when(mockStateStorage.get(PROFILE_KEY)).thenReturn(saved("a"));
            unreachableProfiles.add("a");

            await manager.restore();

            assert.equal(manager.state, "DISCONNECTED");
            verify(mockStateStorage.set(anything(), anything())).never();
            assert.deepStrictEqual(states, ["CONNECTING", "DISCONNECTED"]);

            unreachableProfiles.delete("a");
            await manager.restore();

            assert.equal(manager.state, "CONNECTED");
        });

        it("does nothing when already connected", async () => {
            when(mockStateStorage.get(PROFILE_KEY)).thenReturn(saved("a"));
            await manager.signIn(profile("a"));
            states = [];

            await manager.restore();

            assert.deepStrictEqual(restoredProfiles, []);
            assert.deepStrictEqual(states, []);
        });

        it("runs once when called concurrently", async () => {
            when(mockStateStorage.get(PROFILE_KEY)).thenReturn(saved("a"));

            await Promise.all([manager.restore(), manager.restore()]);

            assert.deepStrictEqual(restoredProfiles, ["a"]);
        });
    });

    describe("disconnect", () => {
        it("drops the connection but keeps the profile for restore", async () => {
            await manager.signIn(profile("a"));
            when(mockStateStorage.get(PROFILE_KEY)).thenReturn(saved("a"));
            states = [];

            await manager.disconnect();

            assert.equal(manager.state, "DISCONNECTED");
            assert.equal(manager.apiClient, undefined);
            verify(mockStateStorage.set(PROFILE_KEY, undefined)).never();
            assert.deepStrictEqual(states, ["DISCONNECTED"]);

            await manager.restore();

            assert.equal(workspaceHost(), "https://a.cloud.databricks.com/");
        });
    });

    describe("hasSavedProfile", () => {
        it("is true while a profile is saved, even if restoring it failed", async () => {
            assert.equal(manager.hasSavedProfile, false);

            when(mockStateStorage.get(PROFILE_KEY)).thenReturn(
                saved("deleted")
            );
            await manager.restore();

            assert.equal(manager.state, "DISCONNECTED");
            assert.equal(manager.hasSavedProfile, true);
        });
    });

    describe("signOut", () => {
        it("forgets a profile that failed to restore, and reports the change", async () => {
            when(mockStateStorage.get(PROFILE_KEY)).thenReturn(
                saved("deleted")
            );
            await manager.restore();

            await manager.signOut();

            verify(mockStateStorage.set(PROFILE_KEY, undefined)).once();
            assert.deepStrictEqual(states, ["DISCONNECTED"]);
        });

        it("drops the connection and forgets the profile", async () => {
            await manager.signIn(profile("a"));
            states = [];

            await manager.signOut();

            assert.equal(manager.state, "DISCONNECTED");
            assert.equal(manager.databricksWorkspace, undefined);
            assert.equal(manager.apiClient, undefined);
            verify(mockStateStorage.set(PROFILE_KEY, undefined)).once();
            assert.deepStrictEqual(states, ["DISCONNECTED"]);
        });
    });
});
