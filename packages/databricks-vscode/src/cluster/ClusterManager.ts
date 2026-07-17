import {compute, Time, TimeUnits} from "@databricks/sdk-experimental";
import {Cluster} from "../sdk-extensions";
import {CancellationTokenSource, Disposable} from "vscode";
import lodash from "lodash";
import {logging, context, Context} from "@databricks/sdk-experimental";
import {Loggers} from "../logger";
export class ClusterManager implements Disposable {
    private cancellationTokenSource?: CancellationTokenSource;
    private refreshTimer?: NodeJS.Timeout;

    constructor(
        readonly cluster: Cluster,
        readonly onChange: (state: compute.State) => void = () => {},
        readonly refreshTimeout: Time = new Time(10, TimeUnits.seconds)
    ) {
        this.setInterval();
    }

    @logging.withLogContext(Loggers.Extension)
    private setInterval(@context ctx?: Context) {
        this.refreshTimer = setInterval(async () => {
            const oldState = this.cluster.state;
            try {
                await this.cluster.refresh();
            } catch (e: any) {
                ctx?.logger?.error("Error refreshing cluster", e);
            }

            if (!lodash.isEqual(oldState, this.cluster.state)) {
                this.onChange(this.cluster.state);
            }
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

    async start(onProgress: (state: compute.State) => void = () => {}) {
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

    async stop(onProgress: (state?: compute.State) => void = () => {}) {
        this.clearInterval();
        this.cancellationTokenSource?.cancel();
        this.cancellationTokenSource = new CancellationTokenSource();

        await this.cluster.stop(
            this.cancellationTokenSource.token,
            async (clusterInfo: compute.ClusterDetails) =>
                onProgress(clusterInfo.state)
        );
        onProgress(this.cluster.state);
        this.setInterval();
    }
}
