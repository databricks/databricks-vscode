import {expect} from "chai";
import {instance, mock, when} from "ts-mockito";
import {EventEmitter, Uri} from "vscode";
import {RemoteConfigurationDataProvider} from "./RemoteConfigurationDataProvider";
import {ConfigModel} from "../../configuration/models/ConfigModel";
import {WorkspaceFolderManager} from "../../vscode-objs/WorkspaceFolderManager";
import {ConfigurationTreeItem} from "./types";
import {HostMismatchProvider} from "./BundleTargetComponent";

function labelOf(item: ConfigurationTreeItem): string | undefined {
    return typeof item.label === "string" ? item.label : item.label?.label;
}

describe("RemoteConfigurationDataProvider", () => {
    let mockConfigModel: ConfigModel;
    let mockWorkspaceFolderManager: WorkspaceFolderManager;
    let folderChangeEmitter: EventEmitter<Uri | undefined>;
    let targetChangeEmitter: EventEmitter<void>;
    let mismatchChangeEmitter: EventEmitter<void>;
    let hostMismatchProvider: HostMismatchProvider;
    let provider: RemoteConfigurationDataProvider;

    beforeEach(() => {
        mockConfigModel = mock(ConfigModel);
        mockWorkspaceFolderManager = mock(WorkspaceFolderManager);
        folderChangeEmitter = new EventEmitter<Uri | undefined>();
        targetChangeEmitter = new EventEmitter<void>();
        mismatchChangeEmitter = new EventEmitter<void>();
        // No mismatch by default, so the Target node renders normally.
        hostMismatchProvider = {
            mismatch: undefined,
            onDidChangeMismatch: mismatchChangeEmitter.event,
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
            hostMismatchProvider
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

    it("hides the target picker when the folder has no bundle targets", async () => {
        // A non-bundle folder (or a bundle that defines no targets): there's
        // nothing to pick, so the prompt must be suppressed.
        when(mockConfigModel.target).thenReturn(undefined);
        when(mockConfigModel.targets).thenResolve({});

        const roots = await make().getChildren();
        const labels = roots.map(labelOf);

        expect(labels).to.include("Bundle");
        expect(labels).to.not.include("Select a bundle target");
    });

    it("suppresses the target picker when no folder is active", async () => {
        // activeProjectUri throws when no folder is open; the provider must not
        // propagate that (it would reject getChildren and break the view).
        when(mockWorkspaceFolderManager.activeProjectUri).thenThrow(
            new Error("No active project folder")
        );
        when(mockConfigModel.target).thenReturn(undefined);

        const roots = await make().getChildren();

        // Nothing to show - the view's welcome content ("Select a project")
        // covers this state.
        expect(roots).to.deep.equal([]);
    });

    it("stamps a copy kind onto value rows via getTreeItem", () => {
        const item: ConfigurationTreeItem = {
            label: "Target",
            description: "dev",
        };
        make().getTreeItem(item);
        expect(item.contextValue).to.contain(".copy=target");
    });
});
