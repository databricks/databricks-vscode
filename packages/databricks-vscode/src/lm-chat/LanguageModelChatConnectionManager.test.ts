import assert from "assert";
import {CancellationToken, EventEmitter} from "vscode";
import {WorkspaceClient} from "@databricks/sdk-experimental";
import {CliWrapper} from "../cli/CliWrapper";
import {
    ConnectionManager,
    ConnectionState,
} from "../configuration/ConnectionManager";
import {DatabricksWorkspace} from "../configuration/DatabricksWorkspace";
import {AuthProvider} from "../configuration/auth/AuthProvider";
import {StateStorage} from "../vscode-objs/StateStorage";
import {LanguageModelChatConnectionManager} from "./LanguageModelChatConnectionManager";
import {LanguageModelChatConnection} from "./types";

const NEVER_CANCELLED_TOKEN: CancellationToken = {
    isCancellationRequested: false,
    onCancellationRequested: () => ({dispose: () => undefined}),
};

const API_CLIENT = {
    host: Promise.resolve(new URL("https://workspace.example.databricks.com")),
    config: {
        authenticate: async () => undefined,
    },
} as unknown as NonNullable<LanguageModelChatConnection["apiClient"]>;

function authProvider(
    client: WorkspaceClient,
    savedAuth: Record<string, string | undefined>
): AuthProvider {
    return {
        authType: "profile",
        getWorkspaceClient: async () => client,
        toJSON: () => savedAuth,
    } as unknown as AuthProvider;
}

function workspaceClient(
    apiClient: NonNullable<
        LanguageModelChatConnection["apiClient"]
    > = API_CLIENT
): WorkspaceClient {
    return {apiClient} as unknown as WorkspaceClient;
}

function workspace(id: string): DatabricksWorkspace {
    return {id} as DatabricksWorkspace;
}

function stateStorage(initial?: Record<string, string | undefined>): {
    readonly storage: StateStorage;
    readonly saved: () => Record<string, string | undefined> | undefined;
} {
    let value = initial;
    return {
        storage: {
            get: () => value,
            set: async (_key: string, next: typeof value) => {
                value = next;
            },
        } as unknown as StateStorage,
        saved: () => value,
    };
}

