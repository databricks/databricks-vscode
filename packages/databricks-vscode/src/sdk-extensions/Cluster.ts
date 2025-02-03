/* eslint-disable @typescript-eslint/naming-convention */

import {
    ApiClient,
    Time,
    TimeUnits,
    retry,
    retries,
    iam,
    compute,
    CancellationToken,
    logging,
} from "@databricks/databricks-sdk";
import {ExecutionContext} from "./ExecutionContext";
import {Context, context} from "@databricks/databricks-sdk/dist/context";

const {ExposedLoggers, withLogContext} = logging;

export class ClusterRetriableError extends retries.RetriableError {}
export class ClusterError extends Error {}
export class Cluster {
    private clusterApi: compute.ClustersService;
    private _canExecute?: boolean;
    private _hasExecutePerms?: boolean;

    constructor(
        private client: ApiClient,
        private clusterDetails: compute.ClusterDetails
    ) {
        this.clusterApi = new compute.ClustersService(client);
    }

    get id(): string {
        return this.clusterDetails.cluster_id!;
    }

    get name(): string {
        return this.clusterDetails.cluster_name!;
    }

    get url(): Promise<string> {
        return (async () =>
            `https://${(await this.client.host).host}/#setting/clusters/${
                this.id
            }/configuration`)();
    }

    get driverLogsUrl(): Promise<string> {
        return (async () =>
            `https://${(await this.client.host).host}/#setting/clusters/${
                this.id
            }/driverLogs`)();
    }

    get metricsUrl(): Promise<string> {
        return (async () =>
            `https://${(await this.client.host).host}/#setting/clusters/${
                this.id
            }/metrics`)();
    }

    async getSparkUiUrl(sparkContextId?: string): Promise<string> {
        const host = (await this.client.host).host;

        if (sparkContextId) {
            return `https://${host}/#setting/sparkui/${this.id}/driver-${sparkContextId}`;
        } else {
            return `https://${host}/#setting/clusters/${this.id}/sparkUi`;
        }
    }

    get memoryMb(): number | undefined {
        return this.clusterDetails.cluster_memory_mb;
    }

    get cores(): number | undefined {
        return this.clusterDetails.cluster_cores;
    }

    get sparkVersion(): string {
        return this.clusterDetails.spark_version!;
    }

    get dbrVersion(): Array<number | "x"> {
        const sparkVersion = this.clusterDetails.spark_version!;
        const match = sparkVersion.match(/^(custom:.*?__)?(.*?)-/);
        if (!match) {
            return ["x", "x", "x"];
        }
        const parts = match[2].split(".");
        return [
            parseInt(parts[0], 10) || "x",
            parseInt(parts[1], 10) || "x",
            parseInt(parts[2], 10) || "x",
        ];
    }

    get creator(): string {
        return this.clusterDetails.creator_user_name || "";
    }

    get state(): compute.State {
        return this.clusterDetails.state!;
    }

    get stateMessage(): string {
        return this.clusterDetails.state_message || "";
    }

    get source(): compute.ClusterSource {
        return this.clusterDetails.cluster_source!;
    }

    get details() {
        return this.clusterDetails;
    }
    set details(details: compute.ClusterDetails) {
        this.clusterDetails = details;
    }

    get accessMode():
        | compute.DataSecurityMode
        | "SHARED"
        | "LEGACY_SINGLE_USER_PASSTHROUGH"
        | "LEGACY_SINGLE_USER_STANDARD" {
        //TODO: deprecate data_security_mode once access_mode is available everywhere
        return (
            (this.details as any).access_mode ?? this.details.data_security_mode
        );
    }

    isUc() {
        return ["SINGLE_USER", "SHARED", "USER_ISOLATION"].includes(
            this.accessMode
        );
    }

    isSingleUser() {
        const modeProperty = this.accessMode;

        return (
            modeProperty !== undefined &&
            [
                "SINGLE_USER",
                "LEGACY_SINGLE_USER_PASSTHROUGH",
                "LEGACY_SINGLE_USER_STANDARD",
                //enums unique to data_security_mode
                "LEGACY_SINGLE_USER",
            ].includes(modeProperty)
        );
    }

    isValidSingleUser(userName?: string) {
        return (
            this.isSingleUser() && this.details.single_user_name === userName
        );
    }

    get hasExecutePermsCached() {
        return this._hasExecutePerms;
    }

    async hasExecutePerms(userDetails?: iam.User) {
        if (userDetails === undefined) {
            return (this._hasExecutePerms = false);
        }

        if (this.isSingleUser()) {
            return (this._hasExecutePerms = this.isValidSingleUser(
                userDetails.userName
            ));
        }

        const perms = await this.clusterApi.getPermissions({
            cluster_id: this.id,
        });
        return (this._hasExecutePerms =
            (perms.access_control_list ?? []).find((ac) => {
                return (
                    ac.user_name === userDetails.userName ||
                    // `users` is a system group for "All Workspace Users"
                    // https://docs.databricks.com/en/admin/users-groups/groups.html
                    ac.group_name === "users" ||
                    userDetails.groups
                        ?.map((v) => v.display)
                        .includes(ac.group_name ?? "")
                );
            }) !== undefined);
    }

