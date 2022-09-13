import {Cluster} from "@databricks/databricks-sdk";
import {ClusterInfoState} from "@databricks/databricks-sdk/dist/apis/clusters";
import {CancellationToken, CancellationTokenSource, Disposable} from "vscode";
import {ConnectionManager} from "../configuration/ConnectionManager";

export class ClusterManager implements Disposable {
    private cancellationTokenSource?: CancellationTokenSource;
    // cancellationToken?: CancellationToken

    constructor(readonly cluster: Cluster) {}

    dispose() {
        this.cancellationTokenSource?.cancel();
        this.cancellationTokenSource?.dispose();
    }

    async start(onProgress: (state: ClusterInfoState) => void = (state) => {}) {
        this.cancellationTokenSource?.cancel();
        this.cancellationTokenSource = new CancellationTokenSource();

        await this.cluster.start(
            this.cancellationTokenSource.token,
            onProgress
        );

        onProgress(this.cluster.state);
    }

    async stop(onProgress: (state: ClusterInfoState) => void = (state) => {}) {
        this.cancellationTokenSource?.cancel();
        this.cancellationTokenSource = new CancellationTokenSource();

        //TODO: add cancellation and onProgress cb after adding these to API generator
        await this.cluster.stop();
        onProgress(this.cluster.state);
    }
}
