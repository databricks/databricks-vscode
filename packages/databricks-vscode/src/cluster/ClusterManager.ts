import {cluster, Cluster, Time, TimeUnits} from "@databricks/databricks-sdk";
import {CancellationTokenSource, Disposable} from "vscode";

export class ClusterManager implements Disposable {
    private cancellationTokenSource?: CancellationTokenSource;
    private refreshTimer?: NodeJS.Timer;

    constructor(
        readonly cluster: Cluster,
        readonly onChange: (state: cluster.ClusterInfoState) => void = () => {},
        readonly refreshTimeout: Time = new Time(10, TimeUnits.seconds)
    ) {
        this.setInterval();
    }

    private setInterval() {
        this.refreshTimer = setInterval(async () => {
            await this.cluster.refresh();
            this.onChange(this.cluster.state);
        }, this.refreshTimeout.toMillSeconds().value);
    }

    private clearInterval() {
        clearInterval(this.refreshTimer);
        this.refreshTimer = undefined;
    }

    dispose() {
        this.cancellationTokenSource?.cancel();
        this.cancellationTokenSource?.dispose();
        this.clearInterval();
    }

    async start(
        onProgress: (state: cluster.ClusterInfoState) => void = () => {}
    ) {
        this.clearInterval();
        this.cancellationTokenSource?.cancel();
        this.cancellationTokenSource = new CancellationTokenSource();

        await this.cluster.start(
            this.cancellationTokenSource.token,
            onProgress
        );

        onProgress(this.cluster.state);
        this.setInterval();
    }

    async stop(
        onProgress: (state?: cluster.ClusterInfoState) => void = () => {}
    ) {
        this.clearInterval();
        this.cancellationTokenSource?.cancel();
        this.cancellationTokenSource = new CancellationTokenSource();

        await this.cluster.stop(
            this.cancellationTokenSource.token,
            async (clusterInfo: cluster.ClusterInfo) =>
                onProgress(clusterInfo.state)
        );
        onProgress(this.cluster.state);
        this.setInterval();
    }
}
