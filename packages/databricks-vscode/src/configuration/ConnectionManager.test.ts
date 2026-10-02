/* eslint-disable @typescript-eslint/naming-convention */

import assert from "assert";
import {Disposable} from "vscode";
import {anything, instance, mock, reset, verify, when} from "ts-mockito";
import {ApiClient, WorkspaceClient} from "@databricks/sdk-experimental";
import {ConnectionManager, ConnectionState} from "./ConnectionManager";
import {ConfigModel} from "./models/ConfigModel";
import {CliWrapper} from "../cli/CliWrapper";
import {WorkspaceFolderManager} from "../vscode-objs/WorkspaceFolderManager";
import {CustomWhenContext} from "../vscode-objs/CustomWhenContext";
import {Telemetry} from "../telemetry";
import {AuthProvider, ProfileAuthProvider} from "./auth/AuthProvider";
import {LoginWizard} from "./LoginWizard";

describe(__filename, () => {
    let disposables: Array<Disposable>;

    let mockCli: CliWrapper;
    let mockConfigModel: ConfigModel;
    let mockWorkspaceFolderManager: WorkspaceFolderManager;
    let mockCustomWhenContext: CustomWhenContext;
    let mockAuthProvider: AuthProvider;
    let mockWorkspaceClient: WorkspaceClient;

    function buildConnectionManager(): ConnectionManager {
        return new ConnectionManager(
            instance(mockCli),
            instance(mockConfigModel),
            instance(mockWorkspaceFolderManager),
            instance(mockCustomWhenContext),
            new Telemetry()
        );
    }

    beforeEach(() => {
        disposables = [];
        mockCli = mock(CliWrapper);
        mockConfigModel = mock(ConfigModel);
        mockWorkspaceFolderManager = mock(WorkspaceFolderManager);
        mockCustomWhenContext = mock(CustomWhenContext);
        mockAuthProvider = mock<AuthProvider>();
        mockWorkspaceClient = mock(WorkspaceClient);

        // DatabricksWorkspace.load() reads the org id from a header on the
        // currentUser.me() response and (best-effort) the workspace conf.
        when(mockWorkspaceClient.currentUser).thenReturn({
            me: async () =>
                ({
                    "userName": "test@databricks.com",
                    "x-databricks-org-id": "1234",
                }) as any,
        } as any);
        when(mockWorkspaceClient.apiClient).thenReturn(undefined as any);
        when(mockAuthProvider.getWorkspaceClient()).thenResolve(
            instance(mockWorkspaceClient)
        );
        when(mockAuthProvider.host).thenReturn(
            new URL("https://test.databricks.com")
        );
    });

    afterEach(() => {
        disposables.forEach((d) => d.dispose());
        reset(mockConfigModel);
    });

    it("connectFromEnvironment connects using the injected auth provider", async () => {
        const cm = buildConnectionManager();
        disposables.push(cm);

        await cm.connectFromEnvironment(instance(mockAuthProvider));

        assert.equal(cm.state, "CONNECTED");
        assert.ok(cm.workspaceClient);
        assert.ok(cm.databricksWorkspace);
        assert.equal(
            cm.databricksWorkspace?.host.toString(),
            "https://test.databricks.com/"
        );
        verify(mockCustomWhenContext.setLoggedIn(true)).atLeast(1);
    });

    it("connectFromEnvironment does not touch the config model (no bundle coupling)", async () => {
        const cm = buildConnectionManager();
        disposables.push(cm);

        await cm.connectFromEnvironment(instance(mockAuthProvider));

        verify(mockConfigModel.set(anything(), anything())).never();
        verify(mockConfigModel.setAuthProvider(anything())).never();
    });

    it("connectFromEnvironment disconnects and rethrows on failure", async () => {
        when(mockAuthProvider.getWorkspaceClient()).thenReject(
            new Error("no credentials")
        );
        const cm = buildConnectionManager();
        disposables.push(cm);

        await assert.rejects(
            () => cm.connectFromEnvironment(instance(mockAuthProvider)),
            /no credentials/
        );

        assert.equal(cm.state, "DISCONNECTED");
        assert.equal(cm.workspaceClient, undefined);
        assert.equal(cm.databricksWorkspace, undefined);
        verify(mockCustomWhenContext.setLoggedIn(false)).atLeast(1);
    });

    describe("connectFromEnvironment without an injected auth provider", () => {
        // These exercise the production credential path (new Config with an
        // EnvironmentLoader, PAT-only enforcement) which is skipped when a test
        // injects an AuthProvider. We only cover the fail-fast branches here:
        // the successful connect builds a real WorkspaceClient and calls
        // currentUser.me() against the host, which would hit the network - that
        // path is already covered by the injected-AuthProvider tests above. We
        // drive these purely through env vars and restore the environment
        // afterwards.
        let savedEnv: NodeJS.ProcessEnv;

        beforeEach(() => {
            savedEnv = process.env;
            process.env = {...savedEnv};
            // Clear anything a local ~/.databrickscfg-style env would set so the
            // EnvironmentLoader only sees what each test injects.
            delete process.env.DATABRICKS_HOST;
            delete process.env.DATABRICKS_TOKEN;
            delete process.env.DATABRICKS_CONFIG_PROFILE;
        });

        afterEach(() => {
            process.env = savedEnv;
        });

        it("fails fast when no host is present in the environment", async () => {
            process.env.DATABRICKS_TOKEN = "dapi1234567890";
            const cm = buildConnectionManager();
            disposables.push(cm);

            await assert.rejects(
                () => cm.connectFromEnvironment(),
                /No Databricks host found in the environment/
            );
            assert.equal(cm.state, "DISCONNECTED");
        });

        it("fails fast when a host but no token is present", async () => {
            process.env.DATABRICKS_HOST = "https://test.databricks.com";
            const cm = buildConnectionManager();
            disposables.push(cm);

            await assert.rejects(
                () => cm.connectFromEnvironment(),
                /No Databricks token found in the environment/
            );
            assert.equal(cm.state, "DISCONNECTED");
        });
    });

    // Pins the bundle sign-in's observable behaviour: the order of state
    // events, the loggedIn key, and what the setup steps see.
    describe("bundle sign-in", () => {
        const originalFrom = ProfileAuthProvider.from;
        const originalRun = LoginWizard.run;
        let unreachable: Set<string>;
        let apiClients: Map<string, ApiClient>;
        let states: ConnectionState[];
        let loggedIn: boolean | undefined;
        let cm: ConnectionManager;

        /** A checked profile on its own workspace. */
        function profile(name: string): ProfileAuthProvider {
            const client = mock(WorkspaceClient);
            when(client.currentUser).thenReturn({
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
            const apiClient = mock(ApiClient);
            // The metadata service compares hosts when the client changes.
            when(apiClient.config).thenReturn({
                getHost: async () =>
                    new URL(`https://${name}.cloud.databricks.com`),
            } as any);
            apiClients.set(name, instance(apiClient));
            when(client.apiClient).thenReturn(apiClients.get(name)!);

            const authProvider = mock(ProfileAuthProvider);
            when(authProvider.profile).thenReturn(name);
            when(authProvider.host).thenReturn(
                new URL(`https://${name}.cloud.databricks.com`)
            );
            when(authProvider.check()).thenResolve(true);
            when(authProvider.toJSON()).thenReturn({
                host: `https://${name}.cloud.databricks.com/`,
                authType: "profile",
                profile: name,
            });
            when(authProvider.getWorkspaceClient()).thenResolve(
                instance(client)
            );
            return instance(authProvider);
        }

        function host() {
            return cm.databricksWorkspace?.host.toString();
        }

        async function autoSignIn(source: "init" | "targetChange") {
            await (cm as any).loginWithSavedAuth(source);
        }

        beforeEach(() => {
            unreachable = new Set();
            apiClients = new Map();
            states = [];
            loggedIn = undefined;
            (ProfileAuthProvider as any).from = async (name: string) =>
                profile(name);
            when(mockConfigModel.target).thenReturn("dev");
            when(mockConfigModel.get("host")).thenResolve(
                new URL("https://a.cloud.databricks.com")
            );
            when(mockConfigModel.get("overrides")).thenResolve({
                authProfile: "a",
            } as any);
            when(mockConfigModel.get("remoteRootPath")).thenResolve(undefined);
            when(mockConfigModel.get("clusterId")).thenResolve(undefined);
            when(mockConfigModel.get("useClusterOverride")).thenResolve(
                undefined
            );
            when(mockConfigModel.get("serverless")).thenResolve(undefined);
            when(mockConfigModel.set(anything(), anything())).thenResolve();
            when(mockConfigModel.setAuthProvider(anything())).thenResolve();
            when(mockCustomWhenContext.setLoggedIn(anything())).thenCall(
                (value: boolean) => {
                    loggedIn = value;
                }
            );
            cm = buildConnectionManager();
            disposables.push(cm);
            cm.onDidChangeState((state) => states.push(state));
        });

        afterEach(() => {
            (ProfileAuthProvider as any).from = originalFrom;
            (LoginWizard as any).run = originalRun;
        });

        it("connects with the saved profile", async () => {
            await autoSignIn("init");

            assert.equal(cm.state, "CONNECTED");
            assert.equal(host(), "https://a.cloud.databricks.com/");
            assert.equal(loggedIn, true);
            assert.deepStrictEqual(states, ["CONNECTING", "CONNECTED"]);
        });

        it("drops the old connection first when the target changes", async () => {
            await autoSignIn("init");
            states = [];

            await autoSignIn("targetChange");

            assert.equal(cm.state, "CONNECTED");
            assert.deepStrictEqual(states, [
                "DISCONNECTED",
                "CONNECTING",
                "CONNECTED",
            ]);
        });

        it("runs the setup steps against the new client", async () => {
            const seen: Array<ApiClient | undefined> = [];
            when(mockConfigModel.set("authProfile", anything())).thenCall(
                async () => {
                    seen.push(cm.apiClient);
                }
            );
            when(mockConfigModel.setAuthProvider(anything())).thenCall(
                async () => {
                    seen.push(cm.apiClient);
                }
            );

            await autoSignIn("init");

            assert.deepStrictEqual(seen, [
                apiClients.get("a"),
                apiClients.get("a"),
            ]);
        });

        it("ends CONNECTED even when saving the auth provider fails", async () => {
            when(mockConfigModel.setAuthProvider(anything())).thenReject(
                new Error("bundle validate failed")
            );

            await autoSignIn("init");

            assert.equal(cm.state, "CONNECTED");
            assert.equal(loggedIn, true);
            assert.deepStrictEqual(states, ["CONNECTING", "CONNECTED"]);
        });

        it("switches workspace on a manual sign-in while connected", async () => {
            await autoSignIn("init");
            states = [];
            (LoginWizard as any).run = async () => profile("b");

            await cm.configureLogin("command");

            assert.equal(host(), "https://b.cloud.databricks.com/");
            assert.deepStrictEqual(states, ["CONNECTING", "CONNECTED"]);
        });

        // Current behaviour, kept as is here: a failed sign-in is left in
        // CONNECTING with the previous workspace.
        it("stays CONNECTING when a manual sign-in fails", async () => {
            await autoSignIn("init");
            states = [];
            unreachable.add("b");
            (LoginWizard as any).run = async () => profile("b");

            await cm.configureLogin("command");

            assert.equal(cm.state, "CONNECTING");
            assert.equal(host(), "https://a.cloud.databricks.com/");
            assert.equal(loggedIn, false);
            assert.deepStrictEqual(states, ["CONNECTING"]);
        });

        it("disconnects and forgets the auth on logout", async () => {
            await autoSignIn("init");
            states = [];

            await cm.logout();

            assert.equal(cm.state, "DISCONNECTED");
            assert.equal(cm.workspaceClient, undefined);
            assert.equal(loggedIn, false);
            verify(mockConfigModel.set("authProfile", undefined)).once();
            verify(mockConfigModel.setAuthProvider(undefined)).once();
            assert.deepStrictEqual(states, ["DISCONNECTED"]);
        });
    });
});
