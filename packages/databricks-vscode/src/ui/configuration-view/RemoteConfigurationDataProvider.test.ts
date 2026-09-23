import {expect} from "chai";
import {instance, mock, when} from "ts-mockito";
import {EventEmitter, Uri} from "vscode";
import {RemoteConfigurationDataProvider} from "./RemoteConfigurationDataProvider";
import {ConfigModel} from "../../configuration/models/ConfigModel";
import {WorkspaceFolderManager} from "../../vscode-objs/WorkspaceFolderManager";
import {ConfigurationTreeItem} from "./types";

function labelOf(item: ConfigurationTreeItem): string | undefined {
    return typeof item.label === "string" ? item.label : item.label?.label;
}

describe("RemoteConfigurationDataProvider", () => {
    let mockConfigModel: ConfigModel;
    let mockWorkspaceFolderManager: WorkspaceFolderManager;
    let folderChangeEmitter: EventEmitter<Uri | undefined>;
    let targetChangeEmitter: EventEmitter<void>;
    let provider: RemoteConfigurationDataProvider;

    beforeEach(() => {
        mockConfigModel = mock(ConfigModel);
        mockWorkspaceFolderManager = mock(WorkspaceFolderManager);
        folderChangeEmitter = new EventEmitter<Uri | undefined>();
        targetChangeEmitter = new EventEmitter<void>();

        // Components subscribe to these in their constructors.
        when(
            mockWorkspaceFolderManager.onDidChangeActiveProjectFolder
        ).thenReturn(folderChangeEmitter.event);
        when(mockConfigModel.onDidChangeTarget).thenReturn(
            targetChangeEmitter.event
        );

        // A folder is active so WorkspaceFolderComponent renders its row.
        when(mockWorkspaceFolderManager.activeProjectUri).thenReturn(
            Uri.file("/tmp/my-project")
        );
    });

    afterEach(() => {
        provider?.dispose();
    });

    function make() {
        provider = new RemoteConfigurationDataProvider(
            instance(mockConfigModel),
            instance(mockWorkspaceFolderManager)
        );
        return provider;
    }

    it("shows the Local Folder and Target rows once a target is resolved", async () => {
        when(mockConfigModel.target).thenReturn("dev");
        when(mockConfigModel.get("mode")).thenResolve("development" as any);
        when(mockConfigModel.get("host")).thenResolve(
            new URL("https://my-ws.cloud.databricks.com") as any
        );

        const roots = await make().getChildren();
        const labels = roots.map(labelOf);

        expect(labels).to.include("Local Folder");
        expect(labels).to.include("Target");
    });

    it("suppresses the Target row when no target is resolved", async () => {
        when(mockConfigModel.target).thenReturn(undefined);

        const roots = await make().getChildren();
        const labels = roots.map(labelOf);

        expect(labels).to.include("Local Folder");
        expect(labels).to.not.include("Target");
        // The "Select a bundle target" prompt (wired to a command that isn't
        // registered in remote mode) must not appear either.
        expect(labels).to.not.include("Select a bundle target");
    });

    it("stamps a copy kind onto value rows via getTreeItem", () => {
        const item: ConfigurationTreeItem = {
            label: "Target",
            description: "dev",
        };
        make().getTreeItem(item);
        expect(item.contextValue).to.contain(".copy=target");
    });

    it("does not depend on a BundleProjectManager gate", async () => {
        // Unlike the normal-mode provider, getChildren has no isBundleProject
        // gate: with a folder active it returns rows without any such dependency.
        when(mockConfigModel.target).thenReturn(undefined);

        const roots = await make().getChildren();
        expect(roots.map(labelOf)).to.include("Local Folder");
    });
});
