/* eslint-disable @typescript-eslint/naming-convention */

import assert from "assert";
import {ApiClient, WorkspaceClient} from "@databricks/sdk-experimental";
import {anything, instance, mock, verify, when} from "ts-mockito";
import {CliWrapper} from "../cli/CliWrapper";
import {ProfileAuthProvider} from "../configuration/auth/AuthProvider";
import type {ConnectionState} from "../configuration/ConnectionManager";
import {StateStorage} from "../vscode-objs/StateStorage";
import {UnityGatewayConnectionManager} from "./UnityGatewayConnectionManager";

const PROFILE_KEY = "databricks.unityGateway.profile";

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
                    "x-databricks-org-id": "1234",
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
        it("connects and remembers the profile", async () => {
            await manager.signIn(profile("a"));

            assert.equal(manager.state, "CONNECTED");
            assert.equal(workspaceHost(), "https://a.cloud.databricks.com/");
            assert.equal(manager.apiClient, apiClients.get("a"));
            verify(mockStateStorage.set(PROFILE_KEY, "a")).once();
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

        it("switches workspace without passing through CONNECTING", async () => {
            await manager.signIn(profile("a"));
            states = [];

            await manager.signIn(profile("b"));

            assert.equal(workspaceHost(), "https://b.cloud.databricks.com/");
            verify(mockStateStorage.set(PROFILE_KEY, "b")).once();
            assert.deepStrictEqual(states, ["CONNECTED"]);
        });

        it("keeps the current workspace when switching fails", async () => {
            await manager.signIn(profile("a"));
            unreachableProfiles.add("b");
            states = [];

            await assert.rejects(() => manager.signIn(profile("b")));

            assert.equal(manager.state, "CONNECTED");
            assert.equal(workspaceHost(), "https://a.cloud.databricks.com/");
            verify(mockStateStorage.set(PROFILE_KEY, "b")).never();
            assert.deepStrictEqual(states, []);
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
            when(mockStateStorage.get(PROFILE_KEY)).thenReturn("a");

            await manager.restore();

            assert.equal(manager.state, "CONNECTED");
            assert.equal(workspaceHost(), "https://a.cloud.databricks.com/");
            assert.deepStrictEqual(restoredProfiles, ["a"]);
        });

        it("keeps a profile it can't load, without throwing", async () => {
            when(mockStateStorage.get(PROFILE_KEY)).thenReturn("deleted");

            await manager.restore();

            assert.equal(manager.state, "DISCONNECTED");
            verify(mockStateStorage.set(anything(), anything())).never();
            assert.deepStrictEqual(states, []);
        });

        it("keeps the profile when the workspace can't be reached, and retries next time", async () => {
            when(mockStateStorage.get(PROFILE_KEY)).thenReturn("a");
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
            when(mockStateStorage.get(PROFILE_KEY)).thenReturn("a");
            await manager.signIn(profile("a"));
            states = [];

            await manager.restore();

            assert.deepStrictEqual(restoredProfiles, []);
            assert.deepStrictEqual(states, []);
        });

        it("runs once when called concurrently", async () => {
            when(mockStateStorage.get(PROFILE_KEY)).thenReturn("a");

            await Promise.all([manager.restore(), manager.restore()]);

            assert.deepStrictEqual(restoredProfiles, ["a"]);
        });
    });

    describe("disconnect", () => {
        it("drops the connection but keeps the profile for restore", async () => {
            await manager.signIn(profile("a"));
            when(mockStateStorage.get(PROFILE_KEY)).thenReturn("a");
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

    describe("signedIn", () => {
        it("is true while a profile is saved, even if restoring it failed", async () => {
            assert.equal(manager.signedIn, false);

            when(mockStateStorage.get(PROFILE_KEY)).thenReturn("deleted");
            await manager.restore();

            assert.equal(manager.state, "DISCONNECTED");
            assert.equal(manager.signedIn, true);
        });
    });

    describe("signOut", () => {
        it("forgets a profile that failed to restore, and reports the change", async () => {
            when(mockStateStorage.get(PROFILE_KEY)).thenReturn("deleted");
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
