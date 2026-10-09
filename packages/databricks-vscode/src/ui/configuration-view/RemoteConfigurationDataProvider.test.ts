import {expect} from "chai";
import {instance, mock, verify, when} from "ts-mockito";
import {EventEmitter, Uri} from "vscode";
import {RemoteConfigurationDataProvider} from "./RemoteConfigurationDataProvider";
import {ConfigModel} from "../../configuration/models/ConfigModel";
import {WorkspaceFolderManager} from "../../vscode-objs/WorkspaceFolderManager";
import {ConfigurationTreeItem} from "./types";
import {PausedTargetProvider} from "./BundleTargetComponent";
import {BundleFileSet} from "../../bundle/BundleFileSet";
import {BundleWatcher} from "../../bundle/BundleWatcher";

function labelOf(item: ConfigurationTreeItem): string | undefined {
    return typeof item.label === "string" ? item.label : item.label?.label;
}

describe("RemoteConfigurationDataProvider", () => {
    let mockConfigModel: ConfigModel;
    let mockWorkspaceFolderManager: WorkspaceFolderManager;
    let mockBundleFileSet: BundleFileSet;
    let mockBundleWatcher: BundleWatcher;
    let bundleChangeEmitter: EventEmitter<void>;
    let folderChangeEmitter: EventEmitter<Uri | undefined>;
    let targetChangeEmitter: EventEmitter<void>;
    let pausedChangeEmitter: EventEmitter<void>;
    let pausedTargetProvider: PausedTargetProvider;
    let provider: RemoteConfigurationDataProvider;

    beforeEach(() => {
        mockConfigModel = mock(ConfigModel);
        mockWorkspaceFolderManager = mock(WorkspaceFolderManager);
        mockBundleFileSet = mock(BundleFileSet);
        // onDidChange is an instance property, which only the generic form stubs.
        mockBundleWatcher = mock<BundleWatcher>();
        bundleChangeEmitter = new EventEmitter<void>();
        when(mockBundleWatcher.onDidChange).thenReturn(
            bundleChangeEmitter.event
        );
        // The folder is a bundle.
        when(mockBundleFileSet.getRootFile()).thenResolve(
            Uri.file("/tmp/my-project/databricks.yml")
        );
        folderChangeEmitter = new EventEmitter<Uri | undefined>();
        targetChangeEmitter = new EventEmitter<void>();
        pausedChangeEmitter = new EventEmitter<void>();
        // Not paused by default, so the Target node renders normally.
        pausedTargetProvider = {
            paused: undefined,
            onDidChangePaused: pausedChangeEmitter.event,
        };

        // Components and the provider subscribe to these in their constructors.
        when(
            mockWorkspaceFolderManager.onDidChangeActiveProjectFolder
        ).thenReturn(folderChangeEmitter.event);
        when(mockConfigModel.onDidChangeTarget).thenReturn(
            targetChangeEmitter.event
        );
        // onDidChange comes from CachedValue (async listener); a no-op stub is
        // enough - these tests don't exercise the refresh path.
        when(mockConfigModel.onDidChange).thenReturn(() => ({dispose() {}}));

        // A folder is active so WorkspaceFolderComponent renders its row, and
        // the folder is a bundle with targets so the target row isn't gated out.
        when(mockWorkspaceFolderManager.activeProjectUri).thenReturn(
            Uri.file("/tmp/my-project")
        );
        when(mockConfigModel.targets).thenResolve({dev: {} as any});
    });

    afterEach(() => {
        provider?.dispose();
    });

    function make() {
        provider = new RemoteConfigurationDataProvider(
            instance(mockConfigModel),
            instance(mockWorkspaceFolderManager),
            instance(mockBundleFileSet),
            instance(mockBundleWatcher),
            pausedTargetProvider
        );
        return provider;
    }

    it("shows the Bundle and Target rows once a target is resolved", async () => {
        when(mockConfigModel.target).thenReturn("dev");
        when(mockConfigModel.get("mode")).thenResolve("development" as any);
        when(mockConfigModel.get("host")).thenResolve(
            new URL("https://my-ws.cloud.databricks.com") as any
        );

        const roots = await make().getChildren();
        const labels = roots.map(labelOf);

        // Remote mode labels the folder row "Bundle" (not "Local Folder").
        expect(labels).to.include("Bundle");
        expect(labels).to.include("Target");
    });

    it("offers the target picker when a folder is active but no target is resolved", async () => {
        // A bundle with targets (from beforeEach) but none auto-resolved.
        when(mockConfigModel.target).thenReturn(undefined);

        const roots = await make().getChildren();
        const labels = roots.map(labelOf);

        expect(labels).to.include("Bundle");
        // BundleTargetComponent renders a clickable "Select a bundle target"
        // prompt so the user can pick a target for the selected folder.
        expect(labels).to.include("Select a bundle target");
    });

    it("stays empty when the folder has no bundle file", async () => {
        // The view's welcome content ("Select a project") shows instead.
        when(mockBundleFileSet.getRootFile()).thenResolve(undefined);
        when(mockConfigModel.target).thenReturn(undefined);

        const roots = await make().getChildren();

        expect(roots).to.deep.equal([]);
    });

    it("stays empty when no folder is active", async () => {
        // getRootFile reads activeProjectUri, which throws with no folder; the
        // provider must not reject getChildren.
        when(mockBundleFileSet.getRootFile()).thenReject(
            new Error("No active project folder")
        );
        when(mockConfigModel.target).thenReturn(undefined);

        const roots = await make().getChildren();

        expect(roots).to.deep.equal([]);
    });

    it("shows only the Bundle row when the bundle defines no targets", async () => {
        when(mockConfigModel.target).thenReturn(undefined);
        when(mockConfigModel.targets).thenResolve({});

        const labels = (await make().getChildren()).map(labelOf);

        expect(labels).to.deep.equal(["Bundle"]);
    });

    it("shows only the Bundle row when the bundle can't be parsed", async () => {
        when(mockConfigModel.target).thenReturn(undefined);
        when(mockConfigModel.targets).thenReject(new Error("bad yaml"));

        const labels = (await make().getChildren()).map(labelOf);

        expect(labels).to.deep.equal(["Bundle"]);
    });

    it("refreshes on a bundle-file change while no target is set", () => {
        when(mockConfigModel.target).thenReturn(undefined);
        let refreshes = 0;
        make().onDidChangeTreeData(() => refreshes++);

        bundleChangeEmitter.fire();

        expect(refreshes).to.equal(1);
    });

    it("caches the bundle-file check until bundle files or the folder change", async () => {
        when(mockConfigModel.target).thenReturn(undefined);
        const p = make();

        await p.getChildren();
        await p.getChildren();
        verify(mockBundleFileSet.getRootFile()).once();

        bundleChangeEmitter.fire();
        await p.getChildren();
        verify(mockBundleFileSet.getRootFile()).twice();

        folderChangeEmitter.fire(Uri.file("/tmp/other"));
        await p.getChildren();
        verify(mockBundleFileSet.getRootFile()).thrice();
    });

    it("copies just the target name from the host-mismatch Target row", async () => {
        pausedTargetProvider = {
            paused: {
                target: "dev",
                reason: "host-mismatch",
                envHost: "dogfood.cloud.databricks.com",
                targetHost: "logfood.cloud.databricks.com",
            },
            onDidChangePaused: pausedChangeEmitter.event,
        };
        when(mockConfigModel.target).thenReturn("dev");
        when(mockConfigModel.get("mode")).thenResolve("development" as any);
        when(mockConfigModel.get("host")).thenResolve(
            new URL("https://logfood.cloud.databricks.com") as any
        );

        const roots = await make().getChildren();
        const targetRow = roots.find((r) => labelOf(r) === "Target");

        expect(targetRow?.description).to.contain("targets");
        expect(targetRow?.copyText).to.equal("dev");
    });

    it("shows a paused Target row (no host) for an unresolved target", async () => {
        pausedTargetProvider = {
            paused: {
                target: "dev",
                reason: "multi-file",
                envHost: "dogfood.cloud.databricks.com",
            },
            onDidChangePaused: pausedChangeEmitter.event,
        };
        when(mockConfigModel.target).thenReturn("dev");
        // The config never loaded for this target, so there's no host — the
        // paused badge must still render instead of "Invalid host".
        when(mockConfigModel.get("host")).thenResolve(undefined as any);

        const roots = await make().getChildren();
        const targetRow = roots.find((r) => labelOf(r) === "Target");

        expect(targetRow?.description).to.equal("dev — paused");
        expect(targetRow?.copyText).to.equal("dev");
        expect(labelOf(targetRow!)).to.equal("Target");
    });
});
