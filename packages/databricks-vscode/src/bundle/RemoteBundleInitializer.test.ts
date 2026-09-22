import {mock, instance, when, verify, anything, reset} from "ts-mockito";
import {EventEmitter} from "vscode";
import {RemoteBundleInitializer} from "./RemoteBundleInitializer";
import {ConfigModel} from "../configuration/models/ConfigModel";
import {
    ConnectionManager,
    ConnectionState,
} from "../configuration/ConnectionManager";
import {DatabricksWorkspace} from "../configuration/DatabricksWorkspace";
import {AuthProvider} from "../configuration/auth/AuthProvider";

// Lets microtasks queued by the event listeners (which fire synchronously but
// call the async applyEnvAuth) settle before assertions.
function flush() {
    return new Promise((resolve) => setImmediate(resolve));
}

describe("RemoteBundleInitializer", () => {
    let configModel: ConfigModel;
    let connectionManager: ConnectionManager;
    let databricksWorkspace: DatabricksWorkspace;
    let authProvider: AuthProvider;
    let authProviderEmitter: EventEmitter<void>;
    let stateEmitter: EventEmitter<ConnectionState>;
    let initializer: RemoteBundleInitializer;

    beforeEach(() => {
        configModel = mock<ConfigModel>();
        connectionManager = mock<ConnectionManager>();
        databricksWorkspace = mock(DatabricksWorkspace);
        authProvider = mock<AuthProvider>();
        authProviderEmitter = new EventEmitter<void>();
        stateEmitter = new EventEmitter<ConnectionState>();

        when(configModel.onDidChangeAuthProvider).thenReturn(
            authProviderEmitter.event
        );
        when(connectionManager.onDidChangeState).thenReturn(stateEmitter.event);

        // Defaults: no target, no auth applied yet, environment provides a
        // workspace with an auth provider. Individual tests override target /
        // authProvider to drive the scenario.
        when(configModel.target).thenReturn(undefined);
        when(configModel.authProvider).thenReturn(undefined);
        when(configModel.init()).thenResolve();
        when(configModel.setAuthProvider(anything())).thenResolve();
        when(connectionManager.connectFromEnvironment()).thenResolve();
        when(databricksWorkspace.authProvider).thenReturn(
            instance(authProvider)
        );
        when(connectionManager.databricksWorkspace).thenReturn(
            instance(databricksWorkspace)
        );

        initializer = new RemoteBundleInitializer(
            instance(configModel),
            instance(connectionManager)
        );
    });

    afterEach(() => {
        initializer.dispose();
        reset(configModel);
    });

    it("applies the environment auth provider once a target is resolved", async () => {
        when(configModel.target).thenReturn("dev");

        await initializer.initialize();

        verify(configModel.setAuthProvider(instance(authProvider))).once();
    });

    it("does not apply auth when no target is resolved", async () => {
        await initializer.initialize();

        verify(configModel.setAuthProvider(anything())).never();
    });

    it("re-applies auth when the target changes (onDidChangeAuthProvider)", async () => {
        await initializer.initialize();
        verify(configModel.setAuthProvider(anything())).never();

        // A project-folder change resolves a new target and clears auth, then
        // fires onDidChangeAuthProvider - the initializer should restore auth.
        when(configModel.target).thenReturn("dev");
        authProviderEmitter.fire();
        await flush();

        verify(configModel.setAuthProvider(instance(authProvider))).once();
    });

    it("re-applies auth on reconnect (onDidChangeState CONNECTED)", async () => {
        await initializer.initialize();

        when(configModel.target).thenReturn("dev");
        stateEmitter.fire("CONNECTED");
        await flush();

        verify(configModel.setAuthProvider(instance(authProvider))).once();
    });

    it("ignores non-connected state changes", async () => {
        await initializer.initialize();

        when(configModel.target).thenReturn("dev");
        stateEmitter.fire("DISCONNECTED");
        await flush();

        verify(configModel.setAuthProvider(anything())).never();
    });

    it("does not re-apply the same provider instance (dedup)", async () => {
        when(configModel.target).thenReturn("dev");

        await initializer.initialize();
        verify(configModel.setAuthProvider(instance(authProvider))).once();

        // The provider is now applied; a subsequent trigger for the same
        // connection must not issue another `bundle summary`.
        when(configModel.authProvider).thenReturn(instance(authProvider));
        stateEmitter.fire("CONNECTED");
        await flush();

        verify(configModel.setAuthProvider(instance(authProvider))).once();
    });

    it("does not throw when connectFromEnvironment fails", async () => {
        when(connectionManager.connectFromEnvironment()).thenReject(
            new Error("no credentials")
        );
        when(connectionManager.databricksWorkspace).thenReturn(undefined);

        await initializer.initialize();

        verify(configModel.setAuthProvider(anything())).never();
    });
});