    async refresh() {
        this.details = await this.clusterApi.get({
            cluster_id: this.clusterDetails.cluster_id!,
        });
    }

    async start(
        token?: CancellationToken,
        onProgress: (state: compute.State) => void = () => {}
    ) {
        await this.refresh();
        onProgress(this.state);

        if (this.state === "RUNNING") {
            return;
        }

        if (
            this.state === "TERMINATED" ||
            this.state === "ERROR" ||
            this.state === "UNKNOWN"
        ) {
            await this.clusterApi.start({
                cluster_id: this.id,
            });
        }

        // wait for cluster to be stopped before re-starting
        if (this.state === "TERMINATING") {
            await retry<void>({
                timeout: new Time(1, TimeUnits.minutes),
                retryPolicy: new retries.LinearRetryPolicy(
                    new Time(1, TimeUnits.seconds)
                ),
                fn: async () => {
                    if (token?.isCancellationRequested) {
                        return;
                    }
                    await this.refresh();
                    onProgress(this.state);

                    if (this.state === "TERMINATING") {
                        throw new retries.RetriableError();
                    }
                },
            });
            await this.clusterApi.start({
                cluster_id: this.id,
            });
        }

        this._canExecute = undefined;
        await retry({
            fn: async () => {
                if (token?.isCancellationRequested) {
                    return;
                }

                await this.refresh();
                onProgress(this.state);

                switch (this.state) {
                    case "RUNNING":
                        return;
                    case "TERMINATED":
                        throw new ClusterError(
                            `Cluster[${
                                this.name
                            }]: CurrentState - Terminated; Reason - ${JSON.stringify(
                                this.clusterDetails.termination_reason
                            )}`
                        );
                    case "ERROR":
                        throw new ClusterError(
                            `Cluster[${this.name}]: Error in starting the cluster (${this.clusterDetails.state_message})`
                        );
                    default:
                        throw new ClusterRetriableError(
                            `Cluster[${this.name}]: CurrentState - ${this.state}; Reason - ${this.clusterDetails.state_message}`
                        );
                }
            },
        });
    }

    async stop(
        token?: CancellationToken,
        onProgress?: (newPollResponse: compute.ClusterDetails) => Promise<void>
    ) {
        this.details = await (
            await this.clusterApi.delete(
                {
                    cluster_id: this.id,
                },
                new Context({cancellationToken: token})
            )
        ).wait({
            onProgress: async (clusterInfo) => {
                this.details = clusterInfo;
                if (onProgress) {
                    await onProgress(clusterInfo);
                }
            },
        });
    }

    async createExecutionContext(
        language: compute.Language = "python"
    ): Promise<ExecutionContext> {
        return await ExecutionContext.create(this.client, this, language);
    }

    get canExecuteCached() {
        return this._canExecute;
    }

    @withLogContext(ExposedLoggers.SDK)
    async canExecute(@context ctx?: Context): Promise<boolean> {
        let executionContext: ExecutionContext | undefined;
        try {
            executionContext = await this.createExecutionContext();
            const result = await executionContext.execute("1==1");
            this._canExecute =
                result.result?.results?.resultType === "error" ? false : true;
        } catch (e) {
            ctx?.logger?.error(`Can't execute code on cluster ${this.id}`, e);
            this._canExecute = false;
        } finally {
            if (executionContext) {
                await executionContext.destroy();
            }
        }
        return this._canExecute ?? false;
    }

    static async fromClusterName(
        client: ApiClient,
        clusterName: string
    ): Promise<Cluster | undefined> {
        const clusterApi = new compute.ClustersService(client);

        for await (const clusterInfo of clusterApi.list({})) {
            if (clusterInfo.cluster_name === clusterName) {
                const cluster = await clusterApi.get({
                    cluster_id: clusterInfo.cluster_id!,
                });
                return new Cluster(client, cluster);
            }
        }

        return;
    }

    static async fromClusterId(
        client: ApiClient,
        clusterId: string
    ): Promise<Cluster> {
        const clusterApi = new compute.ClustersService(client);
        const response = await clusterApi.get({cluster_id: clusterId});
        return new Cluster(client, response);
    }

    static async *list(client: ApiClient): AsyncIterable<Cluster> {
        const clusterApi = new compute.ClustersService(client);

        for await (const clusterInfo of clusterApi.list({
            filter_by: {cluster_sources: ["API", "UI"]},
        })) {
            yield new Cluster(client, clusterInfo);
        }
    }
}
