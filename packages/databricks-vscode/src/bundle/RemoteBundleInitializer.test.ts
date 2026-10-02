import {mock, instance, when, verify, anything, reset} from "ts-mockito";
import {EventEmitter, Uri} from "vscode";
import {RemoteBundleInitializer} from "./RemoteBundleInitializer";
import {ConfigModel} from "../configuration/models/ConfigModel";
import {
    ConnectionManager,
    ConnectionState,
} from "../configuration/ConnectionManager";
import {DatabricksWorkspace} from "../configuration/DatabricksWorkspace";
import {AuthProvider} from "../configuration/auth/AuthProvider";
import {WorkspaceFolderManager} from "../vscode-objs/WorkspaceFolderManager";

// Lets microtasks queued by the event listeners (which fire synchronously but
// call the async applyEnvAuth) settle before assertions.
function flush() {
    return new Promise((resolve) => setImmediate(resolve));
}

describe("RemoteBundleInitializer", () => {
    let configModel: ConfigModel;
    let connectionManager: ConnectionManager;
    let workspaceFolderManager: WorkspaceFolderManager;
    let databricksWorkspace: DatabricksWorkspace;
    let authProvider: AuthProvider;
    let authProviderEmitter: EventEmitter<void>;
    let stateEmitter: EventEmitter<ConnectionState>;
    let folderChangeEmitter: EventEmitter<Uri | undefined>;
    let initializer: RemoteBundleInitializer;

    beforeEach(() => {
        configModel = mock<ConfigModel>();
        connectionManager = mock<ConnectionManager>();
        workspaceFolderManager = mock<WorkspaceFolderManager>();
        databricksWorkspace = mock(DatabricksWorkspace);
        authProvider = mock<AuthProvider>();
        authProviderEmitter = new EventEmitter<void>();
        stateEmitter = new EventEmitter<ConnectionState>();
        folderChangeEmitter = new EventEmitter<Uri | undefined>();

        when(configModel.onDidChangeAuthProvider).thenReturn(
            authProviderEmitter.event
        );
        when(connectionManager.onDidChangeState).thenReturn(stateEmitter.event);
        when(workspaceFolderManager.onDidChangeActiveProjectFolder).thenReturn(
            folderChangeEmitter.event
        );

        // Defaults: no target, no auth applied yet, environment provides a
        // workspace with an auth provider. Individual tests override target /
        // authProvider to drive the scenario.
        when(configModel.target).thenReturn(undefined);
        when(configModel.authProvider).thenReturn(undefined);
        when(configModel.init()).thenResolve();
        when(configModel.setTarget(anything())).thenResolve();
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
            instance(connectionManager),
            instance(workspaceFolderManager)
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

    it("re-resolves the target and applies auth on a project-folder change", async () => {
        await initializer.initialize();
        verify(configModel.setAuthProvider(anything())).never();

        // A folder change clears the stale target then re-resolves the new
        // folder's target via init(). Model the resolved target so the trailing
        // applyEnvAuth() sees it and applies the environment auth provider.
        when(configModel.target).thenReturn("dev");
        folderChangeEmitter.fire(Uri.file("/new/project"));
        await flush();

        verify(configModel.setTarget(undefined)).once();
        verify(configModel.init()).atLeast(1);
        verify(configModel.setAuthProvider(instance(authProvider))).once();
    });

    it("does not apply auth when the new folder has no target", async () => {
        await initializer.initialize();

        // target stays undefined through setTarget(undefined) + init().
        folderChangeEmitter.fire(Uri.file("/empty/project"));
        await flush();

        verify(configModel.setTarget(undefined)).once();
        verify(configModel.setAuthProvider(anything())).never();
    });

    it("serialises overlapping folder changes", async () => {
        await initializer.initialize();

        when(configModel.target).thenReturn("dev");
        folderChangeEmitter.fire(Uri.file("/project/a"));
        folderChangeEmitter.fire(Uri.file("/project/b"));
        await flush();

        verify(configModel.setTarget(undefined)).twice();
        verify(configModel.init()).atLeast(2);
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