describe("LanguageModelChatConnectionManager", () => {
    it("creates and persists a standalone session interactively", async () => {
        const state = stateStorage();
        const client = workspaceClient();
        const savedAuth = {
            host: "https://workspace.example.databricks.com",
            authType: "profile",
            profile: "TEST",
        };
        const auth = authProvider(client, savedAuth);
        let loginCalls = 0;
        const manager = new LanguageModelChatConnectionManager(
            {} as CliWrapper,
            state.storage,
            async () => {
                loginCalls++;
                return auth;
            },
            () => auth,
            async () => workspace("123")
        );

        await manager.ensureConnected(true, NEVER_CANCELLED_TOKEN);

        assert.strictEqual(loginCalls, 1);
        assert.strictEqual(manager.state, "CONNECTED");
        assert.strictEqual(manager.apiClient, API_CLIENT);
        assert.strictEqual(manager.databricksWorkspace?.id, "123");
        assert.deepStrictEqual(state.saved(), savedAuth);
        manager.dispose();
    });

    it("restores a standalone session without prompting", async () => {
        const savedAuth = {
            host: "https://workspace.example.databricks.com",
            authType: "profile",
            profile: "TEST",
        };
        const state = stateStorage(savedAuth);
        const client = workspaceClient();
        const auth = authProvider(client, savedAuth);
        let loginCalls = 0;
        let restored: Record<string, string | undefined> | undefined;
        const manager = new LanguageModelChatConnectionManager(
            {} as CliWrapper,
            state.storage,
            async () => {
                loginCalls++;
                return auth;
            },
            (value) => {
                restored = value;
                return auth;
            },
            async () => workspace("123")
        );

        await manager.ensureConnected(false, NEVER_CANCELLED_TOKEN);

        assert.strictEqual(loginCalls, 0);
        assert.deepStrictEqual(restored, savedAuth);
        assert.strictEqual(manager.state, "CONNECTED");
        manager.dispose();
    });

    it("does not prompt during silent discovery", async () => {
        const state = stateStorage();
        let loginCalls = 0;
        const manager = new LanguageModelChatConnectionManager(
            {} as CliWrapper,
            state.storage,
            async () => {
                loginCalls++;
                return undefined;
            }
        );

        await manager.ensureConnected(false, NEVER_CANCELLED_TOKEN);

        assert.strictEqual(loginCalls, 0);
        assert.strictEqual(manager.state, "DISCONNECTED");
        manager.dispose();
    });

    it("prefers a connected project session", async () => {
        const state = stateStorage();
        const standaloneClient = workspaceClient();
        const savedAuth = {
            host: "https://workspace.example.databricks.com",
            authType: "profile",
            profile: "TEST",
        };
        const auth = authProvider(standaloneClient, savedAuth);
        const manager = new LanguageModelChatConnectionManager(
            {} as CliWrapper,
            state.storage,
            async () => auth,
            () => auth,
            async () => workspace("standalone")
        );
        await manager.ensureConnected(true, NEVER_CANCELLED_TOKEN);

        const projectStateEmitter = new EventEmitter<ConnectionState>();
        const projectApiClient = {...API_CLIENT};
        const projectConnection = {
            state: "CONNECTED" as ConnectionState,
            isInitialized: true,
            apiClient: projectApiClient,
            databricksWorkspace: workspace("project"),
            onDidChangeState: projectStateEmitter.event,
            login: async () => undefined,
        } as unknown as ConnectionManager;

        manager.setProjectConnection(projectConnection);

        assert.strictEqual(manager.apiClient, projectApiClient);
        assert.strictEqual(manager.databricksWorkspace?.id, "project");
        projectStateEmitter.dispose();
        manager.dispose();
    });

    it("reconfigures a connected standalone session", async () => {
        const state = stateStorage();
        const firstApiClient = {...API_CLIENT};
        const secondApiClient = {...API_CLIENT};
        const firstSavedAuth = {
            host: "https://first.example.databricks.com",
            authType: "profile",
            profile: "FIRST",
        };
        const secondSavedAuth = {
            host: "https://second.example.databricks.com",
            authType: "profile",
            profile: "SECOND",
        };
        const authProviders = [
            authProvider(workspaceClient(firstApiClient), firstSavedAuth),
            authProvider(workspaceClient(secondApiClient), secondSavedAuth),
        ];
        let loginCalls = 0;
        const manager = new LanguageModelChatConnectionManager(
            {} as CliWrapper,
            state.storage,
            async () => authProviders[loginCalls++],
            () => authProviders[0],
            async (_client, auth) => workspace(auth.toJSON().profile as string)
        );

        await manager.ensureConnected(true, NEVER_CANCELLED_TOKEN);
        await manager.configure();

        assert.strictEqual(loginCalls, 2);
        assert.strictEqual(manager.apiClient, secondApiClient);
        assert.strictEqual(manager.databricksWorkspace?.id, "SECOND");
        assert.deepStrictEqual(state.saved(), secondSavedAuth);
        manager.dispose();
    });

    it("forces project authentication configuration when connected", async () => {
        const state = stateStorage();
        let standaloneLoginCalls = 0;
        const manager = new LanguageModelChatConnectionManager(
            {} as CliWrapper,
            state.storage,
            async () => {
                standaloneLoginCalls++;
                return undefined;
            }
        );
        const projectStateEmitter = new EventEmitter<ConnectionState>();
        const loginArguments: Array<
            [boolean | undefined, boolean | undefined]
        > = [];
        const projectConnection = {
            state: "CONNECTED" as ConnectionState,
            isInitialized: true,
            apiClient: {...API_CLIENT},
            databricksWorkspace: workspace("project"),
            onDidChangeState: projectStateEmitter.event,
            login: async (interactive?: boolean, force?: boolean) => {
                loginArguments.push([interactive, force]);
            },
            logout: async () => undefined,
        };
        manager.setProjectConnection(
            projectConnection as unknown as ConnectionManager
        );

        await manager.configure();

        assert.deepStrictEqual(loginArguments, [[true, true]]);
        assert.strictEqual(standaloneLoginCalls, 0);
        projectStateEmitter.dispose();
        manager.dispose();
    });

    it("signs out of a standalone session and clears saved auth", async () => {
        const state = stateStorage();
        const client = workspaceClient();
        const savedAuth = {
            host: "https://workspace.example.databricks.com",
            authType: "profile",
            profile: "TEST",
        };
        const auth = authProvider(client, savedAuth);
        let loginCalls = 0;
        const manager = new LanguageModelChatConnectionManager(
            {} as CliWrapper,
            state.storage,
            async () => {
                loginCalls++;
                return auth;
            },
            () => auth,
            async () => workspace("123")
        );

        await manager.ensureConnected(true, NEVER_CANCELLED_TOKEN);
        await manager.signOut();

        assert.strictEqual(manager.state, "DISCONNECTED");
        assert.strictEqual(manager.apiClient, undefined);
        assert.strictEqual(manager.databricksWorkspace, undefined);
        assert.strictEqual(state.saved(), undefined);

        await manager.ensureConnected(true, NEVER_CANCELLED_TOKEN);
        assert.strictEqual(loginCalls, 2);
        assert.strictEqual(manager.state, "CONNECTED");
        manager.dispose();
    });

    it("signs out of a project session and drops leftover standalone auth", async () => {
        const state = stateStorage();
        const standaloneClient = workspaceClient();
        const savedAuth = {
            host: "https://workspace.example.databricks.com",
            authType: "profile",
            profile: "TEST",
        };
        const auth = authProvider(standaloneClient, savedAuth);
        const manager = new LanguageModelChatConnectionManager(
            {} as CliWrapper,
            state.storage,
            async () => auth,
            () => auth,
            async () => workspace("standalone")
        );
        await manager.ensureConnected(true, NEVER_CANCELLED_TOKEN);

        const projectStateEmitter = new EventEmitter<ConnectionState>();
        const projectConnection = {
            state: "CONNECTED" as ConnectionState,
            isInitialized: true,
            apiClient: {...API_CLIENT},
            databricksWorkspace: workspace("project"),
            onDidChangeState: projectStateEmitter.event,
            login: async () => undefined,
            logout: async () => {
                projectConnection.state = "DISCONNECTED";
                projectStateEmitter.fire("DISCONNECTED");
            },
        };

        manager.setProjectConnection(
            projectConnection as unknown as ConnectionManager
        );
        await manager.signOut();

        assert.strictEqual(projectConnection.state, "DISCONNECTED");
        assert.strictEqual(manager.state, "DISCONNECTED");
        assert.strictEqual(manager.apiClient, undefined);
        assert.strictEqual(state.saved(), undefined);
        projectStateEmitter.dispose();
        manager.dispose();
    });
});
