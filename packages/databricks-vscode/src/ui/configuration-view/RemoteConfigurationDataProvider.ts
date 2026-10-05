import {ConfigModel} from "../../configuration/models/ConfigModel";
import {BaseComponent} from "./BaseComponent";
import {BaseConfigurationDataProvider} from "./BaseConfigurationDataProvider";
import {
    BundleTargetComponent,
    HostMismatchProvider,
} from "./BundleTargetComponent";
import {WorkspaceFolderComponent} from "./WorkspaceFolderComponent";
import {WorkspaceFolderManager} from "../../vscode-objs/WorkspaceFolderManager";
import {BundleFileSet, BundleWatcher} from "../../bundle";

/**
 * The Configuration view in Remote SSH mode: the bundle folder and, when the
 * bundle defines targets, its target. Empty when the folder has no bundle file,
 * so the view's welcome content links the folder picker.
 */
export class RemoteConfigurationDataProvider extends BaseConfigurationDataProvider {
    private readonly bundleTargetComponent: BundleTargetComponent;

    constructor(
        private readonly configModel: ConfigModel,
        workspaceFolderManager: WorkspaceFolderManager,
        private readonly bundleFileSet: BundleFileSet,
        bundleWatcher: BundleWatcher,
        hostMismatchProvider: HostMismatchProvider
    ) {
        const bundleTargetComponent = new BundleTargetComponent(
            configModel,
            hostMismatchProvider
        );
        super([
            new WorkspaceFolderComponent(workspaceFolderManager, "Bundle"),
            bundleTargetComponent,
        ]);
        this.bundleTargetComponent = bundleTargetComponent;
        this.disposables.push(
            this.configModel.onDidChange(async () => {
                this._onDidChangeTreeData.fire();
            }),
            // With no target, configModel.onDidChange doesn't fire for bundle
            // edits, e.g. a databricks.yml appearing or gaining targets.
            bundleWatcher.onDidChange(() => {
                if (this.configModel.target === undefined) {
                    this._onDidChangeTreeData.fire();
                }
            })
        );
    }

    protected async visibleComponents(): Promise<BaseComponent[]> {
        if (!(await this.hasBundleFile())) {
            return [];
        }
        if (await this.hasTargets()) {
            return this.components;
        }
        return this.components.filter((c) => c !== this.bundleTargetComponent);
    }

    private async hasBundleFile(): Promise<boolean> {
        // activeProjectUri (which getRootFile reads) throws when no folder is
        // active.
        try {
            return (await this.bundleFileSet.getRootFile()) !== undefined;
        } catch {
            return false;
        }
    }

    // False for a bundle with no targets, and for one that can't be parsed: the
    // Bundle row still shows, but there's nothing to pick.
    private async hasTargets(): Promise<boolean> {
        try {
            const targets = await this.configModel.targets;
            return Object.keys(targets ?? {}).length > 0;
        } catch {
            return false;
        }
    }
}
