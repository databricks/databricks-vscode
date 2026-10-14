import {mock, instance, when, verify, anything} from "ts-mockito";
import {EventEmitter, Uri} from "vscode";
import {RemoteBundleManager} from "./RemoteBundleManager";
import {ConfigModel} from "../configuration/models/ConfigModel";
import {
    ConnectionManager,
    ConnectionState,
} from "../configuration/ConnectionManager";
import {DatabricksWorkspace} from "../configuration/DatabricksWorkspace";
import {AuthProvider} from "../configuration/auth/AuthProvider";
import {WorkspaceFolderManager} from "../vscode-objs/WorkspaceFolderManager";
import {BundleWatcher} from "./BundleWatcher";

const ENV_HOST = new URL("https://dogfood.cloud.databricks.com");

// Lets microtasks queued by the event listeners (which fire synchronously but
// run async handlers) settle before assertions.
function flush() {
    return new Promise((resolve) => setImmediate(resolve));
}

describe("RemoteBundleManager", () => {
    let configModel: ConfigModel;
    let connectionManager: ConnectionManager;
    let authProvider: AuthProvider;
    let stateEmitter: EventEmitter<ConnectionState>;
    let folderChangeEmitter: EventEmitter<Uri | undefined>;
    let bundleChangeEmitter: EventEmitter<void>;
    let manager: RemoteBundleManager;

    beforeEach(() => {
        configModel = mock<ConfigModel>();
        connectionManager = mock<ConnectionManager>();
        const workspaceFolderManager = mock<WorkspaceFolderManager>();
        const bundleWatcher = mock<BundleWatcher>();
        const databricksWorkspace = mock(DatabricksWorkspace);
        authProvider = mock<AuthProvider>();
        stateEmitter = new EventEmitter<ConnectionState>();
        folderChangeEmitter = new EventEmitter<Uri | undefined>();
        bundleChangeEmitter = new EventEmitter<void>();

        when(connectionManager.onDidChangeState).thenReturn(stateEmitter.event);
        when(workspaceFolderManager.onDidChangeActiveProjectFolder).thenReturn(
            folderChangeEmitter.event
        );
        when(bundleWatcher.onDidChange).thenReturn(bundleChangeEmitter.event);

        when(configModel.init()).thenResolve();
        when(configModel.target).thenReturn(undefined);
        when(configModel.resolveTarget()).thenResolve();
        when(configModel.reresolveTarget()).thenResolve();
        when(configModel.pinAuthProvider(anything())).thenResolve();
        when(connectionManager.connectFromEnvironment()).thenResolve();
        when(authProvider.host).thenReturn(ENV_HOST);
        when(databricksWorkspace.authProvider).thenReturn(
            instance(authProvider)
        );
        when(connectionManager.databricksWorkspace).thenReturn(
            instance(databricksWorkspace)
        );

        manager = new RemoteBundleManager(
            instance(configModel),
            instance(connectionManager),
            instance(workspaceFolderManager),
            instance(bundleWatcher)
        );
    });

    afterEach(() => {
        manager.dispose();
    });

    it("pins the environment auth provider on connect", async () => {
        stateEmitter.fire("CONNECTED");
        await flush();

        verify(configModel.pinAuthProvider(instance(authProvider))).once();
    });

    it("ignores non-connected state changes", async () => {
        stateEmitter.fire("CONNECTING");
        stateEmitter.fire("DISCONNECTED");
        await flush();

        verify(configModel.pinAuthProvider(anything())).never();
    });

    it("does not pin when the connection has no workspace", async () => {
        when(connectionManager.databricksWorkspace).thenReturn(undefined);

        stateEmitter.fire("CONNECTED");
        await flush();

        verify(configModel.pinAuthProvider(anything())).never();
    });

    it("connects and resolves the target on initialize", async () => {
        await manager.initialize();

        verify(connectionManager.connectFromEnvironment()).once();
        verify(configModel.init()).once();
    });

    it("resolves the target without waiting for the connection", async () => {
        let finishConnect!: () => void;
        when(connectionManager.connectFromEnvironment()).thenReturn(
            new Promise<void>((resolve) => {
                finishConnect = resolve;
            })
        );

        const initialized = manager.initialize();
        await flush();

        verify(configModel.init()).once();
        finishConnect();
        await initialized;
    });

    it("still resolves the target when connectFromEnvironment fails", async () => {
        when(connectionManager.connectFromEnvironment()).thenReject(
            new Error("no credentials")
        );

        await manager.initialize();

        verify(configModel.init()).once();
    });

    it("re-resolves the target on a project-folder change", async () => {
        folderChangeEmitter.fire(Uri.file("/new/project"));
        await flush();

        verify(configModel.reresolveTarget()).once();
    });

    it("re-checks a set target when bundle files change", async () => {
        // e.g. databricks.yml deleted, or the target removed from it.
        when(configModel.target).thenReturn("dev");

        bundleChangeEmitter.fire();
        await flush();

        verify(configModel.resolveTarget()).once();
    });

    it("leaves a missing target to ConfigModel when bundle files change", async () => {
        bundleChangeEmitter.fire();
        await flush();

        verify(configModel.resolveTarget()).never();
    });
});
