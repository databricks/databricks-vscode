import {cluster, Cluster} from "@databricks/databricks-sdk";
import {CancellationToken, CancellationTokenSource, Disposable} from "vscode";

export class ClusterManager implements Disposable {
    private cancellationTokenSource?: CancellationTokenSource;

    constructor(readonly cluster: Cluster) {}

    dispose() {
        this.cancellationTokenSource?.cancel();
        this.cancellationTokenSource?.dispose();
    }

    async start(
        onProgress: (state: cluster.ClusterInfoState) => void = (state) => {}
    ) {
        this.cancellationTokenSource?.cancel();
        this.cancellationTokenSource = new CancellationTokenSource();

        await this.cluster.start(
            this.cancellationTokenSource.token,
            onProgress
        );

        onProgress(this.cluster.state);
    }

    async stop(
        onProgress: (state?: cluster.ClusterInfoState) => void = (state) => {}
    ) {
        this.cancellationTokenSource?.cancel();
        this.cancellationTokenSource = new CancellationTokenSource();

        //TODO: add cancellation and onProgress cb after adding these to API generator
        await this.cluster.stop(
            this.cancellationTokenSource.token,
            async (clusterInfo: cluster.ClusterInfo) =>
                onProgress(clusterInfo.state)
        );
        onProgress(this.cluster.state);
    }
}
