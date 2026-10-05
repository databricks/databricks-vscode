import {
    mock,
    instance,
    when,
    verify,
    anything,
    reset,
    resetCalls,
} from "ts-mockito";
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

// Lets microtasks queued by the event listeners (which fire synchronously but
// run async handlers) settle before assertions.
function flush() {
    return new Promise((resolve) => setImmediate(resolve));
}

describe("RemoteBundleManager", () => {
    let configModel: ConfigModel;
    let connectionManager: ConnectionManager;
    let workspaceFolderManager: WorkspaceFolderManager;
    let databricksWorkspace: DatabricksWorkspace;
    let authProvider: AuthProvider;
    let stateEmitter: EventEmitter<ConnectionState>;
    let folderChangeEmitter: EventEmitter<Uri | undefined>;
    let bundleWatcher: BundleWatcher;
    let bundleChangeEmitter: EventEmitter<void>;
    let manager: RemoteBundleManager;

    beforeEach(() => {
        configModel = mock<ConfigModel>();
        connectionManager = mock<ConnectionManager>();
        workspaceFolderManager = mock<WorkspaceFolderManager>();
        databricksWorkspace = mock(DatabricksWorkspace);
        authProvider = mock<AuthProvider>();
        stateEmitter = new EventEmitter<ConnectionState>();
        folderChangeEmitter = new EventEmitter<Uri | undefined>();
        bundleWatcher = mock<BundleWatcher>();
        bundleChangeEmitter = new EventEmitter<void>();

        when(connectionManager.onDidChangeState).thenReturn(stateEmitter.event);
        when(workspaceFolderManager.onDidChangeActiveProjectFolder).thenReturn(
            folderChangeEmitter.event
        );
        when(bundleWatcher.onDidChange).thenReturn(bundleChangeEmitter.event);

        when(configModel.init()).thenResolve();
        when(configModel.target).thenReturn(undefined);
        when(configModel.targets).thenResolve({dev: {}} as any);
        when(configModel.setTarget(anything())).thenResolve();
        when(configModel.pinAuthProvider(anything())).thenResolve();
        when(connectionManager.connectFromEnvironment()).thenResolve();
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
        reset(configModel);
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
        await manager.initialize();
        resetCalls(configModel);

        folderChangeEmitter.fire(Uri.file("/new/project"));
        await flush();

        verify(configModel.setTarget(undefined)).calledBefore(
            configModel.init()
        );
        verify(configModel.setTarget(undefined)).once();
        verify(configModel.init()).once();
    });

    it("makes a folder change wait for the startup target resolution", async () => {
        let finishInit!: () => void;
        when(configModel.init())
            .thenReturn(
                new Promise<void>((resolve) => {
                    finishInit = resolve;
                })
            )
            .thenResolve();

        const initialized = manager.initialize();
        folderChangeEmitter.fire(Uri.file("/new/project"));
        await flush();

        verify(configModel.setTarget(undefined)).never();

        finishInit();
        await initialized;
        await flush();

        verify(configModel.setTarget(undefined)).once();
        verify(configModel.init()).twice();
    });

    it("resolves the target when a bundle file appears with no target", async () => {
        bundleChangeEmitter.fire();
        await flush();

        verify(configModel.init()).once();
    });

    it("ignores bundle-file changes once a target is set", async () => {
        when(configModel.target).thenReturn("dev");

        bundleChangeEmitter.fire();
        await flush();

        verify(configModel.init()).never();
    });

    it("ignores bundle-file changes when there are no targets", async () => {
        when(configModel.targets).thenResolve({} as any);

        bundleChangeEmitter.fire();
        await flush();

        verify(configModel.init()).never();
    });

    it("ignores bundle-file changes when the bundle can't be read", async () => {
        when(configModel.targets).thenReject(new Error("bad yaml"));

        bundleChangeEmitter.fire();
        await flush();

        verify(configModel.init()).never();
    });

    it("serialises overlapping folder changes", async () => {
        let releaseFirst!: () => void;
        when(configModel.setTarget(undefined))
            .thenReturn(
                new Promise<void>((resolve) => {
                    releaseFirst = resolve;
                })
            )
            .thenResolve();

        folderChangeEmitter.fire(Uri.file("/project/a"));
        folderChangeEmitter.fire(Uri.file("/project/b"));
        await flush();

        // The second change waits for the first to finish.
        verify(configModel.setTarget(undefined)).once();
        verify(configModel.init()).never();

        releaseFirst();
        await flush();

        verify(configModel.setTarget(undefined)).twice();
        verify(configModel.init()).twice();
    });
});
