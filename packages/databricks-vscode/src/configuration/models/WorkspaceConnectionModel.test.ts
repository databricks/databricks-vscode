/* eslint-disable @typescript-eslint/naming-convention */

import assert from "assert";
import {ApiClient, WorkspaceClient} from "@databricks/sdk-experimental";
import {instance, mock, when} from "ts-mockito";
import {ProfileAuthProvider} from "../auth/AuthProvider";
import {
    ConnectionState,
    WorkspaceConnectionModel,
} from "./WorkspaceConnectionModel";

describe(__filename, () => {
    let unreachable: Set<string>;
    let apiClients: Map<string, ApiClient>;
    let model: WorkspaceConnectionModel;
    let states: ConnectionState[];

    /** An auth provider for its own workspace, unreachable while in `unreachable`. */
    function workspace(name: string): ProfileAuthProvider {
        const mockWorkspaceClient = mock(WorkspaceClient);
        // DatabricksWorkspace.load() reads the org id from a header on the
        // currentUser.me() response and (best-effort) the workspace conf.
        when(mockWorkspaceClient.currentUser).thenReturn({
            me: async () => {
                if (unreachable.has(name)) {
                    throw new Error(`${name} is unreachable`);
                }
                return {
                    "userName": "test@databricks.com",
                    "x-databricks-org-id": "1234",
                } as any;
            },
        } as any);
        apiClients.set(name, instance(mock(ApiClient)));
        when(mockWorkspaceClient.apiClient).thenReturn(apiClients.get(name)!);

        const mockAuthProvider = mock(ProfileAuthProvider);
        when(mockAuthProvider.host).thenReturn(
            new URL(`https://${name}.cloud.databricks.com`)
        );
        when(mockAuthProvider.getWorkspaceClient()).thenResolve(
            instance(mockWorkspaceClient)
        );
        return instance(mockAuthProvider);
    }

    function host() {
        return model.databricksWorkspace?.host.toString();
    }

    const a = "https://a.cloud.databricks.com/";
    const b = "https://b.cloud.databricks.com/";

    beforeEach(() => {
        unreachable = new Set();
        apiClients = new Map();
        model = new WorkspaceConnectionModel();
        states = [];
        model.onDidChangeState((state) => states.push(state));
    });

    afterEach(() => {
        model.dispose();
    });

    describe("connect", () => {
        it("goes through CONNECTING to CONNECTED", async () => {
            await model.connect(workspace("a"));

            assert.equal(model.state, "CONNECTED");
            assert.equal(host(), a);
            assert.equal(model.apiClient, apiClients.get("a"));
            assert.deepStrictEqual(states, ["CONNECTING", "CONNECTED"]);
        });

        it("drops the current workspace while connecting, then runs setup on the new one before CONNECTED", async () => {
            await model.connect(workspace("a"));
            const seen: Array<[string, ConnectionState, string | undefined]> =
                [];
            model.onDidChangeState((state) =>
                seen.push(["event", state, host()])
            );

            await model.connect(workspace("b"), async () => {
                seen.push(["setup", model.state, host()]);
            });

            assert.deepStrictEqual(seen, [
                ["event", "CONNECTING", undefined],
                ["setup", "CONNECTING", b],
                ["event", "CONNECTED", b],
            ]);
        });

        it("disconnects when setup fails, then rethrows", async () => {
            await model.connect(workspace("a"));
            states = [];

            await assert.rejects(
                () =>
                    model.connect(workspace("b"), async () => {
                        throw new Error("setup failed");
                    }),
                /setup failed/
            );

            assert.equal(model.state, "DISCONNECTED");
            assert.equal(model.workspaceClient, undefined);
            assert.equal(model.databricksWorkspace, undefined);
            assert.deepStrictEqual(states, ["CONNECTING", "DISCONNECTED"]);
        });

        it("disconnects when the new workspace can't be opened, then rethrows", async () => {
            await model.connect(workspace("a"));
            unreachable.add("b");
            states = [];
            let setUp = false;

            await assert.rejects(
                () =>
                    model.connect(workspace("b"), async () => {
                        setUp = true;
                    }),
                /b is unreachable/
            );

            assert.equal(setUp, false);
            assert.equal(model.state, "DISCONNECTED");
            assert.equal(model.workspaceClient, undefined);
            assert.equal(model.databricksWorkspace, undefined);
            assert.deepStrictEqual(states, ["CONNECTING", "DISCONNECTED"]);
        });
    });

    describe("disconnect", () => {
        it("drops the workspace and reports DISCONNECTED once", async () => {
            await model.connect(workspace("a"));
            states = [];

            model.disconnect();
            model.disconnect();

            assert.equal(model.state, "DISCONNECTED");
            assert.equal(model.workspaceClient, undefined);
            assert.equal(model.apiClient, undefined);
            assert.deepStrictEqual(states, ["DISCONNECTED"]);
        });
    });

    describe("beginConnecting", () => {
        it("reports CONNECTING once, including when connect follows", async () => {
            model.beginConnecting();
            model.beginConnecting();

            assert.equal(model.state, "CONNECTING");

            await model.connect(workspace("a"));

            assert.deepStrictEqual(states, ["CONNECTING", "CONNECTED"]);
        });
    });
});
