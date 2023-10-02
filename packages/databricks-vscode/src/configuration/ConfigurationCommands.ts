import {Disposable, window} from "vscode";
import {BundleModel} from "../bundle/BundleModel";
import {ClusterModel} from "../cluster/ClusterModel";

export class ConfigurationCommands implements Disposable {
    private disposables: Disposable[] = [];

    constructor(
        private readonly bundleModel: BundleModel,
        private readonly clusterModel: ClusterModel
    ) {}

    async updateAuthType() {
        const choice = await window.showQuickPick([
            "oauth",
            "profile",
            "azure-cli",
        ]);
        this.bundleModel.updateAuthType(choice);
    }

    async updateComputeId() {
        const choice = await window.showQuickPick(
            this.clusterModel.clusters.map(
                (cluster) => cluster.cluster_id
            ) as string[]
        );
        this.bundleModel.updateCluster(choice);
    }

    async resetClusterOverride() {
        await this.bundleModel.updateCluster(undefined);
    }

    async resetAuthTypeOverride() {
        await this.bundleModel.updateAuthType(undefined);
    }

    async resetAllOverrides() {
        await Promise.all([
            this.resetClusterOverride(),
            this.resetAuthTypeOverride(),
        ]);
    }

    dispose() {
        this.disposables.forEach((i) => i.dispose());
    }
}
